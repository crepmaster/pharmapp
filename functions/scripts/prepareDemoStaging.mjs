#!/usr/bin/env node
/** Read-only by default; --apply writes ONLY the named Ordre demo fixtures. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROJECT, MARKER, ROLES, validateSpec, uidFor, inventoryId,
  assertConfig, assertExistingAccount, assertFixtureCollision,
  planWallet, planInventory,
} from "./lib/demoFixtures.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const backupRoot = path.resolve(here, "../.demo-backups");

function argsOf(argv) {
  const result = {};
  for (const arg of argv) {
    if (!arg.startsWith("--") || arg.includes("=") === false) throw new Error(`Invalid argument: ${arg}`);
    const [key, value] = arg.slice(2).split(/=(.*)/s);
    if (!key || !value || Object.hasOwn(result, key)) throw new Error(`Invalid argument: ${arg}`);
    result[key] = value;
  }
  if (Object.keys(result).some((key) => !["project", "spec", "apply", "patch-existing"].includes(key))) {
    throw new Error("Unknown argument.");
  }
  return result;
}

function serialise(value) {
  if (value === null || typeof value !== "object") return value;
  if (typeof value.toDate === "function") return { __type: "Timestamp", iso: value.toDate().toISOString() };
  if (value instanceof Date) return { __type: "Date", iso: value.toISOString() };
  if (typeof value.latitude === "number" && typeof value.longitude === "number") {
    return { __type: "GeoPoint", latitude: value.latitude, longitude: value.longitude };
  }
  if (typeof value.path === "string" && typeof value.firestore === "object") {
    return { __type: "DocumentReference", path: value.path };
  }
  if (Buffer.isBuffer(value)) return { __type: "Bytes", base64: value.toString("base64") };
  if (Array.isArray(value)) return value.map(serialise);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialise(item)]));
}

function accountIdentity(role, entry) {
  return { role, mode: entry.mode, uid: uidFor(role, entry), email: entry.email ?? null };
}

function subscription(now, Timestamp) {
  return {
    hasActiveSubscription: true,
    subscriptionStatus: "active",
    subscriptionPlan: "basic",
    subscriptionStartDate: Timestamp.fromDate(now),
    subscriptionEndDate: Timestamp.fromDate(new Date(now.getTime() + 30 * 86400000)),
  };
}

function eligibility(now, Timestamp) {
  return {
    ...subscription(now, Timestamp),
    licenseStatus: "verified",
    licenseCountryCode: "GH",
    licenseNumber: "GH-0000",
    licenseVerifiedBy: "demo-fixture-tool",
    licenseVerifiedAt: Timestamp.fromDate(now),
  };
}

function newAccountDocuments(role, uid, email, now, Timestamp) {
  const common = { uid, email, isActive: true, createdAt: Timestamp.fromDate(now),
    demoFixture: MARKER, demoRole: role };
  if (role === "courier") {
    return {
      user: { ...common, displayName: "DEMO Coursier Kumasi", phoneNumber: "+233000000003", role: "courier" },
      profile: {
        ...common, fullName: "DEMO Coursier Kumasi", displayName: "DEMO Coursier Kumasi",
        name: "DEMO Coursier Kumasi", phoneNumber: "+233000000003", role: "courier",
        countryCode: "GH", cityCode: "kumasi", city: "Kumasi", operatingCity: "Kumasi",
        vehicleType: "motorcycle", licensePlate: "DEMO-ORDRE", isAvailable: true,
        rating: 0, totalDeliveries: 0,
      },
    };
  }
  const seller = role === "seller";
  const name = seller ? "DEMO Pharmacie Adum" : "DEMO Pharmacie Bantama";
  const phone = seller ? "+233000000001" : "+233000000002";
  return {
    user: { ...common, displayName: name, phoneNumber: phone, role: "pharmacy" },
    profile: {
      ...common, pharmacyName: name, displayName: name, phoneNumber: phone,
      address: seller ? "DEMO Adum, Kumasi" : "DEMO Bantama, Kumasi",
      role: "pharmacy", countryCode: "GH", cityCode: "kumasi", city: "Kumasi",
      ...eligibility(now, Timestamp),
    },
  };
}

function inventoryDocument(role, uid, data, now, Timestamp) {
  const expiry = new Date(now.getTime() + 365 * 86400000);
  return {
    pharmacyId: uid, medicineId: data.medicineId, medicineName: data.medicineName,
    medicineDosage: data.medicineDosage, medicineForm: data.medicineForm,
    medicineCategory: data.medicineCategory,
    totalQuantity: data.quantity, availableQuantity: data.quantity, reservedQuantity: 0,
    packaging: "box", batch: { lotNumber: data.lotNumber, expirationDate: Timestamp.fromDate(expiry) },
    availabilitySettings: { availableForExchange: false, minExchangeQuantity: 1,
      maxExchangeQuantity: data.quantity },
    demoFixture: MARKER, demoRole: role,
    createdAt: Timestamp.fromDate(now), updatedAt: Timestamp.fromDate(now),
  };
}

async function main() {
  const args = argsOf(process.argv.slice(2));
  if (args.project !== PROJECT) throw new Error(`--project must be exactly ${PROJECT}.`);
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Emulator variables are set; refusing ambiguous target.");
  }
  if (!args.spec) throw new Error("--spec=<JSON file> is required.");
  const apply = args.apply === MARKER;
  if (args.apply && !apply) throw new Error(`--apply must equal ${MARKER}.`);
  if (args["patch-existing"] && args["patch-existing"] !== "yes") {
    throw new Error("--patch-existing accepts only yes.");
  }
  const spec = validateSpec(JSON.parse(await fs.readFile(path.resolve(args.spec), "utf8")));
  const identities = ROLES.map((role) => accountIdentity(role, spec[role]));
  if (new Set(identities.map((entry) => entry.uid)).size !== identities.length) {
    throw new Error("Resolved UIDs must be unique.");
  }

  const [{ initializeApp, applicationDefault }, { getFirestore, Timestamp }, { getAuth }] = await Promise.all([
    import("firebase-admin/app"), import("firebase-admin/firestore"), import("firebase-admin/auth"),
  ]);
  initializeApp({ credential: applicationDefault(), projectId: PROJECT });
  const db = getFirestore();
  const auth = getAuth();
  const now = new Date();
  const configSnap = await db.doc("system_config/main").get();
  const fees = assertConfig(configSnap.data());
  const observations = [];
  const operations = [];
  const authCreates = [];
  for (const identity of identities) {
    const { role, uid, mode } = identity;
    const profileCollection = role === "courier" ? "couriers" : "pharmacies";
    const paths = [`users/${uid}`, `${profileCollection}/${uid}`, `wallets/${uid}`];
    if (role !== "courier") paths.push(`pharmacy_inventory/${inventoryId(role)}`);
    const snaps = await Promise.all(paths.map((name) => db.doc(name).get()));
    const docs = Object.fromEntries(snaps.map((snap, i) => [paths[i], snap.exists ? snap.data() : null]));
    let authUser = null;
    try { authUser = await auth.getUser(uid); }
    catch (error) { if (error.code !== "auth/user-not-found") throw error; }
    observations.push({ role, mode, uid, auth: authUser && {
      uid: authUser.uid, email: authUser.email, disabled: authUser.disabled,
      customClaims: authUser.customClaims ?? null,
    }, documents: Object.fromEntries(Object.entries(docs).map(([name, data]) => [name, serialise(data)])) });
    const user = docs[`users/${uid}`];
    const profile = docs[`${profileCollection}/${uid}`];
    const wallet = docs[`wallets/${uid}`];
    if (mode === "existing") {
      assertExistingAccount(role, uid, authUser, user, profile, wallet);
      if (apply && args["patch-existing"] !== "yes") {
        throw new Error("Applying to existing accounts requires --patch-existing=yes.");
      }
    } else {
      if (authUser && (authUser.email?.toLowerCase() !== identity.email.toLowerCase() || authUser.disabled)) {
        throw new Error(`${role}: dedicated Auth UID collision.`);
      }
      for (const [name, data] of Object.entries(docs)) {
        if (data) assertFixtureCollision(name, data, role);
      }
      if (!authUser) authCreates.push({ role, uid, email: identity.email });
      const initial = newAccountDocuments(role, uid, identity.email, now, Timestamp);
      if (!user) operations.push({ path: `users/${uid}`, type: "create", data: initial.user });
      if (!profile) operations.push({ path: `${profileCollection}/${uid}`, type: "create", data: initial.profile });
    }
    if (role === "courier") {
      if (profile && (profile.isActive !== true || profile.isAvailable !== true)) {
        operations.push({ path: `${profileCollection}/${uid}`, type: "update",
          data: { isActive: true, isAvailable: true } });
      }
    } else if (mode === "existing") {
      // Deliberately limited patch. It is reported/backed up before mutation.
      const end = profile?.subscriptionEndDate?.toMillis?.() ?? 0;
      if (profile.subscriptionStatus !== "active" || profile.hasActiveSubscription !== true ||
          end < now.getTime() + 7 * 86400000) {
        operations.push({ path: `${profileCollection}/${uid}`, type: "update",
          data: subscription(now, Timestamp) });
      }
    } else if (profile && (profile.subscriptionEndDate?.toMillis?.() ?? 0) < now.getTime()) {
      operations.push({ path: `${profileCollection}/${uid}`, type: "update",
        data: subscription(now, Timestamp) });
    }
    const walletPatch = planWallet(role, wallet, mode === "create");
    if (walletPatch) operations.push({ path: `wallets/${uid}`, type: wallet ? "update" : "create",
      data: wallet ? walletPatch : { ...walletPatch, demoFixture: MARKER, demoRole: role } });
    if (role !== "courier") {
      const item = docs[`pharmacy_inventory/${inventoryId(role)}`];
      if (item && (item.pharmacyId !== uid || item.medicineId !==
          (role === "seller" ? "paracetamol-syrup-120mg-5ml" : "ibuprofen-400mg"))) {
        throw new Error(`${role}: fixture lot ownership or medicine drifted.`);
      }
      const template = planInventory(role, item);
      if (template) operations.push({ path: `pharmacy_inventory/${inventoryId(role)}`, type: "create",
        data: inventoryDocument(role, uid, template, now, Timestamp) });
    }
  }
  const report = {
    project: PROJECT, marker: MARKER, generatedAt: now.toISOString(), fees,
    targetAccounts: identities, authCreates,
    operations: operations.map(({ path, type, data }) => ({ path, type, data: serialise(data) })),
    before: observations,
  };
  await fs.mkdir(backupRoot, { recursive: true, mode: 0o700 });
  const reportPath = path.join(backupRoot, `ordre-${now.toISOString().replace(/[:.]/g, "-")}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
  console.log(`Target: ${PROJECT}; accounts: ${identities.map((a) => `${a.role}=${a.uid}`).join(", ")}`);
  console.log(`Fee config: purchase ${fees.deliveryFee} GHS; exchange ${fees.exchangeFee} GHS.`);
  console.log(`Backup and plan: ${reportPath}`);
  console.log(`Planned: ${authCreates.length} Auth creations, ${operations.length} Firestore writes.`);
  for (const op of operations) console.log(`  ${op.type} ${op.path}`);
  if (!apply) { console.log("DRY RUN: no remote mutations."); return; }

  // A dedicated account's password is supplied only through an environment
  // variable. Neither passwords nor service-account material enter the report.
  for (const item of authCreates) {
    const key = `PHARMAPP_DEMO_${item.role.toUpperCase()}_PASSWORD`;
    if (typeof process.env[key] !== "string" || process.env[key].length < 12) {
      throw new Error(`Set ${key} to a password of at least 12 characters before applying.`);
    }
  }
  for (const item of authCreates) {
    try {
      const byEmail = await auth.getUserByEmail(item.email);
      if (byEmail.uid !== item.uid) throw new Error(`${item.role}: email belongs to another UID.`);
    } catch (error) {
      if (error.code !== "auth/user-not-found") throw error;
    }
  }
  const createdAuthUids = [];
  try {
    for (const item of authCreates) {
      const key = `PHARMAPP_DEMO_${item.role.toUpperCase()}_PASSWORD`;
      await auth.createUser({ uid: item.uid, email: item.email, password: process.env[key],
        displayName: `DEMO Ordre ${item.role}`, emailVerified: true });
      createdAuthUids.push(item.uid);
    }
    // Single Firestore transaction: refuse concurrent changes after backup.
    await db.runTransaction(async (tx) => {
      const allPaths = observations.flatMap((entry) => Object.keys(entry.documents));
      const current = await Promise.all(allPaths.map((name) => tx.get(db.doc(name))));
      for (let i = 0; i < allPaths.length; i++) {
        const name = allPaths[i];
        const expected = observations.find((entry) => Object.hasOwn(entry.documents, name))?.documents[name];
        const actual = current[i].exists ? serialise(current[i].data()) : null;
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          throw new Error(`${name} changed since backup; no Firestore writes applied.`);
        }
      }
      for (const op of operations) {
        if (op.type === "create") tx.create(db.doc(op.path), op.data);
        else tx.update(db.doc(op.path), op.data);
      }
    });
  } catch (error) {
    // A timeout can mean the Firestore commit succeeded but its ACK was lost.
    // Do not delete Auth identities if their matching profiles may exist.
    try {
      const profilePaths = createdAuthUids.map((uid) =>
        `users/${uid}`);
      const post = await Promise.all(profilePaths.map((name) => db.doc(name).get()));
      if (post.some((snap) => snap.exists)) {
        throw new Error(`${error.message}; Firestore state may have committed. Auth accounts preserved for manual reconciliation.`);
      }
    } catch (checkError) {
      if (checkError.message.includes("manual reconciliation")) throw checkError;
      throw new Error(`${error.message}; could not verify Firestore state (${checkError.message}). Auth accounts preserved.`);
    }
    const failures = [];
    for (const uid of createdAuthUids.reverse()) {
      try { await auth.deleteUser(uid); }
      catch (cleanupError) { failures.push(`${uid}: ${cleanupError.message}`); }
    }
    if (failures.length) throw new Error(`${error.message}; Auth rollback incomplete: ${failures.join("; ")}`);
    throw error;
  }
  console.log("APPLIED: targeted demo fixtures only. Keep the backup for rollback review.");
}

main().catch((error) => { console.error(`REFUSED: ${error.message}`); process.exitCode = 1; });
