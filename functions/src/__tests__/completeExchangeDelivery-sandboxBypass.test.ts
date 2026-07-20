/**
 * completeExchangeDelivery — sandbox bypass money-math tests (round-3 #1).
 *
 * The staging demo lets a buyer/seller play the assigned courier so the
 * "Delivered" button can drive the real settlement transaction without
 * needing a courier account. Because the bypass reroutes the money flow
 * (skip courier fee credit, skip halfBuyer debit, seller receives the
 * FULL totalAmount instead of sellerNetCredit), these three branches
 * must be regression-locked or a future refactor could silently break
 * the trade balance in demo mode — or, worse, in prod if the env var
 * ever leaks (a defence-in-depth check exists but tests are the primary
 * safety net).
 *
 * We build a minimal in-memory Firestore fake, run the transaction, and
 * capture every `tx.update` / `tx.set` call so we can assert exactly
 * what money moved where — and (equally important) what did NOT move.
 */
import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Mocks (must be declared before importing the callable)
// ---------------------------------------------------------------------------

const incrementMock = jest.fn((n: number) => ({ __op: "increment", n }));
const serverTimestampMock = jest.fn(() => "ts");

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

// Fake world state — each test rewires it.
interface FakeDoc {
  exists: boolean;
  data?: Record<string, unknown>;
  id?: string;
  ref?: unknown;
}
interface FakeWorld {
  docs: Map<string, FakeDoc>;
  txWrites: Array<{
    op: "set" | "update";
    path: string;
    payload: Record<string, unknown>;
  }>;
  autoId: number;
}
let world: FakeWorld;

function pathOfRef(ref: unknown): string {
  return (ref as { __path?: string })?.__path ?? "?";
}

