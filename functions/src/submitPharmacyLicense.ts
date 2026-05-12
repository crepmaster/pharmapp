/**
 * Sprint 2a F-LICENSE — `submitPharmacyLicense`
 *
 * Owner-only callable that lets a pharmacy submit (or resubmit after a
 * rejection / correction_needed) its license number + optional document
 * URL + optional expiry date. Metadata-only in 2a — no real file upload
 * (Sprint 2b will wire Firebase Storage if needed).
 *
 * Status transitions written by this callable :
 *   <any> → `pending_verification` (verification is admin-driven)
 *
 * Backend-controlled fields (`licenseVerifiedBy`, `licenseVerifiedAt`,
 * `licenseRejectionReason`) are managed by `adminVerifyPharmacyLicense`,
 * not here. Firestore rules deny client writes to those fields anyway —
 * this callable is the only legitimate path for a pharmacy to mutate its
 * license metadata.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

interface SubmitLicenseInput {
  licenseNumber?: string | null;
  /**
   * Optional override of the pharmacy's stored countryCode (e.g. if the
   * pharmacy moves to a different country). Defaults to the pharmacy's
   * current `countryCode`.
   */
  licenseCountryCode?: string | null;
  /**
   * Opaque URL. In 2a this can be any string the client supplies. Real
   * Firebase Storage upload + signed URL generation is Sprint 2b scope.
   */
  licenseDocumentUrl?: string | null;
  /** Epoch milliseconds. Stored as a Firestore Timestamp. */
  licenseExpiryDate?: number | null;
}

export const submitPharmacyLicense = onCall<SubmitLicenseInput>(
  { region: "europe-west1", cors: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const data = request.data ?? {};
    const licenseNumberRaw = data.licenseNumber;
    if (typeof licenseNumberRaw !== "string" || licenseNumberRaw.trim() === "") {
      throw new HttpsError(
        "invalid-argument",
        "licenseNumber is required."
      );
    }
    const licenseNumber = licenseNumberRaw.trim();

    // Load pharmacy doc — also serves as a permission check.
    const pharmacyRef = db.collection("pharmacies").doc(uid);
    const pharmacySnap = await pharmacyRef.get();
    if (!pharmacySnap.exists) {
      throw new HttpsError(
        "permission-denied",
        "Pharmacy account not found."
      );
    }
    const pharmacy = pharmacySnap.data() ?? {};

    const effectiveCountryCode =
      (typeof data.licenseCountryCode === "string" &&
        data.licenseCountryCode.trim() !== "")
        ? data.licenseCountryCode.trim()
        : (pharmacy.countryCode as string | undefined);
    if (!effectiveCountryCode) {
      throw new HttpsError(
        "failed-precondition",
        "Pharmacy country must be set before submitting a license."
      );
    }

    // Load country config to check the format regex if any.
    const sysConfigSnap = await db
      .collection("system_config")
      .doc("main")
      .get();
    const sysConfig = (sysConfigSnap.data() ?? {}) as {
      countries?: Record<
        string,
        | {
            licenseFormatRegex?: string;
          }
        | undefined
      >;
    };
    const country = sysConfig.countries?.[effectiveCountryCode] ?? null;

    if (country?.licenseFormatRegex && typeof country.licenseFormatRegex === "string") {
      let re: RegExp;
      try {
        re = new RegExp(country.licenseFormatRegex);
      } catch (err) {
        // Misconfigured regex on the country doc — fail closed without
        // leaking the regex source to the caller.
        logger.error("submitPharmacyLicense: invalid licenseFormatRegex", {
          countryCode: effectiveCountryCode,
          err: String(err),
        });
        throw new HttpsError(
          "failed-precondition",
          "License validation is misconfigured. Please contact support."
        );
      }
      if (!re.test(licenseNumber)) {
        throw new HttpsError(
          "invalid-argument",
          "License number does not match the required format."
        );
      }
    }

    const update: Record<string, unknown> = {
      licenseNumber,
      licenseCountryCode: effectiveCountryCode,
      licenseStatus: "pending_verification",
      // Clear any stale rejection reason on resubmit.
      licenseRejectionReason: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (typeof data.licenseDocumentUrl === "string" && data.licenseDocumentUrl.trim() !== "") {
      update.licenseDocumentUrl = data.licenseDocumentUrl.trim();
    }
    if (data.licenseExpiryDate != null) {
      if (
        typeof data.licenseExpiryDate !== "number" ||
        !Number.isFinite(data.licenseExpiryDate)
      ) {
        throw new HttpsError(
          "invalid-argument",
          "licenseExpiryDate must be a number of milliseconds."
        );
      }
      update.licenseExpiryDate = Timestamp.fromMillis(data.licenseExpiryDate);
    }

    await pharmacyRef.update(update);
    logger.info("submitPharmacyLicense: pending_verification", {
      uid,
      countryCode: effectiveCountryCode,
    });

    return {
      ok: true,
      licenseStatus: "pending_verification" as const,
    };
  }
);
