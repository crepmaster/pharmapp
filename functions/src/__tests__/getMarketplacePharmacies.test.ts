/**
 * Sprint 2B.2b — Tests for `getMarketplacePharmacies`.
 *
 * Coverage matrix (architect-locked, ≥7) :
 *   1. verified pharmacy → visible
 *   2. pending_verification → hidden
 *   3. grace_period active (licenseGraceEndsAt in the future) → visible
 *   4. grace_period expired (licenseGraceEndsAt in the past) → hidden
 *   5. rejected → hidden
 *   6. country non mandatory (licenseRequired: false) → all visible
 *      (license gate short-circuits to allow)
 *   7. unknown country (absent from system_config/main.countries) →
 *      zero results + structured logger.warn
 *
 * Plus listing-safe output guard tests :
 *   8. licenseStatus / licenseRejectionReason are NEVER leaked
 *   9. unauthenticated call → throws "unauthenticated"
 *  10. invalid countryCode shape → "invalid-argument"
 *  11. system_config/main missing entirely → fail-closed, zero results
 *  12. cityCode optional filter narrows the results
 */
import { jest } from "@jest/globals";

interface FakeDocSnap {
  id: string;
  data: () => Record<string, unknown>;
}

type QueryFilter = { field: string; value: unknown };

class FakeQuery {
  filters: QueryFilter[] = [];
  constructor(private readonly source: FakeQueryProvider) {}
  where(field: string, _op: string, value: unknown): FakeQuery {
    this.filters.push({ field, value });
    return this;
  }
  async get(): Promise<{ docs: FakeDocSnap[] }> {
    return { docs: this.source.docsMatching(this.filters) };
  }
}

interface FakeQueryProvider {
  docsMatching(filters: QueryFilter[]): FakeDocSnap[];
}

interface PharmacyFixture {
  uid: string;
  data: Record<string, unknown>;
}

const sysConfigGet =
  jest.fn() as jest.MockedFunction<() => Promise<{
    exists: boolean;
    data: () => unknown;
  }>>;
const pharmaciesProvider = {
  docs: [] as PharmacyFixture[],
  docsMatching(filters: QueryFilter[]): FakeDocSnap[] {
    return this.docs
      .filter((p) =>
        filters.every((f) => p.data[f.field] === f.value)
      )
      .map((p) => ({ id: p.uid, data: () => p.data }));
  },
};

function setSystemConfigCountries(
  countries: Record<string, unknown> | null
): void {
  if (countries === null) {
    sysConfigGet.mockResolvedValue({ exists: false, data: () => undefined });
  } else {
    sysConfigGet.mockResolvedValue({
      exists: true,
      data: () => ({ countries }),
    });
  }
}

function setPharmacies(rows: PharmacyFixture[]): void {
  pharmaciesProvider.docs = rows;
}

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn((name: string) => {
      if (name === "system_config") {
        return {
          doc: jest.fn(() => ({ get: sysConfigGet })),
        };
      }
      if (name === "pharmacies") {
        return new FakeQuery(pharmaciesProvider);
      }
      throw new Error(`Unexpected collection: ${name}`);
    }),
  })),
  FieldValue: { serverTimestamp: jest.fn(() => "ts") },
}));

const loggerWarn = jest.fn() as jest.MockedFunction<
  (msg: string, ctx?: unknown) => void
>;
jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: loggerWarn,
  error: jest.fn(),
}));

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();

import {
  getMarketplacePharmacies,
  projectListingSafe,
  validateGetMarketplacePharmaciesInput,
} from "../getMarketplacePharmacies.js";

const wrapped = testFns.wrap(getMarketplacePharmacies);

afterAll(() => {
  testFns.cleanup();
});

beforeEach(() => {
  sysConfigGet.mockReset();
  loggerWarn.mockReset();
  pharmaciesProvider.docs = [];
});

// ---------------------------------------------------------------------------
// Pure validator + listing-safe projector — no Firestore.
// ---------------------------------------------------------------------------

describe("validateGetMarketplacePharmaciesInput — pure", () => {
  test("missing countryCode → throws invalid-argument", () => {
    expect(() =>
      validateGetMarketplacePharmaciesInput({
        countryCode: "" as string,
      })
    ).toThrow(/countryCode/);
  });

  test("invalid countryCode shape → throws invalid-argument", () => {
    expect(() =>
      validateGetMarketplacePharmaciesInput({ countryCode: "Gh" })
    ).toThrow();
    expect(() =>
      validateGetMarketplacePharmaciesInput({ countryCode: "GHA" })
    ).toThrow();
    expect(() =>
      validateGetMarketplacePharmaciesInput({ countryCode: "gh" })
    ).toThrow();
  });

  test("valid countryCode + optional cityCode → no throw", () => {
    expect(() =>
      validateGetMarketplacePharmaciesInput({ countryCode: "GH" })
    ).not.toThrow();
    expect(() =>
      validateGetMarketplacePharmaciesInput({
        countryCode: "GH",
        cityCode: "accra",
      })
    ).not.toThrow();
  });

  test("empty cityCode (when provided) → throws", () => {
    expect(() =>
      validateGetMarketplacePharmaciesInput({
        countryCode: "GH",
        cityCode: "",
      })
    ).toThrow();
  });
});

