/**
 * SEC-001 — Drift guard between `PROTECTED_SUBSCRIPTION_FIELDS`
 * (functions/src/lib/subscriptionFields.ts) and `firestore.rules`.
 *
 * Same reasoning as the license-field guard (Sprint 2A.3): the TS constant
 * is described as the single source of truth, but the rules file restates
 * the list by hand in each `allow update` clause. The two can drift silently
 * when a sixth field is added on one side only. (The create side used to
 * restate it too, via a per-field helper; the territory-anchor phase removed
 * that when client create was denied outright.)
 *
 * This does NOT generate rules from the constant (no codegen magic). It
 * reads firestore.rules as text and asserts each field is guarded on the
 * update side, and that client create is denied outright. A field added to
 * TS but forgotten in the rules fails here.
 *
 * Runs in the standard `npm test` suite — pure file read, no emulator.
 */
import fs from "fs";
import path from "path";
import { PROTECTED_SUBSCRIPTION_FIELDS } from "../lib/subscriptionFields.js";

describe("PROTECTED_SUBSCRIPTION_FIELDS drift guard vs firestore.rules", () => {
  const rulesPath = path.resolve(__dirname, "../../../firestore.rules");
  const rulesText = fs.readFileSync(rulesPath, "utf8");

  test("client create is denied outright in firestore.rules", () => {
    // Territory anchor (phase 1): `allow create: if false` denies EVERY
    // client create — a strictly stronger guarantee than the old per-field
    // pharmacySubscriptionFieldsAbsentAtCreate helper, which the diff removed
    // rather than leave as dead code. The subscription fields stay guarded on
    // the update side (asserted below).
    expect(rulesText).toMatch(/allow create:\s*if false/);
  });

  test.each(PROTECTED_SUBSCRIPTION_FIELDS)(
    "%s is guarded on update in firestore.rules",
    (field) => {
      // Each field needs its own !pharmacySubscriptionFieldChanged clause
      // in the pharmacies `allow update`.
      expect(rulesText).toContain(
        `!pharmacySubscriptionFieldChanged(resource.data, request.resource.data, '${field}')`
      );
    }
  );

  test("the update-side change helper exists", () => {
    // The create-side absent-at-create helper was removed with the territory
    // anchor (client create is now denied outright); only the per-field
    // update guard remains.
    expect(rulesText).toContain("function pharmacySubscriptionFieldChanged(before, after, name)");
  });

  test("the constant is not silently empty", () => {
    // A guard that iterates an empty list would pass vacuously.
    expect(PROTECTED_SUBSCRIPTION_FIELDS.length).toBeGreaterThanOrEqual(5);
  });
});
