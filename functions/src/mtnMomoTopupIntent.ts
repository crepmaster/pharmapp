/**
 * mtnMomoTopupIntent — MTN Mobile Money Collections API integration
 *
 * Initiates a RequestToPay on the user's MoMo wallet. The user gets a
 * USSD push on their phone to approve the payment. Once approved, the
 * funds flow to our collection wallet, and we credit the user's app wallet.
 *
 * Flow:
 *   1. Client calls this callable with amount + phone
 *   2. We get an OAuth token from MTN
 *   3. We call /collection/v1_0/requesttopay with a referenceId (UUID)
 *   4. We create a payments/{referenceId} doc with status=pending
 *   5. Client calls mtnMomoCheckStatus to poll
 *
 * Sandbox: https://sandbox.momodeveloper.mtn.com
 * Production: https://proxy.momoapi.mtn.com (when we upgrade)
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { randomUUID } from "crypto";
import {
  MONEY_SCHEMA_VERSION,
  resolveDecimals,
  toMinor,
} from "./lib/moneyUnits.js";

const db = getFirestore();

const MTN_MOMO_SUBSCRIPTION_KEY = defineSecret("MTN_MOMO_SUBSCRIPTION_KEY");
const MTN_MOMO_API_USER = defineSecret("MTN_MOMO_API_USER");
const MTN_MOMO_API_KEY = defineSecret("MTN_MOMO_API_KEY");

const MTN_BASE_URL = "https://sandbox.momodeveloper.mtn.com";
const TARGET_ENVIRONMENT = "sandbox";

interface TopupIntentData {
  amount: number;
  phoneNumber: string; // MSISDN, e.g. "46733123450" (sandbox) or "+233..." (live)
  currency?: string;
}

/** Get an OAuth2 access token from MTN using Basic auth (apiUser:apiKey). */
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
    const text = await res.text();
    logger.error("MTN getAccessToken failed", { status: res.status, body: text });
    throw new HttpsError("internal", `MTN auth failed: ${res.status}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/** Normalize a phone number to MSISDN (no +, digits only). */
function normalizeMsisdn(raw: string): string {
  return raw.replace(/\D/g, "");
}

export const mtnMomoTopupIntent = onCall<TopupIntentData>(
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

    const { amount, phoneNumber, currency } = request.data;
    if (typeof amount !== "number" || amount <= 0) {
      throw new HttpsError("invalid-argument", "amount must be a positive number.");
    }
    if (!phoneNumber || typeof phoneNumber !== "string") {
      throw new HttpsError("invalid-argument", "phoneNumber is required.");
    }

    const msisdn = normalizeMsisdn(phoneNumber);
    if (msisdn.length < 9) {
      throw new HttpsError("invalid-argument", "phoneNumber is invalid.");
    }

    const subscriptionKey = MTN_MOMO_SUBSCRIPTION_KEY.value();
    const apiUser = MTN_MOMO_API_USER.value();
    const apiKey = MTN_MOMO_API_KEY.value();

    // The business-level currency shown to the pharmacy (GHS, XAF, etc.).
    // This is the ADR-001 "displayCurrency" — it's what we snapshot in the
    // payment record, independent of what the PSP's sandbox requires on the wire.
    const displayCurrency = currency ?? "XAF";

    // In sandbox, MTN only accepts EUR on the wire. In production we send the
    // real local currency. This divergence is tracked via payment.currency
    // (wire) vs payment.displayCurrency (business) — cf AUDIT-001.
    const payCurrency = TARGET_ENVIRONMENT === "sandbox" ? "EUR" : displayCurrency;

    // Resolve currency decimals ONCE at intent time and snapshot them on the
    // payment. `mtnMomoCheckStatus` must NOT re-read system_config to avoid
    // config-drift between intent and settlement (ADR-001 guard #2).
    let currencyDecimals: number;
    try {
      const configSnap = await db
        .collection("system_config")
        .doc("main")
        .get();
      const currencies =
        (configSnap.data()?.currencies as Record<string, { decimals?: number }>) ?? {};
      currencyDecimals = resolveDecimals(
        displayCurrency,
        currencies[displayCurrency],
        (reason) => logger.warn("mtnMomoTopupIntent: decimals fallback", { reason })
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.warn("mtnMomoTopupIntent: system_config read failed, using fallback", {
        message,
      });
      currencyDecimals = resolveDecimals(displayCurrency, undefined);
    }

    let amountMinor: number;
    try {
      amountMinor = toMinor(amount, currencyDecimals);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error("mtnMomoTopupIntent: toMinor failed", { message, amount, currencyDecimals });
      throw new HttpsError("invalid-argument", "Amount is not convertible to minor units.");
    }

    try {
      const token = await getAccessToken(subscriptionKey, apiUser, apiKey);
      const referenceId = randomUUID();

      const payload = {
        amount: String(amount),
        currency: payCurrency,
        externalId: referenceId,
        payer: {
          partyIdType: "MSISDN",
          partyId: msisdn,
        },
        payerMessage: "PharmApp wallet top-up",
        payeeNote: "Top-up via MoMo",
      };

      const res = await fetch(`${MTN_BASE_URL}/collection/v1_0/requesttopay`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-Reference-Id": referenceId,
          "X-Target-Environment": TARGET_ENVIRONMENT,
          "Ocp-Apim-Subscription-Key": subscriptionKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.status !== 202) {
        const text = await res.text();
        logger.error("MTN RequestToPay failed", { status: res.status, body: text });
        throw new HttpsError("internal", `MTN RequestToPay failed: ${res.status}`);
      }

      // Persist a payment intent doc. `amountMinor` is the canonical ADR-001
      // field; `amount` is kept for legacy readers and marked @deprecated.
      await db.collection("payments").doc(referenceId).set({
        referenceId,
        userId,
        // --- ADR-001 canonical fields (D1, D3) ---
        amountMinor,
        currencyDecimals,
        moneySchemaVersion: MONEY_SCHEMA_VERSION,
        displayCurrency,
        // --- Legacy/compat fields ---
        amount, // @deprecated — use amountMinor
        currency: payCurrency, // wire currency (EUR in sandbox)
        // --- Provider + lifecycle ---
        phoneNumber: msisdn,
        provider: "mtn_momo",
        status: "pending",
        environment: TARGET_ENVIRONMENT,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      logger.info("mtnMomoTopupIntent: initiated", {
        referenceId,
        userId,
        amountMinor,
        currencyDecimals,
        displayCurrency,
      });

      return {
        success: true,
        referenceId,
        status: "pending",
      };
    } catch (err: unknown) {
      if (err instanceof HttpsError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      logger.error("mtnMomoTopupIntent: unexpected error", { message });
      throw new HttpsError("internal", "Top-up failed. Please try again.");
    }
  }
);
