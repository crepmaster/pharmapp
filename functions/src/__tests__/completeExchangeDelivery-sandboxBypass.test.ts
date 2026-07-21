/**
 * completeExchangeDelivery — sandbox bypass money-math tests.
 *
 * The staging demo lets a buyer/seller play the assigned courier so the
 * "Delivered" button can drive the real settlement transaction without
 * needing a courier account. Because the bypass reroutes the money flow
 * (skip courier fee credit, skip halfBuyer debit, seller receives the
 * FULL totalAmount instead of sellerNetCredit), these branches must be
 * regression-locked or a future refactor could silently break the trade
 * balance in demo mode — or, worse, in prod if the env var ever leaks
 * (a defence-in-depth check exists but tests are the primary safety net).
 *
 * Round-4 review (P0#1) : the previous version of the bypass gate refused
 * to trigger when the caller was the assigned courier — but the demo
 * "Pickup" button explicitly SETS courierId=caller. The 4-case matrix
 * below is the reviewer-specified test spec that proves the gate now
 * looks at (env, trade-party, email) only, regardless of courier
 * assignment.
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
// Import after mocks. assertSandboxAllowedForProject runs at module load;
// FUNCTIONS_EMULATOR=true satisfies the allowlist (jest env has no project id).
// ---------------------------------------------------------------------------
process.env.FUNCTIONS_EMULATOR = "true";

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();
import {
  completeExchangeDelivery,
  validateProofImages,
} from "../completeExchangeDelivery.js";
const wrapped = testFns.wrap(completeExchangeDelivery);

afterAll(() => testFns.cleanup());

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const BUYER = "buyer-uid";
const SELLER = "seller-uid";
const OUTSIDER_COURIER = "real-courier-uid";
const DELIVERY_ID = "d-1";
const PROPOSAL_ID = "p-1";
const INVENTORY_ID = "inv-1";
const TOTAL_AMOUNT = 500;
const COURIER_FEE = 60; // sums to halfBuyer=30, halfSeller=30
const HALF_BUYER = 30;
const HALF_SELLER = 30;
const SELLER_NET_CREDIT = TOTAL_AMOUNT - HALF_SELLER; // 470 in prod path

function buildFakeWorld(overrides: {
  buyerEmail?: string;
  sellerEmail?: string;
  courierEmail?: string;
  deliveryStatus?: string;
  courierId?: string;
  proposalType?: "purchase" | "exchange";
} = {}): FakeWorld {
  const {
    buyerEmail = "buyer@promoshake.net",
    sellerEmail = "seller@promoshake.net",
    courierEmail = "courier@example.com", // real courier, non-sandbox by default
    deliveryStatus = "picked_up",
    courierId = BUYER,
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
        `wallets/${OUTSIDER_COURIER}`,
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
      // Pharmacy caller lookup (for the sandbox email gate).
      [`pharmacies/${BUYER}`, { exists: true, data: { email: buyerEmail } }],
      [`pharmacies/${SELLER}`, { exists: true, data: { email: sellerEmail } }],
      [`pharmacies/${OUTSIDER_COURIER}`, { exists: true, data: { email: courierEmail } }],
    ]),
  };
}

function callAs(uid: string): Promise<unknown> {
  return wrapped({
    data: { deliveryId: DELIVERY_ID },
    auth: { uid, token: { firebase: { sign_in_provider: "password" } } },
  } as never);
}

// Assert helpers — one place for the money-math predicates.
function findWalletIncrement(
  path: string,
  amount: number
): { op: string; path: string; payload: Record<string, unknown> } | undefined {
  return world.txWrites.find(
    (w) =>
      w.path === path &&
      w.op === "update" &&
      (w.payload.available as { __op?: string; n?: number })?.__op ===
        "increment" &&
      (w.payload.available as { n?: number })?.n === amount
  );
}

function findAnyWalletIncrement(
  path: string
): { op: string; path: string; payload: Record<string, unknown> } | undefined {
  return world.txWrites.find(
    (w) =>
      w.path === path &&
      w.op === "update" &&
      (w.payload.available as { __op?: string })?.__op === "increment"
  );
}

const ORIGINAL_ENV = process.env.SANDBOX_ENABLED;
afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.SANDBOX_ENABLED;
  else process.env.SANDBOX_ENABLED = ORIGINAL_ENV;
});

// ---------------------------------------------------------------------------
// 4-case matrix (round-4 review spec)
// ---------------------------------------------------------------------------

describe("completeExchangeDelivery — sandbox bypass 4-case matrix (round-4 spec)", () => {
  // -------------------------------------------------------------------------
  // CASE 1 : trade party + sandbox email + courierId === caller
  //          (buyer clicked Pickup → became courier → clicks Delivered)
  //          → BYPASS ACTIVE. This is the P0#1 regression scenario.
  // -------------------------------------------------------------------------
  describe("CASE 1: buyer as courier after Pickup (courierId === caller)", () => {
    beforeEach(() => {
      process.env.SANDBOX_ENABLED = "true";
      world = buildFakeWorld({
        deliveryStatus: "picked_up",
        courierId: BUYER, // buyer picked up, buyer is now assigned courier
      });
    });

    test("delivery status → 'delivered'", async () => {
      await callAs(BUYER);
      const deliveryUpdate = world.txWrites.find(
        (w) => w.path === `deliveries/${DELIVERY_ID}` && w.op === "update"
      );
      expect(deliveryUpdate?.payload.status).toBe("delivered");
    });

    test("halfBuyer debit is NOT applied", async () => {
      await callAs(BUYER);
      const halfBuyerDebit = findWalletIncrement(
        `wallets/${BUYER}`,
        -HALF_BUYER * 100
      );
      expect(halfBuyerDebit).toBeUndefined();
    });

    test("courier-fee credit is NOT applied (buyer would credit itself)", async () => {
      await callAs(BUYER);
      const courierCredit = findWalletIncrement(
        `wallets/${BUYER}`,
        COURIER_FEE
      );
      expect(courierCredit).toBeUndefined();
    });

    test("seller receives the FULL totalAmount (not sellerNetCredit)", async () => {
      await callAs(BUYER);
      const sellerCredit = findAnyWalletIncrement(`wallets/${SELLER}`);
      expect(sellerCredit).toBeDefined();
      expect((sellerCredit?.payload.available as { n?: number })?.n).toBe(
        TOTAL_AMOUNT * 100
      );
    });
  });

  // -------------------------------------------------------------------------
  // CASE 1b : same as CASE 1 but with SELLER as the caller
  //           (seller clicked Pickup → became courier → clicks Delivered)
  // -------------------------------------------------------------------------
  describe("CASE 1b: seller as courier after Pickup (courierId === caller)", () => {
    beforeEach(() => {
      process.env.SANDBOX_ENABLED = "true";
      world = buildFakeWorld({
        deliveryStatus: "picked_up",
        courierId: SELLER,
      });
    });

    test("seller receives FULL totalAmount (bypass triggered by seller too)", async () => {
      await callAs(SELLER);
      const sellerCredit = findAnyWalletIncrement(`wallets/${SELLER}`);
      expect((sellerCredit?.payload.available as { n?: number })?.n).toBe(
        TOTAL_AMOUNT * 100
      );
    });

    test("no self-credit on seller for the courier fee (bypass skips fee)", async () => {
      await callAs(SELLER);
      // A courier-fee self-credit would show as increment(+COURIER_FEE) on
      // wallets/${SELLER}. It should NOT appear.
      const selfCredit = findWalletIncrement(
        `wallets/${SELLER}`,
        COURIER_FEE
      );
      expect(selfCredit).toBeUndefined();
      // Also assert there is exactly ONE wallet-available update on the
      // seller wallet — the full-amount credit only.
      const sellerIncrementsCount = world.txWrites.filter(
        (w) =>
          w.path === `wallets/${SELLER}` &&
          w.op === "update" &&
          (w.payload.available as { __op?: string })?.__op === "increment"
      ).length;
      expect(sellerIncrementsCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // CASE 2 : trade party + sandbox email + courierId !== caller
  //          (buyer went straight to Delivered without Pickup)
  //          → BYPASS ACTIVE. Preserved from round-3, still must work.
  // -------------------------------------------------------------------------
  describe("CASE 2: buyer bypasses courier assignment (courierId !== caller)", () => {
    beforeEach(() => {
      process.env.SANDBOX_ENABLED = "true";
      world = buildFakeWorld({
        deliveryStatus: "pending",
        courierId: "unassigned",
      });
    });

    test("starting status='pending' is accepted (sandbox tolerates it)", async () => {
      await expect(callAs(BUYER)).resolves.toBeDefined();
    });

    test("seller receives FULL totalAmount", async () => {
      await callAs(BUYER);
      const sellerCredit = findAnyWalletIncrement(`wallets/${SELLER}`);
      expect((sellerCredit?.payload.available as { n?: number })?.n).toBe(
        TOTAL_AMOUNT * 100
      );
    });
  });

  // -------------------------------------------------------------------------
  // CASE 3 : outsider courier (not buyer, not seller) → NORMAL settlement
  //          Bypass DOES NOT activate: caller is not a trade party.
  //          This is the prod happy path — we lock its math too.
  // -------------------------------------------------------------------------
  describe("CASE 3: real outsider courier (prod-like normal settlement)", () => {
    beforeEach(() => {
      // Sandbox env doesn't matter here — the caller is not a trade party
      // so the bypass gate wouldn't activate anyway. Test both env states.
      process.env.SANDBOX_ENABLED = "true";
      world = buildFakeWorld({
        deliveryStatus: "picked_up",
        courierId: OUTSIDER_COURIER,
      });
    });

    test("courier-fee credit IS applied to the outsider courier's wallet (full fee)", async () => {
      await callAs(OUTSIDER_COURIER);
      const courierCredit = findWalletIncrement(
        `wallets/${OUTSIDER_COURIER}`,
        COURIER_FEE
      );
      expect(courierCredit).toBeDefined();
    });

    test("buyer IS debited halfBuyer for their share of the courier fee", async () => {
      await callAs(OUTSIDER_COURIER);
      const halfBuyerDebit = findWalletIncrement(
        `wallets/${BUYER}`,
        -HALF_BUYER * 100
      );
      expect(halfBuyerDebit).toBeDefined();
    });

    test("seller receives sellerNetCredit (= totalAmount − halfSeller)", async () => {
      await callAs(OUTSIDER_COURIER);
      const sellerCredit = findAnyWalletIncrement(`wallets/${SELLER}`);
      expect((sellerCredit?.payload.available as { n?: number })?.n).toBe(
        SELLER_NET_CREDIT * 100
      );
    });

    test("also works with SANDBOX_ENABLED off (bypass gate irrelevant)", async () => {
      delete process.env.SANDBOX_ENABLED;
      world = buildFakeWorld({
        deliveryStatus: "picked_up",
        courierId: OUTSIDER_COURIER,
      });
      await callAs(OUTSIDER_COURIER);
      const sellerCredit = findAnyWalletIncrement(`wallets/${SELLER}`);
      expect((sellerCredit?.payload.available as { n?: number })?.n).toBe(
        SELLER_NET_CREDIT * 100
      );
    });
  });

  // -------------------------------------------------------------------------
  // CASE 4 : trade party but sandbox off OR email non-authorised
  //          → REFUSED (bypass requires both gates simultaneously).
  //          The regular courier check kicks in and the caller is not the
  //          assigned courier → permission-denied.
  // -------------------------------------------------------------------------
  describe("CASE 4: trade party but bypass conditions unmet → permission-denied", () => {
    test("4a: SANDBOX_ENABLED=false + sandbox email → permission-denied", async () => {
      delete process.env.SANDBOX_ENABLED;
      world = buildFakeWorld({
        deliveryStatus: "picked_up",
        courierId: OUTSIDER_COURIER, // ensure caller is NOT the assigned courier
        buyerEmail: "buyer@promoshake.net",
      });
      await expect(callAs(BUYER)).rejects.toMatchObject({
        code: "permission-denied",
      });
    });

    test("4b: SANDBOX_ENABLED=true + non-sandbox email → permission-denied", async () => {
      process.env.SANDBOX_ENABLED = "true";
      world = buildFakeWorld({
        deliveryStatus: "picked_up",
        courierId: OUTSIDER_COURIER,
        buyerEmail: "real@gmail.com",
      });
      await expect(callAs(BUYER)).rejects.toMatchObject({
        code: "permission-denied",
      });
    });

    test("4c: neither env nor sandbox email + trade-party caller not courier → permission-denied", async () => {
      delete process.env.SANDBOX_ENABLED;
      world = buildFakeWorld({
        deliveryStatus: "picked_up",
        courierId: OUTSIDER_COURIER,
        buyerEmail: "real@gmail.com",
      });
      await expect(callAs(BUYER)).rejects.toMatchObject({
        code: "permission-denied",
      });
    });
  });
});


/**
 * Idempotent replay (Lot 1 — "faux échec après settlement").
 *
 * The client used to call this callable and then write `status: delivered`
 * itself. When that second write failed, the UI reported a payment failure
 * for a trade that had already settled — and no retry could recover, because
 * the callable refused a delivery already `delivered`. The client write is
 * gone; these tests lock the other half.
 *
 * CRITICAL: `status === "delivered"` is NOT proof that a settlement ran.
 * firestore.rules let the assigned courier write `status` directly, so the
 * replay branch demands the full fingerprint that PHASE 4/5 writes. The
 * refusal tests below are the substance of this suite — an earlier version
 * of these tests passed while only checking the status, which would have
 * let a hand-marked delivery be reported as settled.
 */
