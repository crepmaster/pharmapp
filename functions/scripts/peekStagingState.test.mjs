/**
 * Tests for the disclosure boundary of peekStagingState.
 *
 * The script once printed document ids, prices, currency, status and
 * quantities under a header that read "Counts only, no document content
 * printed". The banner was wrong, not the code — and nothing would have caught
 * it drifting back.
 *
 * These tests pin the property that matters: in default mode the report
 * carries counts and nothing else, even when detail documents are handed to
 * the renderer. They use sentinel values that could not plausibly appear by
 * accident, so a leak is unambiguous.
 *
 * Run with Node's built-in runner:
 *   node --test scripts/peekStagingState.test.mjs
 *
 * No network, no credentials, no Firebase SDK: the module imports
 * firebase-admin lazily inside its CLI entry point.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs,
  buildReport,
  COUNTS_ONLY_HINT,
  COLLECTIONS,
  ALLOWED_PROJECT,
} from "./peekStagingState.mjs";

const COUNTS = [
  { name: "pharmacies", count: 7 },
  { name: "exchange_proposals", count: 3 },
];

// Sentinels: distinctive enough that finding one in the output proves a leak.
const PROPOSALS = [
  {
    id: "PROPID-SENTINEL",
    data: {
      details: {
        type: "purchase",
        unitPrice: 424242,
        totalPrice: 848484,
        currency: "CURRENCY-SENTINEL",
      },
      status: "STATUS-SENTINEL",
      deliveryId: "DELIVERYID-SENTINEL",
    },
  },
];

const INVENTORY = [
  {
    id: "INVID-SENTINEL",
    data: {
      totalQuantity: 313131,
      availableQuantity: 212121,
      reservedQuantity: 111111,
      availabilitySettings: { availableForExchange: true, minExchangeQuantity: 5 },
    },
  },
];

const SENTINELS = [
  "PROPID-SENTINEL",
  "CURRENCY-SENTINEL",
  "STATUS-SENTINEL",
  "DELIVERYID-SENTINEL",
  "INVID-SENTINEL",
  "424242",
  "848484",
  "313131",
  "212121",
  "111111",
];

describe("parseArgs", () => {
  test("reads the project and defaults details to false", () => {
    const a = parseArgs([`--project=${ALLOWED_PROJECT}`]);
    assert.equal(a.project, ALLOWED_PROJECT);
    assert.equal(a.details, false);
  });

  test("--details is opt-in and order-independent", () => {
    assert.equal(parseArgs(["--details", `--project=${ALLOWED_PROJECT}`]).details, true);
    assert.equal(parseArgs([`--project=${ALLOWED_PROJECT}`, "--details"]).details, true);
  });
});

describe("buildReport — default mode discloses nothing but counts", () => {
  test("emits no id and no business field even when documents are supplied", () => {
    const out = buildReport({
      counts: COUNTS,
      proposals: PROPOSALS,
      inventory: INVENTORY,
      details: false,
    }).join("\n");

    for (const s of SENTINELS) {
      assert.ok(!out.includes(s), `default mode leaked ${s}`);
    }
  });

  test("emits exactly one line per counted collection, plus the hint", () => {
    const lines = buildReport({ counts: COUNTS, details: false });

    assert.match(lines[0], /^pharmacies\s+7$/);
    assert.match(lines[1], /^exchange_proposals\s+3$/);
    assert.equal(lines.at(-1), COUNTS_ONLY_HINT);
    assert.equal(lines.length, COUNTS.length + 2); // counts + blank + hint
  });

  test("details defaults to false when the caller omits it", () => {
    const out = buildReport({ counts: COUNTS, proposals: PROPOSALS }).join("\n");
    assert.ok(!out.includes("PROPID-SENTINEL"));
    assert.ok(out.includes(COUNTS_ONLY_HINT));
  });
});

describe("buildReport — --details discloses the shape fields", () => {
  test("prints proposal and inventory sentinels when explicitly asked", () => {
    const out = buildReport({
      counts: COUNTS,
      proposals: PROPOSALS,
      inventory: INVENTORY,
      details: true,
    }).join("\n");

    for (const s of SENTINELS) {
      assert.ok(out.includes(s), `--details should have printed ${s}`);
    }
    assert.ok(!out.includes(COUNTS_ONLY_HINT));
  });
});

describe("collection list", () => {
  test("is frozen so a caller cannot widen the scan at runtime", () => {
    assert.ok(Object.isFrozen(COLLECTIONS));
    assert.throws(() => COLLECTIONS.push("users"), TypeError);
  });
});
