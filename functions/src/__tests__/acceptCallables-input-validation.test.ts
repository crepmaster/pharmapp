/**
 * Sprint 2A.3 F2A3-FINDING-2 — Real callable-level tests for the two
 * accept callables, focused on the input-validation branches that
 * `licenseGate-async-matrix.test.ts` could not cover (because that
 * file tests the helper, not the wrapping callables).
 *
 * Scope kept minimal as approved by the architect : we prove the
 * "missing counterparty ID → failed-precondition" fail-closed branches
 * actually fire when the proposal / offer doc lacks fromPharmacyId /
 * sellerPharmacyId. We do NOT cover happy paths (the transactional
 * downstream logic already has integration coverage via the existing
 * Bloc 2 tests + manual QA).
 *
 * Implementation strategy : `firebase-functions-test` v3 is already in
 * devDependencies. We `wrap()` the v2 onCall callable and invoke it
 * with mocked Firestore that returns a proposal/offer doc minus the
 * counterparty ID field. Module-scope `getFirestore()` calls in the
 * callables under test resolve to our mock.
 */
import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Module-level mocks (must be declared BEFORE importing the callables).
// ---------------------------------------------------------------------------

const mockGet = jest.fn() as jest.MockedFunction<() => Promise<unknown>>;
const mockDoc = jest.fn(() => ({ get: mockGet }));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));
const mockRunTransaction = jest.fn();

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({
    collection: mockCollection,
    runTransaction: mockRunTransaction,
    batch: jest.fn(() => ({ commit: jest.fn(), update: jest.fn() })),
  })),
  FieldValue: {
    serverTimestamp: jest.fn(() => "mock-timestamp"),
    delete: jest.fn(() => "mock-delete"),
    increment: jest.fn((n: number) => ({ __op: "increment", n })),
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

// ---------------------------------------------------------------------------
// firebase-functions-test wrappers (v3, offline mode).
// ---------------------------------------------------------------------------

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();

import { acceptExchangeProposal } from "../acceptExchangeProposal.js";
import { acceptMedicineRequestOffer } from "../acceptMedicineRequestOffer.js";

const wrappedAcceptExchange = testFns.wrap(acceptExchangeProposal);
const wrappedAcceptOffer = testFns.wrap(acceptMedicineRequestOffer);

afterAll(() => {
  testFns.cleanup();
});

// ---------------------------------------------------------------------------
// Mock orchestration helpers.
// ---------------------------------------------------------------------------

/**
 * Sequence of get() resolutions used by the callable being tested.
 *
 * acceptExchangeProposal expected sequence (relevant prefix only) :
 *   1. pharmacies/{caller}        — caller pharmacy snap (license gate read)
 *   2. system_config/main          — system config snap
 *   3. exchange_proposals/{id}     — proposal pre-tx read
 *
 * acceptMedicineRequestOffer expected sequence (relevant prefix only) :
 *   1. pharmacies/{caller}         — caller pharmacy (license gate)
 *   2. system_config/main          — system config
 *   3. medicine_request_offers/{id}— offer pre-tx read
 *
 * Each test feeds the callable enough .get() returns to reach the
 * branch we want to assert, then expects the throw.
 */
function setSequentialGets(snapshots: Array<{ exists: boolean; data: () => unknown }>) {
  let i = 0;
  mockGet.mockReset();
  mockGet.mockImplementation(async () => {
    if (i >= snapshots.length) {
      throw new Error(
        `Unexpected extra .get() call (#${i + 1}); test supplied ${snapshots.length} snaps`
      );
    }
    return snapshots[i++];
  });
}

const CALLER_UID = "caller-uid";

/** Caller pharmacy verified in a license-required country — gate passes. */
const CALLER_VERIFIED = {
  exists: true,
  data: () => ({
    countryCode: "GH",
    licenseStatus: "verified",
  }),
};

/** system_config/main with GH as a license-required country. */
const SYS_CONFIG_GH_REQUIRED = {
  exists: true,
  data: () => ({
    countries: {
      GH: { licenseRequired: true },
    },
  }),
};

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

describe("acceptExchangeProposal — input-validation (F2A3-FINDING-2)", () => {
  test("proposal sans fromPharmacyId → failed-precondition", async () => {
    setSequentialGets([
      CALLER_VERIFIED, // caller pharmacy
      SYS_CONFIG_GH_REQUIRED, // sysconfig
      // proposal pre-tx — exists but no fromPharmacyId field
      {
        exists: true,
        data: () => ({
          // NOTE: deliberately omits fromPharmacyId
          toPharmacyId: CALLER_UID,
          status: "pending",
        }),
      },
    ]);

    await expect(
      wrappedAcceptExchange({
        data: { proposalId: "proposal-without-counterparty" },
        auth: { uid: CALLER_UID },
      } as any)
    ).rejects.toMatchObject({
      code: "failed-precondition",
      message: expect.stringMatching(/counterparty/i),
    });
  });

  test("proposal sans proposalId → invalid-argument (post-gate input validation)", async () => {
    // Note: the license gate runs BEFORE input validation, so the caller
    // pharmacy + sysconfig reads must still be provided.
    setSequentialGets([CALLER_VERIFIED, SYS_CONFIG_GH_REQUIRED]);
    await expect(
      wrappedAcceptExchange({
        data: {},
        auth: { uid: CALLER_UID },
      } as any)
    ).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });
});

describe("acceptMedicineRequestOffer — input-validation (F2A3-FINDING-2)", () => {
  test("offer sans sellerPharmacyId → failed-precondition", async () => {
    setSequentialGets([
      CALLER_VERIFIED, // caller pharmacy
      SYS_CONFIG_GH_REQUIRED, // sysconfig
      // offer pre-tx — exists but no sellerPharmacyId
      {
        exists: true,
        data: () => ({
          // NOTE: deliberately omits sellerPharmacyId
          requestId: "req-1",
          status: "pending",
        }),
      },
    ]);

    await expect(
      wrappedAcceptOffer({
        data: { requestId: "req-1", offerId: "offer-without-seller" },
        auth: { uid: CALLER_UID },
      } as any)
    ).rejects.toMatchObject({
      code: "failed-precondition",
      message: expect.stringMatching(/seller/i),
    });
  });

  test("offer doc absent → not-found", async () => {
    setSequentialGets([
      CALLER_VERIFIED,
      SYS_CONFIG_GH_REQUIRED,
      { exists: false, data: () => undefined },
    ]);

    await expect(
      wrappedAcceptOffer({
        data: { requestId: "req-1", offerId: "ghost-offer" },
        auth: { uid: CALLER_UID },
      } as any)
    ).rejects.toMatchObject({
      code: "not-found",
    });
  });
});
