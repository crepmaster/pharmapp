/**
 * sandboxDeliveryAdvance — staging demo helper (manual delivery progression).
 *
 * Lets a trade party (buyer or seller playing courier) drive a delivery
 * through a manual, GPS-free progression during a staging demo. Two states
 * are tracked and MUST NOT be conflated:
 *
 *   1. `delivery.status` — the CANONICAL business state (pending → picked_up
 *      → delivered). It remains the source of authority for pickup and final
 *      settlement. This file never duplicates settlement logic.
 *
 *   2. `delivery.sandboxJourney` — staging logistics progression. For a
 *      version-1 physical exchange, its completed return phase and both
 *      `stockTransit` receipts are required before canonical settlement.
 *
 * NOTE: this is a staging manual delivery controller, NOT the definitive
 * courier cockpit, but the assigned courier CAN now drive it from its own
 * screen: identity accepts `pharmacies/{uid}` or `couriers/{uid}`, and the
 * account-domain requirement is not applied here (see the gate comment) so
 * the payment and settlement bypasses are unaffected.
 *
 * Journey schema (version 1):
 *   {
 *     version: 1,
 *     outboundPhase: assigned | en_route_to_pickup | picked_up
 *                    | en_route_to_dropoff | delivered,
 *     returnRequired: boolean,
 *     returnPhase: not_required | awaiting_return | en_route_to_return_pickup
 *                  | return_picked_up | en_route_to_return_dropoff
 *                  | return_delivered,
 *     updatedAt: Timestamp,
 *     updatedBy: string,
 *   }
 *
 * Canonical integration:
 *   - `confirm_pickup`   reuses the canonical pickup transition
 *     (pending → picked_up + courierId), never a copy.
 *   - Purchase/legacy `confirm_delivered` settles through
 *     `completeDeliveryCore`. For a version-1 physical exchange it records
 *     the outbound receipt without settling; `confirm_return_delivered`
 *     records the reciprocal receipt, then calls the same exactly-once core.
 *   - Other journey actions never move wallets or ledger entries.
 *
 * 🔒 Gated (all required): SANDBOX_ENABLED env, assertSandboxAllowedForProject
 * at module load, authenticated caller, an existing pharmacy OR courier
 * account carrying an email, and caller ∈ {buyer, seller, assigned courier} (see assertCockpitCaller for the
 * two distinct modes). Client-sent courierId/status/currency/amounts are
 * never trusted.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  assertSandboxAllowedForProject,
  isSandboxEnabled,
} from "./lib/sandboxGate.js";
import { completeDeliveryCore } from "./completeExchangeDelivery.js";

// Defence in depth: fail-fast at module load if SANDBOX_ENABLED slipped
// through to prod.
assertSandboxAllowedForProject();

const db = getFirestore();

export const SANDBOX_JOURNEY_VERSION = 1;

/** Ordered outbound phases (index = progression rank). */
export const OUTBOUND_PHASES = [
  "assigned",
  "en_route_to_pickup",
  "picked_up",
  "en_route_to_dropoff",
  "delivered",
] as const;
export type OutboundPhase = (typeof OUTBOUND_PHASES)[number];

/** Ordered return phases (index = progression rank; not_required is inert). */
export const RETURN_PHASES = [
  "awaiting_return",
  "en_route_to_return_pickup",
  "return_picked_up",
  "en_route_to_return_dropoff",
  "return_delivered",
] as const;
export type ReturnPhase = "not_required" | (typeof RETURN_PHASES)[number];

/** Statuses from which a demo delivery may be reset back to `pending`. */
export const RESET_ALLOWED_FROM_STATUSES: readonly string[] = [
  "failed",
  "cancelled",
];

/**
 * Journey-only outbound transitions (no canonical/financial side effect).
 * confirm_pickup / confirm_delivered are handled separately because they
 * carry a canonical side effect.
 */
const OUTBOUND_JOURNEY_ONLY: Record<string, { from: OutboundPhase; to: OutboundPhase }> = {
  start_pickup: { from: "assigned", to: "en_route_to_pickup" },
  start_delivery: { from: "picked_up", to: "en_route_to_dropoff" },
};

