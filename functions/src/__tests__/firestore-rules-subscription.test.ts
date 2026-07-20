/**
 * SEC-001 — Firestore rules: a pharmacy cannot grant itself a subscription.
 *
 * These assertions were first written as a PROBE that recorded observed
 * behaviour rather than asserting it. Every self-grant attempt came back
 * ALLOWED (see docs/security/SEC-001-subscription-self-grant.md). They are
 * now regression tests asserting the secure behaviour.
 *
 * What made this severe: the fields below are read as authority by BOTH
 * layers — `hasActiveSubscription()` in these rules (8 call sites) and
 * `getValidSubscription()` in subscriptionValidators.ts. A server-side
 * check reading a client-writable field is not a check. Fixing the rules
 * fixes both.
 *
 * Runs only via `npm run test:rules`.
 */
import fs from "fs";
import path from "path";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { deleteField, doc, setDoc, updateDoc } from "firebase/firestore";

import {
  PROTECTED_SUBSCRIPTION_FIELDS,
  type ProtectedSubscriptionField,
} from "../lib/subscriptionFields.js";

let testEnv: RulesTestEnvironment;

const ALICE_UID = "alice-sec001";
const MALLORY_UID = "mallory-sec001";

/** Valid pharmacy with NO subscription state — what the backend creates. */
const PHARMACY_BASE = Object.freeze({
  email: "alice@example.test",
  pharmacyName: "Alice Pharmacy",
  phoneNumber: "+237670000001",
  address: "123 Test Street, Douala",
  role: "pharmacy",
  isActive: true,
});

/** A paywalled pharmacy: the state an attacker would want to escape. */
const PHARMACY_EXPIRED = Object.freeze({
  ...PHARMACY_BASE,
  hasActiveSubscription: false,
  subscriptionStatus: "expired",
  subscriptionPlan: "basic",
  subscriptionStartDate: new Date("2026-01-01T00:00:00Z"),
  subscriptionEndDate: new Date("2026-02-01T00:00:00Z"),
});

const FUTURE = new Date("2099-01-01T00:00:00Z");

/**
 * A realistic escalation value per field — realistic enough that a
 * misconfigured rule would plausibly accept it.
 */
function escalationValueFor(field: ProtectedSubscriptionField): unknown {
  switch (field) {
    case "hasActiveSubscription":
      return true;
    case "subscriptionStatus":
      return "active";
    case "subscriptionEndDate":
      return FUTURE;
    case "subscriptionPlan":
      return "enterprise";
    case "subscriptionStartDate":
      return new Date("2026-07-01T00:00:00Z");
  }
}

beforeAll(async () => {
  const rulesPath = path.resolve(__dirname, "../../../firestore.rules");
  const rules = fs.readFileSync(rulesPath, "utf8");
  testEnv = await initializeTestEnvironment({
    // Own projectId — Jest runs rules suites in parallel workers against
    // one emulator, and a shared projectId lets one suite's
    // clearFirestore() wipe another's seed mid-test.
    projectId: "demo-pharmapp-rules-c2",
    firestore: { rules, host: "127.0.0.1", port: 8080 },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  if (testEnv) await testEnv.clearFirestore();
});

async function seedExpiredPharmacy() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `pharmacies/${ALICE_UID}`), {
      ...PHARMACY_EXPIRED,
    });
  });
}

describe("SEC-001 — subscription fields absent at client create", () => {
  test.each(PROTECTED_SUBSCRIPTION_FIELDS)(
    "REQ-SEC001-CREATE: client create carrying %s → DENIED",
    async (field) => {
      const alice = testEnv.authenticatedContext(ALICE_UID);
      await assertFails(
        setDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
          ...PHARMACY_BASE,
          [field]: escalationValueFor(field),
        })
      );
    }
  );

  test("REQ-SEC001-001: client create with NO subscription field → ALLOWED", async () => {
    // Positive control: the hardening must not block account creation.
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertSucceeds(
      setDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), PHARMACY_BASE)
    );
  });

  test("REQ-SEC001-002: admin SDK create WITH subscription fields → ALLOWED", async () => {
    // createPharmacyRegistration sets trial state server-side; it must
    // remain able to.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await assertSucceeds(
        setDoc(doc(ctx.firestore(), `pharmacies/${ALICE_UID}`), {
          ...PHARMACY_BASE,
          hasActiveSubscription: true,
          subscriptionStatus: "trial",
          subscriptionEndDate: FUTURE,
        })
      );
    });
  });
});

