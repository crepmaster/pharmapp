#!/usr/bin/env node
/**
 * Currency sprint — Pre-repair audit (READ-ONLY) of wallets whose stored
 * currency contradicts their owner's country default.
 *
 * WHY THIS EXISTS
 * ---------------
 * `auditCourierCountryReadiness.mjs` found wallets labelled XAF owned by
 * Ghanaian couriers (7/7 on staging, 1/9 on production). The naive repair —
 * flipping `wallet.currency` from XAF to GHS — is DANGEROUS: it would
 * silently re-denominate a balance. `10000 XAF` (~16 USD) becoming
 * `10000 GHS` (~800 USD) is not a relabel, it is invented money.
 *
 * A wallet is only safely relabelable when it has never held value and has
 * no financial history. This script measures exactly that, so the repair
 * strategy is chosen from evidence rather than assumed.
 *
 * SAFETY — READ-ONLY BY CONSTRUCTION
 * ----------------------------------
 * Never calls set / update / delete / add / create / batch / commit /
 * runTransaction. Only `.get()`. Verify with:
 *
 *   grep -nE '(db|Ref|Snap|doc\([^)]*\)|collection\([^)]*\))\s*\.\s*(set|update|delete|add|create)\(' \
 *     functions/scripts/auditWalletCurrencyMismatch.mjs
 *
 * PRIVACY
 * -------
 * No email, phone, name or raw uid. Owners appear as run-salted SHA-256
 * prefixes. Test-fixture detection reports only a BOOLEAN derived from the
 * email domain — the address itself is never printed or stored.
 *
 * USAGE
 * -----
 *   cd functions
 *   node scripts/auditWalletCurrencyMismatch.mjs --project=mediexchange-staging
 *   node scripts/auditWalletCurrencyMismatch.mjs --project=mediexchange --i-understand-this-is-production
 *
 * Scope: couriers by default. Add --include-pharmacies to widen.
 */

import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "node:crypto";
import fs from "node:fs";

const KNOWN_PROJECTS = {
  "mediexchange-staging": "staging",
  mediexchange: "production",
};

/** Mirrors SANDBOX_ACCOUNT_PATTERNS in functions/src/index.ts. */
const TEST_ACCOUNT_PATTERN = /^[\w.+-]+@promoshake\.net$/i;

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
      "Read-only audit of wallets whose currency contradicts their owner's country.",
      "",
      "  --project=<id>                      REQUIRED. One of: " +
        Object.keys(KNOWN_PROJECTS).join(", "),
      "  --i-understand-this-is-production   Required for production.",
      "  --include-pharmacies                Also audit pharmacy-owned wallets.",
      "  --credentials=<path.json>           Optional service-account key.",
      "",
      "Never writes.",
    ].join("\n")
  );
  process.exit(0);
}

const projectId = args.project ?? null;
if (!projectId) {
  console.error("ERROR: --project=<id> is required. This script refuses to guess an environment.");
  process.exit(2);
}

const environment = KNOWN_PROJECTS[projectId];
if (!environment) {
  console.error(
    `ERROR: project "${projectId}" is not a recognised environment.\n` +
      `Known: ${Object.keys(KNOWN_PROJECTS).join(", ")}`
  );
  process.exit(2);
}