/** Return transitions; receipt and settlement are handled at their boundaries. */
const RETURN_JOURNEY_ONLY: Record<string, { from: ReturnPhase; to: ReturnPhase }> = {
  start_return_pickup: { from: "awaiting_return", to: "en_route_to_return_pickup" },
  confirm_return_pickup: { from: "en_route_to_return_pickup", to: "return_picked_up" },
  start_return_delivery: { from: "return_picked_up", to: "en_route_to_return_dropoff" },
  confirm_return_delivered: { from: "en_route_to_return_dropoff", to: "return_delivered" },
};

const ALL_ACTIONS = new Set<string>([
  // legacy (preserved)
  "pickup",
  "reset",
  // outbound
  "start_pickup",
  "confirm_pickup",
  "start_delivery",
  "confirm_delivered",
  // return
  ...Object.keys(RETURN_JOURNEY_ONLY),
]);

interface AdvanceInput {
  deliveryId?: string;
  action?: string;
}

interface DeliveryData {
  status?: string;
  proposalType?: string;
  fromPharmacyId?: string;
  toPharmacyId?: string;
  courierId?: string;
  proposalId?: string;
  sandboxJourney?: {
    version?: number;
    outboundPhase?: OutboundPhase;
    returnRequired?: boolean;
    returnPhase?: ReturnPhase;
  };
  stockTransit?: {
    version?: number;
    outbound?: { state?: string };
    return?: { state?: string };
  };
}

/** Synthesize the outbound phase from canonical status when no journey exists. */
function outboundFromStatus(status: string): OutboundPhase {
  if (status === "picked_up" || status === "in_transit") return "picked_up";
  if (status === "delivered" || status === "completed") return "delivered";
  return "assigned";
}

function returnRank(p: ReturnPhase): number {
  return p === "not_required" ? -1 : RETURN_PHASES.indexOf(p);
}

/** Build the persisted journey object for a write. */
function journeyDoc(
  outboundPhase: OutboundPhase,
  returnRequired: boolean,
  returnPhase: ReturnPhase,
  userId: string
) {
  return {
    version: SANDBOX_JOURNEY_VERSION,
    outboundPhase,
    returnRequired,
    returnPhase,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: userId,
  };
}

