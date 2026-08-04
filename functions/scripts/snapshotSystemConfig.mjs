/**
 * snapshotSystemConfig — READ-ONLY towards Firebase.
 *
 * Reads `system_config/main`, saves it verbatim to a local file, and prints a
 * STRUCTURAL comparison against the committed `SYSTEM_CONFIG` source.
 *
 * Prints PATHS, not values — the document carries operational configuration
 * that has no business scrolling through a terminal or a report. The only
 * exception is the Ghana city fee fields, which are the values this
 * comparison exists to check.
 *
 * Never writes to Firebase. It DOES write one local file, the snapshot named
 * by --out, and it refuses to overwrite an existing one: a snapshot is
 * evidence, and silently replacing evidence destroys it.
 *
 * Requires an explicit --project and refuses any project that is not the
 * staging one, so a mistyped flag cannot point it at production.
 *
 * The Firebase SDK is imported lazily inside main() so that the pure helpers
 * below can be unit-tested without credentials, without a network and without
 * installing dependencies.
 *
 * Usage:
 *   node scripts/snapshotSystemConfig.mjs --project=mediexchange-staging --out=<file>
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOWED_PROJECT = "mediexchange-staging";

// ---- pure helpers ---------------------------------------------------------

export function paths(obj, prefix = "", acc = new Set()) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    acc.add(prefix);
    return acc;
  }
  for (const k of Object.keys(obj)) {
    paths(obj[k], prefix ? `${prefix}.${k}` : k, acc);
  }
  return acc;
}

export function valueAt(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * The Ghana fee paths this comparison is allowed to treat as INTENDED.
 *
 * Closed list, not a pattern. The previous `^citiesByCountry\.GH\.[a-z-]+\.
 * (deliveryFee|exchangeFee)$` regex absolved ANY Ghana fee divergence, present
 * or future: a new city, or a fee nobody meant to touch, would have been
 * silently classed as intended and could still yield CLEAN. An allowlist that
 * grows by itself is not an allowlist.
 *
 * These are the nine paths actually present in SYSTEM_CONFIG. The comment that
 * claimed five was wrong. Note the asymmetry — `accra` carries no
 * `exchangeFee`; that is the source's current shape, reported here rather than
 * quietly normalised.
 *
 * Adding a city or a fee must be a deliberate edit here, reviewed alongside the
 * seed change.
 */
export const INTENDED_GHANA_FEE_PATHS = Object.freeze([
  "citiesByCountry.GH.accra.deliveryFee",
  "citiesByCountry.GH.cape-coast.deliveryFee",
  "citiesByCountry.GH.cape-coast.exchangeFee",
  "citiesByCountry.GH.kumasi.deliveryFee",
  "citiesByCountry.GH.kumasi.exchangeFee",
  "citiesByCountry.GH.takoradi.deliveryFee",
  "citiesByCountry.GH.takoradi.exchangeFee",
  "citiesByCountry.GH.tamale.deliveryFee",
  "citiesByCountry.GH.tamale.exchangeFee",
]);

const INTENDED_SET = new Set(INTENDED_GHANA_FEE_PATHS);

export const isGhanaFee = (p) => INTENDED_SET.has(p);

export function compareStructures(live, source) {
  const livePaths = paths(live);
  const srcPaths = paths(source);

  const onlyLive = [...livePaths].filter((p) => !srcPaths.has(p)).sort();
  const onlySource = [...srcPaths].filter((p) => !livePaths.has(p)).sort();
  const common = [...srcPaths].filter((p) => livePaths.has(p));

  const changed = common
    .filter(
      (p) => JSON.stringify(valueAt(live, p)) !== JSON.stringify(valueAt(source, p))
    )
    .sort();

  return {
    onlyLive,
    onlySource,
    changed,
    intended: changed.filter(isGhanaFee),
    unexpected: changed.filter((p) => !isGhanaFee(p)),
  };
}

/**
 * A missing path is a divergence, exactly like an extra or a changed one.
 *
 * `onlySource` was previously excluded from this verdict, so a live document
 * that had LOST expected configuration still reported CLEAN — the failure mode
 * the comparison is most needed for. All three sets must be empty.
 */
