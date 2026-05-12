/**
 * `licenseGate` async matrix tests — Sprint 2A.2 + 2A.3.
 *
 * **Honest naming (Sprint 2A.3 architect finding F2A3-FINDING-2)** : this
 * file does NOT exercise the marketplace callables themselves. It tests
 * `assertLicenseAllowsMarketplace`, the async helper that the callables
 * invoke. Real callable-level tests (input-validation branches for
 * missing counterparty IDs, fail-closed throws) live in
 * `acceptCallables-input-validation.test.ts`.
 *
 * Covered scenarios :
 *   - country `licenseRequired = true` × {verified, rejected, expired,
 *     correction_needed, pending_verification, grace_active,
 *     grace_expired, no_status}
 *   - country `licenseRequired = false` × any status → allow
 *   - country unknown / missing on pharmacy / system_config missing
 *     → DENY (Sprint 2A.3 F2A3-FINDING-1 fail-closed)
 *   - pharmacy doc missing entirely → throws permission-denied
 *
 * Mock pattern reuses the module-scope getFirestore() mock from
 * licenseGate.test.ts so the file under test can be imported without
 * side effects.
 */
import { jest } from "@jest/globals";

// --- Firebase Admin / logger mocks -----------------------------------------
const mockGet = jest.fn() as jest.MockedFunction<() => Promise<unknown>>;
const mockDoc = jest.fn(() => ({ get: mockGet }));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({
    collection: mockCollection,
  })),
  FieldValue: {
    serverTimestamp: jest.fn(() => "mock-timestamp"),
    delete: jest.fn(() => "mock-delete"),
  },
  Timestamp: {
    fromMillis: jest.fn((ms: number) => ({
      toMillis: () => ms,
      toDate: () => new Date(ms),
    })),
  },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

import { assertLicenseAllowsMarketplace } from "../lib/licenseGate.js";
import { getFirestore } from "firebase-admin/firestore";

const FAKE_DB = getFirestore() as unknown as Parameters<
  typeof assertLicenseAllowsMarketplace
>[0];

const COUNTRY_REQUIRED = { licenseRequired: true };
const COUNTRY_NOT_REQUIRED = { licenseRequired: false };

/**
 * Configure the mocked Firestore to return:
 *   - `pharmacyData` (or null for missing doc) on the pharmacies/{uid} read
 *   - `countryData` on the system_config/main read, keyed by `countryCode`
 *
 * Implementation: each `.get()` call resolves to a synthesized snapshot
 * that matches the path requested via the most recent `mockDoc` invocation.
 * We track call order via `mockGet.mock.calls.length` since the gate
 * makes exactly 2 reads in order (pharmacy, then system_config).
 */
function setupSnapshots(
  pharmacyData: Record<string, unknown> | null,
  countryCode: string | null,
  countryData: Record<string, unknown> | null
) {
  let callIndex = 0;
  mockGet.mockReset();
  mockGet.mockImplementation(async () => {
    const i = callIndex++;
    if (i === 0) {
      // pharmacies/{uid} read
      return {
        exists: pharmacyData !== null,
        data: () => pharmacyData ?? undefined,
      };
    }
    // system_config/main read
    if (countryCode !== null && countryData !== null) {
      return {
        exists: true,
        data: () => ({ countries: { [countryCode]: countryData } }),
      };
    }
    return { exists: true, data: () => ({ countries: {} }) };
  });
}

function tsFuture(): { toMillis: () => number } {
  // 7 days from now
  return { toMillis: () => Date.now() + 7 * 24 * 60 * 60 * 1000 };
}
function tsPast(): { toMillis: () => number } {
  // 7 days ago
  return { toMillis: () => Date.now() - 7 * 24 * 60 * 60 * 1000 };
}