export const sandboxDeliveryAdvance = onCall<AdvanceInput>(
  { region: "europe-west1", cors: true },
  async (request) => {
    // ---- Gate stack (unchanged guarantees) --------------------------------
    if (!isSandboxEnabled()) {
      throw new HttpsError(
        "failed-precondition",
        "Sandbox delivery advance is disabled outside the staging environment."
      );
    }

    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { deliveryId, action } = request.data ?? {};
    if (!deliveryId || typeof deliveryId !== "string") {
      throw new HttpsError("invalid-argument", "deliveryId is required.");
    }
    if (!action || !ALL_ACTIONS.has(action)) {
      throw new HttpsError(
        "invalid-argument",
        `Unknown action '${action ?? ""}'. Allowed: ${[...ALL_ACTIONS].join(", ")}.`
      );
    }

    // Caller must own a recognised sandbox account — pharmacy OR courier.
    //
    // Consulting `pharmacies/{uid}` alone refused every courier before
    // `assertCockpitCaller` could even run, even though that check accepts
    // the assigned courier. Since the delivery timeline is driven from the
    // COURIER's own screen, that lookup was the thing preventing it.
    //
    // The account-domain requirement is deliberately NOT applied here. This
    // gate is scoped to this callable so it cannot widen the payment or
    // settlement bypasses that share `isSandboxAccountEmail`: relaxing that
    // shared helper would also have let any account skip MTN/Paystack and
    // take the sandbox settlement path. What still restricts this callable:
    //   - `assertSandboxAllowedForProject()` at module load (staging only);
    //   - `SANDBOX_ENABLED`, present only on the staging env file;
    //   - an existing pharmacy/courier document with a non-empty email;
    //   - `assertCockpitCaller` — the caller must be a party to THIS delivery.
    //
    // Read outside the tx: identity cannot change during a call, and a stale
    // read cannot escalate — the delivery-party check runs inside.
    const callerEmail = await resolveSandboxCallerEmail(userId);
    if (callerEmail === null) {
      throw new HttpsError(
        "permission-denied",
        "Sandbox delivery advance requires a pharmacy or courier account."
      );
    }
    if (callerEmail.length === 0) {
      // An account row with no email is a half-provisioned record, not a
      // usable test identity.
      throw new HttpsError(
        "permission-denied",
        "Sandbox delivery advance requires an account with an email."
      );
    }

    const deliveryRef = db.collection("deliveries").doc(deliveryId);

    // ---- Legacy actions (preserved contract) ------------------------------
    if (action === "pickup" || action === "reset") {
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(deliveryRef);
        if (!snap.exists) throw new HttpsError("not-found", "Delivery not found.");
        const delivery = (snap.data() ?? {}) as DeliveryData;
        assertCockpitCaller(userId, delivery);
        const currentStatus = delivery.status || "";
        if (delivery.stockTransit?.version === 1 ||
            (action === "reset" && delivery.proposalId)) {
          throw new HttpsError(
            "failed-precondition",
            "Legacy pickup/reset cannot change a committed delivery."
          );
        }

        if (action === "pickup") {
          if (currentStatus !== "pending") {
            throw new HttpsError(
              "failed-precondition",
              `Cannot pickup a delivery in status '${currentStatus}'. Expected 'pending'.`
            );
          }
          tx.update(deliveryRef, {
            status: "picked_up",
            courierId: userId,
            pickedUpAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            sandboxDemoAdvancedBy: userId,
          });
          return { newStatus: "picked_up" as const, previousStatus: currentStatus };
        }

        if (!RESET_ALLOWED_FROM_STATUSES.includes(currentStatus)) {
          throw new HttpsError(
            "failed-precondition",
            `Cannot reset a delivery in status '${currentStatus}'. Reset is only allowed from: ${RESET_ALLOWED_FROM_STATUSES.join(", ")}.`
          );
        }
        tx.update(deliveryRef, {
          status: "pending",
          courierId: FieldValue.delete(),
          pickedUpAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
          sandboxDemoAdvancedBy: userId,
          sandboxDemoResetAt: FieldValue.serverTimestamp(),
        });
        return { newStatus: "pending" as const, previousStatus: currentStatus };
      });

      logger.info(`sandboxDeliveryAdvance: ${action} applied`, {
        deliveryId,
        previousStatus: result.previousStatus,
        newStatus: result.newStatus,
        callerUid: userId,
        callerEmail,
      });
      return { ok: true, deliveryId, newStatus: result.newStatus };
    }

    // ---- confirm_delivered: canonical settlement, then journey ------------
    // Handled outside a wrapping transaction because completeDeliveryCore
    // runs its OWN transaction (never nested). The journey-phase gate below
    // is a read-only pre-check; the financial exactly-once guarantee stays
    // completeDeliveryCore's status guard, and the journey write is idempotent.
    if (action === "confirm_delivered") {
      const preSnap = await deliveryRef.get();
      if (!preSnap.exists) throw new HttpsError("not-found", "Delivery not found.");
      const delivery = (preSnap.data() ?? {}) as DeliveryData;
      assertCockpitCaller(userId, delivery);
      if (delivery.stockTransit?.version === 1) {
        return db.runTransaction(async (tx) => {
          const currentSnap = await tx.get(deliveryRef);
          if (!currentSnap.exists) throw new HttpsError("not-found", "Delivery not found.");
          const current = (currentSnap.data() ?? {}) as DeliveryData;
          assertCockpitCaller(userId, current);
          if (current.proposalType !== "exchange") {
            throw new HttpsError("failed-precondition", "Physical transit requires an exchange.");
          }
          const phase = current.sandboxJourney?.outboundPhase ??
            outboundFromStatus(current.status || "");
          if (phase === "delivered" &&
              current.stockTransit?.outbound?.state === "received_pending") {
            return { ok: true, deliveryId, outboundPhase: "delivered", returnRequired: true, idempotent: true };
          }
          if (phase !== "en_route_to_dropoff" ||
              current.stockTransit?.outbound?.state !== "in_transit") {
            throw new HttpsError(
              "failed-precondition",
              "The outbound lot must be picked up before delivery can be confirmed."
            );
          }
          tx.set(deliveryRef, {
            sandboxJourney: journeyDoc("delivered", true, "awaiting_return", userId),
            stockTransit: {
              ...current.stockTransit,
              outbound: { ...current.stockTransit.outbound, state: "received_pending" },
            },
          }, { merge: true });
          return { ok: true, deliveryId, outboundPhase: "delivered", returnRequired: true };
        });
      }
      const journey = delivery.sandboxJourney;
      const outbound = journey?.outboundPhase ?? outboundFromStatus(delivery.status || "");
      const returnRequired = journey?.returnRequired ?? false;

      if (outbound === "delivered") {
        // Idempotent: settlement already done. Ensure the journey reflects it.
        await writeJourney(deliveryRef, userId, "delivered", returnRequired,
          returnRequired ? highestReturnPhase(journey?.returnPhase, "awaiting_return") : "not_required");
        return { ok: true, deliveryId, outboundPhase: "delivered", idempotent: true };
      }
      if (outbound !== "en_route_to_dropoff") {
        throw new HttpsError(
          "failed-precondition",
          `confirm_delivered requires outbound phase 'en_route_to_dropoff' (current '${outbound}').`
        );
      }

      // Canonical settlement — exactly-once by its own status guard.
      try {
        await completeDeliveryCore({ deliveryId, userId });
      } catch (err) {
        // A failed-precondition from completeDeliveryCore is ONLY an
        // idempotent success when the delivery is ACTUALLY settled. Re-read
        // and verify status === 'delivered'; a 'cancelled' / 'failed' /
        // missing / other state means the settlement did not happen and the
        // error is real → re-throw. This also handles the reconciliation
        // case (settlement succeeded, a prior journey write failed): the
        // retry lands here, sees status='delivered', and only fixes the
        // journey without re-settling.
        if (!(err instanceof HttpsError) || err.code !== "failed-precondition") {
          throw err;
        }
        const recheck = await deliveryRef.get();
        const recheckStatus = (recheck.data() as DeliveryData | undefined)?.status;
        if (recheckStatus !== "delivered") {
          logger.warn(
            "sandboxDeliveryAdvance: confirm_delivered — core precondition failed and delivery is NOT delivered; surfacing error",
            { deliveryId, recheckStatus }
          );
          throw err;
        }
        logger.info(
          "sandboxDeliveryAdvance: confirm_delivered — already settled (status=delivered), journey catch-up",
          { deliveryId }
        );
      }

      const resolvedReturnRequired = await resolveReturnRequired(delivery, returnRequired);
      await writeJourney(
        deliveryRef,
        userId,
        "delivered",
        resolvedReturnRequired,
        resolvedReturnRequired ? "awaiting_return" : "not_required"
      );
      logger.info("sandboxDeliveryAdvance: confirm_delivered applied", {
        deliveryId,
        returnRequired: resolvedReturnRequired,
        callerUid: userId,
      });
      return { ok: true, deliveryId, outboundPhase: "delivered", returnRequired: resolvedReturnRequired };
    }

    // The final physical return receipt is durable before settlement. If a
    // wallet guard rejects settlement, the medicines remain shown at their
    // actual recipient and this same action can be retried after correction.
    if (action === "confirm_return_delivered") {
      const preSnap = await deliveryRef.get();
      if (!preSnap.exists) throw new HttpsError("not-found", "Delivery not found.");
      const preDelivery = (preSnap.data() ?? {}) as DeliveryData;
      if (preDelivery.stockTransit?.version === 1) {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(deliveryRef);
          if (!snap.exists) throw new HttpsError("not-found", "Delivery not found.");
          const delivery = (snap.data() ?? {}) as DeliveryData;
          assertCockpitCaller(userId, delivery);
          if (delivery.proposalType !== "exchange" ||
              delivery.stockTransit?.outbound?.state !== "received_pending") {
            throw new HttpsError("failed-precondition", "Outbound exchange lot has not been received.");
          }
          const phase = delivery.sandboxJourney?.returnPhase;
          const state = delivery.stockTransit.return?.state;
          if (phase === "return_delivered" && state === "received_pending") return;
          if (phase !== "en_route_to_return_dropoff" || state !== "in_transit") {
            throw new HttpsError("failed-precondition", "Return lot has not been picked up.");
          }
          tx.set(deliveryRef, {
            sandboxJourney: journeyDoc("delivered", true, "return_delivered", userId),
            stockTransit: {
              ...delivery.stockTransit,
              return: { ...delivery.stockTransit.return, state: "received_pending" },
            },
          }, { merge: true });
        });
        await completeDeliveryCore({ deliveryId, userId });
        return { ok: true, deliveryId, returnPhase: "return_delivered", settled: true };
      }
    }

    // ---- All remaining actions are single-transaction ---------------------
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(deliveryRef);
      if (!snap.exists) throw new HttpsError("not-found", "Delivery not found.");
      const delivery = (snap.data() ?? {}) as DeliveryData;
      assertCockpitCaller(userId, delivery);

      const journey = delivery.sandboxJourney;
      const outbound: OutboundPhase =
        journey?.outboundPhase ?? outboundFromStatus(delivery.status || "");
      const returnRequired = journey?.returnRequired ?? false;
      const returnPhase: ReturnPhase = journey?.returnPhase ?? "not_required";

      // ----- confirm_pickup: reuse the canonical pickup transition ---------
      if (action === "confirm_pickup") {
        if (outbound === "picked_up") {
          // Idempotent — ensure journey persisted.
          tx.set(deliveryRef, { sandboxJourney: journeyDoc("picked_up", returnRequired, returnPhase, userId) }, { merge: true });
          return { outboundPhase: "picked_up" as OutboundPhase, idempotent: true };
        }
        if (outbound !== "en_route_to_pickup") {
          throw new HttpsError(
            "failed-precondition",
            `confirm_pickup requires outbound phase 'en_route_to_pickup' (current '${outbound}').`
          );
        }
        const currentStatus = delivery.status || "";
        const canonicalUpdate: Record<string, unknown> = {
          sandboxJourney: journeyDoc("picked_up", returnRequired, returnPhase, userId),
        };
        if (delivery.stockTransit?.version === 1) {
          const stockState = delivery.stockTransit.outbound?.state;
          if (stockState !== "reserved" && stockState !== "in_transit") {
            throw new HttpsError("failed-precondition", "Outbound lot is not reserved for pickup.");
          }
          canonicalUpdate.stockTransit = {
            ...delivery.stockTransit,
            outbound: { ...delivery.stockTransit.outbound, state: "in_transit" },
          };
        }
        // Apply the canonical pickup only if not already done.
        if (currentStatus === "pending" || currentStatus === "accepted") {
          canonicalUpdate.status = "picked_up";
          // `accepted` already has a backend-assigned courier. Keep that
          // assignment; the legacy `pending` sandbox path assigns the caller.
          if (currentStatus === "pending") canonicalUpdate.courierId = userId;
          canonicalUpdate.pickedUpAt = FieldValue.serverTimestamp();
          canonicalUpdate.updatedAt = FieldValue.serverTimestamp();
          canonicalUpdate.sandboxDemoAdvancedBy = userId;
        } else if (currentStatus !== "picked_up" && currentStatus !== "in_transit") {
          throw new HttpsError(
            "failed-precondition",
            `confirm_pickup cannot run against delivery status '${currentStatus}'.`
          );
        }
        tx.set(deliveryRef, canonicalUpdate, { merge: true });
        return { outboundPhase: "picked_up" as OutboundPhase };
      }

      // ----- Outbound journey-only (start_pickup, start_delivery) ----------
      const outSpec = OUTBOUND_JOURNEY_ONLY[action];
      if (outSpec) {
        if (outbound === outSpec.to) {
          return { outboundPhase: outbound, idempotent: true };
        }
        if (outbound !== outSpec.from) {
          throw new HttpsError(
            "failed-precondition",
            `${action} requires outbound phase '${outSpec.from}' (current '${outbound}').`
          );
        }
        tx.set(deliveryRef, { sandboxJourney: journeyDoc(outSpec.to, returnRequired, returnPhase, userId) }, { merge: true });
        return { outboundPhase: outSpec.to };
      }

      // ----- Return journey-only -------------------------------------------
      const retSpec = RETURN_JOURNEY_ONLY[action];
      if (retSpec) {
        if (!returnRequired) {
          throw new HttpsError(
            "failed-precondition",
            "This delivery does not require a return leg."
          );
        }
        if (outbound !== "delivered") {
          throw new HttpsError(
            "failed-precondition",
            "Return actions are only available after the outbound delivery is completed."
          );
        }
        if (returnPhase === retSpec.to) {
          return { returnPhase, idempotent: true };
        }
        if (returnPhase !== retSpec.from) {
          throw new HttpsError(
            "failed-precondition",
            `${action} requires return phase '${retSpec.from}' (current '${returnPhase}').`
          );
        }
        const next: Record<string, unknown> = {
          sandboxJourney: journeyDoc("delivered", returnRequired, retSpec.to, userId),
        };
        if (delivery.stockTransit?.version === 1) {
          if (delivery.stockTransit.outbound?.state !== "received_pending") {
            throw new HttpsError("failed-precondition", "Outbound lot must be received before return.");
          }
          if (action === "confirm_return_pickup") {
            if (delivery.stockTransit.return?.state !== "reserved") {
              throw new HttpsError("failed-precondition", "Return lot is not reserved for pickup.");
            }
            next.stockTransit = {
              ...delivery.stockTransit,
              return: { ...delivery.stockTransit.return, state: "in_transit" },
            };
          }
        }
        tx.set(deliveryRef, next, { merge: true });
        return { returnPhase: retSpec.to };
      }

      // Should be unreachable — allowlist already validated.
      throw new HttpsError("internal", `Unhandled action '${action}'.`);
    });

    logger.info(`sandboxDeliveryAdvance: ${action} applied`, {
      deliveryId,
      callerUid: userId,
      ...result,
    });
    return { ok: true, deliveryId, ...result };
  }
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Manual delivery controls — authorization for who may drive the staging
 * progression.
 *
 * A delivery with an assigned courier is driven only by that courier. Before
 * assignment, a trade party may drive a legacy staging delivery; version-1
 * physical exchange requires an assignment before any lot moves. Identity
 * is resolved from pharmacy or courier profiles above.
 */
