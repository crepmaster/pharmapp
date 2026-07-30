/**
 * TD-COURIER-ASSIGN-GUARD (Lot A — expand) — `createCourierRegistration`.
 *
 * Backend-owned courier registration callable. Mirrors
 * `createPharmacyRegistration` (phase 1) so a courier profile becomes a
 * fully authoritative source of territory + currency, instead of a
 * client-written document whose `countryCode`/`cityCode` could be forged at
 * signup and then "frozen" while still being wrong.
 *
 * Creates, via Admin SDK:
 *   - Firebase Auth user,
 *   - `users/{uid}` (role: courier),
 *   - `couriers/{uid}` (territory canonicalised + validated SERVER-SIDE),
 *   - `wallets/{uid}` (currency derived from the country; courier wallets
 *     store raw major — the doc shape is identical, the ×100 convention is a
 *     write-time boundary, not a doc field).
 *
 * NOT a global transaction. The three Firestore docs are written in one
 * atomic batch, but Auth user creation happens first and is a SEPARATE
 * operation. If the batch fails after Auth succeeded, the Auth user is
 * removed by a BEST-EFFORT compensating `deleteUser` (anti-orphan). That
 * compensation can itself fail (logged for manual remediation) — so this is
 * compensated, not transactional, and a rare orphan Auth user is possible.
 *
 * Couriers have NO subscription and NO license (unlike pharmacies), so those
 * branches are absent here. The territory/currency validation is identical:
 * countryCode upper-cased + ISO, country configured AND enabled, cityCode
 * canonicalised + present + enabled under that country, currency derived +
 * usable. The client currency is never authoritative.
 *
 * SECURITY — the `couriers/{uid}` document is built from an explicit
 * allowlist, NEVER from a raw passthrough of `profileData`. Trust boundary
 * fields (`role`, `isActive`, `isAvailable`, `rating`, `totalDeliveries`),
 * territory (`countryCode`, `cityCode`), currency, and the courier's operating
 * city name are all SERVER-forged. The client cannot inject or override any of
 * them. `operatingCity`/`city` are derived from the canonical
 * `citiesByCountry[countryCode][cityCode].name` — never from the payload —
 * because the legacy `getAvailableDeliveries` query matches the courier's city
 * DISPLAY NAME against `delivery.city`; a client-supplied name could point the
 * courier at the wrong market (or none).
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
   * Courier profile data (fullName, phoneNumber, vehicleType, licensePlate,
   * countryCode, cityCode, paymentPreferences, ...). Only an explicit
   * allowlist of these fields is persisted into `couriers/{uid}`; every other
   * key is dropped. There is NO raw passthrough.
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
        Record<string, { enabled?: boolean; name?: string } | undefined> | undefined
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

    // The courier's operating-city DISPLAY NAME is derived SERVER-SIDE from the
    // canonical config, never from the payload. `getAvailableDeliveries`
    // matches this name against `delivery.city`, so it must be the same
    // canonical string the settlement pipeline writes onto deliveries. An
    // enabled city with no usable name is a config defect — fail closed rather
    // than register a courier who would silently see the wrong market or none.
    const cityName = typeof cityEntry.name === "string" ? cityEntry.name.trim() : "";
    if (cityName.length === 0) {
      throw new HttpsError(
        "failed-precondition",
        "City has no display name configured; cannot register courier.",
        { code: "CITY_NAME_UNCONFIGURED" }
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

      // `couriers/{uid}` is built from an EXPLICIT ALLOWLIST. There is no raw
      // passthrough of `profileData`: a client cannot inject or override any
      // trust-boundary field. Every value below is either validated input
      // (fullName/phone/vehicle/plate), server-canonical (territory/currency),
      // config-derived (operatingCity/city name), or a server-forged constant
      // (role/isActive/isAvailable/rating/totalDeliveries).
      const courierDoc: Record<string, unknown> = {
        email,
        fullName,
        // displayName + name mirror the validated fullName, never a client
        // display field that could diverge from the account identity.
        displayName: fullName,
        name: fullName,
        phoneNumber,
        vehicleType,
        licensePlate,
        // Server-canonicalised, country-validated territory.
        countryCode,
        cityCode,
        // Config-derived display name — legacy delivery-filter compatibility.
        // NEVER the client `operatingCity`/`city`.
        operatingCity: cityName,
        city: cityName,
        // Server-forged trust-boundary constants. A courier starts inactive
        // for pickups, unrated, with no delivery history; `isActive` gates
        // assignment (assignCourierToDelivery) so it is backend-owned.
        role: "courier",
        isActive: true,
        isAvailable: false,
        rating: 0,
        totalDeliveries: 0,
        createdAt: now,
        updatedAt: now,
      };

      // Documented optional allowlist. `paymentPreferences` is the courier's
      // own payout config (mobile-money coordinates) and is accepted ONLY when
      // it is a plain object — minimal type validation, no deep trust. Any
      // other profile key (currency, verificationStatus, locationData, forged
      // role/rating/…) is silently dropped: it never reaches Firestore.
      const paymentPreferences = profile.paymentPreferences;
      if (
        paymentPreferences !== null &&
        typeof paymentPreferences === "object" &&
        !Array.isArray(paymentPreferences)
      ) {
        courierDoc.paymentPreferences = paymentPreferences;
      }

      const usersDoc = {
        uid: createdUid,
        email,
        // Derived from the validated fullName, never a client display field.
        displayName: fullName,
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