describe("completeExchangeDelivery — idempotent replay on a settled delivery", () => {
  beforeEach(() => {
    delete process.env.SANDBOX_ENABLED;
  });

  /** A delivery carrying the COMPLETE settlement fingerprint. */
  function settledWorld(type: "purchase" | "exchange" = "purchase") {
    const w = buildFakeWorld({
      deliveryStatus: "delivered",
      courierId: OUTSIDER_COURIER,
      buyerEmail: "real@gmail.com",
      proposalType: type,
    });
    const d = w.docs.get(`deliveries/${DELIVERY_ID}`)!.data!;
    d.completedAt = { __ts: "settled" };
    d.paymentStatus = type === "purchase" ? "paid" : "n/a";
    const p = w.docs.get(`exchange_proposals/${PROPOSAL_ID}`)!.data!;
    p.status = "completed";
    p.deliveryId = DELIVERY_ID;
    return w;
  }

  // ---- accepted replays -------------------------------------------------

  test("purchase: replay returns idempotent success, paymentProcessed true", async () => {
    world = settledWorld("purchase");
    await expect(callAs(OUTSIDER_COURIER)).resolves.toMatchObject({
      success: true,
      idempotent: true,
      status: "completed",
      paymentProcessed: true,
    });
  });

  test("exchange: replay reports paymentProcessed FALSE, mirroring settlement", async () => {
    // A barter moves no money; claiming paymentProcessed:true on replay
    // would contradict what the settlement itself returned.
    world = settledWorld("exchange");
    await expect(callAs(OUTSIDER_COURIER)).resolves.toMatchObject({
      idempotent: true,
      paymentProcessed: false,
    });
  });

  test("replay performs ZERO writes — no wallet, no ledger, no inventory, no status", async () => {
    world = settledWorld("purchase");
    await callAs(OUTSIDER_COURIER);
    expect(world.txWrites).toEqual([]);
  });

  test("control: a first settlement still writes and is not flagged idempotent", async () => {
    world = buildFakeWorld({
      deliveryStatus: "picked_up",
      courierId: OUTSIDER_COURIER,
      buyerEmail: "real@gmail.com",
    });
    const first = (await callAs(OUTSIDER_COURIER)) as { idempotent?: boolean };
    expect(first.idempotent).toBeUndefined();
    expect(world.txWrites.length).toBeGreaterThan(0);
  });

  // ---- refusals: 'delivered' without a real settlement ------------------

  test("delivered but proposal still 'accepted' → refused, nothing written", async () => {
    // The exact shape of a courier-marked delivery: status flipped by hand,
    // funds still in `deducted`, no settlement anywhere.
    world = settledWorld("purchase");
    world.docs.get(`exchange_proposals/${PROPOSAL_ID}`)!.data!.status =
      "accepted";
    await expect(callAs(OUTSIDER_COURIER)).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(world.txWrites).toEqual([]);
  });

  test("delivered without completedAt → refused", async () => {
    world = settledWorld("purchase");
    delete world.docs.get(`deliveries/${DELIVERY_ID}`)!.data!.completedAt;
    await expect(callAs(OUTSIDER_COURIER)).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(world.txWrites).toEqual([]);
  });

  test("proposal 'completed' but linked to a DIFFERENT delivery → refused", async () => {
    world = settledWorld("purchase");
    world.docs.get(`exchange_proposals/${PROPOSAL_ID}`)!.data!.deliveryId =
      "some-other-delivery";
    await expect(callAs(OUTSIDER_COURIER)).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(world.txWrites).toEqual([]);
  });

  test("purchase without paymentStatus 'paid' → refused", async () => {
    world = settledWorld("purchase");
    world.docs.get(`deliveries/${DELIVERY_ID}`)!.data!.paymentStatus = "n/a";
    await expect(callAs(OUTSIDER_COURIER)).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(world.txWrites).toEqual([]);
  });

  test("proposal with an absent or unknown type → refused", async () => {
    // Falling back to "exchange" by omission would expect paymentStatus
    // "n/a" and could green-light a purchase whose payment never completed.
    world = settledWorld("purchase");
    delete (
      world.docs.get(`exchange_proposals/${PROPOSAL_ID}`)!.data!
        .details as Record<string, unknown>
    ).type;
    await expect(callAs(OUTSIDER_COURIER)).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(world.txWrites).toEqual([]);

    world = settledWorld("purchase");
    (
      world.docs.get(`exchange_proposals/${PROPOSAL_ID}`)!.data!
        .details as Record<string, unknown>
    ).type = "barter";
    await expect(callAs(OUTSIDER_COURIER)).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(world.txWrites).toEqual([]);
  });

  test("delivery with no linked proposal at all → refused", async () => {
    world = settledWorld("purchase");
    delete world.docs.get(`deliveries/${DELIVERY_ID}`)!.data!.proposalId;
    await expect(callAs(OUTSIDER_COURIER)).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(world.txWrites).toEqual([]);
  });

  test("replay refused for a caller who is not the assigned courier", async () => {
    // Idempotence must not become a probing hole: the actor check runs
    // BEFORE the replay branch.
    world = settledWorld("purchase");
    await expect(callAs("someone-else-uid")).rejects.toMatchObject({
      code: "permission-denied",
    });
    expect(world.txWrites).toEqual([]);
  });
});

