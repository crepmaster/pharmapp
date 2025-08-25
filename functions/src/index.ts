import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import {
  getFirestore,
  FieldValue,
  DocumentReference,
  Timestamp,
  DocumentSnapshot,
} from "firebase-admin/firestore";
import crypto from "node:crypto";

const LOG_TTL_DAYS = 30; // webhook logs kept for 30 days


initializeApp();
const db = getFirestore();

// ---- Secrets ----
const MOMO_TOKEN   = defineSecret("MOMO_CALLBACK_TOKEN");
const ORANGE_TOKEN = defineSecret("ORANGE_CALLBACK_TOKEN");

// ---------- Utils ----------
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

// Idempotency gate: returns true if we created the lock (first caller)
async function withIdempotency(key: string, fn: () => Promise<void>): Promise<boolean> {
  const ref = db.collection("idempotency").doc(key);
  const created = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.create(ref, { at: FieldValue.serverTimestamp() });
    return true;
  });
  if (!created) return false;
  await fn();
  return true;
}

function walletInit(currency = "XAF") {
  return { available: 0, held: 0, currency, updatedAt: FieldValue.serverTimestamp() };
}

// ---------- Health ----------
export const health = onRequest({ region: "europe-west1", cors: true }, (_req, res) => {
  res.status(200).send("ok");
});

