/**
 * Sprint 2A.1 + 2A.2 — Firestore rules tests for F-LICENSE.
 *
 * Architect's non-negotiable acceptance criterion (kept as the headline
 * test REQ-2A1-001) : a client tentative to create `pharmacies/{uid}`
 * with `licenseStatus: "verified"` MUST fail.
 *
 * Sprint 2A.2 (architect finding #3) : the per-field coverage is now
 * paramétrisée sur `PROTECTED_LICENSE_FIELDS` (la single-source-of-truth
 * exportée par `lib/licenseGate.ts`) — chaque ajout de champ licence
 * gagne automatiquement un test create + update sans toucher à ce
 * fichier. Originel : 6 champs sur create / 3 sur update. Cible 2A.2 :
 * 9 champs sur create ET 9 sur update.
 *
 * This test file runs ONLY via `npm run test:rules`. Excluded from the
 * default `npm test` suite (see `testPathIgnorePatterns` in
 * `jest.config.cjs`) so CI environments without Java / Firebase
 * emulator can still run the standard suite.
 */
import fs from "fs";
import path from "path";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import {
  PROTECTED_LICENSE_FIELDS,
  type ProtectedLicenseField,
} from "../lib/licenseGate.js";

let testEnv: RulesTestEnvironment;

const ALICE_UID = "alice";

/**
 * Minimal valid pharmacy payload matching `isValidPharmacyData` in
 * `firestore.rules`. Kept inline to avoid coupling with any production
 * model.
 */
const VALID_PHARMACY_BASE = Object.freeze({
  email: "alice@example.test",
  pharmacyName: "Alice Pharmacy",
  phoneNumber: "+237670000001",
  address: "123 Test Street, Douala",
  role: "pharmacy",
  isActive: true,
});

/**
 * Sample value per protected field used to assemble a deny payload.
 * Each value is realistic enough that a misconfigured rule could plausibly
 * accept it — keeps the test honest.
 */
function sampleValueFor(field: ProtectedLicenseField): unknown {
  switch (field) {
    case "licenseStatus":
      return "verified"; // the headline self-verification attempt
    case "licenseVerifiedBy":
      return "self-verifying-uid";
    case "licenseVerifiedAt":
      return serverTimestamp();
    case "licenseRejectionReason":
      return "preempted rejection note";
    case "licenseGraceEndsAt":
      return serverTimestamp();
    case "licenseNumber":
      return "PMC-PRE-FORGED-12345678";
    case "licenseCountryCode":
      return "GH";
    case "licenseDocumentUrl":
      return "https://example.test/forged-doc.pdf";
    case "licenseExpiryDate":
      return serverTimestamp();
  }
}

