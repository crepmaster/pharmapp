/**
 * terminateExchangeDelivery — Lot 2.
 *
 * These tests exist because the path they replace failed silently. A courier
 * failing a delivery used to leave the delivery `failed`, the proposal
 * `accepted`, the buyer's money in `deducted` and the stock reserved, with
 * the compensation error swallowed. So the assertions here are as much about
 * what must NOT happen (no partial write, no double refund, no negative
 * balance) as about the happy path.
 *
 * The two unit traps under test:
 *   - a purchase refund is in WALLET units (major × 100), not major;
 *   - an exchange releases the PROPOSER's offered item
 *     (`details.exchangeInventoryItemId`), never the seller's root item.
 */
import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Fake Firestore
// ---------------------------------------------------------------------------

interface FakeDoc {
  exists: boolean;
  data?: Record<string, unknown>;
}
interface FakeWorld {
  docs: Map<string, FakeDoc>;
  txWrites: Array<{
    op: "set" | "update";
    path: string;
    payload: Record<string, unknown>;
  }>;
}
let world: FakeWorld;

function pathOfRef(ref: unknown): string {
  return (ref as { __path?: string })?.__path ?? "?";
}

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({
    collection: (col: string) => ({
      doc: (id: string) => ({ __path: `${col}/${id}`, id }),
    }),
    runTransaction: async (fn: any) =>
      fn({
        get: (ref: unknown) => {
          const path = pathOfRef(ref);
          const d = world.docs.get(path) ?? { exists: false };
          return Promise.resolve({ ...d, data: () => d.data });
        },
        set: (ref: unknown, payload: Record<string, unknown>) => {
          world.txWrites.push({ op: "set", path: pathOfRef(ref), payload });
        },
        update: (ref: unknown, payload: Record<string, unknown>) => {
          world.txWrites.push({ op: "update", path: pathOfRef(ref), payload });
        },
      }),
  })),
  FieldValue: {
    increment: jest.fn((n: number) => ({ __op: "increment", n })),
    serverTimestamp: jest.fn(() => "ts"),
  },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

process.env.FUNCTIONS_EMULATOR = "true";

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();
import {
  terminateExchangeDelivery,
  compensationLedgerId,
  COMPENSATION_VERSION,
} from "../terminateExchangeDelivery.js";
const wrapped = testFns.wrap(terminateExchangeDelivery);
afterAll(() => testFns.cleanup());

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COURIER = "courier-uid";
const BUYER = "buyer-uid";
const SELLER = "seller-uid";
const DELIVERY_ID = "d-1";
const PROPOSAL_ID = "p-1";
const SELLER_ROOT_ITEM = "seller-root-item";
const PROPOSER_HELD_ITEM = "proposer-offered-item";

const TOTAL_MAJOR = 50;
const TOTAL_WU = TOTAL_MAJOR * 100; // pharmacy wallets store major × 100
const EXCHANGE_QTY = 12;

function purchaseWorld(overrides: {
  deliveryStatus?: string;
  proposalStatus?: string;
  walletDeducted?: number;
} = {}): FakeWorld {
  const {
    deliveryStatus = "picked_up",
    proposalStatus = "accepted",
    walletDeducted = TOTAL_WU,
  } = overrides;
  return {
    txWrites: [],
    docs: new Map<string, FakeDoc>([
      [
        `deliveries/${DELIVERY_ID}`,
        {
          exists: true,
          data: {
            proposalId: PROPOSAL_ID,
            courierId: COURIER,
            status: deliveryStatus,
          },
        },
      ],
      [
        `exchange_proposals/${PROPOSAL_ID}`,
        {
          exists: true,
          data: {
            fromPharmacyId: BUYER,
            toPharmacyId: SELLER,
            deliveryId: DELIVERY_ID,
            status: proposalStatus,
            inventoryItemId: SELLER_ROOT_ITEM,
            reservations: { walletReserved: TOTAL_MAJOR, inventoryReserved: null },
            details: { type: "purchase", totalPrice: TOTAL_MAJOR, currency: "GHS" },
          },
        },
      ],
      [
        `wallets/${BUYER}`,
        { exists: true, data: { available: 0, held: 0, deducted: walletDeducted } },
      ],
    ]),
  };
}

