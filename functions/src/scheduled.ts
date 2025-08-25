// functions/src/scheduled.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
// IMPORTANT for TS "NodeNext" module resolution: include the .js extension
import { cancelExchangeTx } from "./index.js";

if (getApps().length === 0) initializeApp();
const db = getFirestore();

// Local idempotency helper (same pattern you use in index.ts)
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

// Runs every 30 minutes, cancels holds older than 6 hours
export const expireExchangeHolds = onSchedule(
  {
    region: "europe-west1",
    schedule: "every 30 minutes",
    timeZone: "Africa/Douala",
  },
  async () => {
    const cutoff = Timestamp.fromMillis(Date.now() - 6 * 60 * 60 * 1000);

    const base = db
      .collection("exchanges")
      .where("status", "==", "hold_active")
      .where("createdAt", "<", cutoff)
      .orderBy("createdAt", "asc")
      .limit(200);

    let snap = await base.get();
    let processed = 0;

    while (!snap.empty) {
      for (const doc of snap.docs) {
        const exId = doc.id;
        try {
          const ok = await withIdempotency(`expire:${exId}`, async () => {
            await cancelExchangeTx(exId);
          });
          if (ok) processed++;
        } catch (e: any) {
          logger.error("expireExchangeHolds error", { exId, error: String(e?.message ?? e) });
        }
      }
      // paginate
      const last = snap.docs[snap.docs.length - 1];
      snap = await base.startAfter(last).get();
    }

    logger.info("expireExchangeHolds run complete", {
      processed,
      cutoff: cutoff.toDate().toISOString(),
    });
  }
);
