/**
 * Sprint 2A.2 — Callable-level license gate tests (architect finding #4).
 *
 * Verifies `assertLicenseAllowsMarketplace` against a fully mocked
 * Firestore returning various pharmacy + country snapshots. Covers the
 * counterparty matrix flagged in the architect findings :
 *
 *   - counterparty `verified`                       → resolves
 *   - counterparty `rejected`                       → throws failed-precondition
 *   - counterparty `expired`                        → throws failed-precondition
 *   - counterparty `correction_needed`              → throws failed-precondition
 *   - counterparty `grace_period` not yet expired   → resolves
 *   - counterparty `grace_period` expired           → throws failed-precondition
 *   - counterparty doc missing                      → throws permission-denied
 *   - country `licenseRequired = false`             → resolves regardless of status
 *
 * The fail-closed-on-missing-ID behavior is tested at the callable
 * level via the input-validation branches in
 * `acceptExchangeProposal` / `acceptMedicineRequestOffer`; those throws
 * happen BEFORE `assertLicenseAllowsMarketplace` is called and are
 * trivially covered by reading the relevant `if` branches.
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

describe("assertLicenseAllowsMarketplace — Sprint 2A.2 callable counterparty matrix", () => {
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

    test("missing countryCode on pharmacy → resolves (defensive: country unknown = allow)", async () => {
      // The gate cannot evaluate a country it doesn't know about. The
      // current contract is "default to allow" — documented in
      // licenseGate.ts. If product ever requires "default deny", this
      // test must flip.
      setupSnapshots(
        { licenseStatus: "rejected" },
        null,
        null
      );
      await expect(
        assertLicenseAllowsMarketplace(FAKE_DB, "counterparty-uid")
      ).resolves.toBeUndefined();
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