describe("projectListingSafe — output never leaks license metadata", () => {
  test("strips every license field, status, and reason", () => {
    const out = projectListingSafe("uid1", {
      pharmacyName: "Alpha",
      address: "Rue 1",
      countryCode: "GH",
      cityCode: "accra",
      city: "Accra",
      phoneNumber: "+233200000000",
      locationData: { coordinates: { latitude: 5.5, longitude: -0.2 } },
      licenseStatus: "rejected",
      licenseRejectionReason: "stolen number",
      licenseVerifiedBy: "admin-xyz",
      licenseGraceEndsAt: { toMillis: () => 1 },
      licenseNumber: "GH-0001",
    });
    expect(out).toEqual({
      uid: "uid1",
      pharmacyName: "Alpha",
      address: "Rue 1",
      countryCode: "GH",
      cityCode: "accra",
      city: "Accra",
      phoneNumber: "+233200000000",
      locationData: { coordinates: { latitude: 5.5, longitude: -0.2 } },
    });
    expect(Object.keys(out)).not.toContain("licenseStatus");
    expect(Object.keys(out)).not.toContain("licenseRejectionReason");
    expect(Object.keys(out)).not.toContain("licenseNumber");
  });

  test("missing optional fields → keys absent (no nulls)", () => {
    const out = projectListingSafe("u", {
      pharmacyName: "Alpha",
      countryCode: "GH",
    });
    expect(out.uid).toBe("u");
    expect(out.pharmacyName).toBe("Alpha");
    expect(out.address).toBe("");
    expect("city" in out).toBe(false);
    expect("cityCode" in out).toBe(false);
    expect("locationData" in out).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Callable matrix — 7 architect-locked scenarios + bonus guards.
// ---------------------------------------------------------------------------

const mandatoryCountries = {
  GH: { licenseRequired: true, licenseGracePeriodDays: 30 },
};
const nonMandatoryCountries = {
  CM: { licenseRequired: false },
};

function authedReq(input: Record<string, unknown>): {
  auth: { uid: string };
  data: Record<string, unknown>;
} {
  return { auth: { uid: "caller-uid" }, data: input };
}

describe("getMarketplacePharmacies — license gate matrix", () => {
  test("(1) verified pharmacy → visible", async () => {
    setSystemConfigCountries(mandatoryCountries);
    setPharmacies([
      {
        uid: "v1",
        data: {
          pharmacyName: "Verified Pharma",
          address: "X",
          countryCode: "GH",
          licenseStatus: "verified",
        },
      },
    ]);
    const res = (await wrapped(authedReq({ countryCode: "GH" }) as any)) as {
      pharmacies: Array<{ uid: string }>;
    };
    expect(res.pharmacies).toHaveLength(1);
    expect(res.pharmacies[0].uid).toBe("v1");
  });

  test("(2) pending_verification → hidden", async () => {
    setSystemConfigCountries(mandatoryCountries);
    setPharmacies([
      {
        uid: "p1",
        data: {
          pharmacyName: "Pending Pharma",
          countryCode: "GH",
          licenseStatus: "pending_verification",
        },
      },
    ]);
    const res = (await wrapped(authedReq({ countryCode: "GH" }) as any)) as {
      pharmacies: unknown[];
    };
    expect(res.pharmacies).toHaveLength(0);
  });

  test("(3) grace_period active (licenseGraceEndsAt > now) → visible", async () => {
    setSystemConfigCountries(mandatoryCountries);
    const futureMs = Date.now() + 24 * 60 * 60 * 1000; // +1 day
    setPharmacies([
      {
        uid: "g1",
        data: {
          pharmacyName: "Grace Active",
          countryCode: "GH",
          licenseStatus: "grace_period",
          licenseGraceEndsAt: { toMillis: () => futureMs },
        },
      },
    ]);
    const res = (await wrapped(authedReq({ countryCode: "GH" }) as any)) as {
      pharmacies: Array<{ uid: string }>;
    };
    expect(res.pharmacies).toHaveLength(1);
    expect(res.pharmacies[0].uid).toBe("g1");
  });

  test("(4) grace_period expired → hidden", async () => {
    setSystemConfigCountries(mandatoryCountries);
    const pastMs = Date.now() - 24 * 60 * 60 * 1000; // -1 day
    setPharmacies([
      {
        uid: "ge",
        data: {
          pharmacyName: "Grace Expired",
          countryCode: "GH",
          licenseStatus: "grace_period",
          licenseGraceEndsAt: { toMillis: () => pastMs },
        },
      },
    ]);
    const res = (await wrapped(authedReq({ countryCode: "GH" }) as any)) as {
      pharmacies: unknown[];
    };
    expect(res.pharmacies).toHaveLength(0);
  });

  test("(5) rejected → hidden", async () => {
    setSystemConfigCountries(mandatoryCountries);
    setPharmacies([
      {
        uid: "r1",
        data: {
          pharmacyName: "Rejected",
          countryCode: "GH",
          licenseStatus: "rejected",
          licenseRejectionReason: "wrong number",
        },
      },
    ]);
    const res = (await wrapped(authedReq({ countryCode: "GH" }) as any)) as {
      pharmacies: unknown[];
    };
    expect(res.pharmacies).toHaveLength(0);
  });

  test("(6) country non mandatory → ALL pharmacies visible regardless of licenseStatus", async () => {
    setSystemConfigCountries(nonMandatoryCountries);
    setPharmacies([
      {
        uid: "n1",
        data: {
          pharmacyName: "No status",
          countryCode: "CM",
          // No licenseStatus at all.
        },
      },
      {
        uid: "n2",
        data: {
          pharmacyName: "Even rejected gets through",
          countryCode: "CM",
          licenseStatus: "rejected",
        },
      },
    ]);
    const res = (await wrapped(authedReq({ countryCode: "CM" }) as any)) as {
      pharmacies: Array<{ uid: string }>;
    };
    expect(res.pharmacies.map((p) => p.uid).sort()).toEqual(["n1", "n2"]);
  });

  test("(7) unknown country → zero results + structured logger.warn", async () => {
    setSystemConfigCountries(mandatoryCountries); // GH only
    setPharmacies([
      {
        uid: "x1",
        data: {
          pharmacyName: "Should not appear",
          countryCode: "ZZ",
          licenseStatus: "verified",
        },
      },
    ]);
    const res = (await wrapped(authedReq({ countryCode: "ZZ" }) as any)) as {
      pharmacies: unknown[];
    };
    expect(res.pharmacies).toHaveLength(0);
    expect(loggerWarn).toHaveBeenCalledWith(
      "getMarketplacePharmacies: unknown country",
      expect.objectContaining({ countryCode: "ZZ" })
    );
  });
});

describe("getMarketplacePharmacies — output safety + auth + edge cases", () => {
  test("(8) listing-safe output : licenseStatus + reason are stripped", async () => {
    setSystemConfigCountries(mandatoryCountries);
    setPharmacies([
      {
        uid: "v1",
        data: {
          pharmacyName: "Verified",
          countryCode: "GH",
          licenseStatus: "verified",
          licenseRejectionReason: "irrelevant",
          licenseNumber: "GH-0042",
          licenseDocumentUrl: "https://example.com/lic.pdf",
        },
      },
    ]);
    const res = (await wrapped(authedReq({ countryCode: "GH" }) as any)) as {
      pharmacies: Array<Record<string, unknown>>;
    };
    expect(res.pharmacies).toHaveLength(1);
    const p = res.pharmacies[0];
    expect(p).not.toHaveProperty("licenseStatus");
    expect(p).not.toHaveProperty("licenseRejectionReason");
    expect(p).not.toHaveProperty("licenseNumber");
    expect(p).not.toHaveProperty("licenseDocumentUrl");
  });

  test("(9) unauthenticated call → throws unauthenticated", async () => {
    setSystemConfigCountries(mandatoryCountries);
    await expect(
      wrapped({ data: { countryCode: "GH" } } as any)
    ).rejects.toMatchObject({ code: expect.stringMatching(/unauthenticated/i) });
  });

  test("(10) invalid countryCode shape → throws invalid-argument", async () => {
    setSystemConfigCountries(mandatoryCountries);
    await expect(
      wrapped(authedReq({ countryCode: "gh" }) as any)
    ).rejects.toMatchObject({
      code: expect.stringMatching(/invalid-argument/i),
    });
  });

  test("(11) system_config/main absent entirely → fail-closed, zero results + warn", async () => {
    setSystemConfigCountries(null); // doc absent
    setPharmacies([
      {
        uid: "v1",
        data: {
          pharmacyName: "Verified but config missing",
          countryCode: "GH",
          licenseStatus: "verified",
        },
      },
    ]);
    const res = (await wrapped(authedReq({ countryCode: "GH" }) as any)) as {
      pharmacies: unknown[];
    };
    expect(res.pharmacies).toHaveLength(0);
    expect(loggerWarn).toHaveBeenCalled();
  });

  test("(12) cityCode filter narrows the result set", async () => {
    setSystemConfigCountries(mandatoryCountries);
    setPharmacies([
      {
        uid: "accra1",
        data: {
          pharmacyName: "Accra Pharma",
          countryCode: "GH",
          cityCode: "accra",
          licenseStatus: "verified",
        },
      },
      {
        uid: "kumasi1",
        data: {
          pharmacyName: "Kumasi Pharma",
          countryCode: "GH",
          cityCode: "kumasi",
          licenseStatus: "verified",
        },
      },
    ]);
    const res = (await wrapped(
      authedReq({ countryCode: "GH", cityCode: "accra" }) as any
    )) as { pharmacies: Array<{ uid: string }> };
    expect(res.pharmacies.map((p) => p.uid)).toEqual(["accra1"]);
  });
});
