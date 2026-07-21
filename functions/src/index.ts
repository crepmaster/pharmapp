import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";

import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

import crypto from "node:crypto";

// 👉 helpers (déjà dans src/lib)
import { withIdempotency } from "./lib/idempotency.js";
import { cancelExchangeTx } from "./lib/exchange.js";
import { validateFields, validators, sendValidationError, sendError, BusinessErrors, AppError } from "./lib/validation.js";
import { requireAuth } from "./lib/auth.js";
import { checkCurrencySupported, currencyRefusalHttpStatus } from "./lib/currencyResolver.js";
import {
  resolveCurrencyForWalletOwner,
  walletOwnerRefusalHttpStatus,
} from "./lib/walletOwnerCurrency.js";
import { majorToWalletUnits, type WalletOwnerKind } from "./lib/moneyUnits.js";
// 👉 expose aussi la tâche planifiée
export { expireExchangeHolds } from "./scheduled.js";

// ======================= Exchange Proposal Callable Functions =======================
export { createExchangeProposal } from "./createExchangeProposal.js";
export { acceptExchangeProposal } from "./acceptExchangeProposal.js";
export { completeExchangeDelivery } from "./completeExchangeDelivery.js";
export { terminateExchangeDelivery } from "./terminateExchangeDelivery.js";
export { cancelExchangeProposal } from "./cancelExchangeProposal.js";

// ======================= Subscription / Treasury (Lot 3 — Sprint 3A) =======================
// Sandbox callable: simulates subscription payment success, credits platform treasury,
// writes ledger entry, activates subscription on pharmacies/{uid}.
// ⚠️ SANDBOX ONLY — production payment flow to be wired in a future sprint.
export { sandboxSubscriptionSuccess } from "./sandboxSubscriptionSuccess.js";
// Staging demo helper — advances a delivery from pending → picked_up without
// requiring a real courier (paired with the sandbox bypass in
// completeExchangeDelivery for the picked_up → delivered step + settlement).
export { sandboxDeliveryAdvance } from "./sandboxDeliveryAdvance.js";

// ======================= Platform Payout (Lot 4 — Sprint 4B) =======================
// Admin callables for requesting and resolving platform treasury payouts.
export { requestPlatformPayout } from "./requestPlatformPayout.js";
export { resolvePlatformPayout } from "./resolvePlatformPayout.js";

// ======================= Medicine Requests (Bloc 2 — Sprint 2A) =======================
export { createMedicineRequest } from "./createMedicineRequest.js";
export { cancelMedicineRequest } from "./cancelMedicineRequest.js";
export { submitMedicineRequestOffer } from "./submitMedicineRequestOffer.js";
export { withdrawMedicineRequestOffer } from "./withdrawMedicineRequestOffer.js";
export { acceptMedicineRequestOffer } from "./acceptMedicineRequestOffer.js";

// ======================= Pharmacy License (Sprint 2a F-LICENSE) =======================
// Owner-only submit/correct of pharmacy license + admin verify/reject +
// admin backfill grace period when activating a country retroactively.
// License gate is in functions/src/lib/licenseGate.ts and is consumed by
// the 5 marketplace callables (createExchangeProposal,
// acceptExchangeProposal, createMedicineRequest, submitMedicineRequestOffer,
// acceptMedicineRequestOffer).
export { submitPharmacyLicense } from "./submitPharmacyLicense.js";
export { adminVerifyPharmacyLicense } from "./adminVerifyPharmacyLicense.js";
export { backfillLicenseGracePeriod } from "./backfillLicenseGracePeriod.js";

// ======================= Pharmacy Registration (Sprint 2A.3 TD-LICENSE-REGISTRATION-OWNED) =======================
// Canonical write path for `pharmacies/{uid}` for the unified Flutter app.
// Replaces the client-side `UnifiedAuthService.signUp` direct Firestore
// write for pharmacy accounts (courier / admin paths unchanged). Reads
// `system_config/main.countries.{code}.licenseRequired` SERVER-SIDE at
// create time so a super-admin toggle takes effect immediately.
export { createPharmacyRegistration } from "./createPharmacyRegistration.js";

// ======================= Admin License Config (Sprint 2B.1) =======================
// Admin-only callable that updates the 7 license fields on
// `system_config/main.countries.{countryCode}`. Other country fields
// keep their existing client-direct-write path for now (out of 2B.1
// scope ; full backend-owned country writes is a future TD).
export { setCountryLicenseConfig } from "./setCountryLicenseConfig.js";

// ======================= Marketplace Listing (Sprint 2B.2b) =======================
// Backend-owned listing : returns only pharmacies that pass the license
// gate for the requested country. The complementary firestore.rules
// change denies `allow list` on /pharmacies so a modified client can't
// bypass the filter. UID lookups (allow get) remain authorized for
// profile / correction / admin flows.
export { getMarketplacePharmacies } from "./getMarketplacePharmacies.js";

// ======================= Admin Operations (V2A+V2B+V2C) =======================
export { setPharmacyActive } from "./setPharmacyActive.js";
export { upsertCity } from "./upsertCity.js";
export { setCourierActive } from "./setCourierActive.js";

// ======================= MTN MoMo Collections (Wallet Top-up) =======================
export { mtnMomoTopupIntent } from "./mtnMomoTopupIntent.js";
export { mtnMomoCheckStatus } from "./mtnMomoCheckStatus.js";

// ======================= Paystack (Wallet Top-up via hosted checkout) =======================
export { paystackTopupIntent } from "./paystackTopupIntent.js";
export { paystackWebhook } from "./paystackWebhook.js";

// ======================= Wallet Withdrawals (generic, pharmacy + courier) =======================
export { createWithdrawalRequest } from "./createWithdrawalRequest.js";
export { sandboxAdvanceWithdrawal } from "./sandboxAdvanceWithdrawal.js";

