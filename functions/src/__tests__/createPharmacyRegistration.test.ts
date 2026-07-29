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
    // Territory anchor (phase 1) — cityCode is now mandatory and validated
    // against the country's `citiesByCountry` map. "douala" is an enabled CM
    // city in DEFAULT_CITIES below.
    cityCode: "douala",
  },
};

/**
 * Currency sprint: the wallet currency is now derived from
 * `country.defaultCurrencyCode` and validated against `currencies`, with no
 * XAF fallback. Test countries therefore need a real currency, and the
 * config needs a matching enabled `currencies` entry. Callers that pass a
 * country map without `defaultCurrencyCode` are exercising the
 * "unconfigured currency → refuse" branch on purpose.
 */
const DEFAULT_CURRENCIES = {
  XAF: { code: "XAF", enabled: true, decimals: 0 },
  GHS: { code: "GHS", enabled: true, decimals: 2 },
};

/** Standard operating currency per test country, injected when a fixture
 *  does not specify one, so existing tests keep a valid wallet currency
 *  without each having to spell it out. */
const COUNTRY_CURRENCY: Record<string, string> = { CM: "XAF", GH: "GHS" };

/**
 * Territory anchor (phase 1) — the callable now validates `cityCode` against
 * `system_config/main.citiesByCountry`. Injected by default so existing
 * fixtures resolve a valid enabled city; tests exercising the "unknown city"
 * / "city of another country" branches pass an explicit cityCode.
 */
const DEFAULT_CITIES: Record<string, Record<string, { enabled: boolean }>> = {
  CM: { douala: { enabled: true }, yaounde: { enabled: true } },
  GH: { accra: { enabled: true }, kumasi: { enabled: true } },
};

