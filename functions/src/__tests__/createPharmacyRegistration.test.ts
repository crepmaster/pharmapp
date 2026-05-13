/**
 * Sprint 2A.3 — Unit tests for `createPharmacyRegistration`.
 *
 * Scope (architect-locked) :
 *   - `computeInitialPharmacyLicenseStatus` matrix : not_required /
 *     pending_verification / LICENSE_REQUIRED throw.
 *   - SERVER-SIDE read of country config : test that flipping the
 *     mocked sysconfig between two invocations yields the new policy
 *     (no cache).
 *   - input validation (missing email/password/profileData/countryCode).
 *
 * Full anti-orphan integration scenarios (Auth created then Firestore
 * fails → Auth deleted) are out of scope for these unit tests : the
 * paths are read by inspection and covered by the documented
 * pre-deploy QA checklist. A full integration test would require
 * spinning up the Firestore + Auth emulators which is heavier than the
 * architect's "pragmatic" guidance.
 */
import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Mocks — must run BEFORE the import of the module under test.
// ---------------------------------------------------------------------------

const mockGet = jest.fn() as jest.MockedFunction<() => Promise<unknown>>;
const mockBatchSet = jest.fn();
const mockBatchCommit = jest.fn(() => Promise.resolve());
const mockCollection = jest.fn(() => ({ doc: jest.fn(() => ({ get: mockGet, id: "mock-id" })) }));
const mockBatch = jest.fn(() => ({ set: mockBatchSet, commit: mockBatchCommit }));

const mockCreateUser = jest.fn() as jest.MockedFunction<
  (props: { email: string; password: string; emailVerified: boolean }) => Promise<{ uid: string }>
>;
const mockDeleteUser = jest.fn() as jest.MockedFunction<(uid: string) => Promise<void>>;

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

jest.mock("firebase-admin/auth", () => ({
  getAuth: jest.fn(() => ({
    createUser: mockCreateUser,
    deleteUser: mockDeleteUser,
  })),
}));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({
    collection: mockCollection,
    batch: mockBatch,
  })),
  FieldValue: {
    serverTimestamp: jest.fn(() => "mock-timestamp"),
  },
  // Sprint 3 — Timestamp.fromDate is now called from
  // createPharmacyRegistration to seed trial subscription dates.
  Timestamp: {
    fromDate: jest.fn((d: Date) => ({ __ts: d.getTime() })),
  },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks.
// ---------------------------------------------------------------------------

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();

import {
  createPharmacyRegistration,
  computeInitialPharmacyLicenseStatus,
} from "../createPharmacyRegistration.js";

const wrapped = testFns.wrap(createPharmacyRegistration);

afterAll(() => {
  testFns.cleanup();
});

beforeEach(() => {
  mockGet.mockReset();
  mockBatchSet.mockReset();
  mockBatchCommit.mockClear();
  mockBatchCommit.mockResolvedValue(undefined);
  mockBatch.mockClear();
  mockCollection.mockClear();
  mockCreateUser.mockReset();
  mockDeleteUser.mockReset();
});

// ---------------------------------------------------------------------------
// Pure helper.
// ---------------------------------------------------------------------------

describe("computeInitialPharmacyLicenseStatus — pure helper", () => {
  test("country not mandatory → not_required (regardless of licenseNumber presence)", () => {
    expect(
      computeInitialPharmacyLicenseStatus({
        licenseRequired: false,
        hasLicenseNumber: false,
      })
    ).toBe("not_required");
    expect(
      computeInitialPharmacyLicenseStatus({
        licenseRequired: false,
        hasLicenseNumber: true,
      })
    ).toBe("not_required");
  });

  test("country mandatory + license provided → pending_verification", () => {
    expect(
      computeInitialPharmacyLicenseStatus({
        licenseRequired: true,
        hasLicenseNumber: true,
      })
    ).toBe("pending_verification");
  });

  test("country mandatory + license absent → throws LICENSE_REQUIRED", () => {
    expect(() =>
      computeInitialPharmacyLicenseStatus({
        licenseRequired: true,
        hasLicenseNumber: false,
      })
    ).toThrow();
    try {
      computeInitialPharmacyLicenseStatus({
        licenseRequired: true,
        hasLicenseNumber: false,
      });
    } catch (e: any) {
      expect(e.code).toBe("failed-precondition");
      expect(e.details).toMatchObject({ code: "LICENSE_REQUIRED" });
    }
  });
});

