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
          currencyCode: "GHS", // Phase 2 — authoritative snapshot for settlement revalidation.
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
    [`pharmacies/${BUYER}`, { exists: true, data: { email: "buyer@example.com", countryCode: "GH", cityCode: "accra" } }],
    [`pharmacies/${SELLER}`, { exists: true, data: { email: "seller@example.com", countryCode: "GH", cityCode: "accra" } }],
    // Real courier (in couriers/), non-sandbox → production settlement path.
    // Phase 2 — courier territory + wallet must match the trade (GH/accra/GHS).
    [`couriers/${COURIER}`, { exists: true, data: { email: "courier@example.com", countryCode: "GH", cityCode: "accra" } }],
    [
      `system_config/main`,
      {
        exists: true,
        data: {
          countries: { GH: { defaultCurrencyCode: "GHS", enabled: true, licenseRequired: false } },
          currencies: { GHS: { code: "GHS", enabled: true, decimals: 2 } },
        },
      },
    ],
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

function seedPhysicalExchange() {
  const delivery = docs.get(`deliveries/${DELIVERY_ID}`)!.data!;
  delivery.proposalType = "exchange";
  delivery.stockTransit = {
    version: 1,
    outbound: { state: "received_pending", quantity: 5 },
    return: { state: "received_pending", quantity: 3 },
  };
  delivery.sandboxJourney = { returnPhase: "return_delivered" };
  const proposal = docs.get(`exchange_proposals/${PROPOSAL_ID}`)!.data!;
  proposal.details = {
    type: "exchange", quantity: 5, exchangeQuantity: 3,
    exchangeInventoryItemId: "inv-return", medicineId: "amoxicillin-500mg",
  };
  proposal.reservations = {
    walletReserved: null, inventoryReserved: 3, ownerInventoryReserved: 5,
    buyerCourierFeeReserved: 30, sellerCourierFeeReserved: 30,
  };
  docs.get(`pharmacy_inventory/${INVENTORY_ID}`)!.data!.availableQuantity = 45;
  docs.get(`pharmacy_inventory/${INVENTORY_ID}`)!.data!.reservedQuantity = 5;
  docs.set("pharmacy_inventory/inv-return", {
    exists: true,
    data: {
      pharmacyId: BUYER,
      medicineId: "ibuprofen",
      medicineName: "Ibuprofen",
      availableQuantity: 7,
      reservedQuantity: 3,
      batch: { lotNumber: "LOT-RETURN", expirationDate: null },
    },
  });
  docs.get(`wallets/${BUYER}`)!.data!.available = 10000;
  docs.get(`wallets/${SELLER}`)!.data!.available = 10000;
  docs.get(`wallets/${BUYER}`)!.data!.held = 3000;
  docs.get(`wallets/${SELLER}`)!.data!.held = 3000;
}

describe("physical exchange — two receipts before one stock and fee settlement", () => {
  test("outbound receipt alone cannot transfer stock or pay courier", async () => {
    seedPhysicalExchange();
    const delivery = docs.get(`deliveries/${DELIVERY_ID}`)!.data!;
    (delivery.stockTransit as { return: { state: string } }).return.state = "in_transit";
    await expect(callAsCourier()).rejects.toMatchObject({ code: "failed-precondition" });
    expect(txWrites).toHaveLength(0);
  });

  test("both receipts consume both holds and split the fee in wallet units", async () => {
    seedPhysicalExchange();
    await callAsCourier();
    const buyerHold = txWrites.find((w) => w.path === `wallets/${BUYER}` && w.payload.held);
    const sellerHold = txWrites.find((w) => w.path === `wallets/${SELLER}` && w.payload.held);
    expect((buyerHold?.payload.held as { n?: number })?.n).toBe(-3000);
    expect((sellerHold?.payload.held as { n?: number })?.n).toBe(-3000);
    expect(incrementOn(`wallets/${COURIER}`)).toBe(60);
    const ownerWrite = txWrites.find((w) => w.path === `pharmacy_inventory/${INVENTORY_ID}`);
    const returnWrite = txWrites.find((w) => w.path === "pharmacy_inventory/inv-return");
    expect((ownerWrite?.payload.reservedQuantity as { n?: number })?.n).toBe(-5);
    expect((returnWrite?.payload.reservedQuantity as { n?: number })?.n).toBe(-3);
    expect(txWrites.filter((w) => w.path.startsWith("ledger/") &&
      w.payload.type === "courier_payment")).toHaveLength(1);
    expect(txWrites.find((w) => w.path === `deliveries/${DELIVERY_ID}`)?.payload.paymentStatus).toBe("paid");
  });

  test("missing fee hold preserves both stock holds", async () => {
    seedPhysicalExchange();
    docs.get(`wallets/${SELLER}`)!.data!.held = 100;
    await expect(callAsCourier()).rejects.toMatchObject({ code: "failed-precondition" });
    expect(txWrites).toHaveLength(0);
  });

  test("return lot reserve drift cannot mint stock at the destination", async () => {
    seedPhysicalExchange();
    docs.get("pharmacy_inventory/inv-return")!.data!.reservedQuantity = 2;
    await expect(callAsCourier()).rejects.toMatchObject({ code: "failed-precondition" });
    expect(txWrites).toHaveLength(0);
  });

  test("transit quantity must equal the committed return quantity", async () => {
    seedPhysicalExchange();
    const delivery = docs.get(`deliveries/${DELIVERY_ID}`)!.data!;
    (delivery.stockTransit as { return: { quantity: number } }).return.quantity = 4;
    await expect(callAsCourier()).rejects.toMatchObject({ code: "failed-precondition" });
    expect(txWrites).toHaveLength(0);
  });
});

