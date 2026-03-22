/**
 * withdrawMedicineRequestOffer — Sprint 2A
 *
 * A seller withdraws their pending offer on a medicine request.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

interface WithdrawOfferData {
  offerId: string;
}

export const withdrawMedicineRequestOffer = onCall<WithdrawOfferData>(
  { region: "europe-west1", cors: true },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { offerId } = request.data;
    if (!offerId || typeof offerId !== "string") {
      throw new HttpsError("invalid-argument", "offerId is required.");
    }

    const offerRef = db.collection("medicine_request_offers").doc(offerId);
    const offerSnap = await offerRef.get();

    if (!offerSnap.exists) {
      throw new HttpsError("not-found", "Offer not found.");
    }
    const offerData = offerSnap.data()!;

    if (offerData.sellerPharmacyId !== userId) {
      throw new HttpsError("permission-denied", "Only the seller can withdraw.");
    }
    if (offerData.status !== "pending") {
      throw new HttpsError(
        "failed-precondition",
        `Cannot withdraw offer with status '${offerData.status}'.`
      );
    }

    await offerRef.update({
      status: "withdrawn",
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info("withdrawMedicineRequestOffer: withdrawn", { offerId, userId });
    return { success: true, offerId };
  }
);
