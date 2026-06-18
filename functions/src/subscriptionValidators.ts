/**
 * Subscription server-side gate (Sprint 5 optimisation #5).
 *
 * Single source of truth for the 4 quota/access validators that were
 * historically duplicated in `functions/src/index.ts` (lines 830-1057)
 * AND in the dead-file `functions/src/subscription.ts`. The old layout
 * had two parallel copies of `getValidSubscription`, three near-identical
 * onRequest handlers, and a sneaky double-`get()` on
 * `pharmacy_inventory.where(pharmacyId == userId)` inside the
 * `validateInventoryAccess` happy path (one for the limit check, then
 * the same query re-issued in the `remainingSlots` JSON). This module
 * consolidates everything and reuses the snapshot count for `remainingSlots`.
 *
 * `index.ts` re-exports the 4 callables from this file.
 */

import { onRequest } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { sendError, BusinessErrors } from "./lib/validation.js";
import { requireAuth } from "./lib/auth.js";

const db = getFirestore();

/** Basic-plan inventory ceiling (kept inline — quota policy never changed). */
const BASIC_INVENTORY_MAX = 100;

/**
 * Load the pharmacy and decide whether its subscription unlocks marketplace
 * actions right now. `isValid` is true when the subscription is `active` with
 * a future `subscriptionEndDate`, OR `trial` with either no end date or a
 * future end date. Throws `USER_NOT_FOUND` if the pharmacies doc is missing.
 */
async function getValidSubscription(userId: string) {
  const pharmacyDoc = await db.collection("pharmacies").doc(userId).get();
  if (!pharmacyDoc.exists) {
    throw BusinessErrors.USER_NOT_FOUND(userId);
  }
  const pharmacy = pharmacyDoc.data() as Record<string, unknown>;
  const now = new Date();
  const endDate =
    (pharmacy.subscriptionEndDate as { toDate?: () => Date } | undefined)?.toDate?.() ?? null;
  const status = pharmacy.subscriptionStatus as string | undefined;
  const isActive = status === "active" && endDate !== null && endDate > now;
  const isTrial =
    status === "trial" && (endDate === null || endDate > now);

  return {
    isValid: isActive || isTrial,
    status: status ?? "unknown",
    plan: (pharmacy.subscriptionPlan as string) || "basic",
    endDate: pharmacy.subscriptionEndDate as { toDate?: () => Date } | undefined,
    pharmacy,
  };
}

/** Validate inventory creation (server-side enforcement). */
export const validateInventoryAccess = onRequest(
  { region: "europe-west1", cors: true },
  async (req, res) => {
    try {
      const requestedUserId = req.query?.userId as string | undefined;
      const uid = await requireAuth(req, res, requestedUserId ?? undefined);
      if (!uid) return;
      const userId = uid;

      const subscription = await getValidSubscription(userId);
      if (!subscription.isValid) {
        res.status(403).json({
          error: "SUBSCRIPTION_REQUIRED",
          message: "Active subscription required to add inventory",
          status: subscription.status,
          canAccess: false,
        });
        return;
      }

      // Plan-specific limit check (basic plan). One Firestore query, reused
      // for both the gate AND the `remainingSlots` response — the previous
      // implementation re-ran the same query in the JSON payload, doubling
      // read cost for every legitimate caller.
      let currentCount = 0;
      if (subscription.plan === "basic") {
        const inventoryQuery = await db
          .collection("pharmacy_inventory")
          .where("pharmacyId", "==", userId)
          .get();
        currentCount = inventoryQuery.size;

        if (currentCount >= BASIC_INVENTORY_MAX) {
          res.status(403).json({
            error: "INVENTORY_LIMIT_EXCEEDED",
            message: `Basic plan allows maximum ${BASIC_INVENTORY_MAX} medicines. Current: ${currentCount}`,
            currentCount,
            maxAllowed: BASIC_INVENTORY_MAX,
            plan: subscription.plan,
            canAccess: false,
          });
          return;
        }
      }

      // Audit log on success.
      await db.collection("subscription_audit").add({
        userId,
        action: "inventory_access_validated",
        plan: subscription.plan,
        status: subscription.status,
        timestamp: FieldValue.serverTimestamp(),
      });

      res.status(200).json({
        canAccess: true,
        plan: subscription.plan,
        status: subscription.status,
        remainingSlots:
          subscription.plan === "basic"
            ? Math.max(0, BASIC_INVENTORY_MAX - currentCount)
            : -1,
      });
    } catch (error: unknown) {
      sendError(res, error as Error);
    }
  }
);

