/**
 * tradeCurrencyGuard — Phase 2 (garde monétaire serveur, G1–G6).
 *
 * Single authoritative guard for the operating currency of a two-party trade
 * (exchange proposal OR medicine-request bridge). It composes the existing
 * `currencyResolver` primitives into ONE fail-closed decision that every
 * money-moving mutation shares, so the currency can no longer be:
 *   - trusted from the client (`details.currency` / `offer.currencyCode`),
 *   - silently defaulted to "XAF",
 *   - or mis-settled across two parties whose countries / wallets disagree.
 *
 * Two distinct refusals, on purpose (they are NOT the same failure) :
 *   - TERRITORIAL : the two parties are not in the same country+city. This
 *     fires even when both countries happen to use the SAME currency (e.g.
 *     two XAF countries) — a cross-border trade is refused regardless.
 *   - MONETARY : the derived currency is unusable, or an EXISTING wallet's
 *     stored currency contradicts it. No FX mechanism exists, so any
 *     divergence is refused rather than converted.
 *
 * Pure by design : the caller passes the pharmacy docs + wallet currencies
 * it has already read inside its transaction (Firestore requires all reads
 * before the first write). No Firestore access here.
 *
 * Snapshot + revalidation (G6) : `resolveTradeCurrency` returns the
 * authoritative currency, which the proposal creator snapshots on the doc.
 * `assertMatchesSnapshot` re-runs the derivation at accept / settlement /
 * compensation and refuses if the live derivation drifts from the snapshot.
 */

import { HttpsError } from "firebase-functions/v2/https";
import {
  getCountryDefaultCurrency,
  checkCurrencyConfigured,
  type SysConfigCountriesShape,
  type SysConfigCurrenciesShape,
} from "./currencyResolver.js";
import { citySlug } from "../cityUtils.js";

/** One party of a trade, as already read from `pharmacies/{uid}` (+ wallet). */
export interface TradePartyInput {
  /** For logs / error context only. */
  uid: string;
  /** `pharmacies/{uid}.countryCode`. */
  countryCode: unknown;
  /** `pharmacies/{uid}.cityCode`. */
  cityCode: unknown;
  /**
   * The currency stored on this party's EXISTING `wallets/{uid}` doc, or
   * null/undefined when the wallet does not exist yet (it will be created in
   * the derived currency later). A present, non-empty value that differs from
   * the derived currency is a hard refusal — never silently corrected.
   */
  walletCurrency?: unknown;
}

/** Minimal shape of `system_config/main` this guard reads. */
export type TradeSysConfig = SysConfigCountriesShape &
  SysConfigCurrenciesShape & {
    countries?: Record<
      string,
      { defaultCurrencyCode?: string; enabled?: unknown } | undefined
    >;
  };

/** Territorial + currency-derivation refusals (no wallet dimension). */
export type TradeTerritoryRefusal =
  | "buyer_country_missing"
  | "seller_country_missing"
  | "buyer_city_missing"
  | "seller_city_missing"
  | "cross_country"
  | "cross_city"
  | "country_not_enabled"
  | "currency_unresolved"
  | "currency_not_configured"
  | "currency_disabled"
  | "currency_invalid_configuration"
  | "config_unavailable";

/** Full trade-guard refusals — territory + the two wallet controls. */
export type TradeCurrencyRefusal =
  | TradeTerritoryRefusal
  | "buyer_wallet_missing"
  | "seller_wallet_missing"
  | "buyer_wallet_currency_mismatch"
  | "seller_wallet_currency_mismatch";

interface ResolvedTerritory {
  currency: string;
  /** Canonical (upper-case) shared country code. */
  countryCode: string;
  /** Canonical (slug) shared city code. */
  cityCode: string;
}

export type TradeTerritoryResult =
  | ({ ok: true } & ResolvedTerritory)
  | { ok: false; reason: TradeTerritoryRefusal };

export type TradeCurrencyResult =
  | ({ ok: true } & ResolvedTerritory)
  | { ok: false; reason: TradeCurrencyRefusal };

function asNonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Territorial half of the guard, WITHOUT the wallet dimension: same
 * country+city on both parties, country enabled, currency derived + usable.
 *
 * Territorial-first on purpose: a cross-country trade is refused BEFORE any
 * currency is derived, so "same currency" can never launder a cross-border
 * trade. Exposed separately so the COMPENSATION paths (cancel / terminate)
 * can *signal* a territorial anomaly for audit WITHOUT blocking restitution,
 * and without ever touching wallet currency.
 */
export function resolveTradeTerritory(
  buyer: TradePartyInput,
  seller: TradePartyInput,
  sysConfig: TradeSysConfig | undefined | null
): TradeTerritoryResult {
  // ---- 1. Territorial presence -----------------------------------------
  const buyerCountry = asNonEmptyString(buyer.countryCode);
  if (!buyerCountry) return { ok: false, reason: "buyer_country_missing" };
  const sellerCountry = asNonEmptyString(seller.countryCode);
  if (!sellerCountry) return { ok: false, reason: "seller_country_missing" };
  const buyerCity = asNonEmptyString(buyer.cityCode);
  if (!buyerCity) return { ok: false, reason: "buyer_city_missing" };
  const sellerCity = asNonEmptyString(seller.cityCode);
  if (!sellerCity) return { ok: false, reason: "seller_city_missing" };

  // Canonical comparison (upper-case country, slug city) so a casing
  // difference between two legitimately-same territories is not read as a
  // cross-border trade.
  const country = buyerCountry.toUpperCase();
  if (country !== sellerCountry.toUpperCase()) {
    return { ok: false, reason: "cross_country" };
  }
  const city = citySlug(buyerCity);
  if (city !== citySlug(sellerCity)) {
    return { ok: false, reason: "cross_city" };
  }

  // ---- 2. Country enabled ----------------------------------------------
  const countryEntry = sysConfig?.countries?.[country];
  // Missing `enabled` is read as NOT enabled (mirrors MasterDataService's
  // `?? false` and createPharmacyRegistration), so an ambiguous / dormant
  // country never authorises a trade.
  if (!countryEntry || countryEntry.enabled !== true) {
    return { ok: false, reason: "country_not_enabled" };
  }

  // ---- 3. Derive + validate currency (no XAF fallback) -----------------
  const derived = getCountryDefaultCurrency(sysConfig, country);
  if (!derived) return { ok: false, reason: "currency_unresolved" };

  const support = checkCurrencyConfigured(sysConfig, derived);
  if (!support.ok) {
    const reason: TradeTerritoryRefusal =
      support.reason === "not_configured"
        ? "currency_not_configured"
        : support.reason === "disabled"
          ? "currency_disabled"
          : support.reason === "invalid_configuration"
            ? "currency_invalid_configuration"
            : "config_unavailable";
    return { ok: false, reason };
  }

  return { ok: true, currency: derived, countryCode: country, cityCode: city };
}

/**
 * FULL guard for any mutation that transfers value between parties
 * (create / accept / complete). Territory + BOTH wallets.
 *
 * D4 (architect) — fail-closed on wallets: a registered pharmacy always has a
 * wallet (created at registration), so a MISSING wallet currency is a refusal,
 * not a tolerated "created later". "Check only if it exists" would be
 * fail-open. Both wallets must exist and their currency must equal the derived
 * `currencyCode` before any irreversible reservation.
 */
export function resolveTradeCurrency(
  buyer: TradePartyInput,
  seller: TradePartyInput,
  sysConfig: TradeSysConfig | undefined | null
): TradeCurrencyResult {
  const territory = resolveTradeTerritory(buyer, seller, sysConfig);
  if (!territory.ok) return territory;

  const derived = territory.currency;

  const buyerWallet = asNonEmptyString(buyer.walletCurrency);
  if (!buyerWallet) return { ok: false, reason: "buyer_wallet_missing" };
  if (buyerWallet !== derived) {
    return { ok: false, reason: "buyer_wallet_currency_mismatch" };
  }
  const sellerWallet = asNonEmptyString(seller.walletCurrency);
  if (!sellerWallet) return { ok: false, reason: "seller_wallet_missing" };
  if (sellerWallet !== derived) {
    return { ok: false, reason: "seller_wallet_currency_mismatch" };
  }

  return {
    ok: true,
    currency: derived,
    countryCode: territory.countryCode,
    cityCode: territory.cityCode,
  };
}

