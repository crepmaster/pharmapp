/**
 * Sprint 2A.3 TD-LICENSE-REGISTRATION-OWNED — `createPharmacyRegistration`
 *
 * Backend-owned pharmacy registration callable. Becomes the canonical
 * write path for `pharmacies/{uid}` for the unified Flutter app. The
 * client no longer creates Firebase Auth users directly for pharmacy
 * accounts ; this callable does it via Admin SDK, then writes
 * `users/{uid}` + `pharmacies/{uid}` (and initialises the wallet), with
 * anti-orphan cleanup on any failure.
 *
 * Critical reason for the move : `licenseRequired` is now read SERVER-
 * SIDE from `system_config/main.countries.{countryCode}` at create
 * time. A super admin who flips the flag at T0 sees the next
 * registration (T0+epsilon) bound by the new policy, regardless of how
 * fresh the client `MasterDataCountry` snapshot is.
 *
 * Architect's locked decisions (2026-05-13) :
 *   - if `country.licenseRequired === true` and `licenseNumber` is
 *     absent or empty, throw `failed-precondition` with code
 *     `LICENSE_REQUIRED` so Sprint 2B UI can re-prompt immediately.
 *   - if `country.licenseRequired === true` and `licenseNumber` is
 *     present + matches `licenseFormatRegex` (when set), the pharmacy
 *     is born with `licenseStatus = 'pending_verification'`.
 *   - if `country.licenseRequired !== true`, the pharmacy is born with
 *     `licenseStatus = 'not_required'`.
 *   - the client signs in via `signInWithEmailAndPassword` AFTER this
 *     callable returns — we do not mint a custom token here.
 *   - anti-orphan : on ANY post-Auth-create failure, delete the auth
 *     user before propagating the error.
 *
 * Out of scope (deferred to other sprints) :
 *   - Sprint 2B : the UI that consumes the `LICENSE_REQUIRED` error to
 *     prompt for a license number.
 *   - Sprint 2B / future : marketplace visibility filtering for
 *     non-verified pharmacies.
 *   - Future : courier/admin registration migration to backend-owned
 *     callables (we keep their existing Flutter direct-write flow).
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const auth = getAuth();
const db = getFirestore();

// Sprint 3 — trial subscription policy.
const TRIAL_DURATION_DAYS = 30;

interface CreatePharmacyRegistrationInput {
  email?: string;
  password?: string;
  /**
   * Free-form pharmacy profile data (pharmacyName, phoneNumber, address,
   * locationData, countryCode, cityCode, displayName, ...). We extract
   * the fields we care about explicitly and pass through the rest into
   * `pharmacies/{uid}` so the existing pharmacy schema stays compatible
   * with the pre-2A.3 Flutter write.
   */
  profileData?: Record<string, unknown>;
  /** Optional. Mandatory at server side when country.licenseRequired === true. */
  licenseNumber?: string | null;
}

interface CreatePharmacyRegistrationResult {
  uid: string;
  email: string;
  licenseStatus: "not_required" | "pending_verification";
}

/**
 * Pure helper — exported for unit tests. Returns the initial
 * `licenseStatus` for a pharmacy doc based on the country's
 * `licenseRequired` flag. Throws `LICENSE_REQUIRED` if the country is
 * mandatory and no license number was provided.
 */
export function computeInitialPharmacyLicenseStatus(args: {
  licenseRequired: boolean;
  hasLicenseNumber: boolean;
}): "not_required" | "pending_verification" {
  if (!args.licenseRequired) return "not_required";
  if (!args.hasLicenseNumber) {
    throw new HttpsError(
      "failed-precondition",
      "License number is required for this country.",
      { code: "LICENSE_REQUIRED" }
    );
  }
  return "pending_verification";
}

