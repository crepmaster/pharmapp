/**
 * Sprint 2a F-LICENSE — Marketplace license gate.
 *
 * Single source of truth for the rule:
 *   "a pharmacy in a `licenseRequired=true` country can only perform
 *    marketplace actions when its `licenseStatus = 'verified'`, OR when
 *    its `licenseStatus = 'grace_period'` AND `licenseGraceEndsAt` is in
 *    the future."
 *
 * Consumed by all marketplace callables :
 *   - createExchangeProposal
 *   - acceptExchangeProposal
 *   - createMedicineRequest
 *   - submitMedicineRequestOffer
 *   - acceptMedicineRequestOffer
 *
 * The pure evaluator `evaluateLicenseGate` is exported separately from the
 * async assert so it can be unit-tested without mocking firebase-admin.
 *
 * Error messages NEVER leak internal status, country code, license number,
 * or admin-managed metadata — they only state that marketplace access
 * requires verification.
 */

import { HttpsError } from "firebase-functions/v2/https";
import type { Firestore, Timestamp } from "firebase-admin/firestore";

/**
 * Sprint 2A.2 — Single source of truth for the 9 license fields that
 * NO client may mutate directly on `pharmacies/{uid}` (neither at
 * create-time nor at update-time). The Firestore rules enforce this,
 * and the rules tests iterate this list to prove each field is denied.
 *
 * Keep this in sync with `firestore.rules :: pharmacyLicenseFieldsAbsentAtCreate`
 * and `firestore.rules :: pharmacyLicenseFieldChanged` clauses on
 * `allow update`. If you add a 10th license field, add it both here
 * AND in the rules.
 *
 * `as const` + `readonly` so callers can `.includes()` against literal
 * unions without TypeScript widening.
 */
export const PROTECTED_LICENSE_FIELDS = [
  "licenseStatus",
  "licenseVerifiedBy",
  "licenseVerifiedAt",
  "licenseRejectionReason",
  "licenseGraceEndsAt",
  "licenseNumber",
  "licenseCountryCode",
  "licenseDocumentUrl",
  "licenseExpiryDate",
] as const;

export type ProtectedLicenseField = (typeof PROTECTED_LICENSE_FIELDS)[number];

/**
 * Persisted license status values. Kept as a string-literal union (NOT an
 * enum) so the type erases at runtime and matches whatever the Firestore
 * document holds. Unknown / missing values are handled defensively in
 * `evaluateLicenseGate`.
 */
export type LicenseStatus =
  | "not_required"
  | "pending_verification"
  | "verified"
  | "rejected"
  | "correction_needed"
  | "expired"
  | "grace_period";

/** Minimal country-config shape consumed by the gate. */
export interface CountryLicenseConfig {
  licenseRequired?: boolean;
  licenseGracePeriodDays?: number;
}

/** Minimal pharmacy shape consumed by the gate. */
export interface PharmacyLicenseSnapshot {
  countryCode?: string | null;
  licenseStatus?: LicenseStatus | string | null;
  /**
   * Firestore Timestamp OR a millisecond epoch number (the tests use
   * milliseconds; production passes a Firestore Timestamp). Anything else
   * is treated as "not set".
   */
  licenseGraceEndsAt?: Timestamp | { toMillis?: () => number } | number | null;
}

export type GateDecision = "allow" | "deny";

export interface GateResult {
  decision: GateDecision;
  /**
   * Internal label for ops / tests. NEVER surface this to the end user —
   * the public error message in `assertLicenseAllowsMarketplace` is
   * intentionally generic.
   */
  reason:
    | "country_not_required"
    | "verified"
    | "grace_active"
    | "grace_expired"
    | "not_verified"
    | "country_missing_on_pharmacy"
    | "country_unknown_in_system_config"
    | "system_config_missing";
}

