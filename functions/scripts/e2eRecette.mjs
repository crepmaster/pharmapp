#!/usr/bin/env node
/**
 * e2eRecette.mjs — Sprint 5 phase 1 E2E recette driver (EMULATOR-ONLY).
 *
 * Drives the REAL callables over the functions emulator HTTP endpoint with
 * genuine Auth-emulator ID tokens (NOT Admin SDK shortcuts) so each scenario
 * exercises the production code paths : license gate, strict canonical mode,
 * the requestProposalBridge transaction, lock invariants. Firestore reads
 * AND the S7/S8 setup writes go through firebase-admin (sibling node_modules).
 *
 * 🔒 GUARD : this driver WRITES (S7 creates a pharmacy doc, S8 debits a
 * wallet) so it refuses to run unless `FIRESTORE_EMULATOR_HOST` is set —
 * without it, firebase-admin would target PRODUCTION. The functions/auth
 * endpoints are hardcoded to 127.0.0.1 for the same reason.
 *
 * Prerequisites (see docs/release/SPRINT_5_E2E_CLOSURE_PLAN.md) :
 *   1. firebase emulators:start --only auth,functions,firestore --project=demo-pharmapp
 *   2. node functions/scripts/seedEmulator.mjs   (system_config)
 *   3. node functions/scripts/seedInventory.mjs  (accra1 seller + accra2 buyer)
 *      with the CORRECT auth UIDs (verify against the Auth emulator export).
 *
 * Usage :
 *   $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
 *   node functions/scripts/e2eRecette.mjs <s4|s5|s6|s7|s8|all>
 *
 * Test accounts (emulator seed) : accra1@gmail.com (seller, verified),
 * accra2@gmail.com (buyer, verified), accra3@gmail.com (S7 unverified,
 * created on demand). Password : Test1234!.
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "❌ GUARD: FIRESTORE_EMULATOR_HOST is not set. This driver writes data " +
    "(S7/S8) and must target an emulator, never prod.\n" +
    '   Set it first: $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"'
  );
  process.exit(2);
}

const PROJECT = "demo-pharmapp";
const REGION = "europe-west1";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key";
const FN = (name) => `http://127.0.0.1:5001/${PROJECT}/${REGION}/${name}`;

const ACCRA1 = "accra1@gmail.com"; // seller   TBcNI0rxlIAlZRPJ89AgM80fC81T
const ACCRA2 = "accra2@gmail.com"; // buyer    95ba8T07FFC6wIsLefocNCtohcJk
const ACCRA3 = "accra3@gmail.com"; // non-verified test pharmacy (S7)
const PASSWORD = "Test1234!";
const SIGNUP = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key";

initializeApp({ projectId: PROJECT });
const db = getFirestore();

const tokenCache = {};
async function signIn(email) {
  if (tokenCache[email]) return tokenCache[email];
  const res = await fetch(AUTH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const j = await res.json();
  if (!j.idToken) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(j)}`);
  tokenCache[email] = { idToken: j.idToken, uid: j.localId };
  return tokenCache[email];
}

/** Create the auth user if absent, then sign in. Returns {idToken, uid}. */
async function signUpOrIn(email) {
  const res = await fetch(SIGNUP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const j = await res.json();
  if (j.idToken) { tokenCache[email] = { idToken: j.idToken, uid: j.localId }; return tokenCache[email]; }
  // EMAIL_EXISTS → fall back to sign-in
  return signIn(email);
}

/** Call a callable. Returns { ok, result, error, httpStatus }. */
async function callAs(email, fnName, data) {
  const { idToken } = await signIn(email);
  const res = await fetch(FN(fnName), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data }),
  });
  const j = await res.json().catch(() => ({}));
  if (res.ok && j.result !== undefined) {
    return { ok: true, result: j.result, httpStatus: res.status };
  }
  return { ok: false, error: j.error ?? j, httpStatus: res.status };
}

function log(...a) { console.log(...a); }
function hr(t) { log(`\n${"=".repeat(4)} ${t} ${"=".repeat(Math.max(2, 50 - t.length))}`); }

let PASS = 0, FAIL = 0;
function assert(cond, msg) {
  if (cond) { PASS++; log(`   ✅ ${msg}`); }
  else { FAIL++; log(`   ❌ ${msg}`); }
}

