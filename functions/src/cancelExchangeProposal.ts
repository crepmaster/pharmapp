/**
 * 🔒 CANCEL EXCHANGE PROPOSAL WITH RESERVATION RELEASE
 *
 * Firebase Cloud Function for cancelling/rejecting exchange proposals and releasing reserved resources.
 * Critical for preventing indefinite locking of wallet balance and inventory quantity.
 *
 * Atomic Operations:
 * - Release wallet balance (held → available)
 * - Release inventory quantity (reserved → available)
 * - Update proposal status to "cancelled" or "rejected"
 *
 * Security:
 * - Only proposal creator or target pharmacy can cancel
 * - Only pending proposals can be cancelled
 * - Atomic transaction prevents partial releases
 * - Server-side validation (cannot be bypassed)
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

interface CancelProposalData {
  proposalId: string;
  reason?: string;
  action?: "cancel" | "reject"; // cancel = creator, reject = target
}

/**
 * Cancels or rejects an exchange proposal and releases all reservations
 *
 * @param {CancelProposalData} data - Cancellation data
 * @returns {Promise<{success: boolean, proposalId: string}>}
 * @throws {HttpsError} - If validation fails
 */
export const cancelExchangeProposal = onCall<CancelProposalData>(
  { region: "europe-west1", cors: true },
  async (request) => {
    const userId = request.auth?.uid;

    // 🔒 AUTHENTICATION CHECK
    if (!userId) {
      logger.warn("cancelExchangeProposal: Unauthenticated request");
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to cancel proposals"
      );
    }

    const data = request.data;

    // 🔒 VALIDATE INPUT DATA
    if (!data || !data.proposalId) {
      throw new HttpsError("invalid-argument", "Proposal ID is required");
    }

    const { proposalId, reason, action } = data;

    logger.info(
      `cancelExchangeProposal: User ${userId} attempting to ${action || "cancel"} proposal ${proposalId}`,
      { reason }
    );

    // 🔒 ATOMIC TRANSACTION: Cancel proposal + release reservations
    const result = await db.runTransaction(async (transaction) => {
      // ===== PHASE 1: READ PROPOSAL =====

      const proposalRef = db.collection("exchange_proposals").doc(proposalId);
      const proposalSnapshot = await transaction.get(proposalRef);

      if (!proposalSnapshot.exists) {
        throw new HttpsError("not-found", "Proposal not found");
      }

      const proposal = proposalSnapshot.data();

      // ===== PHASE 2: VALIDATE AUTHORIZATION & STATUS =====

      // Verify user is authorized to cancel this proposal
      const isCreator = proposal?.fromPharmacyId === userId;
      const isTarget = proposal?.toPharmacyId === userId;

      if (!isCreator && !isTarget) {
        logger.warn(
          `cancelExchangeProposal: User ${userId} not authorized for proposal ${proposalId}`,
          {
            fromPharmacyId: proposal?.fromPharmacyId,
            toPharmacyId: proposal?.toPharmacyId,
          }
        );
        throw new HttpsError(
          "permission-denied",
          "You are not authorized to cancel this proposal"
        );
      }

      // Verify proposal can be cancelled (must be pending)
      if (proposal?.status !== "pending") {
        logger.info(
          `cancelExchangeProposal: Cannot cancel proposal with status ${proposal?.status}`,
          { proposalId, currentStatus: proposal?.status }
        );
        throw new HttpsError(
          "failed-precondition",
          `Cannot cancel proposal with status: ${proposal?.status}. Only pending proposals can be cancelled.`
        );
      }

      // ===== PHASE 3: RELEASE RESERVATIONS =====

      // 🔒 RELEASE WALLET RESERVATION (for purchase proposals)
      if (proposal?.reservations?.walletReserved) {
        const walletRef = db
          .collection("wallets")
          .doc(proposal.fromPharmacyId);

        // Atomic: Move balance from held → available
        transaction.update(walletRef, {
          available: FieldValue.increment(proposal.reservations.walletReserved),
          held: FieldValue.increment(-proposal.reservations.walletReserved),
          updatedAt: FieldValue.serverTimestamp(),
        });

        logger.info(
          `cancelExchangeProposal: Released ${proposal.reservations.walletReserved} ${proposal.details?.currency || "XAF"} from wallet`,
          {
            userId: proposal.fromPharmacyId,
            amount: proposal.reservations.walletReserved,
          }
        );
      }

      // 🔒 RELEASE INVENTORY RESERVATION (for exchange proposals)
      if (
        proposal?.reservations?.inventoryReserved &&
        proposal?.details?.exchangeInventoryItemId
      ) {
        const inventoryRef = db
          .collection("pharmacy_inventory")
          .doc(proposal.details.exchangeInventoryItemId);

        // Atomic: Move quantity from reserved → available
        transaction.update(inventoryRef, {
          availableQuantity: FieldValue.increment(
            proposal.reservations.inventoryReserved
          ),
          reservedQuantity: FieldValue.increment(
            -proposal.reservations.inventoryReserved
          ),
          updatedAt: FieldValue.serverTimestamp(),
        });

        logger.info(
          `cancelExchangeProposal: Released ${proposal.reservations.inventoryReserved} units from inventory`,
          {
            inventoryId: proposal.details.exchangeInventoryItemId,
            quantity: proposal.reservations.inventoryReserved,
          }
        );
      }

      // ===== PHASE 4: UPDATE PROPOSAL STATUS =====

      const isCancelled = action === "cancel" || isCreator;
      const isRejected = action === "reject" || isTarget;

      const newStatus = isCancelled ? "cancelled" : "rejected";
      const actionBy = userId;
      const actionReason = reason || (isCancelled ? "Cancelled by creator" : "Rejected by target");

      transaction.update(proposalRef, {
        status: newStatus,
        [newStatus === "cancelled" ? "cancelledBy" : "rejectedBy"]: actionBy,
        [newStatus === "cancelled" ? "cancelledReason" : "rejectionReason"]: actionReason,
        [newStatus === "cancelled" ? "cancelledAt" : "rejectedAt"]: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        // Clear reservations to prevent double-release
        reservations: {
          walletReserved: null,
          inventoryReserved: null,
        },
      });

      logger.info(
        `cancelExchangeProposal: Proposal ${proposalId} ${newStatus} successfully`,
        {
          status: newStatus,
          actionBy,
          reason: actionReason,
          walletReleased: proposal?.reservations?.walletReserved || 0,
          inventoryReleased: proposal?.reservations?.inventoryReserved || 0,
        }
      );

      return {
        success: true,
        proposalId,
        status: newStatus,
        reservationsReleased: {
          wallet: proposal?.reservations?.walletReserved || 0,
          inventory: proposal?.reservations?.inventoryReserved || 0,
        },
      };
    });

    return result;
  }
);
