#!/usr/bin/env node
/**
 * Currency sprint — Pre-backfill audit (READ-ONLY) of courier country data.
 *
 * WHY THIS EXISTS
 * ---------------
 * Courier registration is a CLIENT-WRITE flow: the Flutter app writes
 * `couriers/{uid}` directly (shared/lib/services/unified_auth_service.dart),
 * and `_sanitizeProfileData` passes every submitted field through rather
 * than applying a whitelist. `countryCode` therefore does reach the
 * document in practice — the backend `createCourierUser` endpoint is not
 * the path the app takes.
 *
 * The problem is not absence, it is TRUST. On `/couriers/{uid}`,
 * firestore.rules allows create and update by the owner, and
 * `isValidCourierData()` does not mention `countryCode` at all. The field
 * is therefore:
 *
 *   - not mandatory at creation,
 *   - never validated against `system_config.countries`,
 *   - freely mutable by the courier afterwards, including after a wallet
 *     has been created from it.
 *
 * Two consumers depend on it regardless: `setCourierActive` refuses a
 * country-scoped admin operation when it is missing, and the wallet-owner
 * currency resolver derives the operating currency from it.
 *
 * This script measures what the data actually looks like — how often the
 * field is present, whether its value is a country the platform knows, and
 * whether existing wallets agree with it — so a hardening and backfill
 * strategy is chosen from evidence. `operatingCity` is read only as a
 * SECONDARY signal, to gauge whether incomplete profiles could be repaired
 * by inference; it is free text and never authoritative.
 *
 * SAFETY — this script is READ-ONLY BY CONSTRUCTION
 * -------------------------------------------------
 * It never calls set / update / delete / add / create / batch / commit /
 * runTransaction. Only `.get()` on collections and documents. Verify with:
 *
 *   grep -nE '\.(set|update|delete|add|create|batch|commit|runTransaction)\(' \
 *     functions/scripts/auditCourierCountryReadiness.mjs
 *
 * PRIVACY
 * -------
 * No email, phone, full name, address or raw uid is ever printed. Sample
 * identifiers are SHA-256 hashes truncated to 12 hex chars — enough to
 * correlate two buckets within one run, useless outside it. City names are
 * only printed when they occur often enough that a single courier cannot
 * be re-identified from the frequency (see MIN_CITY_FREQUENCY).
 *
 * USAGE
 * -----
 *   cd functions
 *   node scripts/auditCourierCountryReadiness.mjs --project=mediexchange-staging
 *
 * Production requires an extra explicit acknowledgement:
 *   node scripts/auditCourierCountryReadiness.mjs --project=mediexchange --i-understand-this-is-production
 *
 * Requirements: GOOGLE_APPLICATION_CREDENTIALS pointing at a service
 * account with roles/datastore.viewer, or a prior
 * `gcloud auth application-default login`.
 *
 * Output: human-readable aggregate report, plus a single machine-parsable
 * `COURIER_AUDIT_SUMMARY_JSON {...}` line at the end.
 */

import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "node:crypto";
import fs from "node:fs";

// ---------------------------------------------------------------------------
// Guard rails
// ---------------------------------------------------------------------------

/**
 * Known environments. An unrecognised project ID is refused outright so a
 * typo cannot point this at somebody else's Firestore.
 */
const KNOWN_PROJECTS = {
  "mediexchange-staging": "staging",
  mediexchange: "production",
};

/** A city name is only printed if at least this many couriers share it. */
const MIN_CITY_FREQUENCY = 5;

/** Max hashed samples printed per bucket. */
const MAX_SAMPLES = 10;

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const eq = a.indexOf("=");
      return eq >= 0 ? [a.slice(2, eq), a.slice(eq + 1)] : [a.slice(2), "true"];
    })
);

if (args.help === "true") {
  console.log(
    [
      "Read-only audit of courier country readiness.",
      "",
      "  --project=<id>                      REQUIRED. One of: " +
        Object.keys(KNOWN_PROJECTS).join(", "),
      "  --i-understand-this-is-production   Required when targeting production.",
      "  --credentials=<path.json>           Optional service-account key.",
      "  --help                              This message.",
      "",
      "Never writes. See the SAFETY section at the top of the file.",
    ].join("\n")
  );
  process.exit(0);
}

