/**
 * sandboxDeliveryAdvance — staging demo helper.
 *
 * Lets a pharmacy (buyer or seller) manually advance a delivery through the
 * `pending -> picked_up` step during a client demo, without needing a real
 * courier account/QR-scan flow. Paired with the sandbox bypass in
 * `completeExchangeDelivery` (which handles the `picked_up -> delivered`
 * step + full settlement), this gives the demo two clean buttons per
 * delivery: "Pickup" and "Delivered".
 *
 * 🔒 Gated (both conditions required, otherwise permission-denied):
 *   1. `process.env.SANDBOX_ENABLED === "true"` (only set on staging via
 *      `functions/.env.mediexchange-staging`, gitignored — prod never has it).
 *   2. Caller pharmacy email matches `SANDBOX_ACCOUNT_PATTERNS`
 *      (currently `*@promoshake.net`).
 *
 * Contract:
 *   Input : { deliveryId: string, action: 'pickup' | 'reset' }
 *   Output: { ok: true, deliveryId, newStatus }
 *
 *   - action='pickup' : starting status must be `pending` → becomes
 *     `picked_up`, courierId is set to the caller.
 *   - action='reset'  : starting status must be `failed` OR `cancelled`
 *     → becomes `pending`, courierId + pickedUpAt cleared. Any other
 *     starting status is refused (including `delivered`, `picked_up`,
 *     `in_transit`, `pending`, or unknown). See P0#2 + P1#1 in the
 *     architect review round-4.
 *
 * Both actions run inside a single Firestore `runTransaction` so that the
 * check-then-write is atomic — a concurrent `completeExchangeDelivery`
 * (which flips status to `delivered` and settles wallets) that races with
 * a reset will be observed by the re-read inside the transaction and the
 * reset will be refused.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  assertSandboxAllowedForProject,
  isSandboxAccountEmail,
  isSandboxEnabled,
} from "./lib/sandboxGate.js";

// Defence in depth: fail-fast at module load if SANDBOX_ENABLED slipped
// through to prod. This callable is inherently sandbox-only — a prod deploy
// with the env var set would let any @promoshake.net-looking account hijack
// deliveries, so crash the whole module rather than expose that path.
assertSandboxAllowedForProject();

const db = getFirestore();

/** Statuses from which a demo delivery may be reset back to `pending`. */
export const RESET_ALLOWED_FROM_STATUSES: readonly string[] = [
  "failed",
  "cancelled",
];

interface AdvanceInput {
  deliveryId?: string;
  action?: string;
}

export const sandboxDeliveryAdvance = onCall<AdvanceInput>(
  { region: "europe-west1", cors: true },
  async (request) => {
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
    if (action !== "pickup" && action !== "reset") {
      throw new HttpsError(
        "invalid-argument",
        "Only action='pickup' or 'reset' is supported. Use completeExchangeDelivery for the 'deliver' step."
      );
    }

    // Verify caller is a @promoshake.net pharmacy. This read is fine outside
    // the transaction: pharmacy identity + email do not change during a
    // single call, and even a stale read cannot escalate — the identity
    // must match the sandbox-account pattern.
    const pharmacySnap = await db.collection("pharmacies").doc(userId).get();
    if (!pharmacySnap.exists) {
      throw new HttpsError(
        "permission-denied",
        "Sandbox delivery advance requires a pharmacy account."
      );
    }
    const callerEmail =
      (pharmacySnap.data()?.email as string | undefined) ?? "";
    if (!isSandboxAccountEmail(callerEmail)) {
      throw new HttpsError(
        "permission-denied",
        "Sandbox delivery advance requires a recognised test account (see SANDBOX_ACCOUNT_PATTERNS)."
      );
    }

    const deliveryRef = db.collection("deliveries").doc(deliveryId);

    // Whole check-and-write is transactional so a concurrent flip to
    // `delivered` (which runs settlement) is observed by the re-read below
    // and the write is rejected. Fixes P0#2 in the round-4 review.
    const result = await db.runTransaction(async (tx) => {
      const deliverySnap = await tx.get(deliveryRef);
      if (!deliverySnap.exists) {
        throw new HttpsError("not-found", "Delivery not found.");
      }
      const delivery = deliverySnap.data() ?? {};
      const buyerId = delivery.fromPharmacyId as string | undefined;
      const sellerId = delivery.toPharmacyId as string | undefined;
      if (userId !== buyerId && userId !== sellerId) {
        throw new HttpsError(
          "permission-denied",
          "Only the buyer or the seller can drive the demo delivery."
        );
      }

      const currentStatus = (delivery.status as string) || "";

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

      // action === "reset" — explicit allowlist. Refuses everything not in
      // RESET_ALLOWED_FROM_STATUSES (in particular `delivered`, whose
      // settlement has already moved wallets and stock, and `pending` /
      // `picked_up` / `in_transit` which are already replayable through
      // the normal pickup+deliver flow).
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
);
