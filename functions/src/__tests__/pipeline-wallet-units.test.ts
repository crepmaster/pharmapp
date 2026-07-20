/**
 * Wallet-unit locks for the proposal-path pharmacy mutations.
 *
 * completeExchangeDelivery-wallet-units.test.ts already locks the three
 * mutation SHAPES at settlement (decrement deducted, decrement available,
 * increment available). This file locks the two remaining proposal-path
 * callables that move a pharmacy wallet:
 *
 *   - acceptExchangeProposal: held → deducted (walletReserved × 100)
 *   - cancelExchangeProposal: held → available release (walletReserved × 100)
 *
 * The reservation itself (createExchangeProposal) and the medicine-request
 * bridge share the identical `majorToWalletUnits(x, "pharmacy")` boundary
 * call; the settlement + these two prove every held/deducted/available
 * shape converts.
 *
 * Business docs keep walletReserved in MAJOR; only the wallet write is
 * converted. Ledger `amount` stays major.
 */
import { jest } from "@jest/globals";

const incrementMock = jest.fn((n: number) => ({ __op: "increment", n }));

interface FakeDoc {
  exists: boolean;
  data?: Record<string, unknown>;
}
let docs: Map<string, FakeDoc>;
let txWrites: Array<{ op: "set" | "update"; path: string; payload: Record<string, unknown> }>;
let autoId: number;

const makeRef = (path: string) => ({ __path: path, id: path.split("/").pop() });
const pathOfRef = (ref: unknown) => (ref as { __path?: string })?.__path ?? "?";

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({
    collection: (col: string) => ({
      doc: (docId?: string) => {
        const id = docId ?? `auto-${col}-${autoId++}`;
        const path = `${col}/${id}`;
        return {
          __path: path,
          id,
          get: () => {
            const d = docs.get(path) ?? { exists: false };
            return Promise.resolve({ ...d, data: () => d.data, ref: makeRef(path), id });
          },
        };
      },
    }),
    runTransaction: async (fn: any) => {
      const tx = {
        get: (ref: unknown) => {
          const path = pathOfRef(ref);
          const d = docs.get(path) ?? { exists: false };
          return Promise.resolve({ ...d, data: () => d.data, ref: makeRef(path) });
        },
        set: (ref: unknown, payload: Record<string, unknown>) =>
          txWrites.push({ op: "set", path: pathOfRef(ref), payload }),
        update: (ref: unknown, payload: Record<string, unknown>) =>
          txWrites.push({ op: "update", path: pathOfRef(ref), payload }),
      };
      return fn(tx);
    },
  })),
  FieldValue: {
    increment: incrementMock,
    serverTimestamp: jest.fn(() => "ts"),
    delete: jest.fn(() => "delete"),
  },
  Timestamp: { now: jest.fn(() => ({ __ts: "now" })) },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// License gate is orthogonal to wallet units; allow it through.
jest.mock("../lib/licenseGate.js", () => ({
  assertLicenseAllowsMarketplace: jest.fn(async () => undefined),
  PROTECTED_LICENSE_FIELDS: [],
}));

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();
import { acceptExchangeProposal } from "../acceptExchangeProposal.js";
import { cancelExchangeProposal } from "../cancelExchangeProposal.js";
const wrappedAccept = testFns.wrap(acceptExchangeProposal);
const wrappedCancel = testFns.wrap(cancelExchangeProposal);
afterAll(() => testFns.cleanup());

const BUYER = "buyer-uid"; // fromPharmacyId
const SELLER = "seller-uid"; // toPharmacyId
const PROPOSAL_ID = "p-1";
const INVENTORY_ID = "inv-1";
const RESERVED = 500; // major
const X = 100;

function proposalDoc() {
  return {
    exists: true,
    data: {
      proposalId: PROPOSAL_ID,
      fromPharmacyId: BUYER,
      toPharmacyId: SELLER,
      status: "pending",
      inventoryItemId: INVENTORY_ID,
      reservations: { walletReserved: RESERVED },
      details: { type: "purchase", totalPrice: RESERVED, currency: "GHS", quantity: 5 },
    },
  };
}

function seedCommon() {
  autoId = 0;
  txWrites = [];
  docs = new Map<string, FakeDoc>([
    [`exchange_proposals/${PROPOSAL_ID}`, proposalDoc()],
    [`wallets/${BUYER}`, { exists: true, data: { available: 100000, held: RESERVED * X, deducted: 0, currency: "GHS" } }],
    [`pharmacies/${BUYER}`, { exists: true, data: { countryCode: "GH", email: "b@x.com" } }],
    [`pharmacies/${SELLER}`, { exists: true, data: { countryCode: "GH", email: "s@x.com" } }],
    [`system_config/main`, { exists: true, data: { countries: { GH: { defaultCurrencyCode: "GHS", licenseRequired: false } } } }],
    [
      `pharmacy_inventory/${INVENTORY_ID}`,
      {
        exists: true,
        data: {
          pharmacyId: SELLER,
          medicineId: "amox",
          medicineName: "Amoxicillin",
          medicineDosage: "500mg",
          medicineForm: "Capsule",
          availableQuantity: 50,
          reservedQuantity: 0,
          batch: { lotNumber: "L1", expirationDate: null },
        },
      },
    ],
  ]);
}