// No implicit project: GCLOUD_PROJECT is deliberately NOT consulted, so an
// ambient env var cannot silently redirect the scan.
const projectId = args.project ?? null;
if (!projectId) {
  console.error(
    "ERROR: --project=<id> is required. This script refuses to guess an environment."
  );
  process.exit(2);
}

const environment = KNOWN_PROJECTS[projectId];
if (!environment) {
  console.error(
    `ERROR: project "${projectId}" is not a recognised environment.\n` +
      `Known: ${Object.keys(KNOWN_PROJECTS).join(", ")}\n` +
      "Refusing to run against an unknown Firestore."
  );
  process.exit(2);
}

if (environment === "production" && args["i-understand-this-is-production"] !== "true") {
  console.error(
    `ERROR: "${projectId}" is PRODUCTION.\n` +
      "Re-run with --i-understand-this-is-production once you have confirmed\n" +
      "the active credentials. Audit staging first."
  );
  process.exit(2);
}

const credentialPath = args.credentials;
if (credentialPath && !fs.existsSync(credentialPath)) {
  console.error(`ERROR: credentials file not found: ${credentialPath}`);
  process.exit(2);
}

initializeApp({
  projectId,
  credential: credentialPath ? cert(credentialPath) : applicationDefault(),
});

const db = getFirestore();

// ---------------------------------------------------------------------------
// Helpers (all pure)
// ---------------------------------------------------------------------------

/** Run-local pseudonym. Not reversible, not stable across runs by design. */
const RUN_SALT = crypto.randomBytes(16).toString("hex");
const pseudo = (uid) =>
  crypto.createHash("sha256").update(RUN_SALT + uid).digest("hex").slice(0, 12);

