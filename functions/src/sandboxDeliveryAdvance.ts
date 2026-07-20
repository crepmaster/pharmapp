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
 *   2. Caller pharmacy email ends in `@promoshake.net` (same pattern as
 *      the other sandbox callables: sandboxCredit / sandboxDebit / etc).
 *
 * Contract:
 *   Input : { deliveryId: string, action: 'pickup' }
 *   Output: { ok: true, deliveryId, newStatus: 'picked_up' }
 *
 * Only 'pickup' is currently accepted — 'deliver' would just be a proxy for
 * `completeExchangeDelivery` which the Flutter client already calls
 * directly (and which now carries its own sandbox bypass).
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

interface AdvanceInput {
  deliveryId?: string;
  action?: string;
}

export const sandboxDeliveryAdvance = onCall<AdvanceInput>(
  { region: "europe-west1", cors: true },
  async (request) => {
    if (process.env.SANDBOX_ENABLED !== "true") {
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
    if (action !== "pickup") {
      throw new HttpsError(
        "invalid-argument",
        "Only action='pickup' is supported. Use completeExchangeDelivery for the 'deliver' step."
      );
    }

    // Verify caller is a @promoshake.net pharmacy (bypasses the courier
    // check, so the identity gate matters — a random user must not be able
    // to hijack a delivery even on staging).
    const pharmacySnap = await db.collection("pharmacies").doc(userId).get();
    if (!pharmacySnap.exists) {
      throw new HttpsError(
        "permission-denied",
        "Sandbox delivery advance requires a pharmacy account."
      );
    }
    const callerEmail =
      (pharmacySnap.data()?.email as string | undefined) ?? "";
    if (!/@promoshake\.net$/i.test(callerEmail)) {
      throw new HttpsError(
        "permission-denied",
        "Sandbox delivery advance requires a @promoshake.net test account."
      );
    }

    // Load the delivery and check the caller is one of the trade parties.
    const deliveryRef = db.collection("deliveries").doc(deliveryId);
    const deliverySnap = await deliveryRef.get();
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
    if (currentStatus !== "pending") {
      throw new HttpsError(
        "failed-precondition",
        `Cannot pickup a delivery in status '${currentStatus}'. Expected 'pending'.`
      );
    }

    await deliveryRef.update({
      status: "picked_up",
      courierId: userId, // demo: the trade party plays courier
      pickedUpAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      sandboxDemoAdvancedBy: userId,
    });

    logger.info("sandboxDeliveryAdvance: pickup applied", {
      deliveryId,
      callerUid: userId,
      callerEmail,
      buyerId,
      sellerId,
    });

    return { ok: true, deliveryId, newStatus: "picked_up" };
  }
);
