#!/usr/bin/env node
/**
 * e2eRecetteStaging.mjs — Sprint 5 phase 2 E2E recette on REAL Firebase
 * staging (mediexchange-staging). Real-Firestore sibling of e2eRecette.mjs.
 *
 * Drives the deployed callables over HTTPS with real ID tokens obtained via
 * the Identity Toolkit `signInWithPassword` REST endpoint (Email/Password
 * provider must be enabled on the project — see setup notes below). The test
 * pharmacies get their password from `createPharmacyRegistration`; the admin
 * user is created via Admin SDK with the same password. Firestore reads + the
 * inventory/wallet setup writes use the Admin SDK with Application Default
 * Credentials (ADC).
 *
 * One-time project setup (Auth must be initialized or createUser/signIn fail
 * with auth/configuration-not-found):
 *   TOKEN=$(gcloud auth print-access-token)
 *   curl -X POST "https://identitytoolkit.googleapis.com/v2/projects/<proj>/identityPlatform:initializeAuth" \
 *     -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: <proj>" -d '{}'
 *   curl -X PATCH "https://identitytoolkit.googleapis.com/admin/v2/projects/<proj>/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired" \
 *     -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: <proj>" \
 *     -H "Content-Type: application/json" -d '{"signIn":{"email":{"enabled":true,"passwordRequired":true}}}'
 *
 * Covers the full 8-scenario plan (docs/release/SPRINT_5_E2E_CLOSURE_PLAN.md):
 *   S1 Ghana registration WITHOUT license → LICENSE_REQUIRED + anti-orphan
 *   S2 Ghana registration WITH license → pending_verification + trial gated
 *   S3 admin verify → verified + trial started
 *   S4 medicine_request purchase happy path
 *   S5 medicine_request exchange (barter) — lock #1/#5/#6
 *   S6 parity matrix (strict cross-mode rejection)
 *   S7 fail-closed: unverified pharmacy blocked on 5 callables
 *   S8 withdrawal happy path + idempotency + MSISDN validation
 *
 * 🔒 GUARDS: requires STAGING_WEB_API_KEY env; refuses to run if
 * FIRESTORE_EMULATOR_HOST is set (this targets REAL Firestore). Uses unique
 * per-run email suffixes so re-runs don't collide on EMAIL_EXISTS.
 *
 * Usage:
 *   $env:STAGING_WEB_API_KEY="<web api key>"
 *   node functions/scripts/e2eRecetteStaging.mjs
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { randomUUID } from "node:crypto";

const PROJECT = "mediexchange-staging";
const REGION = "europe-west1";
const FN = (name) => `https://${REGION}-${PROJECT}.cloudfunctions.net/${name}`;
const API_KEY = process.env.STAGING_WEB_API_KEY;
const SIGNIN_PWD = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("❌ GUARD: FIRESTORE_EMULATOR_HOST is set — this driver targets REAL staging. Unset it.");
  process.exit(2);
}
if (!API_KEY) {
  console.error("❌ GUARD: STAGING_WEB_API_KEY is not set. Get it via `firebase apps:sdkconfig web --project=mediexchange-staging`.");
  process.exit(2);
}

initializeApp({ projectId: PROJECT });
const db = getFirestore();
const adminAuth = getAuth();

const RUN = Date.now().toString(36);
const PWD = "Test1234!";

// ---- auth: sign in by email/password (Email/Password provider enabled) ----
const tokenCache = {};
async function signIn(email) {
  if (tokenCache[email]) return tokenCache[email];
  const res = await fetch(SIGNIN_PWD, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PWD, returnSecureToken: true }),
  });
  const j = await res.json();
  if (!j.idToken) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(j)}`);
  tokenCache[email] = j.idToken;
  return j.idToken;
}

async function callRaw(fnName, data, idToken) {
  const headers = { "Content-Type": "application/json" };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const res = await fetch(FN(fnName), { method: "POST", headers, body: JSON.stringify({ data }) });
  const j = await res.json().catch(() => ({}));
  if (res.ok && j.result !== undefined) return { ok: true, result: j.result, httpStatus: res.status };
  return { ok: false, error: j.error ?? j, httpStatus: res.status };
}
async function callAs(email, fnName, data) { return callRaw(fnName, data, await signIn(email)); }
async function callNoAuth(fnName, data) { return callRaw(fnName, data, null); }

function log(...a) { console.log(...a); }
function hr(t) { log(`\n${"=".repeat(4)} ${t} ${"=".repeat(Math.max(2, 52 - t.length))}`); }
let PASS = 0, FAIL = 0;
function assert(cond, msg) { if (cond) { PASS++; log(`   ✅ ${msg}`); } else { FAIL++; log(`   ❌ ${msg}`); } }
function assertRejected(res, status, label) {
  const got = res.ok ? "OK(no rejection)" : (res.error?.status || res.error?.message || JSON.stringify(res.error));
  assert(!res.ok && res.error?.status === status, `${label} → rejected ${status} (got: ${got})`);
}

async function pharm(uid) { return (await db.collection("pharmacies").doc(uid).get()).data() || {}; }
async function wallet(uid) { return (await db.collection("wallets").doc(uid).get()).data() || {}; }
async function inv(id) { return (await db.collection("pharmacy_inventory").doc(id).get()).data() || {}; }
async function reqDoc(id) { return (await db.collection("medicine_requests").doc(id).get()).data() || {}; }
async function offerDoc(id) { return (await db.collection("medicine_request_offers").doc(id).get()).data() || {}; }
async function proposalDoc(id) { return (await db.collection("exchange_proposals").doc(id).get()).data() || {}; }
async function deliveryDoc(id) { return (await db.collection("deliveries").doc(id).get()).data() || {}; }

const futureExp = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
function invDoc(ownerUid, medicineId, medicineName, dosage, form, qty) {
  return {
    pharmacyId: ownerUid, medicineId, medicineName, medicineDosage: dosage, medicineForm: form,
    availableQuantity: qty, reservedQuantity: 0, packaging: "box",
    batch: { lotNumber: `LOT-${medicineId.toUpperCase()}`, expirationDate: futureExp },
    availabilitySettings: { availableForExchange: true, minExchangeQuantity: 1, maxExchangeQuantity: qty },
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  };
}

// State carried across scenarios
const ctx = { sellerUid: null, buyerUid: null, adminUid: null, sellerEmail: null, buyerEmail: null, adminEmail: null, sellerItems: {}, buyerItems: {} };

async function registerPharmacy(tag, withLicense) {
  const email = `s5stg-${tag}-${RUN}@example.com`;
  const data = {
    email, password: PWD,
    profileData: {
      pharmacyName: `Staging ${tag}`, countryCode: "GH", cityCode: "accra",
      city: "accra", phoneNumber: "+233241234567", address: "Accra HS", currency: "GHS",
    },
  };
  if (withLicense) data.licenseNumber = "GH-1234";
  return { email, res: await callNoAuth("createPharmacyRegistration", data) };
}

async function s1() {
  hr("S1 — Ghana registration WITHOUT license → LICENSE_REQUIRED");
  const { email, res } = await registerPharmacy("s1nolic", false);
  assert(!res.ok && res.error?.status === "FAILED_PRECONDITION", `rejected FAILED_PRECONDITION (got ${res.ok ? "OK" : res.error?.status})`);
  const code = res.error?.details?.code ?? res.error?.details?.[0]?.code;
  assert(code === "LICENSE_REQUIRED", `error details.code = LICENSE_REQUIRED (got ${JSON.stringify(res.error?.details)})`);
  // anti-orphan: no auth user with that email
  let orphan = false;
  try { await adminAuth.getUserByEmail(email); orphan = true; } catch { orphan = false; }
  assert(!orphan, `anti-orphan: no Auth user left for ${email}`);
}

async function s2() {
  hr("S2 — Ghana registration WITH license → pending_verification + trial gated");
  const seller = await registerPharmacy("seller", true);
  const buyer = await registerPharmacy("buyer", true);
  assert(seller.res.ok && seller.res.result.licenseStatus === "pending_verification", `seller registered pending_verification (${seller.res.ok ? seller.res.result.licenseStatus : JSON.stringify(seller.res.error)})`);
  assert(buyer.res.ok && buyer.res.result.licenseStatus === "pending_verification", `buyer registered pending_verification (${buyer.res.ok ? buyer.res.result.licenseStatus : JSON.stringify(buyer.res.error)})`);
  if (!seller.res.ok || !buyer.res.ok) throw new Error("S2 registration failed — cannot continue");
  ctx.sellerUid = seller.res.result.uid; ctx.sellerEmail = seller.email;
  ctx.buyerUid = buyer.res.result.uid; ctx.buyerEmail = buyer.email;
  const sp = await pharm(ctx.sellerUid);
  assert(sp.subscriptionStatus === "trial_pending_license", `seller subscriptionStatus=trial_pending_license (got ${sp.subscriptionStatus})`);
  // marketplace gated while pending: createMedicineRequest must be blocked
  const gated = await callAs(ctx.buyerEmail, "createMedicineRequest", { medicineId: "amoxicillin-500mg", medicineSnapshot: {}, requestedQuantity: 1, requestMode: "purchase", currencyCode: "GHS" });
  assert(!gated.ok && gated.error?.status === "FAILED_PRECONDITION", `pending pharmacy gated on marketplace (got ${gated.ok ? "OK" : gated.error?.status})`);
  log(`   sellerUid=${ctx.sellerUid}  buyerUid=${ctx.buyerUid}`);
}

async function s3() {
  hr("S3 — admin verify → verified + trial started");
  // Create a super_admin (admins/{uid} doc + auth user) to call the callable.
  ctx.adminEmail = `s5stg-admin-${RUN}@example.com`;
  const adminRec = await adminAuth.createUser({ email: ctx.adminEmail, password: PWD });
  ctx.adminUid = adminRec.uid;
  await db.collection("admins").doc(ctx.adminUid).set({ role: "super_admin", countryScopes: ["GH"], permissions: ["manage_pharmacies"], email: ctx.adminEmail }, { merge: true });

  for (const [tag, uid] of [["seller", ctx.sellerUid], ["buyer", ctx.buyerUid]]) {
    const r = await callAs(ctx.adminEmail, "adminVerifyPharmacyLicense", { pharmacyId: uid, action: "verify" });
    assert(r.ok, `verify ${tag} → ${r.ok ? "ok" : JSON.stringify(r.error)}`);
  }
  const sp = await pharm(ctx.sellerUid), bp = await pharm(ctx.buyerUid);
  assert(sp.licenseStatus === "verified" && bp.licenseStatus === "verified", `both verified`);
  assert(sp.subscriptionStatus === "trial" && bp.subscriptionStatus === "trial", `both trial started (seller=${sp.subscriptionStatus} buyer=${bp.subscriptionStatus})`);
}

async function setupInventoryWallets() {
  hr("setup — seed inventory + credit wallets (Admin SDK)");
  ctx.sellerItems = {
    para: `stg-${ctx.sellerUid.slice(0, 8)}-paracetamol`,
    amox: `stg-${ctx.sellerUid.slice(0, 8)}-amoxicillin`,
    coartem: `stg-${ctx.sellerUid.slice(0, 8)}-coartem`,
  };
  ctx.buyerItems = {
    ibu: `stg-${ctx.buyerUid.slice(0, 8)}-ibuprofen`,
    salb: `stg-${ctx.buyerUid.slice(0, 8)}-salbutamol`,
  };
  const b = db.batch();
  b.set(db.collection("pharmacy_inventory").doc(ctx.sellerItems.para), invDoc(ctx.sellerUid, "paracetamol-syrup-120mg-5ml", "Paracetamol", "120mg/5ml", "Syrup", 50));
  b.set(db.collection("pharmacy_inventory").doc(ctx.sellerItems.amox), invDoc(ctx.sellerUid, "amoxicillin-500mg", "Amoxicillin", "500mg", "Capsule", 30));
  b.set(db.collection("pharmacy_inventory").doc(ctx.sellerItems.coartem), invDoc(ctx.sellerUid, "artemether-lumefantrine-20-120", "Artemether + Lumefantrine", "20mg/120mg", "Tablet", 40));
  b.set(db.collection("pharmacy_inventory").doc(ctx.buyerItems.ibu), invDoc(ctx.buyerUid, "ibuprofen-400mg", "Ibuprofen", "400mg", "Tablet", 60));
  b.set(db.collection("pharmacy_inventory").doc(ctx.buyerItems.salb), invDoc(ctx.buyerUid, "salbutamol-inhaler", "Salbutamol", "100mcg/dose", "Inhaler", 1));
  // Credit buyer wallet (GHS) for S4 + S8.
  b.set(db.collection("wallets").doc(ctx.buyerUid), { available: 1000000, held: 0, deducted: 0, currency: "GHS", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  b.set(db.collection("wallets").doc(ctx.sellerUid), { currency: "GHS" }, { merge: true });
  await b.commit();
  assert(true, `5 inventory items + buyer wallet (1,000,000 GHS) seeded`);
}

async function s4() {
  hr("S4 — medicine_request PURCHASE happy path");
  const QTY = 10, UNIT = 50;
  const w0 = await wallet(ctx.buyerUid), inv0 = await inv(ctx.sellerItems.para);
  const cr = await callAs(ctx.buyerEmail, "createMedicineRequest", { medicineId: "paracetamol-syrup-120mg-5ml", medicineSnapshot: { medicineName: "Paracetamol" }, requestedQuantity: QTY, requestMode: "purchase", currencyCode: "GHS" });
  assert(cr.ok, `createMedicineRequest → ${cr.ok ? cr.result.requestId : JSON.stringify(cr.error)}`);
  if (!cr.ok) return;
  const so = await callAs(ctx.sellerEmail, "submitMedicineRequestOffer", { requestId: cr.result.requestId, inventoryItemId: ctx.sellerItems.para, offeredQuantity: QTY, unitPrice: UNIT, offerType: "purchase" });
  assert(so.ok, `submitMedicineRequestOffer → ${so.ok ? so.result.offerId : JSON.stringify(so.error)}`);
  if (!so.ok) return;
  const ac = await callAs(ctx.buyerEmail, "acceptMedicineRequestOffer", { requestId: cr.result.requestId, offerId: so.result.offerId });
  assert(ac.ok, `acceptMedicineRequestOffer → ${ac.ok ? ac.result.proposalId : JSON.stringify(ac.error)}`);
  if (!ac.ok) return;
  const total = QTY * UNIT;
  const w1 = await wallet(ctx.buyerUid), inv1 = await inv(ctx.sellerItems.para);
  const p1 = await proposalDoc(ac.result.proposalId), d1 = await deliveryDoc(ac.result.deliveryId);
  assert(w1.available === w0.available - total, `buyer wallet ${w0.available} → ${w1.available} (−${total})`);
  assert(inv1.availableQuantity === inv0.availableQuantity, `seller inv untouched at accept (lock #5 purchase)`);
  assert(p1.status === "accepted" && p1.details?.type === "purchase" && p1.details?.totalPrice === total, `proposal accepted purchase total=${total}`);
  assert(d1.status === "pending" && d1.courierFee === Math.round(total * 0.12), `delivery pending courierFee=${d1.courierFee}`);
}

async function s5() {
  hr("S5 — medicine_request EXCHANGE (barter)");
  const cfg = (await db.collection("system_config").doc("main").get()).data() || {};
  const c = cfg.citiesByCountry?.GH?.accra; const base = Number(c?.deliveryFee); const ex = Number(c?.exchangeFee);
  let expFee = 0; if (Number.isFinite(ex) && ex > 0) expFee = Math.round(ex); else if (Number.isFinite(base) && base > 0) expFee = Math.round(base * 1.2);
  const EXQ = 5;
  const a0 = await inv(ctx.sellerItems.amox), b0 = await inv(ctx.buyerItems.ibu);
  const bw0 = await wallet(ctx.buyerUid), sw0 = await wallet(ctx.sellerUid);
  const cr = await callAs(ctx.buyerEmail, "createMedicineRequest", { medicineId: "amoxicillin-500mg", medicineSnapshot: {}, requestedQuantity: EXQ, requestMode: "exchange", currencyCode: "GHS" });
  assert(cr.ok, `createMedicineRequest(exchange) → ${cr.ok ? cr.result.requestId : JSON.stringify(cr.error)}`);
  if (!cr.ok) return;
  const so = await callAs(ctx.sellerEmail, "submitMedicineRequestOffer", { requestId: cr.result.requestId, inventoryItemId: ctx.sellerItems.amox, offeredQuantity: EXQ, offerType: "exchange", exchangeItem: { medicineId: "ibuprofen-400mg", medicineName: "Ibuprofen", dosage: "400mg", form: "Tablet", quantity: EXQ } });
  assert(so.ok, `submitMedicineRequestOffer(exchange) → ${so.ok ? so.result.offerId : JSON.stringify(so.error)}`);
  if (!so.ok) return;
  const ac = await callAs(ctx.buyerEmail, "acceptMedicineRequestOffer", { requestId: cr.result.requestId, offerId: so.result.offerId, exchangeInventoryItemId: ctx.buyerItems.ibu });
  assert(ac.ok, `acceptMedicineRequestOffer(exchange) → ${ac.ok ? ac.result.proposalId : JSON.stringify(ac.error)}`);
  if (!ac.ok) return;
  const a1 = await inv(ctx.sellerItems.amox), b1 = await inv(ctx.buyerItems.ibu);
  const bw1 = await wallet(ctx.buyerUid), sw1 = await wallet(ctx.sellerUid);
  const p1 = await proposalDoc(ac.result.proposalId), d1 = await deliveryDoc(ac.result.deliveryId);
  assert(b1.availableQuantity === b0.availableQuantity - EXQ && (b1.reservedQuantity || 0) === (b0.reservedQuantity || 0) + EXQ, `requester item B held (−${EXQ} avail, +${EXQ} reserved) [lock #5 single hold]`);
  assert(a1.availableQuantity === a0.availableQuantity && (a1.reservedQuantity || 0) === (a0.reservedQuantity || 0), `seller item A untouched at accept [lock #5]`);
  assert(bw1.available === bw0.available && sw1.available === sw0.available, `no wallet movement [lock #1 no soulte]`);
  assert(p1.details?.type === "exchange" && p1.status === "accepted", `proposal accepted exchange`);
  assert(d1.courierFee === expFee, `delivery courierFee=${d1.courierFee} (expected ${expFee}) [lock #6]`);
}

async function s6() {
  hr("S6 — parity matrix (strict cross-mode rejection)");
  const pReq = await callAs(ctx.buyerEmail, "createMedicineRequest", { medicineId: "amoxicillin-500mg", medicineSnapshot: {}, requestedQuantity: 3, requestMode: "purchase", currencyCode: "GHS" });
  const xReq = await callAs(ctx.buyerEmail, "createMedicineRequest", { medicineId: "amoxicillin-500mg", medicineSnapshot: {}, requestedQuantity: 3, requestMode: "exchange", currencyCode: "GHS" });
  assert(pReq.ok && xReq.ok, `setup purchase+exchange requests`);
  if (!pReq.ok || !xReq.ok) return;
  const exItem = { medicineId: "ibuprofen-400mg", medicineName: "Ibuprofen", dosage: "400mg", form: "Tablet", quantity: 3 };
  assertRejected(await callAs(ctx.sellerEmail, "submitMedicineRequestOffer", { requestId: pReq.result.requestId, inventoryItemId: ctx.sellerItems.amox, offeredQuantity: 3, offerType: "exchange", exchangeItem: exItem }), "FAILED_PRECONDITION", "purchase request + exchange offer");
  assertRejected(await callAs(ctx.sellerEmail, "submitMedicineRequestOffer", { requestId: xReq.result.requestId, inventoryItemId: ctx.sellerItems.amox, offeredQuantity: 3, offerType: "purchase", unitPrice: 50 }), "FAILED_PRECONDITION", "exchange request + purchase offer");
  assertRejected(await callAs(ctx.buyerEmail, "createMedicineRequest", { medicineId: "amoxicillin-500mg", medicineSnapshot: {}, requestedQuantity: 3, requestMode: "either", currencyCode: "GHS" }), "INVALID_ARGUMENT", 'requestMode="either"');
  assertRejected(await callAs(ctx.sellerEmail, "submitMedicineRequestOffer", { requestId: pReq.result.requestId, inventoryItemId: ctx.sellerItems.amox, offeredQuantity: 3, offerType: "purchase", unitPrice: 50, exchangeItem: exItem }), "INVALID_ARGUMENT", "purchase offer carrying exchangeItem");
  assertRejected(await callAs(ctx.sellerEmail, "submitMedicineRequestOffer", { requestId: xReq.result.requestId, inventoryItemId: ctx.sellerItems.amox, offeredQuantity: 3, offerType: "exchange" }), "INVALID_ARGUMENT", "exchange offer missing exchangeItem");
}

async function s7() {
  hr("S7 — fail-closed: unverified pharmacy blocked on 5 callables");
  // register a Ghana pharmacy WITH license but DON'T verify → pending_verification
  const u = await registerPharmacy("unverified", true);
  assert(u.res.ok, `setup unverified pharmacy → ${u.res.ok ? u.res.result.licenseStatus : JSON.stringify(u.res.error)}`);
  if (!u.res.ok) return;
  const email = u.email;
  const fp = "FAILED_PRECONDITION";
  assertRejected(await callAs(email, "createMedicineRequest", { medicineId: "amoxicillin-500mg", medicineSnapshot: {}, requestedQuantity: 1, requestMode: "purchase", currencyCode: "GHS" }), fp, "createMedicineRequest");
  assertRejected(await callAs(email, "submitMedicineRequestOffer", { requestId: "x", inventoryItemId: "y", offeredQuantity: 1, offerType: "purchase", unitPrice: 50 }), fp, "submitMedicineRequestOffer");
  assertRejected(await callAs(email, "acceptMedicineRequestOffer", { requestId: "x", offerId: "y" }), fp, "acceptMedicineRequestOffer");
  assertRejected(await callAs(email, "createExchangeProposal", { toPharmacyId: "z", inventoryItemId: "y", quantity: 1 }), fp, "createExchangeProposal");
  assertRejected(await callAs(email, "acceptExchangeProposal", { proposalId: "x" }), fp, "acceptExchangeProposal");
}

async function s8() {
  hr("S8 — withdrawal happy path + idempotency + MSISDN");
  const w0 = await wallet(ctx.buyerUid);
  const AMT = 20000, GOOD = "+233241234567", WRONG = "+233201234567", reqId = randomUUID();
  const r1 = await callAs(ctx.buyerEmail, "createWithdrawalRequest", { amountMinor: AMT, currencyCode: "GHS", providerId: "mtn_momo_gh", msisdn: GOOD, ownerType: "pharmacy", clientRequestId: reqId });
  assert(r1.ok && r1.result.status === "processing", `withdrawal happy → ${r1.ok ? r1.result.status : JSON.stringify(r1.error)}`);
  if (!r1.ok) return;
  const debited = r1.result.walletUnitsDebited;
  const w1 = await wallet(ctx.buyerUid);
  assert(w1.available === w0.available - debited && (w1.held || 0) === (w0.held || 0) + debited, `wallet available −${debited}, held +${debited}`);
  const r2 = await callAs(ctx.buyerEmail, "createWithdrawalRequest", { amountMinor: AMT, currencyCode: "GHS", providerId: "mtn_momo_gh", msisdn: GOOD, ownerType: "pharmacy", clientRequestId: reqId });
  const w2 = await wallet(ctx.buyerUid);
  assert(r2.ok && r2.result.requestId === r1.result.requestId && w2.available === w1.available, `idempotent replay: same requestId, no extra debit`);
  assertRejected(await callAs(ctx.buyerEmail, "createWithdrawalRequest", { amountMinor: AMT, currencyCode: "GHS", providerId: "mtn_momo_gh", msisdn: WRONG, ownerType: "pharmacy", clientRequestId: randomUUID() }), "INVALID_ARGUMENT", "MSISDN wrong operator");
  assertRejected(await callAs(ctx.buyerEmail, "createWithdrawalRequest", { amountMinor: 5000, currencyCode: "GHS", providerId: "mtn_momo_gh", msisdn: GOOD, ownerType: "pharmacy", clientRequestId: randomUUID() }), "FAILED_PRECONDITION", "amount below minimum");
}

(async () => {
  try {
    await s1(); await s2(); await s3(); await setupInventoryWallets();
    await s4(); await s5(); await s6(); await s7(); await s8();
    log(`\n${"-".repeat(54)}\nRESULT (staging): ${PASS} passed, ${FAIL} failed`);
    log(`run=${RUN}  sellerUid=${ctx.sellerUid}  buyerUid=${ctx.buyerUid}`);
    process.exit(FAIL === 0 ? 0 : 1);
  } catch (e) {
    log("\n💥 driver error:", e?.stack || e?.message || e);
    process.exit(1);
  }
})();