describe("SEC-001 — subscription fields immutable on client update", () => {
  test.each(PROTECTED_SUBSCRIPTION_FIELDS)(
    "REQ-SEC001-UPDATE: client update setting %s → DENIED",
    async (field) => {
      await seedExpiredPharmacy();
      const alice = testEnv.authenticatedContext(ALICE_UID);
      await assertFails(
        updateDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
          [field]: escalationValueFor(field),
        })
      );
    }
  );

  test("REQ-SEC001-003: the realistic attack — all four at once → DENIED", async () => {
    // This exact payload satisfies hasActiveSubscription() in the rules
    // AND getValidSubscription() in the backend. It was ALLOWED before.
    await seedExpiredPharmacy();
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertFails(
      updateDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
        hasActiveSubscription: true,
        subscriptionStatus: "active",
        subscriptionEndDate: FUTURE,
        subscriptionPlan: "enterprise",
      })
    );
  });

  test("REQ-SEC001-004: erasing subscriptionStartDate → DENIED", async () => {
    // Secondary vector: shouldStartTrial() treats a present
    // subscriptionStartDate as proof a trial was already consumed.
    // Deleting it would allow claiming a second trial.
    await seedExpiredPharmacy();
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertFails(
      updateDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
        subscriptionStartDate: deleteField(),
      })
    );
  });

  test.each(PROTECTED_SUBSCRIPTION_FIELDS)(
    "REQ-SEC001-DELETE: erasing %s → DENIED",
    async (field) => {
      await seedExpiredPharmacy();
      const alice = testEnv.authenticatedContext(ALICE_UID);
      await assertFails(
        updateDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
          [field]: deleteField(),
        })
      );
    }
  );
});

describe("SEC-001 — legitimate flows preserved", () => {
  test("REQ-SEC001-005: updating ordinary profile fields → ALLOWED", async () => {
    await seedExpiredPharmacy();
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertSucceeds(
      updateDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
        address: "456 New Street, Douala",
        pharmacyName: "Alice Pharmacy Renamed",
        phoneNumber: "+237670000002",
      })
    );
  });

  test("REQ-SEC001-006: re-sending IDENTICAL subscription values → ALLOWED", async () => {
    // A client that reads the doc and writes it back unchanged must not be
    // broken — only actual changes are refused.
    await seedExpiredPharmacy();
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertSucceeds(
      updateDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
        hasActiveSubscription: false,
        subscriptionStatus: "expired",
        address: "789 Another Street",
      })
    );
  });

  test("REQ-SEC001-007: admin SDK can still grant a subscription", async () => {
    // startTrialForPharmacy / sandboxSubscriptionSuccess must keep working.
    await seedExpiredPharmacy();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await assertSucceeds(
        updateDoc(doc(ctx.firestore(), `pharmacies/${ALICE_UID}`), {
          hasActiveSubscription: true,
          subscriptionStatus: "active",
          subscriptionEndDate: FUTURE,
          subscriptionPlan: "professional",
        })
      );
    });
  });

  test("REQ-SEC001-008: another uid cannot touch the document at all", async () => {
    await seedExpiredPharmacy();
    const mallory = testEnv.authenticatedContext(MALLORY_UID);
    await assertFails(
      updateDoc(doc(mallory.firestore(), `pharmacies/${ALICE_UID}`), {
        subscriptionStatus: "active",
      })
    );
  });

  test("REQ-SEC001-009: license correction flow still works", async () => {
    // Sprint 2A hardening must remain intact alongside this one: a
    // non-license, non-subscription update stays allowed.
    await seedExpiredPharmacy();
    const alice = testEnv.authenticatedContext(ALICE_UID);
    await assertSucceeds(
      updateDoc(doc(alice.firestore(), `pharmacies/${ALICE_UID}`), {
        address: "Corrected address for license review",
      })
    );
  });
});