/**
 * Proof images. Removing the client write must not silently drop the
 * multi-image proof a courier uploaded — that is evidence in a dispute.
 */
describe("completeExchangeDelivery — proof image validation", () => {
  test("rejects a non-array payload", () => {
    expect(() => validateProofImages("http://a")).toThrow();
  });

  test("rejects empty or non-string entries rather than dropping them", () => {
    expect(() => validateProofImages(["ok", ""])).toThrow();
    expect(() => validateProofImages(["ok", 42])).toThrow();
  });

  test("rejects more than the documented maximum", () => {
    expect(() =>
      validateProofImages(Array.from({ length: 11 }, (_, i) => `img-${i}`))
    ).toThrow();
  });

  test("absent or empty means 'leave the stored value alone', not 'erase it'", () => {
    expect(validateProofImages(undefined)).toBeNull();
    expect(validateProofImages(null)).toBeNull();
    expect(validateProofImages([])).toBeNull();
  });

  test("accepts and trims a valid set", () => {
    expect(validateProofImages([" a ", "b"])).toEqual(["a", "b"]);
  });

  test("rejects an entry longer than the documented maximum", () => {
    expect(() => validateProofImages(["x".repeat(2049)])).toThrow();
    expect(validateProofImages(["x".repeat(2048)])).toHaveLength(1);
  });

  test("a real settlement WRITES the cleaned array and the first image", async () => {
    // The validator alone proves nothing about persistence: this asserts the
    // transaction actually stores what the courier uploaded.
    delete process.env.SANDBOX_ENABLED;
    world = buildFakeWorld({
      deliveryStatus: "picked_up",
      courierId: OUTSIDER_COURIER,
      buyerEmail: "real@gmail.com",
    });
    await wrapped({
      data: {
        deliveryId: DELIVERY_ID,
        proofImages: [" https://a/1.jpg ", "https://a/2.jpg"],
      },
      auth: {
        uid: OUTSIDER_COURIER,
        token: { firebase: { sign_in_provider: "password" } },
      },
    } as never);

    const deliveryUpdate = world.txWrites.find(
      (w) => w.path === `deliveries/${DELIVERY_ID}` && w.op === "update"
    )!;
    expect(deliveryUpdate.payload.proofImages).toEqual([
      "https://a/1.jpg",
      "https://a/2.jpg",
    ]);
    // photoProofUrl falls back to the first image for legacy readers.
    expect(deliveryUpdate.payload.photoProofUrl).toBe("https://a/1.jpg");
  });
});
