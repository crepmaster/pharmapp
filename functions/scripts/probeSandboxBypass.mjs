#!/usr/bin/env node
/**
 * probeSandboxBypass.mjs — round-4 review runtime proof.
 *
 * Exercises the deployed sandbox-bypass path on real staging and reads
 * wallet writes back. Written after the round-4 review found that unit
 * tests alone couldn't rule out the P0#1 gate mistake because the tests
 * used artificial `courierId` values.
 *
 * Flow:
 *   1. Creates two throw-away sandbox pharmacies via createPharmacyRegistration.
 *   2. Seeds proposal + delivery + inventory + wallets via Admin SDK,
 *      recreating the "acceptExchangeProposal has run" state.
 *   3. Signs in as the buyer, snapshots wallets.
 *   4. Calls sandboxDeliveryAdvance(pickup) → buyer becomes courier.
 *   5. Calls completeExchangeDelivery → sandbox bypass MUST activate.
 *   6. Snapshots wallets, asserts money-math.
 *   7. Cleanup (ALWAYS, even on failure) — see below.
 *
 * 🔒 SECURITY (round-4 review follow-up):
 *   - Password is generated per run (crypto.randomBytes, never on disk).
 *   - A `try/finally` deletes all created state: Auth users, pharmacy /
 *     wallet / users docs, seeded proposal + delivery + inventory, plus
 *     the auto-id ledger entries and the buyer-side inventory doc that
 *     completeExchangeDelivery creates on success. Query-by-field cleans
 *     the auto-id docs.
 *   - `--cleanup <suffix>` mode reclaims fixtures from a prior aborted run.
 *
 * 🔒 GUARDS:
 *   - Requires STAGING_WEB_API_KEY env var.
 *   - Refuses to run if FIRESTORE_EMULATOR_HOST is set (real staging only).
 *
 * Usage:
 *   $env:STAGING_WEB_API_KEY="<web api key>"
 *   node functions/scripts/probeSandboxBypass.mjs
 *   node functions/scripts/probeSandboxBypass.mjs --cleanup <suffix>
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { randomUUID, randomBytes } from "node:crypto";

const PROJECT = "mediexchange-staging";
const REGION = "europe-west1";
const FN = (name) => `https://${REGION}-${PROJECT}.cloudfunctions.net/${name}`;
const API_KEY = process.env.STAGING_WEB_API_KEY;

if (!API_KEY) {
  console.error("Missing STAGING_WEB_API_KEY env var.");
  process.exit(2);
}
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "Refusing to run: FIRESTORE_EMULATOR_HOST is set. This probe targets real staging."
  );
  process.exit(2);
}

initializeApp({ projectId: PROJECT });
const db = getFirestore();
const auth = getAuth();

// -- HTTP helpers ------------------------------------------------------------

async function signInWithPassword(email, password) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`signIn(${email}) failed: ${JSON.stringify(j)}`);
  return j.idToken;
}

async function callFn(name, token, data) {
  const headers = { "content-type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;
  const res = await fetch(FN(name), {
    method: "POST",
    headers,
    body: JSON.stringify({ data }),
  });
  const text = await res.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  if (!res.ok) throw new Error(`${name} HTTP ${res.status}: ${JSON.stringify(payload)}`);
  return payload.result ?? payload;
}

// -- cleanup helpers ---------------------------------------------------------

// Query and delete every ledger entry pointing at `deliveryId`, plus every
// pharmacy_inventory doc owned by a listed pharmacy uid (covers the auto-id
// doc that completeExchangeDelivery creates for the buyer on success).
async function cleanupFixture({ uids = [], docPaths = [], deliveryId = null }) {
  console.log("\n[cleanup] starting");
  const attempts = [];
  const track = (label, p) =>
    attempts.push(
      p.then(
        () => console.log(`  [OK  ] del ${label}`),
        (e) => console.warn(`  [WARN] del ${label}: ${e.message ?? e}`)
      )
    );

  // 1. Explicit doc paths (proposal, delivery, seed inventory, wallets, ...).
  for (const path of docPaths) track(path, db.doc(path).delete());

  // 2. Ledger entries created by the settlement transaction (auto-id).
  if (deliveryId) {
    try {
      const snap = await db
        .collection("ledger")
        .where("deliveryId", "==", deliveryId)
        .get();
      for (const d of snap.docs) track(`ledger/${d.id}`, d.ref.delete());
    } catch (e) {
      console.warn(`  [WARN] ledger query failed: ${e.message ?? e}`);
    }
  }

  // 3. Buyer-side inventory doc auto-created by completeExchangeDelivery,
  //    plus any left-over seed inventory owned by these uids.
  for (const uid of uids) {
    if (!uid) continue;
    try {
      const snap = await db
        .collection("pharmacy_inventory")
        .where("pharmacyId", "==", uid)
        .get();
      for (const d of snap.docs)
        track(`pharmacy_inventory/${d.id}`, d.ref.delete());
    } catch (e) {
      console.warn(`  [WARN] inventory query failed for ${uid}: ${e.message ?? e}`);
    }
  }

  // 4. Registration-owned docs.
  for (const uid of uids) {
    if (!uid) continue;
    track(`pharmacies/${uid}`, db.doc(`pharmacies/${uid}`).delete());
    track(`wallets/${uid}`, db.doc(`wallets/${uid}`).delete());
    track(`users/${uid}`, db.doc(`users/${uid}`).delete());
  }

  // 5. Auth users (last, in case anything above needed them).
  for (const uid of uids) {
    if (!uid) continue;
    track(`auth/${uid}`, auth.deleteUser(uid));
  }

  await Promise.all(attempts);
  console.log("[cleanup] done");
}

// Resolve uids from Firestore for a given suffix (used by --cleanup mode).
async function findUidsBySuffix(suffix) {
  const emails = [
    `probe.buyer.${suffix}@promoshake.net`,
    `probe.seller.${suffix}@promoshake.net`,
  ];
  const uids = [];
  for (const email of emails) {
    try {
      const user = await auth.getUserByEmail(email);
      uids.push(user.uid);
    } catch {
      /* not found — ok */
    }
  }
  return uids;
}

