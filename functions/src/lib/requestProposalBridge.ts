/**
 * requestProposalBridge — Sprint 2A
 *
 * Transactional helper that bridges a medicine request offer into the
 * canonical exchange_proposals + deliveries pipeline.
 *
 * Called by acceptMedicineRequestOffer. Performs everything in ONE
 * Firestore transaction:
 *   1. Validates request, offer, inventory, wallet, pharmacies
 *   2. Decrements buyer wallet (available → deducted, no intermediate held)
 *   3. Creates exchange_proposal in status "accepted"
 *   4. Creates delivery in status "pending"
 *   5. Writes ledger entries for wallet transitions
 *   6. Links proposal + delivery back to offer
 *
 * The created proposal carries `reservations.walletReserved` for compat
 * with completeExchangeDelivery.ts which reads that field.
 */

import {
  Transaction,
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { HttpsError } from "firebase-functions/v2/https";
import { citySlug } from "../cityUtils.js";

const db = getFirestore();

export interface RequestOfferBridgeParams {
  /** The admin/user invoking this (requester pharmacy). */
  callerUid: string;
  /** medicine_requests document ID. */
  requestId: string;
  /** medicine_request_offers document ID. */
  offerId: string;
}

export interface RequestOfferBridgeResult {
  proposalId: string;
  deliveryId: string;
}

/**
 * Execute the full bridge in a single Firestore transaction.
 *
 * The caller (`acceptMedicineRequestOffer`) wraps this in `db.runTransaction`.
 * All reads happen in phase 1, all writes in phase 2 (Firestore constraint).
 */
export async function acceptRequestOfferIntoCanonicalProposal(
  transaction: Transaction,
  params: RequestOfferBridgeParams
): Promise<RequestOfferBridgeResult> {
  const { callerUid, requestId, offerId } = params;

  // ================================================================
  // PHASE 1: ALL READS
  // ================================================================

  // 1a. Request
  const requestRef = db.collection("medicine_requests").doc(requestId);
  const requestSnap = await transaction.get(requestRef);
  if (!requestSnap.exists) {
    throw new HttpsError("not-found", "Medicine request not found.");
  }
  const requestData = requestSnap.data()!;

  if (requestData.requesterPharmacyId !== callerUid) {
    throw new HttpsError(
      "permission-denied",
      "Only the requester can accept offers on their request."
    );
  }
  if (requestData.status !== "open") {
    throw new HttpsError(
      "failed-precondition",
      `Request is '${requestData.status}', not open.`
    );
  }

  // 1b. Offer
  const offerRef = db.collection("medicine_request_offers").doc(offerId);
  const offerSnap = await transaction.get(offerRef);
  if (!offerSnap.exists) {
    throw new HttpsError("not-found", "Offer not found.");
  }
  const offerData = offerSnap.data()!;

  if (offerData.requestId !== requestId) {
    throw new HttpsError("invalid-argument", "Offer does not belong to this request.");
  }
  if (offerData.status !== "pending") {
    throw new HttpsError(
      "failed-precondition",
      `Offer is '${offerData.status}', not pending.`
    );
  }

  const sellerUid = offerData.sellerPharmacyId as string;
  const totalPrice = offerData.totalPrice as number;
  const currencyCode = (offerData.currencyCode as string) || "XAF";

  // 1c. Inventory item (seller's stock)
  const inventoryRef = db
    .collection("pharmacy_inventory")
    .doc(offerData.inventoryItemId as string);
  const inventorySnap = await transaction.get(inventoryRef);
  if (!inventorySnap.exists) {
    throw new HttpsError("not-found", "Seller inventory item no longer exists.");
  }
  const inventoryData = inventorySnap.data()!;

  if (inventoryData.pharmacyId !== sellerUid) {
    throw new HttpsError("permission-denied", "Inventory does not belong to seller.");
  }
  const availableQty = (inventoryData.availableQuantity as number) || 0;
  const offeredQty = offerData.offeredQuantity as number;
  if (availableQty < offeredQty) {
    throw new HttpsError(
      "failed-precondition",
      `Insufficient stock. Available: ${availableQty}, offered: ${offeredQty}.`
    );
  }
  // Check not expired
  const expDate = inventoryData.batch?.expirationDate?.toDate?.();
  if (expDate && expDate < new Date()) {
    throw new HttpsError("failed-precondition", "Seller inventory item has expired.");
  }

  // 1d. Buyer wallet
  const buyerWalletRef = db.collection("wallets").doc(callerUid);
  const buyerWalletSnap = await transaction.get(buyerWalletRef);
  const buyerWallet = buyerWalletSnap.exists ? buyerWalletSnap.data()! : null;
  const buyerAvailable = (buyerWallet?.available as number) || 0;
  if (buyerAvailable < totalPrice) {
    throw new HttpsError(
      "failed-precondition",
      `Insufficient wallet balance. Available: ${buyerAvailable}, required: ${totalPrice}.`
    );
  }

  // 1e. Pharmacy profiles (for delivery addresses)
  const buyerPharmRef = db.collection("pharmacies").doc(callerUid);
  const sellerPharmRef = db.collection("pharmacies").doc(sellerUid);
  const [buyerPharmSnap, sellerPharmSnap] = await Promise.all([
    transaction.get(buyerPharmRef),
    transaction.get(sellerPharmRef),
  ]);
  if (!buyerPharmSnap.exists || !sellerPharmSnap.exists) {
    throw new HttpsError("not-found", "Pharmacy profile not found.");
  }
  const buyerPharm = buyerPharmSnap.data()!;
  const sellerPharm = sellerPharmSnap.data()!;

  // 1f. Revalidate geographic scope — both pharmacies must still match
  // the request's countryCode + cityCode at acceptance time.
  const reqCountry = requestData.countryCode as string;
  const reqCity = requestData.cityCode as string;
  if (
    (buyerPharm.countryCode || "") !== reqCountry ||
    (buyerPharm.cityCode || "") !== reqCity
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Requester pharmacy is no longer in the same city as the request."
    );
  }
  if (
    (sellerPharm.countryCode || "") !== reqCountry ||
    (sellerPharm.cityCode || "") !== reqCity
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Seller pharmacy is no longer in the same city as the request."
    );
  }

  // 1g. Read all other pending offers for this request (to decline them)
  const otherOffersQuery = db
    .collection("medicine_request_offers")
    .where("requestId", "==", requestId);
  const otherOffersSnap = await transaction.get(otherOffersQuery);

  // ================================================================
  // PHASE 2: ALL WRITES
  // ================================================================

  const now = FieldValue.serverTimestamp();

  // 2a. Wallet: available → deducted (skip held, immediate acceptance)
  transaction.update(buyerWalletRef, {
    available: FieldValue.increment(-totalPrice),
    deducted: FieldValue.increment(totalPrice),
    updatedAt: now,
  });

  // 2b. Ledger: record wallet hold + commit in a single combined entry
  const holdLedgerRef = db.collection("ledger").doc();
  transaction.set(holdLedgerRef, {
    type: "proposal_wallet_hold_created",
    proposalId: "", // Will be backfilled below
    userId: callerUid,
    amount: totalPrice,
    currency: currencyCode,
    from: "available",
    to: "deducted",
    description:
      "Wallet deducted for accepted medicine request offer (immediate acceptance)",
    sourceType: "medicine_request",
    sourceId: requestId,
    createdAt: now,
  });

  // 2c. Create canonical exchange_proposal (already accepted)
  const proposalRef = db.collection("exchange_proposals").doc();
  const proposalId = proposalRef.id;

  // Backfill ledger proposalId
  transaction.update(holdLedgerRef, { proposalId });

  const proposalData: Record<string, unknown> = {
    id: proposalId,
    inventoryItemId: offerData.inventoryItemId,
    fromPharmacyId: callerUid, // buyer
    toPharmacyId: sellerUid, // seller
    details: {
      type: "purchase",
      quantity: offeredQty,
      unitPrice: offerData.unitPrice,
      totalPrice,
      currency: currencyCode,
      medicineName:
        offerData.inventorySnapshot?.medicineName ||
        inventoryData.medicineName ||
        null,
      medicineId:
        offerData.inventorySnapshot?.medicineId ||
        inventoryData.medicineId ||
        null,
    },
    status: "accepted",
    acceptedBy: sellerUid,
    acceptedAt: now,
    acceptanceNotes: "",
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    // Compat with completeExchangeDelivery.ts
    reservations: {
      walletReserved: totalPrice,
      inventoryReserved: null,
    },
    // Snapshot for proposals UI
    inventorySnapshot: offerData.inventorySnapshot || {
      medicineId: inventoryData.medicineId || null,
      medicineName: inventoryData.medicineName || null,
      packaging: inventoryData.packaging || null,
      lotNumber: inventoryData.batch?.lotNumber || null,
      expirationDate: inventoryData.batch?.expirationDate || null,
      availableQuantityAtOffer: availableQty,
    },
    // Link back to request domain
    _sourceRequestId: requestId,
    _sourceOfferId: offerId,
  };
  transaction.set(proposalRef, proposalData);

  // 2d. Create delivery (same structure as acceptExchangeProposal)
  const deliveryRef = db.collection("deliveries").doc();
  const deliveryId = deliveryRef.id;

  // pickup = seller (inventory owner), dropoff = buyer (requester)
  const pickupPharm = sellerPharm;
  const pickupId = sellerUid;
  const dropoffPharm = buyerPharm;
  const dropoffId = callerUid;

  const deliveryData: Record<string, unknown> = {
    deliveryId,
    proposalId,
    exchangeId: null,
    fromPharmacyId: pickupId,
    fromPharmacyName:
      pickupPharm.pharmacyName || pickupPharm.name || pickupPharm.displayName || "Unknown",
    fromPharmacyAddress: pickupPharm.address || "",
    fromPharmacyCity: pickupPharm.city || "",
    fromPharmacyCityCode:
      pickupPharm.cityCode || citySlug(pickupPharm.city || ""),
    fromPharmacyLocation: pickupPharm.location || null,
    fromPharmacyPhone: pickupPharm.phoneNumber || "",
    toPharmacyId: dropoffId,
    toPharmacyName:
      dropoffPharm.pharmacyName || dropoffPharm.name || dropoffPharm.displayName || "Unknown",
    toPharmacyAddress: dropoffPharm.address || "",
    toPharmacyCity: dropoffPharm.city || "",
    toPharmacyCityCode:
      dropoffPharm.cityCode || citySlug(dropoffPharm.city || ""),
    toPharmacyLocation: dropoffPharm.location || null,
    toPharmacyPhone: dropoffPharm.phoneNumber || "",
    items: [
      {
        medicineId: inventoryData.medicineId || "",
        medicineName: inventoryData.medicineName || "Unknown Medicine",
        dosage: inventoryData.dosage || "",
        form: inventoryData.form || "",
        quantity: offeredQty,
        packaging: inventoryData.packaging || "",
      },
    ],
    city: buyerPharm.city || sellerPharm.city || "",
    cityCode:
      buyerPharm.cityCode ||
      sellerPharm.cityCode ||
      citySlug(buyerPharm.city || sellerPharm.city || ""),
    status: "pending",
    courierId: null,
    courierName: null,
    courierPhone: null,
    proposalType: "purchase",
    totalPrice,
    currency: currencyCode,
    courierFee: Math.round(totalPrice * 0.12),
    paymentStatus: "pending",
    createdAt: now,
    updatedAt: now,
    acceptedAt: now,
    assignedAt: null,
    pickedUpAt: null,
    deliveredAt: null,
    estimatedDeliveryTime: null,
    actualDeliveryTime: null,
    qrCodePickup: deliveryId,
    qrCodeDelivery: `${deliveryId}-delivery`,
    photoProofUrl: null,
    deliveryNotes: "",
  };
  transaction.set(deliveryRef, deliveryData);

  // 2e. Link delivery back to proposal
  transaction.update(proposalRef, { deliveryId });

  // 2f. Update request → matched
  transaction.update(requestRef, {
    status: "matched",
    selectedOfferId: offerId,
    updatedAt: now,
  });

  // 2g. Update accepted offer → converted, link proposalId
  transaction.update(offerRef, {
    status: "converted",
    linkedProposalId: proposalId,
    updatedAt: now,
  });

  // 2h. Decline all other pending offers for this request
  for (const doc of otherOffersSnap.docs) {
    if (doc.id === offerId) continue; // skip the accepted one
    const otherStatus = doc.data().status;
    if (otherStatus === "pending") {
      transaction.update(doc.ref, {
        status: "declined",
        updatedAt: now,
      });
    }
  }

  logger.info("acceptRequestOfferIntoCanonicalProposal: success", {
    requestId,
    offerId,
    proposalId,
    deliveryId,
    totalPrice,
    buyerUid: callerUid,
    sellerUid,
  });

  return { proposalId, deliveryId };
}
