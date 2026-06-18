#!/usr/bin/env node
/**
 * Sprint 5 phase 2 — Seed `system_config/main` on a REAL Firebase staging
 * project (uses Application Default Credentials, NOT the emulator).
 *
 * This is the real-Firestore sibling of `seedEmulator.mjs`. The
 * `SYSTEM_CONFIG` payload below is kept identical to that file so the
 * staging recette exercises the exact same master-data shape proven on the
 * emulator (countries CM/GH, GH.accra deliveryFee=2000 with NO exchangeFee
 * to test the ×1.2 fallback → courierFee 2400, GHS minWithdrawalMinor=10000,
 * mtn_momo_gh methodCode=mtn_gh).
 *
 * 🔒 GUARDS (this script MUTATES real Firestore — three independent checks) :
 *   1. `--project` MUST end with `-staging` (refuses prod `mediexchange`).
 *   2. `FIRESTORE_EMULATOR_HOST` MUST NOT be set (this targets real Firestore;
 *      a stray emulator host would silently write to the wrong place).
 *   3. `--confirm` flag MUST be present (no accidental run).
 *
 * Usage :
 *   gcloud auth application-default login   # once, if ADC not set
 *   node functions/scripts/seedStaging.mjs --project=mediexchange-staging --confirm
 *
 * Idempotent : `set({ merge: true })`.
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { SYSTEM_CONFIG } from "./lib/seedSystemConfig.mjs";

function parseArgs(rawArgs) {
  const out = {};
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq >= 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const key = a.slice(2);
    const next = rawArgs[i + 1];
    if (typeof next === "string" && !next.startsWith("--")) { out[key] = next; i++; }
    else out[key] = "true";
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.help === "true" || args.h === "true") {
  console.log(`
seedStaging.mjs — Sprint 5 phase 2 REAL staging seed.

USAGE
  node functions/scripts/seedStaging.mjs --project=mediexchange-staging --confirm

GUARDS (all must pass)
  1. --project must end with "-staging".
  2. FIRESTORE_EMULATOR_HOST must NOT be set.
  3. --confirm flag required.
`);
  process.exit(0);
}

const projectId = args.project ?? null;
if (!projectId || !projectId.endsWith("-staging")) {
  console.error(`❌ GUARD 1 FAILED: --project must end with "-staging" (got '${projectId ?? "missing"}').`);
  process.exit(2);
}
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("❌ GUARD 2 FAILED: FIRESTORE_EMULATOR_HOST is set. This script targets REAL Firestore — unset it.");
  process.exit(2);
}
if (args.confirm !== "true") {
  console.error("❌ GUARD 3 FAILED: pass --confirm to acknowledge this writes to real Firestore.");
  process.exit(2);
}

// SYSTEM_CONFIG now lives in `./lib/seedSystemConfig.mjs` and is shared
// with seedEmulator.mjs (Sprint 5 optimisation #6 — kill the manual mirror).

console.log(`\n✅ Guards passed. Target project = ${projectId} (REAL Firestore via ADC).`);
console.log(`   countries: ${Object.keys(SYSTEM_CONFIG.countries).join(", ")}`);
console.log(`   currencies: ${Object.keys(SYSTEM_CONFIG.currencies).join(", ")}`);
console.log(`   providers: ${Object.keys(SYSTEM_CONFIG.mobileMoneyProviders).join(", ")}`);
console.log(`\n💾 Writing system_config/main…\n`);

initializeApp({ projectId });
const db = getFirestore();

try {
  await db.collection("system_config").doc("main").set(SYSTEM_CONFIG, { merge: true });
  console.log("✅ system_config/main written successfully (merge:true, idempotent).");
  process.exit(0);
} catch (err) {
  console.error("\n💥 Write failed:", err?.message ?? err);
  process.exit(1);
}