// ===========================================================================
// Phase 2 — settlement guard refuses with ZERO mutation. Each test starts from
// a VALID settlement world (GH/accra, GHS wallets, courier GH/accra, config,
// currencyCode snapshot) and alters EXACTLY ONE dimension. The guard runs after
// the reads and before ANY capture write, so a refusal leaves no wallet
// mutation, no ledger, no inventory decrement and no status change.
// ===========================================================================
describe("completeExchangeDelivery — guard refuses at settlement with zero side effects", () => {
  const expectNoMutation = () => expect(txWrites).toHaveLength(0);

  test("trade snapshot missing → CURRENCY_SNAPSHOT_MISSING, zero mutation", async () => {
    const p = docs.get(`exchange_proposals/${PROPOSAL_ID}`)!;
    const data = { ...(p.data as Record<string, unknown>) };
    delete data.currencyCode;
    docs.set(`exchange_proposals/${PROPOSAL_ID}`, { exists: true, data });
    await expect(callAsCourier()).rejects.toMatchObject({
      details: { code: "CURRENCY_SNAPSHOT_MISSING" },
    });
    expectNoMutation();
  });

  test("courier in another country → COURIER_CROSS_COUNTRY, zero mutation", async () => {
    docs.set(`couriers/${COURIER}`, {
      exists: true,
      data: { email: "c", countryCode: "CM", cityCode: "accra" },
    });
    await expect(callAsCourier()).rejects.toMatchObject({
      details: { code: "COURIER_CROSS_COUNTRY" },
    });
    expectNoMutation();
  });

  test("courier in another city → COURIER_CROSS_CITY, zero mutation", async () => {
    docs.set(`couriers/${COURIER}`, {
      exists: true,
      data: { email: "c", countryCode: "GH", cityCode: "kumasi" },
    });
    await expect(callAsCourier()).rejects.toMatchObject({
      details: { code: "COURIER_CROSS_CITY" },
    });
    expectNoMutation();
  });

  test("courier profile unresolvable (no country) → COURIER_COUNTRY_MISSING, zero mutation", async () => {
    docs.delete(`couriers/${COURIER}`);
    await expect(callAsCourier()).rejects.toMatchObject({
      details: { code: "COURIER_COUNTRY_MISSING" },
    });
    expectNoMutation();
  });

  test("courier wallet absent → COURIER_WALLET_MISSING, zero mutation", async () => {
    docs.delete(`wallets/${COURIER}`);
    await expect(callAsCourier()).rejects.toMatchObject({
      details: { code: "COURIER_WALLET_MISSING" },
    });
    expectNoMutation();
  });

  test("courier wallet in another currency → COURIER_WALLET_CURRENCY_MISMATCH, zero mutation", async () => {
    docs.set(`wallets/${COURIER}`, {
      exists: true,
      data: { available: 0, held: 0, currency: "XAF" },
    });
    await expect(callAsCourier()).rejects.toMatchObject({
      details: { code: "COURIER_WALLET_CURRENCY_MISMATCH" },
    });
    expectNoMutation();
  });
});
