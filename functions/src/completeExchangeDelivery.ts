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
import {
  assertSandboxAllowedForProject,
  isSandboxDemoCaller,
  isSandboxEnabled,
} from "./lib/sandboxGate.js";
import { getCountryDefaultCurrency } from "./lib/currencyResolver.js";
import { majorToWalletUnits } from "./lib/moneyUnits.js";

// Defence in depth: fail-fast at module load if SANDBOX_ENABLED slipped
// through to prod. Called BEFORE any handler runs — makes a bad deploy
// crash loudly instead of silently opening the courier bypass.
assertSandboxAllowedForProject();

const db = getFirestore();

interface CompleteDeliveryData {
  deliveryId: string;
  photoProofUrl?: string; // Optional photo proof of delivery
  /**
   * Optional full set of proof images. The client used to write this array
   * to the delivery document itself; that second write is gone (it produced
   * false "delivery failed" errors after a successful settlement), so the
   * array now travels through the callable and is persisted by the same
   * transaction. `photoProofUrl` is kept as the first image for legacy
   * readers.
   */
  proofImages?: unknown;
  deliveryNotes?: string; // Optional completion notes
  latitude?: number; // Optional delivery location verification
  longitude?: number;
}

/** Upper bound on stored proof images — a courier uploads a handful, not a roll. */
const MAX_PROOF_IMAGES = 10;

/**
 * Upper bound per entry. Not a URL-shape check — these references are not
 * guaranteed to be HTTPS URLs — just a size guard so ten arbitrarily long
 * strings cannot push the delivery document past Firestore's 1 MiB limit and
 * make the whole settlement transaction fail.
 */
const MAX_PROOF_IMAGE_LENGTH = 2048;

/**
 * Validates a client-supplied `proofImages` payload.
 *
 * Returns `null` when nothing usable was sent (field absent, empty array),
 * so the caller can leave the stored value untouched rather than writing an
 * empty array. Throws on a malformed payload instead of silently dropping
 * it: losing a delivery proof without saying so is how disputes become
 * unresolvable.
 */
export function validateProofImages(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) {
    throw new HttpsError("invalid-argument", "proofImages must be an array.");
  }
  if (raw.length > MAX_PROOF_IMAGES) {
    throw new HttpsError(
      "invalid-argument",
      `proofImages accepts at most ${MAX_PROOF_IMAGES} entries.`
    );
  }
  const cleaned = raw.map((entry, i) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new HttpsError(
        "invalid-argument",
        `proofImages[${i}] must be a non-empty string.`
      );
    }
    const trimmed = entry.trim();
    if (trimmed.length > MAX_PROOF_IMAGE_LENGTH) {
      throw new HttpsError(
        "invalid-argument",
        `proofImages[${i}] exceeds ${MAX_PROOF_IMAGE_LENGTH} characters.`
      );
    }
    return trimmed;
  });
  return cleaned.length > 0 ? cleaned : null;
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
    const proofImages = validateProofImages(data.proofImages);

    logger.info(
      `completeExchangeDelivery: Courier ${userId} completing delivery ${deliveryId}`,
      { photoProofUrl, deliveryNotes, proofImageCount: proofImages?.length ?? 0 }
    );

    // Delegates to the shared settlement core so the staging cockpit
    // (sandboxDeliveryAdvance) can drive the EXACT same path with no
    // duplication of financial logic.
    return completeDeliveryCore({
      deliveryId,
      userId,
      // Fall back to the first proof image so a client that sends only the
      // array still populates the legacy single-URL field.
      photoProofUrl: photoProofUrl ?? proofImages?.[0] ?? null,
      proofImages,
      deliveryNotes,
      latitude,
      longitude,
    });
  }
);

/**
 * Shared settlement core — single source of truth for delivery completion:
 * wallet settlement + ledger + inventory + status→delivered. Extracted
 * verbatim (behavior-preserving) from the callable so the staging cockpit
 * reuses the SAME transaction instead of duplicating financial writes.
 *
 * Exactly-once is enforced inside the transaction: a second call re-reads
 * status='delivered' and returns `{success:true, idempotent:true}` WITHOUT
 * performing a single write — it does not throw. It used to throw
 * `failed-precondition`, which made an interrupted client (settlement done,
 * confirmation lost) permanently unable to retry: the UI reported a payment
 * failure for money that had already moved. The financial guarantee is
 * unchanged — the settlement writes still run at most once — only the
 * outcome reported to a replay differs.
 *
 * Callers run this inside their own single runTransaction; it is never
 * nested.
 */
