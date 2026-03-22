/**
 * SANDBOX: Subscription Payment Success — Sprint 3A / Lot 3
 *
 * Callable Firebase Function that simulates a successful subscription payment.
 * Replaces the direct Firestore write in subscription_screen.dart (_simulatePayment).
 *
 * Atomic operations (single Firestore transaction):
 *   1. Read pharmacy → derive countryCode (canonical then legacy fallback)
 *   2. Read system_config/main → derive currencyCode from countryCode
 *   3. Read platform_treasuries/{id} → exists check for auto-provisioning
 *   4. Credit platform treasury (auto-provision if absent) via platformTreasury helper
 *   5. Write platform ledger entry (type: platform_subscription_revenue)
 *   6. Activate / renew subscription on pharmacies/{uid} (flat fields — runtime source of truth)
 *   7. Write audit record to subscription_payments/
 *
 * ⚠️  SANDBOX ONLY.
 *   - Blocked in production unless FUNCTIONS_EMULATOR=true or SANDBOX_ENABLED=true.
 *   - Restricted to test accounts matching SANDBOX_ACCOUNT_PATTERNS (same guard as
 *     sandboxCredit / sandboxDebit in index.ts).
 *   - Uses a simplified static plan-amount table (see SANDBOX_PLAN_AMOUNTS).
 *   - Production pricing will come from dynamic_subscription_plans (Lot 4).
 *   - No real mobile money payment is processed.
 *
 * Security:
 *   - Requires Firebase Auth (onCall enforces authentication).
 *   - userId is taken from request.auth.uid — never from client payload.
 *   - Amount is computed server-side; client only sends planName.
 *   - Environment guard + account pattern guard mirror index.ts sandbox endpoints.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { creditPlatformTreasury } from "./lib/platformTreasury.js";

const db = getFirestore();

interface SandboxSubscriptionData {
  /** One of: "basic" | "professional" | "enterprise" (case-insensitive). */
  planName: string;
}

// ---------------------------------------------------------------------------
// Sandbox environment guards — mirrors index.ts isSandboxAllowed() and
// SANDBOX_ACCOUNT_PATTERNS so all sandbox callables share the same policy.
// ---------------------------------------------------------------------------

/** Returns true only in the emulator or when SANDBOX_ENABLED is set. */
function isSandboxAllowed(): boolean {
  return (
    process.env.FUNCTIONS_EMULATOR === "true" ||
    process.env.SANDBOX_ENABLED === "true"
  );
}

/** Allowed test-account email patterns (same as index.ts). */
const SANDBOX_ACCOUNT_PATTERNS = [/^[\w.+-]+@promoshake\.net$/i];

// ---------------------------------------------------------------------------
// Legacy country enum-name → ISO 3166-1 alpha-2.
// Mirrors _isoToCountryEnumName in unified_registration_screen.dart (reversed).
// Used for profiles created before Sprint 2A that lack `countryCode`.
// ---------------------------------------------------------------------------
const LEGACY_COUNTRY_TO_ISO: Record<string, string> = {
  cameroon: "CM",
  kenya: "KE",
  tanzania: "TZ",
  uganda: "UG",
  nigeria: "NG",
};

// ---------------------------------------------------------------------------
// Sandbox-only plan amounts by currency.
// NOT production pricing — production uses dynamic_subscription_plans (Lot 4).
// ---------------------------------------------------------------------------
const SANDBOX_PLAN_AMOUNTS: Record<string, Record<string, number>> = {
  XAF: { basic: 6000, professional: 15000, enterprise: 30000 },
  KES: { basic: 1500, professional: 3750, enterprise: 7500 },
  TZS: { basic: 25000, professional: 62500, enterprise: 125000 },
  UGX: { basic: 37000, professional: 92000, enterprise: 184000 },
  NGN: { basic: 7500, professional: 18750, enterprise: 37500 },
};

function sandboxPlanAmount(planName: string, currencyCode: string): number {
  const table =
    SANDBOX_PLAN_AMOUNTS[currencyCode] ?? SANDBOX_PLAN_AMOUNTS["XAF"];
  return table[planName.toLowerCase()] ?? table["basic"];
}

// ---------------------------------------------------------------------------

