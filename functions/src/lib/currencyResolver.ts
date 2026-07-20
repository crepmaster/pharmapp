/**
 * currencyResolver — single source of truth for the operating currency
 * of a transaction on the platform.
 *
 * Principle (established 2026-07-20, see memory
 * `project_currency_derived_from_country.md`) : a pharmacy's currency is
 * fully determined by its `countryCode` via
 * `system_config/main.countries[cc].defaultCurrencyCode`. Denormalizing
 * currency onto every proposal / delivery / wallet / ledger doc drifts
 * over time and is the root cause of the "3,000 XAF on a Ghana delivery"
 * bug.
 *
 * Contract :
 * - `getCountryDefaultCurrency(sysConfigData, countryCode)` — pure,
 *   no I/O. Returns the configured currency or null. Callers already
 *   holding a `system_config/main` snapshot (typical inside a
 *   transaction that also computes courier fees) reuse it here.
 * - `resolveCurrencyForPharmacy(db, uid)` — one-shot lookup path. Reads
 *   the pharmacy doc and `system_config/main`. Prefer the pure variant
 *   when a snapshot is already available.
 *
 * Fail-loud policy : both helpers return `null` (not a "XAF" fallback)
 * when the currency cannot be resolved. Every caller must decide
 * explicitly what to do on null — pick a sane default, throw, or
 * degrade — rather than silently absorb the mismatch.
 */

import type { Firestore } from "firebase-admin/firestore";

export interface SysConfigCountriesShape {
  countries?: Record<
    string,
    { defaultCurrencyCode?: string } | undefined
  >;
}

/**
 * Pure lookup. Returns the configured currency code (e.g. "GHS", "XAF")
 * or `null` when the country is absent from system_config or the field
 * is missing / non-string. No default.
 */
export function getCountryDefaultCurrency(
  sysConfigData: SysConfigCountriesShape | undefined | null,
  countryCode: string | null | undefined
): string | null {
  if (!sysConfigData || typeof countryCode !== "string" || countryCode.length === 0) {
    return null;
  }
  const countries = sysConfigData.countries;
  if (!countries || typeof countries !== "object") return null;
  const entry = countries[countryCode];
  if (!entry) return null;
  const code = entry.defaultCurrencyCode;
  if (typeof code !== "string" || code.length === 0) return null;
  return code;
}

/**
 * One-shot resolver — reads `pharmacies/{uid}` and `system_config/main`
 * in parallel to derive the operating currency. Returns null on any
 * missing link (no pharmacy doc, no countryCode, unknown country,
 * missing sysconfig). Callers decide the fallback policy.
 *
 * Prefer `getCountryDefaultCurrency` when the caller is already inside
 * a transaction that has loaded `system_config/main`.
 */
export async function resolveCurrencyForPharmacy(
  db: Firestore,
  pharmacyUid: string
): Promise<string | null> {
  if (typeof pharmacyUid !== "string" || pharmacyUid.length === 0) return null;
  const [pharmacySnap, sysConfigSnap] = await Promise.all([
    db.collection("pharmacies").doc(pharmacyUid).get(),
    db.collection("system_config").doc("main").get(),
  ]);
  if (!pharmacySnap.exists) return null;
  const pharmacyData = pharmacySnap.data() ?? {};
  const countryCode = pharmacyData.countryCode as string | undefined;
  if (!countryCode) return null;
  const sysConfigData = sysConfigSnap.exists
    ? (sysConfigSnap.data() as SysConfigCountriesShape | undefined)
    : undefined;
  return getCountryDefaultCurrency(sysConfigData, countryCode);
}
