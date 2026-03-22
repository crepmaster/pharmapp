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

    const { requestId, offerId } = request.data;
    if (!requestId || typeof requestId !== "string") {
      throw new HttpsError("invalid-argument", "requestId is required.");
    }
    if (!offerId || typeof offerId !== "string") {
      throw new HttpsError("invalid-argument", "offerId is required.");
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