async function pharm(uid) { return (await db.collection("pharmacies").doc(uid).get()).data() || {}; }
async function wallet(uid) { return (await db.collection("wallets").doc(uid).get()).data() || {}; }
async function inv(id) { return (await db.collection("pharmacy_inventory").doc(id).get()).data() || {}; }
async function reqDoc(id) { return (await db.collection("medicine_requests").doc(id).get()).data() || {}; }
async function offerDoc(id) { return (await db.collection("medicine_request_offers").doc(id).get()).data() || {}; }
async function proposalDoc(id) { return (await db.collection("exchange_proposals").doc(id).get()).data() || {}; }
async function deliveryDoc(id) { return (await db.collection("deliveries").doc(id).get()).data() || {}; }

// ---------------------------------------------------------------------------

async function s4_purchase() {
  hr("S4 — medicine_request PURCHASE happy path");
  const buyer = await signIn(ACCRA2);
  const seller = await signIn(ACCRA1);
  const SELLER_ITEM = `seedS5-${seller.uid.slice(0, 8)}-paracetamol-syrup-120mg-5ml`;
  const QTY = 10, UNIT = 50; // GHS

  // Wallet baseline
  const w0 = await wallet(buyer.uid);
  const inv0 = await inv(SELLER_ITEM);
  log(`   baseline: buyer wallet avail=${w0.available} ${w0.currency}; seller item avail=${inv0.availableQuantity} resv=${inv0.reservedQuantity}`);

  // 1) Create request (buyer)
  const cr = await callAs(ACCRA2, "createMedicineRequest", {
    medicineId: "paracetamol-syrup-120mg-5ml",
    medicineSnapshot: { medicineName: "Paracetamol", dosage: "120mg/5ml", form: "Syrup" },
    requestedQuantity: QTY,
    requestMode: "purchase",
    currencyCode: "GHS",
    notes: "S4 recette",
  });
  assert(cr.ok, `createMedicineRequest → ${cr.ok ? cr.result.requestId : JSON.stringify(cr.error)}`);
  if (!cr.ok) return;
  const requestId = cr.result.requestId;

  // 2) Submit purchase offer (seller)
  const so = await callAs(ACCRA1, "submitMedicineRequestOffer", {
    requestId,
    inventoryItemId: SELLER_ITEM,
    offeredQuantity: QTY,
    unitPrice: UNIT,
    offerType: "purchase",
  });
  assert(so.ok, `submitMedicineRequestOffer → ${so.ok ? so.result.offerId : JSON.stringify(so.error)}`);
  if (!so.ok) return;
  const offerId = so.result.offerId;
  const expectedTotal = QTY * UNIT;

  // 3) Accept offer (buyer)
  const ac = await callAs(ACCRA2, "acceptMedicineRequestOffer", { requestId, offerId });
  assert(ac.ok, `acceptMedicineRequestOffer → ${ac.ok ? "proposal=" + ac.result.proposalId : JSON.stringify(ac.error)}`);
  if (!ac.ok) return;
  const { proposalId, deliveryId } = ac.result;

  // Assertions
  const w1 = await wallet(buyer.uid);
  const inv1 = await inv(SELLER_ITEM);
  const r1 = await reqDoc(requestId);
  const o1 = await offerDoc(offerId);
  const p1 = await proposalDoc(proposalId);
  const d1 = await deliveryDoc(deliveryId);

  assert(w1.available === w0.available - expectedTotal, `buyer wallet available ${w0.available} → ${w1.available} (−${expectedTotal})`);
  assert((w1.deducted || 0) === (w0.deducted || 0) + expectedTotal, `buyer wallet deducted +${expectedTotal} (=${w1.deducted})`);
  assert(inv1.availableQuantity === inv0.availableQuantity, `seller inventory UNCHANGED at accept (avail=${inv1.availableQuantity}) [lock #5 purchase]`);
  assert(r1.status === "matched" && r1.selectedOfferId === offerId, `request status=matched, selectedOfferId set`);
  assert(o1.status === "converted" && o1.linkedProposalId === proposalId, `offer status=converted, linkedProposalId set`);
  assert(p1.status === "accepted" && p1.details?.type === "purchase", `proposal status=accepted, details.type=purchase`);
  assert(p1.details?.totalPrice === expectedTotal, `proposal totalPrice=${p1.details?.totalPrice}`);
  assert(d1.status === "pending", `delivery status=pending`);
  assert(d1.courierFee === Math.round(expectedTotal * 0.12), `delivery courierFee=${d1.courierFee} (12% of ${expectedTotal})`);

  log(`\n   refs: request=${requestId} offer=${offerId} proposal=${proposalId} delivery=${deliveryId}`);
  return { requestId, offerId, proposalId, deliveryId };
}

