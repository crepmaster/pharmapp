/**
 * TD-COURIER-ASSIGN-GUARD (Lot A) — unit tests for `createCourierRegistration`.
 *
 * Mirrors `createPharmacyRegistration.test.ts`: territory validation
 * (country enabled + city belongs-to-country + canonicalisation), currency
 * derived server-side, forged country/city refused, anti-orphan, and the
 * "no Auth / no batch on a validation failure" guarantee.
 */
import { jest } from "@jest/globals";

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
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();

import { createCourierRegistration } from "../createCourierRegistration.js";
const wrapped = testFns.wrap(createCourierRegistration);

afterAll(() => testFns.cleanup());

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

const DEFAULT_CURRENCIES = {
  XAF: { code: "XAF", enabled: true, decimals: 0 },
  GHS: { code: "GHS", enabled: true, decimals: 2 },
};
const DEFAULT_CITIES: Record<string, Record<string, { enabled: boolean }>> = {
  CM: { douala: { enabled: true }, yaounde: { enabled: true } },
  GH: { accra: { enabled: true }, kumasi: { enabled: true } },
};
const COUNTRY_CURRENCY: Record<string, string> = { CM: "XAF", GH: "GHS" };

function setSysConfig(
  countries: Record<string, unknown>,
  currencies: Record<string, unknown> = DEFAULT_CURRENCIES,
  citiesByCountry: Record<string, unknown> = DEFAULT_CITIES
) {
  const withDefaults: Record<string, unknown> = {};
  for (const [code, cfg] of Object.entries(countries)) {
    const c = (cfg ?? {}) as Record<string, unknown>;
    const base: Record<string, unknown> = { enabled: true };
    if (!("defaultCurrencyCode" in c) && code in COUNTRY_CURRENCY) {
      base.defaultCurrencyCode = COUNTRY_CURRENCY[code];
    }
    withDefaults[code] = { ...base, ...c };
  }
  mockGet.mockResolvedValueOnce({
    exists: true,
    data: () => ({ countries: withDefaults, citiesByCountry, currencies }),
  });
}

const BASE_INPUT = {
  email: "kwame@example.test",
  password: "supersecret-pw-2026",
  profileData: {
    fullName: "Kwame Courier",
    phoneNumber: "+233240000001",
    vehicleType: "motorcycle",
    licensePlate: "GH-1234-24",
    countryCode: "GH",
    cityCode: "accra",
  },
};

function lastCourierDocWritten(): Record<string, unknown> {
  for (const call of mockBatchSet.mock.calls) {
    const [, payload] = call as [unknown, Record<string, unknown>];
    if (payload && typeof payload === "object" && "vehicleType" in payload) {
      return payload;
    }
  }
  throw new Error("No couriers batch.set call captured.");
}

function lastWalletDocWritten(): Record<string, unknown> {
  for (const call of mockBatchSet.mock.calls) {
    const [, payload] = call as [unknown, Record<string, unknown>];
    if (
      payload && typeof payload === "object" &&
      "available" in payload && "currency" in payload && !("vehicleType" in payload)
    ) {
      return payload;
    }
  }
  throw new Error("No wallet batch.set call captured.");
}

describe("createCourierRegistration — happy path", () => {
  test("creates courier + wallet in the derived currency, canonical city", async () => {
    setSysConfig({ GH: {} });
    mockCreateUser.mockResolvedValueOnce({ uid: "kwame-uid" });
    const result = await wrapped({ data: BASE_INPUT } as any);
    expect(result).toMatchObject({ uid: "kwame-uid", email: "kwame@example.test" });
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).not.toHaveBeenCalled();
    const courier = lastCourierDocWritten();
    expect(courier).toMatchObject({ role: "courier", isActive: true, countryCode: "GH", cityCode: "accra" });
    expect(lastWalletDocWritten()).toMatchObject({ currency: "GHS" });
  });

  test("lowercase countryCode is canonicalised + persisted; non-canonical city normalised", async () => {
    setSysConfig({ GH: {} });
    mockCreateUser.mockResolvedValueOnce({ uid: "canon-uid" });
    const input = {
      ...BASE_INPUT,
      profileData: { ...BASE_INPUT.profileData, countryCode: "gh", cityCode: "Accra" },
    };
    await wrapped({ data: input } as any);
    const courier = lastCourierDocWritten();
    expect(courier.countryCode).toBe("GH");
    expect(courier.cityCode).toBe("accra");
  });
});