function makeRef(path: string): unknown {
  return {
    __path: path,
    id: path.split("/").pop() ?? "auto",
  };
}

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({
    collection: (col: string) => ({
      doc: (docId?: string) => {
        const id =
          docId ??
          `auto-${col}-${world.autoId++}`; // auto-id for `doc()` with no arg
        const path = `${col}/${id}`;
        return {
          __path: path,
          id,
          get: () => {
            const d = world.docs.get(path) ?? { exists: false };
            return Promise.resolve({
              ...d,
              data: () => d.data,
              ref: makeRef(path),
              id,
            });
          },
        };
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runTransaction: async (fn: any) => {
      const tx = {
        get: (ref: unknown) => {
          const path = pathOfRef(ref);
          const d = world.docs.get(path) ?? { exists: false };
          return Promise.resolve({
            ...d,
            data: () => d.data,
            ref: makeRef(path),
          });
        },
        set: (ref: unknown, payload: Record<string, unknown>) => {
          world.txWrites.push({ op: "set", path: pathOfRef(ref), payload });
        },
        update: (ref: unknown, payload: Record<string, unknown>) => {
          world.txWrites.push({ op: "update", path: pathOfRef(ref), payload });
        },
      };
      return fn(tx);
    },
  })),
  FieldValue: {
    increment: incrementMock,
    serverTimestamp: serverTimestampMock,
    delete: jest.fn(() => "delete"),
  },
  Timestamp: {
    now: jest.fn(() => ({ __ts: "now" })),
  },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks (assertSandboxAllowedForProject runs at module load)
// ---------------------------------------------------------------------------

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();
import { completeExchangeDelivery } from "../completeExchangeDelivery.js";
const wrapped = testFns.wrap(completeExchangeDelivery);

afterAll(() => testFns.cleanup());

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const BUYER = "buyer-uid";
const SELLER = "seller-uid";
const DELIVERY_ID = "d-1";
const PROPOSAL_ID = "p-1";
const INVENTORY_ID = "inv-1";
const TOTAL_AMOUNT = 500;
const COURIER_FEE = 60; // sums to halfBuyer=30, halfSeller=30

function buildFakeWorld(overrides: {
  buyerEmail?: string;
  deliveryStatus?: string;
  courierId?: string;
  proposalType?: "purchase" | "exchange";
} = {}): FakeWorld {
  const {
    buyerEmail = "buyer@promoshake.net",
    deliveryStatus = "picked_up",
    courierId = "buyer-uid", // buyer plays courier in sandbox tests
    proposalType = "purchase",
  } = overrides;

  return {
    autoId: 0,
    txWrites: [],
    docs: new Map<string, FakeDoc>([
      [
        `deliveries/${DELIVERY_ID}`,
        {
          exists: true,
          data: {
            proposalId: PROPOSAL_ID,
            fromPharmacyId: BUYER,
            toPharmacyId: SELLER,
            courierId,
            status: deliveryStatus,
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
            // walletReserved is required for completeExchangeDelivery to
            // enter the "purchase settlement" block (set at acceptance time
            // in real flow); without it the payment writes are skipped.
            reservations: { walletReserved: TOTAL_AMOUNT },
            details: {
              type: proposalType,
              totalPrice: TOTAL_AMOUNT,
              quantity: 5,
              currency: "GHS",
              medicineName: "Amoxicillin",
              medicineId: "amoxicillin-500mg",
            },
          },
        },
      ],
      [
        `wallets/${BUYER}`,
        { exists: true, data: { available: 100000, deducted: TOTAL_AMOUNT, held: 0, currency: "GHS" } },
      ],
      [
        `wallets/${SELLER}`,
        { exists: true, data: { available: 0, held: 0, currency: "GHS" } },
      ],
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
      // Pharmacy caller lookup for the sandbox email gate.
      [`pharmacies/${BUYER}`, { exists: true, data: { email: buyerEmail } }],
      [`pharmacies/${SELLER}`, { exists: true, data: { email: "seller@promoshake.net" } }],
    ]),
  };
}

function callAs(uid: string): Promise<unknown> {
  return wrapped({
    data: { deliveryId: DELIVERY_ID },
    auth: { uid, token: { firebase: { sign_in_provider: "password" } } },
  } as never);
}

const ORIGINAL_ENV = process.env.SANDBOX_ENABLED;
afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.SANDBOX_ENABLED;
  else process.env.SANDBOX_ENABLED = ORIGINAL_ENV;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("completeExchangeDelivery — bypass NOT active (prod-like)", () => {
  test("caller is not the assigned courier → permission-denied", async () => {
    delete process.env.SANDBOX_ENABLED;
    world = buildFakeWorld({
      courierId: "some-other-courier",
      deliveryStatus: "picked_up",
    });
    await expect(callAs(BUYER)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  test("SANDBOX_ENABLED off + trade-party caller → permission-denied (bypass gated on env)", async () => {
    delete process.env.SANDBOX_ENABLED;
    world = buildFakeWorld({
      courierId: "some-other-courier",
      buyerEmail: "buyer@promoshake.net",
    });
    await expect(callAs(BUYER)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  test("SANDBOX_ENABLED on + non-promoshake email → permission-denied (bypass gated on email)", async () => {
    process.env.SANDBOX_ENABLED = "true";
    world = buildFakeWorld({
      courierId: "some-other-courier",
      buyerEmail: "real@gmail.com",
    });
    await expect(callAs(BUYER)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });
});

describe("completeExchangeDelivery — bypass ACTIVE (buyer plays courier)", () => {
  beforeEach(() => {
    process.env.SANDBOX_ENABLED = "true";
  });

  test("caller is buyer + email @promoshake.net + starting status='pending' → transaction runs", async () => {
    world = buildFakeWorld({
      deliveryStatus: "pending",
      courierId: "unassigned",
      buyerEmail: "buyer@promoshake.net",
    });
    await expect(callAs(BUYER)).resolves.toBeDefined();
    // Delivery status was updated to 'delivered'.
    const deliveryUpdate = world.txWrites.find(
      (w) => w.path === `deliveries/${DELIVERY_ID}` && w.op === "update"
    );
    expect(deliveryUpdate?.payload.status).toBe("delivered");
  });

  test("courier wallet is NOT touched (no self-credit for the courier fee)", async () => {
    world = buildFakeWorld({ deliveryStatus: "picked_up", courierId: "unassigned" });
    await callAs(BUYER);
    // The buyer is `userId` here, so a courier wallet write would target
    // `wallets/${BUYER}`. That path IS written by the buyer-side wallet
    // updates (deducted/available). Distinguish by shape: the courier
    // credit uses `increment(courierFee=60)` on `available`.
    const courierCredit = world.txWrites.find(
      (w) =>
        w.path === `wallets/${BUYER}` &&
        w.op === "update" &&
        (w.payload.available as { __op?: string; n?: number })?.__op ===
          "increment" &&
        (w.payload.available as { n?: number })?.n === COURIER_FEE
    );
    expect(courierCredit).toBeUndefined();
  });

  test("halfBuyer debit is NOT applied (the courier-share debit is skipped)", async () => {
    world = buildFakeWorld({ deliveryStatus: "picked_up", courierId: "unassigned" });
    await callAs(BUYER);
    // A halfBuyer debit would be `increment(-30)` on `wallets/${BUYER}.available`.
    const halfBuyerDebit = world.txWrites.find(
      (w) =>
        w.path === `wallets/${BUYER}` &&
        w.op === "update" &&
        (w.payload.available as { __op?: string; n?: number })?.__op ===
          "increment" &&
        (w.payload.available as { n?: number })?.n === -30 // half of 60
    );
    expect(halfBuyerDebit).toBeUndefined();
  });

  test("seller receives the FULL totalAmount (not sellerNetCredit)", async () => {
    world = buildFakeWorld({ deliveryStatus: "picked_up", courierId: "unassigned" });
    await callAs(BUYER);
    const sellerCredit = world.txWrites.find(
      (w) =>
        w.path === `wallets/${SELLER}` &&
        w.op === "update" &&
        (w.payload.available as { __op?: string; n?: number })?.__op ===
          "increment"
    );
    expect(sellerCredit).toBeDefined();
    expect((sellerCredit?.payload.available as { n?: number })?.n).toBe(
      TOTAL_AMOUNT
    );
  });

  test("seller also playing courier: same bypass applies", async () => {
    world = buildFakeWorld({
      deliveryStatus: "picked_up",
      courierId: "unassigned",
      buyerEmail: "buyer@promoshake.net", // still needed for the setup, but caller is SELLER
    });
    await expect(callAs(SELLER)).resolves.toBeDefined();
    const sellerCredit = world.txWrites.find(
      (w) =>
        w.path === `wallets/${SELLER}` &&
        w.op === "update" &&
        (w.payload.available as { __op?: string; n?: number })?.__op ===
          "increment"
    );
    expect((sellerCredit?.payload.available as { n?: number })?.n).toBe(
      TOTAL_AMOUNT
    );
  });
});