// ---------------------------------------------------------------------------

function expectedExchangeFee(systemConfigData, countryCode, cityCode) {
  const cities = systemConfigData?.citiesByCountry || {};
  const c = cities[countryCode]?.[cityCode];
  const baseFee = Number(c?.deliveryFee);
  const exFee = Number(c?.exchangeFee);
  let fee = 0;
  if (Number.isFinite(exFee) && exFee > 0) fee = Math.round(exFee);
  else if (Number.isFinite(baseFee) && baseFee > 0) fee = Math.round(baseFee * 1.2);
  return fee; // totalPrice=0 for barter → no 12% fallback
}

async function s5_exchange() {
  hr("S5 — medicine_request EXCHANGE (barter) happy path");
  const buyer = await signIn(ACCRA2);   // requester
  const seller = await signIn(ACCRA1);
  const SELLER_ITEM = `seedS5-${seller.uid.slice(0, 8)}-amoxicillin-500mg`;     // item A (seller gives)
  const BUYER_ITEM = `seedS5-${buyer.uid.slice(0, 8)}-ibuprofen-400mg`;          // item B (requester gives back)
  const REQ_QTY = 5, OFFER_QTY = 5, EXCHANGE_QTY = 5;

  const cfg = (await db.collection("system_config").doc("main").get()).data() || {};
  const expFee = expectedExchangeFee(cfg, "GH", "accra");

  // baselines
  const bw0 = await wallet(buyer.uid), sw0 = await wallet(seller.uid);
  const a0 = await inv(SELLER_ITEM), b0 = await inv(BUYER_ITEM);
  log(`   baseline: sellerItemA avail=${a0.availableQuantity} resv=${a0.reservedQuantity||0}; buyerItemB avail=${b0.availableQuantity} resv=${b0.reservedQuantity||0}`);
  log(`   baseline wallets: buyer avail=${bw0.available} ; seller avail=${sw0.available}; expected exchange courierFee=${expFee}`);

  // 1) create exchange request (buyer wants amoxicillin)
  const cr = await callAs(ACCRA2, "createMedicineRequest", {
    medicineId: "amoxicillin-500mg",
    medicineSnapshot: { medicineName: "Amoxicillin", dosage: "500mg", form: "Capsule" },
    requestedQuantity: REQ_QTY,
    requestMode: "exchange",
    currencyCode: "GHS",
    notes: "S5 recette barter",
  });
  assert(cr.ok, `createMedicineRequest(exchange) → ${cr.ok ? cr.result.requestId : JSON.stringify(cr.error)}`);
  if (!cr.ok) return;
  const requestId = cr.result.requestId;

  // 2) seller submits exchange offer (wants ibuprofen back)
  const so = await callAs(ACCRA1, "submitMedicineRequestOffer", {
    requestId,
    inventoryItemId: SELLER_ITEM,
    offeredQuantity: OFFER_QTY,
    offerType: "exchange",
    exchangeItem: { medicineId: "ibuprofen-400mg", medicineName: "Ibuprofen", dosage: "400mg", form: "Tablet", quantity: EXCHANGE_QTY },
  });
  assert(so.ok, `submitMedicineRequestOffer(exchange) → ${so.ok ? so.result.offerId : JSON.stringify(so.error)}`);
  if (!so.ok) return;
  const offerId = so.result.offerId;

  // 3) buyer accepts, giving back their ibuprofen item B
  const ac = await callAs(ACCRA2, "acceptMedicineRequestOffer", { requestId, offerId, exchangeInventoryItemId: BUYER_ITEM });
  assert(ac.ok, `acceptMedicineRequestOffer(exchange) → ${ac.ok ? "proposal=" + ac.result.proposalId : JSON.stringify(ac.error)}`);
  if (!ac.ok) return;
  const { proposalId, deliveryId } = ac.result;

  // assertions
  const bw1 = await wallet(buyer.uid), sw1 = await wallet(seller.uid);
  const a1 = await inv(SELLER_ITEM), b1 = await inv(BUYER_ITEM);
  const r1 = await reqDoc(requestId), o1 = await offerDoc(offerId);
  const p1 = await proposalDoc(proposalId), d1 = await deliveryDoc(deliveryId);

  assert(b1.availableQuantity === b0.availableQuantity - EXCHANGE_QTY, `requester item B available ${b0.availableQuantity} → ${b1.availableQuantity} (−${EXCHANGE_QTY})`);
  assert((b1.reservedQuantity||0) === (b0.reservedQuantity||0) + EXCHANGE_QTY, `requester item B reserved +${EXCHANGE_QTY} (=${b1.reservedQuantity})`);
  assert(a1.availableQuantity === a0.availableQuantity && (a1.reservedQuantity||0) === (a0.reservedQuantity||0), `seller item A UNCHANGED at accept (avail=${a1.availableQuantity} resv=${a1.reservedQuantity||0}) [lock #5: single hold]`);
  assert(bw1.available === bw0.available && (bw1.deducted||0) === (bw0.deducted||0), `buyer wallet UNCHANGED [lock #1 no soulte]`);
  assert(sw1.available === sw0.available, `seller wallet UNCHANGED [lock #1 no soulte]`);
  assert(p1.status === "accepted" && p1.details?.type === "exchange", `proposal status=accepted, details.type=exchange`);
  assert(p1.details?.exchangeMedicineId === "ibuprofen-400mg" && p1.details?.exchangeQuantity === EXCHANGE_QTY, `proposal exchangeMedicineId/Quantity correct`);
  assert(d1.status === "pending", `delivery status=pending`);
  assert(d1.courierFee === expFee, `delivery courierFee=${d1.courierFee} (expected ${expFee})`);
  assert(r1.status === "matched" && o1.status === "converted", `request=matched, offer=converted`);

  log(`\n   refs: request=${requestId} offer=${offerId} proposal=${proposalId} delivery=${deliveryId}`);
  return { requestId, offerId, proposalId, deliveryId };
}