// ======================= Notifications (in-app inbox triggers) =======================
export {
  onDeliveryCreatedNotifyCouriers,
  onDeliveryStatusChangedNotifyPharmacies,
} from "./notifications.js";

// --------- Admin init ---------
if (getApps().length === 0) initializeApp();
const db = getFirestore();

// --------- Secrets ---------
const MOMO_TOKEN   = defineSecret("MOMO_CALLBACK_TOKEN");
const ORANGE_TOKEN = defineSecret("ORANGE_CALLBACK_TOKEN");

// --------- Utils ---------
function requireJson(req: any, res: any): boolean {
  if (req.method !== "POST") {
    res.status(405).send("method not allowed");
    return true;
  }
  const ct = String(req.headers["content-type"] ?? "").toLowerCase();
  if (!ct.startsWith("application/json")) {
    res.status(415).send("use application/json");
    return true;
  }
  return false;
}

function getInboundToken(req: any): string {
  const v = req.get?.("x-callback-token") ?? (req.query?.token as string | undefined) ?? "";
  return String(v ?? "").trim();
}

function walletInit(currency = "XAF") {
  return { available: 0, held: 0, currency, updatedAt: FieldValue.serverTimestamp() };
}

// ---------- Health ----------
export const health = onRequest({ region: "europe-west1", cors: true }, (_req, res) => {
  res.status(200).send("ok");
});

// ======================= Unified Authentication Services =======================
// Import unified auth functions
export {
  createPharmacyUser,
  createCourierUser,
  createAdminUser,
  cleanupTestUserUnified
} from "./auth/unified-auth-functions.js";