export async function completeDeliveryCore(args: {
  deliveryId: string;
  userId: string;
  photoProofUrl?: string | null;
  /** Already-validated proof images; `null`/absent leaves the stored value alone. */
  proofImages?: string[] | null;
  deliveryNotes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const { deliveryId, userId, photoProofUrl, proofImages, deliveryNotes, latitude, longitude } =
    args;

  // 🔒 ATOMIC TRANSACTION: Complete delivery + finalize payment + update inventory
  const result = await db.runTransaction(async (transaction) => {
      // ===== PHASE 1: READ DELIVERY AND PROPOSAL =====

      const deliveryRef = db.collection("deliveries").doc(deliveryId);
      const deliverySnapshot = await transaction.get(deliveryRef);

      if (!deliverySnapshot.exists) {
        throw new HttpsError("not-found", "Delivery not found");
      }

      const delivery = deliverySnapshot.data();

      // ------------------------------------------------------------------
      // Staging demo bypass (round-4 review fix P0#1). When SANDBOX_ENABLED
      // is set (staging only via .env.mediexchange-staging, gitignored) AND
      // the caller is one of the two pharmacies in the trade AND their email
      // is a `@promoshake.net` test account, we let them play the courier
      // role for the demo. Client-facing demos have no real courier — this
      // lets the pharmacy-side "Delivered" button drive the full settlement
      // transaction (wallet swap + inventory transfer) end-to-end.
      //
      // The gate is *orthogonal* to `courierId` : the pharmacy will typically
      // BECOME the courier through the "Pickup" button (which sets
      // `courierId = caller`), so requiring `courierId !== userId` here would
      // make the bypass never trigger on the real pickup→delivered chain —
      // and the standard courier settlement (fee split + buyer debit) would
      // silently run instead. Root cause of P0#1: previously the gate
      // included that predicate. It doesn't any more.
      //
      // In sandbox demo mode:
      //   - the courier-check is skipped (buyer/seller plays courier),
      //   - `status='pending'` is also accepted as a valid starting state
      //     (so the demo can go straight to `delivered` if the pickup step
      //     was skipped),
      //   - the courier-fee credit is skipped so the caller doesn't credit
      //     themselves, and the buyer's `halfBuyer` debit is also skipped
      //     so the trade balance stays whole and the seller receives the
      //     full `totalAmount`.
      // ------------------------------------------------------------------
      const buyerIdRaw = delivery?.fromPharmacyId as string | undefined;
      const sellerIdRaw = delivery?.toPharmacyId as string | undefined;
      const callerIsTradeParty =
        userId === buyerIdRaw || userId === sellerIdRaw;
      let sandboxDemoActive = false;
      // Only read the pharmacy doc + evaluate the sandbox gate when the env
      // flag is on AND the caller is one of the trade parties — spares an
      // extra Firestore read in the prod happy path (99.9% of invocations,
      // and prod never has SANDBOX_ENABLED anyway).
      if (isSandboxEnabled() && callerIsTradeParty) {
        const callerPharmacy = await transaction.get(
          db.collection("pharmacies").doc(userId)
        );
        const callerEmail = (callerPharmacy.data()?.email as string) ?? "";
        if (isSandboxDemoCaller({ email: callerEmail })) {
          sandboxDemoActive = true;
          logger.info(
            "completeExchangeDelivery: SANDBOX MODE — buyer/seller playing courier for demo",
            { deliveryId, callerUid: userId, callerEmail }
          );
        }
      }

      // Verify user is the assigned courier (skipped in sandbox demo mode)
      if (!sandboxDemoActive && delivery?.courierId !== userId) {
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

      // ===== IDEMPOTENT REPLAY =====
      // A delivery already marked `delivered` has been settled by a previous
      // call. Returning success here (instead of `failed-precondition`) is
      // what makes a retry safe: the client used to surface "Failed to
      // finalize delivery payment" for a trade whose money had in fact
      // already moved, and every subsequent retry failed the same way —
      // permanently, since the status can never leave `delivered`.
      //
      // This branch sits AFTER the courier/actor check above, so a replay
      // cannot be used by an unrelated caller to probe deliveries, and it
      // re-verifies the proposal linkage below for the same reason.
      // It performs NO write of any kind: no wallet, no ledger, no
      // inventory, no status. The delivery is left exactly as it is.
      if (delivery?.status === "delivered") {
        if (!delivery?.proposalId) {
          throw new HttpsError(
            "failed-precondition",
            "Delivery is not linked to a proposal"
          );
        }
        const settledProposalSnap = await transaction.get(
          db.collection("exchange_proposals").doc(delivery.proposalId)
        );
        if (!settledProposalSnap.exists) {
          throw new HttpsError("not-found", "Linked proposal not found");
        }
        const settledProposal = settledProposalSnap.data();
        const settledType = settledProposal?.details?.type;

        // `status === "delivered"` alone does NOT prove a settlement ran.
        // firestore.rules let the assigned courier write `status` directly,
        // so a delivery can read `delivered` while the proposal is still
        // `accepted`, the funds still sit in `deducted`, the inventory was
        // never transferred and no ledger exists. Answering "already
        // settled" there would launder a broken state into a success.
        //
        // We therefore require the full fingerprint that PHASE 4/5 below
        // writes, and only that combination. Every field checked here is
        // written by this same transaction, so they can only all be present
        // together if the canonical settlement actually ran:
        //   delivery : status=delivered + completedAt + paymentStatus
        //   proposal : status=completed + deliveryId pointing back to us
        // An absent or unrecognised type must NOT be treated as an exchange
        // by omission: that would pick `paymentStatus === "n/a"` as the
        // expected value and let a purchase whose payment never completed
        // pass the fingerprint. The type drives a financial expectation, so
        // it has to be one we actually understand.
        if (settledType !== "purchase" && settledType !== "exchange") {
          logger.error(
            "completeExchangeDelivery: replay on a proposal with an unknown type — refusing",
            {
              deliveryId,
              proposalId: delivery.proposalId,
              callerUid: userId,
              proposalType: settledType ?? null,
            }
          );
          throw new HttpsError(
            "failed-precondition",
            "Delivery state is inconsistent with settlement."
          );
        }

        const expectedPaymentStatus =
          settledType === "purchase" ? "paid" : "n/a";
        const settlementProven =
          delivery?.completedAt != null &&
          delivery?.paymentStatus === expectedPaymentStatus &&
          settledProposal?.status === "completed" &&
          settledProposal?.deliveryId === deliveryId;

        if (!settlementProven) {
          logger.error(
            "completeExchangeDelivery: delivery is 'delivered' but carries no settlement fingerprint — refusing",
            {
              deliveryId,
              proposalId: delivery.proposalId,
              callerUid: userId,
              hasCompletedAt: delivery?.completedAt != null,
              paymentStatus: delivery?.paymentStatus ?? null,
              expectedPaymentStatus,
              proposalStatus: settledProposal?.status ?? null,
              proposalDeliveryId: settledProposal?.deliveryId ?? null,
            }
          );
          // Deliberately NOT re-running the settlement: the state is
          // ambiguous, and replaying money movements from an unknown
          // starting point is worse than refusing. Needs manual triage.
          throw new HttpsError(
            "failed-precondition",
            "Delivery state is inconsistent with settlement."
          );
        }

        logger.info(
          "completeExchangeDelivery: replay on a proven-settled delivery — no write performed",
          { deliveryId, proposalId: delivery.proposalId, callerUid: userId }
        );

        return {
          success: true,
          // Tells the caller THIS invocation did no work. The flags below
          // describe the delivery's state (it IS settled), not this call,
          // and mirror exactly what the settlement itself returns — notably
          // `paymentProcessed` is false for a barter exchange.
          idempotent: true,
          deliveryId,
          proposalId: delivery.proposalId,
          status: "completed",
          paymentProcessed: settledType === "purchase",
          inventoryUpdated: true,
        };
      }

      // Verify delivery is in valid status. In sandbox demo mode we also
      // accept `pending` (no explicit pickup step required).
      const validStartStatuses = sandboxDemoActive
        ? ["pending", "picked_up", "in_transit"]
        : ["picked_up", "in_transit"];
      if (!validStartStatuses.includes(delivery?.status || "")) {
        logger.info(
          `completeExchangeDelivery: Cannot complete delivery with status ${delivery?.status}`,
          { deliveryId, currentStatus: delivery?.status, sandboxDemoActive }
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

      // Read all wallets + source inventories upfront (Firestore: all reads before first write).
      // Buyer pharmacy + sysconfig loaded too so we can resolve the operating
      // currency from countryCode instead of the historical `|| "XAF"` fallback
      // (see memory `project_currency_derived_from_country.md`, 2026-07-20).
      const readsToPerform: Promise<FirebaseFirestore.DocumentSnapshot>[] = [
        transaction.get(buyerWalletRef),
        transaction.get(courierWalletRef),
        transaction.get(db.collection("pharmacies").doc(buyerId)),
        transaction.get(db.collection("system_config").doc("main")),
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
      const buyerPharmacySnap = readResults[2];
      const sysConfigSnap = readResults[3];
      let readIdx = 4;
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
      // Cascade to determine the settlement currency :
      //   1. proposal.details.currency — set by client on purchase (canonical).
      //   2. delivery.currency — set by acceptExchangeProposal from sysconfig
      //      since commit c5715f60 (exchange path).
      //   3. Country default resolved from sysconfig + buyer's countryCode —
      //      catches legacy deliveries created before c5715f60.
      //   4. "XAF" only if EVERYTHING above is missing, and log a warning.
      const buyerCountryCode = (buyerPharmacySnap.data()?.countryCode as string | undefined) ?? null;
      const sysConfigData = sysConfigSnap.exists
        ? (sysConfigSnap.data() as Parameters<typeof getCountryDefaultCurrency>[0])
        : null;
      const countryDefaultCurrency = getCountryDefaultCurrency(sysConfigData, buyerCountryCode);
      const currency =
        (proposal?.details?.currency as string | undefined) ||
        (delivery.currency as string | undefined) ||
        countryDefaultCurrency ||
        "XAF";
      if (currency === "XAF" && !countryDefaultCurrency) {
        logger.warn(
          "completeExchangeDelivery: fell back to XAF — proposal, delivery and country config all missing currency",
          { deliveryId, buyerId, buyerCountryCode }
        );
      }

      if (proposal?.details?.type === "purchase" && proposal?.reservations?.walletReserved) {
        const totalAmount = proposal.reservations.walletReserved;
        // Seller receives: medicine price minus their courier fee share
        const sellerNetCredit = totalAmount - halfSeller;

        // Buyer and seller are pharmacies: their wallets store legacy
        // `major × 100`. Convert every buyer/seller amount at the wallet
        // boundary. The courier is a courier: its fee credit below stays raw
        // major and is NEVER routed through this conversion. Business docs
        // and ledgers keep major values.
        const totalAmountWU = majorToWalletUnits(totalAmount, "pharmacy");
        const halfBuyerWU = majorToWalletUnits(halfBuyer, "pharmacy");
        const sellerNetCreditWU = majorToWalletUnits(sellerNetCredit, "pharmacy");

        // Verify buyer has sufficient available balance for courier fee share
        if (halfBuyer > 0) {
          const buyerAvailable = buyerWalletSnap.data()?.available || 0;
          if (buyerAvailable < halfBuyerWU) {
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
          deducted: FieldValue.increment(-totalAmountWU),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Deduct buyer's courier fee share from available balance.
        // Skipped in sandbox demo mode: since we don't credit the courier
        // (see below), we must also not debit the buyer's share — otherwise
        // the trade "loses" the halfBuyer amount from the system.
        if (halfBuyer > 0 && !sandboxDemoActive) {
          transaction.update(buyerWalletRef, {
            available: FieldValue.increment(-halfBuyerWU),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        // Credit seller. In production this is `sellerNetCredit`
        // (= totalAmount − halfSeller courier share). In sandbox demo mode
        // the courier fee is neutral (no debit, no credit) so we pay the
        // seller the FULL `totalAmount` — the trade balance still ties out.
        transaction.update(sellerWalletRef, {
          available: FieldValue.increment(
            sandboxDemoActive ? totalAmountWU : sellerNetCreditWU
          ),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Credit courier wallet (create if needed). Always (re)set currency
        // so legacy wallets created with the wrong default are corrected.
        // Sandbox demo mode: `userId` here is the buyer OR the seller playing
        // the courier — crediting them the courier fee would be nonsensical
        // (they already sit on either side of the trade). Skip the credit;
        // the buyer's `halfBuyer` debit was likewise held back above.
        if (courierFee > 0 && !sandboxDemoActive) {
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
        // Only written when the caller actually sent images, so a completion
        // without proof does not erase images stored earlier in the journey.
        ...(proofImages ? { proofImages } : {}),
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
