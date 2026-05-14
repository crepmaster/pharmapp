/**
 * Sprint 4 — Pure-helper tests for `lib/exchangePipeline.ts`.
 *
 * These cover the contract that BOTH `createExchangeProposal` and the
 * medicine_request exchange bridge depend on. We test:
 *
 *   - `assertCanonicalMode` accepts purchase/exchange and rejects anything
 *     else (locks #1, #2).
 *   - `assertOfferMatchesRequest` enforces strict parity (lock #2).
 *   - `validateExchangeItemInput` validates all required fields (lock #4).
 *   - `buildCanonicalProposalDocument` produces the canonical shape with
 *     correct `reservations` discriminated by `details.type`.
 *   - `reserveExchangeInventory` validates owner/medicine/dosage/form/qty
 *     and issues exactly one update with `-availableQuantity` and
 *     `+reservedQuantity` (lock #5).
 */
import { jest } from "@jest/globals";

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

const incrementMock = jest.fn((n: number) => ({ __op: "increment", n }));
const serverTimestampMock = jest.fn(() => "mock-server-ts");

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({})),
  FieldValue: {
    increment: incrementMock,
    serverTimestamp: serverTimestampMock,
    delete: jest.fn(() => "mock-delete"),
  },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

import {
  assertCanonicalMode,
  assertOfferMatchesRequest,
  buildCanonicalProposalDocument,
  reserveExchangeInventory,
  resolveCourierFee,
  validateExchangeItemInput,
  type BuildProposalInput,
  type CanonicalInventorySnapshot,
} from "../lib/exchangePipeline.js";

// ---------------------------------------------------------------------------
// assertCanonicalMode
// ---------------------------------------------------------------------------

describe("assertCanonicalMode", () => {
  test("returns 'purchase' for 'purchase'", () => {
    expect(assertCanonicalMode("purchase", "requestMode")).toBe("purchase");
  });

  test("returns 'exchange' for 'exchange'", () => {
    expect(assertCanonicalMode("exchange", "requestMode")).toBe("exchange");
  });

  test.each(["either", "PURCHASE", "Exchange", "", null, undefined, 1, {}])(
    "rejects %p with invalid-argument",
    (value) => {
      expect(() => assertCanonicalMode(value, "requestMode")).toThrow(
        expect.objectContaining({ code: "invalid-argument" })
      );
    }
  );
});

// ---------------------------------------------------------------------------
// assertOfferMatchesRequest
// ---------------------------------------------------------------------------

describe("assertOfferMatchesRequest", () => {
  test("purchase ↔ purchase passes", () => {
    expect(() => assertOfferMatchesRequest("purchase", "purchase")).not.toThrow();
  });
  test("exchange ↔ exchange passes", () => {
    expect(() => assertOfferMatchesRequest("exchange", "exchange")).not.toThrow();
  });
  test("purchase offer on exchange request → failed-precondition", () => {
    expect(() => assertOfferMatchesRequest("purchase", "exchange")).toThrow(
      expect.objectContaining({ code: "failed-precondition" })
    );
  });
  test("exchange offer on purchase request → failed-precondition", () => {
    expect(() => assertOfferMatchesRequest("exchange", "purchase")).toThrow(
      expect.objectContaining({ code: "failed-precondition" })
    );
  });
});

// ---------------------------------------------------------------------------
// validateExchangeItemInput
// ---------------------------------------------------------------------------

