/**
 * walletOwnerCurrency — resolves the operating currency of a WALLET OWNER
 * (pharmacy or courier), as opposed to `currencyResolver.ts` which answers
 * the narrower "what currency does this country use / is this currency
 * configured" questions. This module owns the identity half of the problem:
 * given a bare uid, decide what kind of owner it is before deriving anything
 * financial from it.
 *
 * Identity contract
 * -----------------
 * Canonical source is `users/{uid}` — `role`, falling back to `userType`
 * because the two producers disagree: the backend
 * (`createPharmacyRegistration`) writes `role`, while the Flutter
 * client-write path writes the model's own field. Probing the role-specific
 * collections is the LEGACY fallback only, used when `users/{uid}` is
 * missing or carries no usable role, so that collection layout never
 * becomes an implicit identity store.
 *
 * ⚠️ SECURITY LIMIT — read before wiring this to anything that creates money
 * -------------------------------------------------------------------------
 * Neither input is trustworthy today:
 *
 *   - `firestore.rules` allows `update: if isOwner(userId)` on
 *     `/users/{userId}` with no field validation, so a client can rewrite
 *     its own `role`.
 *   - `/couriers/{userId}` allows create AND update by the owner, and
 *     `isValidCourierData()` does not mention `countryCode` at all — a
 *     courier can set or later change its own country freely, and nothing
 *     validates it against `system_config`.
 *
 * The blast radius of a forged `role` is small (the role only selects WHICH
 * collection to read; the document must still exist, so a courier claiming
 * `pharmacy` resolves to `owner_not_found`). The blast radius of a forged
 * `countryCode` is NOT small: it would let a client choose the currency its
 * wallet is created in.
 *
 * Therefore this resolver is safe to use for READING and REPORTING, but
 * MUST NOT drive wallet creation until `countryCode` is server-validated
 * and made immutable. That hardening is tracked separately.
 *
 * Fail-loud: every failure is an explicit reason. There is no XAF default,
 * and no "pick something sensible" branch.
 */

import type { Firestore } from "firebase-admin/firestore";
import {
  getCountryDefaultCurrency,
  checkCurrencyConfigured,
  type SysConfigCountriesShape,
  type SysConfigCurrenciesShape,
} from "./currencyResolver.js";

export type WalletOwnerType = "pharmacy" | "courier";

/** How the owner type was established, for telemetry on legacy drift. */
export type WalletOwnerIdentitySource = "users_role" | "legacy_probe";

export type WalletOwnerRefusal =
  /** No `users/{uid}` and neither role collection holds the uid. */
  | "owner_not_found"
  /** Admin, super_admin, or any role that must not own a wallet. */
  | "owner_not_eligible"
  /** uid present in BOTH pharmacies and couriers — never guess. */
  | "ambiguous_owner"
  /** Owner doc found, but no usable countryCode on it. */
  | "country_missing"
  /** countryCode present but absent from system_config.countries, or the
   *  country carries no defaultCurrencyCode. */
  | "country_unknown"
  /** Country names a currency that system_config.currencies does not hold. */
  | "currency_not_configured"
  /** Country names a currency explicitly `enabled: false`. */
  | "currency_disabled"
  /** Currency entry exists but `enabled` is missing or not a boolean. */
  | "currency_invalid_configuration"
  /** system_config unreadable — server-side fault, retryable. */
  | "config_unavailable";

export type WalletOwnerCurrencyResult =
  | {
      ok: true;
      currency: string;
      countryCode: string;
      ownerType: WalletOwnerType;
      identitySource: WalletOwnerIdentitySource;
    }
  | {
      ok: false;
      reason: WalletOwnerRefusal;
      ownerType?: WalletOwnerType;
      identitySource?: WalletOwnerIdentitySource;
    };

/**
 * HTTP status for a refusal. Mirrors `currencyRefusalHttpStatus`:
 * 503 when the server cannot answer, 4xx when the request cannot be served.
 *
 * `ambiguous_owner` is 409 (conflict) rather than 422: the data is
 * internally inconsistent, which is not something the caller can reword.
 */
export function walletOwnerRefusalHttpStatus(reason: WalletOwnerRefusal): number {
  switch (reason) {
    case "config_unavailable":
      return 503;
    case "owner_not_found":
      return 404;
    case "ambiguous_owner":
      return 409;
    case "owner_not_eligible":
    case "country_missing":
    case "country_unknown":
    case "currency_not_configured":
    case "currency_disabled":
    case "currency_invalid_configuration":
      return 422;
  }
}

const COLLECTION_FOR: Record<WalletOwnerType, string> = {
  pharmacy: "pharmacies",
  courier: "couriers",
};

/**
 * Normalises a raw role value into a wallet-owner type.
 *
 * Returns `"ineligible"` for roles that exist but must never own a wallet
 * (admin / super_admin), and `null` when the value is unusable — the two
 * must not be conflated: the first is a definitive refusal, the second
 * falls through to the legacy probe.
 *
 * Exported for direct unit testing.
 */
