/**
 * acceptMedicineRequestOffer — Sprint 2A
 *
 * The requester accepts an offer on their medicine request.
 * Bridges into the canonical exchange_proposals + deliveries pipeline
 * via a single atomic transaction.
 *
 * No second seller acceptance required — the seller already agreed by
 * submitting the offer.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { acceptRequestOfferIntoCanonicalProposal } from "./lib/requestProposalBridge.js";
import { assertLicenseAllowsMarketplace } from "./lib/licenseGate.js";

const db = getFirestore();

interface AcceptOfferData {
  requestId: string;
  offerId: string;
}

export const acceptMedicineRequestOffer = onCall<AcceptOfferData>(
  { region: "europe-west1", cors: true },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    // 🔒 F-LICENSE GATE (Sprint 2a) — block unverified pharmacies.
    await assertLicenseAllowsMarketplace(db, userId);

    const { requestId, offerId } = request.data;
    if (!requestId || typeof requestId !== "string") {
      throw new HttpsError("invalid-argument", "requestId is required.");
    }
    if (!offerId || typeof offerId !== "string") {
      throw new HttpsError("invalid-argument", "offerId is required.");
    }

    // 🔒 F-LICENSE GATE — COUNTERPARTY (Sprint 2A.1 security correction):
    // gate the seller (the offer's `sellerPharmacyId`) before the
    // transactional bridge commits. The bridge re-reads the offer
    // atomically; this pre-tx read is purely for the eligibility check.
    const offerPreSnap = await db
      .collection("medicine_request_offers")
      .doc(offerId)
      .get();
    if (offerPreSnap.exists) {
      const sellerUid = (offerPreSnap.data() ?? {}).sellerPharmacyId as
        | string
        | undefined;
      if (typeof sellerUid === "string" && sellerUid.length > 0) {
        await assertLicenseAllowsMarketplace(db, sellerUid);
      }
    }

    logger.info("acceptMedicineRequestOffer: starting", {
      userId,
      requestId,
      offerId,
    });

    const result = await db.runTransaction(async (transaction) => {
      return acceptRequestOfferIntoCanonicalProposal(transaction, {
        callerUid: userId,
        requestId,
        offerId,
      });
    });

    logger.info("acceptMedicineRequestOffer: completed", {
      userId,
      requestId,
      offerId,
      proposalId: result.proposalId,
      deliveryId: result.deliveryId,
    });

    return {
      success: true,
      requestId,
      offerId,
      proposalId: result.proposalId,
      deliveryId: result.deliveryId,
    };
  }
);
