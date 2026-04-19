/**
 * paystackTopupIntent — initialize a Paystack transaction for wallet top-up.
 *
 * Returns an `authorizationUrl` the client opens (either inline or as a
 * redirect). On successful payment Paystack calls `paystackWebhook` which
 * credits the wallet idempotently.
 *
 * Paystack expects amounts in the smallest currency unit (kobo, pesewas,
 * cents) — perfectly aligned with our ADR-001 `amountMinor` convention.
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
import { requirePharmacyOwner } from "./lib/auth.js";

const db = getFirestore();

const PAYSTACK_SECRET_KEY = defineSecret("PAYSTACK_SECRET_KEY");

const PAYSTACK_API = "https://api.paystack.co";

interface PaystackTopupData {
  amount: number;
  currency?: string;
  /** Where Paystack should redirect the user after payment. */
  callbackUrl?: string;
}

export const paystackTopupIntent = onCall<PaystackTopupData>(
  {
    region: "europe-west1",
    cors: true,
    secrets: [PAYSTACK_SECRET_KEY],
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { amount, currency, callbackUrl } = request.data;
    if (typeof amount !== "number" || amount <= 0) {
      throw new HttpsError(
        "invalid-argument",
        "amount must be a positive number."
      );
    }

    // Pharmacy-only guard: explicit, intentional check before any payment
    // doc is created. Reuses the pharmacy snapshot to read the email
    // required by Paystack (single read).
    const pharmacySnap = await requirePharmacyOwner(db, userId);
    const email: string =
      (pharmacySnap.data()?.email as string) || "";
    if (!email) {
      throw new HttpsError(
        "failed-precondition",
        "Pharmacy profile missing email. Update your profile first."
      );
    }

    // Resolve currency decimals via system_config (same pattern as MTN MoMo).
    const displayCurrency = currency ?? "GHS";
    let currencyDecimals: number;
    try {
      const cfg = await db.collection("system_config").doc("main").get();
      const currencies =
        (cfg.data()?.currencies as Record<string, { decimals?: number }>) ?? {};
      currencyDecimals = resolveDecimals(
        displayCurrency,
        currencies[displayCurrency],
        (reason) =>
          logger.warn("paystackTopupIntent: decimals fallback", { reason })
      );
    } catch {
      currencyDecimals = resolveDecimals(displayCurrency, undefined);
    }

    let amountMinor: number;
    try {
      amountMinor = toMinor(amount, currencyDecimals);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error("paystackTopupIntent: toMinor failed", {
        msg,
        amount,
        currencyDecimals,
      });
      throw new HttpsError(
        "invalid-argument",
        "Amount cannot be converted to minor units."
      );
    }

    const reference = `PS_${randomUUID()}`;

    try {
      const resp = await fetch(
        `${PAYSTACK_API}/transaction/initialize`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY.value()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            amount: amountMinor,
            currency: displayCurrency,
            reference,
            callback_url:
              callbackUrl || "https://app-mediexchange.web.app",
            metadata: {
              userId,
              displayCurrency,
              currencyDecimals,
            },
          }),
        }
      );
      const body = await resp.json() as {
        status: boolean;
        data?: { authorization_url?: string; reference?: string };
        message?: string;
      };
      if (!resp.ok || !body.status || !body.data?.authorization_url) {
        logger.error("paystackTopupIntent: Paystack init failed", {
          status: resp.status,
          body,
        });
        throw new HttpsError(
          "internal",
          body.message || `Paystack init failed (${resp.status})`
        );
      }

      // Persist a payment intent doc aligned with ADR-001 semantics.
      await db.collection("payments").doc(reference).set({
        referenceId: reference,
        // ownerType is the canonical owner field for new top-ups;
        // `userId` is retained for legacy readers.
        ownerType: "pharmacy",
        ownerId: userId,
        userId,
        // Canonical ADR-001 fields
        amountMinor,
        currencyDecimals,
        moneySchemaVersion: MONEY_SCHEMA_VERSION,
        displayCurrency,
        // Legacy compat
        amount,
        currency: displayCurrency,
        // Provider + lifecycle
        provider: "paystack",
        status: "pending",
        authorizationUrl: body.data.authorization_url,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      logger.info("paystackTopupIntent: initialized", {
        reference,
        userId,
        amountMinor,
        displayCurrency,
      });

      return {
        success: true,
        referenceId: reference,
        authorizationUrl: body.data.authorization_url,
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("paystackTopupIntent: unexpected error", { msg });
      throw new HttpsError("internal", "Paystack init failed.");
    }
  }
);
