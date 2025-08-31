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
// 👉 expose aussi la tâche planifiée
export { expireExchangeHolds } from "./scheduled.js";

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

// ---------- Get Wallet Balance ----------
export const getWallet = onRequest({ region: "europe-west1", cors: true }, async (req, res) => {
  try {
    const userId = req.query?.userId as string | undefined;
    
    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    // Get or create wallet
    const walletRef = db.collection("wallets").doc(userId);
    const walletDoc = await walletRef.get();
    
    if (!walletDoc.exists) {
      // Create wallet if it doesn't exist
      const initialWallet = walletInit();
      await walletRef.set(initialWallet);
      res.status(200).json(initialWallet);
    } else {
      res.status(200).json(walletDoc.data());
    }
  } catch (error: any) {
    logger.error("getWallet error", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------- Create Top-up Intent ----------
export const topupIntent = onRequest({ region: "europe-west1" }, async (req, res) => {
  try {
    if (requireJson(req, res)) return;
    const { userId, method, amount, currency = "XAF", msisdn = null } = req.body ?? {};

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

    // Validate payment method
    const validMethods = ["mtn_momo", "orange_money"];
    if (!validMethods.includes(method)) {
      return sendValidationError(res, [{
        field: "method",
        message: `Method must be one of: ${validMethods.join(", ")}`,
        code: "INVALID_METHOD"
      }]);
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
  try {
    if (requireJson(req, res)) return;

    const { exchangeId, aId, bId, courierFee, currency = "XAF", idempotencyKey } = req.body ?? {};

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

    // Business validation
    if (aId === bId) {
      return sendValidationError(res, [{
        field: "bId",
        message: "User A and User B cannot be the same",
        code: "IDENTICAL_USERS"
      }]);
    }

    if (exchangeId && typeof exchangeId !== "string") {
      return sendValidationError(res, [{
        field: "exchangeId",
        message: "exchangeId must be a string",
        code: "INVALID_TYPE"
      }]);
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
    });

    res.status(200).json({ ok: true, status: "hold_active", exchangeId: exId });
  } catch (error: any) {
    sendError(res, error);
  }
});

// 2) CAPTURE (payer le coursier)
export const exchangeCapture = onRequest({ region: "europe-west1" }, async (req, res) => {
  try {
    if (requireJson(req, res)) return;

    const { exchangeId, courierId, saleAmount = 0, sellerId, buyerId } = req.body ?? {};

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
      return sendValidationError(res, [{
        field: "saleAmount",
        message: "saleAmount must be a number",
        code: "INVALID_TYPE"
      }]);
    }

    if (saleAmount && saleAmount < 0) {
      return sendValidationError(res, [{
        field: "saleAmount",
        message: "saleAmount must be non-negative",
        code: "INVALID_AMOUNT"
      }]);
    }

    if (sellerId && validators.userId(sellerId, "sellerId")) {
      return sendValidationError(res, [validators.userId(sellerId, "sellerId")!]);
    }

    if (buyerId && validators.userId(buyerId, "buyerId")) {
      return sendValidationError(res, [validators.userId(buyerId, "buyerId")!]);
    }

    // Validate that if saleAmount > 0, both seller and buyer must be provided
    if (saleAmount > 0 && (!sellerId || !buyerId)) {
      return sendValidationError(res, [{
        field: saleAmount > 0 && !sellerId ? "sellerId" : "buyerId",
        message: "Both sellerId and buyerId are required when saleAmount > 0",
        code: "REQUIRED_FOR_SALE"
      }]);
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
    });
    res.status(200).json({ ok: true, status: "completed" });
  } catch (error: any) {
    sendError(res, error);
  }
});

// 3) CANCEL (rend les holds)
export const exchangeCancel = onRequest({ region: "europe-west1" }, async (req, res) => {
  try {
    if (requireJson(req, res)) return;
    const { exchangeId } = req.body ?? {};

    // Validate required field
    if (!exchangeId) {
      return sendValidationError(res, [{
        field: "exchangeId",
        message: "exchangeId is required",
        code: "REQUIRED"
      }]);
    }

    if (typeof exchangeId !== "string") {
      return sendValidationError(res, [{
        field: "exchangeId",
        message: "exchangeId must be a string",
        code: "INVALID_TYPE"
      }]);
    }

    await withIdempotency(`cancel:${exchangeId}`, async () => {
      await cancelExchangeTx(exchangeId);
    });
    res.status(200).json({ ok: true, status: "canceled" });
  } catch (error: any) {
    sendError(res, error);
  }
});