function setSysConfig(
  countries: Record<string, unknown>,
  currencies: Record<string, unknown> = DEFAULT_CURRENCIES,
  citiesByCountry: Record<string, unknown> = DEFAULT_CITIES
) {
  const withDefaults: Record<string, unknown> = {};
  for (const [code, cfg] of Object.entries(countries)) {
    const c = (cfg ?? {}) as Record<string, unknown>;
    // Default `enabled: true` and inject a currency for known countries, then
    // let the fixture override both (so a test can pass enabled:false, or a
    // country without a currency, explicitly).
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
      profileData: { ...BASE_INPUT.profileData, countryCode: "GH", cityCode: "accra" },
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
      profileData: { ...BASE_INPUT.profileData, countryCode: "GH", cityCode: "accra" },
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
      profileData: { ...BASE_INPUT.profileData, countryCode: "GH", cityCode: "accra" },
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
      profileData: { ...BASE_INPUT.profileData, countryCode: "GH", cityCode: "accra" },
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
      profileData: { ...BASE_INPUT.profileData, countryCode: "GH", cityCode: "accra" },
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

// ---------------------------------------------------------------------------
// Currency sprint — wallet currency is derived from the country ONLY.
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

function lastWalletDocWritten(): Record<string, unknown> {
  // The wallet entry is the batch.set payload carrying `available`/`held`
  // but no `pharmacyName`.
  for (const call of mockBatchSet.mock.calls) {
    const [, payload] = call as [unknown, Record<string, unknown>];
    if (
      payload &&
      typeof payload === "object" &&
      "available" in payload &&
      "currency" in payload &&
      !("pharmacyName" in payload)
    ) {
      return payload;
    }
  }
  throw new Error("No wallet batch.set call captured.");
}

describe("Currency sprint — wallet currency derivation", () => {
  test("Ghana pharmacy → wallet in GHS", async () => {
    setSysConfig({ GH: { licenseRequired: false } });
    mockCreateUser.mockResolvedValueOnce({ uid: "gh-uid" });
    const input = {
      ...BASE_INPUT,
      profileData: { ...BASE_INPUT.profileData, countryCode: "GH", cityCode: "accra" },
    };
    await wrapped({ data: input } as any);
    expect(lastWalletDocWritten()).toMatchObject({ currency: "GHS" });
  });

  test("client-supplied profile.currency is IGNORED", async () => {
    // A modified client sends currency:"XAF" for a Ghana pharmacy. The
    // server must derive GHS from the country and ignore the client value.
    setSysConfig({ GH: { licenseRequired: false } });
    mockCreateUser.mockResolvedValueOnce({ uid: "gh-forged-uid" });
    const input = {
      ...BASE_INPUT,
      profileData: {
        ...BASE_INPUT.profileData,
        countryCode: "GH",
        cityCode: "accra",
        currency: "XAF", // forged
      },
    };
    await wrapped({ data: input } as any);
    expect(lastWalletDocWritten()).toMatchObject({ currency: "GHS" });
  });

  test("country with no defaultCurrencyCode → refuses, no wallet", async () => {
    // Pass an explicit country config WITHOUT a currency (the helper only
    // injects one when the field is absent AND the code is known; here we
    // force an unknown-currency country).
    setSysConfig({ CM: { licenseRequired: false, defaultCurrencyCode: undefined } });
    mockCreateUser.mockResolvedValueOnce({ uid: "no-currency-uid" });
    await expect(wrapped({ data: BASE_INPUT } as any)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });

  test("country currency absent from currencies map → refuses", async () => {
    setSysConfig(
      { CM: { licenseRequired: false, defaultCurrencyCode: "XAF" } },
      { GHS: { code: "GHS", enabled: true } } // XAF deliberately missing
    );
    mockCreateUser.mockResolvedValueOnce({ uid: "unconfigured-uid" });
    await expect(wrapped({ data: BASE_INPUT } as any)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });

  test("country currency disabled → refuses", async () => {
    setSysConfig(
      { CM: { licenseRequired: false, defaultCurrencyCode: "XAF" } },
      { XAF: { code: "XAF", enabled: false } }
    );
    mockCreateUser.mockResolvedValueOnce({ uid: "disabled-uid" });
    await expect(wrapped({ data: BASE_INPUT } as any)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });
});

// ---------------------------------------------------------------------------
// Territory anchor (phase 1) — country enabled + city membership + canonical.
// ---------------------------------------------------------------------------

describe("Territory anchor (phase 1) — country/city validation", () => {
  test("REQ-TERR-CALL-001: country present but not enabled → refused, no Auth", async () => {
    setSysConfig({ CM: { licenseRequired: false, enabled: false } });
    await expect(wrapped({ data: BASE_INPUT } as any)).rejects.toMatchObject({
      code: "failed-precondition",
      details: { code: "COUNTRY_NOT_ENABLED" },
    });
    // Territory checks run BEFORE auth.createUser — nothing is created.
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockBatch).not.toHaveBeenCalled();
  });

  test("REQ-TERR-CALL-002: missing cityCode → invalid-argument, no Auth", async () => {
    setSysConfig({ CM: { licenseRequired: false } });
    const input = {
      ...BASE_INPUT,
      profileData: { ...BASE_INPUT.profileData, cityCode: undefined },
    };
    await expect(wrapped({ data: input } as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test("REQ-TERR-CALL-003: unknown city for the country → refused, no Auth", async () => {
    setSysConfig({ CM: { licenseRequired: false } });
    const input = {
      ...BASE_INPUT,
      profileData: { ...BASE_INPUT.profileData, cityCode: "atlantis" },
    };
    await expect(wrapped({ data: input } as any)).rejects.toMatchObject({
      code: "failed-precondition",
      details: { code: "CITY_INVALID_FOR_COUNTRY" },
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test("REQ-TERR-CALL-004: city belonging to ANOTHER country → refused", async () => {
    // "accra" is an enabled city, but under GH — not CM. The equal-currency
    // trap does not apply here: this is a purely territorial refusal.
    setSysConfig({ CM: { licenseRequired: false } });
    const input = {
      ...BASE_INPUT,
      profileData: { ...BASE_INPUT.profileData, countryCode: "CM", cityCode: "accra" },
    };
    await expect(wrapped({ data: input } as any)).rejects.toMatchObject({
      code: "failed-precondition",
      details: { code: "CITY_INVALID_FOR_COUNTRY" },
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test("REQ-TERR-CALL-005: non-canonical city variant is NORMALISED then accepted", async () => {
    // Contract choice: canonicalise (citySlug) then validate. "Douala" and
    // " Douala " both resolve to the enabled key "douala".
    setSysConfig({ CM: { licenseRequired: false } });
    mockCreateUser.mockResolvedValueOnce({ uid: "canon-uid" });
    const input = {
      ...BASE_INPUT,
      profileData: { ...BASE_INPUT.profileData, cityCode: "Douala" },
    };
    const result = await wrapped({ data: input } as any);
    expect(result).toMatchObject({ uid: "canon-uid" });
    // The stored cityCode is the canonical slug, not the raw client value.
    expect(lastPharmacyDocWritten().cityCode).toBe("douala");
  });

  test("REQ-TERR-CALL-006: valid registration writes canonical city AND wallet in the derived currency", async () => {
    setSysConfig({ GH: { licenseRequired: false } });
    mockCreateUser.mockResolvedValueOnce({ uid: "gh-territory-uid" });
    const input = {
      ...BASE_INPUT,
      profileData: { ...BASE_INPUT.profileData, countryCode: "GH", cityCode: "accra" },
    };
    await wrapped({ data: input } as any);
    const pharmacyDoc = lastPharmacyDocWritten();
    expect(pharmacyDoc.countryCode).toBe("GH");
    expect(pharmacyDoc.cityCode).toBe("accra");
    // Wallet currency is derived from the SAME country config, coherent with
    // the validated territory.
    expect(lastWalletDocWritten()).toMatchObject({ currency: "GHS" });
  });

  test("REQ-TERR-CALL-007: a territory validation failure creates neither pharmacy nor wallet", async () => {
    setSysConfig({ CM: { licenseRequired: false } });
    const input = {
      ...BASE_INPUT,
      profileData: { ...BASE_INPUT.profileData, cityCode: "atlantis" },
    };
    await expect(wrapped({ data: input } as any)).rejects.toBeDefined();
    // No Auth user, no Firestore batch — the refusal is total.
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockBatch).not.toHaveBeenCalled();
  });

  test("REQ-TERR-CALL-008: lowercase countryCode is canonicalised to upper-case and persisted", async () => {
    // Canonicalise-then-validate: "gh" resolves to the configured "GH", and
    // the STORED value is the canonical "GH" — the raw client value never
    // overwrites the persisted canonical one.
    setSysConfig({ GH: { licenseRequired: false } });
    mockCreateUser.mockResolvedValueOnce({ uid: "gh-lower-uid" });
    const input = {
      ...BASE_INPUT,
      profileData: { ...BASE_INPUT.profileData, countryCode: "gh", cityCode: "accra" },
    };
    const result = await wrapped({ data: input } as any);
    expect(result).toMatchObject({ uid: "gh-lower-uid" });
    const pharmacyDoc = lastPharmacyDocWritten();
    expect(pharmacyDoc.countryCode).toBe("GH");
    // The backend-controlled licenseCountryCode mirrors the canonical value.
    expect(pharmacyDoc.licenseCountryCode).toBe("GH");
  });

  test.each([
    ["three letters", "USA"],
    ["one letter", "C"],
    ["letter+digit", "C1"],
    ["digits", "12"],
    ["embedded space", "G H"],
    ["empty after trim", "   "],
  ])(
    "REQ-TERR-CALL-009: malformed countryCode (%s) → invalid-argument, no Auth",
    async (_label, value) => {
      // The shape check throws before the config read, so no sysconfig is
      // needed. "   " trims to empty (caught by the required check); the
      // others fail the ISO ^[A-Z]{2}$ test after upper-casing.
      const input = {
        ...BASE_INPUT,
        profileData: { ...BASE_INPUT.profileData, countryCode: value, cityCode: "accra" },
      };
      await expect(wrapped({ data: input } as any)).rejects.toMatchObject({
        code: "invalid-argument",
      });
      expect(mockCreateUser).not.toHaveBeenCalled();
    }
  );

  test("REQ-TERR-CALL-010: citiesByCountry absent from config → refused before Auth", async () => {
    // The whole cities map is missing (legacy / not-yet-seeded environment).
    // Every city lookup then fails closed — no pharmacy is onboarded until the
    // env is seeded. Built as a raw config WITHOUT the citiesByCountry key so
    // this proves the `?.` absence path, not merely an empty country entry.
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        countries: {
          CM: { licenseRequired: false, enabled: true, defaultCurrencyCode: "XAF" },
        },
        currencies: DEFAULT_CURRENCIES,
        // citiesByCountry deliberately omitted.
      }),
    });
    await expect(wrapped({ data: BASE_INPUT } as any)).rejects.toMatchObject({
      code: "failed-precondition",
      details: { code: "CITY_INVALID_FOR_COUNTRY" },
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test("REQ-TERR-CALL-011: city present but enabled:false → refused before Auth", async () => {
    // The city exists under the right country but is explicitly disabled. It
    // must be refused just like an unknown city — a dormant city is not a
    // valid registration target.
    setSysConfig(
      { CM: { licenseRequired: false } },
      DEFAULT_CURRENCIES,
      { CM: { douala: { enabled: false } } }
    );
    await expect(wrapped({ data: BASE_INPUT } as any)).rejects.toMatchObject({
      code: "failed-precondition",
      details: { code: "CITY_INVALID_FOR_COUNTRY" },
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });
});
