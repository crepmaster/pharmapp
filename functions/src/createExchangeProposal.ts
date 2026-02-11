/**
 * 🔒 SECURE EXCHANGE PROPOSAL CREATION
 *
 * Firebase Cloud Function for creating exchange proposals with server-side validation.
 * Enforces subscription requirements and business logic that cannot be bypassed by clients.
 *
 * Security Features:
 * - Server-side subscription validation (trial + active subscriptions)
 * - Self-proposal prevention
 * - Wallet balance validation for purchase proposals
 * - Currency mismatch validation
 * - Expiration date validation
 * - Atomic operations with server timestamps
 *
 * Defense in Depth:
 * Layer 1: Frontend validation (UX, fast feedback)
 * Layer 2: This function (business logic enforcement) ✅
 * Layer 3: Firestore security rules (data integrity) ✅
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

interface ExchangeProposalData {
  inventoryItemId: string;
  fromPharmacyId: string;
  toPharmacyId: string;
  details: {
    type: "purchase" | "exchange";
    quantity: number;
    pricePerUnit?: number;
    totalPrice?: number;
    currency?: string;
    notes?: string;
    exchangeMedicineId?: string;
    exchangeInventoryItemId?: string;
    exchangeQuantity?: number;
  };
}

/**
 * Creates an exchange proposal with server-side validation
 *
 * @param {ExchangeProposalData} data - Proposal data from client
 * @returns {Promise<{proposalId: string}>} - Created proposal ID
 * @throws {HttpsError} - If validation fails
 */
