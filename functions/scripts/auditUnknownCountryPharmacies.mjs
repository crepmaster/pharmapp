#!/usr/bin/env node
/**
 * Sprint 2A.3 — Pre-deploy audit (READ-ONLY) for the F-LICENSE
 * registration backend-owned rollout.
 *
 * After Sprint 2A.3 ships, the marketplace gate fail-closes on:
 *   - pharmacy.countryCode missing
 *   - pharmacy.countryCode not present in system_config/main.countries
 *   - system_config/main missing entirely
 *
 * This script counts how many existing pharmacies in production
 * would be denied by the new gate, so the operator can decide a
 * remediation strategy (data migration, targeted grace-period
 * backfill, or grandfather flag) BEFORE deploying the gate changes.
 *
 * This script DOES NOT mutate Firestore. It only reads.
 *
 * Usage:
 *   cd functions
 *   node scripts/auditUnknownCountryPharmacies.mjs \
 *     --project=mediexchange
 *
 * Requirements:
 *   - GOOGLE_APPLICATION_CREDENTIALS pointing to a service-account JSON
 *     with at least roles/datastore.viewer on the target project, OR
 *   - `gcloud auth application-default login` previously run with a
 *     user account that has datastore.viewer on the target project.
 *
 * Output: prints two breakdowns to stdout :
 *   1. Pharmacies missing `countryCode` entirely.
 *   2. Pharmacies whose `countryCode` is NOT in
 *      `system_config/main.countries`.
 *
 * For each bucket, prints a sample of up to 10 pharmacy IDs (no email,
 * no phone) so the operator can spot-check without leaking PII.
 *
 * Output also emits a single JSON summary on the last line so the
 * report can be machine-parsed.
 */

import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const eq = a.indexOf("=");
      return eq >= 0
        ? [a.slice(2, eq), a.slice(eq + 1)]
        : [a.slice(2), "true"];
    })
);

const projectId = args.project ?? process.env.GCLOUD_PROJECT ?? null;
if (!projectId) {
  console.error(
    "ERROR: pass --project=<id> or set GCLOUD_PROJECT. This script will NOT proceed without an explicit project ID to avoid scanning the wrong environment."
  );
  process.exit(2);
}

// Allow an explicit service-account key path via --credentials=path.json
// Falls back to ADC otherwise.
const credentialPath = args.credentials;
if (credentialPath) {
  if (!fs.existsSync(credentialPath)) {
    console.error(`ERROR: credentials file not found: ${credentialPath}`);
    process.exit(2);
  }
  initializeApp({
    projectId,
    credential: cert(credentialPath),
  });
} else {
  initializeApp({
    projectId,
    credential: applicationDefault(),
  });
}

const db = getFirestore();

console.log(`[audit] project=${projectId} mode=READ-ONLY`);
console.log("[audit] this script does NOT mutate Firestore.");
console.log("");

// 1. Load system_config/main.countries — the source of truth post-Sprint-2A.3.
const sysConfigSnap = await db.collection("system_config").doc("main").get();
if (!sysConfigSnap.exists) {
  console.error(
    "FATAL: system_config/main does not exist in this project. Every pharmacy will be denied by the marketplace gate post-2A.3. Investigate before proceeding."
  );
  process.exit(3);
}
const sysConfig = sysConfigSnap.data() ?? {};
const knownCountryCodes = new Set(Object.keys(sysConfig.countries ?? {}));
console.log(
  `[audit] system_config has ${knownCountryCodes.size} known countries: ${[
    ...knownCountryCodes,
  ]
    .sort()
    .join(", ")}`
);
console.log("");

// 2. Scan pharmacies — at the time of writing this prod collection is
// reasonable in size (low thousands at most). For a much larger
// dataset, paginate. Here we do a single read.
const pharmaciesSnap = await db.collection("pharmacies").get();
const total = pharmaciesSnap.size;
console.log(`[audit] scanning ${total} pharmacies...`);

const missingCountry = [];
const unknownCountry = [];

for (const docSnap of pharmaciesSnap.docs) {
  const data = docSnap.data() ?? {};
  const cc = data.countryCode;
  if (typeof cc !== "string" || cc.length === 0) {
    missingCountry.push(docSnap.id);
  } else if (!knownCountryCodes.has(cc)) {
    unknownCountry.push({ id: docSnap.id, countryCode: cc });
  }
}

// 3. Report.
const sample = (arr, n) => arr.slice(0, n);

console.log("");
console.log(
  `[audit] RESULT — ${missingCountry.length} pharmacies have NO countryCode`
);
if (missingCountry.length > 0) {
  console.log(
    `  Sample (up to 10): ${sample(missingCountry, 10).join(", ")}`
  );
  console.log(
    "  → These will be DENIED by the marketplace gate after Sprint 2A.3 deploys."
  );
  console.log(
    "  → Recommended remediation : backfill countryCode from `pharmacies.address`, GPS data, or owner self-declaration before deploy."
  );
}

console.log("");
console.log(
  `[audit] RESULT — ${unknownCountry.length} pharmacies have a countryCode NOT in system_config/main.countries`
);
if (unknownCountry.length > 0) {
  const grouped = new Map();
  for (const p of unknownCountry) {
    if (!grouped.has(p.countryCode)) grouped.set(p.countryCode, []);
    grouped.get(p.countryCode).push(p.id);
  }
  for (const [cc, ids] of grouped) {
    console.log(
      `  countryCode='${cc}': ${ids.length} pharmacies. Sample: ${sample(
        ids,
        10
      ).join(", ")}`
    );
  }
  console.log(
    "  → These will be DENIED by the marketplace gate after Sprint 2A.3 deploys."
  );
  console.log(
    "  → Recommended remediation : either add the country to system_config/main.countries with appropriate licenseRequired flag, or migrate these pharmacies to a known country."
  );
}

console.log("");

// 4. Machine-parsable JSON line (last line, for CI / log aggregation).
const summary = {
  schemaVersion: 1,
  project: projectId,
  scannedAt: new Date().toISOString(),
  totalPharmacies: total,
  knownCountryCodes: [...knownCountryCodes].sort(),
  missingCountryCount: missingCountry.length,
  unknownCountryCount: unknownCountry.length,
  unknownCountryByCode: Object.fromEntries(
    [...new Set(unknownCountry.map((p) => p.countryCode))].sort().map((cc) => [
      cc,
      unknownCountry.filter((p) => p.countryCode === cc).length,
    ])
  ),
  safeToDeploySprint2A3:
    missingCountry.length === 0 && unknownCountry.length === 0,
};
console.log("AUDIT_SUMMARY_JSON " + JSON.stringify(summary));

process.exit(0);
