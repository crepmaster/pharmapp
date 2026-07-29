/**
 * TD-COURIER-ASSIGN-GUARD (Lot A — expand) — `createCourierRegistration`.
 *
 * Backend-owned courier registration callable. Mirrors
 * `createPharmacyRegistration` (phase 1) so a courier profile becomes a
 * fully authoritative source of territory + currency, instead of a
 * client-written document whose `countryCode`/`cityCode` could be forged at
 * signup and then "frozen" while still being wrong.
 *
 * Creates, via Admin SDK, atomically (anti-orphan on failure):
 *   - Firebase Auth user,
 *   - `users/{uid}` (role: courier),
 *   - `couriers/{uid}` (territory canonicalised + validated SERVER-SIDE),
 *   - `wallets/{uid}` (currency derived from the country; courier wallets
 *     store raw major — the doc shape is identical, the ×100 convention is a
 *     write-time boundary, not a doc field).
 *
 * Couriers have NO subscription and NO license (unlike pharmacies), so those
 * branches are absent here. The territory/currency validation is identical:
 * countryCode upper-cased + ISO, country configured AND enabled, cityCode
 * canonicalised + present + enabled under that country, currency derived +
 * usable. The client currency is never authoritative.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { checkCurrencyConfigured } from "./lib/currencyResolver.js";
import { citySlug } from "./cityUtils.js";

const auth = getAuth();
const db = getFirestore();

interface CreateCourierRegistrationInput {
  email?: string;
  password?: string;
  /**
   * Free-form courier profile data (fullName, phoneNumber, vehicleType,
   * licensePlate, countryCode, cityCode, displayName, ...). We extract the
   * fields we care about explicitly and pass the rest through into
   * `couriers/{uid}`.
   */
  profileData?: Record<string, unknown>;
}

interface CreateCourierRegistrationResult {
  uid: string;
  email: string;
}

