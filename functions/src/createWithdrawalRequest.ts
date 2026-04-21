/**
 * createWithdrawalRequest — generic wallet withdrawal callable.
 *
 * Shared by pharmacies AND couriers, routed by (countryCode, providerId)
 * against `system_config/main.mobileMoneyProviders`. Only the
 * `sandbox_stub` adapter is wired this sprint; real PSPs slot in later
 * behind `WithdrawalAdapter` without changing this file.
 *
 * Idempotency: (ownerId, clientRequestId) — a retry returns the existing
 * request unchanged, without a second wallet debit.
 *
 * Money conventions (dual, per architect mandate):
 *   - pharmacy wallets store amounts as legacy `major × 100`
 *   - courier wallets store amounts as raw major units
 * Both are preserved; this callable computes `walletUnitsDebited` for
 * each owner type and persists it on the request doc so refunds are
 * always refunded in the same units that were debited.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { randomUUID } from "crypto";

import {
  MONEY_SCHEMA_VERSION,
  resolveDecimals,
  toLegacyWalletUnits,
} from "./lib/moneyUnits.js";
import { getAdapter } from "./lib/withdrawalAdapters.js";

const db = getFirestore();

// UUID v4 shape (RFC 4122). Keep strict — callers generate this client-side.
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const KNOWN_CURRENCIES = new Set([
  "XAF",
  "XOF",
  "GHS",
  "KES",
  "NGN",
  "TZS",
  "UGX",
  "EUR",
  "USD",
]);

/**
 * Hotfix 3.2b — Fix 2: Minimum withdrawal amounts per currency, in MINOR units.
 * Values mirror the client-side `_minWithdrawalByCurrency` (major units) in
 * `pharmapp_unified/lib/widgets/courier/courier_wallet_widget.dart`, converted
 * to minor using each currency's canonical decimals (XAF/UGX = 0 decimals,
 * GHS/KES/NGN/TZS = 2 decimals). An admin override is supported via
 * `system_config/main.currencies[code].minWithdrawalMinor`.
 */
const MIN_WITHDRAWAL_MINOR_BY_CURRENCY: Readonly<Record<string, number>> =
  Object.freeze({
    XAF: 1000, // 1000 XAF (0 decimals)
    GHS: 1000, // 10 GHS × 100 (2 decimals)
    KES: 10000, // 100 KES × 100 (2 decimals)
    NGN: 100000, // 1000 NGN × 100 (2 decimals)
    TZS: 200000, // 2000 TZS × 100 (2 decimals)
    UGX: 4000, // 4000 UGX (0 decimals)
  });

/**
 * Hotfix 3.2b — Fix 5: Defence-in-depth MSISDN validator per provider method.
 * Mirrors the client validator in `shared/lib/services/encryption_service.dart`
 * (`EncryptionService.validatePhoneWithMethod`, lines 135-219). The Dart
 * validator remains the source of truth; this backend table is a minimal
 * subset covering the method codes configured in production
 * `system_config/main.mobileMoneyProviders`.
 *
 * Keep in sync with the Dart file above when adding new markets.
 * Unknown method codes fall back to the legacy `len >= 9` check.
 */
const MSISDN_PATTERNS_BY_METHOD: Readonly<Record<string, RegExp>> =
  Object.freeze({
    // Cameroon
    mtn: /^(65[0-9]|67[0-9]|68[0-9])\d{6}$/,
    mtn_cm: /^(65[0-9]|67[0-9]|68[0-9])\d{6}$/,
    mtn_cameroon: /^(65[0-9]|67[0-9]|68[0-9])\d{6}$/,
    mtn_momo: /^(65[0-9]|67[0-9]|68[0-9])\d{6}$/,
    orange: /^69[0-9]\d{6}$/,
    orange_cm: /^69[0-9]\d{6}$/,
    orange_cameroon: /^69[0-9]\d{6}$/,
    orange_money: /^69[0-9]\d{6}$/,
    camtel: /^62[0-9]\d{6}$/,
    camtel_cm: /^62[0-9]\d{6}$/,
    camtel_mobile: /^62[0-9]\d{6}$/,
    // Kenya
    mpesa: /^7[0-2][0-9]\d{6}$/,
    mpesa_kenya: /^7[0-2][0-9]\d{6}$/,
    airtel_kenya: /^73[0-9]\d{6}$/,
    // Tanzania
    mpesa_tanzania: /^7[4-6]\d{7}$/,
    tigo: /^(71|65|67)\d{7}$/,
    tigo_tanzania: /^(71|65|67)\d{7}$/,
    airtel_tanzania: /^(68|69|78)\d{7}$/,
    // Ghana — 3.2b Fix 1 (mirror shared/lib/services/encryption_service.dart)
    mtn_gh: /^(24|54|55|59)\d{7}$/,
    mtn_ghana: /^(24|54|55|59)\d{7}$/,
    vodafone_gh: /^(20|50)\d{7}$/,
    vodafone_ghana: /^(20|50)\d{7}$/,
    airteltigo_gh: /^(26|27|56|57)\d{7}$/,
    airteltigo_ghana: /^(26|27|56|57)\d{7}$/,
    tigo_gh: /^(26|27|56|57)\d{7}$/,
    glo_gh: /^23\d{7}$/,
    glo_ghana: /^23\d{7}$/,
    // Uganda
    mtn_uganda: /^7[7-8]\d{7}$/,
    airtel_uganda: /^(70|75)\d{7}$/,
    // Nigeria (10 digits after country code strip)
    mtn_nigeria: /^(703|706|803|806|810|813|814|816|903|906)\d{7}$/,
    airtel: /^(701|708|802|808|812|901|902|904|907|912)\d{7}$/,
    airtel_nigeria: /^(701|708|802|808|812|901|902|904|907|912)\d{7}$/,
    glo: /^(705|805|807|811|815|905)\d{7}$/,
    glo_nigeria: /^(705|805|807|811|815|905)\d{7}$/,
    "9mobile": /^(809|817|818|909|908)\d{7}$/,
    nine_mobile: /^(809|817|818|909|908)\d{7}$/,
  });

