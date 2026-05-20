#!/usr/bin/env node
/**
 * Sprint 5 phase 1 — Seed minimal d'inventaire pharmacy pour les scénarios
 * S4 (medicine request purchase) et S5 (medicine request exchange) du plan
 * `docs/release/SPRINT_5_E2E_CLOSURE_PLAN.md`.
 *
 * Crée des items `pharmacy_inventory/{auto}` pour 2 pharmacies (seller +
 * buyer) avec des médicaments WHO essentiels. **Les medicineId DOIVENT
 * matcher exactement le catalogue statique `EssentialAfricanMedicines`
 * (cf. `pharmapp_unified/lib/data/essential_medicines.dart`)**, sinon le
 * flow UI medicine_request casse à l'accept (le seller n'a pas l'item
 * recherché côté Firestore alors qu'il apparaît côté autocomplete).
 *
 *   - Seller (par défaut 3 items) : paracetamol-syrup-120mg-5ml (Calpol),
 *     amoxicillin-500mg, artemether-lumefantrine-20-120 (Coartem).
 *   - Buyer (par défaut 2 items) : ibuprofen-400mg (Brufen), salbutamol-
 *     inhaler (Ventolin) — utilisés comme "monnaie d'échange" pour les
 *     scénarios S5 exchange.
 *
 * Les items sont créés avec `availableForExchange: true` pour qu'ils
 * apparaissent dans le marketplace listing. Lot numbers et expiry dates
 * sont fixes pour faciliter les assertions de la recette.
 *
 * 🔒 GARDE-FOUS ANTI-PROD (ce script ÉCRIT par définition) :
 *
 *   1. `FIRESTORE_EMULATOR_HOST` DOIT être défini.
 *   2. `--project=<id>` DOIT commencer par `demo-`.
 *   3. `--sellerUid=<uid>` ET `--buyerUid=<uid>` DOIVENT être fournis.
 *   4. Confirmation visuelle des valeurs cibles avant écriture.
 *
 * Usage :
 *   # Pré-requis :
 *   #   1. firebase emulators:start ... --project=demo-pharmapp (Terminal 1)
 *   #   2. node functions/scripts/seedEmulator.mjs --project=demo-pharmapp (system_config)
 *   #   3. Créer 2 pharmacies via l'app (S2-CM avec Cameroun no-licence)
 *   #   4. Récupérer les UIDs des 2 pharmacies via Emulator UI Auth
 *   #      (http://localhost:4000/auth) ou la console Firestore /users.
 *
 *   $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
 *   node functions/scripts/seedInventory.mjs `
 *     --project=demo-pharmapp `
 *     --sellerUid=<CM-B-uid> `
 *     --buyerUid=<CM-A-uid>
 *
 * Idempotent : utilise `set` avec `merge:true` sur des `auto-id` stables
 * (basés sur le UID seller/buyer + medicineId) pour pouvoir relancer le
 * script sans dupliquer.
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// Arg parsing
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
seedInventory.mjs — Sprint 5 phase 1 inventory seed for S4/S5 scenarios.

USAGE
  export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
  node functions/scripts/seedInventory.mjs \\
    --project=demo-pharmapp \\
    --sellerUid=<CM-B-uid> \\
    --buyerUid=<CM-A-uid>

OPTIONS
  --project=<id>       Required. MUST start with "demo-".
  --sellerUid=<uid>    Required. UID of the seller pharmacy (will get 3 items).
  --buyerUid=<uid>     Required. UID of the buyer/requester pharmacy
                       (will get 2 items for S5 exchange flow).
  --help, -h           Print this help and exit.

WRITES
  Firestore: pharmacy_inventory/{auto-id} × 5 docs total.

GUARDS (all must pass)
  1. FIRESTORE_EMULATOR_HOST env var must be set.
  2. --project MUST start with "demo-".
  3. --sellerUid and --buyerUid must be non-empty.

EXIT CODES
  0  success
  2  guard failure
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "❌ GUARD 1 FAILED: FIRESTORE_EMULATOR_HOST env var is not set.\n" +
    "   This script writes data — it MUST target an emulator, never prod.\n" +
    "   Set it first: $env:FIRESTORE_EMULATOR_HOST=\"127.0.0.1:8080\"\n"
  );
  process.exit(2);
}

const projectId = args.project ?? null;
if (!projectId) {
  console.error("❌ GUARD 2 FAILED: pass --project=<id> (must start with 'demo-').");
  process.exit(2);
}
if (!projectId.startsWith("demo-")) {
  console.error(
    `❌ GUARD 2 FAILED: project '${projectId}' does not start with 'demo-'.\n`
  );
  process.exit(2);
}

const sellerUid = args.sellerUid ?? null;
const buyerUid = args.buyerUid ?? null;
if (!sellerUid || typeof sellerUid !== "string" || sellerUid.length === 0) {
  console.error("❌ GUARD 3 FAILED: pass --sellerUid=<uid>.");
  process.exit(2);
}
if (!buyerUid || typeof buyerUid !== "string" || buyerUid.length === 0) {
  console.error("❌ GUARD 3 FAILED: pass --buyerUid=<uid>.");
  process.exit(2);
}
if (sellerUid === buyerUid) {
  console.error("❌ GUARD 3 FAILED: sellerUid and buyerUid must differ.");
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Inventory definitions (WHO essential medicines, fixed lot/expiry for
// reproducibility of scenario assertions)
// ---------------------------------------------------------------------------

const futureExp = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // +1 year

function buildItem({ ownerUid, medicineId, medicineName, dosage, form, qty }) {
  return {
    pharmacyId: ownerUid,
    medicineId,
    medicineName,
    medicineDosage: dosage,
    medicineForm: form,
    availableQuantity: qty,
    reservedQuantity: 0,
    packaging: "box",
    batch: {
      lotNumber: `LOT-S5-${medicineId.toUpperCase()}`,
      expirationDate: futureExp,
    },
    availabilitySettings: {
      availableForExchange: true,
      minExchangeQuantity: 1,
      maxExchangeQuantity: qty,
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

// medicineId values MUST match EssentialAfricanMedicines.medicines[*].id
// (see pharmapp_unified/lib/data/essential_medicines.dart). Mismatched IDs
// surface as "request created but no seller has the item" at S4 accept
// time — discovered during Sprint 5 recette 2026-05-20.
const SELLER_ITEMS = [
  { medicineId: "paracetamol-syrup-120mg-5ml", medicineName: "Paracetamol",          dosage: "120mg/5ml",    form: "Syrup",   qty: 50 },
  { medicineId: "amoxicillin-500mg",           medicineName: "Amoxicillin",          dosage: "500mg",        form: "Capsule", qty: 30 },
  { medicineId: "artemether-lumefantrine-20-120", medicineName: "Artemether + Lumefantrine", dosage: "20mg/120mg", form: "Tablet", qty: 40 },
];

const BUYER_ITEMS = [
  // These are intended as "exchange currency" for S5 — the requester
  // (buyer) offers one of these in return when accepting an exchange offer.
  { medicineId: "ibuprofen-400mg",    medicineName: "Ibuprofen",  dosage: "400mg",     form: "Tablet",  qty: 60 },
  { medicineId: "salbutamol-inhaler", medicineName: "Salbutamol", dosage: "100mcg/dose", form: "Inhaler", qty: 1  },
];

// ---------------------------------------------------------------------------
// Confirmation + write
// ---------------------------------------------------------------------------

console.log(`\n✅ Guards passed.`);
console.log(`   FIRESTORE_EMULATOR_HOST = ${process.env.FIRESTORE_EMULATOR_HOST}`);
console.log(`   project    = ${projectId}`);
console.log(`   sellerUid  = ${sellerUid}`);
console.log(`   buyerUid   = ${buyerUid}`);
console.log(`\n📋 Will create ${SELLER_ITEMS.length} seller items + ${BUYER_ITEMS.length} buyer items :`);
for (const it of SELLER_ITEMS) {
  console.log(`   seller → ${it.medicineId} (${it.dosage} ${it.form}, qty=${it.qty})`);
}
for (const it of BUYER_ITEMS) {
  console.log(`   buyer  → ${it.medicineId} (${it.dosage} ${it.form}, qty=${it.qty})`);
}
console.log("\n💾 Writing…\n");

initializeApp({ projectId });
const db = getFirestore();

try {
  const batch = db.batch();
  const writes = [];

  for (const def of SELLER_ITEMS) {
    // Deterministic ID so re-running merges idempotently.
    const docId = `seedS5-${sellerUid.slice(0, 8)}-${def.medicineId}`;
    const ref = db.collection("pharmacy_inventory").doc(docId);
    batch.set(ref, buildItem({ ownerUid: sellerUid, ...def }), { merge: true });
    writes.push({ side: "seller", medicineId: def.medicineId, docId });
  }
  for (const def of BUYER_ITEMS) {
    const docId = `seedS5-${buyerUid.slice(0, 8)}-${def.medicineId}`;
    const ref = db.collection("pharmacy_inventory").doc(docId);
    batch.set(ref, buildItem({ ownerUid: buyerUid, ...def }), { merge: true });
    writes.push({ side: "buyer", medicineId: def.medicineId, docId });
  }

  await batch.commit();
  console.log(`✅ ${writes.length} inventory items written (merge:true, idempotent).\n`);
  for (const w of writes) {
    console.log(`   ${w.side.padEnd(6)} → pharmacy_inventory/${w.docId}`);
  }
  console.log("\n👉 Next: hot restart Flutter, then run S4 (purchase) or S5 (exchange) via the app UI.");
  console.log("   Wallet credit : open SandboxTestingScreen on the buyer pharmacy → Credit XAF.");
  process.exit(0);
} catch (err) {
  console.error("\n💥 Write failed:", err?.message ?? err);
  process.exit(1);
}