// -- assertions --------------------------------------------------------------

const results = [];
function check(cond, label, extra = null) {
  results.push({ ok: !!cond, label, extra });
  const tag = cond ? "OK  " : "FAIL";
  console.log(`  [${tag}] ${label}`, extra !== null ? JSON.stringify(extra) : "");
}

// -- cleanup-only mode -------------------------------------------------------

async function cleanupOnlyMode(suffix) {
  console.log(`[cleanup-only] suffix=${suffix}`);
  const uids = await findUidsBySuffix(suffix);
  await cleanupFixture({
    uids,
    docPaths: [
      `exchange_proposals/probe-prop-${suffix}`,
      `deliveries/probe-del-${suffix}`,
      `pharmacy_inventory/probe-inv-${suffix}`,
    ],
    deliveryId: `probe-del-${suffix}`,
  });
  process.exit(0);
}

// -- main --------------------------------------------------------------------

async function main() {
  // Random password per run — never touches disk. 16 bytes base64url ≈ 22 chars.
  const PASSWORD = randomBytes(16).toString("base64url");
  const suffix = randomUUID().slice(0, 8);
  const buyerEmail = `probe.buyer.${suffix}@promoshake.net`;
  const sellerEmail = `probe.seller.${suffix}@promoshake.net`;
  const TOTAL_AMOUNT = 500;
  const COURIER_FEE = 60;
  const HALF_BUYER = Math.floor(COURIER_FEE / 2);
  const HALF_SELLER = COURIER_FEE - HALF_BUYER;
  const SELLER_NET_CREDIT = TOTAL_AMOUNT - HALF_SELLER;

  const proposalId = `probe-prop-${suffix}`;
  const deliveryId = `probe-del-${suffix}`;
  const inventoryId = `probe-inv-${suffix}`;

  // Tracked for cleanup — populated as we go so try/finally can reclaim
  // whatever DID get created, even on partial failure.
  const created = { uids: [], docPaths: [] };

  console.log(`\n[probe] suffix=${suffix} buyer=${buyerEmail}\n`);

  try {
    // 1. Register both pharmacies.
    console.log("[step 1] registering two throw-away pharmacies");
    async function register(email, name) {
      const res = await callFn("createPharmacyRegistration", null, {
        email,
        password: PASSWORD,
        profileData: {
          pharmacyName: name,
          countryCode: "GH",
          cityCode: "accra",
          city: "accra",
          phoneNumber: "+233241000000",
          address: "Accra probe address",
          currency: "GHS",
        },
        licenseNumber: "GH-1234",
      });
      return res.uid ?? res.userId ?? res.pharmacyId;
    }
    const buyerUid = await register(buyerEmail, `Probe Buyer ${suffix}`);
    created.uids.push(buyerUid);
    const sellerUid = await register(sellerEmail, `Probe Seller ${suffix}`);
    created.uids.push(sellerUid);
    console.log(`  buyerUid=${buyerUid}, sellerUid=${sellerUid}`);

    // 2. Seed proposal + delivery + inventory + wallets via Admin SDK.
    console.log("[step 2] seeding proposal/delivery/wallets via Admin SDK");
    await db.doc(`wallets/${buyerUid}`).set(
      {
        available: 100000,
        held: 0,
        deducted: TOTAL_AMOUNT,
        currency: "GHS",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: false }
    );
    await db.doc(`wallets/${sellerUid}`).set(
      {
        available: 0,
        held: 0,
        currency: "GHS",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: false }
    );
    await db.doc(`pharmacy_inventory/${inventoryId}`).set({
      pharmacyId: sellerUid,
      medicineId: "probe-med",
      medicineName: "Probe Amoxicillin",
      dosage: "500mg",
      form: "Capsule",
      availableQuantity: 50,
      reservedQuantity: 0,
      batch: { lotNumber: "L1", expirationDate: null },
      availabilitySettings: {
        availableForExchange: true,
        minExchangeQuantity: 1,
        maxExchangeQuantity: 50,
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    created.docPaths.push(`pharmacy_inventory/${inventoryId}`);
    await db.doc(`exchange_proposals/${proposalId}`).set({
      proposalId,
      fromPharmacyId: buyerUid,
      toPharmacyId: sellerUid,
      inventoryItemId: inventoryId,
      status: "accepted",
      reservations: { walletReserved: TOTAL_AMOUNT, inventoryReserved: 5 },
      details: {
        type: "purchase",
        totalPrice: TOTAL_AMOUNT,
        quantity: 5,
        currency: "GHS",
        medicineName: "Probe Amoxicillin",
        medicineId: "probe-med",
      },
      createdAt: FieldValue.serverTimestamp(),
    });
    created.docPaths.push(`exchange_proposals/${proposalId}`);
    await db.doc(`deliveries/${deliveryId}`).set({
      deliveryId,
      proposalId,
      fromPharmacyId: buyerUid,
      toPharmacyId: sellerUid,
      status: "pending",
      courierId: null,
      courierFee: COURIER_FEE,
      currency: "GHS",
      items: [
        {
          medicineId: "probe-med",
          medicineName: "Probe Amoxicillin",
          dosage: "500mg",
          form: "Capsule",
          packaging: "units",
        },
      ],
      createdAt: FieldValue.serverTimestamp(),
    });
    created.docPaths.push(`deliveries/${deliveryId}`);

    // 3. Sign in as buyer.
    console.log("[step 3] signing in as buyer");
    const buyerToken = await signInWithPassword(buyerEmail, PASSWORD);

    // 4. BEFORE snapshot.
    const before = {
      buyer: (await db.doc(`wallets/${buyerUid}`).get()).data(),
      seller: (await db.doc(`wallets/${sellerUid}`).get()).data(),
    };
    console.log("[step 4] BEFORE:", before);

    // 5. Pickup — buyer becomes courier.
    console.log("[step 5] sandboxDeliveryAdvance(pickup)");
    await callFn("sandboxDeliveryAdvance", buyerToken, {
      deliveryId,
      action: "pickup",
    });
    const midDelivery = (await db.doc(`deliveries/${deliveryId}`).get()).data();
    check(
      midDelivery.courierId === buyerUid,
      "Pickup set courierId = buyer (would have blocked pre-P0#1 bypass)"
    );

    // 6. Deliver — this is where P0#1 fix matters.
    console.log("[step 6] completeExchangeDelivery");
    await callFn("completeExchangeDelivery", buyerToken, { deliveryId });

    // 7. AFTER snapshot.
    const after = {
      buyer: (await db.doc(`wallets/${buyerUid}`).get()).data(),
      seller: (await db.doc(`wallets/${sellerUid}`).get()).data(),
      delivery: (await db.doc(`deliveries/${deliveryId}`).get()).data(),
    };
    console.log("[step 7] AFTER:", after);

    // 8. Money-math assertions.
    console.log("\n[step 8] money-math assertions:");
    check(after.delivery.status === "delivered", "delivery.status → 'delivered'");

    const buyerAvailDelta =
      (after.buyer.available ?? 0) - (before.buyer.available ?? 0);
    check(buyerAvailDelta === 0,
      "buyer.available UNCHANGED (halfBuyer NOT debited, no courier self-credit)",
      { delta: buyerAvailDelta, expected: 0 });

    const buyerDeductedDelta =
      (after.buyer.deducted ?? 0) - (before.buyer.deducted ?? 0);
    check(buyerDeductedDelta === -TOTAL_AMOUNT,
      "buyer.deducted -= totalAmount (payment captured)",
      { delta: buyerDeductedDelta, expected: -TOTAL_AMOUNT });

    const sellerAvailDelta =
      (after.seller.available ?? 0) - (before.seller.available ?? 0);
    check(sellerAvailDelta === TOTAL_AMOUNT,
      "seller.available += FULL totalAmount (NOT sellerNetCredit)",
      { delta: sellerAvailDelta, expected: TOTAL_AMOUNT, prod_would_be: SELLER_NET_CREDIT });

    check(sellerAvailDelta !== SELLER_NET_CREDIT,
      "seller did NOT receive sellerNetCredit (would mean bypass silently OFF)",
      { got: sellerAvailDelta, buggy_value: SELLER_NET_CREDIT });
    check(buyerAvailDelta !== -HALF_BUYER,
      "buyer.available did NOT go down by halfBuyer (would mean bypass silently OFF)",
      { got: buyerAvailDelta, buggy_value: -HALF_BUYER });

    const failed = results.filter((r) => !r.ok);
    console.log(`\n[probe] ${results.length - failed.length}/${results.length} checks passed.`);
    if (failed.length) {
      console.error("\n[probe] FAILURES:");
      failed.forEach((f) => console.error("  -", f.label, f.extra ?? ""));
      process.exitCode = 1;
    } else {
      console.log("[probe] PASS — P0#1 bypass math confirmed on real staging.");
    }
  } finally {
    // ALWAYS clean up — this runs even if any step above threw. `deliveryId`
    // is only meaningful after step 2 (cleanup guards against undefined uids
    // internally, so passing it is safe even if step 2 failed).
    await cleanupFixture({
      uids: created.uids,
      docPaths: created.docPaths,
      deliveryId,
    });
  }
}

// -- entrypoint --------------------------------------------------------------

const argv = process.argv.slice(2);
const cleanupIdx = argv.indexOf("--cleanup");
if (cleanupIdx !== -1) {
  const suffix = argv[cleanupIdx + 1];
  if (!suffix) {
    console.error("--cleanup requires a suffix argument (e.g. --cleanup 657eadd6)");
    process.exit(2);
  }
  cleanupOnlyMode(suffix).catch((e) => {
    console.error("[cleanup-only] UNCAUGHT:", e?.message ?? e);
    process.exit(1);
  });
} else {
  main().catch((err) => {
    console.error("\n[probe] UNCAUGHT:", err?.message ?? err);
    console.error(err?.stack ?? "");
    process.exitCode = 1;
  });
}