function incrementFor(path: string, field: string): number | undefined {
  const w = txWrites.find(
    (w) =>
      w.path === path &&
      (w.payload[field] as { __op?: string })?.__op === "increment"
  );
  return (w?.payload[field] as { n?: number })?.n;
}

beforeEach(seedCommon);

describe("cancelExchangeProposal — release in legacy pharmacy units", () => {
  const callCancel = () =>
    wrappedCancel({
      data: { proposalId: PROPOSAL_ID },
      auth: { uid: BUYER, token: {} },
    } as never);

  test("available is credited walletReserved × 100", async () => {
    await callCancel();
    expect(incrementFor(`wallets/${BUYER}`, "available")).toBe(RESERVED * X);
  });

  test("held is debited walletReserved × 100", async () => {
    await callCancel();
    expect(incrementFor(`wallets/${BUYER}`, "held")).toBe(-RESERVED * X);
  });
});

describe("acceptExchangeProposal — held → deducted in legacy pharmacy units", () => {
  const callAccept = () =>
    wrappedAccept({
      data: { proposalId: PROPOSAL_ID },
      auth: { uid: SELLER, token: {} },
    } as never);

  test("held is debited walletReserved × 100", async () => {
    await callAccept();
    expect(incrementFor(`wallets/${BUYER}`, "held")).toBe(-RESERVED * X);
  });

  test("deducted is credited walletReserved × 100", async () => {
    await callAccept();
    expect(incrementFor(`wallets/${BUYER}`, "deducted")).toBe(RESERVED * X);
  });
});

// ===========================================================================
// createExchangeProposal — purchase reserve wallet-unit lock
// ===========================================================================
import { createExchangeProposal } from "../createExchangeProposal.js";
const wrappedReserve = testFns.wrap(createExchangeProposal);

const RESV_INV_ID = "resv-inv";
const RESERVE_MAJOR = 50;
const RESERVE_WU = RESERVE_MAJOR * 100; // 5000

function seedReserve(buyerAvailable: number) {
  autoId = 0;
  txWrites = [];
  docs = new Map<string, FakeDoc>([
    [`wallets/${BUYER}`, { exists: true, data: { available: buyerAvailable, held: 0, deducted: 0, currency: "GHS" } }],
    [
      `pharmacies/${BUYER}`,
      {
        exists: true,
        data: {
          countryCode: "GH",
          cityCode: "accra",
          city: "Accra",
          subscriptionStatus: "active",
          licenseStatus: "verified",
        },
      },
    ],
    [`pharmacies/${SELLER}`, { exists: true, data: { countryCode: "GH", cityCode: "accra", city: "Accra" } }],
    [`system_config/main`, { exists: true, data: { countries: { GH: { defaultCurrencyCode: "GHS", licenseRequired: false } } } }],
    [
      `pharmacy_inventory/${RESV_INV_ID}`,
      {
        exists: true,
        data: {
          pharmacyId: SELLER,
          medicineId: "amox",
          medicineName: "Amoxicillin",
          medicineDosage: "500mg",
          medicineForm: "Capsule",
          availableQuantity: 50,
          packaging: "box",
          batch: { lotNumber: "L1", expirationDate: null },
          availabilitySettings: { availableForExchange: true },
        },
      },
    ],
  ]);
}

function callReserve() {
  return wrappedReserve({
    data: {
      inventoryItemId: RESV_INV_ID,
      fromPharmacyId: BUYER,
      toPharmacyId: SELLER,
      details: {
        type: "purchase",
        quantity: 5,
        totalPrice: RESERVE_MAJOR,
        currency: "GHS",
        pricePerUnit: 10,
      },
    },
    auth: { uid: BUYER, token: {} },
  } as never);
}

describe("createExchangeProposal — purchase reserve wallet-unit lock", () => {
  test("insufficient: available 4999 < 5000 WU (50 major × 100) → throws, no reservation", async () => {
    seedReserve(RESERVE_WU - 1);
    await expect(callReserve()).rejects.toMatchObject({ code: "failed-precondition" });
    expect(txWrites.find((w) => w.path === `wallets/${BUYER}`)).toBeUndefined();
  });

  test("sufficient: available exactly 5000 WU → reserves available -5000, held +5000", async () => {
    seedReserve(RESERVE_WU);
    await callReserve();
    expect(incrementFor(`wallets/${BUYER}`, "available")).toBe(-RESERVE_WU);
    expect(incrementFor(`wallets/${BUYER}`, "held")).toBe(RESERVE_WU);
  });

  test("proposal doc keeps walletReserved in MAJOR (50), not wallet units", async () => {
    seedReserve(RESERVE_WU);
    await callReserve();
    const proposalWrite = txWrites.find(
      (w) => w.path.startsWith("exchange_proposals/") && w.op === "set"
    );
    expect(proposalWrite).toBeDefined();
    const reservations = (proposalWrite!.payload.reservations as { walletReserved?: number });
    expect(reservations?.walletReserved).toBe(RESERVE_MAJOR);
  });
});
