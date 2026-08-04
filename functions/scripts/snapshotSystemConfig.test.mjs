/**
 * Tests for the two guards of snapshotSystemConfig.
 *
 * Both exist because a reviewer caught them failing open:
 *   · the verdict ignored `onlySource`, so a live document that had LOST
 *     expected configuration still reported CLEAN — the very failure the
 *     comparison is most needed for;
 *   · the snapshot was written with a plain `writeFileSync`, silently
 *     replacing an existing file. A snapshot is evidence; overwriting it
 *     destroys the thing it was taken to preserve.
 *
 * Run with Node's built-in runner (`node --test`), like the deployment
 * barrier next door:
 *   node --test scripts/snapshotSystemConfig.test.mjs
 *
 * These tests touch no network, no credentials and no Firebase SDK — the
 * module imports firebase-admin lazily inside its CLI entry point, so this
 * file runs even with no dependencies installed. File cases use throwaway
 * fixtures under the OS temp directory.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  compareStructures,
  computeVerdict,
  writeSnapshotExclusive,
  paths,
  isGhanaFee,
  INTENDED_GHANA_FEE_PATHS,
} from "./snapshotSystemConfig.mjs";
import { SYSTEM_CONFIG } from "./lib/seedSystemConfig.mjs";

const SOURCE = {
  currencies: { GHS: { decimals: 2 }, XAF: { decimals: 0 } },
  citiesByCountry: {
    GH: { accra: { deliveryFee: 30, exchangeFee: 15 } },
  },
};

describe("computeVerdict", () => {
  test("CLEAN only when all three divergence sets are empty", () => {
    assert.equal(
      computeVerdict({ unexpected: [], onlyLive: [], onlySource: [] }),
      "CLEAN"
    );
  });

  test("REVIEW_REQUIRED when an expected path is missing live (the regression)", () => {
    assert.equal(
      computeVerdict({ unexpected: [], onlyLive: [], onlySource: ["currencies.XAF.decimals"] }),
      "REVIEW_REQUIRED"
    );
  });

  test("REVIEW_REQUIRED on an unknown extra path live", () => {
    assert.equal(
      computeVerdict({ unexpected: [], onlyLive: ["mystery.key"], onlySource: [] }),
      "REVIEW_REQUIRED"
    );
  });

  test("REVIEW_REQUIRED on an unexpected value divergence", () => {
    assert.equal(
      computeVerdict({ unexpected: ["currencies.GHS.decimals"], onlyLive: [], onlySource: [] }),
      "REVIEW_REQUIRED"
    );
  });
});

describe("compareStructures feeding the verdict", () => {
  test("an identical document is CLEAN", () => {
    const cmp = compareStructures(structuredClone(SOURCE), SOURCE);
    assert.deepEqual(cmp.onlySource, []);
    assert.equal(computeVerdict(cmp), "CLEAN");
  });

  test("a live document missing an expected path is REVIEW_REQUIRED", () => {
    const live = structuredClone(SOURCE);
    delete live.currencies.XAF;

    const cmp = compareStructures(live, SOURCE);
    assert.deepEqual(cmp.onlySource, ["currencies.XAF.decimals"]);
    assert.deepEqual(cmp.unexpected, []);
    assert.deepEqual(cmp.onlyLive, []);
    // Every other set is empty: without the onlySource term this returned CLEAN.
    assert.equal(computeVerdict(cmp), "REVIEW_REQUIRED");
  });

  test("a Ghana fee difference is intended and stays CLEAN", () => {
    const live = structuredClone(SOURCE);
    live.citiesByCountry.GH.accra.deliveryFee = 999;

    const cmp = compareStructures(live, SOURCE);
    assert.deepEqual(cmp.intended, ["citiesByCountry.GH.accra.deliveryFee"]);
    assert.deepEqual(cmp.unexpected, []);
    assert.equal(computeVerdict(cmp), "CLEAN");
  });

  test("a non-Ghana value difference is unexpected", () => {
    const live = structuredClone(SOURCE);
    live.currencies.GHS.decimals = 4;

    const cmp = compareStructures(live, SOURCE);
    assert.deepEqual(cmp.unexpected, ["currencies.GHS.decimals"]);
    assert.equal(computeVerdict(cmp), "REVIEW_REQUIRED");
  });
});

describe("Ghana fee allowlist is closed", () => {
  test("a Ghana fee path outside the allowlist is UNEXPECTED, not intended", () => {
    // Shaped exactly like an allowed path — only the city differs. The former
    // regex matched this and would have absolved it.
    const source = {
      citiesByCountry: { GH: { ho: { deliveryFee: 30 } } },
    };
    const live = { citiesByCountry: { GH: { ho: { deliveryFee: 999 } } } };

    assert.equal(isGhanaFee("citiesByCountry.GH.ho.deliveryFee"), false);

    const cmp = compareStructures(live, source);
    assert.deepEqual(cmp.intended, []);
    assert.deepEqual(cmp.unexpected, ["citiesByCountry.GH.ho.deliveryFee"]);
    assert.equal(computeVerdict(cmp), "REVIEW_REQUIRED");
  });

  test("every allowlisted path is recognised as intended", () => {
    for (const p of INTENDED_GHANA_FEE_PATHS) {
      assert.equal(isGhanaFee(p), true, `${p} should be intended`);
    }
  });

  /**
   * Drift guard. The allowlist was written from SYSTEM_CONFIG; if a Ghana city
   * or fee is added to the seed without a deliberate edit here, the comparison
   * would start reporting it as an unexpected divergence forever — or, worse,
   * a stale allowlist would absolve something no longer meant to change. The
   * comment that claimed "five paths" while nine existed is exactly this drift.
   */
  test("the allowlist matches the Ghana fee paths actually in SYSTEM_CONFIG", () => {
    const actual = [...paths(SYSTEM_CONFIG)]
      .filter((p) => /^citiesByCountry\.GH\..+\.(deliveryFee|exchangeFee)$/.test(p))
      .sort();

    assert.deepEqual([...INTENDED_GHANA_FEE_PATHS].sort(), actual);
    assert.equal(actual.length, 9);
  });
});

describe("writeSnapshotExclusive", () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-test-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("writes the document when the path is free", () => {
    const out = path.join(dir, "snap.json");
    writeSnapshotExclusive(out, { a: 1 });

    assert.deepEqual(JSON.parse(fs.readFileSync(out, "utf8")), { a: 1 });
  });

  test("refuses an existing file and leaves it byte-for-byte intact", () => {
    const out = path.join(dir, "snap.json");
    const evidence = '{"original":"evidence"}';
    fs.writeFileSync(out, evidence, "utf8");

    assert.throws(
      () => writeSnapshotExclusive(out, { replacement: true }),
      (err) => err.code === "SNAPSHOT_EXISTS"
    );
    assert.equal(fs.readFileSync(out, "utf8"), evidence);
  });

  test("refuses an existing EMPTY file — emptiness is not permission to write", () => {
    const out = path.join(dir, "snap.json");
    fs.writeFileSync(out, "", "utf8");

    assert.throws(
      () => writeSnapshotExclusive(out, { a: 1 }),
      (err) => err.code === "SNAPSHOT_EXISTS"
    );
    assert.equal(fs.readFileSync(out, "utf8"), "");
  });

  test("a genuine I/O failure is not disguised as a refusal", () => {
    const out = path.join(dir, "missing-dir", "snap.json");

    assert.throws(
      () => writeSnapshotExclusive(out, { a: 1 }),
      (err) => err.code === "ENOENT"
    );
  });
});
