/**
 * Currency sprint C1 — Firestore rules: currency trust boundary.
 *
 * `resolveCurrencyForWalletOwner` derives a wallet's currency from two
 * client-written inputs:
 *
 *   users/{uid}.role|userType  → which profile collection to read
 *   couriers/{uid}.countryCode → which country, hence which currency
 *
 * Both were freely writable by their owner. A modified client could
 * therefore have chosen the currency its own wallet is created in. These
 * tests pin the hardening that closes that boundary BEFORE the resolver is
 * wired into getWallet.
 *
 * Scope note: the rules validate SHAPE only (ISO 3166-1 alpha-2 uppercase).
 * Membership in `system_config.countries` is a backend check, so onboarding
 * a country stays a pure config change with no rules redeploy.
 *
 * Runs only via `npm run test:rules` (needs Java + the Firestore emulator).
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

let testEnv: RulesTestEnvironment;

const COURIER_UID = "courier-c1";
const USER_UID = "user-c1";
const OTHER_UID = "other-c1";

/** Matches what the registration form actually submits (commonData). */
const VALID_COURIER = Object.freeze({
  email: "courier@example.test",
  fullName: "Kwame Courier",
  phoneNumber: "+233240000001",
  vehicleType: "motorcycle",
  licensePlate: "GH-1234-24",
  role: "courier",
  isActive: true,
  countryCode: "GH",
  operatingCity: "Accra",
});

const VALID_USER = Object.freeze({
  uid: USER_UID,
  email: "user@example.test",
  displayName: "Test User",
  role: "courier",
  userType: "courier",
  isActive: true,
});

beforeAll(async () => {
  const rulesPath = path.resolve(__dirname, "../../../firestore.rules");
  const rules = fs.readFileSync(rulesPath, "utf8");
  testEnv = await initializeTestEnvironment({
    // Own projectId — NOT the `demo-pharmapp-rules` used by
    // firestore-rules.test.ts. Jest runs test FILES in parallel workers
    // against the same emulator; sharing a projectId means one file's
    // `clearFirestore()` wipes the other's seeded documents mid-test.
    // That produced two spurious failures (REQ-C1-007 / REQ-C1-015 denied
    // because their seed had vanished) which passed in isolation. Each
    // rules test file must own its Firestore namespace.
    projectId: "demo-pharmapp-rules-c1",
    firestore: { rules, host: "127.0.0.1", port: 8080 },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  if (testEnv) await testEnv.clearFirestore();
});

async function seedCourier(data: Record<string, unknown> = VALID_COURIER) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `couriers/${COURIER_UID}`), data);
  });
}

