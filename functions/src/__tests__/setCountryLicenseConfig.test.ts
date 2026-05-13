/**
 * Sprint 2B.1 — Tests for `setCountryLicenseConfig`.
 *
 * Pure-validator tests cover the input matrix without firing Firestore.
 * Callable smoke tests via `firebase-functions-test` wrap cover :
 *   - super_admin path OK
 *   - admin in-scope path OK
 *   - admin out-of-scope → permission-denied
 *   - non-admin (no admins/{uid} doc) → permission-denied
 *   - inactive admin → permission-denied
 *   - admin without manage_pharmacies permission → permission-denied
 *   - unknown countryCode (not in system_config) → not-found
 *   - invalid regex → invalid-argument
 *   - merge does NOT overwrite the other country fields
 */
import { jest } from "@jest/globals";

const mockGet = jest.fn() as jest.MockedFunction<() => Promise<unknown>>;
const mockUpdate = jest.fn() as jest.MockedFunction<
  (data: Record<string, unknown>) => Promise<unknown>
>;
const mockDoc = jest.fn(() => ({ get: mockGet, update: mockUpdate }));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({ collection: mockCollection })),
  FieldValue: {
    serverTimestamp: jest.fn(() => "mock-timestamp"),
  },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();

import {
  setCountryLicenseConfig,
  validateSetCountryLicenseConfigInput,
} from "../setCountryLicenseConfig.js";

const wrapped = testFns.wrap(setCountryLicenseConfig);

afterAll(() => {
  testFns.cleanup();
});

beforeEach(() => {
  mockGet.mockReset();
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue(undefined);
  mockDoc.mockClear();
  mockCollection.mockClear();
});

// ---------------------------------------------------------------------------
// Pure validator tests — no Firestore.
// ---------------------------------------------------------------------------