/** Validate proposal creation (server-side enforcement). */
export const validateProposalAccess = onRequest(
  { region: "europe-west1", cors: true },
  async (req, res) => {
    try {
      const requestedUserId = req.query?.userId as string | undefined;
      const uid = await requireAuth(req, res, requestedUserId ?? undefined);
      if (!uid) return;
      const userId = uid;

      const subscription = await getValidSubscription(userId);
      if (!subscription.isValid) {
        res.status(403).json({
          error: "SUBSCRIPTION_REQUIRED",
          message: "Active subscription required to create proposals",
          status: subscription.status,
          canAccess: false,
        });
        return;
      }

      await db.collection("subscription_audit").add({
        userId,
        action: "proposal_access_validated",
        plan: subscription.plan,
        status: subscription.status,
        timestamp: FieldValue.serverTimestamp(),
      });

      res.status(200).json({
        canAccess: true,
        plan: subscription.plan,
        status: subscription.status,
      });
    } catch (error: unknown) {
      sendError(res, error as Error);
    }
  }
);

/** Validate analytics access (server-side enforcement). */
export const validateAnalyticsAccess = onRequest(
  { region: "europe-west1", cors: true },
  async (req, res) => {
    try {
      const requestedUserId = req.query?.userId as string | undefined;
      const uid = await requireAuth(req, res, requestedUserId ?? undefined);
      if (!uid) return;
      const userId = uid;

      const subscription = await getValidSubscription(userId);
      if (!subscription.isValid) {
        res.status(403).json({
          error: "SUBSCRIPTION_REQUIRED",
          message: "Active subscription required for analytics",
          status: subscription.status,
          canAccess: false,
        });
        return;
      }

      const allowedPlans = ["professional", "enterprise"];
      if (!allowedPlans.includes(subscription.plan)) {
        res.status(403).json({
          error: "PLAN_UPGRADE_REQUIRED",
          message: "Professional or Enterprise plan required for analytics",
          currentPlan: subscription.plan,
          requiredPlans: allowedPlans,
          canAccess: false,
        });
        return;
      }

      res.status(200).json({
        canAccess: true,
        plan: subscription.plan,
        status: subscription.status,
      });
    } catch (error: unknown) {
      sendError(res, error as Error);
    }
  }
);

/** Get comprehensive subscription status (server-side truth source). */
export const getSubscriptionStatus = onRequest(
  { region: "europe-west1", cors: true },
  async (req, res) => {
    try {
      const requestedUserId = req.query?.userId as string | undefined;
      const uid = await requireAuth(req, res, requestedUserId ?? undefined);
      if (!uid) return;
      const userId = uid;

      const subscription = await getValidSubscription(userId);

      // Days remaining (Math.ceil so even a partial day counts).
      let daysRemaining = 0;
      const end = subscription.endDate?.toDate?.();
      if (end) {
        const now = new Date();
        daysRemaining = Math.max(
          0,
          Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        );
      }

      // Current inventory count only matters for basic plan.
      let currentInventoryCount = 0;
      if (subscription.plan === "basic") {
        const inventoryQuery = await db
          .collection("pharmacy_inventory")
          .where("pharmacyId", "==", userId)
          .get();
        currentInventoryCount = inventoryQuery.size;
      }

      res.status(200).json({
        userId,
        isValid: subscription.isValid,
        status: subscription.status,
        plan: subscription.plan,
        daysRemaining,
        endDate: end ?? null,
        limits: {
          inventory:
            subscription.plan === "basic"
              ? { max: BASIC_INVENTORY_MAX, current: currentInventoryCount }
              : { unlimited: true },
          analytics: ["professional", "enterprise"].includes(subscription.plan),
          multiLocation: subscription.plan === "enterprise",
          apiAccess: subscription.plan === "enterprise",
        },
      });
    } catch (error: unknown) {
      sendError(res, error as Error);
    }
  }
);