if (environment === "production" && args["i-understand-this-is-production"] !== "true") {
  console.error(`ERROR: "${projectId}" is PRODUCTION. Re-run with --i-understand-this-is-production.`);
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

const RUN_SALT = crypto.randomBytes(16).toString("hex");
const pseudo = (uid) =>
  crypto.createHash("sha256").update(RUN_SALT + uid).digest("hex").slice(0, 12);

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const isoOrNull = (ts) => {
  try {
    return ts?.toDate ? ts.toDate().toISOString() : null;
  } catch {
    return null;
  }
};

console.log(`\n🔎 Wallet currency mismatch audit (READ-ONLY)`);
console.log(`   project     : ${projectId}`);
console.log(`   environment : ${environment}`);
console.log(`   scope       : couriers${args["include-pharmacies"] === "true" ? " + pharmacies" : ""}`);
console.log(`   started     : ${new Date().toISOString()}\n`);

const sysConfigSnap = await db.collection("system_config").doc("main").get();
if (!sysConfigSnap.exists) {
  console.error("ERROR: system_config/main does not exist.");
  process.exit(1);
}
const countries = sysConfigSnap.data()?.countries ?? {};

const ownerCollections = ["couriers"];
if (args["include-pharmacies"] === "true") ownerCollections.push("pharmacies");

const findings = [];
let scanned = 0;

for (const collectionName of ownerCollections) {
  const ownersSnap = await db.collection(collectionName).get();

  for (const ownerDoc of ownersSnap.docs) {
    scanned++;
    const uid = ownerDoc.id;
    const owner = ownerDoc.data() ?? {};
    const countryCode = typeof owner.countryCode === "string" ? owner.countryCode : null;
    const expected = countryCode ? countries[countryCode]?.defaultCurrencyCode ?? null : null;

    const walletSnap = await db.collection("wallets").doc(uid).get();
    if (!walletSnap.exists) continue;

    const wallet = walletSnap.data() ?? {};
    const actual = typeof wallet.currency === "string" ? wallet.currency : null;

    // Only mismatches are of interest here.
    if (!expected || !actual || actual === expected) continue;

    // --- balances --------------------------------------------------------
    const available = num(wallet.available);
    const held = num(wallet.held);
    const deducted = num(wallet.deducted);
    const balanceIsZero = available === 0 && held === 0 && deducted === 0;

    // --- financial history ----------------------------------------------
    const [ledgerSnap, paymentsSnap, withdrawalsSnap] = await Promise.all([
      db.collection("ledger").where("userId", "==", uid).get(),
      db.collection("payments").where("userId", "==", uid).get(),
      db.collection("withdrawal_requests").where("ownerId", "==", uid).get(),
    ]);

    const ledgerCurrencies = new Map();
    let lastActivity = isoOrNull(wallet.updatedAt);
    for (const l of ledgerSnap.docs) {
      const d = l.data() ?? {};
      const c = typeof d.currency === "string" ? d.currency : "(none)";
      ledgerCurrencies.set(c, (ledgerCurrencies.get(c) ?? 0) + 1);
      const at = isoOrNull(d.createdAt);
      if (at && (!lastActivity || at > lastActivity)) lastActivity = at;
    }

    const hasHistory =
      ledgerSnap.size > 0 || paymentsSnap.size > 0 || withdrawalsSnap.size > 0;

    // --- fixture detection (boolean only, address never retained) --------
    const isTestAccount = TEST_ACCOUNT_PATTERN.test(String(owner.email ?? "").trim());

    // --- classification --------------------------------------------------
    let verdict;
    if (balanceIsZero && !hasHistory) {
      verdict = "RELABELABLE";
    } else if (isTestAccount && environment === "staging") {
      verdict = "FIXTURE_RESEED";
    } else {
      verdict = "MIGRATION_REQUIRED";
    }

    findings.push({
      owner: pseudo(uid),
      ownerCollection: collectionName,
      countryCode,
      expected,
      actual,
      available,
      held,
      deducted,
      balanceIsZero,
      ledgerEntries: ledgerSnap.size,
      ledgerCurrencies: Object.fromEntries(ledgerCurrencies),
      payments: paymentsSnap.size,
      withdrawals: withdrawalsSnap.size,
      hasHistory,
      isTestAccount,
      lastActivity,
      verdict,
    });
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`═══ ${scanned} owners scanned — ${findings.length} wallet mismatch(es) ═══\n`);

if (findings.length === 0) {
  console.log("   No mismatch. Nothing to repair.\n");
} else {
  for (const f of findings) {
    console.log(`   ┌─ ${f.owner}  (${f.ownerCollection})`);
    console.log(`   │  country ${f.countryCode}: wallet=${f.actual} expected=${f.expected}`);
    console.log(
      `   │  balances  available=${f.available} held=${f.held} deducted=${f.deducted}` +
        `  ${f.balanceIsZero ? "(all zero)" : "⚠ NON-ZERO"}`
    );
    console.log(
      `   │  history   ledger=${f.ledgerEntries} payments=${f.payments} withdrawals=${f.withdrawals}`
    );
    if (f.ledgerEntries > 0) {
      console.log(`   │  ledger currencies: ${JSON.stringify(f.ledgerCurrencies)}`);
    }
    console.log(`   │  last activity: ${f.lastActivity ?? "(unknown)"}`);
    console.log(`   │  test fixture : ${f.isTestAccount ? "yes" : "no"}`);
    console.log(`   └─ verdict: ${f.verdict}\n`);
  }
}

const byVerdict = findings.reduce((acc, f) => {
  acc[f.verdict] = (acc[f.verdict] ?? 0) + 1;
  return acc;
}, {});

console.log("── Repair strategy ──");
console.log(`   RELABELABLE        ${byVerdict.RELABELABLE ?? 0}  zero balance, no history — currency field can be corrected`);
console.log(`   FIXTURE_RESEED     ${byVerdict.FIXTURE_RESEED ?? 0}  staging test account — delete + recreate cleanly`);
console.log(`   MIGRATION_REQUIRED ${byVerdict.MIGRATION_REQUIRED ?? 0}  real value or history — NEVER a simple relabel`);
console.log("\n" + "─".repeat(72));
console.log("READ-ONLY audit complete. No document was modified.");
console.log("─".repeat(72) + "\n");

console.log(
  "WALLET_MISMATCH_SUMMARY_JSON " +
    JSON.stringify({
      projectId,
      environment,
      ownersScanned: scanned,
      mismatches: findings.length,
      byVerdict,
      findings,
      generatedAt: new Date().toISOString(),
    })
);

process.exit(0);
