/**
 * One-shot cleanup: fully delete legacy test pharmacies + all attached data.
 *
 * Usage:
 *   node functions/scripts/cleanup-pharmacies.js <email1> <email2> ...          # dry-run
 *   node functions/scripts/cleanup-pharmacies.js --apply <email1> ...           # execute
 *
 * Requires ADC (gcloud auth application-default login).
 */

const admin = require("firebase-admin");

admin.initializeApp({projectId: "mediexchange"});
const db = admin.firestore();
const auth = admin.auth();

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const emails = args.filter((a) => !a.startsWith("--"));

if (emails.length === 0) {
  console.error("Usage: cleanup-pharmacies.js [--apply] <email> [<email>...]");
  process.exit(1);
}

async function main() {
  console.log(apply ? "MODE: APPLY (destructive)" : "MODE: DRY-RUN");
  console.log("Targets:", emails.join(", "));
  console.log();

  for (const email of emails) {
    await processOne(email);
    console.log();
  }

  console.log(apply ? "Done." : "Dry-run complete. Re-run with --apply to execute.");
}

async function processOne(email) {
  console.log(`=== ${email} ===`);

  let uid = null;
  try {
    const u = await auth.getUserByEmail(email);
    uid = u.uid;
    console.log(`  auth uid: ${uid}`);
  } catch (e) {
    if (e.code === "auth/user-not-found") {
      console.log("  auth: NOT FOUND");
    } else {
      console.log(`  auth lookup failed: ${e.message}`);
      return;
    }
  }

  if (!uid) {
    console.log("  skipping firestore cleanup (no uid)");
    return;
  }

  const counts = {};

  const topDocs = [
    `users/${uid}`,
    `pharmacies/${uid}`,
    `wallets/${uid}`,
    `subscriptions/${uid}`,
  ];
  for (const path of topDocs) {
    const snap = await db.doc(path).get();
    if (snap.exists) {
      counts[path] = 1;
      if (apply) await db.doc(path).delete();
    }
  }

  const scans = [
    {collection: "pharmacy_inventory", where: [["pharmacyId", "==", uid]]},
    {collection: "exchange_proposals", where: [["fromPharmacyId", "==", uid]]},
    {collection: "exchange_proposals", where: [["toPharmacyId", "==", uid]]},
    {collection: "deliveries", where: [["fromPharmacyId", "==", uid]]},
    {collection: "deliveries", where: [["toPharmacyId", "==", uid]]},
    {collection: "medicine_requests", where: [["requesterId", "==", uid]]},
    {collection: "ledger", where: [["userId", "==", uid]]},
  ];

  for (const scan of scans) {
    let q = db.collection(scan.collection);
    for (const w of scan.where) q = q.where(w[0], w[1], w[2]);
    try {
      const qs = await q.get();
      if (qs.empty) continue;
      const key = `${scan.collection}[${scan.where.map((w) => w[0]).join(",")}]`;
      counts[key] = (counts[key] || 0) + qs.size;
      if (apply) {
        for (const batchStart of chunks(qs.docs, 400)) {
          const batch = db.batch();
          for (const d of batchStart) batch.delete(d.ref);
          await batch.commit();
        }
      }
    } catch (e) {
      console.log(`  ${scan.collection} scan failed: ${e.message}`);
    }
  }

  // notifications/{uid}/inbox/* subcollection
  try {
    const inbox = await db.collection(`notifications/${uid}/inbox`).get();
    if (!inbox.empty) {
      counts[`notifications/${uid}/inbox`] = inbox.size;
      if (apply) {
        for (const batchStart of chunks(inbox.docs, 400)) {
          const batch = db.batch();
          for (const d of batchStart) batch.delete(d.ref);
          await batch.commit();
        }
      }
    }
  } catch (e) {
    console.log(`  notifications scan failed: ${e.message}`);
  }

  if (apply) {
    try {
      await auth.deleteUser(uid);
      console.log("  auth account deleted");
    } catch (e) {
      console.log(`  auth delete failed: ${e.message}`);
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`  ${apply ? "deleted" : "would delete"} ${total} items:`);
  for (const [k, v] of Object.entries(counts)) console.log(`    ${k}: ${v}`);
}

function* chunks(arr, size) {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
