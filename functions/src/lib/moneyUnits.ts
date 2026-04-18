/**
 * moneyUnits — Canonical monetary unit conversions per ADR-001.
 *
 * All new payment/ledger writes MUST use `amountMinor` (integer in smallest
 * currency unit) as the canonical field. `toLegacyWalletUnits` is a
 * transitional adapter that MUST be removed in Phase 1b when the wallet
 * collection is migrated to minor-unit semantics.
 */

/**
 * Money schema version. Increment when the minor-unit convention changes
 * meaningfully (e.g. introducing 3-decimal currencies in a backward-incompatible way).
 */
export const MONEY_SCHEMA_VERSION = 1;

/**
 * Static fallback for currency decimals when system_config read fails.
 * Covers the markets currently configured in system_config/main.
 */
export const FALLBACK_DECIMALS: Readonly<Record<string, number>> = Object.freeze({
  XAF: 0,
  XOF: 0,
  GHS: 2,
  KES: 2,
  NGN: 2,
  TZS: 2,
  UGX: 0,
  EUR: 2,
  USD: 2,
});

/**
 * Convert a major-unit amount (as entered by the user / returned by PSP)
 * into canonical minor units.
 *
 * @param major  Amount in major currency units (e.g. 50.00 GHS, 5000 XAF)
 * @param decimals Currency decimals from CurrencyOption (e.g. 0 for XAF, 2 for GHS)
 * @returns Integer minor units. Throws on invalid inputs.
 */
export function toMinor(major: number, decimals: number): number {
  if (!Number.isFinite(major) || major < 0) {
    throw new Error(`toMinor: invalid major amount ${major}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 4) {
    throw new Error(`toMinor: unsupported decimals ${decimals}`);
  }
  const factor = Math.pow(10, decimals);
  return Math.round(major * factor);
}

/**
 * Convert canonical minor units back to a major-unit amount for display
 * or external APIs that require major-unit values.
 */
export function fromMinor(minor: number, decimals: number): number {
  if (!Number.isInteger(minor) || minor < 0) {
    throw new Error(`fromMinor: invalid minor amount ${minor}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 4) {
    throw new Error(`fromMinor: unsupported decimals ${decimals}`);
  }
  const factor = Math.pow(10, decimals);
  return minor / factor;
}

/**
 * @transitional Remove in Phase 1b (legacy wallet migration).
 *
 * Convert canonical minor units into the legacy wallet `available`/`held`
 * representation, which historically stored every amount as `major × 100`
 * regardless of the currency's real decimals. The pharmacy UI divides by 100
 * at display time, so for XAF (decimals=0) we must write `minor × 100`, and
 * for GHS/KES/NGN (decimals=2) we write `minor × 1`.
 *
 * Do not call this helper outside the wallet credit path. Any new accounting
 * record must use `amountMinor` directly.
 */
export function toLegacyWalletUnits(minor: number, decimals: number): number {
  if (!Number.isInteger(minor) || minor < 0) {
    throw new Error(`toLegacyWalletUnits: invalid minor amount ${minor}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`toLegacyWalletUnits: invalid decimals ${decimals}`);
  }
  if (decimals > 2) {
    // 3-decimal currencies would require fractional legacy units, which the
    // current UI cannot represent. Deferred to Phase 1b.
    throw new Error(
      `toLegacyWalletUnits: decimals=${decimals} not supported in legacy wallet`
    );
  }
  const scale = 100 / Math.pow(10, decimals);
  return Math.round(minor * scale);
}

/**
 * Resolve decimals from a system_config currency entry, falling back to the
 * static table if the entry is missing or malformed. Logs the fallback so
 * the caller can flag config drift.
 */
export function resolveDecimals(
  currencyCode: string,
  configEntry: { decimals?: number } | undefined,
  onFallback?: (reason: string) => void
): number {
  const fromConfig = configEntry?.decimals;
  if (Number.isInteger(fromConfig) && fromConfig! >= 0 && fromConfig! <= 4) {
    return fromConfig!;
  }
  const fallback = FALLBACK_DECIMALS[currencyCode];
  if (fallback !== undefined) {
    if (onFallback) {
      onFallback(
        `resolveDecimals: using static fallback ${fallback} for ${currencyCode}`
      );
    }
    return fallback;
  }
  // Last resort: assume 2 decimals (most common in Africa outside CFA zone).
  if (onFallback) {
    onFallback(
      `resolveDecimals: no config or fallback for ${currencyCode}, defaulting to 2`
    );
  }
  return 2;
}
