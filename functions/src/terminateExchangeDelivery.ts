/**
 * terminateExchangeDelivery — Lot 2.
 *
 * Ends an accepted-but-undelivered exchange delivery and RESTORES every
 * commitment it holds, atomically.
 *
 * Why this exists
 * ---------------
 * Before this callable, a courier failing or cancelling a delivery produced
 * a silent inter-document divergence. `DeliveryService` called
 * `cancelExchangeProposal`, which only ever accepted `pending` proposals —
 * so after acceptance the call ALWAYS failed. The client then fell back to
 * writing the proposal directly, a write the rules deny to a courier, and
 * that failure was swallowed by an outer `catch (_)`. Net result: the
 * delivery read `failed`, the proposal stayed `accepted`, the buyer's money
 * stayed in `deducted` and the reserved stock stayed reserved — with no
 * error surfaced anywhere and nothing to reconcile from.
 *
 * Product decision for this lot: a failed delivery cancels the trade and
 * refunds in full. There is no courier reassignment path today, and adding
 * one here would widen the change surface.
 *
 * Contract
 * --------
 *   caller           the assigned courier (`delivery.courierId`)
 *   start statuses   accepted | picked_up | in_transit
 *   proposal         MUST be `accepted`, MUST point back at this delivery
 *   atomicity        one transaction, all reads before any write
 *   idempotence      a replay of a fully-compensated terminal state returns
 *                    success with zero writes; a PARTIAL terminal state is
 *                    refused for manual audit — never compensated twice
 *
 * `pending` is deliberately NOT a valid start: a pending delivery has no
 * assigned courier, so a courier-only callable seeing one is looking at an
 * inconsistent state, not at a legitimate cancellation. `assigned` is not
 * accepted either — no producer in this codebase ever writes it (the only
 * trace is an aspirational comment in acceptExchangeProposal), so honouring
 * it would mean coding against a state that does not exist.
 *
 * Compensation (mirrors exactly what acceptExchangeProposal committed):
 *
 *   purchase   wallet.deducted  -= majorToWalletUnits(walletReserved)
 *              wallet.available += majorToWalletUnits(walletReserved)
 *
 *   exchange   inventory.reservedQuantity  -= inventoryReserved
 *              inventory.availableQuantity += inventoryReserved
 *
 * Two units traps this code exists to avoid:
 *   - `reservations.walletReserved` is in MAJOR units, the wallet stores
 *     `major × 100` for a pharmacy owner. Refunding the raw value would
 *     return 1/100th of what was taken.
 *   - the inventory hold for an exchange sits on the PROPOSER's offered
 *     item (`details.exchangeInventoryItemId`), never on the seller's root
 *     `inventoryItemId` (which is only decremented at settlement). Crediting
 *     the root item would mint stock for the seller AND leave the proposer's
 *     hold stuck.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { majorToWalletUnits } from "./lib/moneyUnits.js";

const db = getFirestore();

/** Schema version of the compensation markers written below. */
export const COMPENSATION_VERSION = 1;

/** Statuses a delivery may be terminated FROM. Anything else is refused. */
export const TERMINABLE_STATUSES: readonly string[] = [
  "accepted",
  "picked_up",
  "in_transit",
];

/** Terminal outcomes this callable can produce. */
export type TerminationOutcome = "failed" | "cancelled";

interface TerminateDeliveryData {
  deliveryId: string;
  outcome: string;
  reason?: string;
}

/**
 * Deterministic ledger id. Makes the compensation entry itself part of the
 * idempotence fingerprint: a replay can observe that the entry already
 * exists instead of appending a second one, and a partially-applied state
 * is detectable because the entry is missing.
 */
export function compensationLedgerId(deliveryId: string): string {
  return `delivery_compensation_${deliveryId}`;
}

/** Narrows and validates the client-supplied outcome. */
export function assertOutcome(raw: unknown): TerminationOutcome {
  if (raw === "failed" || raw === "cancelled") return raw;
  throw new HttpsError(
    "invalid-argument",
    "outcome must be 'failed' or 'cancelled'."
  );
}