function exchangeWorld(overrides: { reservedQuantity?: number } = {}): FakeWorld {
  const { reservedQuantity = EXCHANGE_QTY } = overrides;
  return {
    txWrites: [],
    docs: new Map<string, FakeDoc>([
      [
        `deliveries/${DELIVERY_ID}`,
        {
          exists: true,
          data: {
            proposalId: PROPOSAL_ID,
            courierId: COURIER,
            status: "in_transit",
          },
        },
      ],
      [
        `exchange_proposals/${PROPOSAL_ID}`,
        {
          exists: true,
          data: {
            fromPharmacyId: BUYER,
            toPharmacyId: SELLER,
            deliveryId: DELIVERY_ID,
            status: "accepted",
            inventoryItemId: SELLER_ROOT_ITEM,
            reservations: { walletReserved: null, inventoryReserved: EXCHANGE_QTY },
            details: {
              type: "exchange",
              exchangeInventoryItemId: PROPOSER_HELD_ITEM,
              exchangeQuantity: EXCHANGE_QTY,
            },
          },
        },
      ],
      [
        `pharmacy_inventory/${PROPOSER_HELD_ITEM}`,
        {
          exists: true,
          data: { availableQuantity: 5, reservedQuantity },
        },
      ],
      [
        `pharmacy_inventory/${SELLER_ROOT_ITEM}`,
        { exists: true, data: { availableQuantity: 99, reservedQuantity: 0 } },
      ],
    ]),
  };
}

function call(
  uid: string,
  data: Record<string, unknown> = { deliveryId: DELIVERY_ID, outcome: "failed", reason: "r" }
): Promise<unknown> {
  return wrapped({
    data,
    auth: { uid, token: { firebase: { sign_in_provider: "password" } } },
  } as never);
}

function writeTo(path: string) {
  return world.txWrites.find((w) => w.path === path);
}

// ---------------------------------------------------------------------------

describe("terminateExchangeDelivery — purchase compensation", () => {
  test("refunds in WALLET units (major × 100), not major", async () => {
    world = purchaseWorld();
    await call(COURIER);
    const w = writeTo(`wallets/${BUYER}`)!;
    expect(w.payload.deducted).toEqual({ __op: "increment", n: -TOTAL_WU });
    expect(w.payload.available).toEqual({ __op: "increment", n: TOTAL_WU });
    // The trap: refunding the raw major value would return 1/100th.
    expect(w.payload.available).not.toEqual({ __op: "increment", n: TOTAL_MAJOR });
  });

  test("cancels the proposal, clears reservations and stamps the markers", async () => {
    world = purchaseWorld();
    await call(COURIER);
    const p = writeTo(`exchange_proposals/${PROPOSAL_ID}`)!;
    expect(p.payload.status).toBe("cancelled");
    expect(p.payload.reservations).toBeNull();
    expect(p.payload.compensationVersion).toBe(COMPENSATION_VERSION);
    expect(p.payload.compensatedAt).toBeDefined();
  });

  test("writes the delivery outcome, paymentStatus refunded and the markers", async () => {
    world = purchaseWorld();
    await call(COURIER, {
      deliveryId: DELIVERY_ID,
      outcome: "failed",
      reason: "courier accident",
    });
    const d = writeTo(`deliveries/${DELIVERY_ID}`)!;
    expect(d.payload.status).toBe("failed");
    expect(d.payload.failureReason).toBe("courier accident");
    expect(d.payload.paymentStatus).toBe("refunded");
    expect(d.payload.compensationStatus).toBe("completed");
    expect(d.payload.compensationVersion).toBe(COMPENSATION_VERSION);
  });

  test("writes a ledger entry under a DETERMINISTIC id", async () => {
    world = purchaseWorld();
    await call(COURIER);
    const l = writeTo(`ledger/${compensationLedgerId(DELIVERY_ID)}`)!;
    expect(l.op).toBe("set");
    expect(l.payload.type).toBe("delivery_compensation");
    expect(l.payload.walletUnitsRestored).toBe(TOTAL_WU);
    expect(l.payload.amountMajor).toBe(TOTAL_MAJOR);
  });

  test("'cancelled' outcome records cancellationReason, not failureReason", async () => {
    world = purchaseWorld();
    await call(COURIER, {
      deliveryId: DELIVERY_ID,
      outcome: "cancelled",
      reason: "pharmacy closed",
    });
    const d = writeTo(`deliveries/${DELIVERY_ID}`)!;
    expect(d.payload.status).toBe("cancelled");
    expect(d.payload.cancellationReason).toBe("pharmacy closed");
    expect(d.payload.failureReason).toBeUndefined();
  });
});

