/**
 * 🔒 ACCEPT EXCHANGE PROPOSAL AND CREATE DELIVERY
 *
 * Firebase Cloud Function for target pharmacy accepting exchange proposals.
 * Creates delivery order and transitions wallet balance from held → deducted.
 *
 * Atomic Operations:
 * - Validate proposal status is "pending"
 * - Create delivery order document
 * - Update proposal status to "accepted"
 * - Move wallet balance: held → deducted (ready for payment capture)
 * - Link to existing exchangeCapture workflow
 *
 * Security:
 * - Only target pharmacy can accept proposal
 * - Only pending proposals can be accepted
 * - Atomic transaction prevents partial operations
 * - Server-side validation (cannot be bypassed)
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

interface AcceptProposalData {
  proposalId: string;
  notes?: string; // Optional acceptance notes from target pharmacy
}

/**
 * Accepts an exchange proposal and creates delivery order
 *
 * @param {AcceptProposalData} data - Acceptance data
 * @returns {Promise<{success: boolean, proposalId: string, deliveryId: string}>}
 * @throws {HttpsError} - If validation fails
 */
export const acceptExchangeProposal = onCall<AcceptProposalData>(
  { region: "europe-west1", cors: true },
  async (request) => {
    const userId = request.auth?.uid;

    // 🔒 AUTHENTICATION CHECK
    if (!userId) {
      logger.warn("acceptExchangeProposal: Unauthenticated request");
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to accept proposals"
      );
    }

    const data = request.data;

    // 🔒 VALIDATE INPUT DATA
    if (!data || !data.proposalId) {
      throw new HttpsError("invalid-argument", "Proposal ID is required");
    }

    const { proposalId, notes } = data;

    logger.info(
      `acceptExchangeProposal: User ${userId} attempting to accept proposal ${proposalId}`,
      { notes }
    );

    // 🔒 ATOMIC TRANSACTION: Accept proposal + create delivery + update wallet
    const result = await db.runTransaction(async (transaction) => {
      // ===== PHASE 1: READ PROPOSAL =====

      const proposalRef = db.collection("exchange_proposals").doc(proposalId);
      const proposalSnapshot = await transaction.get(proposalRef);

      if (!proposalSnapshot.exists) {
        throw new HttpsError("not-found", "Proposal not found");
      }

      const proposal = proposalSnapshot.data();

      // ===== PHASE 2: VALIDATE AUTHORIZATION & STATUS =====

      // Verify user is the TARGET pharmacy (only target can accept)
      if (proposal?.toPharmacyId !== userId) {
        logger.warn(
          `acceptExchangeProposal: User ${userId} is not the target pharmacy for proposal ${proposalId}`,
          {
            toPharmacyId: proposal?.toPharmacyId,
            actualUserId: userId,
          }
        );
        throw new HttpsError(
          "permission-denied",
          "Only the target pharmacy can accept this proposal"
        );
      }

      // Verify proposal is in pending state
      if (proposal?.status !== "pending") {
        logger.info(
          `acceptExchangeProposal: Cannot accept proposal with status ${proposal?.status}`,
          { proposalId, currentStatus: proposal?.status }
        );
        throw new HttpsError(
          "failed-precondition",
          `Cannot accept proposal with status: ${proposal?.status}. Only pending proposals can be accepted.`
        );
      }

      // ===== PHASE 3: READ ADDITIONAL DATA FOR DELIVERY CREATION =====

      // Read inventory item to get medicine details for delivery
      const inventoryRef = db
        .collection("pharmacy_inventory")
        .doc(proposal.inventoryItemId);
      const inventorySnapshot = await transaction.get(inventoryRef);

      if (!inventorySnapshot.exists) {
        throw new HttpsError(
          "not-found",
          "Inventory item not found for this proposal"
        );
      }

      const inventoryData = inventorySnapshot.data();

      // Read pharmacy documents to get location and contact info
      const fromPharmacyRef = db
        .collection("pharmacies")
        .doc(proposal.fromPharmacyId);
      const toPharmacyRef = db.collection("pharmacies").doc(proposal.toPharmacyId);

      const [fromPharmacySnapshot, toPharmacySnapshot] = await Promise.all([
        transaction.get(fromPharmacyRef),
        transaction.get(toPharmacyRef),
      ]);

      if (!fromPharmacySnapshot.exists || !toPharmacySnapshot.exists) {
        throw new HttpsError("not-found", "Pharmacy data not found");
      }

      const fromPharmacy = fromPharmacySnapshot.data();
      const toPharmacy = toPharmacySnapshot.data();

      // ===== PHASE 4: UPDATE WALLET BALANCE (held → deducted) =====

      // Only for purchase proposals (exchange proposals don't involve money transfer)
      if (proposal?.reservations?.walletReserved && proposal.details?.type === "purchase") {
        const walletRef = db
          .collection("wallets")
          .doc(proposal.fromPharmacyId);

        // Move balance from held → deducted (ready for payment capture after delivery)
        transaction.update(walletRef, {
          held: FieldValue.increment(-proposal.reservations.walletReserved),
          deducted: FieldValue.increment(proposal.reservations.walletReserved),
          updatedAt: FieldValue.serverTimestamp(),
        });

        logger.info(
          `acceptExchangeProposal: Moved ${proposal.reservations.walletReserved} ${proposal.details?.currency || "XAF"} from held → deducted`,
          {
            userId: proposal.fromPharmacyId,
            amount: proposal.reservations.walletReserved,
          }
        );
      }

      // ===== PHASE 5: CREATE DELIVERY ORDER =====

      const deliveryRef = db.collection("deliveries").doc(); // Auto-generate delivery ID

      const deliveryData = {
        // Delivery identifiers
        deliveryId: deliveryRef.id,
        proposalId: proposalId,
        exchangeId: null, // Will be linked by exchangeCapture function

        // Pharmacy information
        fromPharmacyId: proposal.fromPharmacyId,
        fromPharmacyName: fromPharmacy?.pharmacyName || "Unknown Pharmacy",
        fromPharmacyAddress: fromPharmacy?.address || "",
        fromPharmacyCity: fromPharmacy?.city || "",
        fromPharmacyLocation: fromPharmacy?.location || null,
        fromPharmacyPhone: fromPharmacy?.phoneNumber || "",

        toPharmacyId: proposal.toPharmacyId,
        toPharmacyName: toPharmacy?.pharmacyName || "Unknown Pharmacy",
        toPharmacyAddress: toPharmacy?.address || "",
        toPharmacyCity: toPharmacy?.city || "",
        toPharmacyLocation: toPharmacy?.location || null,
        toPharmacyPhone: toPharmacy?.phoneNumber || "",

        // Medicine/item details
        items: [
          {
            medicineId: inventoryData?.medicineId || "",
            medicineName: inventoryData?.medicineName || "Unknown Medicine",
            dosage: inventoryData?.dosage || "",
            form: inventoryData?.form || "",
            quantity: proposal.details?.quantity || 0,
            packaging: inventoryData?.packaging || "",
          },
        ],

        // Delivery status
        status: "pending", // pending → assigned → picked_up → in_transit → delivered
        courierId: null, // Assigned when courier accepts
        courierName: null,
        courierPhone: null,

        // Financial details
        proposalType: proposal.details?.type || "exchange",
        totalPrice: proposal.details?.totalPrice || 0,
        currency: proposal.details?.currency || "XAF",
        courierFee: 0, // Calculated when courier accepts (50/50 split from exchangeCapture)
        paymentStatus: "pending", // pending → paid

        // Timestamps
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        acceptedAt: FieldValue.serverTimestamp(),
        assignedAt: null,
        pickedUpAt: null,
        deliveredAt: null,

        // Additional tracking
        estimatedDeliveryTime: null,
        actualDeliveryTime: null,
        qrCodePickup: deliveryRef.id, // QR code for pickup verification
        qrCodeDelivery: `${deliveryRef.id}-delivery`, // QR code for delivery verification
        photoProofUrl: null, // Photo of delivered items
        deliveryNotes: notes || "",
      };

      transaction.set(deliveryRef, deliveryData);

      logger.info(
        `acceptExchangeProposal: Created delivery order ${deliveryRef.id}`,
        {
          proposalId,
          fromPharmacyId: proposal.fromPharmacyId,
          toPharmacyId: proposal.toPharmacyId,
          deliveryId: deliveryRef.id,
        }
      );

      // ===== PHASE 6: UPDATE PROPOSAL STATUS =====

      transaction.update(proposalRef, {
        status: "accepted",
        acceptedBy: userId,
        acceptedAt: FieldValue.serverTimestamp(),
        deliveryId: deliveryRef.id, // Link to delivery order
        updatedAt: FieldValue.serverTimestamp(),
        acceptanceNotes: notes || "",
      });

      logger.info(
        `acceptExchangeProposal: Proposal ${proposalId} accepted successfully`,
        {
          status: "accepted",
          acceptedBy: userId,
          deliveryId: deliveryRef.id,
          proposalType: proposal.details?.type,
          walletMoved: proposal?.reservations?.walletReserved || 0,
        }
      );

      return {
        success: true,
        proposalId,
        deliveryId: deliveryRef.id,
        status: "accepted",
        delivery: {
          id: deliveryRef.id,
          fromPharmacy: fromPharmacy?.pharmacyName || "Unknown",
          toPharmacy: toPharmacy?.pharmacyName || "Unknown",
          status: "pending",
        },
      };
    });

    return result;
  }
);
