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

      // ===== PHASE 2: FINALIZE PAYMENT (for purchase proposals) =====

      if (proposal?.details?.type === "purchase" && proposal?.reservations?.walletReserved) {
        const sellerWalletRef = db
          .collection("wallets")
          .doc(delivery.toPharmacyId); // Target pharmacy receives payment
        const buyerWalletRef = db
          .collection("wallets")
          .doc(delivery.fromPharmacyId); // Creator pharmacy paid
        const courierWalletRef = db.collection("wallets").doc(userId); // Courier receives fee

        // Calculate courier fee (50/50 split from exchangeCapture workflow)
        // For now, use 10% of transaction as delivery fee
        const totalAmount = proposal.reservations.walletReserved;
        const courierFee = Math.round(totalAmount * 0.1); // 10% delivery fee
        const sellerAmount = totalAmount - courierFee;

        // Move buyer's deducted balance → gone (payment captured)
        transaction.update(buyerWalletRef, {
          deducted: FieldValue.increment(-totalAmount),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Credit seller's wallet
        transaction.update(sellerWalletRef, {
          available: FieldValue.increment(sellerAmount),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Credit courier's wallet
        transaction.update(courierWalletRef, {
          available: FieldValue.increment(courierFee),
          updatedAt: FieldValue.serverTimestamp(),
        });

        logger.info(
          `completeExchangeDelivery: Payment finalized - Seller: ${sellerAmount}, Courier: ${courierFee} ${proposal.details?.currency || "XAF"}`,
          {
            totalAmount,
            sellerAmount,
            courierFee,
            sellerId: delivery.toPharmacyId,
            buyerId: delivery.fromPharmacyId,
            courierId: userId,
          }
        );

        // Record transaction in ledger
        const ledgerRef = db.collection("ledger").doc();
        transaction.set(ledgerRef, {
          type: "exchange_delivery_payment",
          deliveryId: deliveryId,
          proposalId: proposal?.proposalId || delivery.proposalId,
          fromPharmacyId: delivery.fromPharmacyId,
          toPharmacyId: delivery.toPharmacyId,
          courierId: userId,
          totalAmount,
          sellerAmount,
          courierFee,
          currency: proposal.details?.currency || "XAF",
          createdAt: FieldValue.serverTimestamp(),
        });
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
      const targetInventoryItemId = `${delivery.toPharmacyId}_${delivery.items?.[0]?.medicineId || "unknown"}`;
      const targetInventoryRef = db
        .collection("pharmacy_inventory")
        .doc(targetInventoryItemId);
      const targetInventorySnapshot = await transaction.get(targetInventoryRef);

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
