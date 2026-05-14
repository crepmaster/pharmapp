#!/usr/bin/env node
/**
 * Sprint 5 — Pre-deploy audit (READ-ONLY) for the F-LICENSE Ghana
 * marketplace readiness.
 *
 * Ghana is the first license-mandatory country (system_config/main.countries.GH
 * .licenseRequired=true). Sprint 2a/2A.1/2A.2/2A.3/2B.* shipped the
 * end-to-end license gate. This audit counts how many production
 * pharmacies in Ghana would be CURRENTLY denied by the marketplace
 * gate, broken down by reason, so the operator can decide a
 * remediation strategy BEFORE running the Sprint 5 E2E recipe:
 *
 *   - data migration (manual licence-status backfill from external
 *     records),
 *   - targeted grace-period extension via `backfillLicenseGracePeriod`
 *     callable (Sprint 2a, idempotent + dry-run),
 *   - admin verify campaign,
 *   - or live with the deny posture.
 *
 * This script DOES NOT mutate Firestore. It only reads.
 *
 * Usage:
 *   cd functions
 *   node scripts/auditGhanaLicenseReadiness.mjs --project=mediexchange [--out=audit.csv]
 *
 *   node scripts/auditGhanaLicenseReadiness.mjs --help
 *
 * Requirements:
 *   - GOOGLE_APPLICATION_CREDENTIALS pointing to a service-account JSON
 *     with at least roles/datastore.viewer on the target project, OR
 *   - `gcloud auth application-default login` previously run with a
 *     user account that has datastore.viewer on the target project.
 *
 * Output:
 *   - stdout: human-readable breakdown by reason, sample of up to 10
 *     pharmacy IDs per bucket (no email, no phone, no licenseNumber).
 *   - optional CSV at --out=<path>: id, licenseStatus, derivedBucket,
 *     graceEndsAtIso, licenseRejectionReasonRedacted, cityCode, createdAtIso.
 *   - final line: AUDIT_SUMMARY_JSON {...} for machine parsing.
 *
 * Privacy: by default the CSV avoids PII. `licenseNumber`, `email`,
 * `phoneNumber` are NOT exported. `licenseRejectionReason` is redacted
 * to its first 32 chars (admin notes can contain context). Pass
 * `--includeRejectionReason=full` to opt into the full text.
 *
 * Pre-lock Sprint 5 #4: this script is read-only by construction. It
 * never imports `set`, `update`, `delete`, or any mutator. The Firestore
 * instance below is used only via `.collection().get()` / `.doc().get()`.
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

/**
 * Parse CLI args supporting BOTH forms :
 *   --key=value     (single arg)
 *   --key value     (two args)
 * A bare `--key` not followed by a value (or followed by another `--flag`)
 * is treated as boolean `"true"`. This matches what users naturally type
 * and what the release-plan docs (Sprint 5) use.
 */
function parseArgs(rawArgs) {
  const out = {};
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq >= 0) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const key = a.slice(2);
    const next = rawArgs[i + 1];
    if (typeof next === "string" && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = "true";
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.help === "true" || args.h === "true") {
  printHelpAndExit();
}

const projectId = args.project ?? process.env.GCLOUD_PROJECT ?? null;
const outPath = args.out ?? null;
const country = (args.country ?? "GH").toUpperCase();
const includeRejectionFull = args.includeRejectionReason === "full";

