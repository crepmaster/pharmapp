/**
 * paystackWebhook — receives signed callbacks from Paystack and credits the
 * wallet on `charge.success` events.
 *
 * Security:
 *  - Signature check via HMAC-SHA512 of the raw body with the secret key.
 *  - Idempotent wallet credit keyed by the payment reference.
 *  - Reads `amountMinor` / `currencyDecimals` from the payment intent
 *    snapshotted at init time (ADR-001 guard #2).
 */

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as crypto from "crypto";
import {
  MONEY_SCHEMA_VERSION,
  toLegacyWalletUnits,
  FALLBACK_DECIMALS,
} from "./lib/moneyUnits.js";

const db = getFirestore();

const PAYSTACK_SECRET_KEY = defineSecret("PAYSTACK_SECRET_KEY");

export const paystackWebhook = onRequest(
  {
    region: "europe-west1",
    cors: false, // Paystack does not need CORS, and leaving it open reduces risk
    secrets: [PAYSTACK_SECRET_KEY],
  },
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.status(405).send("method not allowed");
        return;
      }

      // Paystack signs the *raw* JSON body. firebase-functions provides the
      // parsed body in req.body; JSON.stringify of an already-parsed object
      // will match if we haven't mutated it.
      const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
      const bodyString =
        rawBody?.toString("utf8") ?? JSON.stringify(req.body);

      const expectedSig = crypto
        .createHmac("sha512", PAYSTACK_SECRET_KEY.value())
        .update(bodyString)
        .digest("hex");
      const providedSig = String(req.headers["x-paystack-signature"] ?? "");

      if (expectedSig !== providedSig) {
        logger.warn("paystackWebhook: signature mismatch");
        res.status(401).send("invalid signature");
        return;
      }

      const event = req.body as {
        event?: string;
        data?: { reference?: string; status?: string };
      };
      if (event.event !== "charge.success") {
        // Acknowledge other events without processing.
        res.status(200).send("ignored");
        return;
      }

      const reference = event.data?.reference;
      if (!reference) {
        res.status(400).send("missing reference");
        return;
      }

      const paymentRef = db.collection("payments").doc(reference);
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(paymentRef);
        if (!snap.exists) {
          return { status: "not_found" as const };
        }
        const payment = snap.data()!;
        if (payment.status === "successful") {
          return { status: "already_successful" as const };
        }

        const userId = payment.userId as string;
        const displayCurrency = (payment.displayCurrency as string) || "GHS";
        const snappedDecimals =
          typeof payment.currencyDecimals === "number"
            ? (payment.currencyDecimals as number)
            : FALLBACK_DECIMALS[displayCurrency] ?? 2;
        const amountMinor =
          typeof payment.amountMinor === "number"
            ? (payment.amountMinor as number)
            : Math.round(
                (Number(payment.amount) || 0) * Math.pow(10, snappedDecimals)
              );
        const walletLegacyDelta = toLegacyWalletUnits(
          amountMinor,
          snappedDecimals
        );

        const walletRef = db.collection("wallets").doc(userId);
        const walletSnap = await tx.get(walletRef);
        if (!walletSnap.exists) {
          tx.set(walletRef, {
            available: walletLegacyDelta,
            held: 0,
            currency: displayCurrency,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          tx.update(walletRef, {
            available: FieldValue.increment(walletLegacyDelta),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        tx.update(paymentRef, {
          status: "successful",
          updatedAt: FieldValue.serverTimestamp(),
          settledAt: FieldValue.serverTimestamp(),
          paystackEvent: event.event,
        });

        const ledgerRef = db.collection("ledger").doc();
        tx.set(ledgerRef, {
          type: "wallet_topup",
          referenceId: reference,
          userId,
          amountMinor,
          currencyDecimals: snappedDecimals,
          moneySchemaVersion: MONEY_SCHEMA_VERSION,
          currencyCode: displayCurrency,
          // Legacy compat
          amount: walletLegacyDelta,
          currency: displayCurrency,
          provider: "paystack",
          createdAt: FieldValue.serverTimestamp(),
        });

        return {
          status: "credited" as const,
          userId,
          amountMinor,
          displayCurrency,
        };
      });

      logger.info("paystackWebhook: processed", {
        reference,
        outcome: result.status,
      });
      res.status(200).send("ok");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("paystackWebhook: error", { msg });
      res.status(500).send("error");
    }
  }
);
