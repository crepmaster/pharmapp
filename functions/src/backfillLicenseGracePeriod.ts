/**
 * Sprint 2a F-LICENSE — `backfillLicenseGracePeriod`
 *
 * Admin-only callable that lights up the grace period for pharmacies that
 * pre-existed a retroactive `licenseRequired = true` activation on their
 * country. Each affected pharmacy gets :
 *
 *   - `licenseStatus = "grace_period"`
 *   - `licenseGraceEndsAt = now + gracePeriodDays`
 *
 * Idempotent : pharmacies that already carry ANY `licenseStatus` value
 * are skipped, so a re-run does not overwrite a newer transition (e.g.
 * a pharmacy that submitted its license in the interim and is now
 * `pending_verification` or already `verified`).
 *
 * Dry-run mode is the default (`dryRun: true` if omitted) so an operator
 * always inspects the report before mutating data.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

interface BackfillInput {
  countryCode?: string;
  /** Defaults to true (read-only). Set explicitly to false to commit. */
  dryRun?: boolean;
  /**
   * Optional override of the country's `licenseGracePeriodDays`. Useful
   * for piloting a longer grace window for a specific country.
   */
  gracePeriodDays?: number;
}

interface BackfillReport {
  countryCode: string;
  dryRun: boolean;
  affected: number;
  skipped: number;
  total: number;
  graceEndsAt: string; // ISO-8601 for visibility in admin UI / logs
  gracePeriodDaysUsed: number;
}

/**
 * Maximum pharmacies updated per Firestore batch. Stays below the
 * 500-write hard limit and leaves headroom for the `updatedAt` field.
 */
const BATCH_SIZE = 400;

export const backfillLicenseGracePeriod = onCall<BackfillInput>(
  { region: "europe-west1", cors: true },
  async (request): Promise<BackfillReport> => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

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

    const data = request.data ?? {};
    const countryCodeRaw = data.countryCode;
    if (typeof countryCodeRaw !== "string" || countryCodeRaw.trim() === "") {
      throw new HttpsError("invalid-argument", "countryCode is required.");
    }
    const countryCode = countryCodeRaw.trim();
    if (!isSuperAdmin && !countryScopes.includes(countryCode)) {
      throw new HttpsError(
        "permission-denied",
        "Country outside your scope."
      );
    }

    const dryRun = data.dryRun !== false; // default true

    // Resolve grace window: explicit override > country config > 30.
    const sysConfigSnap = await db
      .collection("system_config")
      .doc("main")
      .get();
    const country = (sysConfigSnap.data()?.countries?.[countryCode] ?? {}) as {
      licenseGracePeriodDays?: number;
    };
    const resolvedDays =
      typeof data.gracePeriodDays === "number" &&
      Number.isFinite(data.gracePeriodDays) &&
      data.gracePeriodDays > 0
        ? Math.floor(data.gracePeriodDays)
        : typeof country.licenseGracePeriodDays === "number" &&
            Number.isFinite(country.licenseGracePeriodDays) &&
            country.licenseGracePeriodDays > 0
          ? Math.floor(country.licenseGracePeriodDays)
          : 30;

    const nowMs = Date.now();
    const graceEndsMs = nowMs + resolvedDays * 24 * 60 * 60 * 1000;
    const graceEnds = Timestamp.fromMillis(graceEndsMs);

    // Query pharmacies for the country. The composite (countryCode +
    // createdAt) index already exists from admin V2A.
    const pharmaciesSnap = await db
      .collection("pharmacies")
      .where("countryCode", "==", countryCode)
      .get();

    let affected = 0;
    let skipped = 0;
    let batch = db.batch();
    let opsInBatch = 0;

    for (const docSnap of pharmaciesSnap.docs) {
      const pharmacy = docSnap.data() ?? {};
      // Idempotency: skip any pharmacy that already has a license status.
      if (
        typeof pharmacy.licenseStatus === "string" &&
        pharmacy.licenseStatus.length > 0
      ) {
        skipped++;
        continue;
      }
      affected++;
      if (!dryRun) {
        batch.update(docSnap.ref, {
          licenseStatus: "grace_period",
          licenseGraceEndsAt: graceEnds,
          updatedAt: FieldValue.serverTimestamp(),
        });
        opsInBatch++;
        if (opsInBatch >= BATCH_SIZE) {
          await batch.commit();
          batch = db.batch();
          opsInBatch = 0;
        }
      }
    }
    if (!dryRun && opsInBatch > 0) {
      await batch.commit();
    }

    const report: BackfillReport = {
      countryCode,
      dryRun,
      affected,
      skipped,
      total: pharmaciesSnap.size,
      graceEndsAt: graceEnds.toDate().toISOString(),
      gracePeriodDaysUsed: resolvedDays,
    };
    logger.info("backfillLicenseGracePeriod: report", report);
    return report;
  }
);
