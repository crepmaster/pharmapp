/**
 * Sprint 2B.1 — `setCountryLicenseConfig`
 *
 * Admin-only callable that mutates the seven license fields on a
 * country entry under `system_config/main.countries.{countryCode}`.
 *
 * Authorization (mirrors upsertCity / setCourierActive / setPharmacyActive
 * pattern from Sprint 2a admin V2A-C) :
 *   - caller must be authenticated
 *   - admin doc must exist, `isActive=true`
 *   - role `super_admin` OR `permissions` includes `manage_pharmacies`
 *   - non-super_admin must have `countryCode ∈ countryScopes`
 *
 * Side effects :
 *   - dotted-path merge on `countries.{countryCode}.{field}` for each
 *     license field supplied. Other country fields (name, dialCode,
 *     defaultCurrencyCode, ...) are NOT touched.
 *   - bumps `updatedAt` + `updatedByAdminId` on `system_config/main`.
 *
 * Why this callable exists :
 *   The seven license fields are reg-sensitive and consumed by the
 *   backend gate (`licenseGate.ts`) AND the registration callable
 *   (`createPharmacyRegistration.ts`). They cannot remain on the
 *   client-direct-write path that the other country fields still use
 *   today. Migrating ALL country writes to backend-owned is out of
 *   Sprint 2B.1 scope ; the licence-only callable is the minimum
 *   move to satisfy the architect's locked decisions.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;

interface SetCountryLicenseConfigInput {
  countryCode: string;
  licenseRequired?: boolean;
  licenseLabel?: string;
  licenseHelpText?: string;
  licenseVerificationRequired?: boolean;
  licenseFormatRegex?: string;
  licenseDocumentRequired?: boolean;
  licenseGracePeriodDays?: number;
}

/**
 * Pure validator for the input — exported for unit testing. Throws
 * `HttpsError` with `invalid-argument` on any problem.
 */
export function validateSetCountryLicenseConfigInput(
  data: SetCountryLicenseConfigInput
): void {
  if (!data.countryCode || typeof data.countryCode !== "string") {
    throw new HttpsError("invalid-argument", "countryCode is required.");
  }
  if (!COUNTRY_CODE_REGEX.test(data.countryCode)) {
    throw new HttpsError(
      "invalid-argument",
      "countryCode must be ISO 3166-1 alpha-2 uppercase (e.g. 'CM')."
    );
  }
  // At least ONE license field must be present (otherwise nothing to do).
  const hasAtLeastOne =
    "licenseRequired" in data ||
    "licenseLabel" in data ||
    "licenseHelpText" in data ||
    "licenseVerificationRequired" in data ||
    "licenseFormatRegex" in data ||
    "licenseDocumentRequired" in data ||
    "licenseGracePeriodDays" in data;
  if (!hasAtLeastOne) {
    throw new HttpsError(
      "invalid-argument",
      "Supply at least one license field to update."
    );
  }

  if ("licenseRequired" in data && typeof data.licenseRequired !== "boolean") {
    throw new HttpsError("invalid-argument", "licenseRequired must be a boolean.");
  }
  if ("licenseLabel" in data) {
    if (typeof data.licenseLabel !== "string") {
      throw new HttpsError("invalid-argument", "licenseLabel must be a string.");
    }
    if (data.licenseLabel.length > 200) {
      throw new HttpsError(
        "invalid-argument",
        "licenseLabel exceeds 200 characters."
      );
    }
  }
  if ("licenseHelpText" in data) {
    if (typeof data.licenseHelpText !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "licenseHelpText must be a string."
      );
    }
    if (data.licenseHelpText.length > 2000) {
      throw new HttpsError(
        "invalid-argument",
        "licenseHelpText exceeds 2000 characters."
      );
    }
  }
  if (
    "licenseVerificationRequired" in data &&
    typeof data.licenseVerificationRequired !== "boolean"
  ) {
    throw new HttpsError(
      "invalid-argument",
      "licenseVerificationRequired must be a boolean."
    );
  }
  if ("licenseFormatRegex" in data) {
    if (typeof data.licenseFormatRegex !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "licenseFormatRegex must be a string."
      );
    }
    if (data.licenseFormatRegex.length > 500) {
      throw new HttpsError(
        "invalid-argument",
        "licenseFormatRegex exceeds 500 characters."
      );
    }
    // Reject regex sources that won't compile, so a bad admin write
    // doesn't poison registration later.
    if (data.licenseFormatRegex.length > 0) {
      try {
        new RegExp(data.licenseFormatRegex);
      } catch {
        throw new HttpsError(
          "invalid-argument",
          "licenseFormatRegex is not a valid regular expression."
        );
      }
    }
  }
  if (
    "licenseDocumentRequired" in data &&
    typeof data.licenseDocumentRequired !== "boolean"
  ) {
    throw new HttpsError(
      "invalid-argument",
      "licenseDocumentRequired must be a boolean."
    );
  }
  if ("licenseGracePeriodDays" in data) {
    const d = data.licenseGracePeriodDays;
    if (
      typeof d !== "number" ||
      !Number.isFinite(d) ||
      !Number.isInteger(d) ||
      d < 1 ||
      d > 365
    ) {
      throw new HttpsError(
        "invalid-argument",
        "licenseGracePeriodDays must be an integer between 1 and 365."
      );
    }
  }
}

