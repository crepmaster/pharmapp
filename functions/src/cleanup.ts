import { onRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

/**
 * Cleanup Test User (dev / test only).
 *
 * Removes a test user from Firebase Authentication and all associated
 * Firestore data. Security: only allows cleanup of emails containing
 * "test", containing "09092025", or ending with @promoshake.net.
 *
 * Sprint 5 optimisation #7 — all `console.log`/`console.warn`/`console.error`
 * with emoji prefixes (🧹 ✓ ⚠️ ❌ 🚨) were replaced with structured
 * `logger.*` calls so Cloud Logging can filter/aggregate by collection,
 * uid, and severity. Emojis in log text break JSON encoding and prevent
 * downstream tooling (alerts, dashboards) from parsing the events.
 *
 * Usage:
 *   GET/POST https://europe-west1-<project>.cloudfunctions.net/cleanupTestUser?email=test@example.com
 */
export const cleanupTestUser = onRequest({ region: "europe-west1" }, async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  try {
    const email = (req.query.email as string) || req.body?.email;

    if (!email) {
      res.status(400).json({ success: false, error: "Email parameter is required" });
      return;
    }

    const isTestAccount =
      email.includes("test") ||
      email.endsWith("@promoshake.net") ||
      email.includes("09092025");

    if (!isTestAccount) {
      logger.warn("cleanupTestUser: rejected non-test account", { email });
      res.status(403).json({
        success: false,
        error:
          'Only test accounts can be cleaned up (must contain "test", "09092025", or end with @promoshake.net)',
      });
      return;
    }

    logger.info("cleanupTestUser: starting", { email });

    const auth = getAuth();
    const db = getFirestore();

    const deletedCollections: string[] = [];
    let userRecord: { uid: string } | null = null;

    try {
      userRecord = await auth.getUserByEmail(email);
      logger.info("cleanupTestUser: user found", { uid: userRecord.uid, email });
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code === "auth/user-not-found") {
        logger.info("cleanupTestUser: user not in Authentication", { email });
      } else {
        throw error;
      }
    }

    if (userRecord) {
      const uid = userRecord.uid;

      const deleteIfExists = async (collection: string) => {
        try {
          await db.collection(collection).doc(uid).delete();
          deletedCollections.push(collection);
          logger.info("cleanupTestUser: deleted doc", { collection, uid });
        } catch (error: unknown) {
          logger.warn("cleanupTestUser: no doc to delete", {
            collection,
            uid,
            errMessage: (error as { message?: string })?.message,
          });
        }
      };
      await deleteIfExists("pharmacies");
      await deleteIfExists("couriers");
      await deleteIfExists("admins");
      await deleteIfExists("wallets");

      const purgeByOwnerField = async (
        collection: string,
        ownerField: string,
        limit?: number
      ) => {
        try {
          let q = db.collection(collection).where(ownerField, "==", uid);
          if (limit) q = q.limit(limit) as typeof q;
          const snap = await q.get();
          if (!snap.empty) {
            const batch = db.batch();
            snap.docs.forEach((d) => batch.delete(d.ref));
            await batch.commit();
            deletedCollections.push(`${collection} (${snap.size} items)`);
            logger.info("cleanupTestUser: purged owned docs", {
              collection,
              ownerField,
              uid,
              count: snap.size,
            });
          }
        } catch (error: unknown) {
          logger.warn("cleanupTestUser: purge failed", {
            collection,
            ownerField,
            uid,
            errMessage: (error as { message?: string })?.message,
          });
        }
      };
      await purgeByOwnerField("pharmacy_inventory", "pharmacyId");
      await purgeByOwnerField("exchange_proposals", "pharmacyId");
      await purgeByOwnerField("ledger", "userId", 100);

      try {
        await auth.deleteUser(uid);
        logger.info("cleanupTestUser: deleted Auth user", { uid, email });
      } catch (error: unknown) {
        logger.error("cleanupTestUser: auth delete failed", {
          uid,
          email,
          errMessage: (error as { message?: string })?.message,
        });
        throw error;
      }
    }

    res.status(200).json({
      success: true,
      message: "Test user cleanup completed",
      email,
      uid: userRecord?.uid || "not-found",
      deletedCollections,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const msg = (error as { message?: string })?.message ?? String(error);
    logger.error("cleanupTestUser: unexpected error", {
      errMessage: msg,
      errStack: (error as { stack?: string })?.stack ?? null,
    });
    res.status(500).json({
      success: false,
      error: msg,
      timestamp: new Date().toISOString(),
    });
  }
});
