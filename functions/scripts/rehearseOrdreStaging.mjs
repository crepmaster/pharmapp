#!/usr/bin/env node
/** Execute the two real Ordre demo trades on staging, using three Auth users. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { PROJECT, MARKER, uidFor, inventoryId } from "./lib/demoFixtures.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const backups = path.join(root, "functions/.demo-backups");
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  if (!arg.startsWith("--") || !arg.includes("=")) throw new Error(`Invalid argument: ${arg}`);
  const at = arg.indexOf("=");
  return [arg.slice(2, at), arg.slice(at + 1)];
}));
if (Object.keys(args).sort().join(",") !== "apply,project" ||
    args.project !== PROJECT || args.apply !== MARKER ||
    process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error(`Requires exactly --project=${PROJECT} --apply=${MARKER}, without emulators.`);
}

const config = JSON.parse(await fs.readFile(path.join(root, ".deploy/staging-web.env.json"), "utf8"));
const spec = JSON.parse(await fs.readFile(path.join(backups, "accounts.json"), "utf8"));
const credentials = JSON.parse(await fs.readFile(path.join(backups, "credentials.json"), "utf8"));
if (!config.STAGING_APP_API_KEY ||
    ["seller", "buyer", "courier"].some((role) =>
      spec[role]?.mode !== "create" || credentials[role]?.email !== spec[role].email ||
      typeof credentials[role]?.password !== "string")) {
  throw new Error("Dedicated staging accounts or local credentials are incomplete.");
}

const head = execFileSync("git", ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "rev-parse", "HEAD"],
  { cwd: root, encoding: "utf8" }).trim();
const status = execFileSync("git", ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "status", "--porcelain", "--untracked-files=all"],
  { cwd: root, encoding: "utf8" }).trim();
if (status) throw new Error("Commit all candidate changes before rehearsal; receipt is bound to HEAD.");
const receiptPath = path.join(root, `.deploy/recette-${head.slice(0, 8)}.json`);
try { await fs.access(receiptPath); throw new Error(`Receipt already exists: ${receiptPath}`); }
catch (error) { if (error.code !== "ENOENT") throw error; }
for (const name of await fs.readdir(backups)) {
  if (!name.startsWith("rehearsal-") || !name.endsWith(".json")) continue;
  const previous = JSON.parse(await fs.readFile(path.join(backups, name), "utf8"));
  if (previous.commit === head && previous.lastStep !== "both paths complete; contract receipt created") {
    throw new Error(`Incomplete rehearsal ${name}; inspect its proposal/delivery IDs before another run.`);
  }
}

initializeApp({ credential: applicationDefault(), projectId: PROJECT });
const db = getFirestore();
const auth = getAuth();
const uids = Object.fromEntries(["seller", "buyer", "courier"].map((role) =>
  [role, uidFor(role, spec[role])]));
const sellerLot = inventoryId("seller");
const buyerLot = inventoryId("buyer");
const checkpointPath = path.join(backups, `rehearsal-${new Date().toISOString().replaceAll(":", "-")}.json`);
const checkpoint = { project: PROJECT, commit: head, createdAt: new Date().toISOString(),
  saleProposalId: null, saleDeliveryId: null, exchangeProposalId: null, exchangeDeliveryId: null,
  lastStep: "preflight" };
async function save(step) {
  checkpoint.lastStep = step;
  await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2), { mode: 0o600 });
  console.log(`✓ ${step}`);
}
async function request(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.error?.message ?? "request failed"}`);
  return body;
}
async function signIn(role) {
  const account = credentials[role];
  const result = await request(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(config.STAGING_APP_API_KEY)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password, returnSecureToken: true }),
  });
  if (result.localId !== uids[role] || !result.idToken) throw new Error(`${role}: Auth UID mismatch.`);
  return result.idToken;
}
async function callable(name, token, data) {
  const result = await request(`https://europe-west1-${PROJECT}.cloudfunctions.net/${name}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  if (!result.result) throw new Error(`${name}: callable response has no result.`);
  return result.result;
}
async function publishViaClientRules(token) {
  const docPath = `projects/${PROJECT}/databases/(default)/documents/pharmacy_inventory/${sellerLot}`;
  const url = new URL(`https://firestore.googleapis.com/v1/${docPath}`);
  for (const field of ["availabilitySettings.availableForExchange", "availabilitySettings.maxExchangeQuantity", "updatedAt"])
    url.searchParams.append("updateMask.fieldPaths", field);
  await request(url, {
    method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: {
      availabilitySettings: { mapValue: { fields: {
        availableForExchange: { booleanValue: true },
        maxExchangeQuantity: { integerValue: "10" },
      } } },
      updatedAt: { timestampValue: new Date().toISOString() },
    } }),
  });
  const after = (await db.doc(`pharmacy_inventory/${sellerLot}`).get()).data();
  if (after?.availabilitySettings?.availableForExchange !== true ||
      after.availabilitySettings.maxExchangeQuantity !== 10) {
    throw new Error("Publication did not persist through client Rules.");
  }
}
async function verifyTrade(proposalId, deliveryId, type) {
  const [proposal, delivery, entries] = await Promise.all([
    db.doc(`exchange_proposals/${proposalId}`).get(),
    db.doc(`deliveries/${deliveryId}`).get(),
    db.collection("ledger").where("deliveryId", "==", deliveryId).get(),
  ]);
  const p = proposal.data(), d = delivery.data();
  if (p?.status !== "completed" || p?.deliveryId !== deliveryId ||
      p?.details?.type !== type || p?.currencyCode !== "GHS" ||
      d?.status !== "delivered" || d?.proposalId !== proposalId ||
      d?.courierId !== uids.courier || d?.currency !== "GHS") {
    throw new Error(`${type}: final proposal/delivery state differs.`);
  }
  const ledger = entries.docs.map((doc) => doc.data());
  const payments = ledger.filter((entry) => entry.type === "courier_payment" &&
    entry.userId === uids.courier && entry.currency === "GHS");
  if (payments.length !== 1) throw new Error(`${type}: courier payment ledger missing or duplicate.`);
  if (type === "purchase") {
    if (ledger.filter((entry) => entry.type === "exchange_delivery_payment" &&
        entry.currency === "GHS").length !== 1) {
      throw new Error("purchase: medicine payment ledger missing or duplicate.");
    }
  } else {
    if (d?.stockTransit?.version !== 1 ||
        d.stockTransit.outbound?.state !== "received_pending" ||
        d.stockTransit.return?.state !== "received_pending" ||
        d.sandboxJourney?.returnPhase !== "return_delivered" ||
        ledger.filter((entry) => entry.type === "courier_fee" &&
          entry.from === "held" && entry.currencyCode === "GHS").length !== 2) {
      throw new Error("exchange: reciprocal receipt or fee ledger missing.");
    }
  }
}
async function snapshotState() {
  const wallet = {};
  const stock = {};
  const inventoryIds = {};
  for (const role of ["seller", "buyer", "courier"]) {
    wallet[role] = (await db.doc(`wallets/${uids[role]}`).get()).data();
  }
  for (const role of ["seller", "buyer"]) {
    stock[role] = (await db.doc(`pharmacy_inventory/${inventoryId(role)}`).get()).data();
    const docs = await db.collection("pharmacy_inventory").where("pharmacyId", "==", uids[role]).get();
    inventoryIds[role] = new Set(docs.docs.map((doc) => doc.id));
  }
  return { wallet, stock, inventoryIds };
}
async function verifyConservation(before, type, deliveryId) {
  const after = await snapshotState();
  const exchange = type === "exchange";
  const fee = (await db.doc(`deliveries/${deliveryId}`).get()).data()?.courierFee;
  if (fee !== (exchange ? 24 : 20))
    throw new Error(`${type}: staging courier fee changed from the reviewed 20/24 GHS config.`);
  const expectedWalletDeltas = exchange
    ? { buyer: -fee * 50, seller: -fee * 50, courier: fee }
    : { buyer: -(31 + fee / 2) * 100, seller: (31 - fee / 2) * 100, courier: fee };
  for (const role of ["seller", "buyer", "courier"]) {
    const first = before.wallet[role], last = after.wallet[role];
    if (last?.currency !== "GHS" ||
        last.available - first.available !== expectedWalletDeltas[role] ||
        (last.held ?? 0) !== (first.held ?? 0) ||
        (last.deducted ?? 0) !== (first.deducted ?? 0)) {
      throw new Error(`${type}: ${role} wallet delta or holds differ.`);
    }
  }
  if (after.stock.seller.availableQuantity !== before.stock.seller.availableQuantity - (exchange ? 3 : 2) ||
      after.stock.seller.reservedQuantity !== before.stock.seller.reservedQuantity ||
      after.stock.buyer.availableQuantity !== before.stock.buyer.availableQuantity - (exchange ? 4 : 0) ||
      after.stock.buyer.reservedQuantity !== before.stock.buyer.reservedQuantity) {
    throw new Error(`${type}: source lot quantities or reservations differ.`);
  }
  for (const [role, medicineId, quantity, lotNumber] of [
    ["buyer", "paracetamol-syrup-120mg-5ml", exchange ? 3 : 2, before.stock.seller.batch.lotNumber],
    ...(exchange ? [["seller", "ibuprofen-400mg", 4, before.stock.buyer.batch.lotNumber]] : []),
  ]) {
    const docs = await db.collection("pharmacy_inventory").where("pharmacyId", "==", uids[role]).get();
    const received = docs.docs.filter((doc) => !before.inventoryIds[role].has(doc.id) &&
      doc.data().medicineId === medicineId && doc.data().availableQuantity === quantity &&
      doc.data().batch?.lotNumber === lotNumber &&
      doc.data().availabilitySettings?.availableForExchange === false);
    if (received.length !== 1) throw new Error(`${type}: ${role} received lot missing or duplicate.`);
  }
}
async function runTrade(type, tokens) {
  const exchange = type === "exchange";
  const before = await snapshotState();
  const details = exchange
    ? { type, quantity: 3, exchangeMedicineId: "ibuprofen-400mg",
        exchangeInventoryItemId: buyerLot, exchangeQuantity: 4 }
    : { type, quantity: 2, pricePerUnit: 15.5, totalPrice: 31, currency: "GHS" };
  const result = await callable("createExchangeProposal", tokens.buyer, {
    inventoryItemId: sellerLot, fromPharmacyId: uids.buyer, toPharmacyId: uids.seller, details,
  });
  if (!result.proposalId) throw new Error(`${type}: proposal ID missing.`);
  checkpoint[exchange ? "exchangeProposalId" : "saleProposalId"] = result.proposalId;
  await save(`${type}: proposal created`);
  const accepted = await callable("acceptExchangeProposal", tokens.seller, { proposalId: result.proposalId });
  if (!accepted.deliveryId) throw new Error(`${type}: delivery ID missing.`);
  checkpoint[exchange ? "exchangeDeliveryId" : "saleDeliveryId"] = accepted.deliveryId;
  await save(`${type}: transport order created`);
  await callable("assignCourierToDelivery", tokens.courier, { deliveryId: accepted.deliveryId });
  await save(`${type}: courier assigned`);
  const actions = ["start_pickup", "confirm_pickup", "start_delivery", "confirm_delivered",
    ...(exchange ? ["start_return_pickup", "confirm_return_pickup", "start_return_delivery", "confirm_return_delivered"] : [])];
  for (const action of actions) {
    await callable("sandboxDeliveryAdvance", tokens.courier, { deliveryId: accepted.deliveryId, action });
    await save(`${type}: ${action}`);
    if (exchange && action === "confirm_delivered") {
      const mid = (await db.doc(`deliveries/${accepted.deliveryId}`).get()).data();
      if (mid?.status === "delivered" || mid?.stockTransit?.outbound?.state !== "received_pending")
        throw new Error("exchange: settlement occurred before reciprocal receipt.");
    }
  }
  await verifyTrade(result.proposalId, accepted.deliveryId, type);
  await verifyConservation(before, type, accepted.deliveryId);
  await save(`${type}: final state, ledger and stock/wallet deltas verified`);
}

try {
  const deployment = (await db.doc("deployment_proofs/staging-functions-expand").get()).data();
  if (deployment?.project !== PROJECT || deployment?.gitSha !== head ||
      deployment?.phase !== "expand" || deployment?.status !== "verified") {
    throw new Error("Matching verified staging expand proof is required before rehearsal.");
  }
  for (const role of ["seller", "buyer", "courier"]) {
    const [record, profile, wallet, authUser] = await Promise.all([
      db.doc(`users/${uids[role]}`).get(),
      db.doc(`${role === "courier" ? "couriers" : "pharmacies"}/${uids[role]}`).get(),
      db.doc(`wallets/${uids[role]}`).get(), auth.getUser(uids[role]),
    ]);
    if (authUser.disabled || authUser.email !== credentials[role].email ||
        record.data()?.demoFixture !== MARKER || profile.data()?.demoFixture !== MARKER ||
        wallet.data()?.currency !== "GHS" || wallet.data()?.held !== 0) {
      throw new Error(`${role}: dedicated fixture is incomplete or has pending funds.`);
    }
  }
  for (const [role, lot, minimum] of [["seller", sellerLot, 5], ["buyer", buyerLot, 4]]) {
    const item = (await db.doc(`pharmacy_inventory/${lot}`).get()).data();
    if (item?.demoFixture !== MARKER || item?.pharmacyId !== uids[role] ||
        item.availableQuantity < minimum || item.reservedQuantity !== 0)
      throw new Error(`${role}: inventory lot is unavailable or reserved.`);
  }
  const tokens = Object.fromEntries(await Promise.all(["seller", "buyer", "courier"].map(async (role) =>
    [role, await signIn(role)])));
  await save("three dedicated users authenticated");
  await publishViaClientRules(tokens.seller);
  await save("seller lot published through client Rules");
  await runTrade("purchase", tokens);
  await runTrade("exchange", tokens);
  await fs.writeFile(receiptPath, JSON.stringify({
    saleProposalId: checkpoint.saleProposalId,
    exchangeProposalId: checkpoint.exchangeProposalId,
  }, null, 2), { flag: "wx", mode: 0o600 });
  await save("both paths complete; contract receipt created");
  console.log(`Receipt: ${receiptPath}`);
} catch (error) {
  console.error(`Rehearsal stopped at ${checkpoint.lastStep}: ${error.message}`);
  console.error(`Inspect staging before retry; checkpoint: ${checkpointPath}`);
  process.exitCode = 1;
}