describe("createCourierRegistration — forged / invalid territory refused (no Auth)", () => {
  test("country present but not enabled → COUNTRY_NOT_ENABLED", async () => {
    setSysConfig({ GH: { enabled: false } });
    await expect(wrapped({ data: BASE_INPUT } as any)).rejects.toMatchObject({
      code: "failed-precondition",
      details: { code: "COUNTRY_NOT_ENABLED" },
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockBatch).not.toHaveBeenCalled();
  });

  test("country unknown → failed-precondition, no Auth", async () => {
    setSysConfig({ GH: {} });
    const input = { ...BASE_INPUT, profileData: { ...BASE_INPUT.profileData, countryCode: "ZZ" } };
    await expect(wrapped({ data: input } as any)).rejects.toMatchObject({ code: "failed-precondition" });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test("unknown city → CITY_INVALID_FOR_COUNTRY, no Auth", async () => {
    setSysConfig({ GH: {} });
    const input = { ...BASE_INPUT, profileData: { ...BASE_INPUT.profileData, cityCode: "atlantis" } };
    await expect(wrapped({ data: input } as any)).rejects.toMatchObject({
      details: { code: "CITY_INVALID_FOR_COUNTRY" },
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test("city belonging to ANOTHER country → CITY_INVALID_FOR_COUNTRY", async () => {
    setSysConfig({ GH: {} });
    // "douala" is a CM city, not GH.
    const input = { ...BASE_INPUT, profileData: { ...BASE_INPUT.profileData, countryCode: "GH", cityCode: "douala" } };
    await expect(wrapped({ data: input } as any)).rejects.toMatchObject({
      details: { code: "CITY_INVALID_FOR_COUNTRY" },
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test.each([
    ["three letters", "USA"],
    ["digits", "12"],
    ["one letter", "G"],
    ["embedded space", "G H"],
  ])("malformed countryCode (%s) → invalid-argument, no Auth", async (_label, value) => {
    const input = { ...BASE_INPUT, profileData: { ...BASE_INPUT.profileData, countryCode: value } };
    await expect(wrapped({ data: input } as any)).rejects.toMatchObject({ code: "invalid-argument" });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test("missing cityCode → invalid-argument, no Auth", async () => {
    const input = { ...BASE_INPUT, profileData: { ...BASE_INPUT.profileData, cityCode: undefined } };
    await expect(wrapped({ data: input } as any)).rejects.toMatchObject({ code: "invalid-argument" });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test("missing courier fields → invalid-argument, no Auth", async () => {
    const input = { ...BASE_INPUT, profileData: { ...BASE_INPUT.profileData, vehicleType: undefined } };
    await expect(wrapped({ data: input } as any)).rejects.toMatchObject({ code: "invalid-argument" });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });
});

describe("createCourierRegistration — currency derivation", () => {
  test("country with no defaultCurrencyCode → refuses BEFORE Auth (no orphan)", async () => {
    // Courier registration validates currency PRE-Auth, so a currency failure
    // never mints an orphan Auth user (cleaner than the pharmacy path).
    setSysConfig({ GH: { defaultCurrencyCode: undefined } });
    await expect(wrapped({ data: BASE_INPUT } as any)).rejects.toMatchObject({ code: "failed-precondition" });
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  test("country currency disabled → refuses before Auth", async () => {
    setSysConfig(
      { GH: { defaultCurrencyCode: "GHS" } },
      { GHS: { code: "GHS", enabled: false } }
    );
    await expect(wrapped({ data: BASE_INPUT } as any)).rejects.toMatchObject({ code: "failed-precondition" });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test("client-supplied currency is IGNORED (derived from country)", async () => {
    setSysConfig({ GH: {} });
    mockCreateUser.mockResolvedValueOnce({ uid: "forged-cur-uid" });
    const input = {
      ...BASE_INPUT,
      profileData: { ...BASE_INPUT.profileData, currency: "XAF" }, // forged
    };
    await wrapped({ data: input } as any);
    expect(lastWalletDocWritten()).toMatchObject({ currency: "GHS" });
  });
});

describe("createCourierRegistration — anti-orphan + auth errors", () => {
  test("Firestore batch fails after Auth created → deleteUser called", async () => {
    setSysConfig({ GH: {} });
    mockCreateUser.mockResolvedValueOnce({ uid: "orphan-uid" });
    mockBatchCommit.mockRejectedValueOnce(new Error("firestore down"));
    mockDeleteUser.mockResolvedValueOnce(undefined);
    await expect(wrapped({ data: BASE_INPUT } as any)).rejects.toMatchObject({ code: "internal" });
    expect(mockDeleteUser).toHaveBeenCalledWith("orphan-uid");
  });

  test("email already exists → already-exists", async () => {
    setSysConfig({ GH: {} });
    mockCreateUser.mockRejectedValueOnce({ code: "auth/email-already-exists" });
    await expect(wrapped({ data: BASE_INPUT } as any)).rejects.toMatchObject({ code: "already-exists" });
  });

  test("missing email / short password → invalid-argument", async () => {
    await expect(wrapped({ data: { ...BASE_INPUT, email: "" } } as any)).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(wrapped({ data: { ...BASE_INPUT, password: "short" } } as any)).rejects.toMatchObject({ code: "invalid-argument" });
  });
});