export function computeVerdict({ unexpected, onlyLive, onlySource }) {
  return unexpected.length === 0 && onlyLive.length === 0 && onlySource.length === 0
    ? "CLEAN"
    : "REVIEW_REQUIRED";
}

/**
 * Write the snapshot, refusing to clobber an existing file.
 *
 * `flag: "wx"` makes the create-or-fail decision atomic in the kernel, so two
 * concurrent runs cannot both believe the path was free. Throws an error
 * carrying `code = "SNAPSHOT_EXISTS"` rather than exiting, so callers and
 * tests can distinguish refusal from a genuine I/O failure.
 */
export function writeSnapshotExclusive(outPath, doc) {
  try {
    fs.writeFileSync(outPath, JSON.stringify(doc, null, 2), {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (err) {
    if (err && err.code === "EEXIST") {
      const refusal = new Error(
        `REFUSED: ${outPath} already exists. A snapshot is evidence; ` +
          `choose another --out rather than overwriting it.`
      );
      refusal.code = "SNAPSHOT_EXISTS";
      throw refusal;
    }
    throw err;
  }
}

// ---- CLI ------------------------------------------------------------------

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, ...rest] = a.replace(/^--/, "").split("=");
      return [k, rest.join("=")];
    })
  );

  if (!args.project) {
    console.error("REFUSED: --project=<id> is required.");
    process.exit(2);
  }
  if (args.project !== ALLOWED_PROJECT) {
    console.error(
      `REFUSED: this script only reads '${ALLOWED_PROJECT}' (got '${args.project}').`
    );
    process.exit(2);
  }
  if (!args.out) {
    console.error("REFUSED: --out=<file> is required (the document is saved, not printed).");
    process.exit(2);
  }

  // Fail before touching Firestore when the answer is already known. The `wx`
  // flag below remains the real guarantee: this check alone would be racy.
  if (fs.existsSync(args.out)) {
    console.error(
      `REFUSED: ${args.out} already exists. A snapshot is evidence; ` +
        `choose another --out rather than overwriting it.`
    );
    process.exit(4);
  }

  const { initializeApp, applicationDefault, getApps } = await import(
    "firebase-admin/app"
  );
  const { getFirestore } = await import("firebase-admin/firestore");

  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault(), projectId: args.project });
  }
  const db = getFirestore();

  const { SYSTEM_CONFIG } = await import("./lib/seedSystemConfig.mjs");

  const snap = await db.collection("system_config").doc("main").get();
  if (!snap.exists) {
    console.error("REFUSED: system_config/main does not exist on this project.");
    process.exit(3);
  }
  const live = snap.data();

  try {
    writeSnapshotExclusive(args.out, live);
  } catch (err) {
    if (err.code === "SNAPSHOT_EXISTS") {
      console.error(err.message);
      process.exit(4);
    }
    throw err;
  }
  console.log(`Saved live document to ${args.out} (not printed).`);

  const { onlyLive, onlySource, intended, unexpected } = compareStructures(
    live,
    SYSTEM_CONFIG
  );

  console.log("\n--- root keys ---");
  console.log("live  :", Object.keys(live).sort().join(", "));
  console.log("source:", Object.keys(SYSTEM_CONFIG).sort().join(", "));

  console.log(`\n--- INTENDED (Ghana fees): ${intended.length} ---`);
  for (const p of intended) {
    console.log(`  ${p}: ${valueAt(live, p)} -> ${valueAt(SYSTEM_CONFIG, p)}`);
  }

  console.log(`\n--- UNEXPECTED value divergences: ${unexpected.length} ---`);
  for (const p of unexpected) console.log(`  ${p}`); // path only, no value

  console.log(`\n--- present live, absent from source: ${onlyLive.length} ---`);
  for (const p of onlyLive) console.log(`  ${p}`);

  console.log(`\n--- present in source, absent live: ${onlySource.length} ---`);
  for (const p of onlySource) console.log(`  ${p}`);

  console.log(`\nVERDICT: ${computeVerdict({ unexpected, onlyLive, onlySource })}`);
  process.exit(0);
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  await main();
}