export function normaliseOwnerRole(
  raw: unknown
): WalletOwnerType | "ineligible" | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "pharmacy") return "pharmacy";
  if (v === "courier") return "courier";
  if (v === "admin" || v === "super_admin") return "ineligible";
  return null;
}

/**
 * Resolves the currency a NEW wallet for `uid` should be denominated in.
 *
 * Never consulted for an existing wallet: a wallet already holds its own
 * currency, and its balances and history are denominated in it. Re-deriving
 * would risk silently re-denominating real value.
 */
export async function resolveCurrencyForWalletOwner(
  db: Firestore,
  uid: string | null | undefined
): Promise<WalletOwnerCurrencyResult> {
  if (typeof uid !== "string" || uid.trim().length === 0) {
    return { ok: false, reason: "owner_not_found" };
  }

  // ---- 1. Identity -------------------------------------------------------
  let ownerType: WalletOwnerType;
  let identitySource: WalletOwnerIdentitySource;

  let userSnap;
  try {
    userSnap = await db.collection("users").doc(uid).get();
  } catch {
    return { ok: false, reason: "config_unavailable" };
  }

  const declared = userSnap.exists
    ? normaliseOwnerRole(
        (userSnap.data() ?? {}).role ?? (userSnap.data() ?? {}).userType
      )
    : null;

  if (declared === "ineligible") {
    return { ok: false, reason: "owner_not_eligible" };
  }

  if (declared === "pharmacy" || declared === "courier") {
    ownerType = declared;
    identitySource = "users_role";
  } else {
    // ---- Legacy probe: only when users/{uid} cannot tell us -------------
    let pharmacySnap, courierSnap;
    try {
      [pharmacySnap, courierSnap] = await Promise.all([
        db.collection("pharmacies").doc(uid).get(),
        db.collection("couriers").doc(uid).get(),
      ]);
    } catch {
      return { ok: false, reason: "config_unavailable" };
    }

    if (pharmacySnap.exists && courierSnap.exists) {
      // Two role documents for one uid is a data defect. Picking one would
      // silently denominate a wallet from the wrong profile.
      return { ok: false, reason: "ambiguous_owner" };
    }
    if (pharmacySnap.exists) {
      ownerType = "pharmacy";
    } else if (courierSnap.exists) {
      ownerType = "courier";
    } else {
      return { ok: false, reason: "owner_not_found" };
    }
    identitySource = "legacy_probe";
  }

  // ---- 2. Owner document + countryCode -----------------------------------
  let ownerSnap;
  try {
    ownerSnap = await db.collection(COLLECTION_FOR[ownerType]).doc(uid).get();
  } catch {
    return { ok: false, reason: "config_unavailable", ownerType, identitySource };
  }

  if (!ownerSnap.exists) {
    // users/{uid} claimed a role whose profile document does not exist.
    return { ok: false, reason: "owner_not_found", ownerType, identitySource };
  }

  const rawCountry = (ownerSnap.data() ?? {}).countryCode;
  if (typeof rawCountry !== "string" || rawCountry.trim().length === 0) {
    return { ok: false, reason: "country_missing", ownerType, identitySource };
  }
  const countryCode = rawCountry.trim();

  // ---- 3. Country -> currency -------------------------------------------
  let sysConfigSnap;
  try {
    sysConfigSnap = await db.collection("system_config").doc("main").get();
  } catch {
    return { ok: false, reason: "config_unavailable", ownerType, identitySource };
  }
  if (!sysConfigSnap.exists) {
    return { ok: false, reason: "config_unavailable", ownerType, identitySource };
  }

  const sysConfigData = sysConfigSnap.data();

  const currency = getCountryDefaultCurrency(
    sysConfigData as SysConfigCountriesShape | undefined,
    countryCode
  );
  if (!currency) {
    return { ok: false, reason: "country_unknown", ownerType, identitySource };
  }

  // ---- 4. Is that currency actually usable? ------------------------------
  // A country pointing at a currency is not proof the platform operates in
  // it. `countries.GH.defaultCurrencyCode = "GHS"` while `currencies.GHS`
  // is absent or disabled would otherwise mint a wallet in an unsupported
  // currency. Reuses the same check the money-moving endpoints apply, on
  // the snapshot already loaded above — no extra read.
  const support = checkCurrencyConfigured(
    sysConfigData as SysConfigCurrenciesShape | undefined,
    currency
  );
  if (!support.ok) {
    const reason: WalletOwnerRefusal =
      support.reason === "not_configured"
        ? "currency_not_configured"
        : support.reason === "disabled"
          ? "currency_disabled"
          : support.reason === "invalid_configuration"
            ? "currency_invalid_configuration"
            : "config_unavailable";
    return { ok: false, reason, ownerType, identitySource };
  }

  return { ok: true, currency, countryCode, ownerType, identitySource };
}