describe("validateExchangeItemInput", () => {
  const VALID = {
    medicineId: "WHO-547-OMEPRAZOLE",
    medicineName: "Omeprazole",
    dosage: "20mg",
    form: "capsule",
    quantity: 30,
    expiryDate: "2027-01",
    lotNumber: "X1234",
  };

  test("happy path returns normalized object", () => {
    const result = validateExchangeItemInput(VALID);
    expect(result).toMatchObject({
      medicineId: "WHO-547-OMEPRAZOLE",
      medicineName: "Omeprazole",
      dosage: "20mg",
      form: "capsule",
      quantity: 30,
      expiryDate: "2027-01",
      lotNumber: "X1234",
    });
  });

  test("trims string fields", () => {
    const result = validateExchangeItemInput({
      ...VALID,
      medicineName: "  Omeprazole  ",
    });
    expect(result.medicineName).toBe("Omeprazole");
  });

  test.each(["medicineId", "medicineName", "dosage", "form"])(
    "rejects missing %s",
    (field) => {
      const bad: Record<string, unknown> = { ...VALID };
      delete bad[field];
      expect(() => validateExchangeItemInput(bad)).toThrow(
        expect.objectContaining({ code: "invalid-argument" })
      );
    }
  );

  test.each(["medicineId", "medicineName", "dosage", "form"])(
    "rejects empty %s",
    (field) => {
      expect(() =>
        validateExchangeItemInput({ ...VALID, [field]: "   " })
      ).toThrow(expect.objectContaining({ code: "invalid-argument" }));
    }
  );

  test.each([0, -1, "1", null, undefined, NaN, Infinity])(
    "rejects quantity=%p",
    (q) => {
      expect(() =>
        validateExchangeItemInput({ ...VALID, quantity: q })
      ).toThrow(expect.objectContaining({ code: "invalid-argument" }));
    }
  );

  test("expiryDate + lotNumber optional → null when absent", () => {
    const { expiryDate, ...rest } = VALID;
    void expiryDate;
    const result = validateExchangeItemInput({ ...rest, lotNumber: undefined });
    expect(result.expiryDate).toBeNull();
    expect(result.lotNumber).toBeNull();
  });

  test("rejects non-object input", () => {
    expect(() => validateExchangeItemInput(null)).toThrow(
      expect.objectContaining({ code: "invalid-argument" })
    );
    expect(() => validateExchangeItemInput("string")).toThrow(
      expect.objectContaining({ code: "invalid-argument" })
    );
  });
});

// ---------------------------------------------------------------------------
// buildCanonicalProposalDocument
// ---------------------------------------------------------------------------

describe("buildCanonicalProposalDocument", () => {
  const baseSnapshot: CanonicalInventorySnapshot = {
    medicineId: "M-1",
    medicineName: "Test Drug",
    packaging: "box",
    lotNumber: "LOT-1",
    expirationDate: null,
    availableQuantityAtOffer: 50,
  };

  test("purchase: reservations.walletReserved = totalPrice, inventoryReserved = null", () => {
    const input: BuildProposalInput = {
      proposalId: "p-1",
      inventoryItemId: "inv-1",
      fromPharmacyId: "buyer",
      toPharmacyId: "seller",
      details: {
        type: "purchase",
        quantity: 10,
        unitPrice: 5,
        totalPrice: 50,
        currency: "XAF",
        medicineName: "Test Drug",
        medicineId: "M-1",
      },
      initialStatus: "pending",
      inventorySnapshot: baseSnapshot,
    };
    const doc = buildCanonicalProposalDocument(input, "ts" as never);
    expect(doc.reservations).toEqual({
      walletReserved: 50,
      inventoryReserved: null,
    });
    expect((doc.details as { type: string }).type).toBe("purchase");
    expect(doc.status).toBe("pending");
    expect(doc.acceptedBy).toBeUndefined();
  });

  test("exchange: reservations.inventoryReserved = exchangeQuantity, walletReserved = null", () => {
    const input: BuildProposalInput = {
      proposalId: "p-2",
      inventoryItemId: "inv-2",
      fromPharmacyId: "requester",
      toPharmacyId: "seller",
      details: {
        type: "exchange",
        quantity: 30,
        medicineName: "Drug A",
        medicineId: "M-A",
        exchangeInventoryItemId: "inv-req-1",
        exchangeMedicineId: "M-B",
        exchangeQuantity: 20,
        exchangeInventorySnapshot: {
          medicineId: "M-B",
          medicineName: "Drug B",
          dosage: "10mg",
          form: "tablet",
          quantityAtAcceptance: 100,
        },
      },
      initialStatus: "accepted",
      acceptedBy: "seller",
      inventorySnapshot: baseSnapshot,
      sourceRequestId: "req-1",
      sourceOfferId: "off-1",
    };
    const doc = buildCanonicalProposalDocument(input, "ts" as never);
    expect(doc.reservations).toEqual({
      walletReserved: null,
      inventoryReserved: 20,
    });
    expect((doc.details as { type: string }).type).toBe("exchange");
    expect(doc.status).toBe("accepted");
    expect(doc.acceptedBy).toBe("seller");
    expect(doc._sourceRequestId).toBe("req-1");
    expect(doc._sourceOfferId).toBe("off-1");
  });

  test("initialStatus='accepted' without acceptedBy throws internal", () => {
    expect(() =>
      buildCanonicalProposalDocument(
        {
          proposalId: "p-3",
          inventoryItemId: "inv-3",
          fromPharmacyId: "x",
          toPharmacyId: "y",
          details: {
            type: "purchase",
            quantity: 1,
            unitPrice: 1,
            totalPrice: 1,
            currency: "XAF",
            medicineName: null,
            medicineId: null,
          },
          initialStatus: "accepted",
          inventorySnapshot: baseSnapshot,
        },
        "ts" as never
      )
    ).toThrow(expect.objectContaining({ code: "internal" }));
  });
});

