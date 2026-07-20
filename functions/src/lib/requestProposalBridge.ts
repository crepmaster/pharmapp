/**
 * requestProposalBridge — Sprint 2A + Sprint 4 (F-BLOC2-P2).
 *
 * Transactional helper that bridges a medicine request offer into the
 * canonical `exchange_proposals` + `deliveries` pipeline.
 *
 * Called by `acceptMedicineRequestOffer`. Two flavors :
 *   - `acceptRequestOfferIntoCanonicalProposal` (purchase) — debits the
 *     buyer wallet, creates an `accepted` proposal + `pending` delivery.
 *   - `acceptExchangeRequestOfferIntoCanonicalProposal` (Sprint 4,
 *     exchange) — reserves only the requester's exchange inventory item
 *     (per lock #5), creates an `accepted` proposal + `pending` delivery,
 *     and does NOT touch any wallet (barter, no soulte — lock #1).
 *
 * Both flavors converge on the same `exchange_proposals` shape via
 * `buildCanonicalProposalDocument` so downstream consumers
 * (`acceptExchangeProposal`, `completeExchangeDelivery`,
 * `cancelExchangeProposal`) see one canonical contract.
 */

import {
  type Transaction,
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { HttpsError } from "firebase-functions/v2/https";
import { citySlug } from "../cityUtils.js";
import { majorToWalletUnits } from "./moneyUnits.js";
import {
  buildCanonicalDeliveryDocument,
  buildCanonicalProposalDocument,
  pharmacyInfoFromDoc,
  reserveExchangeInventory,
  resolveCourierFee,
  type CanonicalExchangeDetails,
  type CanonicalInventorySnapshot,
  type CanonicalPurchaseDetails,
} from "./exchangePipeline.js";

const db = getFirestore();

// ---------------------------------------------------------------------------
// Purchase path (Sprint 2A — refactored in Sprint 4 to share canonical builders)
// ---------------------------------------------------------------------------

export interface RequestOfferBridgeParams {
  /** The user invoking this (requester pharmacy). */
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

export async function acceptRequestOfferIntoCanonicalProposal(
  transaction: Transaction,
  params: RequestOfferBridgeParams
): Promise<RequestOfferBridgeResult> {
  const { callerUid, requestId, offerId } = params;

  // ================================================================
  // PHASE 1: ALL READS
  // ================================================================

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
  if (offerData.offerType !== "purchase") {
    throw new HttpsError(
      "failed-precondition",
      "This bridge only handles 'purchase' offers."
    );
  }

  const sellerUid = offerData.sellerPharmacyId as string;
  const totalPrice = offerData.totalPrice as number;
  const currencyCode = (offerData.currencyCode as string) || "XAF";

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
  const expDate = inventoryData.batch?.expirationDate?.toDate?.();
  if (expDate && expDate < new Date()) {
    throw new HttpsError("failed-precondition", "Seller inventory item has expired.");
  }

  const buyerWalletRef = db.collection("wallets").doc(callerUid);
  const buyerWalletSnap = await transaction.get(buyerWalletRef);
  const buyerWallet = buyerWalletSnap.exists ? buyerWalletSnap.data()! : null;
  const buyerAvailable = (buyerWallet?.available as number) || 0;
  // Buyer is a pharmacy: its wallet stores legacy `major × 100`. `totalPrice`
  // is major, so the check and the debit below both convert it. The ledger
  // `amount` stays in major.
  const totalPriceWalletUnits = majorToWalletUnits(totalPrice, "pharmacy");
  if (buyerAvailable < totalPriceWalletUnits) {
    throw new HttpsError(
      "failed-precondition",
      `Insufficient wallet balance. Available: ${buyerAvailable}, required: ${totalPrice}.`
    );
  }

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

  const otherOffersQuery = db
    .collection("medicine_request_offers")
    .where("requestId", "==", requestId);
  const otherOffersSnap = await transaction.get(otherOffersQuery);

  // ================================================================
  // PHASE 2: ALL WRITES
  // ================================================================

  const now = FieldValue.serverTimestamp();

  // Wallet: available → deducted (skip held, immediate acceptance).
  // Converted to legacy pharmacy units; ledger below stays major.
  transaction.update(buyerWalletRef, {
    available: FieldValue.increment(-totalPriceWalletUnits),
    deducted: FieldValue.increment(totalPriceWalletUnits),
    updatedAt: now,
  });

  const holdLedgerRef = db.collection("ledger").doc();
  transaction.set(holdLedgerRef, {
    type: "proposal_wallet_hold_created",
    proposalId: "", // Backfilled below
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

  const proposalRef = db.collection("exchange_proposals").doc();
  const proposalId = proposalRef.id;
  transaction.update(holdLedgerRef, { proposalId });

  const inventorySnapshot: CanonicalInventorySnapshot = {
    medicineId:
      (offerData.inventorySnapshot?.medicineId as string) ||
      (inventoryData.medicineId as string) ||
      null,
    medicineName:
      (offerData.inventorySnapshot?.medicineName as string) ||
      (inventoryData.medicineName as string) ||
      null,
    genericName:
      (offerData.inventorySnapshot?.genericName as string) ||
      (inventoryData.medicine?.genericName as string) ||
      null,
    strength:
      (offerData.inventorySnapshot?.strength as string) ||
      (inventoryData.medicine?.strength as string) ||
      null,
    form:
      (offerData.inventorySnapshot?.form as string) ||
      (inventoryData.medicine?.form as string) ||
      null,
    packaging:
      (offerData.inventorySnapshot?.packaging as string) ||
      (inventoryData.packaging as string) ||
      null,
    lotNumber:
      (offerData.inventorySnapshot?.lotNumber as string) ||
      (inventoryData.batch?.lotNumber as string) ||
      null,
    expirationDate:
      offerData.inventorySnapshot?.expirationDate ??
      inventoryData.batch?.expirationDate ??
      null,
    availableQuantityAtOffer: availableQty,
  };

  const details: CanonicalPurchaseDetails = {
    type: "purchase",
    quantity: offeredQty,
    unitPrice: offerData.unitPrice as number,
    totalPrice,
    currency: currencyCode,
    medicineName: inventorySnapshot.medicineName,
    medicineId: inventorySnapshot.medicineId,
  };

  const proposalDoc = buildCanonicalProposalDocument(
    {
      proposalId,
      inventoryItemId: offerData.inventoryItemId as string,
      fromPharmacyId: callerUid,
      toPharmacyId: sellerUid,
      details,
      initialStatus: "accepted",
      acceptedBy: sellerUid,
      inventorySnapshot,
      sourceRequestId: requestId,
      sourceOfferId: offerId,
    },
    now
  );
  transaction.set(proposalRef, proposalDoc);

  const deliveryRef = db.collection("deliveries").doc();
  const deliveryId = deliveryRef.id;
  const deliveryDoc = buildCanonicalDeliveryDocument(
    deliveryId,
    {
      proposalId,
      proposalDetails: details,
      pickupPharmacy: pharmacyInfoFromDoc(sellerUid, sellerPharm),
      dropoffPharmacy: pharmacyInfoFromDoc(callerUid, buyerPharm),
      shippedItem: {
        medicineId: (inventoryData.medicineId as string) || "",
        medicineName:
          (inventoryData.medicineName as string) || "Unknown Medicine",
        dosage: (inventoryData.dosage as string) || "",
        form: (inventoryData.form as string) || "",
        quantity: offeredQty,
        packaging: (inventoryData.packaging as string) || "",
      },
      courierFee: Math.round(totalPrice * 0.12),
    },
    now
  );
  transaction.set(deliveryRef, deliveryDoc);
  transaction.update(proposalRef, { deliveryId });

  transaction.update(requestRef, {
    status: "matched",
    selectedOfferId: offerId,
    updatedAt: now,
  });

  transaction.update(offerRef, {
    status: "converted",
    linkedProposalId: proposalId,
    updatedAt: now,
  });

  for (const doc of otherOffersSnap.docs) {
    if (doc.id === offerId) continue;
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

// ---------------------------------------------------------------------------
// Exchange path (Sprint 4 — barter, no soulte)
// ---------------------------------------------------------------------------

export interface ExchangeRequestOfferBridgeParams
  extends RequestOfferBridgeParams {
  /** ID of the requester's inventory item that satisfies `exchangeItem`. */
  exchangeInventoryItemId: string;
}

/**
 * Transactional bridge for the exchange flow.
 *
 * Sprint 4 lock #5: reserves ONLY the requester's exchange inventory item
 * (the item the seller wants in return). The seller's `inventoryItemId`
 * (item A) is validated here but NOT reserved; it gets decremented at
 * `completeExchangeDelivery` like the legacy `createExchangeProposal`
 * flow.
 *
 * Sprint 4 lock #1: no wallet movement — barter only, no soulte.
 */
export async function acceptExchangeRequestOfferIntoCanonicalProposal(
  transaction: Transaction,
  params: ExchangeRequestOfferBridgeParams
): Promise<RequestOfferBridgeResult> {
  const { callerUid, requestId, offerId, exchangeInventoryItemId } = params;

  // ================================================================
  // PHASE 1: ALL READS
  // ================================================================

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
  if (requestData.requestMode !== "exchange") {
    throw new HttpsError(
      "failed-precondition",
      "Request is not in exchange mode."
    );
  }

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
  if (offerData.offerType !== "exchange") {
    throw new HttpsError(
      "failed-precondition",
      "Offer is not in exchange mode."
    );
  }

  const exchangeItem = offerData.exchangeItem as
    | {
        medicineId: string;
        medicineName: string;
        dosage: string;
        form: string;
        quantity: number;
        expiryDate?: string | null;
        lotNumber?: string | null;
      }
    | undefined;
  if (!exchangeItem || typeof exchangeItem !== "object") {
    throw new HttpsError(
      "failed-precondition",
      "Offer is missing exchangeItem and cannot be accepted."
    );
  }

  const sellerUid = offerData.sellerPharmacyId as string;
  const offeredQty = offerData.offeredQuantity as number;

  // Seller's item A — validated only (NO hold; lock #5)
  const sellerInventoryRef = db
    .collection("pharmacy_inventory")
    .doc(offerData.inventoryItemId as string);
  const sellerInventorySnap = await transaction.get(sellerInventoryRef);
  if (!sellerInventorySnap.exists) {
    throw new HttpsError("not-found", "Seller inventory item no longer exists.");
  }
  const sellerInventoryData = sellerInventorySnap.data()!;
  if (sellerInventoryData.pharmacyId !== sellerUid) {
    throw new HttpsError("permission-denied", "Inventory does not belong to seller.");
  }
  const sellerAvailable = (sellerInventoryData.availableQuantity as number) || 0;
  if (sellerAvailable < offeredQty) {
    throw new HttpsError(
      "failed-precondition",
      `Insufficient seller stock. Available: ${sellerAvailable}, offered: ${offeredQty}.`
    );
  }
  const sellerExp = sellerInventoryData.batch?.expirationDate?.toDate?.();
  if (sellerExp && sellerExp < new Date()) {
    throw new HttpsError("failed-precondition", "Seller inventory item has expired.");
  }

  // Requester's exchange item B — read, then validated + reserved
  // (the only side that gets held at accept time; lock #5).
  const requesterInventoryRef = db
    .collection("pharmacy_inventory")
    .doc(exchangeInventoryItemId);
  const requesterInventorySnap = await transaction.get(requesterInventoryRef);

  // Sprint 4 Finding 1 fix: read system_config/main to resolve the
  // per-city courier fee. Without this read the formerly-hard-coded
  // courierFee=0 silently broke lock #6 (50/50 of 0 is 0/0 — no courier
  // pay). The resolver mirrors `acceptExchangeProposal` so both
  // producers of `deliveries` agree on the fee for a given city.
  const systemConfigRef = db.collection("system_config").doc("main");
  const buyerPharmRef = db.collection("pharmacies").doc(callerUid);
  const sellerPharmRef = db.collection("pharmacies").doc(sellerUid);
  const [buyerPharmSnap, sellerPharmSnap, systemConfigSnap] = await Promise.all([
    transaction.get(buyerPharmRef),
    transaction.get(sellerPharmRef),
    transaction.get(systemConfigRef),
  ]);
  if (!buyerPharmSnap.exists || !sellerPharmSnap.exists) {
    throw new HttpsError("not-found", "Pharmacy profile not found.");
  }
  const buyerPharm = buyerPharmSnap.data()!;
  const sellerPharm = sellerPharmSnap.data()!;

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

  const otherOffersQuery = db
    .collection("medicine_request_offers")
    .where("requestId", "==", requestId);
  const otherOffersSnap = await transaction.get(otherOffersQuery);

  // ================================================================
  // PHASE 2: ALL WRITES
  // ================================================================

  const now = FieldValue.serverTimestamp();

  // Reserve requester's exchange inventory item (B). This is the SOLE
  // inventory hold for the exchange flow at acceptance — lock #5.
  const { snapshot: exchangeInventorySnapshot } = reserveExchangeInventory(
    transaction,
    {
      inventorySnap: requesterInventorySnap,
      expectedOwnerUid: callerUid,
      expectedMedicineId: exchangeItem.medicineId,
      expectedDosage: exchangeItem.dosage,
      expectedForm: exchangeItem.form,
      requiredQuantity: exchangeItem.quantity,
      now: new Date(),
    }
  );

  const proposalRef = db.collection("exchange_proposals").doc();
  const proposalId = proposalRef.id;

  // inventorySnapshot for the seller's item A (UI display)
  const sellerSnapshot: CanonicalInventorySnapshot = {
    medicineId: (sellerInventoryData.medicineId as string) || null,
    medicineName: (sellerInventoryData.medicineName as string) || null,
    genericName: (sellerInventoryData.medicine?.genericName as string) || null,
    strength: (sellerInventoryData.medicine?.strength as string) || null,
    form:
      (sellerInventoryData.medicineForm as string) ||
      (sellerInventoryData.form as string) ||
      null,
    packaging: (sellerInventoryData.packaging as string) || null,
    lotNumber:
      (sellerInventoryData.batch?.lotNumber as string) ||
      (sellerInventoryData.batchNumber as string) ||
      null,
    expirationDate: sellerInventoryData.batch?.expirationDate ?? null,
    availableQuantityAtOffer: sellerAvailable,
  };

  const details: CanonicalExchangeDetails = {
    type: "exchange",
    quantity: offeredQty,
    medicineName: sellerSnapshot.medicineName,
    medicineId: sellerSnapshot.medicineId,
    exchangeInventoryItemId,
    exchangeMedicineId: exchangeItem.medicineId,
    exchangeQuantity: exchangeItem.quantity,
    exchangeInventorySnapshot,
  };

  const proposalDoc = buildCanonicalProposalDocument(
    {
      proposalId,
      inventoryItemId: offerData.inventoryItemId as string,
      fromPharmacyId: callerUid, // requester (will receive item A)
      toPharmacyId: sellerUid, // seller (will receive item B back-office)
      details,
      initialStatus: "accepted",
      acceptedBy: sellerUid,
      inventorySnapshot: sellerSnapshot,
      sourceRequestId: requestId,
      sourceOfferId: offerId,
    },
    now
  );
  transaction.set(proposalRef, proposalDoc);

  const deliveryRef = db.collection("deliveries").doc();
  const deliveryId = deliveryRef.id;

  // Sprint 4 Finding 1 fix — courier fee must be resolved from
  // `system_config/main` per city, same formula as `acceptExchangeProposal`.
  // Lock #6 ("50/50 préservé") is meaningful only when the resolved fee
  // is > 0; the prior hard-coded 0 silently broke courier pay on
  // medicine-request exchange. Markets without per-city config still
  // resolve to 0 (no courier pay until ops configures the city), which
  // is the documented no-config posture inherited from the legacy path.
  const courierFee = resolveCourierFee({
    proposalType: "exchange",
    totalPrice: 0,
    countryCode: reqCountry,
    cityCode: reqCity,
    systemConfigData: systemConfigSnap.exists ? systemConfigSnap.data() : undefined,
  });
  logger.info("acceptExchangeRequestOfferIntoCanonicalProposal: resolved courier fee", {
    countryCode: reqCountry,
    cityCode: reqCity,
    courierFee,
  });

  const deliveryDoc = buildCanonicalDeliveryDocument(
    deliveryId,
    {
      proposalId,
      proposalDetails: details,
      pickupPharmacy: pharmacyInfoFromDoc(sellerUid, sellerPharm),
      dropoffPharmacy: pharmacyInfoFromDoc(callerUid, buyerPharm),
      shippedItem: {
        medicineId: (sellerInventoryData.medicineId as string) || "",
        medicineName:
          (sellerInventoryData.medicineName as string) || "Unknown Medicine",
        dosage:
          (sellerInventoryData.medicineDosage as string) ||
          (sellerInventoryData.dosage as string) ||
          "",
        form:
          (sellerInventoryData.medicineForm as string) ||
          (sellerInventoryData.form as string) ||
          "",
        quantity: offeredQty,
        packaging: (sellerInventoryData.packaging as string) || "",
      },
      courierFee,
    },
    now
  );
  // City fallback — buyer's city if the helper inferred nothing useful
  deliveryDoc.cityCode =
    (buyerPharm.cityCode as string) ||
    (sellerPharm.cityCode as string) ||
    citySlug(
      (buyerPharm.city as string) || (sellerPharm.city as string) || ""
    );
  transaction.set(deliveryRef, deliveryDoc);
  transaction.update(proposalRef, { deliveryId });

  transaction.update(requestRef, {
    status: "matched",
    selectedOfferId: offerId,
    updatedAt: now,
  });

  transaction.update(offerRef, {
    status: "converted",
    linkedProposalId: proposalId,
    updatedAt: now,
  });

  for (const doc of otherOffersSnap.docs) {
    if (doc.id === offerId) continue;
    const otherStatus = doc.data().status;
    if (otherStatus === "pending") {
      transaction.update(doc.ref, {
        status: "declined",
        updatedAt: now,
      });
    }
  }

  logger.info("acceptExchangeRequestOfferIntoCanonicalProposal: success", {
    requestId,
    offerId,
    proposalId,
    deliveryId,
    requesterUid: callerUid,
    sellerUid,
    exchangeInventoryItemId,
    exchangeQuantity: exchangeItem.quantity,
  });

  return { proposalId, deliveryId };
}