// ---------------------------------------------------------------------------
// Callable smoke tests — happy paths and key rejections.
// ---------------------------------------------------------------------------

const BASE_INPUT = {
  email: "alice@example.test",
  password: "supersecret-pw-2026",
  profileData: {
    pharmacyName: "Alice Pharmacy",
    phoneNumber: "+237670000001",
    address: "1 Test Street, Douala",
    countryCode: "CM",
  },
};

function setSysConfig(countries: Record<string, unknown>) {
  mockGet.mockResolvedValueOnce({
    exists: true,
    data: () => ({ countries }),
  });
}

describe("createPharmacyRegistration callable — Sprint 2A.3", () => {
  test("country not mandatory + no license → creates pharmacy with licenseStatus=not_required", async () => {
    setSysConfig({ CM: { licenseRequired: false } });
    mockCreateUser.mockResolvedValueOnce({ uid: "alice-uid" });

    const result = await wrapped({ data: BASE_INPUT } as any);

    expect(result).toMatchObject({
      uid: "alice-uid",
      email: "alice@example.test",
      licenseStatus: "not_required",
    });
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    // Auth was created, NOT deleted (no anti-orphan trigger).
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  test("country mandatory + license absent → LICENSE_REQUIRED, no Auth created", async () => {
    setSysConfig({ GH: { licenseRequired: true } });

    const input = {
      ...BASE_INPUT,
      profileData: { ...BASE_INPUT.profileData, countryCode: "GH" },
    };

    await expect(wrapped({ data: input } as any)).rejects.toMatchObject({
      code: "failed-precondition",
      details: { code: "LICENSE_REQUIRED" },
    });
    // F2A3-FINDING-1 + 2A.3 contract : we MUST NOT create the Auth user
    // when the policy check fails — the throw happens before auth.createUser.
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test("country mandatory + license OK → creates pharmacy with licenseStatus=pending_verification", async () => {
    setSysConfig({ GH: { licenseRequired: true } });
    mockCreateUser.mockResolvedValueOnce({ uid: "ghana-pharma-uid" });

    const input = {
      ...BASE_INPUT,
      licenseNumber: "PMC-12345",
      profileData: { ...BASE_INPUT.profileData, countryCode: "GH" },
    };

    const result = await wrapped({ data: input } as any);
    expect(result.licenseStatus).toBe("pending_verification");
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  test("country mandatory + license violates regex → invalid-argument", async () => {
    setSysConfig({
      GH: { licenseRequired: true, licenseFormatRegex: "^PMC-\\d{8}$" },
    });

    const input = {
      ...BASE_INPUT,
      licenseNumber: "not-matching",
      profileData: { ...BASE_INPUT.profileData, countryCode: "GH" },
    };

    await expect(wrapped({ data: input } as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

// ---------------------------------------------------------------------------
// Sprint 3 — trial subscription init aligned with license verification.
// Architect-locked in SPRINT_3_TRIAL_SUBSCRIPTION_TASK.md (decisions #2/#5).
// ---------------------------------------------------------------------------

function lastPharmacyDocWritten(): Record<string, unknown> {
  // The batch.set is called 3 times per registration : users/{uid},
  // pharmacies/{uid}, wallets/{uid}. We pick the pharmacy entry by
  // looking up the call whose second argument has a `pharmacyName`.
  for (const call of mockBatchSet.mock.calls) {
    const [, payload] = call as [unknown, Record<string, unknown>];
    if (payload && typeof payload === "object" && "pharmacyName" in payload) {
      return payload;
    }
  }
  throw new Error("No pharmacies batch.set call captured.");
}

describe("Sprint 3 — trial subscription init at registration", () => {
  test('non-mandatory country → subscriptionStatus="trial", hasActiveSubscription=true, dates set', async () => {
    setSysConfig({ CM: { licenseRequired: false } });
    mockCreateUser.mockResolvedValueOnce({ uid: "alice-non-mandatory" });

    await wrapped({ data: BASE_INPUT } as any);

    const pharmacyDoc = lastPharmacyDocWritten();
    expect(pharmacyDoc.subscriptionStatus).toBe("trial");
    expect(pharmacyDoc.hasActiveSubscription).toBe(true);
    expect(pharmacyDoc.subscriptionPlan).toBe("basic");
    expect(pharmacyDoc.subscriptionStartDate).toBeDefined();
    expect(pharmacyDoc.subscriptionEndDate).toBeDefined();
    // 30-day duration expressed as a Timestamp.fromDate({__ts: ms}).
    const start = (pharmacyDoc.subscriptionStartDate as { __ts: number }).__ts;
    const end = (pharmacyDoc.subscriptionEndDate as { __ts: number }).__ts;
    expect(end - start).toBe(30 * 24 * 60 * 60 * 1000);
  });

  test('mandatory country + license provided → subscriptionStatus="trial_pending_license", hasActiveSubscription=false, no dates', async () => {
    setSysConfig({ GH: { licenseRequired: true } });
    mockCreateUser.mockResolvedValueOnce({ uid: "ghana-pending" });

    const input = {
      ...BASE_INPUT,
      licenseNumber: "PMC-12345",
      profileData: { ...BASE_INPUT.profileData, countryCode: "GH" },
    };
    await wrapped({ data: input } as any);

    const pharmacyDoc = lastPharmacyDocWritten();
    expect(pharmacyDoc.subscriptionStatus).toBe("trial_pending_license");
    expect(pharmacyDoc.hasActiveSubscription).toBe(false);
    expect(pharmacyDoc.subscriptionPlan).toBeNull();
    expect(pharmacyDoc.subscriptionStartDate).toBeNull();
    expect(pharmacyDoc.subscriptionEndDate).toBeNull();
    // License init unchanged (Sprint 2A.3 contract preserved).
    expect(pharmacyDoc.licenseStatus).toBe("pending_verification");
    expect(pharmacyDoc.licenseNumber).toBe("PMC-12345");
  });
});

  test("countryCode unknown in system_config → failed-precondition", async () => {
    setSysConfig({ CM: { licenseRequired: false } });
    const input = {
      ...BASE_INPUT,
      profileData: { ...BASE_INPUT.profileData, countryCode: "ZZ" },
    };
    await expect(wrapped({ data: input } as any)).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test("anti-orphan: Firestore batch fails after Auth created → deleteUser called", async () => {
    setSysConfig({ CM: { licenseRequired: false } });
    mockCreateUser.mockResolvedValueOnce({ uid: "orphan-candidate-uid" });
    mockBatchCommit.mockRejectedValueOnce(new Error("firestore down"));
    mockDeleteUser.mockResolvedValueOnce(undefined);

    await expect(wrapped({ data: BASE_INPUT } as any)).rejects.toMatchObject({
      code: "internal",
    });
    expect(mockDeleteUser).toHaveBeenCalledWith("orphan-candidate-uid");
  });

  test("Server-side flip: same callable, different sysconfig per call", async () => {
    // Confirms there's no in-process cache: each call re-reads sysconfig.
    setSysConfig({ GH: { licenseRequired: false } });
    mockCreateUser.mockResolvedValueOnce({ uid: "first-uid" });

    const input = {
      ...BASE_INPUT,
      profileData: { ...BASE_INPUT.profileData, countryCode: "GH" },
    };
    const first = await wrapped({ data: input } as any);
    expect(first.licenseStatus).toBe("not_required");

    // Super admin flips the flag between calls.
    setSysConfig({ GH: { licenseRequired: true } });
    await expect(wrapped({ data: input } as any)).rejects.toMatchObject({
      code: "failed-precondition",
      details: { code: "LICENSE_REQUIRED" },
    });
  });

  test("missing countryCode → invalid-argument", async () => {
    const input = {
      ...BASE_INPUT,
      profileData: { ...BASE_INPUT.profileData, countryCode: undefined },
    };
    await expect(wrapped({ data: input } as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("missing email → invalid-argument", async () => {
    const input = { ...BASE_INPUT, email: "" };
    await expect(wrapped({ data: input } as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("password too short → invalid-argument", async () => {
    const input = { ...BASE_INPUT, password: "short" };
    await expect(wrapped({ data: input } as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });
});