/**
 * Resolves the caller's account email, accepting a pharmacy OR a courier.
 *
 * Returns `null` when the uid owns neither document, and `""` when the
 * document exists without an email — the caller distinguishes the two so the
 * refusal message says which problem it is. Pharmacies are probed first:
 * they are the historical caller, so the courier read is only paid when the
 * uid is not a pharmacy.
 *
 * IDENTITY only. Whether that identity may drive THIS delivery is decided
 * separately by `assertCockpitCaller`, inside the transaction.
 */
async function resolveSandboxCallerEmail(userId: string): Promise<string | null> {
  const pharmacySnap = await db.collection("pharmacies").doc(userId).get();
  if (pharmacySnap.exists) {
    return (pharmacySnap.data()?.email as string | undefined) ?? "";
  }
  const courierSnap = await db.collection("couriers").doc(userId).get();
  if (courierSnap.exists) {
    return (courierSnap.data()?.email as string | undefined) ?? "";
  }
  return null;
}

function assertCockpitCaller(userId: string, delivery: DeliveryData): void {
  if (delivery.stockTransit?.version === 1 && !delivery.courierId) {
    throw new HttpsError(
      "failed-precondition",
      "A courier must be assigned before moving either exchange lot."
    );
  }
  // Once a real courier has accepted the order, a pharmacy must not advance
  // its physical journey or invoke settlement through the sandbox bypass.
  if (delivery.courierId) {
    if (userId === delivery.courierId) return;
    throw new HttpsError(
      "permission-denied",
      "Only the assigned courier can drive this delivery."
    );
  }
  const isTradeParty =
    userId === delivery.fromPharmacyId || userId === delivery.toPharmacyId;
  if (!isTradeParty) {
    throw new HttpsError(
      "permission-denied",
      "Only a trade party (buyer/seller) or the assigned courier can drive this delivery."
    );
  }
}