// ---------------------------------------------------------------------------

function assertRejected(res, expectedStatus, label) {
  const got = res.ok ? "OK(no rejection)" : (res.error?.status || res.error?.message || JSON.stringify(res.error));
  assert(!res.ok && res.error?.status === expectedStatus, `${label} → rejected ${expectedStatus} (got: ${got})`);
}

async function s6_parity() {
  hr("S6 — parity matrix (strict cross-mode rejection)");
  const seller = await signIn(ACCRA1);
  const AMOX = `seedS5-${seller.uid.slice(0, 8)}-amoxicillin-500mg`;

  // Base requests (stay open — all offers below are rejected)
  const pReq = await callAs(ACCRA2, "createMedicineRequest", {
    medicineId: "amoxicillin-500mg", medicineSnapshot: {}, requestedQuantity: 3,
    requestMode: "purchase", currencyCode: "GHS",
  });
  assert(pReq.ok, `setup purchase request → ${pReq.ok ? pReq.result.requestId : JSON.stringify(pReq.error)}`);
  const xReq = await callAs(ACCRA2, "createMedicineRequest", {
    medicineId: "amoxicillin-500mg", medicineSnapshot: {}, requestedQuantity: 3,
    requestMode: "exchange", currencyCode: "GHS",
  });
  assert(xReq.ok, `setup exchange request → ${xReq.ok ? xReq.result.requestId : JSON.stringify(xReq.error)}`);
  if (!pReq.ok || !xReq.ok) return;
  const pid = pReq.result.requestId, xid = xReq.result.requestId;

  const exItem = { medicineId: "ibuprofen-400mg", medicineName: "Ibuprofen", dosage: "400mg", form: "Tablet", quantity: 3 };

  // 1) purchase request + exchange offer → parity mismatch
  assertRejected(
    await callAs(ACCRA1, "submitMedicineRequestOffer", { requestId: pid, inventoryItemId: AMOX, offeredQuantity: 3, offerType: "exchange", exchangeItem: exItem }),
    "FAILED_PRECONDITION", "purchase request + exchange offer");

  // 2) exchange request + purchase offer → parity mismatch
  assertRejected(
    await callAs(ACCRA1, "submitMedicineRequestOffer", { requestId: xid, inventoryItemId: AMOX, offeredQuantity: 3, offerType: "purchase", unitPrice: 50 }),
    "FAILED_PRECONDITION", "exchange request + purchase offer");

  // 3) createMedicineRequest requestMode="either" → canonical mode reject
  assertRejected(
    await callAs(ACCRA2, "createMedicineRequest", { medicineId: "amoxicillin-500mg", medicineSnapshot: {}, requestedQuantity: 3, requestMode: "either", currencyCode: "GHS" }),
    "INVALID_ARGUMENT", 'createMedicineRequest requestMode="either"');

  // 4) purchase offer carrying exchangeItem → invalid
  assertRejected(
    await callAs(ACCRA1, "submitMedicineRequestOffer", { requestId: pid, inventoryItemId: AMOX, offeredQuantity: 3, offerType: "purchase", unitPrice: 50, exchangeItem: exItem }),
    "INVALID_ARGUMENT", "purchase offer carrying exchangeItem");

  // 5) exchange offer missing exchangeItem → invalid
  assertRejected(
    await callAs(ACCRA1, "submitMedicineRequestOffer", { requestId: xid, inventoryItemId: AMOX, offeredQuantity: 3, offerType: "exchange" }),
    "INVALID_ARGUMENT", "exchange offer missing exchangeItem");

  // 6) purchase offer missing unitPrice → invalid
  assertRejected(
    await callAs(ACCRA1, "submitMedicineRequestOffer", { requestId: pid, inventoryItemId: AMOX, offeredQuantity: 3, offerType: "purchase" }),
    "INVALID_ARGUMENT", "purchase offer missing unitPrice");
}

