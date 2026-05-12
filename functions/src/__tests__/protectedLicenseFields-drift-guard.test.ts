/**
 * Sprint 2A.3 F2A3-FINDING-3 — Drift guard between the TypeScript
 * `PROTECTED_LICENSE_FIELDS` constant (in `functions/src/lib/licenseGate.ts`)
 * and the Firestore security rules in `firestore.rules`.
 *
 * The architect's finding was that `PROTECTED_LICENSE_FIELDS` was sold
 * as a "single source of truth" but `firestore.rules` actually
 * duplicates the list manually in its `pharmacyLicenseFieldsAbsentAtCreate`
 * helper and in each `allow update` clause. The TS list and the rules
 * list can drift silently if a future engineer adds a 10th field on one
 * side but not the other.
 *
 * This test does NOT regenerate the rules from the TS list (avoiding
 * the magic-codegen path the architect was wary of). Instead it
 * **reads** firestore.rules as plain text and asserts that every entry
 * in `PROTECTED_LICENSE_FIELDS` appears in the rules file. If a field
 * is added to TS but forgotten on the rules side, this test fails.
 *
 * Runs in the standard `npm test` suite (no emulator / Java needed —
 * pure file-read + string check).
 */
import fs from "fs";
import path from "path";
import { PROTECTED_LICENSE_FIELDS } from "../lib/licenseGate.js";

describe("PROTECTED_LICENSE_FIELDS drift guard vs firestore.rules", () => {
  const rulesPath = path.resolve(__dirname, "../../../firestore.rules");
  const rulesText = fs.readFileSync(rulesPath, "utf8");

  test.each(PROTECTED_LICENSE_FIELDS)(
    "field '%s' appears in firestore.rules",
    (field) => {
      // The rules reference each field as a string literal — either in
      // pharmacyLicenseFieldsAbsentAtCreate's array, or as the third
      // argument to pharmacyLicenseFieldChanged in the allow update
      // clause. Both forms produce the literal field name surrounded by
      // single quotes in the rules text.
      const quoted = `'${field}'`;
      expect(rulesText).toContain(quoted);
    }
  );

  test("rules deny-on-create helper references PROTECTED_LICENSE_FIELDS-equivalent list", () => {
    // Sanity: the dedicated helper for create-time deny exists.
    expect(rulesText).toMatch(/pharmacyLicenseFieldsAbsentAtCreate/);
  });

  test("rules update-clause helper references the per-field change check", () => {
    expect(rulesText).toMatch(/pharmacyLicenseFieldChanged/);
  });

  test("PROTECTED_LICENSE_FIELDS has the expected canonical size", () => {
    // If this changes, the rules MUST change too — this test won't catch
    // a silent shrinkage (a field removed from both), but it makes the
    // delta explicit in the diff.
    expect(PROTECTED_LICENSE_FIELDS.length).toBe(9);
  });
});