/** Re-emit a structured error if a configured regex rejects the supplied license number. */
function assertLicenseFormatMatches(
  licenseNumber: string,
  regexSource: unknown
): void {
  if (typeof regexSource !== "string" || regexSource.length === 0) return;
  let re: RegExp;
  try {
    re = new RegExp(regexSource);
  } catch {
    // A bad regex in system_config is a server misconfig — fail closed
    // without leaking the regex source.
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

export const createPharmacyRegistration = onCall<CreatePharmacyRegistrationInput>(
  { region: "europe-west1", cors: true },
  async (request): Promise<CreatePharmacyRegistrationResult> => {
    // This callable is open to unauthenticated callers — by definition,
    // a registration runs before the user has an account.
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
    const pharmacyName = typeof profile.pharmacyName === "string"
      ? profile.pharmacyName.trim()
      : "";
    const phoneNumber = typeof profile.phoneNumber === "string"
      ? profile.phoneNumber.trim()
      : "";
    const address = typeof profile.address === "string" ? profile.address.trim() : "";
    const countryCode = typeof profile.countryCode === "string"
      ? profile.countryCode.trim()
      : "";

    if (!pharmacyName || !phoneNumber || !address) {
      throw new HttpsError(
        "invalid-argument",
        "Pharmacy profile must include pharmacyName, phoneNumber, and address."
      );
    }
    if (!countryCode) {
      // Sprint 2A.3 F2A3-FINDING-1 : countryCode is mandatory because the
      // marketplace gate fail-closes on missing/unknown country.
      throw new HttpsError(
        "invalid-argument",
        "countryCode is required for pharmacy registration."
      );
    }

    const licenseNumberRaw = data.licenseNumber;
    const licenseNumber = typeof licenseNumberRaw === "string"
      ? licenseNumberRaw.trim()
      : "";

    // ---- 2. Read system_config (SERVER-SIDE source of truth) ---------------
    const sysConfigSnap = await db.collection("system_config").doc("main").get();
    const sysConfig = (sysConfigSnap.data() ?? {}) as {
      countries?: Record<string, {
        licenseRequired?: boolean;
        licenseFormatRegex?: string;
      } | undefined>;
    };
    const country = sysConfig.countries?.[countryCode];
    if (!country) {
      // F2A3-FINDING-1 alignment : an unknown country has no defined
      // policy. Refuse rather than guess.
      throw new HttpsError(
        "failed-precondition",
        "Country is not configured. Please contact support."
      );
    }
    const licenseRequired = country.licenseRequired === true;

    // Validate format regex if license was provided.
    if (licenseNumber.length > 0) {
      assertLicenseFormatMatches(licenseNumber, country.licenseFormatRegex);
    }

    // Compute initial license status (may throw LICENSE_REQUIRED).
    const licenseStatus = computeInitialPharmacyLicenseStatus({
      licenseRequired,
      hasLicenseNumber: licenseNumber.length > 0,
    });

    // ---- 3. Create Firebase Auth user (Admin SDK) -------------------------
    let createdUid: string | null = null;
    try {
      const userRecord = await auth.createUser({
        email,
        password,
        emailVerified: false,
      });
      createdUid = userRecord.uid;

      // ---- 4. Write Firestore docs (users + pharmacies + wallet) ---------
      const now = FieldValue.serverTimestamp();

      // Sprint 3 — trial subscription init aligned with license verification.
      //
      // Architect-locked (2026-05-13) :
      //   - Pays non mandatory (licenseStatus === 'not_required') :
      //     trial démarre immédiatement à l'inscription. 30j garantis.
      //   - Pays mandatory + licence fournie (licenseStatus ===
      //     'pending_verification') : subscriptionStatus =
      //     'trial_pending_license', `hasActiveSubscription = false`.
      //     Le trial démarrera quand `adminVerifyPharmacyLicense` flip
      //     `licenseStatus -> 'verified'` via le helper
      //     `startTrialForPharmacy`. La pharmacie ne consomme PAS son
      //     trial pendant cette attente.
      //
      // Client-side `SubscriptionCreationService.createTrialSubscription`
      // est retiré pour `UserType.pharmacy` (Sprint 3 client-side cleanup) :
      // ce callable est désormais la seule source de vérité.
      const isTrialActiveAtRegistration =
        licenseStatus === "not_required";
      const trialStartDate = new Date();
      const trialEndDate = new Date(
        trialStartDate.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000
      );

      const pharmacyDoc: Record<string, unknown> = {
        email,
        pharmacyName,
        phoneNumber,
        address,
        countryCode,
        role: "pharmacy",
        isActive: true,
        createdAt: now,
        updatedAt: now,
        // Sprint 3 — subscription fields branched on license status.
        hasActiveSubscription: isTrialActiveAtRegistration,
        subscriptionStatus: isTrialActiveAtRegistration
          ? "trial"
          : "trial_pending_license",
        subscriptionPlan: isTrialActiveAtRegistration ? "basic" : null,
        subscriptionStartDate: isTrialActiveAtRegistration
          ? Timestamp.fromDate(trialStartDate)
          : null,
        subscriptionEndDate: isTrialActiveAtRegistration
          ? Timestamp.fromDate(trialEndDate)
          : null,
        // License init — backend-controlled, never client-writable.
        licenseStatus,
        licenseCountryCode: countryCode,
      };
      if (licenseNumber.length > 0) {
        pharmacyDoc.licenseNumber = licenseNumber;
      }
      // Pass through any optional profile fields we have not explicitly
      // consumed (cityCode, locationData, displayName, …).
      for (const [k, v] of Object.entries(profile)) {
        if (k in pharmacyDoc) continue;
        if (k === "pharmacyName" || k === "phoneNumber" || k === "address" || k === "countryCode") continue;
        if (v === undefined) continue;
        pharmacyDoc[k] = v;
      }

      const usersDoc = {
        uid: createdUid,
        email,
        displayName: typeof profile.displayName === "string" && profile.displayName.trim().length > 0
          ? profile.displayName
          : pharmacyName,
        phoneNumber,
        role: "pharmacy",
        isActive: true,
        createdAt: now,
      };

      const walletDoc = {
        available: 0,
        held: 0,
        currency: typeof profile.currency === "string" ? profile.currency : "XAF",
        createdAt: now,
        updatedAt: now,
      };

      // Sequential writes (Firestore admin SDK supports batch writes but
      // we already wrote the Auth user atop them; if any one fails we
      // delete the Auth user in the catch). Batch keeps it tighter.
      const batch = db.batch();
      batch.set(db.collection("users").doc(createdUid), usersDoc);
      batch.set(db.collection("pharmacies").doc(createdUid), pharmacyDoc);
      batch.set(db.collection("wallets").doc(createdUid), walletDoc);
      await batch.commit();

      logger.info("createPharmacyRegistration: success", {
        uid: createdUid,
        countryCode,
        licenseStatus,
        licenseRequired,
      });

      return {
        uid: createdUid,
        email,
        licenseStatus,
      };
    } catch (err) {
      // Anti-orphan : if Firestore write failed AFTER Auth user creation,
      // delete the Auth user so a retry doesn't hit "email-already-in-use".
      if (createdUid) {
        try {
          await auth.deleteUser(createdUid);
          logger.warn(
            "createPharmacyRegistration: anti-orphan deleted Auth user after Firestore failure",
            { uid: createdUid }
          );
        } catch (cleanupErr) {
          logger.error(
            "createPharmacyRegistration: ANTI-ORPHAN CLEANUP FAILED — manual remediation needed",
            { uid: createdUid, cleanupErr: String(cleanupErr) }
          );
        }
      }
      // Translate firebase-admin/auth specific errors into HttpsError so
      // the client side can react.
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
      throw new HttpsError(
        "internal",
        "Registration failed. Please try again."
      );
    }
  }
);
