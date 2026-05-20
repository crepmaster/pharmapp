/**
 * cancelMedicineRequest — Sprint 2A
 *
 * Cancels an open medicine request. Only the requester can cancel.
 * Also withdraws all pending offers on this request.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

interface CancelRequestData {
  requestId: string;
}

export const cancelMedicineRequest = onCall<CancelRequestData>(
  { region: "europe-west1", cors: true },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { requestId } = request.data;
    if (!requestId || typeof requestId !== "string") {
      throw new HttpsError("invalid-argument", "requestId is required.");
    }

    await db.runTransaction(async (transaction) => {
      // ================================================================
      // PHASE 1: ALL READS (Firestore transaction constraint — all reads
      // MUST happen before any write, otherwise the runtime throws an
      // unhandled exception that surfaces as `firebase_functions/internal`
      // to the client. Bug discovered during Sprint 5 phase 1 emulator
      // recette 2026-05-14 — Jest mocks didn't catch the ordering issue
      // because they don't enforce the real Firestore transaction
      // contract.)
      // ================================================================

      const requestRef = db.collection("medicine_requests").doc(requestId);
      const requestSnap = await transaction.get(requestRef);

      if (!requestSnap.exists) {
        throw new HttpsError("not-found", "Request not found.");
      }
      const data = requestSnap.data()!;

      if (data.requesterPharmacyId !== userId) {
        throw new HttpsError("permission-denied", "Only the requester can cancel.");
      }
      if (data.status !== "open") {
        throw new HttpsError(
          "failed-precondition",
          `Cannot cancel request with status '${data.status}'.`
        );
      }

      const offersQuery = db
        .collection("medicine_request_offers")
        .where("requestId", "==", requestId);
      const offersSnap = await transaction.get(offersQuery);

      // ================================================================
      // PHASE 2: ALL WRITES
      // ================================================================

      const now = FieldValue.serverTimestamp();

      // Cancel the request
      transaction.update(requestRef, {
        status: "cancelled",
        updatedAt: now,
      });

      // Withdraw all pending offers
      for (const doc of offersSnap.docs) {
        if (doc.data().status === "pending") {
          transaction.update(doc.ref, {
            status: "expired",
            updatedAt: now,
          });
        }
      }
    });

    logger.info("cancelMedicineRequest: cancelled", { requestId, userId });
    return { success: true, requestId };
  }
);