export const setCountryLicenseConfig = onCall<SetCountryLicenseConfigInput>(
  { region: "europe-west1", cors: true },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const data = request.data ?? ({} as SetCountryLicenseConfigInput);
    validateSetCountryLicenseConfigInput(data);
    const countryCode = data.countryCode.trim();

    // Admin guard — same pattern as upsertCity / setCourierActive.
    const adminSnap = await db.collection("admins").doc(callerUid).get();
    if (!adminSnap.exists) {
      throw new HttpsError("permission-denied", "Admin profile not found.");
    }
    const admin = adminSnap.data() ?? {};
    if (admin.isActive !== true) {
      throw new HttpsError("permission-denied", "Admin account is inactive.");
    }
    const role = admin.role as string | undefined;
    const permissions = Array.isArray(admin.permissions)
      ? (admin.permissions as string[])
      : [];
    const canManage =
      role === "super_admin" || permissions.includes("manage_pharmacies");
    if (!canManage) {
      throw new HttpsError(
        "permission-denied",
        "manage_pharmacies permission required."
      );
    }
    if (role !== "super_admin") {
      const countryScopes = Array.isArray(admin.countryScopes)
        ? (admin.countryScopes as string[])
        : [];
      if (countryScopes.length === 0) {
        throw new HttpsError(
          "failed-precondition",
          "Admin has no country scope configured. Contact super admin."
        );
      }
      if (!countryScopes.includes(countryCode)) {
        throw new HttpsError(
          "permission-denied",
          `Country '${countryCode}' is outside your scope.`
        );
      }
    }

    // Verify country exists in system_config so we never invent one.
    const configRef = db.collection("system_config").doc("main");
    const configSnap = await configRef.get();
    if (!configSnap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "System configuration not initialized."
      );
    }
    const configData = configSnap.data() ?? {};
    const countries = (configData.countries as Record<string, unknown>) ?? {};
    if (!(countryCode in countries)) {
      throw new HttpsError(
        "not-found",
        `Country '${countryCode}' not found in system config.`
      );
    }

    // Dotted-path merge — only touch the license fields supplied.
    const updatePayload: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedByAdminId: callerUid,
    };
    const written: string[] = [];
    const setField = <K extends keyof SetCountryLicenseConfigInput>(field: K) => {
      if (field in data) {
        updatePayload[`countries.${countryCode}.${String(field)}`] = data[field];
        written.push(String(field));
      }
    };
    setField("licenseRequired");
    setField("licenseLabel");
    setField("licenseHelpText");
    setField("licenseVerificationRequired");
    setField("licenseFormatRegex");
    setField("licenseDocumentRequired");
    setField("licenseGracePeriodDays");

    await configRef.update(updatePayload);

    logger.info("setCountryLicenseConfig: written", {
      callerUid,
      countryCode,
      fields: written,
    });

    return {
      ok: true,
      countryCode,
      fields: written,
    };
  }
);