async function seedUser(data: Record<string, unknown> = VALID_USER) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${USER_UID}`), data);
  });
}

describe("C1 — couriers.countryCode is mandatory at creation", () => {
  test("REQ-C1-001: create WITHOUT countryCode → DENIED", async () => {
    const courier = testEnv.authenticatedContext(COURIER_UID);
    const { countryCode, ...withoutCountry } = VALID_COURIER;
    void countryCode;
    await assertFails(
      setDoc(doc(courier.firestore(), `couriers/${COURIER_UID}`), withoutCountry)
    );
  });

  test("REQ-C1-002: create WITH a valid ISO countryCode → ALLOWED", async () => {
    // Positive control: proves the deny above is about the field, not a
    // broken payload. This is exactly what the registration form submits.
    const courier = testEnv.authenticatedContext(COURIER_UID);
    await assertSucceeds(
      setDoc(doc(courier.firestore(), `couriers/${COURIER_UID}`), VALID_COURIER)
    );
  });
});

describe("C1 — couriers.countryCode must be ISO 3166-1 alpha-2 uppercase", () => {
  const MALFORMED = [
    ["lowercase", "gh"],
    ["mixed case", "Gh"],
    ["three letters", "GHA"],
    ["one letter", "G"],
    ["empty", ""],
    ["digits", "12"],
    ["padded", " GH"],
  ] as const;

  test.each(MALFORMED)("REQ-C1-003: create with %s countryCode → DENIED", async (_label, value) => {
    const courier = testEnv.authenticatedContext(COURIER_UID);
    await assertFails(
      setDoc(doc(courier.firestore(), `couriers/${COURIER_UID}`), {
        ...VALID_COURIER,
        countryCode: value,
      })
    );
  });

  test("REQ-C1-004: non-string countryCode → DENIED", async () => {
    const courier = testEnv.authenticatedContext(COURIER_UID);
    await assertFails(
      setDoc(doc(courier.firestore(), `couriers/${COURIER_UID}`), {
        ...VALID_COURIER,
        countryCode: 233,
      })
    );
  });
});

describe("C1 — couriers.countryCode is immutable client-side", () => {
  test("REQ-C1-005: changing countryCode → DENIED", async () => {
    // The attack: a Ghanaian courier flips to CM so a new wallet would be
    // denominated in XAF instead of GHS.
    await seedCourier();
    const courier = testEnv.authenticatedContext(COURIER_UID);
    await assertFails(
      updateDoc(doc(courier.firestore(), `couriers/${COURIER_UID}`), {
        countryCode: "CM",
      })
    );
  });

  test("REQ-C1-006: deleting countryCode → DENIED", async () => {
    // Deletion must be caught by key-presence comparison, not just value
    // comparison — otherwise the field could be dropped then re-added.
    await seedCourier();
    const courier = testEnv.authenticatedContext(COURIER_UID);
    await assertFails(
      updateDoc(doc(courier.firestore(), `couriers/${COURIER_UID}`), {
        countryCode: deleteField(),
      })
    );
  });

  test("REQ-C1-007: updating another profile field → ALLOWED", async () => {
    // Regression guard: hardening must not freeze the whole document.
    await seedCourier();
    const courier = testEnv.authenticatedContext(COURIER_UID);
    await assertSucceeds(
      updateDoc(doc(courier.firestore(), `couriers/${COURIER_UID}`), {
        licensePlate: "GH-9999-24",
      })
    );
  });

  test("REQ-C1-008: the legacy cityCode self-migration still works", async () => {
    // delivery_service.dart:38 writes {cityCode} on the courier document.
    // A partial update must keep passing: request.resource.data is the
    // merged doc, so countryCode is unchanged and the guard is satisfied.
    await seedCourier();
    const courier = testEnv.authenticatedContext(COURIER_UID);
    await assertSucceeds(
      updateDoc(doc(courier.firestore(), `couriers/${COURIER_UID}`), {
        cityCode: "accra",
      })
    );
  });

  test("REQ-C1-009: re-sending the SAME countryCode → ALLOWED", async () => {
    await seedCourier();
    const courier = testEnv.authenticatedContext(COURIER_UID);
    await assertSucceeds(
      updateDoc(doc(courier.firestore(), `couriers/${COURIER_UID}`), {
        countryCode: "GH",
        operatingCity: "Kumasi",
      })
    );
  });

  test("REQ-C1-010: admin SDK can still change countryCode", async () => {
    // Backend remains authoritative — a future admin correction or
    // backend-owned registration must not be blocked by these rules.
    await seedCourier();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await assertSucceeds(
        updateDoc(doc(ctx.firestore(), `couriers/${COURIER_UID}`), {
          countryCode: "CM",
        })
      );
    });
  });
});

describe("C1 — users.role / userType are immutable client-side", () => {
  test("REQ-C1-011: changing role → DENIED", async () => {
    await seedUser();
    const user = testEnv.authenticatedContext(USER_UID);
    await assertFails(
      updateDoc(doc(user.firestore(), `users/${USER_UID}`), { role: "pharmacy" })
    );
  });

  test("REQ-C1-012: changing userType → DENIED", async () => {
    await seedUser();
    const user = testEnv.authenticatedContext(USER_UID);
    await assertFails(
      updateDoc(doc(user.firestore(), `users/${USER_UID}`), { userType: "pharmacy" })
    );
  });

  test("REQ-C1-013: deleting role → DENIED", async () => {
    await seedUser();
    const user = testEnv.authenticatedContext(USER_UID);
    await assertFails(
      updateDoc(doc(user.firestore(), `users/${USER_UID}`), { role: deleteField() })
    );
  });

  test("REQ-C1-014: adding userType where none existed → DENIED", async () => {
    // Absent -> present is a change too. A doc created without userType
    // must not gain one client-side, or the resolver's canonical input
    // could be introduced after the fact.
    await seedUser({ uid: USER_UID, email: "u@example.test", role: "courier", isActive: true });
    const user = testEnv.authenticatedContext(USER_UID);
    await assertFails(
      updateDoc(doc(user.firestore(), `users/${USER_UID}`), { userType: "pharmacy" })
    );
  });

  test("REQ-C1-015: updating a non-identity field → ALLOWED", async () => {
    await seedUser();
    const user = testEnv.authenticatedContext(USER_UID);
    await assertSucceeds(
      updateDoc(doc(user.firestore(), `users/${USER_UID}`), { displayName: "Renamed" })
    );
  });

  test("REQ-C1-016: re-sending the SAME role → ALLOWED", async () => {
    await seedUser();
    const user = testEnv.authenticatedContext(USER_UID);
    await assertSucceeds(
      updateDoc(doc(user.firestore(), `users/${USER_UID}`), {
        role: "courier",
        displayName: "Renamed",
      })
    );
  });

  test("REQ-C1-017: creation with a role still works", async () => {
    // The signup path must remain functional.
    const user = testEnv.authenticatedContext(USER_UID);
    await assertSucceeds(
      setDoc(doc(user.firestore(), `users/${USER_UID}`), VALID_USER)
    );
  });

  test("REQ-C1-018: another uid cannot touch this user document", async () => {
    await seedUser();
    const other = testEnv.authenticatedContext(OTHER_UID);
    await assertFails(
      updateDoc(doc(other.firestore(), `users/${USER_UID}`), { displayName: "Hijacked" })
    );
  });

  test("REQ-C1-019: admin SDK can still change role", async () => {
    await seedUser();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await assertSucceeds(
        updateDoc(doc(ctx.firestore(), `users/${USER_UID}`), { role: "pharmacy" })
      );
    });
  });
});
