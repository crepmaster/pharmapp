#!/usr/bin/env node
/**
 * Sprint 5 phase 1 — Smoke E2E orchestrator for Scenario 4 of
 * `docs/release/SPRINT_5_E2E_CLOSURE_PLAN.md`.
 *
 * Drives the medicine-request **purchase** flow end-to-end against the
 * Firebase Emulator Suite, backend only :
 *
 *   1. Register 2 pharmacies via `createPharmacyRegistration` callable
 *      (Cameroon = no license required, trial active immediately). This
 *      callable is intentionally unauthenticated and creates Auth users
 *      itself.
 *   2. Sign in both created users against the Auth emulator.
 *   3. Credit CM-A wallet (direct Admin SDK write since `sandboxCredit`
 *      requires admin role we don't bootstrap here).
 *   4. Create an inventory item for CM-B (Admin SDK direct write).
 *   5. CM-A → `createMedicineRequest({ requestMode: 'purchase' })`.
 *   6. CM-B → `submitMedicineRequestOffer({ offerType: 'purchase' })`.
 *   7. CM-A → `acceptMedicineRequestOffer({ requestId, offerId })`.
 *   8. Assert end state :
 *      - `medicine_requests/{rid}.status === 'matched'`
 *      - `medicine_request_offers/{oid}.status === 'converted'`
 *      - `exchange_proposals/{pid}.details.type === 'purchase'`
 *      - `deliveries/{did}.proposalType === 'purchase'`
 *      - `wallets/{CM-A}.available` debited by totalPrice
 *      - `ledger` entry created
 *
 * Same 3 anti-prod guards as `seedEmulator.mjs` :
 *   1. FIRESTORE_EMULATOR_HOST set
 *   2. --project starts with "demo-"
 *   3. FIREBASE_AUTH_EMULATOR_HOST set (needed for Admin SDK custom tokens)
 *
 * Usage :
 *   # Terminal A : `firebase emulators:start --only firestore,auth,functions --project=demo-pharmapp`
 *   # Terminal B (after seedEmulator.mjs has run) :
 *   export FIRESTORE_EMULATOR_HOST=localhost:8080
 *   export FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
 *   node functions/scripts/smokeScenario4.mjs --project=demo-pharmapp
 *
 * NOT idempotent : creates fresh users + docs every run. Clear the
 * emulator state (`firebase emulators:start` without `--import`) or
 * re-seed before re-running.
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// Arg + guards
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
smokeScenario4.mjs — Sprint 5 phase 1 E2E smoke for Scenario 4
(medicine request purchase backend-only).

USAGE
  export FIRESTORE_EMULATOR_HOST=localhost:8080
  export FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
  node functions/scripts/smokeScenario4.mjs --project=demo-pharmapp

OPTIONS
  --project=<id>   Required. MUST start with "demo-".
  --help, -h       Print this help and exit.

REQUIRES (in order)
  1. firebase emulators:start --only firestore,auth,functions --project=demo-pharmapp
  2. node functions/scripts/seedEmulator.mjs --project=demo-pharmapp

EXIT CODES
  0  all assertions passed
  1  scenario failed mid-flight
  2  guard failure
`);
  process.exit(0);
}

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("❌ GUARD 1 FAILED: FIRESTORE_EMULATOR_HOST not set.");
  process.exit(2);
}
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error("❌ GUARD 3 FAILED: FIREBASE_AUTH_EMULATOR_HOST not set.");
  process.exit(2);
}
const projectId = args.project ?? null;
if (!projectId || !projectId.startsWith("demo-")) {
  console.error(`❌ GUARD 2 FAILED: --project must start with "demo-" (got ${projectId}).`);
  process.exit(2);
}

console.log(`\n🟢 Guards passed. Project=${projectId}`);
console.log(`   Firestore=${process.env.FIRESTORE_EMULATOR_HOST}`);
console.log(`   Auth=${process.env.FIREBASE_AUTH_EMULATOR_HOST}\n`);

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

initializeApp({ projectId });
const db = getFirestore();

const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST ?? "127.0.0.1:5001";
const REGION = "europe-west1";
const callableUrl = (name) =>
  `http://${FUNCTIONS_HOST}/${projectId}/${REGION}/${name}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function signInWithEmailPassword(email, password) {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const url = `http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`signInWithPassword failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  return json.idToken;
}

async function callCallable(name, idToken, data) {
  const headers = { "Content-Type": "application/json" };
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }
  const res = await fetch(callableUrl(name), {
    method: "POST",
    headers,
    body: JSON.stringify({ data }),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(
      `callable ${name} failed (${res.status}): ${JSON.stringify(json)}`
    );
  }
  return json.result;
}

function expect(label, actual, predicate, expected) {
  const ok = predicate(actual);
  const tag = ok ? "✅" : "❌";
  console.log(`   ${tag} ${label}`);
  if (!ok) {
    console.error(`      expected: ${expected}`);
    console.error(`      actual:   ${JSON.stringify(actual)}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

async function main() {
  // -------------------------------------------------------------------------
  // Step 1 — Register both pharmacies via createPharmacyRegistration callable
  // -------------------------------------------------------------------------
  console.log("📦 Step 1 — Register both pharmacies (Cameroon, no license required)");
  const runId = Date.now();
  const password = "test1234";
  const cmAEmail = `cm-a-${runId}@demo.test`;
  const cmBEmail = `cm-b-${runId}@demo.test`;

  const registerPayload = (label) => ({
    email: label === "Pharmacy CM-A" ? cmAEmail : cmBEmail,
    password,
    profileData: {
      pharmacyName: label,
      address: `${label} address`,
      phoneNumber: "+237677000056",
      countryCode: "CM",
      cityCode: "douala",
      city: "Douala",
      currency: "XAF",
    },
  });

  const regA = await callCallable(
    "createPharmacyRegistration",
    null,
    registerPayload("Pharmacy CM-A")
  );
  const regB = await callCallable(
    "createPharmacyRegistration",
    null,
    registerPayload("Pharmacy CM-B")
  );
  const cmAUid = regA.uid;
  const cmBUid = regB.uid;
  console.log(`   CM-A registered: ${JSON.stringify(regA)}`);
  console.log(`   CM-B registered: ${JSON.stringify(regB)}\n`);

  // -------------------------------------------------------------------------
  // Step 2 — Sign in both created users against Auth emulator
  // -------------------------------------------------------------------------
  console.log("📦 Step 2 — Sign in both created users");
  const cmAToken = await signInWithEmailPassword(cmAEmail, password);
  const cmBToken = await signInWithEmailPassword(cmBEmail, password);
  console.log(`   CM-A uid = ${cmAUid}`);
  console.log(`   CM-B uid = ${cmBUid}\n`);

  // -------------------------------------------------------------------------
  // Step 3 — Credit CM-A wallet directly (Admin SDK bypass)
  // -------------------------------------------------------------------------
  console.log("📦 Step 3 — Credit CM-A wallet to 100000 XAF");
  await db.collection("wallets").doc(cmAUid).set(
    {
      available: 100000,
      held: 0,
      deducted: 0,
      currency: "XAF",
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  console.log("   ✅ wallet seeded\n");

  // -------------------------------------------------------------------------
  // Step 4 — Create inventory item for CM-B (Admin SDK direct)
  // -------------------------------------------------------------------------
  console.log("📦 Step 4 — Create CM-B inventory item (medicine X, 50 units)");
  const invRef = db.collection("pharmacy_inventory").doc();
  await invRef.set({
    pharmacyId: cmBUid,
    medicineId: "paracetamol-500",
    medicineName: "Paracetamol",
    medicineDosage: "500mg",
    medicineForm: "tablet",
    availableQuantity: 50,
    packaging: "box",
    batch: { lotNumber: "LOT-SMOKE-001", expirationDate: null },
    availabilitySettings: {
      availableForExchange: true,
      minExchangeQuantity: 1,
      maxExchangeQuantity: 50,
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log(`   ✅ inventory item created: ${invRef.id}\n`);

  // -------------------------------------------------------------------------
  // Step 5 — CM-A creates the medicine request
  // -------------------------------------------------------------------------
  console.log("📦 Step 5 — CM-A → createMedicineRequest (purchase, qty=10)");
  const reqResult = await callCallable("createMedicineRequest", cmAToken, {
    medicineId: "paracetamol-500",
    medicineSnapshot: {
      name: "Paracetamol",
      genericName: "Paracetamol",
      strength: "500mg",
      form: "tablet",
    },
    requestedQuantity: 10,
    requestMode: "purchase",
    currencyCode: "XAF",
  });
  const requestId = reqResult.requestId;
  console.log(`   ✅ request created: ${requestId}\n`);

  // -------------------------------------------------------------------------
  // Step 6 — CM-B submits a purchase offer
  // -------------------------------------------------------------------------
  console.log("📦 Step 6 — CM-B → submitMedicineRequestOffer (purchase, unitPrice=500, qty=10)");
  const offerResult = await callCallable("submitMedicineRequestOffer", cmBToken, {
    requestId,
    inventoryItemId: invRef.id,
    offeredQuantity: 10,
    unitPrice: 500,
    offerType: "purchase",
  });
  const offerId = offerResult.offerId;
  console.log(`   ✅ offer created: ${offerId}\n`);

  // -------------------------------------------------------------------------
  // Step 7 — CM-A accepts the offer (purchase bridge)
  // -------------------------------------------------------------------------
  console.log("📦 Step 7 — CM-A → acceptMedicineRequestOffer");
  const acceptResult = await callCallable("acceptMedicineRequestOffer", cmAToken, {
    requestId,
    offerId,
  });
  const proposalId = acceptResult.proposalId;
  const deliveryId = acceptResult.deliveryId;
  console.log(`   ✅ proposalId  = ${proposalId}`);
  console.log(`   ✅ deliveryId  = ${deliveryId}\n`);

  // -------------------------------------------------------------------------
  // Step 8 — Assertions
  // -------------------------------------------------------------------------
  console.log("🔍 Step 8 — Verifying end state\n");

  const reqDoc = (await db.collection("medicine_requests").doc(requestId).get()).data();
  expect(
    "medicine_requests/{rid}.status === 'matched'",
    reqDoc.status,
    (v) => v === "matched",
    "matched"
  );
  expect(
    "medicine_requests/{rid}.selectedOfferId === offerId",
    reqDoc.selectedOfferId,
    (v) => v === offerId,
    offerId
  );

  const offerDoc = (
    await db.collection("medicine_request_offers").doc(offerId).get()
  ).data();
  expect(
    "medicine_request_offers/{oid}.status === 'converted'",
    offerDoc.status,
    (v) => v === "converted",
    "converted"
  );
  expect(
    "medicine_request_offers/{oid}.linkedProposalId === proposalId",
    offerDoc.linkedProposalId,
    (v) => v === proposalId,
    proposalId
  );

  const proposalDoc = (
    await db.collection("exchange_proposals").doc(proposalId).get()
  ).data();
  expect(
    "exchange_proposals/{pid}.details.type === 'purchase'",
    proposalDoc.details?.type,
    (v) => v === "purchase",
    "purchase"
  );
  expect(
    "exchange_proposals/{pid}.status === 'accepted'",
    proposalDoc.status,
    (v) => v === "accepted",
    "accepted"
  );
  expect(
    "exchange_proposals/{pid}.reservations.walletReserved === 5000",
    proposalDoc.reservations?.walletReserved,
    (v) => v === 5000,
    5000
  );
  expect(
    "exchange_proposals/{pid}.fromPharmacyId === CM-A",
    proposalDoc.fromPharmacyId,
    (v) => v === cmAUid,
    cmAUid
  );
  expect(
    "exchange_proposals/{pid}.toPharmacyId === CM-B",
    proposalDoc.toPharmacyId,
    (v) => v === cmBUid,
    cmBUid
  );

  const deliveryDoc = (
    await db.collection("deliveries").doc(deliveryId).get()
  ).data();
  expect(
    "deliveries/{did}.proposalType === 'purchase'",
    deliveryDoc.proposalType,
    (v) => v === "purchase",
    "purchase"
  );
  expect(
    "deliveries/{did}.status === 'pending'",
    deliveryDoc.status,
    (v) => v === "pending",
    "pending"
  );
  expect(
    "deliveries/{did}.totalPrice === 5000",
    deliveryDoc.totalPrice,
    (v) => v === 5000,
    5000
  );
  expect(
    "deliveries/{did}.courierFee === Math.round(5000*0.12) = 600",
    deliveryDoc.courierFee,
    (v) => v === 600,
    600
  );

  const walletDoc = (await db.collection("wallets").doc(cmAUid).get()).data();
  expect(
    "wallets/{CM-A}.available === 100000 - 5000 = 95000",
    walletDoc.available,
    (v) => v === 95000,
    95000
  );
  expect(
    "wallets/{CM-A}.deducted === 5000",
    walletDoc.deducted,
    (v) => v === 5000,
    5000
  );

  const ledgerSnap = await db
    .collection("ledger")
    .where("proposalId", "==", proposalId)
    .get();
  expect(
    "ledger has entry for proposalId",
    ledgerSnap.size,
    (v) => v >= 1,
    ">=1"
  );

  if (process.exitCode === 1) {
    console.log("\n💥 Scenario 4 FAILED — see assertions above");
    process.exit(1);
  }
  console.log("\n🎉 Scenario 4 PASSED — all 13 assertions ✅");
  console.log(`   request   = ${requestId}`);
  console.log(`   offer     = ${offerId}`);
  console.log(`   proposal  = ${proposalId}`);
  console.log(`   delivery  = ${deliveryId}`);
}

main().catch((e) => {
  console.error("\n💥 Smoke scenario crashed:", e?.message ?? e);
  console.error(e?.stack);
  process.exit(1);
});