async function s7_failclosed() {
  hr("S7 — fail-closed: non-verified pharmacy blocked on 5 callables");
  // Setup: create accra3 auth user + pharmacy doc in pending_verification.
  const a3 = await signUpOrIn(ACCRA3);
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.collection("pharmacies").doc(a3.uid).set({
    pharmacyName: "Accra 3 (unverified)",
    countryCode: "GH",
    cityCode: "accra",
    city: "accra",
    subscriptionStatus: "trial",
    subscriptionEndDate: future,
    licenseStatus: "pending_verification",
    licenseCountryCode: "GH",
  }, { merge: true });
  await db.collection("wallets").doc(a3.uid).set({ available: 100000, held: 0, deducted: 0, currency: "GHS" }, { merge: true });
  const check = await db.collection("pharmacies").doc(a3.uid).get();
  log(`   accra3 uid=${a3.uid.slice(0,10)}… licenseStatus=${check.data().licenseStatus}`);

  const fp = "FAILED_PRECONDITION";
  assertRejected(await callAs(ACCRA3, "createMedicineRequest", { medicineId: "amoxicillin-500mg", medicineSnapshot: {}, requestedQuantity: 1, requestMode: "purchase", currencyCode: "GHS" }), fp, "createMedicineRequest (gate)");
  assertRejected(await callAs(ACCRA3, "submitMedicineRequestOffer", { requestId: "x", inventoryItemId: "y", offeredQuantity: 1, offerType: "purchase", unitPrice: 50 }), fp, "submitMedicineRequestOffer (gate)");
  assertRejected(await callAs(ACCRA3, "acceptMedicineRequestOffer", { requestId: "x", offerId: "y" }), fp, "acceptMedicineRequestOffer (gate)");
  assertRejected(await callAs(ACCRA3, "createExchangeProposal", { toPharmacyId: "z", inventoryItemId: "y", quantity: 1 }), fp, "createExchangeProposal (gate)");
  assertRejected(await callAs(ACCRA3, "acceptExchangeProposal", { proposalId: "x" }), fp, "acceptExchangeProposal (gate)");

  // Control: a verified pharmacy (accra2) is NOT blocked by the gate on createMedicineRequest
  const ctrl = await callAs(ACCRA2, "createMedicineRequest", { medicineId: "amoxicillin-500mg", medicineSnapshot: {}, requestedQuantity: 1, requestMode: "purchase", currencyCode: "GHS" });
  assert(ctrl.ok, `control: verified accra2 NOT gate-blocked (createMedicineRequest ok=${ctrl.ok})`);
}