describe("terminateExchangeDelivery — exchange compensation", () => {
  test("releases the PROPOSER's held item, never the seller's root item", async () => {
    world = exchangeWorld();
    await call(COURIER);
    const held = writeTo(`pharmacy_inventory/${PROPOSER_HELD_ITEM}`)!;
    expect(held.payload.reservedQuantity).toEqual({
      __op: "increment",
      n: -EXCHANGE_QTY,
    });
    expect(held.payload.availableQuantity).toEqual({
      __op: "increment",
      n: EXCHANGE_QTY,
    });
    // Touching the seller's root item would mint stock AND leave the
    // proposer's hold stuck.
    expect(writeTo(`pharmacy_inventory/${SELLER_ROOT_ITEM}`)).toBeUndefined();
  });

  test("no wallet is touched and paymentStatus stays n/a", async () => {
    world = exchangeWorld();
    await call(COURIER);
    expect(world.txWrites.some((w) => w.path.startsWith("wallets/"))).toBe(false);
    expect(writeTo(`deliveries/${DELIVERY_ID}`)!.payload.paymentStatus).toBe("n/a");
  });
});

describe("terminateExchangeDelivery — guards, no partial writes", () => {
  test("wallet.deducted below the reserved amount → refused, nothing written", async () => {
    world = purchaseWorld({ walletDeducted: TOTAL_WU - 1 });
    await expect(call(COURIER)).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(world.txWrites).toEqual([]);
  });

  test("inventory.reservedQuantity below the reserved amount → refused", async () => {
    world = exchangeWorld({ reservedQuantity: EXCHANGE_QTY - 1 });
    await expect(call(COURIER)).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(world.txWrites).toEqual([]);
  });

  test("caller is not the assigned courier → permission-denied", async () => {
    world = purchaseWorld();
    await expect(call("someone-else")).rejects.toMatchObject({
      code: "permission-denied",
    });
    expect(world.txWrites).toEqual([]);
  });

  test("proposal not 'accepted' → refused", async () => {
    world = purchaseWorld({ proposalStatus: "pending" });
    await expect(call(COURIER)).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(world.txWrites).toEqual([]);
  });

  test("'pending' delivery → refused (a pending delivery has no courier)", async () => {
    world = purchaseWorld({ deliveryStatus: "pending" });
    await expect(call(COURIER)).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(world.txWrites).toEqual([]);
  });

  test("'delivered' delivery → refused (settled; compensating would undo it)", async () => {
    world = purchaseWorld({ deliveryStatus: "delivered" });
    await expect(call(COURIER)).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(world.txWrites).toEqual([]);
  });

  test("'assigned' delivery → refused (no producer writes that status)", async () => {
    world = purchaseWorld({ deliveryStatus: "assigned" });
    await expect(call(COURIER)).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(world.txWrites).toEqual([]);
  });

  test("proposal linked to another delivery → refused", async () => {
    world = purchaseWorld();
    world.docs.get(`exchange_proposals/${PROPOSAL_ID}`)!.data!.deliveryId =
      "other-delivery";
    await expect(call(COURIER)).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(world.txWrites).toEqual([]);
  });

  test("invalid outcome → invalid-argument", async () => {
    world = purchaseWorld();
    await expect(
      call(COURIER, { deliveryId: DELIVERY_ID, outcome: "lost" })
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(world.txWrites).toEqual([]);
  });
});

describe("terminateExchangeDelivery — idempotent replay", () => {
  /** A delivery already compensated, carrying the COMPLETE fingerprint. */
  function compensatedWorld(): FakeWorld {
    const w = purchaseWorld({ deliveryStatus: "failed" });
    const d = w.docs.get(`deliveries/${DELIVERY_ID}`)!.data!;
    d.compensationStatus = "completed";
    d.compensatedAt = "ts";
    d.compensationVersion = COMPENSATION_VERSION;
    const p = w.docs.get(`exchange_proposals/${PROPOSAL_ID}`)!.data!;
    p.status = "cancelled";
    p.reservations = null;
    p.compensatedAt = "ts";
    p.compensationVersion = COMPENSATION_VERSION;
    w.docs.set(`ledger/${compensationLedgerId(DELIVERY_ID)}`, {
      exists: true,
      data: {
        type: "delivery_compensation",
        deliveryId: DELIVERY_ID,
        proposalId: PROPOSAL_ID,
        outcome: "failed",
        compensationVersion: COMPENSATION_VERSION,
      },
    });
    return w;
  }

  test("complete fingerprint → idempotent success with ZERO writes", async () => {
    world = compensatedWorld();
    await expect(call(COURIER)).resolves.toMatchObject({
      success: true,
      idempotent: true,
      outcome: "failed",
    });
    expect(world.txWrites).toEqual([]);
  });

  // Each missing piece must block the replay: a partially applied
  // compensation must never be mistaken for a completed one and refunded
  // a second time.
  const mutilations: Array<[string, (w: FakeWorld) => void]> = [
    [
      "proposal still 'accepted'",
      (w) => {
        w.docs.get(`exchange_proposals/${PROPOSAL_ID}`)!.data!.status = "accepted";
      },
    ],
    [
      "reservations not cleared",
      (w) => {
        w.docs.get(`exchange_proposals/${PROPOSAL_ID}`)!.data!.reservations = {
          walletReserved: TOTAL_MAJOR,
          inventoryReserved: null,
        };
      },
    ],
    [
      "delivery compensation markers absent",
      (w) => {
        delete w.docs.get(`deliveries/${DELIVERY_ID}`)!.data!.compensationStatus;
      },
    ],
    [
      "proposal compensation markers absent",
      (w) => {
        delete w.docs.get(`exchange_proposals/${PROPOSAL_ID}`)!.data!
          .compensatedAt;
      },
    ],
    [
      "deterministic ledger entry missing",
      (w) => {
        w.docs.delete(`ledger/${compensationLedgerId(DELIVERY_ID)}`);
      },
    ],
    // Occupying the id is not proof. Each of the next four is a document
    // that EXISTS at the right path but does not attest to OUR compensation.
    [
      "ledger entry of the wrong type",
      (w) => {
        w.docs.get(`ledger/${compensationLedgerId(DELIVERY_ID)}`)!.data!.type =
          "wallet_topup";
      },
    ],
    [
      "ledger entry pointing at another proposal",
      (w) => {
        w.docs.get(
          `ledger/${compensationLedgerId(DELIVERY_ID)}`
        )!.data!.proposalId = "other-proposal";
      },
    ],
    [
      "ledger entry from an older compensation version",
      (w) => {
        w.docs.get(
          `ledger/${compensationLedgerId(DELIVERY_ID)}`
        )!.data!.compensationVersion = 0;
      },
    ],
    [
      "ledger outcome disagreeing with the delivery status",
      (w) => {
        w.docs.get(`ledger/${compensationLedgerId(DELIVERY_ID)}`)!.data!.outcome =
          "cancelled"; // delivery is 'failed'
      },
    ],
    [
      "compensationVersion mismatch",
      (w) => {
        w.docs.get(`deliveries/${DELIVERY_ID}`)!.data!.compensationVersion = 99;
      },
    ],
  ];

  test.each(mutilations)(
    "terminal but %s → refused, no second compensation",
    async (_label, mutate) => {
      world = compensatedWorld();
      mutate(world);
      await expect(call(COURIER)).rejects.toMatchObject({
        code: "failed-precondition",
      });
      expect(world.txWrites).toEqual([]);
    }
  );
});
