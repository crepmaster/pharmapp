import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { withIdempotency } from "./lib/idempotency.js";
import { cancelExchangeTx } from "./lib/exchange.js";
if (getApps().length === 0)
    initializeApp();
const db = getFirestore();
/**
 * Tâche planifiée : toutes les 30 min
 * - trouve les échanges en "hold_active" créés il y a > 6h
 * - annule proprement (refund des holds) via la même transaction que l’API
 */
export const expireExchangeHolds = onSchedule({ region: "europe-west1", schedule: "every 30 minutes", timeZone: "Africa/Douala" }, async () => {
    const cutoff = Timestamp.fromDate(new Date(Date.now() - 6 * 60 * 60 * 1000));
    const snap = await db
        .collection("exchanges")
        .where("status", "==", "hold_active")
        .where("createdAt", "<", cutoff)
        .limit(200)
        .get();
    if (snap.empty) {
        logger.info("expireExchangeHolds: nothing to do");
        return;
    }
    logger.info(`expireExchangeHolds: ${snap.size} exchange(s) to expire`);
    for (const doc of snap.docs) {
        const exId = doc.id;
        try {
            const ok = await withIdempotency(`expire:${exId}`, async () => {
                await cancelExchangeTx(exId, /* reason */ "expired");
            });
            if (ok)
                logger.info(`expireExchangeHolds: expired ${exId}`);
        }
        catch (err) {
            logger.error(`expireExchangeHolds: failed for ${exId}`, err);
        }
    }
});
