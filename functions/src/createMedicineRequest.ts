/**
 * createMedicineRequest — Sprint 2A
 *
 * Creates a medicine request in the requester's city.
 * MVP: purchase-only (requestMode must be "purchase").
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

interface CreateRequestData {
  medicineId: string;
  medicineSnapshot: Record<string, unknown>;
  requestedQuantity: number;
  requestMode: string;
  currencyCode: string;
  notes?: string;
}

export const createMedicineRequest = onCall<CreateRequestData>(
  { region: "europe-west1", cors: true },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const data = request.data;

    // Validate input
    if (!data.medicineId || typeof data.medicineId !== "string") {
      throw new HttpsError("invalid-argument", "medicineId is required.");
    }
    if (typeof data.requestedQuantity !== "number" || data.requestedQuantity <= 0) {
      throw new HttpsError("invalid-argument", "requestedQuantity must be > 0.");
    }
    if (!data.currencyCode || typeof data.currencyCode !== "string") {
      throw new HttpsError("invalid-argument", "currencyCode is required.");
    }

    // MVP: purchase-only
    if (data.requestMode !== "purchase") {
      throw new HttpsError(
        "invalid-argument",
        "Only 'purchase' mode is supported in this version."
      );
    }

    // Read pharmacy profile
    const pharmacyRef = db.collection("pharmacies").doc(userId);
    const pharmacySnap = await pharmacyRef.get();
    if (!pharmacySnap.exists) {
      throw new HttpsError("not-found", "Pharmacy profile not found.");
    }
    const pharmacy = pharmacySnap.data()!;

    const countryCode = (pharmacy.countryCode as string) || "";
    const cityCode = (pharmacy.cityCode as string) || "";
    if (!countryCode || !cityCode) {
      throw new HttpsError(
        "failed-precondition",
        "Pharmacy must have countryCode and cityCode configured."
      );
    }

    // Validate subscription active (including trial expiry check)
    const subStatus = pharmacy.subscriptionStatus as string;
    if (subStatus !== "active" && subStatus !== "trial") {
      throw new HttpsError(
        "failed-precondition",
        "Active subscription required to create requests."
      );
    }
    if (subStatus === "trial") {
      const trialEnd = pharmacy.subscriptionEndDate?.toDate?.();
      if (trialEnd && trialEnd < new Date()) {
        throw new HttpsError(
          "failed-precondition",
          "Trial subscription has expired."
        );
      }
    }

    // Validate currencyCode matches country
    const configSnap = await db.collection("system_config").doc("main").get();
    if (configSnap.exists) {
      const countries = (configSnap.data()?.countries as Record<string, any>) || {};
      const country = countries[countryCode];
      if (country?.defaultCurrencyCode && data.currencyCode !== country.defaultCurrencyCode) {
        throw new HttpsError(
          "invalid-argument",
          `currencyCode must be '${country.defaultCurrencyCode}' for country '${countryCode}'.`
        );
      }
    }

    // Create the request
    const requestRef = db.collection("medicine_requests").doc();
    const now = FieldValue.serverTimestamp();

    await requestRef.set({
      id: requestRef.id,
      requesterPharmacyId: userId,
      requesterSnapshot: {
        pharmacyName: pharmacy.pharmacyName || pharmacy.name || pharmacy.displayName || "",
        address: pharmacy.address || "",
        phone: pharmacy.phoneNumber || "",
      },
      countryCode,
      cityCode,
      medicineId: data.medicineId,
      medicineSnapshot: data.medicineSnapshot || {},
      requestedQuantity: data.requestedQuantity,
      requestMode: data.requestMode,
      currencyCode: data.currencyCode,
      notes: (data.notes || "").trim(),
      status: "open",
      selectedOfferId: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    logger.info("createMedicineRequest: created", {
      requestId: requestRef.id,
      userId,
      medicineId: data.medicineId,
      cityCode,
    });

    return { success: true, requestId: requestRef.id };
  }
);
