/**
 * TD-COURIER-ASSIGN-GUARD (Lot C) — `advanceCourierDelivery`.
 *
 * Backend-owned NON-TERMINAL delivery transitions. Moves the client-write
 * pickup/in-transit steps into a callable that enforces the ordered state
 * machine. Terminal transitions stay OUT: `delivered` belongs to
 * `completeExchangeDelivery`, `failed`/`cancelled` to `terminateExchangeDelivery`.
 *
 * State machine (architect-decided):
 *
 *   accepted ──mark_in_transit──▶ in_transit ──confirm_pickup──▶ picked_up
 *      └───────────────confirm_pickup───────────────────────────▶ picked_up
 *   picked_up ──▶ delivered  (via completeExchangeDelivery, NOT here)
 *
 * Forbidden: picked_up → in_transit, any backwards move, any arbitrary status,
 * and every terminal status.
 *
 * Only the ASSIGNED courier may advance. The currency/territory frontier was
 * already gated at assignment (`assignCourierToDelivery`); this callable does
 * not re-run it — it owns the ORDER, not the money.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

type AdvanceAction = "mark_in_transit" | "confirm_pickup";

interface AdvanceInput {
  deliveryId: string;
  action: AdvanceAction;
}

/**
 * Pure transition table — exported for unit testing. Returns the next status
 * for a (currentStatus, action) pair, or null if the transition is not allowed.
 */
export function nextDeliveryStatus(
  currentStatus: unknown,
  action: AdvanceAction
): "in_transit" | "picked_up" | null {
  if (action === "mark_in_transit") {
    // Only from `accepted` — never from `picked_up` (no going back on the road).
    return currentStatus === "accepted" ? "in_transit" : null;
  }
  if (action === "confirm_pickup") {
    return currentStatus === "accepted" || currentStatus === "in_transit"
      ? "picked_up"
      : null;
  }
  return null;
}

export const advanceCourierDelivery = onCall<AdvanceInput>(
  { region: "europe-west1", cors: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to advance a delivery."
      );
    }
    const deliveryId = request.data?.deliveryId;
    if (typeof deliveryId !== "string" || deliveryId.length === 0) {
      throw new HttpsError("invalid-argument", "deliveryId is required.");
    }
    const action = request.data?.action;
    if (action !== "mark_in_transit" && action !== "confirm_pickup") {
      throw new HttpsError(
        "invalid-argument",
        "action must be 'mark_in_transit' or 'confirm_pickup'."
      );
    }

    return db.runTransaction(async (tx) => {
      const deliveryRef = db.collection("deliveries").doc(deliveryId);
      const deliverySnap = await tx.get(deliveryRef);
      if (!deliverySnap.exists) {
        throw new HttpsError("not-found", "Delivery not found.");
      }
      const delivery = deliverySnap.data()!;

      // Only the assigned courier may advance.
      if (delivery.courierId !== uid) {
        throw new HttpsError(
          "permission-denied",
          "Only the assigned courier can advance this delivery."
        );
      }

      const nextStatus = nextDeliveryStatus(delivery.status, action);
      if (!nextStatus) {
        throw new HttpsError(
          "failed-precondition",
          `Cannot ${action} a delivery with status '${delivery.status}'.`,
          { code: "INVALID_DELIVERY_TRANSITION" }
        );
      }

      const payload: Record<string, unknown> = {
        status: nextStatus,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (nextStatus === "picked_up") {
        payload.pickedUpAt = FieldValue.serverTimestamp();
      }
      tx.update(deliveryRef, payload);

      logger.info("advanceCourierDelivery: advanced", {
        deliveryId,
        courierUid: uid,
        from: delivery.status,
        to: nextStatus,
        action,
      });

      return { success: true, deliveryId, status: nextStatus };
    });
  }
);
