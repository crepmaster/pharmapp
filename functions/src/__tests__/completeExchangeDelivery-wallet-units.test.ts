/**
 * RED tests — completeExchangeDelivery must write PHARMACY wallet mutations
 * in legacy units (major × 100) while leaving the COURIER credit in raw
 * major.
 *
 * These FAIL against current code, which writes every wallet mutation in
 * raw major (correct for couriers, 100× too small for pharmacy wallets that
 * the dashboard divides by 100). They pass once the settlement routes
 * pharmacy-wallet writes through `majorToWalletUnits(x, "pharmacy")`.
 *
 * The courier anti-regression test is GREEN both before and after: it locks
 * the invariant that the courier fee credit is NEVER multiplied by 100.
 *
 * Normal (non-sandbox) settlement path: a real courier delivers, so the
 * production money flow runs (seller gets sellerNetCredit, buyer pays
 * halfBuyer, courier gets courierFee).
 */
import { jest } from "@jest/globals";

const incrementMock = jest.fn((n: number) => ({ __op: "increment", n }));
const serverTimestampMock = jest.fn(() => "ts");

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

interface FakeDoc {
  exists: boolean;
  data?: Record<string, unknown>;
}
interface TxWrite {
  op: "set" | "update";
  path: string;
  payload: Record<string, unknown>;
}
let docs: Map<string, FakeDoc>;
let txWrites: TxWrite[];
let autoId: number;

const makeRef = (path: string) => ({ __path: path, id: path.split("/").pop() });
const pathOfRef = (ref: unknown) => (ref as { __path?: string })?.__path ?? "?";

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
    serverTimestamp: serverTimestampMock,
    delete: jest.fn(() => "delete"),
  },
  Timestamp: { now: jest.fn(() => ({ __ts: "now" })) },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

process.env.FUNCTIONS_EMULATOR = "true";

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();
import { completeExchangeDelivery } from "../completeExchangeDelivery.js";
const wrapped = testFns.wrap(completeExchangeDelivery);
afterAll(() => testFns.cleanup());

const BUYER = "buyer-uid";
const SELLER = "seller-uid";
const COURIER = "courier-uid";
const DELIVERY_ID = "d-1";
const PROPOSAL_ID = "p-1";
const INVENTORY_ID = "inv-1";

// All business values in MAJOR.
const TOTAL_AMOUNT = 500; // GHS
const COURIER_FEE = 60;
const HALF_BUYER = 30;
const HALF_SELLER = 30;
const SELLER_NET_CREDIT = TOTAL_AMOUNT - HALF_SELLER; // 470

// Expected legacy units after the fix (pharmacy = ×100).
const X = 100;

function seed() {
  autoId = 0;
  txWrites = [];
  docs = new Map<string, FakeDoc>([
    [
      `deliveries/${DELIVERY_ID}`,
      {
        exists: true,
        data: {
          proposalId: PROPOSAL_ID,
          fromPharmacyId: BUYER,
          toPharmacyId: SELLER,
          courierId: COURIER,
          status: "picked_up",
          courierFee: COURIER_FEE,
          currency: "GHS",
        },
      },
    ],
    [
      `exchange_proposals/${PROPOSAL_ID}`,
      {
        exists: true,
        data: {
          proposalId: PROPOSAL_ID,
          fromPharmacyId: BUYER,
          toPharmacyId: SELLER,
          inventoryItemId: INVENTORY_ID,
          reservations: { walletReserved: TOTAL_AMOUNT },
          details: {
            type: "purchase",
            totalPrice: TOTAL_AMOUNT,
            quantity: 5,
            currency: "GHS",
            medicineName: "Amoxicillin",
            medicineId: "amoxicillin-500mg",
          },
        },
      },
    ],
    // Buyer pharmacy wallet, seeded in legacy units (×100) as production
    // paystack top-up would leave it.
    [
      `wallets/${BUYER}`,
      {
        exists: true,
        data: { available: 100000 * X, deducted: TOTAL_AMOUNT * X, held: 0, currency: "GHS" },
      },
    ],
    [`wallets/${SELLER}`, { exists: true, data: { available: 0, held: 0, currency: "GHS" } }],
    [`wallets/${COURIER}`, { exists: true, data: { available: 0, held: 0, currency: "GHS" } }],
    [
      `pharmacy_inventory/${INVENTORY_ID}`,
      {
        exists: true,
        data: {
          pharmacyId: SELLER,
          medicineId: "amoxicillin-500mg",
          medicineName: "Amoxicillin",
          medicineDosage: "500mg",
          medicineForm: "Capsule",
          availableQuantity: 50,
          reservedQuantity: 0,
          batch: { lotNumber: "L1", expirationDate: null },
        },
      },
    ],
    [`pharmacies/${BUYER}`, { exists: true, data: { email: "buyer@example.com" } }],
    [`pharmacies/${SELLER}`, { exists: true, data: { email: "seller@example.com" } }],
    // Real courier (in couriers/), non-sandbox → production settlement path.
    [`couriers/${COURIER}`, { exists: true, data: { email: "courier@example.com" } }],
  ]);
}

function callAsCourier(): Promise<unknown> {
  return wrapped({
    data: { deliveryId: DELIVERY_ID },
    auth: { uid: COURIER, token: { firebase: { sign_in_provider: "password" } } },
  } as never);
}

function incrementOn(path: string): number | undefined {
  const w = txWrites.find(
    (w) =>
      w.path === path &&
      w.op === "update" &&
      (w.payload.available as { __op?: string })?.__op === "increment"
  );
  return (w?.payload.available as { n?: number })?.n;
}

function deductedIncrementOn(path: string): number | undefined {
  const w = txWrites.find(
    (w) =>
      w.path === path &&
      w.op === "update" &&
      (w.payload.deducted as { __op?: string })?.__op === "increment"
  );
  return (w?.payload.deducted as { n?: number })?.n;
}

beforeEach(seed);

describe("completeExchangeDelivery — pharmacy wallet writes in legacy units (RED)", () => {
  test("buyer deducted is decremented by totalAmount × 100", async () => {
    await callAsCourier();
    expect(deductedIncrementOn(`wallets/${BUYER}`)).toBe(-TOTAL_AMOUNT * X);
  });

  test("buyer halfBuyer courier share is debited × 100", async () => {
    await callAsCourier();
    // Buyer's available receives the halfBuyer debit (production path).
    const buyerAvail = incrementOn(`wallets/${BUYER}`);
    expect(buyerAvail).toBe(-HALF_BUYER * X);
  });

  test("seller credit is sellerNetCredit × 100", async () => {
    await callAsCourier();
    expect(incrementOn(`wallets/${SELLER}`)).toBe(SELLER_NET_CREDIT * X);
  });
});

describe("completeExchangeDelivery — courier credit stays raw major (anti-regression)", () => {
  test("courier available is credited courierFee WITHOUT ×100", async () => {
    // GREEN before and after the fix: this invariant must never change.
    await callAsCourier();
    expect(incrementOn(`wallets/${COURIER}`)).toBe(COURIER_FEE);
  });
});
