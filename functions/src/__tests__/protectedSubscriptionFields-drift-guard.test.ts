/**
 * SEC-001 — Drift guard between `PROTECTED_SUBSCRIPTION_FIELDS`
 * (functions/src/lib/subscriptionFields.ts) and `firestore.rules`.
 *
 * Same reasoning as the license-field guard (Sprint 2A.3): the TS constant
 * is described as the single source of truth, but the rules file restates
 * the list by hand — once in `pharmacySubscriptionFieldsAbsentAtCreate`
 * and once per `allow update` clause. The two can drift silently when a
 * sixth field is added on one side only.
 *
 * This does NOT generate rules from the constant (no codegen magic). It
 * reads firestore.rules as text and asserts each field appears on both the
 * create side and the update side. A field added to TS but forgotten in
 * the rules fails here.
 *
 * Runs in the standard `npm test` suite — pure file read, no emulator.
 */
import fs from "fs";
import path from "path";
import { PROTECTED_SUBSCRIPTION_FIELDS } from "../lib/subscriptionFields.js";

describe("PROTECTED_SUBSCRIPTION_FIELDS drift guard vs firestore.rules", () => {
  const rulesPath = path.resolve(__dirname, "../../../firestore.rules");
  const rulesText = fs.readFileSync(rulesPath, "utf8");

  test.each(PROTECTED_SUBSCRIPTION_FIELDS)(
    "%s is denied at create in firestore.rules",
    (field) => {
      // The create-side helper must list the field.
      const createHelper = rulesText.match(
        /function pharmacySubscriptionFieldsAbsentAtCreate\(data\)\s*\{[\s\S]*?\}/
      );
      expect(createHelper).not.toBeNull();
      expect(createHelper![0]).toContain(`'${field}'`);
    }
  );

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

  test("both rules helpers exist", () => {
    expect(rulesText).toContain("function pharmacySubscriptionFieldsAbsentAtCreate(data)");
    expect(rulesText).toContain("function pharmacySubscriptionFieldChanged(before, after, name)");
  });

  test("the constant is not silently empty", () => {
    // A guard that iterates an empty list would pass vacuously.
    expect(PROTECTED_SUBSCRIPTION_FIELDS.length).toBeGreaterThanOrEqual(5);
  });
});