/**
 * Maps a refusal onto an HttpsError. `config_unavailable` is a transient
 * server-side fault (`unavailable`, retryable); everything else describes a
 * request the server cannot serve as-is (`failed-precondition`). The reason
 * travels in `details.code` (upper snake) so a caller / UI can branch without
 * parsing the message.
 */
export function tradeCurrencyHttpsError(
  reason: TradeCurrencyRefusal,
  label: string
): HttpsError {
  const code = reason === "config_unavailable" ? "unavailable" : "failed-precondition";
  return new HttpsError(
    code,
    `${label}: trade currency guard refused (${reason}).`,
    { code: reason.toUpperCase() }
  );
}

/**
 * Throwing wrapper for the money-moving callables. Returns the authoritative
 * currency on success; throws a mapped HttpsError on any refusal.
 */
export function assertTradeCurrency(
  buyer: TradePartyInput,
  seller: TradePartyInput,
  sysConfig: TradeSysConfig | undefined | null,
  label: string
): { currency: string; countryCode: string; cityCode: string } {
  const r = resolveTradeCurrency(buyer, seller, sysConfig);
  if (!r.ok) throw tradeCurrencyHttpsError(r.reason, label);
  return { currency: r.currency, countryCode: r.countryCode, cityCode: r.cityCode };
}

/**
 * Client-supplied currency is an ASSERTION, never authoritative.
 *
 *   absent    → ok (server derivation stands);
 *   identical → ok (accepted as an assertion);
 *   different → typed refusal (`CLIENT_CURRENCY_MISMATCH`).
 *
 * The value PERSISTED by the caller is always the server `derived`, whatever
 * the client sent — this only decides whether a *provided* value is allowed
 * to stand alongside it, never what gets written. A lying client currency is
 * refused, never silently replaced.
 */
export function assertClientCurrencyMatches(
  clientCurrency: unknown,
  derived: string,
  label: string
): void {
  const provided = asNonEmptyString(clientCurrency);
  if (!provided) return;
  if (provided.toUpperCase() === derived.toUpperCase()) return;
  throw new HttpsError(
    "invalid-argument",
    `${label}: supplied currency (${provided}) does not match the server-derived currency (${derived}).`,
    { code: "CLIENT_CURRENCY_MISMATCH" }
  );
}

function courierHttpsError(reason: TradeTerritoryRefusal, label: string): HttpsError {
  const map: Record<TradeTerritoryRefusal, string> = {
    buyer_country_missing: "COURIER_COUNTRY_MISSING",
    buyer_city_missing: "COURIER_CITY_MISSING",
    seller_country_missing: "COURIER_TRADE_COUNTRY_MISSING",
    seller_city_missing: "COURIER_TRADE_CITY_MISSING",
    cross_country: "COURIER_CROSS_COUNTRY",
    cross_city: "COURIER_CROSS_CITY",
    country_not_enabled: "COURIER_COUNTRY_NOT_ENABLED",
    currency_unresolved: "COURIER_CURRENCY_UNRESOLVED",
    currency_not_configured: "COURIER_CURRENCY_NOT_CONFIGURED",
    currency_disabled: "COURIER_CURRENCY_DISABLED",
    currency_invalid_configuration: "COURIER_CURRENCY_INVALID_CONFIGURATION",
    config_unavailable: "COURIER_CONFIG_UNAVAILABLE",
  };
  const httpCode = reason === "config_unavailable" ? "unavailable" : "failed-precondition";
  return new HttpsError(
    httpCode,
    `${label}: courier trade-currency guard refused (${reason}).`,
    { code: map[reason] }
  );
}

