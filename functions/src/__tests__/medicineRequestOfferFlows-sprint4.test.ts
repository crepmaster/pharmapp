/**
 * Sprint 4 (F-BLOC2-P2) — Callable-level tests for the medicine-request
 * exchange-mode flow. Uses the same firebase-functions-test offline
 * pattern as `acceptCallables-input-validation.test.ts`.
 *
 * Scope :
 *   - createMedicineRequest: requestMode purchase/exchange/invalid.
 *   - submitMedicineRequestOffer: parity matrix, exchangeItem presence,
 *     license counterparty (requester) gate.
 *   - acceptMedicineRequestOffer: branch routing (purchase vs exchange),
 *     missing exchangeInventoryItemId for exchange offers, unsupported
 *     mode rejection.
 *
 * The tests stop at the moment a write would be attempted (we let the
 * mocked Firestore explode predictably) — we are validating
 * input-validation, parity, and gating, not the transactional engine
 * (which is covered by `exchangePipeline.test.ts` + `exchange.test.ts`).
 */
import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Firebase Admin / logger mocks. Defined BEFORE importing callables.
// ---------------------------------------------------------------------------

const mockGet = jest.fn() as jest.MockedFunction<() => Promise<unknown>>;
const mockSet = jest.fn() as jest.MockedFunction<(d: unknown) => Promise<unknown>>;
const mockUpdate = jest.fn() as jest.MockedFunction<(d: unknown) => Promise<unknown>>;
const mockDoc = jest.fn(() => ({ get: mockGet, set: mockSet, update: mockUpdate }));
const mockCollection = jest.fn(() => ({ doc: mockDoc, where: jest.fn(() => ({ get: mockGet })) }));
const mockRunTransaction = jest.fn() as jest.MockedFunction<
  (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>
>;

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  })),
  FieldValue: {
    serverTimestamp: jest.fn(() => "mock-ts"),
    increment: jest.fn((n: number) => ({ __op: "increment", n })),
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

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();

import { createMedicineRequest } from "../createMedicineRequest.js";
import { submitMedicineRequestOffer } from "../submitMedicineRequestOffer.js";
import { acceptMedicineRequestOffer } from "../acceptMedicineRequestOffer.js";

const wrappedCreate = testFns.wrap(createMedicineRequest);
const wrappedSubmit = testFns.wrap(submitMedicineRequestOffer);
const wrappedAccept = testFns.wrap(acceptMedicineRequestOffer);

afterAll(() => testFns.cleanup());

const CALLER_UID = "caller-uid";
const REQUESTER_UID = "requester-uid";
const SELLER_UID = "seller-uid";

const VERIFIED_PHARMACY = {
  exists: true,
  data: () => ({
    countryCode: "CM",
    cityCode: "douala",
    licenseStatus: "verified",
    pharmacyName: "Pharm",
    address: "Addr",
    phoneNumber: "+237600000000",
    subscriptionStatus: "active",
  }),
};

const SYS_CONFIG_CM_NOT_REQUIRED = {
  exists: true,
  data: () => ({
    countries: {
      CM: { licenseRequired: false, defaultCurrencyCode: "XAF" },
    },
  }),
};

function setSequentialGets(snapshots: Array<{ exists: boolean; data: () => unknown }>) {
  let i = 0;
  mockGet.mockReset();
  mockGet.mockImplementation(async () => {
    if (i >= snapshots.length) {
      throw new Error(
        `Unexpected extra .get() (#${i + 1}); supplied ${snapshots.length}`
      );
    }
    return snapshots[i++];
  });
}

beforeEach(() => {
  mockSet.mockReset();
  mockSet.mockResolvedValue(undefined);
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue(undefined);
  mockRunTransaction.mockReset();
});

// ===========================================================================
// createMedicineRequest — requestMode validation (lock #2)
// ===========================================================================

describe("createMedicineRequest — requestMode", () => {
  test("rejects requestMode=either with invalid-argument", async () => {
    setSequentialGets([
      VERIFIED_PHARMACY, // license gate pharmacy read
      SYS_CONFIG_CM_NOT_REQUIRED, // license gate sysconfig
    ]);
    await expect(
      wrappedCreate({
        data: {
          medicineId: "M-1",
          medicineSnapshot: { name: "X" },
          requestedQuantity: 1,
          requestMode: "either",
          currencyCode: "XAF",
        },
        auth: { uid: CALLER_UID },
      } as never)
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  test("rejects missing requestMode with invalid-argument", async () => {
    setSequentialGets([VERIFIED_PHARMACY, SYS_CONFIG_CM_NOT_REQUIRED]);
    await expect(
      wrappedCreate({
        data: {
          medicineId: "M-1",
          medicineSnapshot: {},
          requestedQuantity: 1,
          currencyCode: "XAF",
        },
        auth: { uid: CALLER_UID },
      } as never)
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  test("accepts requestMode=exchange (write reached)", async () => {
    setSequentialGets([
      VERIFIED_PHARMACY, // license gate pharmacy
      SYS_CONFIG_CM_NOT_REQUIRED, // license gate sysconfig
      VERIFIED_PHARMACY, // pharmacy profile read
      SYS_CONFIG_CM_NOT_REQUIRED, // currency validation sysconfig
    ]);
    const result = await wrappedCreate({
      data: {
        medicineId: "M-1",
        medicineSnapshot: { name: "X" },
        requestedQuantity: 1,
        requestMode: "exchange",
        currencyCode: "XAF",
      },
      auth: { uid: CALLER_UID },
    } as never);
    expect(result).toMatchObject({ success: true });
    expect(mockSet).toHaveBeenCalledTimes(1);
    const payload = mockSet.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.requestMode).toBe("exchange");
  });

  test("accepts requestMode=purchase (regression)", async () => {
    setSequentialGets([
      VERIFIED_PHARMACY,
      SYS_CONFIG_CM_NOT_REQUIRED,
      VERIFIED_PHARMACY,
      SYS_CONFIG_CM_NOT_REQUIRED,
    ]);
    const result = await wrappedCreate({
      data: {
        medicineId: "M-1",
        medicineSnapshot: { name: "X" },
        requestedQuantity: 1,
        requestMode: "purchase",
        currencyCode: "XAF",
      },
      auth: { uid: CALLER_UID },
    } as never);
    expect(result).toMatchObject({ success: true });
    const payload = mockSet.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.requestMode).toBe("purchase");
  });
});

// ===========================================================================
// submitMedicineRequestOffer — parity / exchangeItem (locks #2, #4)
// ===========================================================================

describe("submitMedicineRequestOffer — parity matrix", () => {
  const purchaseRequest = {
    exists: true,
    data: () => ({
      requestMode: "purchase",
      status: "open",
      countryCode: "CM",
      cityCode: "douala",
      requesterPharmacyId: REQUESTER_UID,
      medicineId: "M-1",
      currencyCode: "XAF",
    }),
  };
  const exchangeRequest = {
    exists: true,
    data: () => ({
      requestMode: "exchange",
      status: "open",
      countryCode: "CM",
      cityCode: "douala",
      requesterPharmacyId: REQUESTER_UID,
      medicineId: "M-1",
      currencyCode: "XAF",
    }),
  };

  test("purchase offer on exchange request → failed-precondition", async () => {
    setSequentialGets([
      VERIFIED_PHARMACY, // seller license gate pharmacy
      SYS_CONFIG_CM_NOT_REQUIRED, // seller license gate sysconfig
      exchangeRequest, // request read
    ]);
    await expect(
      wrappedSubmit({
        data: {
          requestId: "req-1",
          inventoryItemId: "inv-s",
          offeredQuantity: 10,
          unitPrice: 5,
          offerType: "purchase",
        },
        auth: { uid: SELLER_UID },
      } as never)
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  test("exchange offer on purchase request → failed-precondition", async () => {
    setSequentialGets([
      VERIFIED_PHARMACY,
      SYS_CONFIG_CM_NOT_REQUIRED,
      purchaseRequest,
    ]);
    await expect(
      wrappedSubmit({
        data: {
          requestId: "req-1",
          inventoryItemId: "inv-s",
          offeredQuantity: 10,
          offerType: "exchange",
          exchangeItem: {
            medicineId: "M-B",
            medicineName: "B",
            dosage: "10mg",
            form: "tablet",
            quantity: 30,
          },
        },
        auth: { uid: SELLER_UID },
      } as never)
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  test("exchange offer without exchangeItem → invalid-argument", async () => {
    setSequentialGets([
      VERIFIED_PHARMACY,
      SYS_CONFIG_CM_NOT_REQUIRED,
      exchangeRequest,
    ]);
    await expect(
      wrappedSubmit({
        data: {
          requestId: "req-1",
          inventoryItemId: "inv-s",
          offeredQuantity: 10,
          offerType: "exchange",
        },
        auth: { uid: SELLER_UID },
      } as never)
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  test("purchase offer with exchangeItem → invalid-argument", async () => {
    setSequentialGets([
      VERIFIED_PHARMACY,
      SYS_CONFIG_CM_NOT_REQUIRED,
      purchaseRequest,
    ]);
    await expect(
      wrappedSubmit({
        data: {
          requestId: "req-1",
          inventoryItemId: "inv-s",
          offeredQuantity: 10,
          unitPrice: 5,
          offerType: "purchase",
          exchangeItem: {
            medicineId: "M-B",
            medicineName: "B",
            dosage: "10mg",
            form: "tablet",
            quantity: 30,
          },
        },
        auth: { uid: SELLER_UID },
      } as never)
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  test("purchase offer without unitPrice → invalid-argument", async () => {
    setSequentialGets([
      VERIFIED_PHARMACY, // seller license gate
      SYS_CONFIG_CM_NOT_REQUIRED,
      purchaseRequest, // request read (parity passes purchase↔purchase)
    ]);
    await expect(
      wrappedSubmit({
        data: {
          requestId: "req-1",
          inventoryItemId: "inv-s",
          offeredQuantity: 10,
          offerType: "purchase",
        },
        auth: { uid: SELLER_UID },
      } as never)
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("submitMedicineRequestOffer — license counterparty gate (lock #8)", () => {
  test("requester license rejected → failed-precondition", async () => {
    const REJECTED_REQUESTER = {
      exists: true,
      data: () => ({
        countryCode: "GH",
        licenseStatus: "rejected",
      }),
    };
    const SYS_CONFIG_GH_REQUIRED = {
      exists: true,
      data: () => ({
        countries: { GH: { licenseRequired: true } },
      }),
    };
    const exchangeRequest = {
      exists: true,
      data: () => ({
        requestMode: "exchange",
        status: "open",
        countryCode: "GH",
        cityCode: "accra",
        requesterPharmacyId: REQUESTER_UID,
        medicineId: "M-1",
        currencyCode: "GHS",
      }),
    };

    setSequentialGets([
      // seller license gate
      {
        exists: true,
        data: () => ({ countryCode: "GH", licenseStatus: "verified" }),
      },
      SYS_CONFIG_GH_REQUIRED,
      // request read
      exchangeRequest,
      // requester license gate
      REJECTED_REQUESTER,
      SYS_CONFIG_GH_REQUIRED,
    ]);

    await expect(
      wrappedSubmit({
        data: {
          requestId: "req-1",
          inventoryItemId: "inv-s",
          offeredQuantity: 10,
          offerType: "exchange",
          exchangeItem: {
            medicineId: "M-B",
            medicineName: "B",
            dosage: "10mg",
            form: "tablet",
            quantity: 30,
          },
        },
        auth: { uid: SELLER_UID },
      } as never)
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });
});

// ===========================================================================
// acceptMedicineRequestOffer — exchange branch routing (locks #5, #8)
// ===========================================================================

describe("acceptMedicineRequestOffer — exchange routing", () => {
  test("offer.offerType=exchange + missing exchangeInventoryItemId → invalid-argument", async () => {
    setSequentialGets([
      VERIFIED_PHARMACY, // caller license gate
      SYS_CONFIG_CM_NOT_REQUIRED,
      {
        exists: true,
        data: () => ({
          sellerPharmacyId: SELLER_UID,
          offerType: "exchange",
        }),
      }, // pre-tx offer read
      VERIFIED_PHARMACY, // seller license gate
      SYS_CONFIG_CM_NOT_REQUIRED,
    ]);
    await expect(
      wrappedAccept({
        data: { requestId: "r1", offerId: "o1" },
        auth: { uid: CALLER_UID },
      } as never)
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  test("offer.offerType=unknown → failed-precondition", async () => {
    setSequentialGets([
      VERIFIED_PHARMACY,
      SYS_CONFIG_CM_NOT_REQUIRED,
      {
        exists: true,
        data: () => ({
          sellerPharmacyId: SELLER_UID,
          offerType: "rental",
        }),
      },
      VERIFIED_PHARMACY,
      SYS_CONFIG_CM_NOT_REQUIRED,
    ]);
    await expect(
      wrappedAccept({
        data: { requestId: "r1", offerId: "o1" },
        auth: { uid: CALLER_UID },
      } as never)
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  test("offer.offerType=exchange + exchangeInventoryItemId provided → tx invoked with exchange branch", async () => {
    setSequentialGets([
      VERIFIED_PHARMACY,
      SYS_CONFIG_CM_NOT_REQUIRED,
      {
        exists: true,
        data: () => ({
          sellerPharmacyId: SELLER_UID,
          offerType: "exchange",
        }),
      },
      VERIFIED_PHARMACY,
      SYS_CONFIG_CM_NOT_REQUIRED,
    ]);
    mockRunTransaction.mockImplementation(async () => {
      // Returning a fake result short-circuits the bridge logic.
      // What matters here is that runTransaction was invoked at all,
      // signalling the exchange branch was taken (not rejected pre-tx).
      return { proposalId: "p-stub", deliveryId: "d-stub" };
    });
    const result = await wrappedAccept({
      data: {
        requestId: "r1",
        offerId: "o1",
        exchangeInventoryItemId: "inv-req-1",
      },
      auth: { uid: CALLER_UID },
    } as never);
    expect(result).toMatchObject({
      success: true,
      proposalId: "p-stub",
      deliveryId: "d-stub",
    });
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
  });

  test("offer.offerType=purchase → tx invoked with purchase branch (regression)", async () => {
    setSequentialGets([
      VERIFIED_PHARMACY,
      SYS_CONFIG_CM_NOT_REQUIRED,
      {
        exists: true,
        data: () => ({
          sellerPharmacyId: SELLER_UID,
          offerType: "purchase",
        }),
      },
      VERIFIED_PHARMACY,
      SYS_CONFIG_CM_NOT_REQUIRED,
    ]);
    mockRunTransaction.mockResolvedValueOnce({
      proposalId: "p-purchase",
      deliveryId: "d-purchase",
    });
    const result = await wrappedAccept({
      data: { requestId: "r1", offerId: "o1" },
      auth: { uid: CALLER_UID },
    } as never);
    expect(result).toMatchObject({
      proposalId: "p-purchase",
      deliveryId: "d-purchase",
    });
  });
});