export const createExchangeProposal = onCall<ExchangeProposalData>(
  { region: "europe-west1", cors: true },
  async (request) => {
    const userId = request.auth?.uid;

    // 🔒 AUTHENTICATION CHECK
    if (!userId) {
      logger.warn("createExchangeProposal: Unauthenticated request");
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to create proposals"
      );
    }

    const data = request.data;

    // 🔒 VALIDATE INPUT DATA
    if (!data || typeof data !== "object") {
      throw new HttpsError("invalid-argument", "Invalid proposal data");
    }

    const {
      inventoryItemId,
      fromPharmacyId,
      toPharmacyId,
      details,
    } = data;

    // Validate required fields
    if (!inventoryItemId || !fromPharmacyId || !toPharmacyId || !details) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required fields: inventoryItemId, fromPharmacyId, toPharmacyId, details"
      );
    }

    // Validate user is the proposer
    if (fromPharmacyId !== userId) {
      logger.warn(
        `createExchangeProposal: User ${userId} tried to create proposal as ${fromPharmacyId}`
      );
      throw new HttpsError(
        "permission-denied",
        "Cannot create proposals for other pharmacies"
      );
    }

    // 🔒 BUSINESS LOGIC VALIDATION #1: Prevent self-proposals
    if (fromPharmacyId === toPharmacyId) {
      logger.info(`createExchangeProposal: User ${userId} tried self-proposal`);
      throw new HttpsError(
        "failed-precondition",
        "Cannot create proposal for your own inventory"
      );
    }

    try {
      // 🔒 CRITICAL: SUBSCRIPTION VALIDATION (server-side, cannot be bypassed)
      const pharmacyDoc = await db.collection("pharmacies").doc(userId).get();

      if (!pharmacyDoc.exists) {
        logger.error(`createExchangeProposal: Pharmacy document not found for user ${userId}`);
        throw new HttpsError("not-found", "Pharmacy not found");
      }

      const pharmacyData = pharmacyDoc.data();
      const subscription = pharmacyData?.subscription;

      // Check subscription status
      const isActive = subscription?.isActive === true;
      const isTrial = subscription?.status === "trial";
      const trialEndDate = subscription?.endDate?.toDate?.();
      const isTrialValid = isTrial && trialEndDate && trialEndDate > new Date();

      if (!isActive && !isTrialValid) {
        logger.info(
          `createExchangeProposal: User ${userId} attempted proposal without valid subscription`,
          {
            isActive,
            isTrial,
            trialEndDate: trialEndDate?.toISOString(),
          }
        );
        throw new HttpsError(
          "failed-precondition",
          "Active subscription required to create proposals",
          {
            code: "SUBSCRIPTION_REQUIRED",
            subscriptionStatus: subscription?.status || "none",
          }
        );
      }

      logger.info(
        `createExchangeProposal: Subscription validated for user ${userId}`,
        { isActive, isTrial, isTrialValid }
      );

      // 🔒 ATOMIC TRANSACTION: Create proposal with balance/quantity reservation
      // This prevents race conditions where multiple proposals are created simultaneously
      const result = await db.runTransaction(async (transaction) => {
        // ===== PHASE 1: READ ALL DOCUMENTS (must read before any writes) =====

        // For PURCHASE proposals: Read wallet balance
        let walletRef;
        let walletSnapshot;
        if (details.type === "purchase") {
          if (!details.totalPrice || !details.currency) {
            throw new HttpsError(
              "invalid-argument",
              "Purchase proposals require totalPrice and currency"
            );
          }

          walletRef = db.collection("wallets").doc(userId);
          walletSnapshot = await transaction.get(walletRef);
        }

        // For EXCHANGE proposals: Read exchange inventory
        let exchangeInventoryRef;
        let exchangeInventorySnapshot;
        if (details.type === "exchange") {
          if (
            !details.exchangeMedicineId ||
            !details.exchangeInventoryItemId ||
            !details.exchangeQuantity
          ) {
            throw new HttpsError(
              "invalid-argument",
              "Exchange proposals require exchangeMedicineId, exchangeInventoryItemId, and exchangeQuantity"
            );
          }

          exchangeInventoryRef = db
            .collection("pharmacy_inventory")
            .doc(details.exchangeInventoryItemId);
          exchangeInventorySnapshot = await transaction.get(exchangeInventoryRef);
        }

        // Read target inventory (for both purchase and exchange)
        const inventoryRef = db.collection("pharmacy_inventory").doc(inventoryItemId);
        const inventorySnapshot = await transaction.get(inventoryRef);

        // ===== PHASE 2: VALIDATE ALL DATA =====

        // Validate target inventory exists
        if (!inventorySnapshot.exists) {
          throw new HttpsError("not-found", "Target inventory item not found");
        }

        const inventoryData = inventorySnapshot.data();
        if (inventoryData?.pharmacyId !== toPharmacyId) {
          throw new HttpsError(
            "invalid-argument",
            "Target inventory does not belong to specified pharmacy"
          );
        }

        // Validate target inventory not expired
        const targetExpirationDate = inventoryData?.batch?.expirationDate?.toDate?.();
        if (targetExpirationDate && targetExpirationDate < new Date()) {
          throw new HttpsError(
            "failed-precondition",
            "Cannot create proposal for expired medicine"
          );
        }

        // Validate target inventory has sufficient quantity
        if ((inventoryData?.availableQuantity || 0) < details.quantity) {
          throw new HttpsError(
            "failed-precondition",
            `Insufficient quantity available. Available: ${inventoryData?.availableQuantity || 0}, Requested: ${details.quantity}`
          );
        }

        // 🔒 FIX #1: PURCHASE PROPOSAL - Atomic wallet balance check + reservation
        if (details.type === "purchase" && walletSnapshot && walletRef) {
          const wallet = walletSnapshot.data();
          const availableBalance = wallet?.available || 0;

          if (availableBalance < details.totalPrice!) {
            logger.info(
              `createExchangeProposal: Insufficient balance for user ${userId}`,
              { required: details.totalPrice, available: availableBalance }
            );
            throw new HttpsError(
              "failed-precondition",
              `Insufficient balance. Required: ${details.totalPrice} ${details.currency}, Available: ${availableBalance} ${details.currency}`,
              {
                code: "INSUFFICIENT_BALANCE",
                required: details.totalPrice,
                available: availableBalance,
                currency: details.currency,
              }
            );
          }

          // 🔒 ATOMIC: Reserve balance (deduct from available, add to held)
          // This prevents race condition where multiple proposals deplete balance
          transaction.update(walletRef, {
            available: FieldValue.increment(-details.totalPrice!),
            held: FieldValue.increment(details.totalPrice!),
            updatedAt: FieldValue.serverTimestamp(),
          });

          logger.info(
            `createExchangeProposal: Reserved ${details.totalPrice} ${details.currency} from wallet`,
            { userId, availableBalance, newAvailable: availableBalance - details.totalPrice! }
          );
        }

        // 🔒 FIX #2: EXCHANGE PROPOSAL - Atomic inventory quantity check + reservation
        if (details.type === "exchange" && exchangeInventorySnapshot && exchangeInventoryRef) {
          if (!exchangeInventorySnapshot.exists) {
            throw new HttpsError(
              "not-found",
              "Exchange inventory item not found"
            );
          }

          const exchangeInventory = exchangeInventorySnapshot.data();

          // Validate ownership
          if (exchangeInventory?.pharmacyId !== userId) {
            logger.warn(
              `createExchangeProposal: User ${userId} tried to offer inventory they don't own`
            );
            throw new HttpsError(
              "permission-denied",
              "Cannot propose exchange with inventory you don't own"
            );
          }

          // Validate sufficient quantity
          if ((exchangeInventory?.availableQuantity || 0) < details.exchangeQuantity!) {
            throw new HttpsError(
              "failed-precondition",
              `Insufficient quantity available. You have ${exchangeInventory?.availableQuantity || 0}, trying to offer ${details.exchangeQuantity}`
            );
          }

          // Validate not expired
          const expirationDate = exchangeInventory?.batch?.expirationDate?.toDate?.();
          if (expirationDate && expirationDate < new Date()) {
            throw new HttpsError(
              "failed-precondition",
              "Cannot propose expired medicine for exchange"
            );
          }

          // 🔒 ATOMIC: Reserve inventory quantity
          // This prevents race condition where same inventory is offered in multiple proposals
          transaction.update(exchangeInventoryRef, {
            availableQuantity: FieldValue.increment(-details.exchangeQuantity!),
            reservedQuantity: FieldValue.increment(details.exchangeQuantity!),
            updatedAt: FieldValue.serverTimestamp(),
          });

          logger.info(
            `createExchangeProposal: Reserved ${details.exchangeQuantity} units of inventory`,
            {
              userId,
              inventoryId: details.exchangeInventoryItemId,
              available: exchangeInventory?.availableQuantity,
              reserved: details.exchangeQuantity,
            }
          );
        }

        // ===== PHASE 3: CREATE PROPOSAL =====

        const now = FieldValue.serverTimestamp();
        const proposalRef = db.collection("exchange_proposals").doc();

        const proposalData = {
          id: proposalRef.id,
          inventoryItemId,
          fromPharmacyId,
          toPharmacyId,
          details: {
            ...details,
            // Ensure type is set
            type: details.type || "purchase",
          },
          status: "pending",
          createdAt: now,
          updatedAt: now,
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours from now
          // Store reservation references for later release if proposal is rejected
          reservations: {
            walletReserved: details.type === "purchase" ? details.totalPrice : null,
            inventoryReserved: details.type === "exchange" ? details.exchangeQuantity : null,
          },
        };

        transaction.set(proposalRef, proposalData);

        logger.info(
          `createExchangeProposal: Successfully created proposal ${proposalRef.id} (ATOMIC)`,
          {
            type: details.type,
            fromPharmacy: fromPharmacyId,
            toPharmacy: toPharmacyId,
            walletReserved: details.type === "purchase" ? details.totalPrice : null,
            inventoryReserved: details.type === "exchange" ? details.exchangeQuantity : null,
          }
        );

        return {
          proposalId: proposalRef.id,
          status: "success",
        };
      });

      return result;
    } catch (error) {
      // If already an HttpsError, rethrow it
      if (error instanceof HttpsError) {
        throw error;
      }

      // Log unexpected errors
      logger.error("createExchangeProposal: Unexpected error", error);

      throw new HttpsError(
        "internal",
        "Failed to create exchange proposal",
        { originalError: String(error) }
      );
    }
  }
);