export const sandboxSubscriptionSuccess = onCall<SandboxSubscriptionData>(
  { region: "europe-west1", cors: true },
  async (request) => {
    // 🔒 Guard 1: block outside emulator / sandbox environment.
    if (!isSandboxAllowed()) {
      throw new HttpsError(
        "failed-precondition",
        "Sandbox functions are disabled in production.",
        { code: "SANDBOX_DISABLED" }
      );
    }

    // 🔒 Guard 2: require authenticated caller (uid from token, never client).
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError(
        "unauthenticated",
        "User must be authenticated to activate a subscription."
      );
    }

    // 🔒 Guard 3: validate planName before touching Firestore.
    const { planName } = request.data;
    const validPlans = ["basic", "professional", "enterprise"];
    if (!planName || !validPlans.includes(planName.toLowerCase())) {
      throw new HttpsError(
        "invalid-argument",
        `planName must be one of: ${validPlans.join(", ")}.`
      );
    }

    const normalizedPlan = planName.toLowerCase();
    logger.info(
      `sandboxSubscriptionSuccess: userId=${userId} plan=${normalizedPlan}`
    );

    const result = await db.runTransaction(async (transaction) => {
      // ================================================================
      // PHASE 1: ALL READS  (Firestore: reads must precede writes)
      // ================================================================

      // 1a. Pharmacy document — source of countryCode / legacy country.
      const pharmacyRef = db.collection("pharmacies").doc(userId);
      const pharmacySnap = await transaction.get(pharmacyRef);
      if (!pharmacySnap.exists) {
        throw new HttpsError("not-found", "Pharmacy profile not found.");
      }
      const pharmacyData = pharmacySnap.data()!;

      // 🔒 Guard 4: restrict to test-account emails (same policy as sandboxCredit/Debit).
      const userEmail = String(pharmacyData.email ?? "").trim();
      const isTestAccount = SANDBOX_ACCOUNT_PATTERNS.some((p) =>
        p.test(userEmail)
      );
      if (!isTestAccount) {
        throw new HttpsError(
          "permission-denied",
          "Sandbox subscription only allowed for test accounts.",
          { code: "NOT_TEST_ACCOUNT" }
        );
      }

      // 1b. System config — used to derive currencyCode from countryCode.
      const configRef = db.collection("system_config").doc("main");
      const configSnap = await transaction.get(configRef);

      // 1c. Derive countryCode:
      //     Priority: canonical `countryCode` (Sprint 2A+) → legacy `country`
      //     enum-name fallback → hard default "CM" (primary market).
      let countryCode: string =
        (pharmacyData.countryCode as string | undefined) || "";
      if (!countryCode) {
        const legacyCountry = (
          pharmacyData.country as string | undefined
        )?.toLowerCase();
        countryCode = (legacyCountry && LEGACY_COUNTRY_TO_ISO[legacyCountry])
          || "CM";
        logger.info(
          `sandboxSubscriptionSuccess: legacy country fallback '${legacyCountry}' → '${countryCode}'`,
          { userId }
        );
      }

      // 1d. Derive currencyCode from system_config; fall back to "XAF".
      let currencyCode = "XAF";
      if (configSnap.exists) {
        const configData = configSnap.data()!;
        const countries = configData.countries as
          | Record<string, { defaultCurrencyCode?: string }>
          | undefined;
        const defaultCurrency = countries?.[countryCode]?.defaultCurrencyCode;
        if (defaultCurrency) currencyCode = defaultCurrency;
      }

      // 1e. Compute amount server-side (client never controls the price).
      const amount = sandboxPlanAmount(normalizedPlan, currencyCode);

      // 1f. Treasury document — may not exist yet (auto-provisioned in write phase).
      const treasuryId = `${countryCode}_${currencyCode}`;
      const treasuryRef = db
        .collection("platform_treasuries")
        .doc(treasuryId);
      const treasurySnap = await transaction.get(treasuryRef);

      // ================================================================
      // PHASE 2: ALL WRITES
      // ================================================================

      // 2a. Credit platform treasury + write ledger entry atomically.
      const paymentRef = `SANDBOX_SUB_${Date.now()}`;
      creditPlatformTreasury(transaction, {
        treasuryRef,
        treasurySnapshot: treasurySnap,
        countryCode,
        currencyCode,
        amount,
        sourceType: "subscription",
        sourceId: paymentRef,
      });

      // 2b. Activate / renew subscription on pharmacies/{uid}.
      //     Flat fields are the runtime source of truth (§3.4 of briefing).
      const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      transaction.update(pharmacyRef, {
        hasActiveSubscription: true,
        subscriptionStatus: "active",
        subscriptionPlan: normalizedPlan,
        subscriptionStartDate: FieldValue.serverTimestamp(),
        subscriptionEndDate: Timestamp.fromDate(endDate),
        subscriptionPaymentRef: paymentRef,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // 2c. Audit record in subscription_payments/ for admin visibility.
      const paymentDocRef = db.collection("subscription_payments").doc();
      transaction.set(paymentDocRef, {
        pharmacyId: userId,
        subscriptionId: userId, // v1: same as pharmacy uid
        amount,
        currency: currencyCode,
        countryCode,
        planName: normalizedPlan,
        paymentMethod: "sandbox",
        status: "completed",
        transactionReference: paymentRef,
        createdAt: FieldValue.serverTimestamp(),
        completedAt: FieldValue.serverTimestamp(),
        sandboxMode: true,
      });

      logger.info(`sandboxSubscriptionSuccess: transaction committed`, {
        userId,
        plan: normalizedPlan,
        amount,
        currencyCode,
        treasuryId,
        paymentRef,
      });

      return {
        success: true,
        planName: normalizedPlan,
        amount,
        currency: currencyCode,
        treasuryId,
        paymentRef,
        subscriptionEndDate: endDate.toISOString(),
      };
    });

    return result;
  }
);
