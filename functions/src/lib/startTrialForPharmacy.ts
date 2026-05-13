/**
 * Sprint 3 — `startTrialForPharmacy` backend helper.
 *
 * Transactional + idempotent helper that promotes a pharmacy from
 * `pendingPayment` (or `trial_pending_license` after license verify)
 * to an active `trial` for `trialDurationDays` (default 30) days.
 *
 * Architect-locked decisions (2026-05-13) — see
 * `docs/orchestrator_sprints/SPRINT_3_TRIAL_SUBSCRIPTION_TASK.md` :
 *
 *   - Pays non mandatory : appelé par `createPharmacyRegistration`
 *     juste après le batch.commit() initial → trial démarre à
 *     l'inscription.
 *   - Pays mandatory : appelé par `adminVerifyPharmacyLicense` à la
 *     transition `licenseStatus -> 'verified'` → trial démarre à
 *     la validation, 30j complets garantis quel que soit le délai
 *     admin.
 *   - **Idempotent strict** : si la pharmacie a déjà `subscriptionStatus`
 *     in {`trial`, `active`}, le helper retourne sans mutation. Aucun
 *     deuxième trial. Aucune extension de fenêtre.
 *   - Transactionnel : lecture + écriture dans un `runTransaction` pour
 *     éviter une race condition entre deux `verify` concurrents.
 *
 * NB : la source runtime des gates (`firestore.rules :: hasActiveSubscription()`)
 * lit les flat fields sur `pharmacies/{uid}` (`subscriptionStatus`,
 * `subscriptionEndDate`, `hasActiveSubscription`). Cette helper est
 * donc la seule chose qu'il faut mettre à jour — la collection
 * `subscriptions/{id}` reste backend-only et n'est pas alimentée
 * par ce helper dans le scope Sprint 3 (audit/miroir éventuel
 * séparé).
 */

import {
  type Firestore,
  Timestamp,
  FieldValue,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const DEFAULT_TRIAL_DURATION_DAYS = 30;

export interface StartTrialResult {
  /** `true` if the helper wrote the trial fields ; `false` if a trial
   * was already running and the helper was a no-op (idempotence). */
  started: boolean;
  /** Audit reason — `'already_active'`, `'started'`, or
   * `'pharmacy_not_found'`. */
  reason:
    | "started"
    | "already_active"
    | "pharmacy_not_found";
}

/**
 * Pure decision helper — extracted so the idempotence rule can be
 * unit-tested without Firestore. Returns `true` if the helper should
 * write the trial fields, `false` if it must no-op.
 *
 * Inputs are the bare flat fields the helper inspects on
 * `pharmacies/{uid}`. Any other shape is treated as "no trial yet".
 */
export function shouldStartTrial(args: {
  subscriptionStatus?: string | null;
}): boolean {
  const s = args.subscriptionStatus;
  if (s === "trial" || s === "active") return false;
  return true;
}

/**
 * Compute the trial expiry timestamp `startedAt + N days`. Pure so
 * the date math can be unit-tested.
 */
export function computeTrialEndDate(
  startedAt: Date,
  trialDurationDays: number = DEFAULT_TRIAL_DURATION_DAYS
): Date {
  const ms = trialDurationDays * 24 * 60 * 60 * 1000;
  return new Date(startedAt.getTime() + ms);
}

/**
 * Transactional, idempotent trial-start helper.
 *
 * - If `pharmacies/{uid}` is missing → returns `{ started:false,
 *   reason:'pharmacy_not_found' }` (no throw — the caller can decide
 *   whether to log or escalate).
 * - If the pharmacy already has `subscriptionStatus` in {`trial`,
 *   `active`} → returns `{ started:false, reason:'already_active' }`.
 *   Aucun rewrite, aucune extension.
 * - Otherwise → writes the four trial flat fields atomically and
 *   returns `{ started:true, reason:'started' }`.
 */
export async function startTrialForPharmacy(
  db: Firestore,
  uid: string,
  opts?: { trialDurationDays?: number }
): Promise<StartTrialResult> {
  const trialDurationDays =
    opts?.trialDurationDays ?? DEFAULT_TRIAL_DURATION_DAYS;
  const pharmacyRef = db.collection("pharmacies").doc(uid);

  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(pharmacyRef);
    if (!snap.exists) {
      logger.warn("startTrialForPharmacy: pharmacy doc not found", { uid });
      return { started: false, reason: "pharmacy_not_found" as const };
    }
    const data = snap.data() ?? {};
    const subscriptionStatus =
      typeof data.subscriptionStatus === "string"
        ? (data.subscriptionStatus as string)
        : null;

    if (!shouldStartTrial({ subscriptionStatus })) {
      logger.info("startTrialForPharmacy: already active, no-op", {
        uid,
        subscriptionStatus,
      });
      return { started: false, reason: "already_active" as const };
    }

    const startedAt = new Date();
    const endAt = computeTrialEndDate(startedAt, trialDurationDays);

    tx.update(pharmacyRef, {
      hasActiveSubscription: true,
      subscriptionStatus: "trial",
      subscriptionPlan: "basic",
      subscriptionStartDate: Timestamp.fromDate(startedAt),
      subscriptionEndDate: Timestamp.fromDate(endAt),
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info("startTrialForPharmacy: trial started", {
      uid,
      trialDurationDays,
      endAt: endAt.toISOString(),
    });

    return { started: true, reason: "started" as const };
  });
}
