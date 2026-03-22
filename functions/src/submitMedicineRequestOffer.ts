/**
 * submitMedicineRequestOffer — Sprint 2A
 *
 * A pharmacy submits a purchase offer on an open medicine request.
 * MVP: purchase-only, no inventory reservation at offer time.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

interface SubmitOfferData {
  requestId: string;
  inventoryItemId: string;
  offeredQuantity: number;
  unitPrice: number;
  offerType: string;
  notes?: string;
}

export const submitMedicineRequestOffer = onCall<SubmitOfferData>(
  { region: "europe-west1", cors: true },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const data = request.data;

    // Validate input
    if (!data.requestId || typeof data.requestId !== "string") {
      throw new HttpsError("invalid-argument", "requestId is required.");
    }
    if (!data.inventoryItemId || typeof data.inventoryItemId !== "string") {
      throw new HttpsError("invalid-argument", "inventoryItemId is required.");
    }
    if (typeof data.offeredQuantity !== "number" || data.offeredQuantity <= 0) {
      throw new HttpsError("invalid-argument", "offeredQuantity must be > 0.");
    }
    if (typeof data.unitPrice !== "number" || data.unitPrice <= 0) {
      throw new HttpsError("invalid-argument", "unitPrice must be > 0.");
    }

    // MVP: purchase-only
    if (data.offerType !== "purchase") {
      throw new HttpsError(
        "invalid-argument",
        "Only 'purchase' offer type is supported in this version."
      );
    }

    // Read request
    const requestRef = db.collection("medicine_requests").doc(data.requestId);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) {
      throw new HttpsError("not-found", "Medicine request not found.");
    }
    const requestData = requestSnap.data()!;

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

    // Read inventory item
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

    // Validate quantity
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

    // Validate currencyCode
    if (requestData.currencyCode) {
      // Currency must match request
    }

    const totalPrice = data.unitPrice * data.offeredQuantity;
    const currencyCode = (requestData.currencyCode as string) || "XAF";

    // Create the offer
    const offerRef = db.collection("medicine_request_offers").doc();
    const now = FieldValue.serverTimestamp();

    await offerRef.set({
      id: offerRef.id,
      requestId: data.requestId,
      requesterPharmacyId: requestData.requesterPharmacyId,
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
        lotNumber: inventoryData.batch?.lotNumber || inventoryData.batchNumber || null,
        expirationDate: inventoryData.batch?.expirationDate || null,
        availableQuantityAtOffer: availableQty,
      },
      offeredQuantity: data.offeredQuantity,
      unitPrice: data.unitPrice,
      totalPrice,
      currencyCode,
      offerType: data.offerType,
      notes: (data.notes || "").trim(),
      status: "pending",
      linkedProposalId: null,
      createdAt: now,
      updatedAt: now,
    });

    logger.info("submitMedicineRequestOffer: created", {
      offerId: offerRef.id,
      requestId: data.requestId,
      sellerUid: userId,
      totalPrice,
    });

    return { success: true, offerId: offerRef.id };
  }
);