/** Pick the more advanced of two return phases (for idempotent catch-up). */
function highestReturnPhase(a: ReturnPhase | undefined, b: ReturnPhase): ReturnPhase {
  const ra = a ? returnRank(a) : -1;
  return ra >= returnRank(b) ? (a as ReturnPhase) : b;
}

/**
 * Resolve whether a return leg is required on a legacy journey. Version-1
 * physical exchanges persist this requirement at the outbound receipt.
 */
async function resolveReturnRequired(
  delivery: DeliveryData,
  fallback: boolean
): Promise<boolean> {
  if (delivery.sandboxJourney?.returnRequired !== undefined) {
    return delivery.sandboxJourney.returnRequired;
  }
  const proposalId = delivery.proposalId;
  if (!proposalId) return fallback;
  try {
    const p = await db.collection("exchange_proposals").doc(proposalId).get();
    const type = (p.data()?.details as { type?: string } | undefined)?.type;
    return type === "exchange";
  } catch {
    return fallback;
  }
}

async function writeJourney(
  deliveryRef: FirebaseFirestore.DocumentReference,
  userId: string,
  outboundPhase: OutboundPhase,
  returnRequired: boolean,
  returnPhase: ReturnPhase
): Promise<void> {
  await deliveryRef.set(
    { sandboxJourney: journeyDoc(outboundPhase, returnRequired, returnPhase, userId) },
    { merge: true }
  );
}
