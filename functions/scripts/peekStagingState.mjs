/**
 * peekStagingState — READ-ONLY.
 *
 * Answers one question by default: is there anything on staging for the UI to
 * display? Plain document counts, nothing else.
 *
 * `--details` additionally prints a few shape fields from at most 3 proposals
 * and 5 inventory items: document ids, prices, currency, status, delivery id
 * and quantities. That is real operational content, so it is opt-in rather
 * than the default — an earlier version printed it unconditionally under a
 * "counts only" banner, which was simply untrue.
 *
 * Without `--details` the detail documents are not even fetched: the guarantee
 * is "not read", not merely "not printed".
 *
 * Refuses any project other than staging.
 *
 * The Firebase SDK is imported lazily inside main() so the pure helpers below
 * can be unit-tested without credentials, without a network and without
 * installing dependencies.
 *
 * Usage:
 *   node scripts/peekStagingState.mjs --project=mediexchange-staging [--details]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOWED_PROJECT = "mediexchange-staging";

export const COLLECTIONS = Object.freeze([
  "pharmacies",
  "pharmacy_inventory",
  "exchange_proposals",
  "deliveries",
  "wallets",
  "couriers",
]);

export const COUNTS_ONLY_HINT =
  "(counts only — pass --details to print proposal and inventory shape fields)";

export function parseArgs(argv) {
  const project = argv.find((a) => a.startsWith("--project="))?.split("=")[1];
  return { project, details: argv.includes("--details") };
}

/**
 * Render the report.
 *
 * When `details` is false this returns counts and nothing else, even if
 * proposal or inventory documents were passed in. The privacy guarantee lives
 * here, in one pure function, rather than being spread across call sites where
 * a later edit could quietly reintroduce a leak.
 */
export function buildReport({ counts, proposals = [], inventory = [], details = false }) {
  const lines = counts.map(({ name, count }) => `${String(name).padEnd(20)} ${count}`);

  if (!details) {
    lines.push("", COUNTS_ONLY_HINT);
    return lines;
  }

  if (proposals.length > 0) {
    lines.push("", "--- proposal money shape (fields the UI reads) ---");
    for (const { id, data } of proposals) {
      const det = data.details ?? {};
      lines.push(
        `${id}  type=${det.type}  unitPrice=${det.unitPrice}  ` +
          `totalPrice=${det.totalPrice}  currency=${det.currency}  status=${data.status}  ` +
          `deliveryId=${data.deliveryId ?? "none"}`
      );
    }
  }

  lines.push("", "--- inventory availability shape ---");
  for (const { id, data } of inventory) {
    const a = data.availabilitySettings ?? {};
    lines.push(
      `${id}  total=${data.totalQuantity} avail=${data.availableQuantity} ` +
        `reserved=${data.reservedQuantity} | forExchange=${a.availableForExchange} ` +
        `min=${a.minExchangeQuantity} max=${a.maxExchangeQuantity}`
    );
  }

  return lines;
}

// ---- CLI ------------------------------------------------------------------

async function main() {
  const { project, details } = parseArgs(process.argv.slice(2));

  if (project !== ALLOWED_PROJECT) {
    console.error(`REFUSED: --project must be '${ALLOWED_PROJECT}'.`);
    process.exit(2);
  }

  const { initializeApp, applicationDefault, getApps } = await import(
    "firebase-admin/app"
  );
  const { getFirestore } = await import("firebase-admin/firestore");

  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault(), projectId: ALLOWED_PROJECT });
  }
  const db = getFirestore();

  const counts = [];
  for (const name of COLLECTIONS) {
    const s = await db.collection(name).count().get();
    counts.push({ name, count: s.data().count });
  }

  // Detail documents are fetched only when they will be shown.
  let proposals = [];
  let inventory = [];
  if (details) {
    const props = await db.collection("exchange_proposals").limit(3).get();
    proposals = props.docs.map((d) => ({ id: d.id, data: d.data() }));

    const inv = await db.collection("pharmacy_inventory").limit(5).get();
    inventory = inv.docs.map((d) => ({ id: d.id, data: d.data() }));
  }

  for (const line of buildReport({ counts, proposals, inventory, details })) {
    console.log(line);
  }
  process.exit(0);
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  await main();
}