function toMillisOrNull(
  v: PharmacyLicenseSnapshot["licenseGraceEndsAt"]
): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "object" && v !== null) {
    const fn = (v as { toMillis?: () => number }).toMillis;
    if (typeof fn === "function") {
      try {
        const ms = fn.call(v);
        return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Sprint 2A.3 (architect finding F2A3-FINDING-1) — Resolution status
 * passed by the async wrapper so the pure evaluator can distinguish:
 *
 *   - `loaded` : country config was found in `system_config/main.countries`
 *                and is passed as `country`.
 *   - `country_missing_on_pharmacy` : pharmacy doc has no `countryCode`.
 *   - `country_unknown_in_system_config` : pharmacy has a `countryCode`
 *                but it's not in the system_config map.
 *   - `system_config_missing` : the `system_config/main` doc is absent
 *                OR has no `countries` map.
 */
export type CountryResolution =
  | { status: "loaded"; country: CountryLicenseConfig }
  | { status: "country_missing_on_pharmacy" }
  | { status: "country_unknown_in_system_config" }
  | { status: "system_config_missing" };

/**
 * Pure decision function. No Firestore reads, no I/O — used directly by
 * the unit-test matrix and indirectly by `assertLicenseAllowsMarketplace`.
 *
 * Sprint 2A.3 (architect finding F2A3-FINDING-1) — fail-closed on
 * unknown / missing country. Previously, a `null` country resolved to
 * `allow / country_not_required`, which allowed any pharmacy without a
 * `countryCode` (or whose country had not yet been added to
 * `system_config/main.countries`) to bypass the gate. The new behavior:
 *
 *   - country resolution status is the FIRST signal we look at
 *   - any non-`loaded` resolution → deny (with a specific reason)
 *   - `loaded` country with `licenseRequired != true` → allow
 *   - otherwise → standard verified/grace/deny matrix
 *
 * Migration / audit implication: pharmacies whose `countryCode` is not
 * yet in `system_config/main.countries` will start being denied at the
 * marketplace gate. A dry-run audit script is required pre-deploy.
 */
export function evaluateLicenseGate(
  pharmacy: PharmacyLicenseSnapshot,
  resolution: CountryResolution,
  now: Date = new Date()
): GateResult {
  if (resolution.status === "country_missing_on_pharmacy") {
    return { decision: "deny", reason: "country_missing_on_pharmacy" };
  }
  if (resolution.status === "country_unknown_in_system_config") {
    return { decision: "deny", reason: "country_unknown_in_system_config" };
  }
  if (resolution.status === "system_config_missing") {
    return { decision: "deny", reason: "system_config_missing" };
  }

  const country = resolution.country;
  if (!country.licenseRequired) {
    return { decision: "allow", reason: "country_not_required" };
  }

  if (pharmacy.licenseStatus === "verified") {
    return { decision: "allow", reason: "verified" };
  }

  if (pharmacy.licenseStatus === "grace_period") {
    const endsMs = toMillisOrNull(pharmacy.licenseGraceEndsAt);
    if (endsMs !== null && endsMs > now.getTime()) {
      return { decision: "allow", reason: "grace_active" };
    }
    return { decision: "deny", reason: "grace_expired" };
  }

  // pending_verification, rejected, correction_needed, expired,
  // not_required-but-country-requires (a misconfig), or any unknown value
  // → deny. The country requires a license; nothing here proves the
  // pharmacy holds one.
  return { decision: "deny", reason: "not_verified" };
}

/**
 * Throws a generic `HttpsError("failed-precondition", ...)` when the
 * pharmacy may not perform marketplace actions. Otherwise resolves.
 *
 * Public error message is deliberately uniform across all deny reasons so
 * the surface does not differentiate between "you're rejected", "you're
 * still pending", or "your grace window expired" to an attacker probing
 * the gate.
 */
export async function assertLicenseAllowsMarketplace(
  db: Firestore,
  uid: string
): Promise<void> {
  const pharmacySnap = await db.collection("pharmacies").doc(uid).get();
  if (!pharmacySnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "Marketplace access denied for this account."
    );
  }
  const pharmacyData = (pharmacySnap.data() ?? {}) as PharmacyLicenseSnapshot & {
    countryCode?: string;
  };

  // Sprint 2A.3 F2A3-FINDING-1: resolve the country with explicit status
  // so the pure evaluator can fail-closed on missing/unknown country.
  const countryCode = pharmacyData.countryCode;
  let resolution: CountryResolution;
  if (typeof countryCode !== "string" || countryCode.length === 0) {
    resolution = { status: "country_missing_on_pharmacy" };
  } else {
    const sysConfigSnap = await db
      .collection("system_config")
      .doc("main")
      .get();
    if (!sysConfigSnap.exists) {
      resolution = { status: "system_config_missing" };
    } else {
      const sysConfigData = (sysConfigSnap.data() ?? {}) as {
        countries?: Record<string, CountryLicenseConfig | undefined>;
      };
      const countriesMap = sysConfigData.countries;
      if (!countriesMap || typeof countriesMap !== "object") {
        resolution = { status: "system_config_missing" };
      } else if (!(countryCode in countriesMap) || countriesMap[countryCode] == null) {
        resolution = { status: "country_unknown_in_system_config" };
      } else {
        resolution = { status: "loaded", country: countriesMap[countryCode]! };
      }
    }
  }

  const result = evaluateLicenseGate(pharmacyData, resolution);
  if (result.decision === "deny") {
    throw new HttpsError(
      "failed-precondition",
      "Marketplace access requires a verified pharmacy license. Please submit or correct your license to continue."
    );
  }
}