/** Loose city normalisation, mirroring what a backfill would attempt. */
function normalizeCity(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents: Yaoundé -> yaounde
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Build normalised city -> [countryCode] index from system_config.
 * A city name shared by two countries yields an ambiguous match, which the
 * backfill must never resolve by guessing.
 */
function buildCityIndex(citiesByCountry) {
  const index = new Map();
  for (const [countryCode, cities] of Object.entries(citiesByCountry ?? {})) {
    for (const [cityCode, city] of Object.entries(cities ?? {})) {
      for (const candidate of [cityCode, city?.name, city?.code]) {
        const key = normalizeCity(candidate);
        if (!key) continue;
        if (!index.has(key)) index.set(key, new Set());
        index.get(key).add(countryCode);
      }
    }
  }
  return index;
}

const pct = (n, total) => (total === 0 ? "0.0" : ((n / total) * 100).toFixed(1));

function printBucket(label, count, total, samples) {
  const line = `   ${label.padEnd(46)} ${String(count).padStart(6)}  (${pct(count, total)}%)`;
  console.log(line);
  if (samples?.length) {
    console.log(`      samples: ${samples.slice(0, MAX_SAMPLES).join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

console.log(`\n🔎 Courier country readiness audit (READ-ONLY)`);
console.log(`   project     : ${projectId}`);
console.log(`   environment : ${environment}`);
console.log(`   started     : ${new Date().toISOString()}\n`);

const sysConfigSnap = await db.collection("system_config").doc("main").get();
if (!sysConfigSnap.exists) {
  console.error("ERROR: system_config/main does not exist. Cannot classify countries.");
  process.exit(1);
}
const sysConfig = sysConfigSnap.data() ?? {};
const countries = sysConfig.countries ?? {};
const cityIndex = buildCityIndex(sysConfig.citiesByCountry);

console.log(`   countries configured : ${Object.keys(countries).join(", ") || "(none)"}`);
console.log(`   city index entries   : ${cityIndex.size}\n`);

const couriersSnap = await db.collection("couriers").get();
const total = couriersSnap.size;

const b = {
  countryPresent: 0,
  countryAbsent: 0,
  countryEmpty: 0,
  countryNonString: 0,
  countryKnown: 0,
  countryUnknown: 0,
  cityPresent: 0,
  cityAbsent: 0,
  cityMatchUnique: 0,
  cityMatchAmbiguous: 0,
  cityMatchNone: 0,
  walletPresent: 0,
  walletAbsent: 0,
  walletCurrencyMismatch: 0,
  walletCurrencyConsistent: 0,
  walletCurrencyUncheckable: 0,
  userDocPresent: 0,
  userDocAbsent: 0,
  alsoPharmacy: 0,
  activatableByScopedAdmin: 0,
  blockedForScopedAdmin: 0,
};

const walletCurrencies = new Map();
const countryDistribution = new Map();
/** "<walletCurrency> instead of <expected>" -> count, for mismatch triage. */
const mismatchShapes = new Map();
const userRoles = new Map();
const cityFrequency = new Map();
const samples = {
  countryAbsent: [],
  countryUnknown: [],
  walletCurrencyMismatch: [],
  alsoPharmacy: [],
  cityMatchAmbiguous: [],
};

const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const sample = (key, uid) => {
  if (samples[key].length < MAX_SAMPLES) samples[key].push(pseudo(uid));
};

for (const doc of couriersSnap.docs) {
  const uid = doc.id;
  const d = doc.data() ?? {};

  // --- countryCode ---------------------------------------------------------
  const rawCountry = d.countryCode;
  let resolvedCountry = null;

  if (rawCountry === undefined || rawCountry === null) {
    b.countryAbsent++;
    sample("countryAbsent", uid);
  } else if (typeof rawCountry !== "string") {
    b.countryNonString++;
  } else if (rawCountry.trim() === "") {
    b.countryEmpty++;
  } else {
    b.countryPresent++;
    bump(countryDistribution, rawCountry);
    if (countries[rawCountry]) {
      b.countryKnown++;
      resolvedCountry = rawCountry;
    } else {
      b.countryUnknown++;
      sample("countryUnknown", uid);
    }
  }

  // setCourierActive requires a countryCode that a scoped admin can match.
  if (resolvedCountry) b.activatableByScopedAdmin++;
  else b.blockedForScopedAdmin++;

  // --- operatingCity -------------------------------------------------------
  const normCity = normalizeCity(d.operatingCity);
  if (!normCity) {
    b.cityAbsent++;
  } else {
    b.cityPresent++;
    bump(cityFrequency, normCity);
    const matches = cityIndex.get(normCity);
    if (!matches || matches.size === 0) {
      b.cityMatchNone++;
    } else if (matches.size === 1) {
      b.cityMatchUnique++;
    } else {
      b.cityMatchAmbiguous++;
      sample("cityMatchAmbiguous", uid);
    }
  }

  // --- wallet --------------------------------------------------------------
  const walletSnap = await db.collection("wallets").doc(uid).get();
  if (!walletSnap.exists) {
    b.walletAbsent++;
  } else {
    b.walletPresent++;
    const walletCurrency = walletSnap.data()?.currency;
    bump(walletCurrencies, typeof walletCurrency === "string" ? walletCurrency : "(none)");
    const expected = resolvedCountry ? countries[resolvedCountry]?.defaultCurrencyCode : null;
    if (!expected || typeof walletCurrency !== "string") {
      b.walletCurrencyUncheckable++;
    } else if (walletCurrency === expected) {
      b.walletCurrencyConsistent++;
    } else {
      b.walletCurrencyMismatch++;
      bump(mismatchShapes, `${resolvedCountry}: wallet=${walletCurrency} expected=${expected}`);
      sample("walletCurrencyMismatch", uid);
    }
  }

  // --- identity ------------------------------------------------------------
  const [userSnap, pharmacySnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("pharmacies").doc(uid).get(),
  ]);

  if (userSnap.exists) {
    b.userDocPresent++;
    const role = userSnap.data()?.userType ?? userSnap.data()?.role ?? "(none)";
    bump(userRoles, typeof role === "string" ? role : "(non-string)");
  } else {
    b.userDocAbsent++;
  }

  if (pharmacySnap.exists) {
    b.alsoPharmacy++;
    sample("alsoPharmacy", uid);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`\n═══ COURIERS: ${total} total ═══\n`);

if (total === 0) {
  console.log("   No courier documents. Nothing to audit.\n");
}

console.log("📍 countryCode");
printBucket("present (non-empty string)", b.countryPresent, total);
printBucket("absent", b.countryAbsent, total, samples.countryAbsent);
printBucket("empty string", b.countryEmpty, total);
printBucket("non-string", b.countryNonString, total);
printBucket("known in system_config.countries", b.countryKnown, total);
printBucket("unknown country code", b.countryUnknown, total, samples.countryUnknown);
console.log("   distribution (country -> configured default currency):");
if (countryDistribution.size === 0) {
  console.log("      (no courier carries a countryCode)");
} else {
  for (const [cc, n] of [...countryDistribution.entries()].sort((x, y) => y[1] - x[1])) {
    const expected = countries[cc]?.defaultCurrencyCode ?? "(country not configured)";
    console.log(`      ${String(n).padStart(5)}  ${cc} -> ${expected}`);
  }
}

console.log("\n🏙️  operatingCity → country inference");
printBucket("present", b.cityPresent, total);
printBucket("absent / blank", b.cityAbsent, total);
printBucket("unique country match (backfillable)", b.cityMatchUnique, total);
printBucket("ambiguous match (manual)", b.cityMatchAmbiguous, total, samples.cityMatchAmbiguous);
printBucket("no match (manual)", b.cityMatchNone, total);

const printableCities = [...cityFrequency.entries()]
  .filter(([, n]) => n >= MIN_CITY_FREQUENCY)
  .sort((x, y) => y[1] - x[1]);
console.log(
  `\n   city values occurring >= ${MIN_CITY_FREQUENCY} times ` +
    `(rarer values withheld to avoid re-identification):`
);
if (printableCities.length === 0) {
  console.log("      (none frequent enough to display)");
} else {
  for (const [city, n] of printableCities.slice(0, 20)) {
    console.log(`      ${String(n).padStart(5)}  ${city}`);
  }
}

console.log("\n💰 wallets");
printBucket("wallet exists", b.walletPresent, total);
printBucket("wallet absent", b.walletAbsent, total);
printBucket("currency matches country default", b.walletCurrencyConsistent, total);
printBucket("currency MISMATCH", b.walletCurrencyMismatch, total, samples.walletCurrencyMismatch);
printBucket("not checkable (no country/currency)", b.walletCurrencyUncheckable, total);
console.log("   currency distribution:");
for (const [cur, n] of [...walletCurrencies.entries()].sort((x, y) => y[1] - x[1])) {
  console.log(`      ${String(n).padStart(5)}  ${cur}`);
}
if (mismatchShapes.size > 0) {
  console.log("   mismatch breakdown (drives the repair strategy):");
  for (const [shape, n] of [...mismatchShapes.entries()].sort((x, y) => y[1] - x[1])) {
    console.log(`      ${String(n).padStart(5)}  ${shape}`);
  }
}

console.log("\n🪪 identity");
printBucket("users/{uid} present", b.userDocPresent, total);
printBucket("users/{uid} absent", b.userDocAbsent, total);
printBucket("uid ALSO in pharmacies (ambiguous)", b.alsoPharmacy, total, samples.alsoPharmacy);
console.log("   declared role in users/{uid}:");
for (const [role, n] of [...userRoles.entries()].sort((x, y) => y[1] - x[1])) {
  console.log(`      ${String(n).padStart(5)}  ${role}`);
}

console.log("\n🔐 setCourierActive impact (country-scoped admin)");
printBucket("activatable today", b.activatableByScopedAdmin, total);
printBucket("BLOCKED by missing/invalid countryCode", b.blockedForScopedAdmin, total);

console.log("\n" + "─".repeat(72));
console.log("READ-ONLY audit complete. No document was modified.");
console.log("─".repeat(72) + "\n");

console.log(
  "COURIER_AUDIT_SUMMARY_JSON " +
    JSON.stringify({
      projectId,
      environment,
      totalCouriers: total,
      ...b,
      walletCurrencies: Object.fromEntries(walletCurrencies),
      countryDistribution: Object.fromEntries(countryDistribution),
      mismatchShapes: Object.fromEntries(mismatchShapes),
      userRoles: Object.fromEntries(userRoles),
      generatedAt: new Date().toISOString(),
    })
);

process.exit(0);