beforeAll(async () => {
  const rulesPath = path.resolve(__dirname, "../../../firestore.rules");
  const rules = fs.readFileSync(rulesPath, "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: "demo-pharmapp-rules",
    firestore: {
      rules,
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

describe("Sprint 2A.1 + 2A.2 — F-LICENSE rules: deny client license-field writes", () => {
  // ─── HEADLINE / NON-NEGOTIABLE ACCEPTANCE ─────────────────────────────

  test("REQ-2A1-001: client create with licenseStatus='verified' → DENIED (architect's non-negotiable acceptance)", async () => {
    // Kept explicit even though the parametrized suite below covers
    // this case again. The architect's review pins this as the
    // canonical proof; the test name is the contract.
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertFails(
      setDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
        ...VALID_PHARMACY_BASE,
        licenseStatus: "verified",
      })
    );
  });

  // ─── PARAMETRIZED CREATE DENY (9 fields) ──────────────────────────────

  describe("create with any single PROTECTED_LICENSE_FIELDS member → DENIED", () => {
    test.each(PROTECTED_LICENSE_FIELDS)(
      "REQ-2A2-CREATE: client create with %s → DENIED",
      async (field) => {
        const alice = testEnv.authenticatedContext(ALICE_UID);
        await assertFails(
          setDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
            ...VALID_PHARMACY_BASE,
            [field]: sampleValueFor(field),
          })
        );
      }
    );
  });

  // ─── PARAMETRIZED UPDATE DENY (9 fields) ──────────────────────────────

  describe("update setting any single PROTECTED_LICENSE_FIELDS member → DENIED", () => {
    // We seed a clean doc via admin-SDK (rules-bypassing context) before
    // each parametrized case, then try the update as the owner.
    test.each(PROTECTED_LICENSE_FIELDS)(
      "REQ-2A2-UPDATE: client update setting %s on existing pharmacy → DENIED",
      async (field) => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(doc(ctx.firestore(), `pharmacies/${ALICE_UID}`), {
            ...VALID_PHARMACY_BASE,
          });
        });
        const alice = testEnv.authenticatedContext(ALICE_UID);
        await assertFails(
          updateDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
            [field]: sampleValueFor(field),
          })
        );
      }
    );
  });

  // ─── CREATE ALLOW SCENARIO ────────────────────────────────────────────

  test("REQ-2A1-007: client create with NO license field → ALLOWED (legit registration path)", async () => {
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertSucceeds(
      setDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
        ...VALID_PHARMACY_BASE,
      })
    );
  });

  // ─── UPDATE ALLOW SCENARIO (non-license fields) ───────────────────────

  test("REQ-2A1-011: client update non-license field (phoneNumber) → ALLOWED", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `pharmacies/${ALICE_UID}`), {
        ...VALID_PHARMACY_BASE,
      });
    });
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertSucceeds(
      updateDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
        ...VALID_PHARMACY_BASE,
        phoneNumber: "+237680000002",
      })
    );
  });

  // ─── BACKEND BYPASS (admin SDK / service account) ─────────────────────

  test("REQ-2A1-012: admin SDK can set licenseStatus (rules bypassed for backend callables)", async () => {
    // This emulates how `adminVerifyPharmacyLicense` runs — with admin
    // privileges, rules don't apply. Documents the expected backend
    // bypass that the F-LICENSE callables rely on.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `pharmacies/${ALICE_UID}`), {
        ...VALID_PHARMACY_BASE,
      });
      await assertSucceeds(
        updateDoc(doc(ctx.firestore(), `pharmacies/${ALICE_UID}`), {
          licenseStatus: "verified",
          licenseVerifiedBy: "admin-uid",
          licenseVerifiedAt: serverTimestamp(),
        })
      );
    });
  });
});

// ===========================================================================
// Sprint 2B.2b — Marketplace listing hard-block contract
// ===========================================================================

describe("Sprint 2B.2b — pharmacies collection: allow get vs deny list", () => {
  /**
   * The hard-block contract : a modified client must not be able to
   * list pharmacies (queries are denied). Backend-owned listing goes
   * through the `getMarketplacePharmacies` callable, which runs with
   * admin SDK privileges and bypasses these rules. UID lookups via
   * `getDoc` remain allowed so profile / correction / cross-pharmacy
   * resolution paths keep working.
   */

  test("REQ-2B2B-001: authenticated client doing collection list → DENIED", async () => {
    // Seed two pharmacies via admin SDK bypass so the listing query
    // would have something to return *if* the rule wasn't blocking it.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `pharmacies/${ALICE_UID}`), {
        ...VALID_PHARMACY_BASE,
      });
      await setDoc(doc(ctx.firestore(), `pharmacies/bob`), {
        ...VALID_PHARMACY_BASE,
        email: "bob@example.test",
        pharmacyName: "Bob Pharmacy",
        phoneNumber: "+237670000002",
      });
    });
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertFails(getDocs(collection(alice.firestore(), "pharmacies")));
  });

  test("REQ-2B2B-002: authenticated client doing where-query on pharmacies → DENIED", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `pharmacies/${ALICE_UID}`), {
        ...VALID_PHARMACY_BASE,
        countryCode: "GH",
        cityCode: "accra",
      });
    });
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertFails(
      getDocs(
        query(
          collection(alice.firestore(), "pharmacies"),
          where("countryCode", "==", "GH")
        )
      )
    );
  });

  test("REQ-2B2B-003: authenticated client doing getDoc by UID → ALLOWED (profile / correction lookup)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `pharmacies/${ALICE_UID}`), {
        ...VALID_PHARMACY_BASE,
      });
    });
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertSucceeds(
      getDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`))
    );
  });

  test("REQ-2B2B-004: unauthenticated client cannot list pharmacies either", async () => {
    const guest = testEnv.unauthenticatedContext();
    await assertFails(getDocs(collection(guest.firestore(), "pharmacies")));
  });

  test("REQ-2B2B-005: admin SDK (rules-bypass) can list pharmacies", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `pharmacies/${ALICE_UID}`), {
        ...VALID_PHARMACY_BASE,
      });
      await assertSucceeds(getDocs(collection(ctx.firestore(), "pharmacies")));
    });
  });
});
