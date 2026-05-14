/**
 * acceptMedicineRequestOffer — Sprint 2A + Sprint 4 (F-BLOC2-P2).
 *
 * The requester accepts an offer on their medicine request.
 * Bridges into the canonical exchange_proposals + deliveries pipeline
 * via a single atomic transaction.
 *
 * Sprint 4 split based on `offer.offerType` :
 *  - `purchase` → existing wallet-bridge path (unchanged behavior).
 *  - `exchange` → barter path that reserves only the requester's
 *    `exchangeInventoryItemId` (per lock #5) and produces a canonical
 *    `exchange_proposals` document with `details.type === "exchange"`.
 *
 * No second seller acceptance required — the seller already agreed by
 * submitting the offer.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  acceptExchangeRequestOfferIntoCanonicalProposal,
  acceptRequestOfferIntoCanonicalProposal,
} from "./lib/requestProposalBridge.js";
import { assertLicenseAllowsMarketplace } from "./lib/licenseGate.js";

const db = getFirestore();

interface AcceptOfferData {
  requestId: string;
  offerId: string;
  /** Required when `offer.offerType === "exchange"`: ID of the requester's
   * inventory item that satisfies the seller's `exchangeItem`. */
  exchangeInventoryItemId?: string;
}

export const acceptMedicineRequestOffer = onCall<AcceptOfferData>(
  { region: "europe-west1", cors: true },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    // 🔒 F-LICENSE GATE — caller (requester pharmacy).
    await assertLicenseAllowsMarketplace(db, userId);

    const { requestId, offerId, exchangeInventoryItemId } = request.data;
    if (!requestId || typeof requestId !== "string") {
      throw new HttpsError("invalid-argument", "requestId is required.");
    }
    if (!offerId || typeof offerId !== "string") {
      throw new HttpsError("invalid-argument", "offerId is required.");
    }

    // Pre-tx read of the offer:
    //   1. Resolve `offerType` to pick the right transactional bridge.
    //   2. Gate the seller (counterparty) license — Sprint 2A.1 / 2A.2 +
    //      Sprint 4 lock #8 symmetric gate.
    const offerPreSnap = await db
      .collection("medicine_request_offers")
      .doc(offerId)
      .get();
    if (!offerPreSnap.exists) {
      throw new HttpsError("not-found", "Medicine request offer not found.");
    }
    const offerPreData = offerPreSnap.data() ?? {};
    const sellerUid = offerPreData.sellerPharmacyId as string | undefined;
    if (typeof sellerUid !== "string" || sellerUid.length === 0) {
      throw new HttpsError(
        "failed-precondition",
        "Offer is missing seller information and cannot be accepted."
      );
    }
    await assertLicenseAllowsMarketplace(db, sellerUid);

    const offerType = offerPreData.offerType as string | undefined;
    if (offerType !== "purchase" && offerType !== "exchange") {
      throw new HttpsError(
        "failed-precondition",
        `Offer is in unsupported mode '${offerType ?? "unknown"}'.`
      );
    }

    // Sprint 4: exchange branch requires `exchangeInventoryItemId`.
    if (offerType === "exchange") {
      if (
        typeof exchangeInventoryItemId !== "string" ||
        exchangeInventoryItemId.length === 0
      ) {
        throw new HttpsError(
          "invalid-argument",
          "exchangeInventoryItemId is required to accept an exchange offer."
        );
      }
    }

    logger.info("acceptMedicineRequestOffer: starting", {
      userId,
      requestId,
      offerId,
      offerType,
    });

    const result = await db.runTransaction(async (transaction) => {
      if (offerType === "purchase") {
        return acceptRequestOfferIntoCanonicalProposal(transaction, {
          callerUid: userId,
          requestId,
          offerId,
        });
      }
      return acceptExchangeRequestOfferIntoCanonicalProposal(transaction, {
        callerUid: userId,
        requestId,
        offerId,
        exchangeInventoryItemId: exchangeInventoryItemId as string,
      });
    });

    logger.info("acceptMedicineRequestOffer: completed", {
      userId,
      requestId,
      offerId,
      offerType,
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
