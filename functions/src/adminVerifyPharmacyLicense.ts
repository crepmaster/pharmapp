/**
 * Sprint 2a F-LICENSE — `adminVerifyPharmacyLicense`
 *
 * Admin-only callable that transitions a pharmacy's `licenseStatus` to
 * one of `verified | rejected | correction_needed`, writes the verifier
 * uid + timestamp, and (when applicable) records the rejection reason.
 *
 * Authorization model (mirrors the existing country-scoped admin RBAC
 * from V2A) :
 *   - super_admin  → may verify any pharmacy
 *   - admin        → may verify only pharmacies whose `countryCode` is
 *                    in the admin's `countryScopes`
 *
 * Sprint 2a delivers the callable; the admin UI that consumes it is
 * Sprint 2b scope.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import { startTrialForPharmacy } from "./lib/startTrialForPharmacy.js";

const db = getFirestore();

type AdminAction = "verify" | "reject" | "correction_needed";

interface AdminVerifyInput {
  pharmacyId?: string;
  action?: AdminAction;
  /** Required when `action === "reject" | "correction_needed"`. */
  reason?: string;
}

const STATUS_BY_ACTION: Readonly<Record<AdminAction, string>> = Object.freeze({
  verify: "verified",
  reject: "rejected",
  correction_needed: "correction_needed",
});

export const adminVerifyPharmacyLicense = onCall<AdminVerifyInput>(
  { region: "europe-west1", cors: true },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const data = request.data ?? {};
    const pharmacyId = data.pharmacyId;
    const action = data.action;
    const reasonRaw = data.reason;

    if (typeof pharmacyId !== "string" || pharmacyId.trim() === "") {
      throw new HttpsError("invalid-argument", "pharmacyId is required.");
    }
    if (
      action !== "verify" &&
      action !== "reject" &&
      action !== "correction_needed"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "action must be 'verify', 'reject', or 'correction_needed'."
      );
    }
    let reason: string | null = null;
    if (action === "reject" || action === "correction_needed") {
      if (typeof reasonRaw !== "string" || reasonRaw.trim() === "") {
        throw new HttpsError(
          "invalid-argument",
          "reason is required when rejecting or requesting correction."
        );
      }
      reason = reasonRaw.trim();
    }

    // Validate admin caller.
    const adminSnap = await db.collection("admins").doc(callerUid).get();
    if (!adminSnap.exists) {
      throw new HttpsError(
        "permission-denied",
        "Admin privileges required."
      );
    }
    const admin = adminSnap.data() ?? {};
    const role = admin.role as string | undefined;
    const countryScopes = Array.isArray(admin.countryScopes)
      ? (admin.countryScopes as string[])
      : [];
    const isSuperAdmin = role === "super_admin";

    // Load pharmacy + enforce country scope.
    const pharmacyRef = db.collection("pharmacies").doc(pharmacyId.trim());
    const pharmacySnap = await pharmacyRef.get();
    if (!pharmacySnap.exists) {
      throw new HttpsError("not-found", "Pharmacy not found.");
    }
    const pharmacy = pharmacySnap.data() ?? {};
    const pharmacyCountry = pharmacy.countryCode as string | undefined;
    if (!isSuperAdmin) {
      if (!pharmacyCountry || !countryScopes.includes(pharmacyCountry)) {
        throw new HttpsError(
          "permission-denied",
          "This pharmacy is outside your country scope."
        );
      }
    }

    const newStatus = STATUS_BY_ACTION[action];
    const update: Record<string, unknown> = {
      licenseStatus: newStatus,
      licenseVerifiedBy: callerUid,
      licenseVerifiedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (action === "verify") {
      update.licenseRejectionReason = FieldValue.delete();
    } else {
      update.licenseRejectionReason = reason;
    }

    await pharmacyRef.update(update);
    logger.info("adminVerifyPharmacyLicense: transition", {
      pharmacyId,
      action,
      newStatus,
      callerUid,
    });

    // Sprint 3 — start the 30-day trial subscription on the transition
    // `licenseStatus -> 'verified'`. Idempotent : a second `verify`
    // (e.g. admin double-clicks, or a previously rejected pharmacy that
    // resubmits + gets verified again) does NOT restart or extend the
    // trial — the helper returns `{ started:false, reason:'already_active' }`.
    //
    // Architect-locked (2026-05-13) :
    //   - only triggered for `action === 'verify'`.
    //   - the pharmacy doc reload happens inside `startTrialForPharmacy`'s
    //     transaction so we read the fresh `subscriptionStatus` post-update.
    //   - we log the outcome so ops can audit per-pharmacy that the
    //     trial fired (or was a no-op).
    let trialResult: Awaited<ReturnType<typeof startTrialForPharmacy>> | null =
      null;
    if (action === "verify") {
      try {
        trialResult = await startTrialForPharmacy(db, pharmacyId.trim());
        logger.info("adminVerifyPharmacyLicense: trial outcome", {
          pharmacyId,
          callerUid,
          trialStarted: trialResult.started,
          trialReason: trialResult.reason,
        });
      } catch (err) {
        // Trial failure must NOT undo the licence verify decision. We
        // log it for ops follow-up and continue : the admin can retry
        // verify later (idempotence guarantees safety) or contact
        // support to start the trial manually.
        logger.error("adminVerifyPharmacyLicense: trial start failed", {
          pharmacyId,
          callerUid,
          err: String(err),
        });
      }
    }

    return {
      ok: true,
      licenseStatus: newStatus,
      trialStarted: trialResult?.started ?? false,
    };
  }
);