/**
 * Courier settlement guard (Phase 2, D4 courier frontier). `completeExchangeDelivery`
 * credits the courier wallet — a THIRD cross-currency frontier beyond buyer and
 * seller. Before any write, the courier's territory + currency + wallet must
 * match the trade's authoritative `currencyCode` / country / city.
 *
 * Reuses `resolveTradeTerritory` by comparing the courier against a synthetic
 * party carrying the trade's territory, then adds the courier wallet check.
 * Courier `countryCode` comes from `couriers/{uid}`, hardened immutable+ISO by
 * the C1 rules, so it is a trustworthy authoritative source.
 */
export function assertCourierMatchesTrade(
  courier: TradePartyInput,
  expected: { currency: string; countryCode: string; cityCode: string },
  sysConfig: TradeSysConfig | undefined | null,
  label: string
): void {
  const territory = resolveTradeTerritory(
    courier,
    { uid: "trade", countryCode: expected.countryCode, cityCode: expected.cityCode },
    sysConfig
  );
  if (!territory.ok) throw courierHttpsError(territory.reason, label);
  if (territory.currency !== expected.currency) {
    throw new HttpsError(
      "failed-precondition",
      `${label}: courier currency (${territory.currency}) does not match the trade currency (${expected.currency}).`,
      { code: "COURIER_CURRENCY_MISMATCH" }
    );
  }
  const w = asNonEmptyString(courier.walletCurrency);
  if (!w) {
    throw new HttpsError(
      "failed-precondition",
      `${label}: courier wallet is missing or has no currency.`,
      { code: "COURIER_WALLET_MISSING" }
    );
  }
  if (w !== expected.currency) {
    throw new HttpsError(
      "failed-precondition",
      `${label}: courier wallet currency (${w}) does not match the trade currency (${expected.currency}).`,
      { code: "COURIER_WALLET_CURRENCY_MISMATCH" }
    );
  }
}

/**
 * Revalidation (G6) — canonical primitive. Re-derives the trade territory +
 * currency from the CURRENT party docs and asserts the currency equals the
 * snapshot on the proposal. Returns the confirmed `{ currency, countryCode,
 * cityCode }` so callers that need the AUTHORITATIVE territory (e.g. the
 * courier assignment guard) do NOT rebuild it from a denormalised
 * `delivery.cityCode` nor duplicate the derivation.
 *
 * A drift (a party's country/currency changed, or a wallet now contradicts)
 * refuses rather than settling on stale terms.
 */
export function assertMatchesSnapshotTerritory(
  buyer: TradePartyInput,
  seller: TradePartyInput,
  sysConfig: TradeSysConfig | undefined | null,
  snapshotCurrency: unknown,
  label: string
): { currency: string; countryCode: string; cityCode: string } {
  const snapshot = asNonEmptyString(snapshotCurrency);
  if (!snapshot) {
    // A proposal with no authoritative currency snapshot cannot be revalidated
    // — refuse rather than trust an unsnapshotted trade.
    throw new HttpsError(
      "failed-precondition",
      `${label}: proposal carries no authoritative currency snapshot.`,
      { code: "CURRENCY_SNAPSHOT_MISSING" }
    );
  }
  const live = assertTradeCurrency(buyer, seller, sysConfig, label);
  if (live.currency !== snapshot) {
    throw new HttpsError(
      "failed-precondition",
      `${label}: live currency (${live.currency}) drifted from the proposal snapshot (${snapshot}).`,
      { code: "CURRENCY_SNAPSHOT_MISMATCH" }
    );
  }
  return { currency: snapshot, countryCode: live.countryCode, cityCode: live.cityCode };
}

/**
 * Backward-compatible wrapper — returns only the confirmed currency string.
 * Kept for the existing callers (`acceptExchangeProposal`,
 * `completeExchangeDelivery`) that only need the currency.
 */
export function assertMatchesSnapshot(
  buyer: TradePartyInput,
  seller: TradePartyInput,
  sysConfig: TradeSysConfig | undefined | null,
  snapshotCurrency: unknown,
  label: string
): string {
  return assertMatchesSnapshotTerritory(buyer, seller, sysConfig, snapshotCurrency, label).currency;
}
