/** The single-country currency invariant for pharmacy and courier wallets. */
import { HttpsError } from "firebase-functions/v2/https";
import {
  checkCurrencyConfigured,
  getCountryDefaultCurrency,
} from "./currencyResolver.js";

export function assertOwnerOperatingCurrency(
  owner: Record<string, unknown> | undefined,
  config: Record<string, unknown> | undefined,
  assertedCurrency?: unknown,
  wallet?: Record<string, unknown>
): string {
  const countryCode = owner?.countryCode;
  if (typeof countryCode !== "string" || !/^[A-Z]{2}$/.test(countryCode)) {
    throw new HttpsError("failed-precondition", "Wallet owner's country is not configured.");
  }
  const countries = config?.countries as
    | Record<string, { enabled?: unknown; defaultCurrencyCode?: string }>
    | undefined;
  if (countries?.[countryCode]?.enabled !== true) {
    throw new HttpsError("failed-precondition", "Wallet owner's country is not enabled.");
  }
  const derived = getCountryDefaultCurrency(config, countryCode);
  if (!derived || !checkCurrencyConfigured(config, derived).ok) {
    throw new HttpsError("failed-precondition", "Country currency is unavailable.");
  }
  if (assertedCurrency !== undefined && assertedCurrency !== null &&
      assertedCurrency !== derived) {
    throw new HttpsError("failed-precondition", "Currency does not match the wallet owner's country.");
  }
  if (wallet && wallet.currency !== derived) {
    throw new HttpsError("failed-precondition", "Wallet currency does not match the owner's country.");
  }
  return derived;
}

export const assertPharmacyOperatingCurrency = assertOwnerOperatingCurrency;