describe("assertLicenseAllowsMarketplace — async matrix (Sprint 2A.2 + 2A.3)", () => {
  describe("country requires license (mandatory)", () => {
    test("counterparty verified → resolves", async () => {
      setupSnapshots(
        { countryCode: "GH", licenseStatus: "verified" },
        "GH",
        COUNTRY_REQUIRED
      );
      await expect(
        assertLicenseAllowsMarketplace(FAKE_DB, "counterparty-uid")
      ).resolves.toBeUndefined();
    });

    test("counterparty rejected → throws failed-precondition", async () => {
      setupSnapshots(
        { countryCode: "GH", licenseStatus: "rejected" },
        "GH",
        COUNTRY_REQUIRED
      );
      await expect(
        assertLicenseAllowsMarketplace(FAKE_DB, "counterparty-uid")
      ).rejects.toMatchObject({
        code: "failed-precondition",
      });
    });

    test("counterparty expired → throws failed-precondition", async () => {
      setupSnapshots(
        { countryCode: "GH", licenseStatus: "expired" },
        "GH",
        COUNTRY_REQUIRED
      );
      await expect(
        assertLicenseAllowsMarketplace(FAKE_DB, "counterparty-uid")
      ).rejects.toMatchObject({ code: "failed-precondition" });
    });

    test("counterparty correction_needed → throws failed-precondition", async () => {
      setupSnapshots(
        { countryCode: "GH", licenseStatus: "correction_needed" },
        "GH",
        COUNTRY_REQUIRED
      );
      await expect(
        assertLicenseAllowsMarketplace(FAKE_DB, "counterparty-uid")
      ).rejects.toMatchObject({ code: "failed-precondition" });
    });

    test("counterparty pending_verification → throws failed-precondition", async () => {
      setupSnapshots(
        { countryCode: "GH", licenseStatus: "pending_verification" },
        "GH",
        COUNTRY_REQUIRED
      );
      await expect(
        assertLicenseAllowsMarketplace(FAKE_DB, "counterparty-uid")
      ).rejects.toMatchObject({ code: "failed-precondition" });
    });

    test("counterparty grace_period not yet expired → resolves", async () => {
      setupSnapshots(
        {
          countryCode: "GH",
          licenseStatus: "grace_period",
          licenseGraceEndsAt: tsFuture(),
        },
        "GH",
        COUNTRY_REQUIRED
      );
      await expect(
        assertLicenseAllowsMarketplace(FAKE_DB, "counterparty-uid")
      ).resolves.toBeUndefined();
    });

    test("counterparty grace_period expired → throws failed-precondition", async () => {
      setupSnapshots(
        {
          countryCode: "GH",
          licenseStatus: "grace_period",
          licenseGraceEndsAt: tsPast(),
        },
        "GH",
        COUNTRY_REQUIRED
      );
      await expect(
        assertLicenseAllowsMarketplace(FAKE_DB, "counterparty-uid")
      ).rejects.toMatchObject({ code: "failed-precondition" });
    });

    test("counterparty no licenseStatus at all → throws failed-precondition (fail-closed)", async () => {
      setupSnapshots(
        { countryCode: "GH" },
        "GH",
        COUNTRY_REQUIRED
      );
      await expect(
        assertLicenseAllowsMarketplace(FAKE_DB, "counterparty-uid")
      ).rejects.toMatchObject({ code: "failed-precondition" });
    });

    test("counterparty error message is uniform (no leak of internal status)", async () => {
      setupSnapshots(
        { countryCode: "GH", licenseStatus: "rejected" },
        "GH",
        COUNTRY_REQUIRED
      );
      const expected =
        /Marketplace access requires a verified pharmacy license/i;
      await expect(
        assertLicenseAllowsMarketplace(FAKE_DB, "counterparty-uid")
      ).rejects.toMatchObject({ message: expect.stringMatching(expected) });
    });
  });

  describe("country does not require license", () => {
    test("rejected counterparty in non-required country → resolves (country flag wins)", async () => {
      setupSnapshots(
        { countryCode: "CM", licenseStatus: "rejected" },
        "CM",
        COUNTRY_NOT_REQUIRED
      );
      await expect(
        assertLicenseAllowsMarketplace(FAKE_DB, "counterparty-uid")
      ).resolves.toBeUndefined();
    });

  });

  describe("Sprint 2A.3 F2A3-FINDING-1 — unknown / missing country fail-closed", () => {
    test("missing countryCode on pharmacy → DENY (flipped from allow in 2A.3)", async () => {
      // Architect F2A3-FINDING-1 : a modified client could create
      // pharmacies/{uid} without countryCode and bypass the gate. The
      // gate now denies when countryCode is missing — even for an
      // otherwise-verified pharmacy.
      setupSnapshots(
        { licenseStatus: "verified" },
        null,
        null
      );
      await expect(
        assertLicenseAllowsMarketplace(FAKE_DB, "counterparty-uid")
      ).rejects.toMatchObject({ code: "failed-precondition" });
    });

    test("countryCode present but country absent from system_config → DENY", async () => {
      // Pharmacy claims countryCode='XX' but system_config has no XX entry.
      // Treated as unknown country → fail-closed deny.
      setupSnapshots(
        { countryCode: "XX", licenseStatus: "verified" },
        "GH", // mocked sysconfig contains GH only, not XX
        { licenseRequired: true }
      );
      await expect(
        assertLicenseAllowsMarketplace(FAKE_DB, "counterparty-uid")
      ).rejects.toMatchObject({ code: "failed-precondition" });
    });
  });

  describe("pharmacy doc itself missing", () => {
    test("counterparty pharmacies/{uid} doc not found → throws permission-denied", async () => {
      setupSnapshots(null, null, null);
      await expect(
        assertLicenseAllowsMarketplace(FAKE_DB, "ghost-uid")
      ).rejects.toMatchObject({ code: "permission-denied" });
    });
  });
});
