#!/usr/bin/env node
/**
 * Sprint 5 — Seed minimal pour la recette E2E sur Firebase Emulator Suite.
 *
 * Écrit `system_config/main` avec les pays / cities / currencies / mobile
 * money providers nécessaires aux 8 scénarios de
 * `docs/release/SPRINT_5_E2E_CLOSURE_PLAN.md`.
 *
 * 🔒 GARDE-FOUS ANTI-PROD (ce script ÉCRIT par définition) :
 *
 *   1. `FIRESTORE_EMULATOR_HOST` DOIT être défini, sinon refus immédiat.
 *   2. `--project=<id>` DOIT commencer par `demo-` (déclenche le mode
 *      offline Firebase, refuse tout accès réseau réel), sinon refus.
 *   3. Confirmation visuelle des valeurs cibles avant écriture.
 *
 * Ces garde-fous sont volontairement redondants : la moindre fuite vers
 * prod via ce script serait catastrophique car il MUTE Firestore. Trois
 * checks indépendants doivent tous passer pour que l'écriture ait lieu.
 *
 * Usage :
 *   # Avec l'émulateur démarré dans une autre fenêtre :
 *   #   firebase emulators:start --project=demo-pharmapp
 *
 *   export FIRESTORE_EMULATOR_HOST=localhost:8080
 *   export FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
 *   node functions/scripts/seedEmulator.mjs --project=demo-pharmapp
 *
 * Idempotent : peut être ré-exécuté sans casser l'état (utilise `set`
 * avec `{ merge: true }`).
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// Arg parsing (supports --key=value AND --key value)
// ---------------------------------------------------------------------------

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
  console.log(`
seedEmulator.mjs — Sprint 5 emulator seed (NEVER touches prod)

USAGE
  export FIRESTORE_EMULATOR_HOST=localhost:8080
  node functions/scripts/seedEmulator.mjs --project=demo-pharmapp

OPTIONS
  --project=<id>   Required. MUST start with "demo-" (anti-prod guard).
  --help, -h       Print this help and exit.

GUARDS (all three must pass)
  1. FIRESTORE_EMULATOR_HOST env var must be set.
  2. --project MUST start with "demo-".
  3. No write before printing the target config for visual confirmation.

WRITES
  Firestore: system_config/main (set with merge:true, idempotent)

EXIT CODES
  0  success
  2  guard failure (missing env var / invalid project prefix / missing flag)
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Guard 1 — FIRESTORE_EMULATOR_HOST must be set
// ---------------------------------------------------------------------------

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "❌ GUARD 1 FAILED: FIRESTORE_EMULATOR_HOST env var is not set.\n" +
    "   This script writes data — it MUST target an emulator, never prod.\n" +
    "   Set it first: export FIRESTORE_EMULATOR_HOST=localhost:8080\n"
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Guard 2 — project ID must start with "demo-"
// ---------------------------------------------------------------------------

const projectId = args.project ?? null;
if (!projectId) {
  console.error(
    "❌ GUARD 2 FAILED: pass --project=<id>. Required for safety.\n" +
    "   The project ID MUST start with 'demo-' (Firebase offline mode).\n"
  );
  process.exit(2);
}
if (!projectId.startsWith("demo-")) {
  console.error(
    `❌ GUARD 2 FAILED: project '${projectId}' does not start with 'demo-'.\n` +
    "   This script refuses to write to any non-demo project.\n" +
    "   Use --project=demo-pharmapp (or another demo-* prefix).\n"
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Guard 3 — show what we're about to write
// ---------------------------------------------------------------------------

const SYSTEM_CONFIG = {
  schemaVersion: 1,
  primaryCountryCode: "CM",
  countries: {
    CM: {
      code: "CM",
      licenseRequired: false,
      defaultCurrencyCode: "XAF",
      name: "Cameroon",
      dialCode: "237",
      enabled: true,
      sortOrder: 0,
      defaultCityCode: "douala",
      providerIds: ["mtn_momo_cm"],
    },
    GH: {
      code: "GH",
      licenseRequired: true,
      licenseFormatRegex: "^GH-\\d{4}$",
      licenseGracePeriodDays: 30,
      licenseLabel: "Pharmacy Council License",
      licenseHelpText: "Enter your Pharmacy Council of Ghana license number.",
      licenseVerificationRequired: true,
      licenseDocumentRequired: true,
      defaultCurrencyCode: "GHS",
      name: "Ghana",
      dialCode: "233",
      enabled: true,
      sortOrder: 1,
      defaultCityCode: "accra",
      providerIds: ["mtn_momo_gh"],
    },
  },
  citiesByCountry: {
    CM: {
      douala: {
        code: "douala",
        name: "Douala",
        enabled: true,
        deliveryFee: 1000,
        exchangeFee: 1200,
        currencyCode: "XAF",
        sortOrder: 0,
      },
      yaounde: {
        code: "yaounde",
        name: "Yaounde",
        enabled: true,
        deliveryFee: 1000,
        exchangeFee: 1200,
        currencyCode: "XAF",
        sortOrder: 1,
      },
    },
    GH: {
      // Note: exchangeFee absent on purpose to test fallback deliveryFee × 1.2
      accra: {
        code: "accra",
        name: "Accra",
        enabled: true,
        deliveryFee: 2000,
        currencyCode: "GHS",
        sortOrder: 0,
      },
    },
  },
  currencies: {
    XAF: {
      code: "XAF",
      name: "Central African CFA franc",
      enabled: true,
      sortOrder: 0,
      decimals: 0,
      minWithdrawalMinor: 1000,
      symbol: "FCFA",
    },
    GHS: {
      code: "GHS",
      name: "Ghanaian cedi",
      enabled: true,
      sortOrder: 1,
      decimals: 2,
      minWithdrawalMinor: 10000,
      symbol: "GH₵",
    },
  },
  mobileMoneyProviders: {
    mtn_momo_cm: {
      id: "mtn_momo_cm",
      name: "MTN Mobile Money",
      countryCode: "CM",
      currencyCode: "XAF",
      enabled: true,
      displayOrder: 0,
      requiresMsisdn: true,
      supportsCollections: true,
      supportsPayouts: true,
      methodCode: "mtn_momo",
    },
    mtn_momo_gh: {
      id: "mtn_momo_gh",
      name: "MTN Mobile Money Ghana",
      countryCode: "GH",
      currencyCode: "GHS",
      enabled: true,
      displayOrder: 0,
      requiresMsisdn: true,
      supportsCollections: true,
      supportsPayouts: true,
      methodCode: "mtn_gh",
    },
  },
};

console.log(`\n✅ Guards passed.`);
console.log(`   FIRESTORE_EMULATOR_HOST = ${process.env.FIRESTORE_EMULATOR_HOST}`);
console.log(`   FIREBASE_AUTH_EMULATOR_HOST = ${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "(not set; auth seeding will fail if needed)"}`);
console.log(`   project = ${projectId}`);
console.log(`\n📋 Will write system_config/main with :`);
console.log(`   - schemaVersion: ${SYSTEM_CONFIG.schemaVersion}`);
console.log(`   - primaryCountryCode: ${SYSTEM_CONFIG.primaryCountryCode}`);
console.log(`   - countries: ${Object.keys(SYSTEM_CONFIG.countries).join(", ")}`);
console.log(`   - citiesByCountry: ${Object.entries(SYSTEM_CONFIG.citiesByCountry).map(([c, cs]) => `${c}=[${Object.keys(cs).join(",")}]`).join(", ")}`);
console.log(`   - currencies: ${Object.keys(SYSTEM_CONFIG.currencies).join(", ")}`);
console.log(`   - mobileMoneyProviders: ${Object.keys(SYSTEM_CONFIG.mobileMoneyProviders).join(", ")}`);
console.log(`\n💾 Writing…\n`);

// ---------------------------------------------------------------------------
// Init + write
// ---------------------------------------------------------------------------

initializeApp({ projectId });
const db = getFirestore();

try {
  await db
    .collection("system_config")
    .doc("main")
    .set(SYSTEM_CONFIG, { merge: true });
  console.log("✅ system_config/main written successfully (merge:true, idempotent).");
  console.log("\n👉 Next: create pharmacies via the app's registration flow (scenarios S1, S2, S3 of SPRINT_5_E2E_CLOSURE_PLAN.md).");
  process.exit(0);
} catch (err) {
  console.error("\n💥 Write failed:", err?.message ?? err);
  process.exit(1);
}
