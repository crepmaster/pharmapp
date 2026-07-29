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
import { assertLicenseAllowsMarketplace } from "./lib/licenseGate.js";
import { majorToWalletUnits } from "./lib/moneyUnits.js";
import {
  assertTradeCurrency,
  assertClientCurrencyMatches,
} from "./lib/tradeCurrencyGuard.js";
import {
  buildCanonicalProposalDocument,
  reserveExchangeInventory,
  type CanonicalExchangeDetails,
  type CanonicalExchangeInventorySnapshot,
  type CanonicalInventorySnapshot,
  type CanonicalPurchaseDetails,
} from "./lib/exchangePipeline.js";
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

    // 🔒 F-LICENSE GATE (Sprint 2a) — block unverified pharmacies in
    // license-required countries (outside grace period). Throws a generic
    // failed-precondition without leaking license status or country.
    await assertLicenseAllowsMarketplace(db, userId);

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

      // Load the seller pharmacy — territory (same country + city) is now
      // enforced by the Phase 2 trade-currency guard below (D3), which
      // supersedes the legacy city-only check: a same `cityCode` in two
      // different countries is refused, and two different XAF countries are
      // refused territorially even though the currency would match.
      const targetPharmacyDoc = await db.collection("pharmacies").doc(toPharmacyId).get();
      if (!targetPharmacyDoc.exists) {
        throw new HttpsError("not-found", "Target pharmacy not found");
      }

      // Support both flat fields (subscriptionStatus) and nested (subscription.status)
      const subStatus = pharmacyData?.subscriptionStatus ?? pharmacyData?.subscription?.status;
      const subEndDate = pharmacyData?.subscriptionEndDate ?? pharmacyData?.subscription?.endDate;

      const isActive = subStatus === "active" ||
                        pharmacyData?.subscription?.isActive === true;
      const isTrial = subStatus === "trial";
      const trialEndDate = subEndDate?.toDate?.();
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
            subscriptionStatus: subStatus || "none",
          }
        );
      }

      logger.info(
        `createExchangeProposal: Subscription validated for user ${userId}`,
        { isActive, isTrial, isTrialValid }
      );

      // Note: the pre-transaction pharmacy/subscription reads above are
      // ergonomic (fast-fail + subscription policy) only. The AUTHORITATIVE
      // monetary/territorial guard runs INSIDE the transaction below, on the
      // same snapshot as the hold/reservation — nothing (wallet, territory,
      // config) can change between check and write.

      // 🔒 ATOMIC TRANSACTION: Create proposal with balance/quantity reservation
      // This prevents race conditions where multiple proposals are created simultaneously
      const result = await db.runTransaction(async (transaction) => {
        // ===== PHASE 1: READ ALL DOCUMENTS (must read before any writes) =====

        // 🔒 PHASE 2 (G1–G6) — AUTHORITATIVE TRADE-CURRENCY GUARD, IN-TRANSACTION.
        // These reads share the transaction snapshot with the hold/reservation
        // writes below, closing the check→write race a pre-tx guard would leave
        // open. Reads both pharmacies (territory), system_config (country/currency)
        // and BOTH wallets (D4: must exist + match). All reads precede any write,
        // so a guard refusal aborts the tx with ZERO side effects.
        const walletRef = db.collection("wallets").doc(userId);
        const [
          buyerPharmTxSnap,
          sellerPharmTxSnap,
          sysConfigTxSnap,
          buyerWalletTxSnap,
          sellerWalletTxSnap,
        ] = await Promise.all([
          transaction.get(db.collection("pharmacies").doc(userId)),
          transaction.get(db.collection("pharmacies").doc(toPharmacyId)),
          transaction.get(db.collection("system_config").doc("main")),
          transaction.get(walletRef),
          transaction.get(db.collection("wallets").doc(toPharmacyId)),
        ]);
        const { currency: currencyCode } = assertTradeCurrency(
          {
            uid: userId,
            countryCode: buyerPharmTxSnap.data()?.countryCode,
            cityCode: buyerPharmTxSnap.data()?.cityCode ?? buyerPharmTxSnap.data()?.city,
            walletCurrency: buyerWalletTxSnap.data()?.currency,
          },
          {
            uid: toPharmacyId,
            countryCode: sellerPharmTxSnap.data()?.countryCode,
            cityCode: sellerPharmTxSnap.data()?.cityCode ?? sellerPharmTxSnap.data()?.city,
            walletCurrency: sellerWalletTxSnap.data()?.currency,
          },
          sysConfigTxSnap.exists ? sysConfigTxSnap.data() : undefined,
          "createExchangeProposal"
        );
        // Client-supplied currency (purchase only) is an ASSERTION: absent → ok,
        // identical → ok, different → typed refusal. Never silently replaced —
        // the persisted value is always the server-derived `currencyCode`.
        assertClientCurrencyMatches(
          details.type === "purchase" ? details.currency : undefined,
          currencyCode,
          "createExchangeProposal"
        );

        // For PURCHASE proposals: reuse the buyer wallet snapshot read above.
        let walletSnapshot;
        if (details.type === "purchase") {
          // Currency is server-derived (`currencyCode`) — the client value is
          // only an assertion, already checked above. Only `totalPrice` is
          // required from the client here.
          if (!details.totalPrice) {
            throw new HttpsError(
              "invalid-argument",
              "Purchase proposals require totalPrice."
            );
          }
          walletSnapshot = buyerWalletTxSnap;
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

        // Validate target inventory is published (availableForExchange)
        if (inventoryData?.availabilitySettings?.availableForExchange === false) {
          throw new HttpsError(
            "failed-precondition",
            "Target inventory item is not available for exchange"
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

        // Validate target inventory has sufficient quantity.
        //
        // Two distinct limits, and only the first was enforced:
        //   - availableQuantity   — what the seller physically holds;
        //   - maxExchangeQuantity — what the seller chose to OFFER on the
        //     marketplace when publishing (it may be a fraction of the stock).
        //
        // Ignoring the second meant a pharmacy publishing 15 of its 60 boxes
        // could still be asked for 60: the published quantity was collected,
        // stored, and then never read by anyone. The offer is the smaller of
        // the two, and it is checked HERE, inside the transaction, so two
        // concurrent proposals cannot both pass on the same units.
        const physicallyAvailable = (inventoryData?.availableQuantity as number) || 0;
        const publishedLimitRaw =
          inventoryData?.availabilitySettings?.maxExchangeQuantity;
        // A published item without a usable limit falls back to its stock:
        // legacy documents predate the field, and refusing them would break
        // items that are legitimately offered in full.
        const publishedLimit =
          typeof publishedLimitRaw === "number" && publishedLimitRaw > 0
            ? publishedLimitRaw
            : physicallyAvailable;
        const offerable = Math.min(physicallyAvailable, publishedLimit);

        if (offerable < details.quantity) {
          throw new HttpsError(
            "failed-precondition",
            `Insufficient quantity available. Offered: ${offerable}, Requested: ${details.quantity}`,
            {
              code: "QUANTITY_EXCEEDS_OFFER",
              offered: offerable,
              requested: details.quantity,
            }
          );
        }

        // 🔒 FIX #1: PURCHASE PROPOSAL - Atomic wallet balance check + reservation
        if (details.type === "purchase" && walletSnapshot && walletRef) {
          const wallet = walletSnapshot.data();
          const availableBalance = wallet?.available || 0;

          // The buyer is a pharmacy; its wallet stores legacy `major × 100`
          // units. `totalPrice` is major, so BOTH the balance check and the
          // reservation must convert it — comparing/moving the same unit as
          // the stored balance. The ledger `amount` below stays in major.
          const reservedWalletUnits = majorToWalletUnits(details.totalPrice!, "pharmacy");

          if (availableBalance < reservedWalletUnits) {
            logger.info(
              `createExchangeProposal: Insufficient balance for user ${userId}`,
              { required: details.totalPrice, available: availableBalance }
            );
            throw new HttpsError(
              "failed-precondition",
              `Insufficient balance. Required: ${details.totalPrice} ${currencyCode}, Available: ${availableBalance} ${currencyCode}`,
              {
                code: "INSUFFICIENT_BALANCE",
                required: details.totalPrice,
                available: availableBalance,
                currency: currencyCode,
              }
            );
          }

          // 🔒 ATOMIC: Reserve balance (deduct from available, add to held)
          // This prevents race condition where multiple proposals deplete balance
          transaction.update(walletRef, {
            available: FieldValue.increment(-reservedWalletUnits),
            held: FieldValue.increment(reservedWalletUnits),
            updatedAt: FieldValue.serverTimestamp(),
          });

          logger.info(
            `createExchangeProposal: Reserved ${details.totalPrice} ${currencyCode} from wallet`,
            { userId, availableBalance, reservedWalletUnits }
          );

        }

        // 🔒 EXCHANGE PROPOSAL — canonical reservation via shared helper.
        // Sprint 4 Finding 1 fix (post-livraison) : route the inline hold
        // through `reserveExchangeInventory` so both producers of
        // `exchange_proposals` (createExchangeProposal + the medicine-
        // request bridge) enforce the same `medicineId` match, ownership,
        // expiry, and atomic write. Dosage/form are skipped here because
        // this legacy input contract does not carry them on the exchange
        // leg — the helper accepts missing dosage/form as "skip check"
        // (medicine_request always provides them).
        let exchangeInventorySnapshotCanonical: CanonicalExchangeInventorySnapshot | null = null;
        if (details.type === "exchange" && exchangeInventorySnapshot) {
          const reservation = reserveExchangeInventory(transaction, {
            inventorySnap: exchangeInventorySnapshot,
            expectedOwnerUid: userId,
            expectedMedicineId: details.exchangeMedicineId!,
            requiredQuantity: details.exchangeQuantity!,
            now: new Date(),
          });
          exchangeInventorySnapshotCanonical = reservation.snapshot;

          logger.info(
            `createExchangeProposal: Reserved ${details.exchangeQuantity} units of inventory (canonical helper)`,
            {
              userId,
              inventoryId: details.exchangeInventoryItemId,
              reserved: details.exchangeQuantity,
            }
          );
        }

        // ===== PHASE 3: CREATE PROPOSAL (canonical pipeline — Sprint 4) =====

        const now = FieldValue.serverTimestamp();
        const proposalRef = db.collection("exchange_proposals").doc();

        const inventorySnapshotCanonical: CanonicalInventorySnapshot = {
          medicineId: inventoryData?.medicineId || null,
          medicineName: inventoryData?.medicine?.name || inventoryData?.medicineName || null,
          genericName: inventoryData?.medicine?.genericName || null,
          strength: inventoryData?.medicine?.strength || null,
          form: inventoryData?.medicine?.form || null,
          category: inventoryData?.medicine?.category || null,
          packaging: inventoryData?.packaging || null,
          lotNumber: inventoryData?.batch?.lotNumber || inventoryData?.batchNumber || null,
          expirationDate: inventoryData?.batch?.expirationDate || null,
          availableQuantityAtOffer: inventoryData?.availableQuantity || 0,
        };

        // Build the canonical details, preserving all incoming fields
        // (notes, currency, etc.) that the pipeline contract carries.
        let canonicalDetails: CanonicalPurchaseDetails | CanonicalExchangeDetails;
        if (details.type === "purchase") {
          canonicalDetails = {
            type: "purchase",
            quantity: details.quantity,
            unitPrice: details.pricePerUnit ?? 0,
            totalPrice: details.totalPrice!,
            // Legacy mirror of the top-level `currencyCode` — server-derived,
            // never the client value; must never diverge from `currencyCode`.
            currency: currencyCode,
            medicineName: inventorySnapshotCanonical.medicineName,
            medicineId: inventorySnapshotCanonical.medicineId,
            // Firestore rejects `undefined`. When the client omits `notes`
            // entirely (current create_proposal_screen contract) the field
            // is undefined here — coerce to empty string so the doc write
            // succeeds. Downstream reads should treat "" the same as
            // "no notes provided".
            notes: details.notes ?? "",
          };
        } else {
          // Sprint 4 Finding 1 + 2 (post-livraison) fix — snapshot built
          // by `reserveExchangeInventory` above. Both producers
          // (createExchangeProposal and the medicine-request bridge) now
          // share the same builder and the same `CanonicalExchangeInventorySnapshot`
          // shape — no inline divergence possible.
          if (!exchangeInventorySnapshotCanonical) {
            // Defensive: should never happen because the if/else above
            // requires details.type === "exchange" which guarantees the
            // reservation block ran. But TypeScript needs the narrowing.
            throw new HttpsError(
              "internal",
              "exchangeInventorySnapshot not initialized for exchange proposal"
            );
          }
          canonicalDetails = {
            type: "exchange",
            quantity: details.quantity,
            medicineName: inventorySnapshotCanonical.medicineName,
            medicineId: inventorySnapshotCanonical.medicineId,
            exchangeInventoryItemId: details.exchangeInventoryItemId!,
            exchangeMedicineId: details.exchangeMedicineId!,
            exchangeQuantity: details.exchangeQuantity!,
            exchangeInventorySnapshot: exchangeInventorySnapshotCanonical,
            // Same undefined→"" coercion as the purchase branch above.
            notes: details.notes ?? "",
          };
        }

        const proposalData = buildCanonicalProposalDocument(
          {
            proposalId: proposalRef.id,
            inventoryItemId,
            fromPharmacyId,
            toPharmacyId,
            currencyCode,
            details: canonicalDetails,
            initialStatus: "pending",
            inventorySnapshot: inventorySnapshotCanonical,
          },
          now
        );

        transaction.set(proposalRef, proposalData);

        // Ledger: record the wallet hold event (after proposalRef is available).
        // Currency is the server-derived `currencyCode` (Phase 2), never the
        // client value.
        if (details.type === "purchase" && details.totalPrice) {
          const holdLedgerRef = db.collection("ledger").doc();
          transaction.set(holdLedgerRef, {
            type: "proposal_wallet_hold_created",
            proposalId: proposalRef.id,
            userId,
            amount: details.totalPrice,
            currency: currencyCode,
            from: "available",
            to: "held",
            description: "Wallet balance reserved for purchase proposal",
            createdAt: FieldValue.serverTimestamp(),
          });
        }

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
