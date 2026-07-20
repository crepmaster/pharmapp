#!/usr/bin/env node
/**
 * auditMarketplaceVisibility.mjs — READ-ONLY diagnostic for the marketplace
 * gate on a given project.
 *
 * When "pharmacy A publishes an item but pharmacy B doesn't see it on the
 * marketplace tab" is reported, this script tells you why. It reads all
 * pharmacies matching an optional country/city filter, their inventory
 * items, and computes what `getMarketplacePharmacies` would return
 * (verified / grace-active / not_required → ALLOW ; anything else → DENY).
 *
 * Grew out of the 2026-07-20 Kumasi diagnostic — the owner pharmacy was
 * `pending_verification` while the observer expected to see her published
 * items. Kept as a versioned tool because "who's blocked and why" is a
 * question that recurs every time an operator ships a new country /
 * onboards a new pharmacy batch.
 *
 * Usage:
 *   cd functions
 *   node scripts/auditMarketplaceVisibility.mjs --project=mediexchange-staging
 *   node scripts/auditMarketplaceVisibility.mjs --project=mediexchange --country=GH
 *   node scripts/auditMarketplaceVisibility.mjs --project=mediexchange --country=GH --city=kumasi
 *   node scripts/auditMarketplaceVisibility.mjs --help
 *
 * Requirements:
 *   - GOOGLE_APPLICATION_CREDENTIALS pointing to a service-account JSON
 *     with at least roles/datastore.viewer on the target project, OR
 *   - `gcloud auth application-default login` previously run with a user
 *     account that has datastore.viewer on the target project.
 *
 * Output:
 *   - stdout: per pharmacy the licenseStatus, subscriptionStatus, city,
 *     inventory items with their availableForExchange + maxExchangeQuantity,
 *     and the simulated gate outcome (ALLOW / DENY with reason).
 *   - final line: AUDIT_SUMMARY_JSON {...} for machine parsing.
 *
 * Read-only by construction: this script never imports `set`, `update`,
 * `delete`, or any mutator. `getFirestore()` is used exclusively through
 * `.collection().get()` / `.doc().get()`.
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// -- CLI ---------------------------------------------------------------------

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`Usage:
  node scripts/auditMarketplaceVisibility.mjs --project=<projectId> [--country=<code>] [--city=<slug>]

Required:
  --project=<id>   Firebase project id (e.g. mediexchange-staging or mediexchange)

Optional filters:
  --country=<code> ISO country code (e.g. GH, CM). Case-sensitive as stored.
  --city=<slug>    Substring match on cityCode OR city (case-insensitive).

The script is read-only.
`);
  process.exit(0);
}

function argValue(prefix) {
  const raw = argv.find((a) => a.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : null;
}

const PROJECT = argValue("--project=");
if (!PROJECT) {
  console.error("Missing --project=<projectId>. See --help.");
  process.exit(2);
}
const COUNTRY_FILTER = argValue("--country=");
const CITY_FILTER = argValue("--city=")?.toLowerCase() ?? null;

initializeApp({ projectId: PROJECT });
const db = getFirestore();

console.log(`\n[audit] project=${PROJECT}`);
if (COUNTRY_FILTER) console.log(`[audit] filter country=${COUNTRY_FILTER}`);
if (CITY_FILTER) console.log(`[audit] filter city~=${CITY_FILTER}`);
console.log("");

// -- Load system_config license policy per country --------------------------

const cfg = (await db.doc("system_config/main").get()).data() ?? {};
const countries = cfg?.countries ?? {};

// -- Load and filter pharmacies ---------------------------------------------

const allPharms = await db.collection("pharmacies").get();
const pharms = allPharms.docs
  .map((d) => ({ uid: d.id, ...d.data() }))
  .filter((p) => {
    if (COUNTRY_FILTER && p.countryCode !== COUNTRY_FILTER) return false;
    if (CITY_FILTER) {
      const cc = (p.cityCode ?? "").toString().toLowerCase();
      const city = (p.city ?? "").toString().toLowerCase();
      if (!cc.includes(CITY_FILTER) && !city.includes(CITY_FILTER)) return false;
    }
    return true;
  });

console.log(`Matched ${pharms.length} pharmacies.\n`);

// -- Evaluate gate + surface inventory --------------------------------------

const now = Date.now();
const buckets = { allow: 0, deny_pending: 0, deny_rejected: 0, deny_correction: 0, deny_expired: 0, deny_missing: 0, deny_unknown: 0 };

for (const p of pharms) {
  const licenseRequired = countries[p.countryCode]?.licenseRequired === true;
  const status = p.licenseStatus ?? "missing";

  let graceEnd = null;
  const raw = p.licenseGracePeriodEnd;
  if (raw?.toMillis) graceEnd = raw.toMillis();
  else if (typeof raw === "number") graceEnd = raw;
  else if (raw?.seconds) graceEnd = raw.seconds * 1000;
  const graceActive = graceEnd !== null && graceEnd > now;

  let allow = false;
  let reason;
  if (!licenseRequired) { allow = true; reason = "license not required for country"; }
  else if (status === "verified") { allow = true; reason = "verified"; }
  else if (status === "not_required") { allow = true; reason = "not_required flag on pharmacy"; }
  else if (graceActive) { allow = true; reason = `grace active until ${new Date(graceEnd).toISOString()}`; }
  else if (status === "pending_verification") { reason = "pending_verification"; buckets.deny_pending++; }
  else if (status === "rejected") { reason = "rejected"; buckets.deny_rejected++; }
  else if (status === "correction_needed") { reason = "correction_needed"; buckets.deny_correction++; }
  else if (status === "expired") { reason = "expired"; buckets.deny_expired++; }
  else if (status === "missing") { reason = "no licenseStatus field"; buckets.deny_missing++; }
  else { reason = `unknown status='${status}'`; buckets.deny_unknown++; }
  if (allow) buckets.allow++;

  const inv = await db.collection("pharmacy_inventory")
    .where("pharmacyId", "==", p.uid)
    .get();
  const publishedCount = inv.docs.filter((d) => d.data()?.availabilitySettings?.availableForExchange === true).length;

  const flag = allow ? "ALLOW" : "DENY ";
  const label = p.pharmacyName ?? p.email ?? p.uid.slice(0, 12);
  console.log(`  [${flag}] ${label} (${p.uid.slice(0, 8)}…)`);
  console.log(`         country=${p.countryCode ?? "?"} city=${p.cityCode ?? p.city ?? "?"} subscription=${p.subscriptionStatus ?? "?"}`);
  console.log(`         licenseStatus=${status} → ${reason}`);
  console.log(`         inventory: ${inv.size} items (${publishedCount} published)`);
  for (const doc of inv.docs) {
    const d = doc.data();
    const avail = d.availabilitySettings ?? {};
    console.log(`           - ${d.medicineName ?? "?"} qty=${d.availableQuantity ?? "?"} published=${avail.availableForExchange === true ? "YES" : "no "} max=${avail.maxExchangeQuantity ?? "?"}`);
  }
  console.log("");
}

console.log(`[audit] gate summary: ${JSON.stringify(buckets)}`);
console.log(`AUDIT_SUMMARY_JSON ${JSON.stringify({ project: PROJECT, countryFilter: COUNTRY_FILTER, cityFilter: CITY_FILTER, matched: pharms.length, buckets })}`);

process.exit(0);
