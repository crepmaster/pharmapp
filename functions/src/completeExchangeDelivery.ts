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

      // ===== PHASE 1b: READ ALL DOCUMENTS NEEDED (Firestore requires reads before writes) =====

      const buyerWalletRef = db.collection("wallets").doc(delivery.fromPharmacyId);
      const sellerWalletRef = db.collection("wallets").doc(delivery.toPharmacyId);
      const courierWalletRef = db.collection("wallets").doc(userId);

      // Target inventory for Phase 3
      const targetInventoryItemId = `${delivery.toPharmacyId}_${delivery.items?.[0]?.medicineId || "unknown"}`;
      const targetInventoryRef = db.collection("pharmacy_inventory").doc(targetInventoryItemId);

      // Read all wallets + target inventory upfront (Firestore: all reads before first write)
      const [buyerWalletSnap, courierWalletSnap, targetInventorySnapshot] = await Promise.all([
        transaction.get(buyerWalletRef),
        transaction.get(courierWalletRef),
        transaction.get(targetInventoryRef),
      ]);

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
              `completeExchangeDelivery: Buyer ${delivery.fromPharmacyId} has insufficient balance for courier fee share`,
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

        // Credit courier wallet (create if needed)
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
            sellerId: delivery.toPharmacyId,
            buyerId: delivery.fromPharmacyId,
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
          fromPharmacyId: delivery.fromPharmacyId,
          toPharmacyId: delivery.toPharmacyId,
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
            userId: delivery.fromPharmacyId,
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
            userId: delivery.toPharmacyId,
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

      // For exchange proposals: Release reserved inventory from creator, add to target
      if (proposal?.details?.type === "exchange" && proposal?.reservations?.inventoryReserved) {
        const creatorInventoryRef = db
          .collection("pharmacy_inventory")
          .doc(proposal.details.exchangeInventoryItemId);

        // Deduct reserved quantity from creator's inventory (already reserved, now gone)
        transaction.update(creatorInventoryRef, {
          reservedQuantity: FieldValue.increment(
            -proposal.reservations.inventoryReserved
          ),
          totalQuantity: FieldValue.increment(
            -proposal.reservations.inventoryReserved
          ),
          updatedAt: FieldValue.serverTimestamp(),
        });

        logger.info(
          `completeExchangeDelivery: Deducted ${proposal.reservations.inventoryReserved} units from creator inventory`,
          {
            inventoryId: proposal.details.exchangeInventoryItemId,
            quantity: proposal.reservations.inventoryReserved,
          }
        );
      }

      // Add received medicine to target pharmacy's inventory
      // (targetInventoryRef and targetInventorySnapshot read in Phase 1b)
      const receivedQuantity = proposal?.details?.quantity || 0;

      if (targetInventorySnapshot.exists) {
        // Update existing inventory item
        transaction.update(targetInventoryRef, {
          availableQuantity: FieldValue.increment(receivedQuantity),
          totalQuantity: FieldValue.increment(receivedQuantity),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        // Create new inventory item for target pharmacy
        const inventoryItem = delivery.items?.[0];
        transaction.set(targetInventoryRef, {
          pharmacyId: delivery.toPharmacyId,
          medicineId: inventoryItem?.medicineId || "",
          medicineName: inventoryItem?.medicineName || "Unknown Medicine",
          dosage: inventoryItem?.dosage || "",
          form: inventoryItem?.form || "",
          packaging: inventoryItem?.packaging || "",
          availableQuantity: receivedQuantity,
          totalQuantity: receivedQuantity,
          reservedQuantity: 0,
          expirationDate: null, // TODO: Get from original inventory if available
          batchNumber: null,
          isAvailableForExchange: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      logger.info(
        `completeExchangeDelivery: Added ${receivedQuantity} units to target pharmacy inventory`,
        {
          targetPharmacyId: delivery.toPharmacyId,
          medicineId: delivery.items?.[0]?.medicineId,
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
          fromPharmacyId: delivery.fromPharmacyId,
          toPharmacyId: delivery.toPharmacyId,
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