// ---------------------------------------------------------------------------
// resolveCourierFee — Sprint 4 Finding 1
// ---------------------------------------------------------------------------

describe("resolveCourierFee", () => {
  const baseConfig = (cityCfg: Record<string, unknown>) => ({
    citiesByCountry: { CM: { douala: cityCfg } },
  });

  test("purchase + deliveryFee=500 → 500", () => {
    expect(
      resolveCourierFee({
        proposalType: "purchase",
        totalPrice: 1000,
        countryCode: "CM",
        cityCode: "douala",
        systemConfigData: baseConfig({ deliveryFee: 500 }),
      })
    ).toBe(500);
  });

  test("exchange + exchangeFee=1500 (explicit) → 1500", () => {
    expect(
      resolveCourierFee({
        proposalType: "exchange",
        totalPrice: 0,
        countryCode: "CM",
        cityCode: "douala",
        systemConfigData: baseConfig({ deliveryFee: 1000, exchangeFee: 1500 }),
      })
    ).toBe(1500);
  });

  test("exchange + deliveryFee=500 (no explicit exchangeFee) → 500 × 1.2 = 600", () => {
    expect(
      resolveCourierFee({
        proposalType: "exchange",
        totalPrice: 0,
        countryCode: "CM",
        cityCode: "douala",
        systemConfigData: baseConfig({ deliveryFee: 500 }),
      })
    ).toBe(600);
  });

  test("purchase + no per-city config + totalPrice=1000 → 120 (12% legacy fallback)", () => {
    expect(
      resolveCourierFee({
        proposalType: "purchase",
        totalPrice: 1000,
        countryCode: "CM",
        cityCode: "yaounde",
        systemConfigData: { citiesByCountry: {} },
      })
    ).toBe(120);
  });

  test("exchange + no per-city config + totalPrice=0 → 0 (documented no-config posture)", () => {
    expect(
      resolveCourierFee({
        proposalType: "exchange",
        totalPrice: 0,
        countryCode: "CM",
        cityCode: "douala",
        systemConfigData: { citiesByCountry: {} },
      })
    ).toBe(0);
  });

  test("undefined systemConfigData → uses fallback", () => {
    expect(
      resolveCourierFee({
        proposalType: "exchange",
        totalPrice: 0,
        countryCode: "CM",
        cityCode: "douala",
        systemConfigData: undefined,
      })
    ).toBe(0);
  });

  test("country not in citiesByCountry → 0 for exchange barter", () => {
    expect(
      resolveCourierFee({
        proposalType: "exchange",
        totalPrice: 0,
        countryCode: "GH",
        cityCode: "accra",
        systemConfigData: baseConfig({ deliveryFee: 500 }),
      })
    ).toBe(0);
  });

  test("rounding: deliveryFee=333 × 1.2 = 399.6 → 400", () => {
    expect(
      resolveCourierFee({
        proposalType: "exchange",
        totalPrice: 0,
        countryCode: "CM",
        cityCode: "douala",
        systemConfigData: baseConfig({ deliveryFee: 333 }),
      })
    ).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// reserveExchangeInventory
// ---------------------------------------------------------------------------

describe("reserveExchangeInventory", () => {
  const FAKE_REF = { id: "inv-req" } as unknown as FirebaseFirestore.DocumentReference;

  function mockSnap(data: Record<string, unknown> | null) {
    return {
      exists: data !== null,
      ref: FAKE_REF,
      data: () => data ?? undefined,
    } as unknown as FirebaseFirestore.DocumentSnapshot;
  }

  function mockTx() {
    return {
      update: jest.fn(),
    } as unknown as {
      update: jest.Mock;
    };
  }

  const NOW = new Date("2026-05-14T12:00:00Z");

  const GOOD = {
    pharmacyId: "owner-uid",
    medicineId: "M-B",
    medicineDosage: "10mg",
    medicineForm: "tablet",
    availableQuantity: 100,
    medicineName: "Drug B",
    packaging: "box",
    batch: { lotNumber: "L1", expirationDate: null },
  };

  test("happy path: issues hold and returns snapshot", () => {
    const tx = mockTx();
    const result = reserveExchangeInventory(tx as never, {
      inventorySnap: mockSnap(GOOD),
      expectedOwnerUid: "owner-uid",
      expectedMedicineId: "M-B",
      expectedDosage: "10mg",
      expectedForm: "tablet",
      requiredQuantity: 20,
      now: NOW,
    });
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledWith(
      FAKE_REF,
      expect.objectContaining({
        availableQuantity: { __op: "increment", n: -20 },
        reservedQuantity: { __op: "increment", n: 20 },
      })
    );
    expect(result.snapshot).toMatchObject({
      medicineId: "M-B",
      dosage: "10mg",
      form: "tablet",
      quantityAtAcceptance: 100,
    });
  });

  test("inventory absent → not-found", () => {
    expect(() =>
      reserveExchangeInventory(mockTx() as never, {
        inventorySnap: mockSnap(null),
        expectedOwnerUid: "owner-uid",
        expectedMedicineId: "M-B",
        expectedDosage: "10mg",
        expectedForm: "tablet",
        requiredQuantity: 20,
        now: NOW,
      })
    ).toThrow(expect.objectContaining({ code: "not-found" }));
  });

  test("wrong owner → permission-denied", () => {
    expect(() =>
      reserveExchangeInventory(mockTx() as never, {
        inventorySnap: mockSnap({ ...GOOD, pharmacyId: "someone-else" }),
        expectedOwnerUid: "owner-uid",
        expectedMedicineId: "M-B",
        expectedDosage: "10mg",
        expectedForm: "tablet",
        requiredQuantity: 20,
        now: NOW,
      })
    ).toThrow(expect.objectContaining({ code: "permission-denied" }));
  });

  test("medicineId mismatch → failed-precondition", () => {
    expect(() =>
      reserveExchangeInventory(mockTx() as never, {
        inventorySnap: mockSnap({ ...GOOD, medicineId: "M-WRONG" }),
        expectedOwnerUid: "owner-uid",
        expectedMedicineId: "M-B",
        expectedDosage: "10mg",
        expectedForm: "tablet",
        requiredQuantity: 20,
        now: NOW,
      })
    ).toThrow(expect.objectContaining({ code: "failed-precondition" }));
  });

  test("dosage mismatch → failed-precondition", () => {
    expect(() =>
      reserveExchangeInventory(mockTx() as never, {
        inventorySnap: mockSnap({ ...GOOD, medicineDosage: "20mg" }),
        expectedOwnerUid: "owner-uid",
        expectedMedicineId: "M-B",
        expectedDosage: "10mg",
        expectedForm: "tablet",
        requiredQuantity: 20,
        now: NOW,
      })
    ).toThrow(expect.objectContaining({ code: "failed-precondition" }));
  });

  test("form mismatch → failed-precondition", () => {
    expect(() =>
      reserveExchangeInventory(mockTx() as never, {
        inventorySnap: mockSnap({ ...GOOD, medicineForm: "syrup" }),
        expectedOwnerUid: "owner-uid",
        expectedMedicineId: "M-B",
        expectedDosage: "10mg",
        expectedForm: "tablet",
        requiredQuantity: 20,
        now: NOW,
      })
    ).toThrow(expect.objectContaining({ code: "failed-precondition" }));
  });

  test("insufficient stock → failed-precondition", () => {
    expect(() =>
      reserveExchangeInventory(mockTx() as never, {
        inventorySnap: mockSnap({ ...GOOD, availableQuantity: 5 }),
        expectedOwnerUid: "owner-uid",
        expectedMedicineId: "M-B",
        expectedDosage: "10mg",
        expectedForm: "tablet",
        requiredQuantity: 20,
        now: NOW,
      })
    ).toThrow(expect.objectContaining({ code: "failed-precondition" }));
  });

  test("expired batch → failed-precondition", () => {
    const pastDate = new Date("2020-01-01T00:00:00Z");
    expect(() =>
      reserveExchangeInventory(mockTx() as never, {
        inventorySnap: mockSnap({
          ...GOOD,
          batch: {
            lotNumber: "L1",
            expirationDate: { toDate: () => pastDate },
          },
        }),
        expectedOwnerUid: "owner-uid",
        expectedMedicineId: "M-B",
        expectedDosage: "10mg",
        expectedForm: "tablet",
        requiredQuantity: 20,
        now: NOW,
      })
    ).toThrow(expect.objectContaining({ code: "failed-precondition" }));
  });

  test("case-insensitive dosage/form match passes", () => {
    const tx = mockTx();
    expect(() =>
      reserveExchangeInventory(tx as never, {
        inventorySnap: mockSnap({ ...GOOD, medicineDosage: "10MG", medicineForm: "Tablet" }),
        expectedOwnerUid: "owner-uid",
        expectedMedicineId: "M-B",
        expectedDosage: "10mg",
        expectedForm: "TABLET",
        requiredQuantity: 20,
        now: NOW,
      })
    ).not.toThrow();
    expect(tx.update).toHaveBeenCalledTimes(1);
  });
});