export const terminateExchangeDelivery = onCall<TerminateDeliveryData>(
  { region: "europe-west1", cors: true },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to terminate a delivery."
      );
    }

    const data = request.data;
    if (!data?.deliveryId || typeof data.deliveryId !== "string") {
      throw new HttpsError("invalid-argument", "deliveryId is required.");
    }
    const outcome = assertOutcome(data.outcome);
    const reason =
      typeof data.reason === "string" && data.reason.trim().length > 0
        ? data.reason.trim().slice(0, 500)
        : "";

    const deliveryId = data.deliveryId;

    return db.runTransaction(async (transaction) => {
      // ===================================================================
      // PHASE 1: ALL READS (Firestore requires reads before writes)
      // ===================================================================

      const deliveryRef = db.collection("deliveries").doc(deliveryId);
      const deliverySnap = await transaction.get(deliveryRef);
      if (!deliverySnap.exists) {
        throw new HttpsError("not-found", "Delivery not found.");
      }
      const delivery = deliverySnap.data()!;

      // Authorization first: everything below leaks state about the trade.
      if (delivery.courierId !== userId) {
        logger.warn("terminateExchangeDelivery: caller is not the assigned courier", {
          deliveryId,
          callerUid: userId,
        });
        throw new HttpsError(
          "permission-denied",
          "Only the assigned courier can terminate this delivery."
        );
      }

      const proposalId = delivery.proposalId as string | undefined;
      if (!proposalId) {
        throw new HttpsError(
          "failed-precondition",
          "Delivery is not linked to a proposal."
        );
      }
      const proposalRef = db.collection("exchange_proposals").doc(proposalId);
      const proposalSnap = await transaction.get(proposalRef);
      if (!proposalSnap.exists) {
        throw new HttpsError("not-found", "Linked proposal not found.");
      }
      const proposal = proposalSnap.data()!;

      // Reciprocal link — the proposal must point back at THIS delivery, so
      // a delivery cannot compensate a proposal that belongs to another one.
      if (proposal.deliveryId !== deliveryId) {
        logger.error("terminateExchangeDelivery: proposal is linked to another delivery", {
          deliveryId,
          proposalId,
          proposalDeliveryId: proposal.deliveryId ?? null,
        });
        throw new HttpsError(
          "failed-precondition",
          "Delivery and proposal are not reciprocally linked."
        );
      }

      const ledgerRef = db
        .collection("ledger")
        .doc(compensationLedgerId(deliveryId));
      const ledgerSnap = await transaction.get(ledgerRef);

      const proposalType = proposal.details?.type;
      if (proposalType !== "purchase" && proposalType !== "exchange") {
        throw new HttpsError(
          "failed-precondition",
          "Linked proposal has an unknown type; cannot compensate."
        );
      }

      const walletReservedMajor = proposal.reservations?.walletReserved as
        | number
        | null
        | undefined;
      const inventoryReserved = proposal.reservations?.inventoryReserved as
        | number
        | null
        | undefined;

      // ===================================================================
      // IDEMPOTENT REPLAY
      // ===================================================================
      // A terminal delivery is only safe to report as "already compensated"
      // when the FULL fingerprint is present. The status alone proves
      // nothing: firestore.rules currently let the assigned courier write
      // `status` directly, and an older partial write could have left some
      // of these fields set. Anything less than the complete set means the
      // state is ambiguous — we refuse and ask for a human, rather than
      // risk refunding twice.
      const isTerminal =
        delivery.status === "failed" || delivery.status === "cancelled";
      if (isTerminal) {
        // The ledger entry must PROVE it is our compensation, not merely
        // occupy the id. A pre-existing or malformed document sitting at
        // `delivery_compensation_{id}` would otherwise pass as evidence that
        // money was given back.
        const ledger = ledgerSnap.data();
        const ledgerProvesCompensation =
          ledgerSnap.exists &&
          ledger?.type === "delivery_compensation" &&
          ledger?.deliveryId === deliveryId &&
          ledger?.proposalId === proposalId &&
          ledger?.compensationVersion === COMPENSATION_VERSION &&
          ledger?.outcome === delivery.status;

        const fingerprintComplete =
          proposal.status === "cancelled" &&
          proposal.reservations == null &&
          delivery.compensationStatus === "completed" &&
          delivery.compensatedAt != null &&
          delivery.compensationVersion === COMPENSATION_VERSION &&
          proposal.compensatedAt != null &&
          proposal.compensationVersion === COMPENSATION_VERSION &&
          ledgerProvesCompensation;

        if (!fingerprintComplete) {
          logger.error(
            "terminateExchangeDelivery: terminal delivery without a complete compensation fingerprint — refusing",
            {
              deliveryId,
              proposalId,
              deliveryStatus: delivery.status,
              proposalStatus: proposal.status ?? null,
              reservationsCleared: proposal.reservations == null,
              compensationStatus: delivery.compensationStatus ?? null,
              deliveryCompensatedAt: delivery.compensatedAt != null,
              proposalCompensatedAt: proposal.compensatedAt != null,
              ledgerExists: ledgerSnap.exists,
              ledgerProvesCompensation,
            }
          );
          throw new HttpsError(
            "failed-precondition",
            "Delivery is terminal but its compensation is incomplete; manual audit required."
          );
        }

        logger.info(
          "terminateExchangeDelivery: replay on a fully compensated delivery — no write performed",
          { deliveryId, proposalId, callerUid: userId }
        );
        return {
          success: true,
          idempotent: true,
          deliveryId,
          proposalId,
          outcome: delivery.status as TerminationOutcome,
          compensated: proposalType === "purchase" ? "wallet" : "inventory",
        };
      }

      // ===================================================================
      // PRECONDITIONS (non-terminal path)
      // ===================================================================

      if (!TERMINABLE_STATUSES.includes(delivery.status)) {
        throw new HttpsError(
          "failed-precondition",
          `Cannot terminate a delivery with status '${delivery.status}'. ` +
            `Allowed: ${TERMINABLE_STATUSES.join(", ")}.`
        );
      }

      // A `delivered` delivery is already settled; compensating it would
      // undo a legitimate settlement. It is excluded by the list above, and
      // this is the reason why.
      if (proposal.status !== "accepted") {
        throw new HttpsError(
          "failed-precondition",
          `Linked proposal is '${proposal.status}', not 'accepted'.`
        );
      }

      // ===================================================================
      // PHASE 2: COMPENSATION READS + GUARDS
      // ===================================================================

      let walletRef: FirebaseFirestore.DocumentReference | null = null;
      let reservedWalletUnits = 0;
      let inventoryRef: FirebaseFirestore.DocumentReference | null = null;
      let releaseQuantity = 0;

      if (proposalType === "purchase") {
        if (typeof walletReservedMajor !== "number" || walletReservedMajor <= 0) {
          throw new HttpsError(
            "failed-precondition",
            "Purchase proposal carries no wallet reservation to refund."
          );
        }
        // MAJOR → wallet units. `acceptExchangeProposal` moved this exact
        // converted amount from `held` to `deducted`; we move it back.
        reservedWalletUnits = majorToWalletUnits(walletReservedMajor, "pharmacy");

        walletRef = db.collection("wallets").doc(proposal.fromPharmacyId);
        const walletSnap = await transaction.get(walletRef);
        if (!walletSnap.exists) {
          throw new HttpsError("not-found", "Buyer wallet not found.");
        }
        const deducted = Number(walletSnap.data()?.deducted ?? 0);
        // Never produce a negative balance: if `deducted` does not actually
        // hold what we are about to give back, the two documents disagree
        // and a blind decrement would invent money.
        if (!Number.isFinite(deducted) || deducted < reservedWalletUnits) {
          logger.error("terminateExchangeDelivery: wallet.deducted is below the reserved amount", {
            deliveryId,
            proposalId,
            deducted,
            reservedWalletUnits,
          });
          throw new HttpsError(
            "failed-precondition",
            "Wallet does not hold the reserved amount; refusing to refund."
          );
        }
      } else {
        if (typeof inventoryReserved !== "number" || inventoryReserved <= 0) {
          throw new HttpsError(
            "failed-precondition",
            "Exchange proposal carries no inventory reservation to release."
          );
        }
        // The hold is on the PROPOSER's offered item, not the seller's root
        // item — see the header note. Getting this wrong corrupts stock.
        const heldItemId = proposal.details?.exchangeInventoryItemId as
          | string
          | undefined;
        if (!heldItemId) {
          throw new HttpsError(
            "failed-precondition",
            "Exchange proposal has no exchangeInventoryItemId; cannot release stock."
          );
        }
        releaseQuantity = inventoryReserved;
        inventoryRef = db.collection("pharmacy_inventory").doc(heldItemId);
        const inventorySnap = await transaction.get(inventoryRef);
        if (!inventorySnap.exists) {
          throw new HttpsError("not-found", "Reserved inventory item not found.");
        }
        const reservedQuantity = Number(
          inventorySnap.data()?.reservedQuantity ?? 0
        );
        if (!Number.isFinite(reservedQuantity) || reservedQuantity < releaseQuantity) {
          logger.error(
            "terminateExchangeDelivery: inventory.reservedQuantity is below the reserved amount",
            { deliveryId, proposalId, reservedQuantity, releaseQuantity }
          );
          throw new HttpsError(
            "failed-precondition",
            "Inventory does not hold the reserved quantity; refusing to release."
          );
        }
      }

      // ===================================================================
      // PHASE 3: WRITES (single transaction, nothing above this line wrote)
      // ===================================================================

      const now = FieldValue.serverTimestamp();

      if (proposalType === "purchase" && walletRef) {
        transaction.update(walletRef, {
          deducted: FieldValue.increment(-reservedWalletUnits),
          available: FieldValue.increment(reservedWalletUnits),
          updatedAt: now,
        });
      } else if (inventoryRef) {
        transaction.update(inventoryRef, {
          reservedQuantity: FieldValue.increment(-releaseQuantity),
          availableQuantity: FieldValue.increment(releaseQuantity),
          updatedAt: now,
        });
      }

      transaction.update(proposalRef, {
        status: "cancelled",
        reservations: null,
        cancelReason: reason,
        compensatedAt: now,
        compensationVersion: COMPENSATION_VERSION,
        updatedAt: now,
      });

      transaction.update(deliveryRef, {
        status: outcome,
        ...(outcome === "failed"
          ? { failureReason: reason }
          : { cancellationReason: reason }),
        paymentStatus: proposalType === "purchase" ? "refunded" : "n/a",
        compensationStatus: "completed",
        compensatedAt: now,
        compensationVersion: COMPENSATION_VERSION,
        updatedAt: now,
      });

      // Deterministic id: a retry that somehow reached this point would
      // overwrite the same document instead of appending a second entry.
      transaction.set(ledgerRef, {
        type: "delivery_compensation",
        deliveryId,
        proposalId,
        outcome,
        reason,
        proposalType,
        // Amounts are recorded in the unit each side actually uses, named
        // explicitly so a reader never has to guess.
        walletUnitsRestored:
          proposalType === "purchase" ? reservedWalletUnits : null,
        amountMajor: proposalType === "purchase" ? walletReservedMajor : null,
        currency: proposal.details?.currency ?? null,
        inventoryQuantityReleased:
          proposalType === "exchange" ? releaseQuantity : null,
        inventoryItemId:
          proposalType === "exchange"
            ? proposal.details?.exchangeInventoryItemId
            : null,
        beneficiaryId:
          proposalType === "purchase"
            ? proposal.fromPharmacyId
            : proposal.fromPharmacyId,
        terminatedBy: userId,
        compensationVersion: COMPENSATION_VERSION,
        createdAt: now,
      });

      logger.info("terminateExchangeDelivery: delivery terminated and commitments restored", {
        deliveryId,
        proposalId,
        outcome,
        proposalType,
        callerUid: userId,
      });

      return {
        success: true,
        idempotent: false,
        deliveryId,
        proposalId,
        outcome,
        compensated: proposalType === "purchase" ? "wallet" : "inventory",
      };
    });
  }
);
