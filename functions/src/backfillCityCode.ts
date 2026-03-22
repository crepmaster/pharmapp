/**
 * Sprint 2D — Backfill script: cityCode migration
 *
 * Writes the canonical `cityCode` slug on documents that only have a legacy
 * `city` / `operatingCity` display-name field.  Idempotent: skips documents
 * that already carry `cityCode`.  Supports dry-run mode (no writes).
 *
 * Collections processed:
 *   - pharmacies   (legacy field: city)
 *   - couriers     (legacy field: operatingCity, fallback: city)
 *   - deliveries   (active only — status in pending/assigned/picked_up/in_transit)
 *
 * Usage (after `npm run build`):
 *   node lib/backfillCityCode.js --dry-run   # preview only
 *   node lib/backfillCityCode.js             # apply writes
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS to point to a service-account key
 * with Firestore read + write permissions for the mediexchange project.
 */

import { initializeApp, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { citySlug } from "./cityUtils.js";

const DRY_RUN = process.argv.includes("--dry-run");

const ACTIVE_DELIVERY_STATUSES = ["pending", "assigned", "picked_up", "in_transit"];

interface BackfillStats {
  pharmacies: { updated: number; skipped: number; noCity: number };
  couriers: { updated: number; skipped: number; noCity: number };
  deliveries: { updated: number; skipped: number; noCity: number };
}

async function backfillCollection(
  db: ReturnType<typeof getFirestore>,
  collectionName: string,
  legacyField: string,
  fallbackField: string | null,
  statusFilter: string[] | null
): Promise<{ updated: number; skipped: number; noCity: number }> {
  let query: FirebaseFirestore.Query = db.collection(collectionName);
  if (statusFilter) {
    query = query.where("status", "in", statusFilter);
  }

  const snap = await query.get();
  let updated = 0;
  let skipped = 0;
  let noCity = 0;

  for (const doc of snap.docs) {
    const data = doc.data();

    if (data["cityCode"]) {
      skipped++;
      continue;
    }

    const legacyCity =
      (data[legacyField] as string | undefined) ||
      (fallbackField ? (data[fallbackField] as string | undefined) : undefined);

    if (!legacyCity || legacyCity.trim() === "") {
      noCity++;
      console.log(`  [SKIP – no city] ${collectionName}/${doc.id}`);
      continue;
    }

    const code = citySlug(legacyCity);
    console.log(
      `  [${DRY_RUN ? "DRY" : "WRITE"}] ${collectionName}/${doc.id}` +
      ` ${legacyField}="${legacyCity}" → cityCode="${code}"`
    );

    if (!DRY_RUN) {
      await doc.ref.update({ cityCode: code });
    }
    updated++;
  }

  return { updated, skipped, noCity };
}

async function main(): Promise<void> {
  // Initialize with application default credentials (set GOOGLE_APPLICATION_CREDENTIALS).
  const app: App = initializeApp();
  const db = getFirestore(app);

  console.log(`\n=== cityCode backfill ${DRY_RUN ? "(DRY RUN — no writes)" : "(LIVE)"} ===\n`);

  const stats: BackfillStats = {
    pharmacies: await backfillCollection(db, "pharmacies", "city", null, null),
    couriers: await backfillCollection(db, "couriers", "operatingCity", "city", null),
    deliveries: await backfillCollection(
      db, "deliveries", "city", "fromPharmacyCity", ACTIVE_DELIVERY_STATUSES
    ),
  };

  console.log("\n=== Summary ===");
  for (const [col, s] of Object.entries(stats)) {
    console.log(
      `  ${col}: ${s.updated} updated, ${s.skipped} already had cityCode, ${s.noCity} had no city`
    );
  }
  if (DRY_RUN) {
    console.log("\nRe-run without --dry-run to apply these changes.");
  }
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