export const createCourierRegistration = onCall<CreateCourierRegistrationInput>(
  { region: "europe-west1", cors: true },
  async (request): Promise<CreateCourierRegistrationResult> => {
    // Open to unauthenticated callers — a registration runs before the account.
    const data = request.data ?? {};

    // ---- 1. Validate inputs ------------------------------------------------
    const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    const password = typeof data.password === "string" ? data.password : "";
    const profile = (data.profileData && typeof data.profileData === "object")
      ? (data.profileData as Record<string, unknown>)
      : {};

    if (!email || !email.includes("@")) {
      throw new HttpsError("invalid-argument", "Valid email is required.");
    }
    if (!password || password.length < 8) {
      throw new HttpsError(
        "invalid-argument",
        "Password must be at least 8 characters."
      );
    }
    const fullName = typeof profile.fullName === "string" ? profile.fullName.trim() : "";
    const phoneNumber = typeof profile.phoneNumber === "string"
      ? profile.phoneNumber.trim()
      : "";
    const vehicleType = typeof profile.vehicleType === "string"
      ? profile.vehicleType.trim()
      : "";
    const licensePlate = typeof profile.licensePlate === "string"
      ? profile.licensePlate.trim()
      : "";
    // Canonicalise-then-validate, identical to the pharmacy contract.
    const countryCode = typeof profile.countryCode === "string"
      ? profile.countryCode.trim().toUpperCase()
      : "";
    const cityCodeRaw = typeof profile.cityCode === "string"
      ? profile.cityCode.trim()
      : "";

    if (!fullName || !phoneNumber || !vehicleType || !licensePlate) {
      throw new HttpsError(
        "invalid-argument",
        "Courier profile must include fullName, phoneNumber, vehicleType, and licensePlate."
      );
    }
    if (!countryCode) {
      throw new HttpsError(
        "invalid-argument",
        "countryCode is required for courier registration."
      );
    }
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      throw new HttpsError(
        "invalid-argument",
        "countryCode must be an ISO 3166-1 alpha-2 code (two letters)."
      );
    }
    if (!cityCodeRaw) {
      throw new HttpsError(
        "invalid-argument",
        "cityCode is required for courier registration."
      );
    }

    // ---- 2. Read system_config (SERVER-SIDE source of truth) ---------------
    const sysConfigSnap = await db.collection("system_config").doc("main").get();
    const sysConfig = (sysConfigSnap.data() ?? {}) as {
      countries?: Record<string, {
        defaultCurrencyCode?: string;
        enabled?: boolean;
      } | undefined>;
      citiesByCountry?: Record<
        string,
        Record<string, { enabled?: boolean } | undefined> | undefined
      >;
      currencies?: Record<string, { enabled?: unknown } | undefined>;
    };
    const country = sysConfig.countries?.[countryCode];
    if (!country) {
      throw new HttpsError(
        "failed-precondition",
        "Country is not configured. Please contact support."
      );
    }
    if (country.enabled !== true) {
      throw new HttpsError(
        "failed-precondition",
        "Country is not enabled for registration. Please contact support.",
        { code: "COUNTRY_NOT_ENABLED" }
      );
    }

    const cityCode = citySlug(cityCodeRaw);
    const cityEntry = sysConfig.citiesByCountry?.[countryCode]?.[cityCode];
    if (!cityEntry || cityEntry.enabled !== true) {
      throw new HttpsError(
        "failed-precondition",
        "City is not a valid enabled city for this country.",
        { code: "CITY_INVALID_FOR_COUNTRY" }
      );
    }

    // Currency derived SERVER-SIDE from the country, and from nothing else.
    const derivedCurrency = country.defaultCurrencyCode;
    if (typeof derivedCurrency !== "string" || derivedCurrency.length === 0) {
      throw new HttpsError(
        "failed-precondition",
        `Country ${countryCode} has no operating currency configured.`,
        { code: "COUNTRY_CURRENCY_UNCONFIGURED" }
      );
    }
    const currencySupport = checkCurrencyConfigured(sysConfig, derivedCurrency);
    if (!currencySupport.ok) {
      throw new HttpsError(
        "failed-precondition",
        `Currency ${derivedCurrency} is not available on this platform.`,
        { code: "CURRENCY_NOT_SUPPORTED", reason: currencySupport.reason }
      );
    }

    // ---- 3. Create Firebase Auth user (Admin SDK) -------------------------
    let createdUid: string | null = null;
    try {
      const userRecord = await auth.createUser({
        email,
        password,
        emailVerified: false,
      });
      createdUid = userRecord.uid;

      // ---- 4. Write Firestore docs (users + couriers + wallet) ----------
      const now = FieldValue.serverTimestamp();

      const courierDoc: Record<string, unknown> = {
        email,
        fullName,
        phoneNumber,
        vehicleType,
        licensePlate,
        countryCode,
        // Server-canonicalised, country-validated.
        cityCode,
        role: "courier",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      // Pass through any optional profile fields we have not explicitly
      // consumed (locationData, displayName, operatingCity, …). The canonical
      // territory fields are never overwritten by the raw client payload.
      for (const [k, v] of Object.entries(profile)) {
        if (k in courierDoc) continue;
        if (
          k === "fullName" || k === "phoneNumber" || k === "vehicleType" ||
          k === "licensePlate" || k === "countryCode" || k === "cityCode"
        ) {
          continue;
        }
        if (v === undefined) continue;
        courierDoc[k] = v;
      }

      const usersDoc = {
        uid: createdUid,
        email,
        displayName: typeof profile.displayName === "string" && profile.displayName.trim().length > 0
          ? profile.displayName
          : fullName,
        phoneNumber,
        role: "courier",
        isActive: true,
        createdAt: now,
      };

      // Courier wallet — currency derived from the country. Courier wallets
      // hold raw major; the doc shape matches the pharmacy wallet.
      const walletDoc = {
        available: 0,
        held: 0,
        currency: derivedCurrency,
        createdAt: now,
        updatedAt: now,
      };

      const batch = db.batch();
      batch.set(db.collection("users").doc(createdUid), usersDoc);
      batch.set(db.collection("couriers").doc(createdUid), courierDoc);
      batch.set(db.collection("wallets").doc(createdUid), walletDoc);
      await batch.commit();

      logger.info("createCourierRegistration: success", {
        uid: createdUid,
        countryCode,
        cityCode,
      });

      return { uid: createdUid, email };
    } catch (err) {
      // Anti-orphan : delete the Auth user if the Firestore write failed.
      if (createdUid) {
        try {
          await auth.deleteUser(createdUid);
          logger.warn(
            "createCourierRegistration: anti-orphan deleted Auth user after Firestore failure",
            { uid: createdUid }
          );
        } catch (cleanupErr) {
          logger.error(
            "createCourierRegistration: ANTI-ORPHAN CLEANUP FAILED — manual remediation needed",
            { uid: createdUid, cleanupErr: String(cleanupErr) }
          );
        }
      }
      if (err instanceof HttpsError) throw err;
      const code = (err as { code?: string })?.code;
      if (code === "auth/email-already-exists") {
        throw new HttpsError(
          "already-exists",
          "An account with this email already exists."
        );
      }
      if (code === "auth/invalid-password" || code === "auth/weak-password") {
        throw new HttpsError(
          "invalid-argument",
          "Password is too weak. Please choose a stronger one."
        );
      }
      logger.error("createCourierRegistration: unexpected error", {
        errCode: (err as { code?: string })?.code ?? null,
        errMessage: (err as { message?: string })?.message ?? null,
        attemptedUid: createdUid,
      });
      throw new HttpsError(
        "internal",
        "Registration failed. Please try again."
      );
    }
  }
);
