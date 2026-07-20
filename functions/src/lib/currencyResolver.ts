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
 * One entry of `system_config/main.currencies`. Only `enabled` matters to
 * this module; the real document also carries `code`, `name`, `symbol`,
 * `decimals`, `sortOrder`, `minWithdrawalMinor` — declared open so callers
 * can pass the raw snapshot without narrowing it first.
 */
export interface SysConfigCurrencyEntry {
  /**
   * Typed `unknown`, not `boolean`, on purpose: this comes straight out of
   * an untyped Firestore document and an ops mistake can put a string, a
   * number or nothing at all here. The runtime `typeof === "boolean"` check
   * in `checkCurrencyConfigured` is the real guarantee; declaring `boolean`
   * would let a caller trust a promise the data does not make.
   */
  enabled?: unknown;
  [key: string]: unknown;
}

export interface SysConfigCurrenciesShape {
  currencies?: Record<string, SysConfigCurrencyEntry | undefined>;
}

/**
 * Why a currency was refused.
 *
 * - `config_unavailable` — the platform config could not be read at all
 *   (Firestore unreachable, document missing, `currencies` map absent).
 *   Server-side fault, potentially transient: callers must surface it as
 *   5xx so clients retry.
 * - `not_configured` — config readable, this currency is not in it.
 * - `disabled` — present with `enabled: false`.
 * - `invalid_configuration` — present but `enabled` is missing or not a
 *   boolean. Absence of the flag is NOT read as activation: an ambiguous
 *   entry is refused until ops fix it.
 *
 * The last three depend on the currency the caller asked for, hence 4xx.
 */
export type CurrencySupportRefusal =
  | "config_unavailable"
  | "not_configured"
  | "disabled"
  | "invalid_configuration";

/** Non-sensitive shape of an underlying read failure, for server logs only. */
export interface CurrencySupportCause {
  name?: string;
  message?: string;
  code?: string | number;
}

export type CurrencySupportResult =
  | { ok: true }
  | { ok: false; reason: CurrencySupportRefusal; cause?: CurrencySupportCause };

/**
 * Maps a refusal onto an HTTP status so the two current callers (and any
 * future one) cannot drift apart.
 *
 * 503 for `config_unavailable`: the caller's request is well-formed, the
 * server just cannot answer right now. Returning 422 there would tell the
 * client its input is permanently wrong and discourage a retry.
 */
export function currencyRefusalHttpStatus(reason: CurrencySupportRefusal): number {
  return reason === "config_unavailable" ? 503 : 422;
}

/**
 * Pure semantic check: is this currency one the platform actually operates
 * in, per `system_config/main.currencies`?
 *
 * Complements the SYNTACTIC `validators.currency` (shape only). Splitting
 * the two means onboarding a market is a pure config change — no edit to
 * validation.ts, no redeploy.
 *
 * Fail-closed at every step, including on the `enabled` flag: only an
 * explicit `enabled === true` activates a currency. A missing or
 * non-boolean flag is ambiguous, and ambiguity must not authorise money
 * movement — it yields `invalid_configuration` so ops can find and fix the
 * entry rather than have it silently treated as live.
 */
export function checkCurrencyConfigured(
  sysConfigData: SysConfigCurrenciesShape | undefined | null,
  currencyCode: string | null | undefined
): CurrencySupportResult {
  if (!sysConfigData) return { ok: false, reason: "config_unavailable" };
  const currencies = sysConfigData.currencies;
  if (!currencies || typeof currencies !== "object") {
    return { ok: false, reason: "config_unavailable" };
  }
  if (typeof currencyCode !== "string" || currencyCode.length === 0) {
    return { ok: false, reason: "not_configured" };
  }
  const entry = currencies[currencyCode];
  if (!entry) return { ok: false, reason: "not_configured" };
  if (typeof entry.enabled !== "boolean") {
    return { ok: false, reason: "invalid_configuration" };
  }
  if (entry.enabled === false) return { ok: false, reason: "disabled" };
  return { ok: true };
}

/**
 * I/O variant — loads `system_config/main` then delegates to the pure
 * check. Prefer the pure variant when the caller already holds a snapshot.
 *
 * A Firestore read failure is caught and reported as `config_unavailable`
 * rather than propagating, with the original error surfaced in `cause` so
 * the caller can log it. `cause` is for SERVER LOGS ONLY — callers must not
 * echo it to clients.
 */
export async function checkCurrencySupported(
  db: Firestore,
  currencyCode: string | null | undefined
): Promise<CurrencySupportResult> {
  let snap;
  try {
    snap = await db.collection("system_config").doc("main").get();
  } catch (err) {
    const e = err as { name?: string; message?: string; code?: string | number };
    return {
      ok: false,
      reason: "config_unavailable",
      cause: { name: e?.name, message: e?.message, code: e?.code },
    };
  }
  if (!snap.exists) {
    return {
      ok: false,
      reason: "config_unavailable",
      cause: { message: "system_config/main does not exist" },
    };
  }
  return checkCurrencyConfigured(
    snap.data() as SysConfigCurrenciesShape | undefined,
    currencyCode
  );
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