async function s8_withdrawal() {
  hr("S8 — withdrawal happy path + idempotency + MSISDN validation");
  const buyer = await signIn(ACCRA2); // GH/GHS pharmacy
  const w0 = await wallet(buyer.uid);
  log(`   baseline accra2 wallet: available=${w0.available} held=${w0.held||0} ${w0.currency}`);

  const AMT = 20000; // 200 GHS minor (>= min 10000)
  const GOOD_MSISDN = "+233241234567"; // MTN GH (24…) → valid
  const WRONG_MSISDN = "+233201234567"; // Vodafone GH (20…) → invalid for mtn_gh
  const reqId = randomUUID();

  // 1) Happy path
  const r1 = await callAs(ACCRA2, "createWithdrawalRequest", {
    amountMinor: AMT, currencyCode: "GHS", providerId: "mtn_momo_gh",
    msisdn: GOOD_MSISDN, ownerType: "pharmacy", clientRequestId: reqId,
  });
  assert(r1.ok, `createWithdrawalRequest happy → ${r1.ok ? "status=" + r1.result.status + " requestId=" + r1.result.requestId : JSON.stringify(r1.error)}`);
  if (!r1.ok) return;
  assert(r1.result.status === "processing", `status=processing (sandbox_stub synchronous)`);
  assert(r1.result.msisdn === "233241234567", `msisdn normalized to ${r1.result.msisdn}`);
  const debited = r1.result.walletUnitsDebited;

  const w1 = await wallet(buyer.uid);
  assert(w1.available === w0.available - debited, `wallet available ${w0.available} → ${w1.available} (−${debited})`);
  assert((w1.held || 0) === (w0.held || 0) + debited, `wallet held +${debited} (=${w1.held})`);

  // 2) Idempotent replay (same clientRequestId) → same requestId, no extra debit
  const r2 = await callAs(ACCRA2, "createWithdrawalRequest", {
    amountMinor: AMT, currencyCode: "GHS", providerId: "mtn_momo_gh",
    msisdn: GOOD_MSISDN, ownerType: "pharmacy", clientRequestId: reqId,
  });
  assert(r2.ok && r2.result.requestId === r1.result.requestId, `idempotent replay returns same requestId`);
  const w2 = await wallet(buyer.uid);
  assert(w2.available === w1.available, `idempotent replay did NOT debit again (available stayed ${w2.available})`);

  // 3) MSISDN wrong operator prefix → invalid-argument
  assertRejected(await callAs(ACCRA2, "createWithdrawalRequest", {
    amountMinor: AMT, currencyCode: "GHS", providerId: "mtn_momo_gh",
    msisdn: WRONG_MSISDN, ownerType: "pharmacy", clientRequestId: randomUUID(),
  }), "INVALID_ARGUMENT", "MSISDN wrong operator (Vodafone prefix on mtn_gh)");

  // 4) Below minimum (min=10000 minor) → failed-precondition
  assertRejected(await callAs(ACCRA2, "createWithdrawalRequest", {
    amountMinor: 5000, currencyCode: "GHS", providerId: "mtn_momo_gh",
    msisdn: GOOD_MSISDN, ownerType: "pharmacy", clientRequestId: randomUUID(),
  }), "FAILED_PRECONDITION", "amount below minimum (5000 < 10000)");

  log(`\n   refs: withdrawal_request=${r1.result.requestId}`);
}

// ---------------------------------------------------------------------------

const scenario = process.argv[2];
(async () => {
  try {
    if (scenario === "s4") await s4_purchase();
    else if (scenario === "s5") await s5_exchange();
    else if (scenario === "s6") await s6_parity();
    else if (scenario === "s7") await s7_failclosed();
    else if (scenario === "s8") await s8_withdrawal();
    else if (scenario === "all") { await s4_purchase(); await s5_exchange(); await s6_parity(); await s7_failclosed(); await s8_withdrawal(); }
    else { log(`Unknown scenario '${scenario}'. Known: s4, s5, s6, s7, s8, all`); process.exit(2); }
    log(`\n${"-".repeat(50)}\nRESULT: ${PASS} passed, ${FAIL} failed`);
    process.exit(FAIL === 0 ? 0 : 1);
  } catch (e) {
    log("\n💥 driver error:", e?.stack || e?.message || e);
    process.exit(1);
  }
})();
