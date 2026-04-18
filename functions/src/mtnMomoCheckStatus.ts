/**
 * mtnMomoCheckStatus — Poll MTN MoMo payment status and credit wallet on SUCCESSFUL.
 *
 * Called by the client after mtnMomoTopupIntent to check the outcome.
 * On SUCCESSFUL, credits the user's wallet atomically (idempotent via referenceId).
 *
 * Status values from MTN:
 *   - PENDING: user hasn't approved yet
 *   - SUCCESSFUL: user approved, payment cleared
 *   - FAILED: user denied, insufficient funds, or timeout
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  MONEY_SCHEMA_VERSION,
  toLegacyWalletUnits,
  FALLBACK_DECIMALS,
} from "./lib/moneyUnits.js";

const db = getFirestore();

const MTN_MOMO_SUBSCRIPTION_KEY = defineSecret("MTN_MOMO_SUBSCRIPTION_KEY");
const MTN_MOMO_API_USER = defineSecret("MTN_MOMO_API_USER");
const MTN_MOMO_API_KEY = defineSecret("MTN_MOMO_API_KEY");

const MTN_BASE_URL = "https://sandbox.momodeveloper.mtn.com";
const TARGET_ENVIRONMENT = "sandbox";

interface CheckStatusData {
  referenceId: string;
}

async function getAccessToken(
  subscriptionKey: string,
  apiUser: string,
  apiKey: string
): Promise<string> {
  const credentials = Buffer.from(`${apiUser}:${apiKey}`).toString("base64");
  const res = await fetch(`${MTN_BASE_URL}/collection/token/`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Ocp-Apim-Subscription-Key": subscriptionKey,
    },
  });
  if (!res.ok) {
    throw new HttpsError("internal", `MTN auth failed: ${res.status}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export const mtnMomoCheckStatus = onCall<CheckStatusData>(
  {
    region: "europe-west1",
    cors: true,
    secrets: [MTN_MOMO_SUBSCRIPTION_KEY, MTN_MOMO_API_USER, MTN_MOMO_API_KEY],
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { referenceId } = request.data;
    if (!referenceId || typeof referenceId !== "string") {
      throw new HttpsError("invalid-argument", "referenceId is required.");
    }

    // Fetch the payment intent doc — idempotency guard.
    const paymentRef = db.collection("payments").doc(referenceId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) {
      throw new HttpsError("not-found", "Payment intent not found.");
    }
    const payment = paymentSnap.data()!;
    if (payment.userId !== userId) {
      throw new HttpsError("permission-denied", "Not your payment.");
    }

    // Already settled — return cached status.
    if (payment.status === "successful" || payment.status === "failed") {
      return { status: payment.status, amount: payment.amount };
    }

    // Query MTN for live status.
    const subscriptionKey = MTN_MOMO_SUBSCRIPTION_KEY.value();
    const apiUser = MTN_MOMO_API_USER.value();
    const apiKey = MTN_MOMO_API_KEY.value();

    const token = await getAccessToken(subscriptionKey, apiUser, apiKey);

    const res = await fetch(
      `${MTN_BASE_URL}/collection/v1_0/requesttopay/${referenceId}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-Target-Environment": TARGET_ENVIRONMENT,
          "Ocp-Apim-Subscription-Key": subscriptionKey,
        },
      }
    );

    if (!res.ok) {
      const text = await res.text();
      logger.error("MTN status query failed", { status: res.status, body: text });
      throw new HttpsError("internal", `MTN status query failed: ${res.status}`);
    }

    const mtnStatus = (await res.json()) as {
      status: string;
      reason?: string;
      financialTransactionId?: string;
    };
    const normalizedStatus = String(mtnStatus.status ?? "").toUpperCase();

    logger.info("mtnMomoCheckStatus", { referenceId, mtnStatus: normalizedStatus });

    if (normalizedStatus === "PENDING") {
      return { status: "pending" };
    }

    if (normalizedStatus === "SUCCESSFUL") {
      // Settlement is idempotent and uses the payment snapshot captured at
      // intent time (ADR-001 guard #2: no live system_config re-read).
      const walletRef = db.collection("wallets").doc(userId);
      const displayCurrency =
        payment.displayCurrency || payment.currency || "XAF";

      // Canonical ADR-001 value. Fall back to legacy `amount * 10^decimals`
      // only for intents that predate Phase 1a (backward compat).
      const snapshottedDecimals =
        typeof payment.currencyDecimals === "number"
          ? payment.currencyDecimals
          : (FALLBACK_DECIMALS[displayCurrency] ?? 2);
      const amountMinor: number =
        typeof payment.amountMinor === "number"
          ? payment.amountMinor
          : Math.round((Number(payment.amount) || 0) * Math.pow(10, snapshottedDecimals));

      // @transitional (Phase 1a): wallet collection still uses legacy
      // major-×-100 semantics. Phase 1b will replace this with direct
      // `availableMinor` writes.
      const walletLegacyDelta = toLegacyWalletUnits(amountMinor, snapshottedDecimals);

      await db.runTransaction(async (tx) => {
        const freshPayment = await tx.get(paymentRef);
        if (!freshPayment.exists) {
          throw new HttpsError("not-found", "Payment vanished.");
        }
        // Idempotency: skip if another process already credited.
        if (freshPayment.data()?.status === "successful") return;

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
          financialTransactionId: mtnStatus.financialTransactionId ?? null,
          updatedAt: FieldValue.serverTimestamp(),
          settledAt: FieldValue.serverTimestamp(),
        });

        // Ledger dual-write (ADR-001 guard #4):
        //  - amountMinor: canonical ADR-001 value
        //  - amount: legacy compat value (same scale as wallet.available delta)
        //  - moneySchemaVersion: discriminator for future readers
        const ledgerRef = db.collection("ledger").doc();
        tx.set(ledgerRef, {
          type: "wallet_topup",
          referenceId,
          userId,
          amountMinor,
          currencyDecimals: snapshottedDecimals,
          moneySchemaVersion: MONEY_SCHEMA_VERSION,
          currencyCode: displayCurrency,
          // Legacy compat fields:
          amount: walletLegacyDelta, // @deprecated
          currency: displayCurrency, // @deprecated (use currencyCode)
          provider: "mtn_momo",
          createdAt: FieldValue.serverTimestamp(),
        });
      });

      return {
        status: "successful",
        amountMinor,
        currencyDecimals: snapshottedDecimals,
      };
    }

    // FAILED or any other terminal status.
    await paymentRef.update({
      status: "failed",
      failureReason: mtnStatus.reason || normalizedStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { status: "failed", reason: mtnStatus.reason || normalizedStatus };
  }
);
