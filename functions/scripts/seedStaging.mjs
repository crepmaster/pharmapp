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

// Mirror of seedEmulator.mjs SYSTEM_CONFIG — keep in sync.
const SYSTEM_CONFIG = {
  schemaVersion: 1,
  primaryCountryCode: "CM",
  countries: {
    CM: { code: "CM", licenseRequired: false, defaultCurrencyCode: "XAF", name: "Cameroon", dialCode: "237", enabled: true, sortOrder: 0, defaultCityCode: "douala", providerIds: ["mtn_momo_cm"] },
    GH: { code: "GH", licenseRequired: true, licenseFormatRegex: "^GH-\\d{4}$", licenseGracePeriodDays: 30, licenseLabel: "Pharmacy Council License", licenseHelpText: "Enter your Pharmacy Council of Ghana license number.", licenseVerificationRequired: true, licenseDocumentRequired: true, defaultCurrencyCode: "GHS", name: "Ghana", dialCode: "233", enabled: true, sortOrder: 1, defaultCityCode: "accra", providerIds: ["mtn_momo_gh"] },
  },
  citiesByCountry: {
    CM: {
      douala: { code: "douala", name: "Douala", enabled: true, deliveryFee: 1000, exchangeFee: 1200, currencyCode: "XAF", sortOrder: 0 },
      yaounde: { code: "yaounde", name: "Yaounde", enabled: true, deliveryFee: 1000, exchangeFee: 1200, currencyCode: "XAF", sortOrder: 1 },
    },
    GH: {
      // exchangeFee absent on purpose to test fallback deliveryFee × 1.2
      accra: { code: "accra", name: "Accra", enabled: true, deliveryFee: 2000, currencyCode: "GHS", sortOrder: 0 },
    },
  },
  currencies: {
    XAF: { code: "XAF", name: "Central African CFA franc", enabled: true, sortOrder: 0, decimals: 0, minWithdrawalMinor: 1000, symbol: "FCFA" },
    GHS: { code: "GHS", name: "Ghanaian cedi", enabled: true, sortOrder: 1, decimals: 2, minWithdrawalMinor: 10000, symbol: "GH₵" },
  },
  mobileMoneyProviders: {
    mtn_momo_cm: { id: "mtn_momo_cm", name: "MTN Mobile Money", countryCode: "CM", currencyCode: "XAF", enabled: true, displayOrder: 0, requiresMsisdn: true, supportsCollections: true, supportsPayouts: true, methodCode: "mtn_momo" },
    mtn_momo_gh: { id: "mtn_momo_gh", name: "MTN Mobile Money Ghana", countryCode: "GH", currencyCode: "GHS", enabled: true, displayOrder: 0, requiresMsisdn: true, supportsCollections: true, supportsPayouts: true, methodCode: "mtn_gh" },
  },
};

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