// ---------- Create Top-up Intent ----------
export const topupIntent = onRequest({ region: "europe-west1" }, async (req, res) => {
  if (requireJson(req, res)) return;
  const { userId, method, amount, currency = "XAF", msisdn = null } = req.body ?? {};
  if (!userId || !method || !amount) {
    res.status(400).send("missing fields");
    return;
  }

  const doc = db.collection("payments").doc();
  await doc.set({
    userId, method, amount, currency, msisdn,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  res.status(201).json({ paymentId: doc.id, status: "pending" });
});

// ---------- Webhook handler helper ----------
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
  const got = getInboundToken(req);
  const expected = String(expectedToken ?? "").trim();
  if (!expected || got !== expected) {
    res.status(401).send("unauthorized");
    return;
  }

  const body = typeof req.body === "object" ? req.body : {};
  const { providerTxnId, paymentId, amount, currency } = extract(body, req.headers);
  const pid = paymentId ?? `${provider}_${providerTxnId}`;

  await withIdempotency(`${provider}:${providerTxnId}`, async () => {
    await db.runTransaction(async (tx) => {
      const payRef = db.collection("payments").doc(pid);
      const logRef = db.collection("webhook_logs").doc(`${provider}:${providerTxnId}`);

      // ----- ALL READS FIRST -----
      const paySnap = await tx.get(payRef);
      const payment = paySnap.exists ? (paySnap.data() ?? {}) : {};
      const userId: string | undefined = (payment as any).userId;

      let walletRef: DocumentReference | null = null;
      let walletSnap: DocumentSnapshot | null = null;

      const amt = amount ?? (payment as any)?.amount ?? null;
      const cur = currency ?? (payment as any)?.currency ?? "XAF";

      // 🔧 FIX: Do wallet read BEFORE any writes
      if (userId && typeof amt === "number" && amt > 0) {
        walletRef = db.collection("wallets").doc(userId);
        walletSnap = await tx.get(walletRef);  // ← MOVED UP
      }

      // ----- ALL WRITES AFTER ALL READS -----
      // log webhook
// log webhook with TTL (expireAt must be a future timestamp)
const expireAt = Timestamp.fromMillis(Date.now() + LOG_TTL_DAYS * 24 * 60 * 60 * 1000);
tx.set(
  logRef,
  {
    provider,
    receivedAt: FieldValue.serverTimestamp(),   // clearer name than "at"
    expireAt,                                    // <-- TTL field
    providerTxnId,                               // handy for filtering/debug
    paymentId: pid,                              // tie log to payment
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

      if (userId && walletRef && typeof amt === "number" && amt > 0) {
        if (!walletSnap!.exists) {
          // Create wallet with initial credit
          tx.set(
            walletRef,
            {
              available: amt,
              held: 0,
              currency: cur,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        } else {
          tx.update(walletRef, {
            available: FieldValue.increment(amt),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        // ledger
        const lref = db.collection("ledger").doc();
        tx.set(lref, {
          userId, type: "topup", amount: amt, currency: cur,
          from: "external", to: "wallet", provider, paymentId: pid,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });
  });

  res.status(200).send("ok");
}



export async function cancelExchangeTx(exchangeId: string) {
  await db.runTransaction(async (tx) => {
    const exRef = db.collection("exchanges").doc(exchangeId);

    // ----- READS -----
    const exSnap = await tx.get(exRef);
    if (!exSnap.exists) throw new Error("exchange not found");
    const ex = exSnap.data() as any;
    if (ex.status !== "hold_active") return; // already handled / no-op

    const { aId, bId, holds, currency } = ex;
    const aHold = Number(holds?.a ?? 0);
    const bHold = Number(holds?.b ?? 0);

    const aRef = db.collection("wallets").doc(aId);
    const bRef = db.collection("wallets").doc(bId);
    const [aSnap, bSnap] = await Promise.all([tx.get(aRef), tx.get(bRef)]);
    const a = aSnap.data() as any; const b = bSnap.data() as any;
    if ((a?.held ?? 0) < aHold) throw new Error("A held insufficient");
    if ((b?.held ?? 0) < bHold) throw new Error("B held insufficient");

    // ----- WRITES -----
    tx.update(aRef, {
      held: FieldValue.increment(-aHold),
      available: FieldValue.increment(+aHold),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(bRef, {
      held: FieldValue.increment(-bHold),
      available: FieldValue.increment(+bHold),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const lA = db.collection("ledger").doc();
    const lB = db.collection("ledger").doc();
    tx.set(lA, { userId: aId, type: "hold_release", amount: aHold, currency, exchangeId, createdAt: FieldValue.serverTimestamp() });
    tx.set(lB, { userId: bId, type: "hold_release", amount: bHold, currency, exchangeId, createdAt: FieldValue.serverTimestamp() });

    tx.update(exRef, { status: "canceled", canceledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
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
    } catch (e) {
      logger.error("momo webhook error", e);
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
    } catch (e) {
      logger.error("orange webhook error", e);
      res.status(200).send("ok");
    }
  }
);

// ======================= Exchange Holds / Capture / Cancel =======================

type ExchangeStatus = "pending" | "hold_active" | "canceled" | "completed";

function splitHalf(total: number) {
  const left = Math.floor(total / 2);
  return { a: left, b: total - left }; // couvre les cas impairs
}

/**
 * 1) Pré-autorise 50/50 le frais coursier sur A et B
 * body: { exchangeId?, aId, bId, courierFee, currency="XAF", idempotencyKey? }
 */
export const createExchangeHold = onRequest({ region: "europe-west1" }, async (req, res) => {
  if (requireJson(req, res)) return;

  const { exchangeId, aId, bId, courierFee, currency = "XAF", idempotencyKey } = req.body ?? {};
  if (!aId || !bId || !courierFee || courierFee <= 0) {
    res.status(400).send("missing/invalid fields");
    return;
  }

  const holdKey = `hold:${exchangeId ?? idempotencyKey ?? `${aId}:${bId}:${courierFee}:${currency}`}`;
  const { a: aHalf, b: bHalf } = splitHalf(Number(courierFee));
  const exId = exchangeId ?? db.collection("exchanges").doc().id;

  try {
    await withIdempotency(holdKey, async () => {
      await db.runTransaction(async (tx) => {
        const aRef = db.collection("wallets").doc(aId);
        const bRef = db.collection("wallets").doc(bId);
        const exRef = db.collection("exchanges").doc(exId);

        // ----- LECTURES EN PREMIER -----
        const [aSnap, bSnap] = await Promise.all([tx.get(aRef), tx.get(bRef)]);
        const a = aSnap.exists ? (aSnap.data() as any) : null;
        const b = bSnap.exists ? (bSnap.data() as any) : null;

        // init wallets si absents (après TOUTES les lectures)
        if (!a) tx.set(aRef, walletInit(currency));
        if (!b) tx.set(bRef, walletInit(currency));

        const aAvail = a?.available ?? 0;
        const bAvail = b?.available ?? 0;

        if (aAvail < aHalf) throw new Error("A insufficient funds");
        if (bAvail < bHalf) throw new Error("B insufficient funds");

        // ----- ÉCRITURES APRÈS LES LECTURES -----
        // move available -> held
        tx.update(aRef, {
          available: FieldValue.increment(-aHalf),
          held: FieldValue.increment(+aHalf),
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.update(bRef, {
          available: FieldValue.increment(-bHalf),
          held: FieldValue.increment(+bHalf),
          updatedAt: FieldValue.serverTimestamp(),
        });

        tx.set(
          exRef,
          {
            aId, bId, currency,
            courierFee: Number(courierFee),
            holds: { a: aHalf, b: bHalf },
            status: "hold_active" as ExchangeStatus,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        // ledger entries (hold)
        const lA = db.collection("ledger").doc();
        const lB = db.collection("ledger").doc();
        tx.set(lA, {
          userId: aId, type: "hold", amount: aHalf, currency,
          from: "wallet.available", to: "wallet.held",
          exchangeId: exId, role: "pharmacy_a",
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(lB, {
          userId: bId, type: "hold", amount: bHalf, currency,
          from: "wallet.available", to: "wallet.held",
          exchangeId: exId, role: "pharmacy_b",
          createdAt: FieldValue.serverTimestamp(),
        });
      });
    });
    res.status(200).json({ ok: true, status: "hold_active", exchangeId: exId });
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    if (msg.includes("insufficient")) {
      res.status(409).json({ ok: false, code: "INSUFFICIENT_FUNDS", detail: msg });
    } else if (msg.includes("wallets missing")) {
      res.status(404).json({ ok: false, code: "WALLET_NOT_FOUND", detail: msg });
    } else {
      res.status(500).json({ ok: false, code: "INTERNAL", detail: msg });
    }
  }
});

/**
 * 2) Capture des holds vers le coursier (+ option règlement vente)
 * body: { exchangeId, courierId, saleAmount?, sellerId?, buyerId? }
 */
export const exchangeCapture = onRequest({ region: "europe-west1" }, async (req, res) => {
  if (requireJson(req, res)) return;
  const { exchangeId, courierId, saleAmount = 0, sellerId, buyerId } = req.body ?? {};
  if (!exchangeId || !courierId) {
    res.status(400).send("missing fields");
    return;
  }

  try {
    await withIdempotency(`capture:${exchangeId}`, async () => {
      await db.runTransaction(async (tx) => {
        const exRef = db.collection("exchanges").doc(exchangeId);

        // ----- READS FIRST -----
        const exSnap = await tx.get(exRef);
        if (!exSnap.exists) throw new Error("exchange not found");
        const ex = exSnap.data() as any;
        if (ex.status !== "hold_active") return; // déjà traité ou pas en état

        const { aId, bId, holds, currency } = ex;
        const aHold = Number(holds?.a ?? 0);
        const bHold = Number(holds?.b ?? 0);

        const aRef = db.collection("wallets").doc(aId);
        const bRef = db.collection("wallets").doc(bId);
        const cRef = db.collection("wallets").doc(courierId);

        const reads: Promise<DocumentSnapshot>[] = [tx.get(aRef), tx.get(bRef), tx.get(cRef)];

        let buyerRef: DocumentReference | null = null;
        let sellerRef: DocumentReference | null = null;

        const hasSale = saleAmount && sellerId && buyerId && Number(saleAmount) > 0;
        if (hasSale) {
          buyerRef = db.collection("wallets").doc(buyerId as string);
          sellerRef = db.collection("wallets").doc(sellerId as string);
          reads.push(tx.get(buyerRef), tx.get(sellerRef));
        }

        const [aSnap, bSnap, cSnap, buyerSnap, sellerSnap] = await Promise.all(reads).then((arr) => {
          const pad = (i: number) => (arr[i] ?? null) as DocumentSnapshot | null;
          return [pad(0), pad(1), pad(2), pad(3), pad(4)];
        });

        const a = aSnap!.data() as any;
        const b = bSnap!.data() as any;
        if ((a?.held ?? 0) < aHold) throw new Error("A held insufficient");
        if ((b?.held ?? 0) < bHold) throw new Error("B held insufficient");

        // ----- WRITES AFTER ALL READS -----
        // init courier wallet if missing
        if (!cSnap!.exists) tx.set(cRef, walletInit(currency));

        // release holds from A & B
        tx.update(aRef, { held: FieldValue.increment(-aHold), updatedAt: FieldValue.serverTimestamp() });
        tx.update(bRef, { held: FieldValue.increment(-bHold), updatedAt: FieldValue.serverTimestamp() });

        // credit courier
        tx.update(cRef, { available: FieldValue.increment(aHold + bHold), updatedAt: FieldValue.serverTimestamp() });

        // ledger: capture -> courier
        const l1 = db.collection("ledger").doc();
        const l2 = db.collection("ledger").doc();
        const l3 = db.collection("ledger").doc();
        tx.set(l1, { userId: aId, type: "hold_capture", amount: aHold, currency, exchangeId, toUser: courierId, createdAt: FieldValue.serverTimestamp() });
        tx.set(l2, { userId: bId, type: "hold_capture", amount: bHold, currency, exchangeId, toUser: courierId, createdAt: FieldValue.serverTimestamp() });
        tx.set(l3, { userId: courierId, type: "courier_fee", amount: aHold + bHold, currency, exchangeId, fromUsers: [aId, bId], createdAt: FieldValue.serverTimestamp() });

        // optional sale settlement
        if (hasSale && buyerRef && sellerRef) {
          const amt = Number(saleAmount);
          const buyer = buyerSnap!.data() as any;
          if ((buyer?.available ?? 0) < amt) throw new Error("buyer insufficient");

          // init seller if missing
          if (!sellerSnap!.exists) tx.set(sellerRef, walletInit(currency));

          tx.update(buyerRef, { available: FieldValue.increment(-amt), updatedAt: FieldValue.serverTimestamp() });
          tx.update(sellerRef, { available: FieldValue.increment(+amt), updatedAt: FieldValue.serverTimestamp() });

          const lSaleOut = db.collection("ledger").doc();
          const lSaleIn  = db.collection("ledger").doc();
          tx.set(lSaleOut, { userId: buyerId,  type: "sale_payment", amount: amt, currency, exchangeId, toUser: sellerId,  createdAt: FieldValue.serverTimestamp() });
          tx.set(lSaleIn,  { userId: sellerId, type: "sale_receipt", amount: amt, currency, exchangeId, fromUser: buyerId, createdAt: FieldValue.serverTimestamp() });
        }

        tx.update(exRef, { status: "completed" as ExchangeStatus, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      });
    });
    res.status(200).json({ ok: true, status: "completed" });
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    if (msg.includes("insufficient")) {
      res.status(409).json({ ok: false, code: "INSUFFICIENT_FUNDS", detail: msg });
    } else if (msg.includes("exchange not found")) {
      res.status(404).json({ ok: false, code: "EXCHANGE_NOT_FOUND" });
    } else {
      res.status(500).json({ ok: false, code: "INTERNAL", detail: msg });
    }
  }
});

/**
 * 3) Annule l’échange: rend les holds à A et B
 * body: { exchangeId }
 */
export const exchangeCancel = onRequest({ region: "europe-west1" }, async (req, res) => {
  if (requireJson(req, res)) return;
  const { exchangeId } = req.body ?? {};
  if (!exchangeId) {
    res.status(400).send("missing exchangeId");
    return;
  }

  try {
    await withIdempotency(`cancel:${exchangeId}`, async () => {
      await db.runTransaction(async (tx) => {
        const exRef = db.collection("exchanges").doc(exchangeId);

        // ----- READS FIRST -----
        const exSnap = await tx.get(exRef);
        if (!exSnap.exists) throw new Error("exchange not found");
        const ex = exSnap.data() as any;
        if (ex.status !== "hold_active") return;

        const { aId, bId, holds, currency } = ex;
        const aHold = Number(holds?.a ?? 0);
        const bHold = Number(holds?.b ?? 0);

        const aRef = db.collection("wallets").doc(aId);
        const bRef = db.collection("wallets").doc(bId);
        const [aSnap, bSnap] = await Promise.all([tx.get(aRef), tx.get(bRef)]);
        const a = aSnap.data() as any; const b = bSnap.data() as any;
        if ((a?.held ?? 0) < aHold) throw new Error("A held insufficient");
        if ((b?.held ?? 0) < bHold) throw new Error("B held insufficient");

        // ----- WRITES AFTER ALL READS -----
        // held -> available (refund)
        tx.update(aRef, { held: FieldValue.increment(-aHold), available: FieldValue.increment(+aHold), updatedAt: FieldValue.serverTimestamp() });
        tx.update(bRef, { held: FieldValue.increment(-bHold), available: FieldValue.increment(+bHold), updatedAt: FieldValue.serverTimestamp() });

        // ledger
        const lA = db.collection("ledger").doc();
        const lB = db.collection("ledger").doc();
        tx.set(lA, { userId: aId, type: "hold_release", amount: aHold, currency, exchangeId, createdAt: FieldValue.serverTimestamp() });
        tx.set(lB, { userId: bId, type: "hold_release", amount: bHold, currency, exchangeId, createdAt: FieldValue.serverTimestamp() });

        tx.update(exRef, { status: "canceled" as ExchangeStatus, canceledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      });
    });
    res.status(200).json({ ok: true, status: "canceled" });
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    if (msg.includes("insufficient")) {
      res.status(409).json({ ok: false, code: "INSUFFICIENT_FUNDS", detail: msg });
    } else if (msg.includes("exchange not found")) {
      res.status(404).json({ ok: false, code: "EXCHANGE_NOT_FOUND" });
    } else {
      res.status(500).json({ ok: false, code: "INTERNAL", detail: msg });
    }
  }
});