// ---------- Get Wallet Balance ----------
export const getWallet = onRequest({ region: "europe-west1", cors: true }, async (req, res) => {
  try {
    const requestedUserId = req.query?.userId as string | undefined;
    const uid = await requireAuth(req, res, requestedUserId ?? undefined);
    if (!uid) return;

    const userId = uid;

    const walletRef = db.collection("wallets").doc(userId);
    const walletDoc = await walletRef.get();

    // ---- Existing wallet: return the snapshot, untouched ----------------
    // Its balances and history are denominated in the currency stored on
    // it. Re-deriving from the owner's country here would risk silently
    // re-denominating real value — `10000 XAF` is not `10000 GHS`. A wallet
    // whose currency contradicts its owner's country is a data-repair
    // matter (see scripts/auditWalletCurrencyMismatch.mjs), never something
    // a read endpoint fixes on the fly.
    if (walletDoc.exists) {
      res.status(200).json(walletDoc.data());
      return;
    }

    // ---- Absent wallet: derive the currency, or refuse ------------------
    // Previously `walletInit()` defaulted to "XAF" regardless of country,
    // so merely opening the dashboard minted a Ghanaian pharmacy an XAF
    // wallet. A GET that writes is bad enough; writing the wrong currency
    // is worse.
    const resolved = await resolveCurrencyForWalletOwner(db, userId);
    if (!resolved.ok) {
      logger.error("getWallet: cannot resolve wallet currency", {
        endpoint: "getWallet",
        userId,
        reason: resolved.reason,
        ownerType: resolved.ownerType ?? null,
        identitySource: resolved.identitySource ?? null,
      });
      return sendError(
        res,
        new AppError(
          "WALLET_CURRENCY_UNRESOLVED",
          "Wallet configuration unavailable",
          walletOwnerRefusalHttpStatus(resolved.reason),
          resolved.reason
        )
      );
    }

    // Create-if-absent inside a transaction: two concurrent first-time
    // reads would otherwise both see "no wallet" and both write, the second
    // clobbering the first. The re-read inside the transaction makes the
    // loser return the winner's document instead of overwriting it.
    const wallet = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(walletRef);
      if (fresh.exists) return fresh.data();
      const initialWallet = walletInit(resolved.currency);
      tx.set(walletRef, initialWallet);
      return initialWallet;
    });

    logger.info("getWallet: wallet created", {
      userId,
      currency: resolved.currency,
      countryCode: resolved.countryCode,
      ownerType: resolved.ownerType,
      identitySource: resolved.identitySource,
    });

    res.status(200).json(wallet);
  } catch (error: any) {
    logger.error("getWallet error", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------- Create Top-up Intent ----------
export const topupIntent = onRequest({ region: "europe-west1", cors: true }, async (req, res) => {
  try {
    if (requireJson(req, res)) return;
    const { userId, method, amount, currency = "XAF", msisdn = null } = req.body ?? {};

    // Auth: ensure caller matches the userId in the request body
    const uid = await requireAuth(req, res, userId);
    if (!uid) return;

    // Validate input
    const errors = validateFields({ userId, method, amount, currency }, {
      userId: validators.required,
      method: (v, f) => validators.required(v, f) || validators.string(v, f, { minLength: 3, maxLength: 20 }),
      amount: (v, f) => validators.required(v, f) || validators.amount(v, f),
      currency: validators.currency
    });

    if (errors.length > 0) {
      return sendValidationError(res, errors);
    }

    // Semantic currency check — `validators.currency` above only guarantees
    // the ISO 4217 shape. Refuse before any Firestore write if the code is
    // not a currency the platform operates in.
    // NOTE: this does NOT yet verify that the currency matches the caller's
    // country. That consistency check needs the generic wallet-owner
    // resolver and lands in a follow-up commit.
    const topupCurrencySupport = await checkCurrencySupported(db, currency);
    if (!topupCurrencySupport.ok) {
      // `cause` carries the underlying Firestore failure and stays
      // server-side; the client only ever sees the reason code.
      logger.error("currency not supported", {
        endpoint: "topupIntent",
        currency,
        reason: topupCurrencySupport.reason,
        cause: topupCurrencySupport.cause ?? null,
        uid,
      });
      return sendError(
        res,
        new AppError(
          "CURRENCY_NOT_SUPPORTED",
          `Currency ${currency} is not available on this platform`,
          currencyRefusalHttpStatus(topupCurrencySupport.reason),
          topupCurrencySupport.reason
        )
      );
    }

    // Validate payment method
    const validMethods = ["mtn_momo", "orange_money"];
    if (!validMethods.includes(method)) {
      sendValidationError(res, [{
        field: "method",
        message: `Method must be one of: ${validMethods.join(", ")}`,
        code: "INVALID_METHOD"
      }]);
      return;
    }

    // Validate userId format
    const userIdError = validators.userId(userId, "userId");
    if (userIdError) {
      return sendValidationError(res, [userIdError]);
    }

    const doc = db.collection("payments").doc();
    await doc.set({
      userId, method, amount: Number(amount), currency, msisdn,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.status(201).json({ paymentId: doc.id, status: "pending" });
  } catch (error: any) {
    sendError(res, error);
  }
});

// ---------- Webhook helper ----------
type Provider = "mtn_momo" | "orange_money";

async function handleWebhook(opts: {
  req: any;
  res: any;
  provider: Provider;
  expectedToken: string;
  extract: (body: any, headers: any) => {
    providerTxnId: string;
    paymentId?: string;
    amount?: number;
    currency?: string;
  };
}) {
  const { req, res, provider, expectedToken, extract } = opts;

  if (requireJson(req, res)) return;

  // auth
  const got = getInboundToken(req);
  const expected = String(expectedToken ?? "").trim();
  if (!expected || got !== expected) {
    throw BusinessErrors.WEBHOOK_UNAUTHORIZED();
  }

  const body = typeof req.body === "object" ? req.body : {};
  const { providerTxnId, paymentId, amount, currency } = extract(body, req.headers);
  const pid = paymentId ?? `${provider}_${providerTxnId}`;

  await withIdempotency(`${provider}:${providerTxnId}`, async () => {
    await db.runTransaction(async (tx) => {
      const payRef = db.collection("payments").doc(pid);
      const logRef = db.collection("webhook_logs").doc(`${provider}:${providerTxnId}`);

      // ----- READS FIRST -----
      const paySnap = await tx.get(payRef);
      const payment = paySnap.exists ? (paySnap.data() ?? {}) : {};
      const userId: string | undefined = (payment as any).userId;

      let walletRef: FirebaseFirestore.DocumentReference | null = null;
      let walletSnap: FirebaseFirestore.DocumentSnapshot | null = null;

      const amt = amount ?? (payment as any)?.amount ?? null;
      const cur = currency ?? (payment as any)?.currency ?? "XAF";

      if (userId && typeof amt === "number" && amt > 0) {
        walletRef = db.collection("wallets").doc(userId);
        walletSnap = await tx.get(walletRef);
      }

      // ----- WRITES AFTER ALL READS -----
      // webhook log (avec TTL-friendly fields)
      tx.set(
        logRef,
        {
          provider,
          providerTxnId,
          paymentId: pid,
          receivedAt: FieldValue.serverTimestamp(),
          expireAt: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)), // ~30j
          headers: req.headers,
          payload: body,
        },
        { merge: true }
      );

      // upsert payment
      tx.set(
        payRef,
        {
          method: provider,
          status: "succeeded",
          amount: amt,
          currency: cur,
          gatewayRef: providerTxnId,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // credit wallet + ledger
      if (userId && walletRef && typeof amt === "number" && amt > 0) {
        if (!walletSnap!.exists) {
          tx.set(walletRef, walletInit(cur), { merge: true });
        }
        tx.update(walletRef, {
          available: FieldValue.increment(amt),
          updatedAt: FieldValue.serverTimestamp(),
        });

        const lref = db.collection("ledger").doc();
        tx.set(lref, {
          userId,
          type: "topup",
          amount: amt,
          currency: cur,
          from: "external",
          to: "wallet",
          provider,
          paymentId: pid,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });
  });

  res.status(200).send("ok");
}

// ---------- MTN MoMo Webhook ----------
export const momoWebhook = onRequest(
  { region: "europe-west1", secrets: [MOMO_TOKEN] },
  async (req, res) => {
    try {
      logger.info("momo webhook received", { headers: req.headers });
      await handleWebhook({
        req,
        res,
        provider: "mtn_momo",
        expectedToken: (MOMO_TOKEN.value() ?? "").trim(),
        extract: (b, h) => ({
          providerTxnId:
            b?.financialTransactionId ||
            b?.referenceId ||
            (h?.["x-reference-id"] as string) ||
            crypto.randomUUID(),
          paymentId: b?.paymentId,
          amount: b?.amount,
          currency: b?.currency ?? "XAF",
        }),
      });
      return;
    } catch (error: any) {
      if (error instanceof AppError && error.code === "WEBHOOK_UNAUTHORIZED") {
        return sendError(res, error);
      }
      logger.error("momo webhook error", error);
      res.status(200).send("ok");
    }
  }
);

// ---------- Orange Money Webhook ----------
export const orangeWebhook = onRequest(
  { region: "europe-west1", secrets: [ORANGE_TOKEN] },
  async (req, res) => {
    try {
      logger.info("orange webhook received", { headers: req.headers });
      await handleWebhook({
        req,
        res,
        provider: "orange_money",
        expectedToken: (ORANGE_TOKEN.value() ?? "").trim(),
        extract: (b, h) => ({
          providerTxnId:
            b?.transactionId ||
            b?.payToken ||
            (h?.["x-signature-id"] as string) ||
            crypto.randomUUID(),
          paymentId: b?.paymentId,
          amount: b?.amount,
          currency: b?.currency ?? "XAF",
        }),
      });
      return;
    } catch (error: any) {
      if (error instanceof AppError && error.code === "WEBHOOK_UNAUTHORIZED") {
        return sendError(res, error);
      }
      logger.error("orange webhook error", error);
      res.status(200).send("ok");
    }
  }
);

// ======================= Exchange endpoints =======================

// 1) HOLD 50/50
export const createExchangeHold = onRequest({ region: "europe-west1" }, async (req, res) => {
  // Sprint 5 optimisation #9 — deprecation marker. The canonical path is the
  // `createExchangeProposal` / `acceptExchangeProposal` callables (Sprint 4).
  // This legacy REST endpoint stays live until ops confirm 0 traffic on a
  // ~30-day window (TD-LEGACY-PHARMACY-HTTP-RETIREMENT). The structured warn
  // lets the monitoring runbook count hits per UA/uid and trigger removal.
  logger.warn("legacy exchange endpoint hit", {
    endpoint: "createExchangeHold",
    userAgent: req.get("user-agent") ?? null,
    remoteIp: req.ip ?? null,
  });
  try {
    if (requireJson(req, res)) return;

    const { exchangeId, aId, bId, courierFee, currency = "XAF", idempotencyKey } = req.body ?? {};
    const uid = await requireAuth(req, res);
    if (!uid) return;

    // Validate required fields
    const errors = validateFields({ aId, bId, courierFee, currency }, {
      aId: (v, f) => validators.required(v, f) || validators.userId(v, f),
      bId: (v, f) => validators.required(v, f) || validators.userId(v, f),
      courierFee: (v, f) => validators.required(v, f) || validators.amount(v, f),
      currency: validators.currency
    });

    if (errors.length > 0) {
      return sendValidationError(res, errors);
    }

    // Semantic currency check — `validators.currency` above only guarantees
    // the ISO 4217 shape. This endpoint moves money (wallet holds + ledger
    // entries), so an unconfigured code must be refused BEFORE the
    // transaction, not absorbed into a hold.
    // NOTE: this does NOT yet verify that the currency matches the
    // participants' country. That consistency check needs the generic
    // wallet-owner resolver and lands in a follow-up commit.
    const holdCurrencySupport = await checkCurrencySupported(db, currency);
    if (!holdCurrencySupport.ok) {
      // `cause` carries the underlying Firestore failure and stays
      // server-side; the client only ever sees the reason code.
      logger.error("currency not supported", {
        endpoint: "createExchangeHold",
        currency,
        reason: holdCurrencySupport.reason,
        cause: holdCurrencySupport.cause ?? null,
        uid,
      });
      return sendError(
        res,
        new AppError(
          "CURRENCY_NOT_SUPPORTED",
          `Currency ${currency} is not available on this platform`,
          currencyRefusalHttpStatus(holdCurrencySupport.reason),
          holdCurrencySupport.reason
        )
      );
    }

    // Business validation
    if (aId === bId) {
      sendValidationError(res, [{
        field: "bId",
        message: "User A and User B cannot be the same",
        code: "IDENTICAL_USERS"
      }]);
      return;
    }

    if (uid !== aId && uid !== bId) {
      return sendError(
        res,
        new AppError("FORBIDDEN", "Only exchange participants can create holds", 403)
      );
    }

    if (exchangeId && typeof exchangeId !== "string") {
      sendValidationError(res, [{
        field: "exchangeId",
        message: "exchangeId must be a string",
        code: "INVALID_TYPE"
      }]);
      return;
    }

    const holdKey = `hold:${exchangeId ?? idempotencyKey ?? `${aId}:${bId}:${courierFee}:${currency}`}`;
    const halfA = Math.floor(Number(courierFee) / 2);
    const halfB = Number(courierFee) - halfA;
    const exId = exchangeId ?? db.collection("exchanges").doc().id;
    await withIdempotency(holdKey, async () => {
      await db.runTransaction(async (tx) => {
        const aRef = db.collection("wallets").doc(aId);
        const bRef = db.collection("wallets").doc(bId);
        const exRef = db.collection("exchanges").doc(exId);

        // READS
        const [aSnap, bSnap] = await Promise.all([tx.get(aRef), tx.get(bRef)]);
        const a = aSnap.data() as any | undefined;
        const b = bSnap.data() as any | undefined;

        if (!a) throw BusinessErrors.WALLET_NOT_FOUND(aId);
        if (!b) throw BusinessErrors.WALLET_NOT_FOUND(bId);
        if ((a.available ?? 0) < halfA) {
          throw BusinessErrors.INSUFFICIENT_FUNDS(`User ${aId} needs ${halfA} but only has ${a.available ?? 0} available`);
        }
        if ((b.available ?? 0) < halfB) {
          throw BusinessErrors.INSUFFICIENT_FUNDS(`User ${bId} needs ${halfB} but only has ${b.available ?? 0} available`);
        }

        // WRITES
        tx.update(aRef, {
          available: FieldValue.increment(-halfA),
          held: FieldValue.increment(+halfA),
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.update(bRef, {
          available: FieldValue.increment(-halfB),
          held: FieldValue.increment(+halfB),
          updatedAt: FieldValue.serverTimestamp(),
        });

        tx.set(
          exRef,
          {
            aId,
            bId,
            currency,
            courierFee: Number(courierFee),
            holds: { a: halfA, b: halfB },
            status: "hold_active",
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        const lA = db.collection("ledger").doc();
        const lB = db.collection("ledger").doc();
        tx.set(lA, { userId: aId, type: "hold", amount: halfA, currency, exchangeId: exId, createdAt: FieldValue.serverTimestamp() });
        tx.set(lB, { userId: bId, type: "hold", amount: halfB, currency, exchangeId: exId, createdAt: FieldValue.serverTimestamp() });
      });
      return;
    });

    res.status(200).json({ ok: true, status: "hold_active", exchangeId: exId });
  } catch (error: any) {
    sendError(res, error);
  }
});

// 2) CAPTURE (payer le coursier)
export const exchangeCapture = onRequest({ region: "europe-west1" }, async (req, res) => {
  // Sprint 5 optimisation #9 — deprecation marker. Canonical path:
  // `completeExchangeDelivery` callable.
  logger.warn("legacy exchange endpoint hit", {
    endpoint: "exchangeCapture",
    userAgent: req.get("user-agent") ?? null,
    remoteIp: req.ip ?? null,
  });
  try {
    if (requireJson(req, res)) return;

    const { exchangeId, courierId, saleAmount = 0, sellerId, buyerId } = req.body ?? {};
    const uid = await requireAuth(req, res);
    if (!uid) return;

    // Validate required fields
    const errors = validateFields({ exchangeId, courierId }, {
      exchangeId: validators.required,
      courierId: (v, f) => validators.required(v, f) || validators.userId(v, f)
    });

    if (errors.length > 0) {
      return sendValidationError(res, errors);
    }

    // Validate optional fields
    if (saleAmount && typeof saleAmount !== "number") {
      sendValidationError(res, [{
        field: "saleAmount",
        message: "saleAmount must be a number",
        code: "INVALID_TYPE"
      }]);
      return;
    }

    if (saleAmount && saleAmount < 0) {
      sendValidationError(res, [{
        field: "saleAmount",
        message: "saleAmount must be non-negative",
        code: "INVALID_AMOUNT"
      }]);
      return;
    }

    if (sellerId && validators.userId(sellerId, "sellerId")) {
      return sendValidationError(res, [validators.userId(sellerId, "sellerId")!]);
    }

    if (buyerId && validators.userId(buyerId, "buyerId")) {
      return sendValidationError(res, [validators.userId(buyerId, "buyerId")!]);
    }

    // Validate that if saleAmount > 0, both seller and buyer must be provided
    if (saleAmount > 0 && (!sellerId || !buyerId)) {
      sendValidationError(res, [{
        field: saleAmount > 0 && !sellerId ? "sellerId" : "buyerId",
        message: "Both sellerId and buyerId are required when saleAmount > 0",
        code: "REQUIRED_FOR_SALE"
      }]);
      return;
    }

    if (uid !== courierId) {
      return sendError(
        res,
        new AppError("FORBIDDEN", "Only the assigned courier can capture this exchange", 403)
      );
    }

    await withIdempotency(`capture:${exchangeId}`, async () => {
      await db.runTransaction(async (tx) => {
        const exRef = db.collection("exchanges").doc(exchangeId);
        const courierRef = db.collection("wallets").doc(courierId);

        // ----- READS FIRST -----
        const exSnap = await tx.get(exRef);
        if (!exSnap.exists) throw BusinessErrors.EXCHANGE_NOT_FOUND(exchangeId);
        
        const exchange = exSnap.data() as any;
        if (exchange.status !== "hold_active") {
          throw BusinessErrors.EXCHANGE_INVALID_STATUS(exchange.status, "hold_active");
        }

        const { aId, bId, holds, currency } = exchange;
        const aHold = Number(holds?.a ?? 0);
        const bHold = Number(holds?.b ?? 0);
        const totalHeld = aHold + bHold;

        // Get wallet references and snapshots
        const aRef = db.collection("wallets").doc(aId);
        const bRef = db.collection("wallets").doc(bId);
        
        const [aSnap, bSnap, courierSnap] = await Promise.all([
          tx.get(aRef),
          tx.get(bRef), 
          tx.get(courierRef)
        ]);

        const aWallet = aSnap.data() as any;
        const bWallet = bSnap.data() as any;

        // Validate held amounts
        if (!aWallet) throw BusinessErrors.WALLET_NOT_FOUND(aId);
        if (!bWallet) throw BusinessErrors.WALLET_NOT_FOUND(bId);
        
        if ((aWallet.held ?? 0) < aHold) {
          throw BusinessErrors.INSUFFICIENT_FUNDS(`User ${aId} has insufficient held funds: needs ${aHold}, has ${aWallet.held ?? 0}`);
        }
        if ((bWallet.held ?? 0) < bHold) {
          throw BusinessErrors.INSUFFICIENT_FUNDS(`User ${bId} has insufficient held funds: needs ${bHold}, has ${bWallet.held ?? 0}`);
        }

        // ----- WRITES AFTER ALL READS -----
        
        // Process the pharmaceutical sale transaction if saleAmount is provided
        let buyerRef: FirebaseFirestore.DocumentReference | null = null;
        let sellerRef: FirebaseFirestore.DocumentReference | null = null;
        
        if (saleAmount > 0 && sellerId && buyerId) {
          // Validate that we have the required parties for a sale
          if (sellerId === buyerId) {
            throw BusinessErrors.EXCHANGE_INVALID_STATUS("invalid", "seller and buyer cannot be the same");
          }
          
          buyerRef = db.collection("wallets").doc(buyerId);
          sellerRef = db.collection("wallets").doc(sellerId);
          
          // Read buyer wallet to check if they have sufficient funds
          const buyerSnap = await tx.get(buyerRef);
          const buyerWallet = buyerSnap.data() as any;
          
          if (!buyerWallet) throw BusinessErrors.WALLET_NOT_FOUND(buyerId);
          if ((buyerWallet.available ?? 0) < saleAmount) {
            throw BusinessErrors.INSUFFICIENT_FUNDS(`Buyer ${buyerId} needs ${saleAmount} but only has ${buyerWallet.available ?? 0} available`);
          }
          
          // Transfer sale amount from buyer to seller
          tx.update(buyerRef, {
            available: FieldValue.increment(-saleAmount),
            updatedAt: FieldValue.serverTimestamp(),
          });
          
          // Create seller wallet if it doesn't exist, then credit them
          const sellerSnap = await tx.get(sellerRef);
          if (!sellerSnap.exists) {
            tx.set(sellerRef, walletInit(currency), { merge: true });
          }
          tx.update(sellerRef, {
            available: FieldValue.increment(saleAmount),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        
        // Release courier fee holds from A and B
        tx.update(aRef, {
          held: FieldValue.increment(-aHold),
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.update(bRef, {
          held: FieldValue.increment(-bHold),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Create or update courier wallet and pay them the courier fee
        if (!courierSnap.exists) {
          tx.set(courierRef, walletInit(currency), { merge: true });
        }
        tx.update(courierRef, {
          available: FieldValue.increment(totalHeld),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Update exchange status
        tx.update(exRef, {
          status: "completed",
          courierId,
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          ...(saleAmount && { saleAmount }),
          ...(sellerId && { sellerId }),
          ...(buyerId && { buyerId }),
        });

        // Create ledger entries
        const ledgerEntries = [
          // Courier fee hold releases
          {
            userId: aId,
            type: "hold_release",
            amount: aHold,
            currency,
            from: "held",
            to: "courier",
            exchangeId,
            courierId,
            description: "Courier fee payment (party A)",
            createdAt: FieldValue.serverTimestamp(),
          },
          {
            userId: bId,
            type: "hold_release", 
            amount: bHold,
            currency,
            from: "held",
            to: "courier",
            exchangeId,
            courierId,
            description: "Courier fee payment (party B)",
            createdAt: FieldValue.serverTimestamp(),
          },
          // Courier payment
          {
            userId: courierId,
            type: "courier_payment",
            amount: totalHeld,
            currency,
            from: "exchange",
            to: "wallet",
            exchangeId,
            description: "Courier service fee",
            createdAt: FieldValue.serverTimestamp(),
          }
        ];

        // Add pharmaceutical sale transaction ledger entries if sale occurred
        if (saleAmount > 0 && sellerId && buyerId) {
          ledgerEntries.push(
            // Buyer payment
            {
              userId: buyerId,
              type: "pharmaceutical_purchase",
              amount: saleAmount,
              currency,
              from: "wallet",
              to: "seller",
              exchangeId,
              sellerId: sellerId,
              description: "Pharmaceutical purchase payment",
              createdAt: FieldValue.serverTimestamp(),
            } as any,
            // Seller receipt
            {
              userId: sellerId,
              type: "pharmaceutical_sale",
              amount: saleAmount,
              currency,
              from: "buyer",
              to: "wallet",
              exchangeId,
              buyerId: buyerId,
              description: "Pharmaceutical sale receipt",
              createdAt: FieldValue.serverTimestamp(),
            } as any
          );
        }

        ledgerEntries.forEach(entry => {
          const ledgerRef = db.collection("ledger").doc();
          tx.set(ledgerRef, entry);
        });
      });
      return;
    });
    res.status(200).json({ ok: true, status: "completed" });
  } catch (error: any) {
    sendError(res, error);
  }
});

// 3) CANCEL (rend les holds)
export const exchangeCancel = onRequest({ region: "europe-west1" }, async (req, res) => {
  // Sprint 5 optimisation #9 — deprecation marker. Canonical path:
  // `cancelExchangeProposal` callable.
  logger.warn("legacy exchange endpoint hit", {
    endpoint: "exchangeCancel",
    userAgent: req.get("user-agent") ?? null,
    remoteIp: req.ip ?? null,
  });
  try {
    if (requireJson(req, res)) return;
    const { exchangeId } = req.body ?? {};
    const uid = await requireAuth(req, res);
    if (!uid) return;

    // Validate required field
    if (!exchangeId) {
      sendValidationError(res, [{
        field: "exchangeId",
        message: "exchangeId is required",
        code: "REQUIRED"
      }]);
      return;
    }

    if (typeof exchangeId !== "string") {
      sendValidationError(res, [{
        field: "exchangeId",
        message: "exchangeId must be a string",
        code: "INVALID_TYPE"
      }]);
      return;
    }

    const exchangeSnap = await db.collection("exchanges").doc(exchangeId).get();
    if (!exchangeSnap.exists) {
      throw BusinessErrors.EXCHANGE_NOT_FOUND(exchangeId);
    }

    const exchangeData = exchangeSnap.data() as any;
    const participants = new Set<string>([
      String(exchangeData?.aId ?? ""),
      String(exchangeData?.bId ?? ""),
      String(exchangeData?.courierId ?? ""),
    ]);
    if (!participants.has(uid)) {
      return sendError(
        res,
        new AppError("FORBIDDEN", "Only exchange participants can cancel this exchange", 403)
      );
    }

    await withIdempotency(`cancel:${exchangeId}`, async () => {
      await cancelExchangeTx(exchangeId);
    });
    res.status(200).json({ ok: true, status: "canceled" });
  } catch (error: any) {
    sendError(res, error);
  }
});

// 🔒 SUBSCRIPTION SECURITY FUNCTIONS (CRITICAL FOR REVENUE PROTECTION)
//
// Sprint 5 optimisation #5: the 4 quota/access callables (validateInventoryAccess,
// validateProposalAccess, validateAnalyticsAccess, getSubscriptionStatus) and
// the shared `getValidSubscription` helper moved to `./subscriptionValidators.ts`
// to deduplicate the previous parallel copies in this file and in the dead
// `./subscription.ts`. The fix also collapses the double-`get()` on
// `pharmacy_inventory.where(pharmacyId == userId)` that `validateInventoryAccess`
// used to run (once for the limit, again for `remainingSlots`).
export {
  validateInventoryAccess,
  validateProposalAccess,
  validateAnalyticsAccess,
  getSubscriptionStatus,
} from "./subscriptionValidators.js";


// ========== SANDBOX TESTING ==========

// 🔒 Sandbox environment guard: blocks sandbox functions outside the emulator
function isSandboxAllowed(): boolean {
  return process.env.FUNCTIONS_EMULATOR === "true" || process.env.SANDBOX_ENABLED === "true";
}

/**
 * Resolve the per-currency sandbox CREDIT cap (major units) from
 * `system_config/main.currencies[code].sandboxMaxCreditMajor`.
 *
 * Applies to sandboxCredit ONLY — sandboxDebit is bounded by the available
 * balance, never by this field. A demo guard rail, not an FX equivalence.
 *
 * Fail-loud: the field is MANDATORY and must be a positive integer. A
 * missing, non-integer, zero or negative value is a config error, never a
 * silent default — otherwise an unconfigured currency would credit
 * unbounded fake money.
 */
async function resolveSandboxCreditCapMajor(currencyCode: string): Promise<number> {
  const snap = await db.collection("system_config").doc("main").get();
  const raw = snap.exists
    ? (snap.data()?.currencies as Record<string, { sandboxMaxCreditMajor?: unknown }> | undefined)
        ?.[currencyCode]?.sandboxMaxCreditMajor
    : undefined;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
    throw new AppError(
      "SANDBOX_CAP_UNCONFIGURED",
      `Sandbox credit cap is not configured for ${currencyCode}`,
      422,
      { currencyCode }
    );
  }
  return raw;
}

// 🔒 Sandbox test-account patterns – entire @promoshake.net domain
// B3 fix: allow any @promoshake.net address (all are test accounts)
const SANDBOX_ACCOUNT_PATTERNS = [
  /^[\w.+-]+@promoshake\.net$/i
];

/**
 * Sandbox Credit Function for Testing
 * Credits test wallets with fake money for development/testing purposes
 *
 * Security: Only works for test accounts and development/emulator environment
 */
export const sandboxCredit = onRequest({
  region: "europe-west1",
  cors: true
}, async (req, res) => {
  try {
    // 🔒 Block in production unless explicitly enabled
    if (!isSandboxAllowed()) {
      res.status(403).json({ error: "Sandbox functions are disabled in production", code: "SANDBOX_DISABLED" });
      return;
    }

    if (requireJson(req, res)) return;

    const { userId, amount, description = "Sandbox test credit" } = req.body ?? {};

    // Validate required fields
    const errors = validateFields({ userId, amount }, {
      userId: validators.required,
      amount: (v, f) => validators.required(v, f) || (typeof v !== "number" || v <= 0 ?
        { field: f, message: `${f} must be a positive number`, code: 'INVALID_AMOUNT' } : null)
    });

    if (errors.length > 0) {
      return sendValidationError(res, errors);
    }

    // Security: Only allow test accounts (strict patterns, no Gmail wildcard)
    const testAccountPatterns = SANDBOX_ACCOUNT_PATTERNS;

    // Get user document from pharmacies or couriers collection
    let userDoc = await db.collection("pharmacies").doc(userId).get();
    let userData = null;
    let isCourierAccount = false;

    if (!userDoc.exists) {
      userDoc = await db.collection("couriers").doc(userId).get();
      if (userDoc.exists) {
        isCourierAccount = true;
      }
    }

    if (!userDoc.exists) {
      res.status(404).json({
        error: "User not found in pharmacies or couriers collection",
        code: "USER_NOT_FOUND"
      });
      return;
    }

    userData = userDoc.data();
    const userEmail = String(userData?.email ?? "").trim();

    // F1b: reject courier accounts — sandboxCredit is pharmacy-only.
    // Couriers must use dedicated courier testing flows.
    // This guard runs BEFORE the test-account email check so that any courier
    // (test or not) deterministically receives COURIER_NOT_ALLOWED.
    if (isCourierAccount) {
      res.status(400).json({
        error: "sandboxCredit is not allowed for courier accounts. Use dedicated courier testing flows.",
        code: "COURIER_NOT_ALLOWED"
      });
      return;
    }

    // Check if email matches test patterns
    const isTestAccount = testAccountPatterns.some(pattern => pattern.test(userEmail));

    if (!isTestAccount) {
      res.status(403).json({
        error: "Sandbox credit only allowed for test accounts",
        code: "NOT_TEST_ACCOUNT",
        hint: "Use email patterns: test*@promoshake.net, sandbox*@promoshake.net, dev*@promoshake.net"
      });
      return;
    }

    // Derive the wallet currency + owner type SERVER-SIDE (never "XAF").
    // sandboxCredit is pharmacy-only (F1b above), so ownerType is always
    // "pharmacy" here, but we route through the same resolver as getWallet
    // for a single source of truth.
    const resolved = await resolveCurrencyForWalletOwner(db, userId);
    if (!resolved.ok) {
      logger.error("sandboxCredit: cannot resolve wallet currency", {
        userId,
        reason: resolved.reason,
      });
      return sendError(
        res,
        new AppError(
          "WALLET_CURRENCY_UNRESOLVED",
          "Wallet configuration unavailable",
          walletOwnerRefusalHttpStatus(resolved.reason),
          resolved.reason
        )
      );
    }
    const { currency, ownerType } = resolved;

    // Cap is checked in MAJOR, before conversion. Mandatory, no fallback.
    const capMajor = await resolveSandboxCreditCapMajor(currency);
    if (amount > capMajor) {
      res.status(400).json({
        error: `Maximum sandbox credit is ${capMajor} ${currency}`,
        code: "AMOUNT_TOO_HIGH",
      });
      return;
    }

    // Convert to wallet units at the write boundary (pharmacy × 100).
    const amountWU = majorToWalletUnits(amount, ownerType as WalletOwnerKind);

    // Credit wallet with transaction
    await db.runTransaction(async (tx) => {
      const walletRef = db.collection("wallets").doc(userId);
      const walletDoc = await tx.get(walletRef);

      if (walletDoc.exists) {
        // Existing wallet keeps its snapshotted currency. Refuse — never
        // silently correct — if it contradicts the owner's derived currency.
        const storedCurrency = walletDoc.data()?.currency;
        if (storedCurrency !== currency) {
          throw new AppError(
            "WALLET_CURRENCY_MISMATCH",
            `Wallet currency ${storedCurrency} does not match owner currency ${currency}`,
            409,
            { userId, storedCurrency, expected: currency }
          );
        }
      } else {
        // Absent wallet created in the derived currency.
        tx.set(walletRef, {
          ...walletInit(currency),
          userId,
          userType: userData?.userType || ownerType,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      tx.update(walletRef, {
        available: FieldValue.increment(amountWU),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Ledger keeps `amount` in MAJOR; `walletUnitsDelta` records the
      // converted delta explicitly for reconciliation.
      const ledgerRef = db.collection("ledger").doc();
      tx.set(ledgerRef, {
        userId,
        type: "sandbox_credit",
        amount,
        walletUnitsDelta: amountWU,
        currency,
        description,
        createdAt: FieldValue.serverTimestamp(),
        metadata: { isSandbox: true, userEmail },
      });
    });

    logger.info("Sandbox credit applied", { userId, amount, currency, userEmail, description });

    res.status(200).json({
      success: true,
      message: "Sandbox credit applied successfully",
      userId,
      creditedAmount: amount,
      currency,
      isSandbox: true,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    logger.error("Sandbox credit failed", { error: error.message });
    sendError(res, error);
  }
});

/**
 * Sandbox Debit Function for Testing
 * Debits test wallets for development/testing purposes
 *
 * Security: Only works for test accounts and development/emulator environment
 */
export const sandboxDebit = onRequest({
  region: "europe-west1",
  cors: true
}, async (req, res) => {
  try {
    // 🔒 Block in production unless explicitly enabled
    if (!isSandboxAllowed()) {
      res.status(403).json({ error: "Sandbox functions are disabled in production", code: "SANDBOX_DISABLED" });
      return;
    }

    if (requireJson(req, res)) return;

    const { userId, amount, description = "Sandbox test debit" } = req.body ?? {};

    // Validate required fields
    const errors = validateFields({ userId, amount }, {
      userId: validators.required,
      amount: (v, f) => validators.required(v, f) || (typeof v !== "number" || v <= 0 ?
        { field: f, message: `${f} must be a positive number`, code: 'INVALID_AMOUNT' } : null)
    });

    if (errors.length > 0) {
      return sendValidationError(res, errors);
    }

    // Security: Only allow test accounts (strict patterns, no Gmail wildcard)
    const testAccountPatterns = SANDBOX_ACCOUNT_PATTERNS;

    // Get user document from pharmacies or couriers collection
    let userDoc = await db.collection("pharmacies").doc(userId).get();
    let userData = null;

    if (!userDoc.exists) {
      userDoc = await db.collection("couriers").doc(userId).get();
    }

    if (!userDoc.exists) {
      res.status(404).json({
        error: "User not found in pharmacies or couriers collection",
        code: "USER_NOT_FOUND"
      });
      return;
    }

    userData = userDoc.data();
    const userEmail = String(userData?.email ?? "").trim();

    // Check if email matches test patterns
    const isTestAccount = testAccountPatterns.some(pattern => pattern.test(userEmail));

    if (!isTestAccount) {
      res.status(403).json({
        error: "Sandbox debit only allowed for test accounts",
        code: "NOT_TEST_ACCOUNT",
        hint: "Use email patterns: test*@promoshake.net, sandbox*@promoshake.net, dev*@promoshake.net"
      });
      return;
    }

    // Derive currency + owner type SERVER-SIDE. sandboxDebit supports both
    // pharmacy and courier, so the conversion depends on ownerType.
    const resolved = await resolveCurrencyForWalletOwner(db, userId);
    if (!resolved.ok) {
      logger.error("sandboxDebit: cannot resolve wallet currency", {
        userId,
        reason: resolved.reason,
      });
      return sendError(
        res,
        new AppError(
          "WALLET_CURRENCY_UNRESOLVED",
          "Wallet configuration unavailable",
          walletOwnerRefusalHttpStatus(resolved.reason),
          resolved.reason
        )
      );
    }
    const { currency, ownerType } = resolved;

    // NOTE: sandboxDebit is bounded ONLY by the available balance — it does
    // NOT read sandboxMaxCreditMajor. That cap governs credit alone.
    const amountWU = majorToWalletUnits(amount, ownerType as WalletOwnerKind);

    // Debit wallet with transaction
    await db.runTransaction(async (tx) => {
      const walletRef = db.collection("wallets").doc(userId);
      const walletDoc = await tx.get(walletRef);

      if (!walletDoc.exists) {
        throw BusinessErrors.WALLET_NOT_FOUND(userId);
      }

      const currentWallet = walletDoc.data();
      const storedCurrency = currentWallet?.currency;
      if (storedCurrency !== currency) {
        throw new AppError(
          "WALLET_CURRENCY_MISMATCH",
          `Wallet currency ${storedCurrency} does not match owner currency ${currency}`,
          409,
          { userId, storedCurrency, expected: currency }
        );
      }

      const currentAvailable = currentWallet?.available || 0;

      // Sufficiency check in WALLET UNITS, same unit as the mutation.
      if (currentAvailable < amountWU) {
        throw BusinessErrors.INSUFFICIENT_FUNDS(
          `Insufficient balance: ${currentAvailable} available (wallet units), ${amountWU} requested`
        );
      }

      tx.update(walletRef, {
        available: FieldValue.increment(-amountWU),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Ledger keeps `amount` in MAJOR; `walletUnitsDelta` is the converted
      // (negative) delta.
      const ledgerRef = db.collection("ledger").doc();
      tx.set(ledgerRef, {
        userId,
        type: "sandbox_debit",
        amount,
        walletUnitsDelta: -amountWU,
        currency,
        description,
        createdAt: FieldValue.serverTimestamp(),
        metadata: { isSandbox: true, userEmail },
      });
    });

    logger.info("Sandbox debit applied", { userId, amount, currency, userEmail, description });

    res.status(200).json({
      success: true,
      message: "Sandbox debit applied successfully",
      userId,
      debitedAmount: amount,
      currency,
      isSandbox: true,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    logger.error("Sandbox debit failed", { error: error.message });
    sendError(res, error);
  }
});
