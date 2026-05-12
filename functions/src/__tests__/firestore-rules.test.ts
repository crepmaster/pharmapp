/**
 * Sprint 2A.1 — Firestore rules tests for F-LICENSE security correction.
 *
 * Architect's non-negotiable acceptance criterion: a client tentative to
 * create `pharmacies/{uid}` with `licenseStatus: "verified"` MUST fail.
 *
 * This test file runs ONLY via `npm run test:rules`, which wraps Jest
 * with `firebase emulators:exec --only firestore` so the Firestore
 * emulator is started on port 8080 and torn down automatically.
 *
 * Excluded from the default `npm test` suite (see
 * `testPathIgnorePatterns` in `jest.config.cjs`) so CI environments
 * without Java / Firebase emulator can still run the standard suite.
 *
 * Scope (per Sprint 2A.1 brief): minimum harness ciblé license fields,
 * NOT a full pharmacy rules suite. Covers the 4 mandatory scenarios:
 *   1. client create with `licenseStatus: "verified"` → denied
 *   2. client create with any other backend-controlled license field → denied
 *   3. client create with no license field → allowed
 *   4. client update setting `licenseStatus` after a legit create → denied
 * Plus a few defensive variants.
 */
import fs from "fs";
import path from "path";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { setDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";

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

describe("Sprint 2A.1 — F-LICENSE rules: deny client license-field writes", () => {
  // ─── CREATE DENY SCENARIOS ────────────────────────────────────────────

  test("REQ-2A1-001: client create with licenseStatus='verified' → DENIED", async () => {
    // The architect's non-negotiable acceptance: a modified client must
    // not be able to self-verify by smuggling licenseStatus into the
    // create payload.
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertFails(
      setDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
        ...VALID_PHARMACY_BASE,
        licenseStatus: "verified",
      })
    );
  });

  test("REQ-2A1-002: client create with licenseVerifiedBy=callerUid → DENIED", async () => {
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertFails(
      setDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
        ...VALID_PHARMACY_BASE,
        licenseVerifiedBy: ALICE_UID,
      })
    );
  });

  test("REQ-2A1-003: client create with licenseVerifiedAt → DENIED", async () => {
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertFails(
      setDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
        ...VALID_PHARMACY_BASE,
        licenseVerifiedAt: serverTimestamp(),
      })
    );
  });

  test("REQ-2A1-004: client create with licenseGraceEndsAt → DENIED", async () => {
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertFails(
      setDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
        ...VALID_PHARMACY_BASE,
        licenseGraceEndsAt: serverTimestamp(),
      })
    );
  });

  test("REQ-2A1-005: client create with licenseNumber → DENIED (must go through submitPharmacyLicense)", async () => {
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertFails(
      setDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
        ...VALID_PHARMACY_BASE,
        licenseNumber: "PMC-12345678",
      })
    );
  });

  test("REQ-2A1-006: client create with licenseRejectionReason → DENIED", async () => {
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertFails(
      setDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
        ...VALID_PHARMACY_BASE,
        licenseRejectionReason: "fake rejection trying to pre-set it",
      })
    );
  });

  // ─── CREATE ALLOW SCENARIOS ───────────────────────────────────────────

  test("REQ-2A1-007: client create with NO license field → ALLOWED (legit registration path)", async () => {
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertSucceeds(
      setDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
        ...VALID_PHARMACY_BASE,
      })
    );
  });

  // ─── UPDATE DENY SCENARIOS ────────────────────────────────────────────

  test("REQ-2A1-008: client update setting licenseStatus='verified' on existing pharmacy → DENIED", async () => {
    // First seed a clean pharmacy doc using admin SDK (rules-bypassing
    // context) so we have something to update.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `pharmacies/${ALICE_UID}`), {
        ...VALID_PHARMACY_BASE,
      });
    });
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertFails(
      updateDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
        licenseStatus: "verified",
      })
    );
  });

  test("REQ-2A1-009: client update setting licenseVerifiedBy → DENIED", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `pharmacies/${ALICE_UID}`), {
        ...VALID_PHARMACY_BASE,
      });
    });
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertFails(
      updateDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
        licenseVerifiedBy: ALICE_UID,
      })
    );
  });

  test("REQ-2A1-010: client update setting licenseNumber direct → DENIED (must use submitPharmacyLicense callable)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `pharmacies/${ALICE_UID}`), {
        ...VALID_PHARMACY_BASE,
      });
    });
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertFails(
      updateDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
        licenseNumber: "PMC-99999999",
      })
    );
  });

  // ─── UPDATE ALLOW SCENARIOS (non-license fields) ──────────────────────

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
