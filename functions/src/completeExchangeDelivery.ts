/**
 * 🔒 COMPLETE EXCHANGE DELIVERY AND FINALIZE PAYMENT
 *
 * Firebase Cloud Function for finalizing exchange after courier delivery.
 * Processes payment, updates inventory, and marks proposal as completed.
 *
 * Atomic Operations:
 * - Validate delivery completion by courier
 * - Finalize payment: deducted → transferred to seller
 * - Update inventory counts (reduce creator, increase target)
 * - Update proposal status to "completed"
 * - Pay courier delivery fee (50/50 split handled by exchangeCapture)
 *
 * Security:
 * - Only assigned courier can complete delivery
 * - Delivery must be in "in_transit" or "picked_up" status
 * - Atomic transaction prevents partial operations
 * - Server-side validation (cannot be bypassed)
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

interface CompleteDeliveryData {
  deliveryId: string;
  photoProofUrl?: string; // Optional photo proof of delivery
  deliveryNotes?: string; // Optional completion notes
  latitude?: number; // Optional delivery location verification
  longitude?: number;
}

/**
 * Completes exchange delivery and finalizes all transactions
 *
 * @param {CompleteDeliveryData} data - Delivery completion data
 * @returns {Promise<{success: boolean, deliveryId: string, proposalId: string}>}
 * @throws {HttpsError} - If validation fails
 */
