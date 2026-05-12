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
    | "country_unknown_on_pharmacy";
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
 * Pure decision function. No Firestore reads, no I/O — used directly by
 * the unit-test matrix and indirectly by `assertLicenseAllowsMarketplace`.
 *
 * Country config not loaded (null) is treated identically to a country
 * that does NOT require a license — the gate allows. This preserves the
 * "Ghana not yet activated = no enforcement" behavior expected by the
 * locked decisions.
 */
export function evaluateLicenseGate(
  pharmacy: PharmacyLicenseSnapshot,
  country: CountryLicenseConfig | null,
  now: Date = new Date()
): GateResult {
  if (!country?.licenseRequired) {
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

  let country: CountryLicenseConfig | null = null;
  const countryCode = pharmacyData.countryCode;
  if (typeof countryCode === "string" && countryCode.length > 0) {
    const sysConfigSnap = await db
      .collection("system_config")
      .doc("main")
      .get();
    const sysConfigData = (sysConfigSnap.data() ?? {}) as {
      countries?: Record<string, CountryLicenseConfig | undefined>;
    };
    country = sysConfigData.countries?.[countryCode] ?? null;
  }

  const result = evaluateLicenseGate(pharmacyData, country);
  if (result.decision === "deny") {
    throw new HttpsError(
      "failed-precondition",
      "Marketplace access requires a verified pharmacy license. Please submit or correct your license to continue."
    );
  }
}
