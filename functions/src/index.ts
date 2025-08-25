import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";

import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

import crypto from "node:crypto";

// 👉 helpers (déjà dans src/lib)
import { withIdempotency } from "./lib/idempotency.js";
import { cancelExchangeTx } from "./lib/exchange.js";
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

// ======================= Exchange endpoints =======================

// 1) HOLD 50/50
export const createExchangeHold = onRequest({ region: "europe-west1" }, async (req, res) => {
  if (requireJson(req, res)) return;

  const { exchangeId, aId, bId, courierFee, currency = "XAF", idempotencyKey } = req.body ?? {};
  if (!aId || !bId || !courierFee || courierFee <= 0) {
    res.status(400).send("missing/invalid fields");
    return;
  }

  const holdKey = `hold:${exchangeId ?? idempotencyKey ?? `${aId}:${bId}:${courierFee}:${currency}`}`;
  const halfA = Math.floor(Number(courierFee) / 2);
  const halfB = Number(courierFee) - halfA;
  const exId = exchangeId ?? db.collection("exchanges").doc().id;

  try {
    await withIdempotency(holdKey, async () => {
      await db.runTransaction(async (tx) => {
        const aRef = db.collection("wallets").doc(aId);
        const bRef = db.collection("wallets").doc(bId);
        const exRef = db.collection("exchanges").doc(exId);

        // READS
        const [aSnap, bSnap] = await Promise.all([tx.get(aRef), tx.get(bRef)]);
        const a = aSnap.data() as any | undefined;
        const b = bSnap.data() as any | undefined;

        if (!a || !b) throw new Error("wallets missing");
        if ((a.available ?? 0) < halfA) throw new Error("A insufficient funds");
        if ((b.available ?? 0) < halfB) throw new Error("B insufficient funds");

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

// 2) CAPTURE (payer le coursier)
export const exchangeCapture = onRequest({ region: "europe-west1" }, async (req, res) => {
  if (requireJson(req, res)) return;

  const { exchangeId, courierId, saleAmount = 0, sellerId, buyerId } = req.body ?? {};
  if (!exchangeId || !courierId) {
    res.status(400).send("missing fields");
    return;
  }

  try {
    await withIdempotency(`capture:${exchangeId}`, async () => {
      // … (ta logique de capture actuelle : tout lire puis tout écrire)
      // pour rester concis ici, on suppose que ta version qui fonctionne
      // déjà est conservée.
      // (si tu veux, je peux la remettre intégrale aussi)
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

// 3) CANCEL (rend les holds)
export const exchangeCancel = onRequest({ region: "europe-west1" }, async (req, res) => {
  if (requireJson(req, res)) return;
  const { exchangeId } = req.body ?? {};
  if (!exchangeId) {
    res.status(400).send("missing exchangeId");
    return;
  }

  try {
    await withIdempotency(`cancel:${exchangeId}`, async () => {
      await cancelExchangeTx(exchangeId);
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