export const completeExchangeDelivery = onCall<CompleteDeliveryData>(
  { region: "europe-west1", cors: true },
  async (request) => {
    const userId = request.auth?.uid;

    // 🔒 AUTHENTICATION CHECK
    if (!userId) {
      logger.warn("completeExchangeDelivery: Unauthenticated request");
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to complete deliveries"
      );
    }

    const data = request.data;

    // 🔒 VALIDATE INPUT DATA
    if (!data || !data.deliveryId) {
      throw new HttpsError("invalid-argument", "Delivery ID is required");
    }

    const { deliveryId, photoProofUrl, deliveryNotes, latitude, longitude } = data;

    logger.info(
      `completeExchangeDelivery: Courier ${userId} completing delivery ${deliveryId}`,
      { photoProofUrl, deliveryNotes }
    );

    // 🔒 ATOMIC TRANSACTION: Complete delivery + finalize payment + update inventory
    const result = await db.runTransaction(async (transaction) => {
      // ===== PHASE 1: READ DELIVERY AND PROPOSAL =====

      const deliveryRef = db.collection("deliveries").doc(deliveryId);
      const deliverySnapshot = await transaction.get(deliveryRef);

      if (!deliverySnapshot.exists) {
        throw new HttpsError("not-found", "Delivery not found");
      }

      const delivery = deliverySnapshot.data();

      // Verify user is the assigned courier
      if (delivery?.courierId !== userId) {
        logger.warn(
          `completeExchangeDelivery: User ${userId} is not the assigned courier for delivery ${deliveryId}`,
          {
            assignedCourierId: delivery?.courierId,
            actualUserId: userId,
          }
        );
        throw new HttpsError(
          "permission-denied",
          "Only the assigned courier can complete this delivery"
        );
      }

      // Verify delivery is in valid status (picked_up or in_transit)
      if (!["picked_up", "in_transit"].includes(delivery?.status || "")) {
        logger.info(
          `completeExchangeDelivery: Cannot complete delivery with status ${delivery?.status}`,
          { deliveryId, currentStatus: delivery?.status }
        );
        throw new HttpsError(
          "failed-precondition",
          `Cannot complete delivery with status: ${delivery?.status}. Delivery must be picked up or in transit.`
        );
      }

      // Read linked proposal
      if (!delivery?.proposalId) {
        throw new HttpsError(
          "failed-precondition",
          "Delivery is not linked to a proposal"
        );
      }

      const proposalRef = db
        .collection("exchange_proposals")
        .doc(delivery.proposalId);
      const proposalSnapshot = await transaction.get(proposalRef);

      if (!proposalSnapshot.exists) {
        throw new HttpsError("not-found", "Linked proposal not found");
      }

      const proposal = proposalSnapshot.data();

      // ===== FINANCE/STOCK ROLES — always from proposal (source of truth) =====
      // proposal.fromPharmacyId = buyer (the one who created the proposal)
      // proposal.toPharmacyId = seller (the inventory owner)
      // delivery.fromPharmacyId/toPharmacyId = logistic roles (pickup/dropoff), NOT finance
      const buyerId = proposal?.fromPharmacyId || delivery.fromPharmacyId;
      const sellerId = proposal?.toPharmacyId || delivery.toPharmacyId;

      // ===== PHASE 1b: READ ALL DOCUMENTS NEEDED (Firestore requires reads before writes) =====

      const buyerWalletRef = db.collection("wallets").doc(buyerId);
      const sellerWalletRef = db.collection("wallets").doc(sellerId);
      const courierWalletRef = db.collection("wallets").doc(userId);

      // Source inventory (owner's item Y) for Phase 3 — needed to decrement and copy metadata
      const sourceInventoryId = proposal?.inventoryItemId;
      const sourceInventoryRef = sourceInventoryId
        ? db.collection("pharmacy_inventory").doc(sourceInventoryId)
        : null;

      // Exchange: proposer's offered item X — needed for back-office stock transfer
      const exchangeInventoryId = proposal?.details?.exchangeInventoryItemId;
      const exchangeInventoryRef = (proposal?.details?.type === "exchange" && exchangeInventoryId)
        ? db.collection("pharmacy_inventory").doc(exchangeInventoryId)
        : null;

      // Target inventory refs for Phase 3 — auto-generate IDs (one document per reception)
      const targetInventoryRef = db.collection("pharmacy_inventory").doc();
      const targetInventoryRef2 = (proposal?.details?.type === "exchange")
        ? db.collection("pharmacy_inventory").doc()
        : null;

      // Read all wallets + source inventories upfront (Firestore: all reads before first write)
      const readsToPerform: Promise<FirebaseFirestore.DocumentSnapshot>[] = [
        transaction.get(buyerWalletRef),
        transaction.get(courierWalletRef),
      ];
      if (sourceInventoryRef) {
        readsToPerform.push(transaction.get(sourceInventoryRef));
      }
      if (exchangeInventoryRef) {
        readsToPerform.push(transaction.get(exchangeInventoryRef));
      }
      const readResults = await Promise.all(readsToPerform);
      const buyerWalletSnap = readResults[0];
      const courierWalletSnap = readResults[1];
      let readIdx = 2;
      const sourceInventorySnapshot = sourceInventoryRef ? readResults[readIdx++] : null;
      const exchangeInventorySnapshot = exchangeInventoryRef ? readResults[readIdx++] : null;

      // ===== PHASE 2: FINALIZE PAYMENT + COURIER FEE =====
      //
      // Business rule (pilot v1):
      //   courier_fee = 12% of medicine price
      //   split 50/50 between buyer and seller
      //   seller's share is deducted from sale proceeds before net credit
      //   buyer must have sufficient available balance for their courier fee share
      //
      // This avoids requiring seller to have pre-existing available balance.

      const courierFee = delivery.courierFee || 0;
      const halfBuyer = Math.floor(courierFee / 2);
      const halfSeller = courierFee - halfBuyer;
      const currency = proposal?.details?.currency || delivery.currency || "XAF";

      if (proposal?.details?.type === "purchase" && proposal?.reservations?.walletReserved) {
        const totalAmount = proposal.reservations.walletReserved;
        // Seller receives: medicine price minus their courier fee share
        const sellerNetCredit = totalAmount - halfSeller;

        // Verify buyer has sufficient available balance for courier fee share
        if (halfBuyer > 0) {
          const buyerAvailable = buyerWalletSnap.data()?.available || 0;
          if (buyerAvailable < halfBuyer) {
            logger.warn(
              `completeExchangeDelivery: Buyer ${buyerId} has insufficient balance for courier fee share`,
              { required: halfBuyer, available: buyerAvailable }
            );
            throw new HttpsError(
              "failed-precondition",
              `Buyer has insufficient balance for courier fee. Required: ${halfBuyer} ${currency}, Available: ${buyerAvailable} ${currency}`
            );
          }
        }

        // Move buyer's deducted balance → gone (payment captured)
        transaction.update(buyerWalletRef, {
          deducted: FieldValue.increment(-totalAmount),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Deduct buyer's courier fee share from available balance
        if (halfBuyer > 0) {
          transaction.update(buyerWalletRef, {
            available: FieldValue.increment(-halfBuyer),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        // Credit seller with net amount (sale price minus courier share)
        transaction.update(sellerWalletRef, {
          available: FieldValue.increment(sellerNetCredit),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Credit courier wallet (create if needed). Always (re)set currency
        // so legacy wallets created with the wrong default are corrected.
        if (courierFee > 0) {
          if (!courierWalletSnap.exists) {
            transaction.set(courierWalletRef, {
              available: courierFee,
              held: 0,
              currency,
              updatedAt: FieldValue.serverTimestamp(),
              createdAt: FieldValue.serverTimestamp(),
            });
          } else {
            transaction.update(courierWalletRef, {
              available: FieldValue.increment(courierFee),
              currency,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }

        logger.info(
          `completeExchangeDelivery: Payment finalized`,
          {
            totalAmount,
            sellerNetCredit,
            courierFee,
            halfBuyer,
            halfSeller,
            sellerId,
            buyerId,
            courierId: userId,
            currency,
          }
        );

        // Record medicine payment in ledger
        const medicineLedgerRef = db.collection("ledger").doc();
        transaction.set(medicineLedgerRef, {
          type: "exchange_delivery_payment",
          deliveryId: deliveryId,
          proposalId: proposal?.proposalId || delivery.proposalId,
          buyerId,
          sellerId,
          courierId: userId,
          totalAmount,
          sellerAmount: sellerNetCredit,
          courierFee,
          currency,
          createdAt: FieldValue.serverTimestamp(),
        });

        // Record courier fee ledger entries
        if (courierFee > 0) {
          const buyerFeeLedger = db.collection("ledger").doc();
          transaction.set(buyerFeeLedger, {
            type: "courier_fee",
            userId: buyerId,
            amount: halfBuyer,
            currency,
            from: "wallet",
            to: "courier",
            deliveryId,
            courierId: userId,
            description: "Courier fee (buyer share)",
            createdAt: FieldValue.serverTimestamp(),
          });

          const sellerFeeLedger = db.collection("ledger").doc();
          transaction.set(sellerFeeLedger, {
            type: "courier_fee",
            userId: sellerId,
            amount: halfSeller,
            currency,
            from: "sale_proceeds",
            to: "courier",
            deliveryId,
            courierId: userId,
            description: "Courier fee (seller share, deducted from sale proceeds)",
            createdAt: FieldValue.serverTimestamp(),
          });

          const courierPayLedger = db.collection("ledger").doc();
          transaction.set(courierPayLedger, {
            type: "courier_payment",
            userId,
            amount: courierFee,
            currency,
            from: "exchange",
            to: "wallet",
            deliveryId,
            description: "Courier delivery fee",
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      }

      // ===== PHASE 3: UPDATE INVENTORY COUNTS =====

      const receivedQuantity = proposal?.details?.quantity || 0;
      const sourceData = sourceInventorySnapshot?.data();

      // --- 3A: DECREMENT SELLER STOCK ---

      if (proposal?.details?.type === "purchase" && sourceInventoryRef) {
        // Verify seller has sufficient stock
        const sellerAvailable = sourceData?.availableQuantity || 0;
        if (sellerAvailable < receivedQuantity) {
          throw new HttpsError(
            "failed-precondition",
            `Seller has insufficient stock. Required: ${receivedQuantity}, Available: ${sellerAvailable}`
          );
        }

        // Decrement seller's availableQuantity only (totalQuantity is not canonical)
        transaction.update(sourceInventoryRef, {
          availableQuantity: FieldValue.increment(-receivedQuantity),
          updatedAt: FieldValue.serverTimestamp(),
        });

        logger.info(
          `completeExchangeDelivery: Decremented ${receivedQuantity} units from seller inventory`,
          {
            inventoryId: sourceInventoryId,
            sellerId,
            previousAvailable: sellerAvailable,
            quantity: receivedQuantity,
          }
        );
      }

      // For exchange proposals: bilateral stock settlement
      // This is a pilot compromise: one visible courier trip B->A,
      // the return movement A->B is a back-office stock transfer at completion.
      if (proposal?.details?.type === "exchange") {
        // Guard: both inventories must exist for an exchange to complete
        if (!sourceInventorySnapshot?.exists) {
          throw new HttpsError(
            "failed-precondition",
            `Owner inventory item not found: ${sourceInventoryId}. Exchange cannot complete.`
          );
        }
        if (!exchangeInventorySnapshot?.exists) {
          throw new HttpsError(
            "failed-precondition",
            `Proposer exchange inventory item not found: ${exchangeInventoryId}. Exchange cannot complete.`
          );
        }

        const exchangeQuantity = proposal?.reservations?.inventoryReserved || proposal?.details?.exchangeQuantity || 0;
        const exchangeData = exchangeInventorySnapshot.data();

        // 3A-exchange-1: Finalize proposer A's offered item X
        // availableQuantity was already decremented at reservation time, only clear reservedQuantity
        if (exchangeInventoryRef && exchangeQuantity > 0) {
          transaction.update(exchangeInventoryRef, {
            reservedQuantity: FieldValue.increment(-exchangeQuantity),
            updatedAt: FieldValue.serverTimestamp(),
          });

          logger.info(
            `completeExchangeDelivery: Released ${exchangeQuantity} reserved units from proposer inventory`,
            { inventoryId: exchangeInventoryId, quantity: exchangeQuantity }
          );
        }

        // 3A-exchange-2: Decrement owner B's item Y (availableQuantity only)
        if (sourceInventoryRef && sourceData) {
          const ownerAvailable = sourceData.availableQuantity || 0;
          if (ownerAvailable < receivedQuantity) {
            throw new HttpsError(
              "failed-precondition",
              `Owner has insufficient stock for exchange. Required: ${receivedQuantity}, Available: ${ownerAvailable}`
            );
          }

          transaction.update(sourceInventoryRef, {
            availableQuantity: FieldValue.increment(-receivedQuantity),
            updatedAt: FieldValue.serverTimestamp(),
          });

          logger.info(
            `completeExchangeDelivery: Decremented ${receivedQuantity} units from owner inventory`,
            { inventoryId: sourceInventoryId, sellerId, quantity: receivedQuantity }
          );
        }

        // 3B-exchange: Create item X at owner B (back-office transfer)
        if (targetInventoryRef2 && exchangeData) {
          const exchangeBatch = exchangeData.batch || {};
          transaction.set(targetInventoryRef2, {
            pharmacyId: sellerId,
            medicineId: exchangeData.medicineId || "",
            medicineName: exchangeData.medicineName || "Unknown Medicine",
            dosage: exchangeData.dosage || "",
            form: exchangeData.form || "",
            packaging: exchangeData.packaging || "units",
            availableQuantity: exchangeQuantity,
            batch: {
              lotNumber: exchangeBatch.lotNumber || "EXCHANGED",
              expirationDate: exchangeBatch.expirationDate || null,
            },
            availabilitySettings: {
              availableForExchange: false,
              minExchangeQuantity: 1,
              maxExchangeQuantity: exchangeQuantity,
            },
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

          logger.info(
            `completeExchangeDelivery: Created exchange item at owner pharmacy (back-office transfer)`,
            {
              targetPharmacyId: sellerId,
              targetInventoryId: targetInventoryRef2.id,
              medicineId: exchangeData.medicineId,
              quantity: exchangeQuantity,
            }
          );
        }
      }

      // --- 3B: CREATE BUYER INVENTORY ITEM (one document per reception, no fusion) ---

      const inventoryItem = delivery.items?.[0];

      // Reprise des métadonnées batch depuis l'inventaire source si disponibles
      const sourceBatch = sourceData?.batch || {};
      const batchData = {
        lotNumber: sourceBatch.lotNumber || "RECEIVED",
        expirationDate: sourceBatch.expirationDate || null,
      };

      transaction.set(targetInventoryRef, {
        pharmacyId: buyerId,
        medicineId: inventoryItem?.medicineId || "",
        medicineName: inventoryItem?.medicineName || "Unknown Medicine",
        dosage: inventoryItem?.dosage || "",
        form: inventoryItem?.form || "",
        packaging: inventoryItem?.packaging || sourceData?.packaging || "units",
        availableQuantity: receivedQuantity,
        batch: batchData,
        availabilitySettings: {
          availableForExchange: false, // Private by default — buyer must explicitly publish
          minExchangeQuantity: 1,
          maxExchangeQuantity: receivedQuantity,
        },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      logger.info(
        `completeExchangeDelivery: Created buyer inventory item`,
        {
          targetPharmacyId: buyerId,
          targetInventoryId: targetInventoryRef.id,
          medicineId: inventoryItem?.medicineId,
          quantity: receivedQuantity,
        }
      );

      // ===== PHASE 4: UPDATE DELIVERY STATUS =====

      transaction.update(deliveryRef, {
        status: "delivered",
        deliveredAt: FieldValue.serverTimestamp(),
        completedAt: FieldValue.serverTimestamp(),
        photoProofUrl: photoProofUrl || null,
        deliveryNotes: deliveryNotes || "",
        deliveryLocation: latitude && longitude ? {
          latitude,
          longitude,
          timestamp: Timestamp.now(),
        } : null,
        updatedAt: FieldValue.serverTimestamp(),
        paymentStatus: proposal?.details?.type === "purchase" ? "paid" : "n/a",
      });

      // ===== PHASE 5: UPDATE PROPOSAL STATUS =====

      transaction.update(proposalRef, {
        status: "completed",
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        // Clear reservations (already processed)
        reservations: {
          walletReserved: null,
          inventoryReserved: null,
        },
      });

      logger.info(
        `completeExchangeDelivery: Delivery ${deliveryId} completed successfully`,
        {
          proposalId: delivery.proposalId,
          proposalType: proposal?.details?.type,
          buyerId,
          sellerId,
          courierId: userId,
          paymentFinalized: proposal?.details?.type === "purchase",
          inventoryUpdated: true,
        }
      );

      return {
        success: true,
        deliveryId,
        proposalId: delivery.proposalId,
        status: "completed",
        paymentProcessed: proposal?.details?.type === "purchase",
        inventoryUpdated: true,
      };
    });

    return result;
  }
);
