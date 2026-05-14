/**
 * submitMedicineRequestOffer — Sprint 2A + Sprint 4 (F-BLOC2-P2).
 *
 * A pharmacy submits an offer on an open medicine request.
 *
 * Sprint 4 changes :
 *  - `offerType` must STRICTLY match the parent request's `requestMode`.
 *  - `purchase` offers require `unitPrice > 0` and forbid `exchangeItem`.
 *  - `exchange` offers require a valid `exchangeItem` describing what the
 *    seller wants in return; `unitPrice` is ignored (forced to 0) and
 *    `totalPrice` is 0 (barter, no soulte — lock #1, #4).
 *  - License gate enforced on BOTH seller (caller) and requester
 *    counterparty (lock #8).
 *  - No inventory reservation at submit (lock #5).
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { assertLicenseAllowsMarketplace } from "./lib/licenseGate.js";
import {
  assertCanonicalMode,
  assertOfferMatchesRequest,
  validateExchangeItemInput,
  type CanonicalProposalType,
} from "./lib/exchangePipeline.js";

const db = getFirestore();

interface SubmitOfferData {
  requestId: string;
  inventoryItemId: string;
  offeredQuantity: number;
  unitPrice?: number;
  offerType: string;
  exchangeItem?: unknown;
  notes?: string;
}

export const submitMedicineRequestOffer = onCall<SubmitOfferData>(
  { region: "europe-west1", cors: true },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    // 🔒 F-LICENSE GATE (Sprint 2a) — seller (caller).
    await assertLicenseAllowsMarketplace(db, userId);

    const data = request.data;

    // Validate basic input
    if (!data.requestId || typeof data.requestId !== "string") {
      throw new HttpsError("invalid-argument", "requestId is required.");
    }
    if (!data.inventoryItemId || typeof data.inventoryItemId !== "string") {
      throw new HttpsError("invalid-argument", "inventoryItemId is required.");
    }
    if (typeof data.offeredQuantity !== "number" || data.offeredQuantity <= 0) {
      throw new HttpsError("invalid-argument", "offeredQuantity must be > 0.");
    }

    // Sprint 4: strict canonical mode.
    const offerType: CanonicalProposalType = assertCanonicalMode(
      data.offerType,
      "offerType"
    );

    // Read request — needed to enforce parity AND license gate counterparty
    const requestRef = db.collection("medicine_requests").doc(data.requestId);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) {
      throw new HttpsError("not-found", "Medicine request not found.");
    }
    const requestData = requestSnap.data()!;

    // Sprint 4 lock #2: offerType must STRICTLY equal request.requestMode.
    // Backwards-compat note: legacy `medicine_requests` documents created
    // pre-Sprint-4 may carry `requestMode: "purchase"` (only mode allowed
    // then). They remain compatible because purchase ↔ purchase still
    // matches.
    const requestMode = assertCanonicalMode(
      requestData.requestMode,
      "request.requestMode"
    );
    assertOfferMatchesRequest(offerType, requestMode);

    // Mode-specific input validation
    let validatedUnitPrice = 0;
    let validatedExchangeItem: ReturnType<typeof validateExchangeItemInput> | null = null;

    if (offerType === "purchase") {
      if (typeof data.unitPrice !== "number" || data.unitPrice <= 0) {
        throw new HttpsError("invalid-argument", "unitPrice must be > 0.");
      }
      validatedUnitPrice = data.unitPrice;
      if (data.exchangeItem !== undefined && data.exchangeItem !== null) {
        throw new HttpsError(
          "invalid-argument",
          "exchangeItem must be omitted for purchase offers."
        );
      }
    } else {
      // exchange
      validatedExchangeItem = validateExchangeItemInput(data.exchangeItem);
      // unitPrice silently coerced to 0 — barter, no soulte (lock #1).
      validatedUnitPrice = 0;
    }

    // Validate request is open and not expired
    if (requestData.status !== "open") {
      throw new HttpsError(
        "failed-precondition",
        `Request is '${requestData.status}', not open.`
      );
    }
    const expiresAt = requestData.expiresAt?.toDate?.();
    if (expiresAt && expiresAt < new Date()) {
      throw new HttpsError("failed-precondition", "Request has expired.");
    }

    // Cannot respond to own request
    if (requestData.requesterPharmacyId === userId) {
      throw new HttpsError(
        "invalid-argument",
        "Cannot submit an offer on your own request."
      );
    }

    // 🔒 F-LICENSE GATE COUNTERPARTY (Sprint 4 lock #8) — requester
    // must also be marketplace-eligible at submit time.
    const requesterUid = requestData.requesterPharmacyId as string | undefined;
    if (typeof requesterUid !== "string" || requesterUid.length === 0) {
      throw new HttpsError(
        "failed-precondition",
        "Request is missing requester information and cannot receive offers."
      );
    }
    await assertLicenseAllowsMarketplace(db, requesterUid);

    // Read seller pharmacy
    const sellerPharmRef = db.collection("pharmacies").doc(userId);
    const sellerPharmSnap = await sellerPharmRef.get();
    if (!sellerPharmSnap.exists) {
      throw new HttpsError("not-found", "Seller pharmacy profile not found.");
    }
    const sellerPharm = sellerPharmSnap.data()!;

    // Validate same city
    const sellerCountry = (sellerPharm.countryCode as string) || "";
    const sellerCity = (sellerPharm.cityCode as string) || "";
    if (
      sellerCountry !== requestData.countryCode ||
      sellerCity !== requestData.cityCode
    ) {
      throw new HttpsError(
        "failed-precondition",
        "You can only respond to requests in your city."
      );
    }

    // Validate subscription (including trial expiry check)
    const subStatus = sellerPharm.subscriptionStatus as string;
    if (subStatus !== "active" && subStatus !== "trial") {
      throw new HttpsError(
        "failed-precondition",
        "Active subscription required to submit offers."
      );
    }
    if (subStatus === "trial") {
      const trialEnd = sellerPharm.subscriptionEndDate?.toDate?.();
      if (trialEnd && trialEnd < new Date()) {
        throw new HttpsError(
          "failed-precondition",
          "Trial subscription has expired."
        );
      }
    }

    // Read inventory item (seller's stock — item A that satisfies the request)
    const inventoryRef = db
      .collection("pharmacy_inventory")
      .doc(data.inventoryItemId);
    const inventorySnap = await inventoryRef.get();
    if (!inventorySnap.exists) {
      throw new HttpsError("not-found", "Inventory item not found.");
    }
    const inventoryData = inventorySnap.data()!;

    // Validate ownership
    if (inventoryData.pharmacyId !== userId) {
      throw new HttpsError(
        "permission-denied",
        "Inventory item does not belong to you."
      );
    }

    // Validate not expired
    const expDate = inventoryData.batch?.expirationDate?.toDate?.();
    if (expDate && expDate < new Date()) {
      throw new HttpsError("failed-precondition", "Inventory item has expired.");
    }

    // Validate quantity (no reservation — lock #5)
    const availableQty = (inventoryData.availableQuantity as number) || 0;
    if (availableQty < data.offeredQuantity) {
      throw new HttpsError(
        "failed-precondition",
        `Insufficient stock. Available: ${availableQty}, offered: ${data.offeredQuantity}.`
      );
    }

    // Validate medicineId matches request
    const itemMedicineId = (inventoryData.medicineId as string) || "";
    if (requestData.medicineId && itemMedicineId !== requestData.medicineId) {
      throw new HttpsError(
        "invalid-argument",
        "Inventory medicine does not match the requested medicine."
      );
    }

    const totalPrice = validatedUnitPrice * data.offeredQuantity;
    const currencyCode = (requestData.currencyCode as string) || "XAF";

    // Create the offer
    const offerRef = db.collection("medicine_request_offers").doc();
    const now = FieldValue.serverTimestamp();

    const offerDoc: Record<string, unknown> = {
      id: offerRef.id,
      requestId: data.requestId,
      requesterPharmacyId: requesterUid,
      sellerPharmacyId: userId,
      sellerSnapshot: {
        pharmacyName:
          sellerPharm.pharmacyName ||
          sellerPharm.name ||
          sellerPharm.displayName ||
          "",
        address: sellerPharm.address || "",
        phone: sellerPharm.phoneNumber || "",
      },
      inventoryItemId: data.inventoryItemId,
      inventorySnapshot: {
        medicineId: inventoryData.medicineId || null,
        medicineName: inventoryData.medicineName || null,
        genericName: inventoryData.medicine?.genericName || null,
        strength: inventoryData.medicine?.strength || null,
        form: inventoryData.medicine?.form || null,
        packaging: inventoryData.packaging || null,
        lotNumber:
          inventoryData.batch?.lotNumber || inventoryData.batchNumber || null,
        expirationDate: inventoryData.batch?.expirationDate || null,
        availableQuantityAtOffer: availableQty,
      },
      offeredQuantity: data.offeredQuantity,
      unitPrice: validatedUnitPrice,
      totalPrice,
      currencyCode,
      offerType,
      notes: (data.notes || "").trim(),
      status: "pending",
      linkedProposalId: null,
      createdAt: now,
      updatedAt: now,
    };

    if (offerType === "exchange" && validatedExchangeItem) {
      offerDoc.exchangeItem = {
        medicineId: validatedExchangeItem.medicineId,
        medicineName: validatedExchangeItem.medicineName,
        dosage: validatedExchangeItem.dosage,
        form: validatedExchangeItem.form,
        quantity: validatedExchangeItem.quantity,
        expiryDate: validatedExchangeItem.expiryDate,
        lotNumber: validatedExchangeItem.lotNumber,
      };
    }

    await offerRef.set(offerDoc);

    logger.info("submitMedicineRequestOffer: created", {
      offerId: offerRef.id,
      requestId: data.requestId,
      sellerUid: userId,
      offerType,
      totalPrice,
    });

    return { success: true, offerId: offerRef.id };
  }
);