describe("validateSetCountryLicenseConfigInput — pure", () => {
  test("missing countryCode → invalid-argument", () => {
    expect(() =>
      validateSetCountryLicenseConfigInput({ countryCode: "" } as any)
    ).toThrow();
  });

  test("invalid countryCode shape → invalid-argument", () => {
    expect(() =>
      validateSetCountryLicenseConfigInput({
        countryCode: "Gh",
        licenseRequired: true,
      })
    ).toThrow();
    expect(() =>
      validateSetCountryLicenseConfigInput({
        countryCode: "GHA",
        licenseRequired: true,
      })
    ).toThrow();
  });

  test("no license field supplied → invalid-argument", () => {
    expect(() =>
      validateSetCountryLicenseConfigInput({ countryCode: "GH" })
    ).toThrow();
  });

  test("regex source that cannot be compiled → invalid-argument", () => {
    expect(() =>
      validateSetCountryLicenseConfigInput({
        countryCode: "GH",
        licenseFormatRegex: "[unclosed",
      })
    ).toThrow();
  });

  test("licenseGracePeriodDays out of range / non-integer → invalid-argument", () => {
    for (const bad of [-1, 0, 366, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        validateSetCountryLicenseConfigInput({
          countryCode: "GH",
          licenseGracePeriodDays: bad as number,
        })
      ).toThrow();
    }
  });

  test("happy path with all 7 license fields → no throw", () => {
    expect(() =>
      validateSetCountryLicenseConfigInput({
        countryCode: "GH",
        licenseRequired: true,
        licenseLabel: "Pharmacy License Number",
        licenseHelpText: "Issued by the Pharmacy Council",
        licenseVerificationRequired: true,
        licenseFormatRegex: "^PMC-\\d{8}$",
        licenseDocumentRequired: true,
        licenseGracePeriodDays: 30,
      })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Callable smoke tests — authz matrix + Firestore-side semantics.
// ---------------------------------------------------------------------------

interface Snap {
  exists: boolean;
  data: () => unknown;
}

/**
 * Queue the sequence of `.get()` snapshots the callable will request :
 *   1. admins/{callerUid}
 *   2. system_config/main
 */
function queueGets(adminDoc: Snap, sysConfig: Snap) {
  let i = 0;
  mockGet.mockImplementation(async () => {
    const snap = i === 0 ? adminDoc : sysConfig;
    i++;
    return snap;
  });
}

const SUPER_ADMIN: Snap = {
  exists: true,
  data: () => ({
    isActive: true,
    role: "super_admin",
    permissions: [],
  }),
};

const ADMIN_CM: Snap = {
  exists: true,
  data: () => ({
    isActive: true,
    role: "admin",
    permissions: ["manage_pharmacies"],
    countryScopes: ["CM"],
  }),
};

const ADMIN_INACTIVE: Snap = {
  exists: true,
  data: () => ({
    isActive: false,
    role: "super_admin",
  }),
};

const ADMIN_NO_PERMISSION: Snap = {
  exists: true,
  data: () => ({
    isActive: true,
    role: "admin",
    permissions: [], // no manage_pharmacies
    countryScopes: ["CM"],
  }),
};

const ADMIN_NO_DOC: Snap = { exists: false, data: () => undefined };

const SYS_CONFIG_WITH_GH_AND_CM: Snap = {
  exists: true,
  data: () => ({
    countries: {
      CM: { name: "Cameroon" },
      GH: { name: "Ghana" },
    },
  }),
};

const SYS_CONFIG_MISSING_GH: Snap = {
  exists: true,
  data: () => ({
    countries: { CM: { name: "Cameroon" } },
  }),
};

const BASIC_INPUT = {
  countryCode: "GH",
  licenseRequired: true,
  licenseLabel: "Pharmacy License Number",
};

describe("setCountryLicenseConfig callable — Sprint 2B.1", () => {
  test("super_admin can update license fields on any country", async () => {
    queueGets(SUPER_ADMIN, SYS_CONFIG_WITH_GH_AND_CM);
    const result = await wrapped({
      data: BASIC_INPUT,
      auth: { uid: "super-admin-uid" },
    } as any);
    expect(result.ok).toBe(true);
    expect(result.countryCode).toBe("GH");
    expect(result.fields).toEqual(
      expect.arrayContaining(["licenseRequired", "licenseLabel"])
    );
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const patch = mockUpdate.mock.calls[0][0] as Record<string, unknown>;
    // Dotted-path merge writes only on the license keys.
    expect(patch["countries.GH.licenseRequired"]).toBe(true);
    expect(patch["countries.GH.licenseLabel"]).toBe("Pharmacy License Number");
    // It does NOT overwrite `countries.GH.name` (the other field).
    expect(Object.keys(patch)).not.toContain("countries.GH.name");
  });

  test("admin in scope can update", async () => {
    queueGets(ADMIN_CM, SYS_CONFIG_WITH_GH_AND_CM);
    const result = await wrapped({
      data: { ...BASIC_INPUT, countryCode: "CM" },
      auth: { uid: "admin-cm-uid" },
    } as any);
    expect(result.ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  test("admin out of scope → permission-denied", async () => {
    queueGets(ADMIN_CM, SYS_CONFIG_WITH_GH_AND_CM);
    await expect(
      wrapped({
        data: BASIC_INPUT, // GH
        auth: { uid: "admin-cm-uid" },
      } as any)
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("non-admin (no admins/{uid} doc) → permission-denied", async () => {
    queueGets(ADMIN_NO_DOC, SYS_CONFIG_WITH_GH_AND_CM);
    await expect(
      wrapped({
        data: BASIC_INPUT,
        auth: { uid: "ghost-uid" },
      } as any)
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  test("inactive admin → permission-denied", async () => {
    queueGets(ADMIN_INACTIVE, SYS_CONFIG_WITH_GH_AND_CM);
    await expect(
      wrapped({
        data: BASIC_INPUT,
        auth: { uid: "inactive-uid" },
      } as any)
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  test("admin without manage_pharmacies permission → permission-denied", async () => {
    queueGets(ADMIN_NO_PERMISSION, SYS_CONFIG_WITH_GH_AND_CM);
    await expect(
      wrapped({
        data: { ...BASIC_INPUT, countryCode: "CM" },
        auth: { uid: "limited-admin-uid" },
      } as any)
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  test("unauthenticated caller → unauthenticated", async () => {
    await expect(
      wrapped({
        data: BASIC_INPUT,
        // no auth
      } as any)
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  test("unknown countryCode (not in system_config) → not-found", async () => {
    queueGets(SUPER_ADMIN, SYS_CONFIG_MISSING_GH);
    await expect(
      wrapped({
        data: BASIC_INPUT, // GH but sysconfig only has CM
        auth: { uid: "super-admin-uid" },
      } as any)
    ).rejects.toMatchObject({ code: "not-found" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("invalid regex → invalid-argument, no Firestore write", async () => {
    await expect(
      wrapped({
        data: {
          countryCode: "GH",
          licenseFormatRegex: "[unclosed",
        },
        auth: { uid: "super-admin-uid" },
      } as any)
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("merge: writing licenseRequired only does NOT touch other license fields", async () => {
    queueGets(SUPER_ADMIN, SYS_CONFIG_WITH_GH_AND_CM);
    await wrapped({
      data: { countryCode: "GH", licenseRequired: false },
      auth: { uid: "super-admin-uid" },
    } as any);
    const patch = mockUpdate.mock.calls[0][0] as Record<string, unknown>;
    const keys = Object.keys(patch);
    expect(keys).toContain("countries.GH.licenseRequired");
    expect(keys).not.toContain("countries.GH.licenseLabel");
    expect(keys).not.toContain("countries.GH.licenseFormatRegex");
    expect(keys).not.toContain("countries.GH.licenseGracePeriodDays");
  });
});