if (!projectId) {
  console.error(
    "ERROR: pass --project=<id> or set GCLOUD_PROJECT. This script will NOT\n" +
    "       proceed without an explicit project ID to avoid scanning the\n" +
    "       wrong environment. Try `--help` for usage.",
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Firebase init — read-only credentials path
// ---------------------------------------------------------------------------

initializeApp({
  credential: applicationDefault(),
  projectId,
});
const db = getFirestore();

// ---------------------------------------------------------------------------
// Bucket derivation — mirrors `evaluateLicenseGate` from licenseGate.ts.
// Adapted here as pure JS without TypeScript types. Any change to the
// helper must also be reflected here, OR this script becomes stale.
// ---------------------------------------------------------------------------

/**
 * Bucket the pharmacy falls into for the audit purpose.
 *
 * The audit cares only about pharmacies that would be DENIED by the
 * marketplace gate. Pharmacies in `verified` or in active `grace_period`
 * are reported as `allow` for completeness.
 */
function deriveBucket(licenseStatus, graceEndsAtMs, now) {
  if (typeof licenseStatus !== "string" || licenseStatus.length === 0) {
    return "missing_status";
  }
  switch (licenseStatus) {
    case "verified":
      return "verified_allow";
    case "grace_period":
      if (typeof graceEndsAtMs === "number" && graceEndsAtMs > now) {
        return "grace_active_allow";
      }
      return "grace_expired_deny";
    case "pending_verification":
      return "pending_deny";
    case "rejected":
      return "rejected_deny";
    case "correction_needed":
      return "correction_needed_deny";
    case "expired":
      return "expired_deny";
    case "not_required":
      // A `not_required` status on a license-required country is a misconfig.
      return "not_required_misconfig_deny";
    default:
      return "unknown_status_deny";
  }
}

function toMillisOrNull(v) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "object" && typeof v.toMillis === "function") {
    try {
      const ms = v.toMillis();
      return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  }
  return null;
}

function toIsoOrNull(v) {
  const ms = toMillisOrNull(v);
  return ms === null ? null : new Date(ms).toISOString();
}

function redactReason(text) {
  if (typeof text !== "string") return null;
  if (text.length === 0) return null;
  if (includeRejectionFull) return text;
  return text.slice(0, 32) + (text.length > 32 ? "…" : "");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Read system_config/main.countries to confirm `country` is license-required.
  const sysConfigSnap = await db.collection("system_config").doc("main").get();
  if (!sysConfigSnap.exists) {
    console.error("ERROR: system_config/main not found in this project.");
    process.exit(3);
  }
  const sysCfg = sysConfigSnap.data();
  const countries = sysCfg.countries ?? {};
  const countryCfg = countries[country];
  if (!countryCfg) {
    console.error(
      `ERROR: country '${country}' not configured in system_config/main.countries.`
    );
    process.exit(3);
  }
  if (countryCfg.licenseRequired !== true) {
    console.warn(
      `WARNING: country '${country}' has licenseRequired=${countryCfg.licenseRequired}.\n` +
      "         The audit will still run, but the gate would currently ALLOW all pharmacies.",
    );
  }

  // 2. Query all pharmacies with countryCode === country. This must be a
  //    where-equals query, not a full collection scan; the existing
  //    `pharmacies(countryCode + createdAt)` composite index covers it.
  console.log(`\n📊 Auditing pharmacies/{*} where countryCode == "${country}" on project "${projectId}"…\n`);

  const snap = await db
    .collection("pharmacies")
    .where("countryCode", "==", country)
    .get();

  console.log(`   Found ${snap.size} pharmacies in ${country}.\n`);

  const now = Date.now();
  const rows = [];
  /** @type {Record<string, number>} */
  const buckets = {};
  /** @type {Record<string, string[]>} */
  const samples = {};

  for (const doc of snap.docs) {
    const data = doc.data();
    const licenseStatus = data.licenseStatus ?? null;
    const graceMs = toMillisOrNull(data.licenseGraceEndsAt);
    const bucket = deriveBucket(licenseStatus, graceMs, now);

    buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    if (!samples[bucket]) samples[bucket] = [];
    if (samples[bucket].length < 10) samples[bucket].push(doc.id);

    rows.push({
      id: doc.id,
      licenseStatus: licenseStatus ?? "",
      derivedBucket: bucket,
      graceEndsAtIso: toIsoOrNull(data.licenseGraceEndsAt) ?? "",
      licenseRejectionReasonRedacted: redactReason(data.licenseRejectionReason) ?? "",
      cityCode: data.cityCode ?? "",
      createdAtIso: toIsoOrNull(data.createdAt) ?? "",
    });
  }

  // 3. Print breakdown
  console.log("Bucket breakdown:");
  const orderedKeys = [
    "verified_allow",
    "grace_active_allow",
    "missing_status",
    "pending_deny",
    "rejected_deny",
    "correction_needed_deny",
    "expired_deny",
    "grace_expired_deny",
    "not_required_misconfig_deny",
    "unknown_status_deny",
  ];
  for (const key of orderedKeys) {
    const count = buckets[key] ?? 0;
    const flag = key.endsWith("_deny") ? " 🚫" : key.endsWith("_allow") ? " ✅" : " ⚠️ ";
    console.log(`   ${flag} ${key.padEnd(30)} ${String(count).padStart(5)}`);
    if (count > 0 && samples[key]?.length) {
      console.log(`      sample IDs: ${samples[key].join(", ")}${count > samples[key].length ? ", …" : ""}`);
    }
  }

  // 4. Compute totals
  // Sprint 5 Finding 2 fix : `missing_status` is treated as deny by the
  // license gate (`evaluateLicenseGate` falls into `not_verified` path
  // when `licenseStatus` is missing on a license-required country). The
  // summary therefore reports BOTH `denyStrict` (only `_deny` buckets)
  // and `denyIncludingMissing` so the operator gets an accurate count
  // of how many Ghana pharmacies the gate currently blocks.
  const denyStrict = orderedKeys
    .filter((k) => k.endsWith("_deny"))
    .reduce((s, k) => s + (buckets[k] ?? 0), 0);
  const totalMissingStatus = buckets.missing_status ?? 0;
  const denyIncludingMissing = denyStrict + totalMissingStatus;
  const totalAllow = (buckets.verified_allow ?? 0) + (buckets.grace_active_allow ?? 0);

  console.log("\nTotals:");
  console.log(`   ✅  allow                  : ${totalAllow}`);
  console.log(`   🚫  deny (explicit status) : ${denyStrict}`);
  console.log(`   ⚠️   missing status         : ${totalMissingStatus} (treated as deny by the gate)`);
  console.log(`   🚫  deny (including missing): ${denyIncludingMissing}  ← what the gate actually blocks`);
  console.log(`   📊  scanned                : ${snap.size}\n`);

  // 5. CSV output
  if (outPath) {
    const header = [
      "id",
      "licenseStatus",
      "derivedBucket",
      "graceEndsAtIso",
      "licenseRejectionReasonRedacted",
      "cityCode",
      "createdAtIso",
    ].join(",");
    const lines = [header];
    for (const row of rows) {
      lines.push(
        [
          row.id,
          row.licenseStatus,
          row.derivedBucket,
          row.graceEndsAtIso,
          // CSV-escape: wrap reason in quotes if it contains comma or quote
          /[",\n]/.test(row.licenseRejectionReasonRedacted)
            ? `"${row.licenseRejectionReasonRedacted.replace(/"/g, '""')}"`
            : row.licenseRejectionReasonRedacted,
          row.cityCode,
          row.createdAtIso,
        ].join(",")
      );
    }
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
    console.log(`📄 CSV written to ${outPath} (${rows.length} rows + header).`);
    console.log(
      "   Privacy: email/phone/licenseNumber NOT exported; rejection reason redacted to 32 chars.\n"
    );
  }

  // 6. Machine-parseable summary
  const summary = {
    project: projectId,
    country,
    licenseRequired: countryCfg.licenseRequired === true,
    scannedAtIso: new Date(now).toISOString(),
    totals: {
      allow: totalAllow,
      // Sprint 5 Finding 2 fix : `deny` now reflects what the gate actually
      // blocks (including missing-status pharmacies). `denyStrict` is kept
      // as the legacy count for backwards-compat with any consumer that
      // already parses the JSON.
      deny: denyIncludingMissing,
      denyStrict,
      missingStatus: totalMissingStatus,
      scanned: snap.size,
    },
    buckets,
    csvOut: outPath ?? null,
  };
  console.log("AUDIT_SUMMARY_JSON " + JSON.stringify(summary));
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelpAndExit() {
  console.log(`
auditGhanaLicenseReadiness.mjs — Sprint 5 read-only license audit

USAGE
  node scripts/auditGhanaLicenseReadiness.mjs --project=<id> [--country=GH] [--out=audit.csv]
  node scripts/auditGhanaLicenseReadiness.mjs --help

OPTIONS
  --project=<id>                Required. Firebase project ID to scan.
  --country=<ISO2>              Default 'GH'. ISO country code to audit.
  --out=<path>                  Optional. Write a CSV report at this path.
  --includeRejectionReason=full Opt-in: do not redact licenseRejectionReason
                                in the CSV (default redacts to 32 chars).
  --help, -h                    Print this help and exit.

ENVIRONMENT
  GOOGLE_APPLICATION_CREDENTIALS  Service-account JSON path, OR
  gcloud auth application-default login  (user creds with datastore.viewer)
  GCLOUD_PROJECT                  Fallback for --project if not passed.

OUTPUT
  - stdout: bucket breakdown + sample IDs (no PII) + AUDIT_SUMMARY_JSON ...
  - CSV (--out): id, licenseStatus, derivedBucket, graceEndsAtIso,
    licenseRejectionReasonRedacted, cityCode, createdAtIso.

GUARANTEES
  - Read-only: never calls .set/.update/.delete/.create/.batch.commit.
  - Requires explicit --project to avoid scanning the wrong environment.
  - Sample IDs only; no email/phone/licenseNumber in output.

EXIT CODES
  0  success
  2  missing --project / invalid CLI
  3  system_config/main missing OR country not configured

EXAMPLES
  # Help only (no Firebase call)
  node scripts/auditGhanaLicenseReadiness.mjs --help

  # Audit Ghana on the prod project, write CSV
  node scripts/auditGhanaLicenseReadiness.mjs --project=mediexchange --out=gh-audit.csv

  # Audit a future second mandatory country
  node scripts/auditGhanaLicenseReadiness.mjs --project=mediexchange --country=NG
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------

main().catch((e) => {
  console.error("\n💥 Audit failed:", e?.message ?? e);
  process.exit(1);
});