interface CreateWithdrawalInput {
  amountMinor: number;
  currencyCode: string;
  providerId: string;
  msisdn: string;
  ownerType: "pharmacy" | "courier";
  clientRequestId: string;
}

/**
 * Strip non-digits and require len >= 9. Duplicated (not imported) from
 * mtnMomoTopupIntent per architect directive — do NOT refactor that file.
 */
function normalizeMsisdn(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Strip leading country codes the client may send (237/254/255/256/234) to
 * match the Dart validator's normalisation (see EncryptionService.validatePhoneWithMethod).
 */
function stripLeadingCountryCode(digits: string): string {
  if (
    digits.startsWith("237") ||
    digits.startsWith("254") ||
    digits.startsWith("255") ||
    digits.startsWith("256") ||
    digits.startsWith("234") ||
    digits.startsWith("233") // Ghana — 3.2b Fix 1
  ) {
    return digits.substring(3);
  }
  return digits;
}

/**
 * Per-method MSISDN validation. Unknown method → legacy `len >= 9` fallback
 * so providers added to system_config without a matching backend pattern
 * don't hard-fail payout creation (graceful degradation; client-side validator
 * still blocks at submit time).
 */
function isValidMsisdnForMethod(
  normalizedDigits: string,
  methodCode: string | undefined | null
): boolean {
  if (normalizedDigits.length < 9) return false;
  if (!methodCode) return true;
  const key = methodCode.toLowerCase().replace(/\s/g, "_");
  const pattern = MSISDN_PATTERNS_BY_METHOD[key];
  if (!pattern) return true; // unknown → graceful fallback
  return pattern.test(stripLeadingCountryCode(normalizedDigits));
}

export const createWithdrawalRequest = onCall<CreateWithdrawalInput>(
  { region: "europe-west1", cors: true },
  async (request) => {
    // ---- 1. Auth (ownerId ALWAYS from auth.uid — never from input) ----
    const ownerId = request.auth?.uid;
    if (!ownerId) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const input = (request.data ?? {}) as CreateWithdrawalInput & {
      ownerId?: unknown;
    };
    // Silently ignore any client-supplied ownerId; auth.uid is authoritative.
    if ("ownerId" in input) {
      // No-op; documented behavior.
    }

    const {
      amountMinor,
      currencyCode,
      providerId,
      msisdn: rawMsisdn,
      ownerType,
      clientRequestId,
    } = input;

    // ---- 2. ownerType valid ----
    if (ownerType !== "pharmacy" && ownerType !== "courier") {
      throw new HttpsError(
        "invalid-argument",
        "ownerType must be 'pharmacy' or 'courier'."
      );
    }

    // ---- 3. Owner doc exists (permission-denied on absence — no leak) ----
    const ownerCollection = ownerType === "pharmacy" ? "pharmacies" : "couriers";
    const ownerRef = db.collection(ownerCollection).doc(ownerId);
    const ownerSnap = await ownerRef.get();
    if (!ownerSnap.exists) {
      throw new HttpsError(
        "permission-denied",
        `Withdrawal unavailable for this ${ownerType} account.`
      );
    }
    const ownerData = ownerSnap.data() ?? {};
    const ownerCountryCode =
      (ownerData.countryCode as string | undefined) ?? null;

    // ---- 4. clientRequestId valid + idempotency short-circuit ----
    if (
      typeof clientRequestId !== "string" ||
      !UUID_V4_RE.test(clientRequestId.trim())
    ) {
      throw new HttpsError(
        "invalid-argument",
        "clientRequestId must be a UUID v4."
      );
    }
    const trimmedClientRequestId = clientRequestId.trim();

    // Idempotency: unique per (ownerId, clientRequestId), NOT global —
    // collisions across distinct users produce two distinct requests.
    const existingQuery = await db
      .collection("withdrawal_requests")
      .where("ownerId", "==", ownerId)
      .where("clientRequestId", "==", trimmedClientRequestId)
      .limit(1)
      .get();
    if (!existingQuery.empty) {
      const existing = existingQuery.docs[0];
      logger.info("createWithdrawalRequest: idempotent replay", {
        ownerId,
        clientRequestId: trimmedClientRequestId,
        requestId: existing.id,
      });
      return { ...(existing.data() as object), requestId: existing.id };
    }

    // ---- 5. amountMinor + currencyCode ----
    if (
      typeof amountMinor !== "number" ||
      !Number.isInteger(amountMinor) ||
      amountMinor <= 0
    ) {
      throw new HttpsError(
        "invalid-argument",
        "amountMinor must be a positive integer."
      );
    }
    if (
      typeof currencyCode !== "string" ||
      !KNOWN_CURRENCIES.has(currencyCode)
    ) {
      throw new HttpsError(
        "invalid-argument",
        `currencyCode '${currencyCode}' is not supported.`
      );
    }

    // ---- 6. Provider eligible for payout ----
    if (typeof providerId !== "string" || providerId.length === 0) {
      throw new HttpsError("invalid-argument", "providerId is required.");
    }
    const sysConfigSnap = await db
      .collection("system_config")
      .doc("main")
      .get();
    const sysConfig = (sysConfigSnap.data() ?? {}) as {
      mobileMoneyProviders?: Record<
        string,
        {
          enabled?: boolean;
          supportsPayouts?: boolean;
          countryCode?: string;
          currencyCode?: string;
          methodCode?: string;
        }
      >;
      currencies?: Record<
        string,
        { decimals?: number; minWithdrawalMinor?: number }
      >;
    };
    const provider = sysConfig.mobileMoneyProviders?.[providerId];
    if (!provider) {
      throw new HttpsError(
        "invalid-argument",
        `Unknown providerId '${providerId}'.`
      );
    }
    if (provider.enabled !== true || provider.supportsPayouts !== true) {
      throw new HttpsError(
        "failed-precondition",
        `Provider '${providerId}' is not eligible for payouts.`
      );
    }

    // ---- 7. Match country ----
    if (
      !ownerCountryCode ||
      !provider.countryCode ||
      provider.countryCode !== ownerCountryCode
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Provider country does not match owner country."
      );
    }

    // ---- 8. Match provider currency ----
    if (provider.currencyCode !== currencyCode) {
      throw new HttpsError(
        "failed-precondition",
        "Provider currency does not match request currency."
      );
    }

    // ---- 8b. Hotfix 3.2b Fix 2: enforce minimum withdrawal amount ----
    // Admin override via system_config/main.currencies[code].minWithdrawalMinor
    // takes precedence over the hardcoded table. Fail-fast before the
    // transaction so no wallet reads are wasted.
    const configuredMin =
      sysConfig.currencies?.[currencyCode]?.minWithdrawalMinor;
    const minimumMinor =
      typeof configuredMin === "number" && Number.isFinite(configuredMin)
        ? configuredMin
        : MIN_WITHDRAWAL_MINOR_BY_CURRENCY[currencyCode] ?? 0;
    if (minimumMinor > 0 && amountMinor < minimumMinor) {
      logger.info("createWithdrawalRequest: below minimum", {
        currencyCode,
        minimumMinor,
        amountMinor,
        ownerType,
      });
      throw new HttpsError(
        "failed-precondition",
        `Amount below minimum withdrawal for ${currencyCode} (min ${minimumMinor} minor, got ${amountMinor}).`
      );
    }

    // ---- 9. Wallet read + currency match ----
    const walletRef = db.collection("wallets").doc(ownerId);
    const walletSnap = await walletRef.get();
    if (!walletSnap.exists) {
      throw new HttpsError("failed-precondition", "Wallet does not exist.");
    }
    const walletData = walletSnap.data() ?? {};
    const walletCurrency = walletData.currency as string | undefined;
    if (walletCurrency !== currencyCode) {
      throw new HttpsError(
        "failed-precondition",
        "Wallet currency does not match request currency."
      );
    }

    // ---- 10. Msisdn valid (per-method regex; Hotfix 3.2b Fix 5) ----
    // Defence-in-depth: validate against the provider's methodCode pattern
    // so wrong-operator numbers (e.g. an Orange number sent with MTN) are
    // rejected at the backend boundary. Source of truth is the Dart
    // `EncryptionService.validatePhoneWithMethod`; unknown methodCodes fall
    // back gracefully to the legacy `len >= 9` check so newly added
    // providers without a matching backend pattern don't hard-fail payouts.
    if (typeof rawMsisdn !== "string") {
      throw new HttpsError("invalid-argument", "msisdn is required.");
    }
    const normalizedMsisdn = normalizeMsisdn(rawMsisdn);
    if (!isValidMsisdnForMethod(normalizedMsisdn, provider.methodCode)) {
      throw new HttpsError(
        "invalid-argument",
        "msisdn is invalid for the selected provider."
      );
    }

    // ---- 11. Sufficient balance (dual money convention) ----
    const decimals = resolveDecimals(
      currencyCode,
      sysConfig.currencies?.[currencyCode],
      (reason) =>
        logger.warn("createWithdrawalRequest: decimals fallback", { reason })
    );

    // Dual money convention:
    //   - pharmacy wallet fields are legacy `major × 100` → use toLegacyWalletUnits
    //   - courier wallet fields are raw major → amountMinor / 10^decimals
    // This split is the explicit, documented contract — DO NOT unify here.
    let walletUnitsDebited: number;
    if (ownerType === "pharmacy") {
      walletUnitsDebited = toLegacyWalletUnits(amountMinor, decimals);
    } else {
      // courier: raw major. Compute minor→major directly; fromMinor would
      // return a float for decimals>0 which is exactly what the courier
      // wallet expects (raw major units, non-integer for 2-decimal ccys).
      const factor = Math.pow(10, decimals);
      walletUnitsDebited = amountMinor / factor;
    }

    const currentAvailable = Number(walletData.available ?? 0);
    if (currentAvailable < walletUnitsDebited) {
      throw new HttpsError(
        "failed-precondition",
        `Insufficient balance: ${currentAvailable} available, ${walletUnitsDebited} needed.`
      );
    }

    // ---- Atomic write: adapter.initiate + request doc + wallet debit + ledger ----
    const requestId = randomUUID();
    const requestRef = db.collection("withdrawal_requests").doc(requestId);
    const ledgerRef = db.collection("ledger").doc();

    const adapter = getAdapter("sandbox_stub");
    // sandbox_stub.isSynchronous === true → safe inside a transaction.
    // Future async adapters MUST be invoked outside tx in a follow-up sprint.
    const { providerRef } = await adapter.initiate({
      requestId,
      ownerType,
      ownerId,
      amountMinor,
      currencyCode,
      providerId,
      msisdn: normalizedMsisdn,
    });

    await db.runTransaction(async (tx) => {
      // Re-read the wallet inside tx for freshness; re-validate balance.
      const freshWalletSnap = await tx.get(walletRef);
      if (!freshWalletSnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Wallet disappeared mid-request."
        );
      }
      const freshWallet = freshWalletSnap.data() ?? {};
      const freshAvailable = Number(freshWallet.available ?? 0);
      if (freshAvailable < walletUnitsDebited) {
        throw new HttpsError(
          "failed-precondition",
          `Insufficient balance: ${freshAvailable} available, ${walletUnitsDebited} needed.`
        );
      }

      // Create the withdrawal request doc.
      tx.set(requestRef, {
        requestId,
        ownerType,
        ownerId, // = auth.uid, never from input
        clientRequestId: trimmedClientRequestId,
        amountMinor,
        currencyCode,
        providerId,
        providerAdapter: "sandbox_stub",
        providerRef,
        msisdn: normalizedMsisdn,
        status: "processing", // sandbox_stub is synchronous → not "pending"
        walletUnitsDebited, // persisted for idempotent refund math
        moneySchemaVersion: MONEY_SCHEMA_VERSION,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Debit the wallet: available -> held.
      tx.update(walletRef, {
        available: FieldValue.increment(-walletUnitsDebited),
        held: FieldValue.increment(walletUnitsDebited),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Ledger entry.
      tx.set(ledgerRef, {
        type: "withdrawal_initiated",
        userId: ownerId,
        amount: walletUnitsDebited,
        currency: currencyCode,
        requestId,
        providerId,
        providerRef,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    logger.info("createWithdrawalRequest: processing", {
      requestId,
      ownerId,
      ownerType,
      providerId,
      amountMinor,
      walletUnitsDebited,
    });

    return {
      requestId,
      ownerType,
      ownerId,
      clientRequestId: trimmedClientRequestId,
      amountMinor,
      currencyCode,
      providerId,
      providerAdapter: "sandbox_stub",
      providerRef,
      msisdn: normalizedMsisdn,
      status: "processing",
      walletUnitsDebited,
      moneySchemaVersion: MONEY_SCHEMA_VERSION,
    };
  }
);
