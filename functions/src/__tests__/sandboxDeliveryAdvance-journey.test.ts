/**
 * sandboxDeliveryAdvance — journey state machine (staging cockpit).
 *
 * Covers the 8-step manual progression, its gates, idempotency, and the
 * strict separation between:
 *   - journey-only actions (zero wallet/ledger, no status regression), and
 *   - confirm_pickup (reuses canonical pickup) / confirm_delivered (delegates
 *     to completeDeliveryCore exactly-once).
 *
 * completeDeliveryCore is mocked so we can assert call-count and prove no
 * financial logic is duplicated here. The financial correctness itself
 * (pharmacy ×100, courier raw, sandbox bypass, currency preserved) is
 * covered by completeExchangeDelivery-wallet-units / -sandboxBypass, which
 * still pass unchanged after the extraction.
 */
import { jest } from "@jest/globals";

const completeDeliveryCoreMock = jest.fn(async () => ({ success: true, status: "completed" }));

class FakeHttpsError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

// Mutable world + write capture.
interface FakeDoc { exists: boolean; data?: Record<string, unknown>; }
let docs: Map<string, FakeDoc>;
let writes: Array<{ op: "set" | "update"; path: string; payload: Record<string, unknown> }>;
// Injectable one-shot failure for a non-transactional `.set(...)` on a path,
// used to simulate a journey write that fails after a successful settlement.
let failNextSetFor: string | null = null;

const ref = (path: string) => ({
  __path: path,
  id: path.split("/").pop(),
  get: async () => {
    const d = docs.get(path) ?? { exists: false };
    return { exists: d.exists, data: () => d.data };
  },
  set: async (payload: Record<string, unknown>) => {
    if (failNextSetFor === path) {
      failNextSetFor = null;
      throw new Error("simulated journey write failure");
    }
    writes.push({ op: "set", path, payload });
  },
});
const pathOf = (r: unknown) => (r as { __path?: string })?.__path ?? "?";

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({
    collection: (c: string) => ({ doc: (id: string) => ref(`${c}/${id}`) }),
    runTransaction: async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        get: async (r: unknown) => {
          const d = docs.get(pathOf(r)) ?? { exists: false };
          return { exists: d.exists, data: () => d.data };
        },
        set: (r: unknown, payload: Record<string, unknown>) =>
          writes.push({ op: "set", path: pathOf(r), payload }),
        update: (r: unknown, payload: Record<string, unknown>) =>
          writes.push({ op: "update", path: pathOf(r), payload }),
      }),
  })),
  FieldValue: {
    serverTimestamp: jest.fn(() => "ts"),
    delete: jest.fn(() => "__delete"),
  },
}));

jest.mock("firebase-functions/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (_opts: unknown, handler: unknown) => handler,
  HttpsError: FakeHttpsError,
}));

jest.mock("../lib/sandboxGate.js", () => ({
  assertSandboxAllowedForProject: jest.fn(),
  isSandboxEnabled: jest.fn(() => true),
  isSandboxAccountEmail: jest.fn((e: string) => /@promoshake\.net$/i.test(e)),
}));

jest.mock("../completeExchangeDelivery.js", () => ({
  completeDeliveryCore: completeDeliveryCoreMock,
}));

import { sandboxDeliveryAdvance } from "../sandboxDeliveryAdvance.js";

const BUYER = "buyer-uid";
const SELLER = "seller-uid";
const DELIVERY = "d-1";
const EMAIL = "demo@promoshake.net";

function call(action: string, uid: string = BUYER, deliveryId: string = DELIVERY) {
  return (sandboxDeliveryAdvance as unknown as (req: unknown) => Promise<Record<string, unknown>>)({
    auth: { uid },
    data: { deliveryId, action },
  });
}

function seedDelivery(overrides: Record<string, unknown> = {}) {
  docs = new Map();
  writes = [];
  docs.set(`pharmacies/${BUYER}`, { exists: true, data: { email: EMAIL } });
  docs.set(`pharmacies/${SELLER}`, { exists: true, data: { email: EMAIL } });
  docs.set(`deliveries/${DELIVERY}`, {
    exists: true,
    data: {
      status: "pending",
      fromPharmacyId: BUYER,
      toPharmacyId: SELLER,
      proposalId: "p-1",
      ...overrides,
    },
  });
}

function setJourney(outboundPhase: string, returnRequired = false, returnPhase = "not_required", status = "pending") {
  const d = docs.get(`deliveries/${DELIVERY}`)!;
  d.data = { ...d.data, status, sandboxJourney: { version: 1, outboundPhase, returnRequired, returnPhase } };
}

function lastJourney(): Record<string, unknown> | undefined {
  const w = [...writes].reverse().find((w) => w.path === `deliveries/${DELIVERY}` && w.payload.sandboxJourney);
  return w?.payload.sandboxJourney as Record<string, unknown> | undefined;
}

function noFinancialWrites() {
  expect(writes.find((w) => w.path.startsWith("wallets/"))).toBeUndefined();
  expect(writes.find((w) => w.path.startsWith("ledger/"))).toBeUndefined();
  expect(completeDeliveryCoreMock).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  completeDeliveryCoreMock.mockResolvedValue({ success: true, status: "completed" } as never);
  failNextSetFor = null;
  seedDelivery();
});

/**
 * Install a stateful settlement mock that SIMULATES completeDeliveryCore's
 * exactly-once guard with a synchronous check-and-set on the delivery status
 * (Node is single-threaded, so the sync body is atomic across interleaved
 * awaits). First call settles once and flips status→delivered + emits one
 * wallet + one ledger write; any later call reads status=delivered and throws
 * failed-precondition.
 *
 * This is a faithful simulation, NOT a real Firestore Emulator transaction —
 * it proves this file's integration (single settlement + idempotent loser),
 * while the transactional isolation itself is covered by completeExchange-
 * Delivery's own tests.
 */
function installStatefulSettlement(): () => number {
  let settlements = 0;
  completeDeliveryCoreMock.mockImplementation((async (args: { deliveryId: string }) => {
    const d = docs.get(`deliveries/${args.deliveryId}`)!;
    if (d.data!.status === "delivered") {
      throw new FakeHttpsError("failed-precondition", "already delivered");
    }
    d.data!.status = "delivered"; // atomic (synchronous) flip
    settlements++;
    writes.push({ op: "update", path: "wallets/seller", payload: { available: 1 } });
    writes.push({ op: "set", path: "ledger/settle", payload: {} });
    return { success: true, status: "completed" };
  }) as never);
  return () => settlements;
}

// 1. Each valid outbound transition
describe("valid outbound transitions", () => {
  test("start_pickup: assigned → en_route_to_pickup (journey only)", async () => {
    const r = await call("start_pickup");
    expect(r.outboundPhase).toBe("en_route_to_pickup");
    expect(lastJourney()?.outboundPhase).toBe("en_route_to_pickup");
    noFinancialWrites();
  });

  test("confirm_pickup: en_route_to_pickup → picked_up + canonical status", async () => {
    setJourney("en_route_to_pickup");
    const r = await call("confirm_pickup");
    expect(r.outboundPhase).toBe("picked_up");
    const w = writes.find((w) => w.path === `deliveries/${DELIVERY}`)!;
    expect(w.payload.status).toBe("picked_up");
    expect(w.payload.courierId).toBe(BUYER);
    expect(completeDeliveryCoreMock).not.toHaveBeenCalled();
  });

  test("start_delivery: picked_up → en_route_to_dropoff (journey only)", async () => {
    setJourney("picked_up", false, "not_required", "picked_up");
    const r = await call("start_delivery");
    expect(r.outboundPhase).toBe("en_route_to_dropoff");
    noFinancialWrites();
  });

  test("confirm_delivered: en_route_to_dropoff → delivered via completeDeliveryCore", async () => {
    setJourney("en_route_to_dropoff", false, "not_required", "picked_up");
    const r = await call("confirm_delivered");
    expect(r.outboundPhase).toBe("delivered");
    expect(completeDeliveryCoreMock).toHaveBeenCalledTimes(1);
    expect(completeDeliveryCoreMock).toHaveBeenCalledWith({ deliveryId: DELIVERY, userId: BUYER });
  });
});

// 2. Each valid return transition when required
describe("valid return transitions (returnRequired)", () => {
  const R = "delivered";
  test.each([
    ["start_return_pickup", "awaiting_return", "en_route_to_return_pickup"],
    ["confirm_return_pickup", "en_route_to_return_pickup", "return_picked_up"],
    ["start_return_delivery", "return_picked_up", "en_route_to_return_dropoff"],
    ["confirm_return_delivered", "en_route_to_return_dropoff", "return_delivered"],
  ])("%s: %s → %s (journey only)", async (action, from, to) => {
    setJourney(R, true, from, "delivered");
    const r = await call(action);
    expect(r.returnPhase).toBe(to);
    expect(lastJourney()?.returnPhase).toBe(to);
    noFinancialWrites();
  });
});

// 3. Return refused if not required
test("return action refused when returnRequired !== true", async () => {
  setJourney("delivered", false, "not_required", "delivered");
  await expect(call("start_return_pickup")).rejects.toMatchObject({ code: "failed-precondition" });
});

// 4. Skipped transition refused
test("skipped outbound transition refused (start_delivery from assigned)", async () => {
  setJourney("assigned");
  await expect(call("start_delivery")).rejects.toMatchObject({ code: "failed-precondition" });
});

// 5. Backward transition refused
test("backward transition refused (start_pickup from picked_up)", async () => {
  setJourney("picked_up", false, "not_required", "picked_up");
  await expect(call("start_pickup")).rejects.toMatchObject({ code: "failed-precondition" });
});

// 6. Unknown action refused
test("unknown action refused", async () => {
  await expect(call("teleport")).rejects.toMatchObject({ code: "invalid-argument" });
});

// 7. Unauthenticated refused
test("unauthenticated caller refused", async () => {
  await expect(
    (sandboxDeliveryAdvance as unknown as (r: unknown) => Promise<unknown>)({ data: { deliveryId: DELIVERY, action: "start_pickup" } })
  ).rejects.toMatchObject({ code: "unauthenticated" });
});

// 8. Email outside gate refused
test("email outside sandbox gate refused", async () => {
  docs.get(`pharmacies/${BUYER}`)!.data = { email: "real@gmail.com" };
  await expect(call("start_pickup")).rejects.toMatchObject({ code: "permission-denied" });
});

// 9. Authorization matrix: buyer / seller / assigned courier / other.
describe("authorization matrix", () => {
  test("buyer authorized (trade party acting as courier)", async () => {
    const r = await call("start_pickup", BUYER);
    expect(r.outboundPhase).toBe("en_route_to_pickup");
  });

  test("seller authorized (trade party acting as courier)", async () => {
    const r = await call("start_pickup", SELLER);
    expect(r.outboundPhase).toBe("en_route_to_pickup");
  });

  test("assigned courier authorized (delivery.courierId === caller)", async () => {
    // A non-trade-party pharmacy that is the assigned courier.
    const COURIER = "courier-uid";
    docs.set(`pharmacies/${COURIER}`, { exists: true, data: { email: EMAIL } });
    docs.get(`deliveries/${DELIVERY}`)!.data!.courierId = COURIER;
    const r = await call("start_pickup", COURIER);
    expect(r.outboundPhase).toBe("en_route_to_pickup");
  });

  test("other pharmacy (neither trade party nor assigned courier) refused", async () => {
    docs.set("pharmacies/outsider", { exists: true, data: { email: EMAIL } });
    await expect(call("start_pickup", "outsider")).rejects.toMatchObject({ code: "permission-denied" });
  });

  test("real external courier ACCOUNT blocked upstream by the pharmacy-only email gate", async () => {
    // No pharmacies/{uid} doc exists for a couriers-collection account.
    docs.get(`deliveries/${DELIVERY}`)!.data!.courierId = "real-courier";
    await expect(call("start_pickup", "real-courier")).rejects.toMatchObject({ code: "permission-denied" });
  });
});

// 11 & 12. Journey actions never write wallets/ledger and never call settlement
describe("journey actions have zero financial effect", () => {
  test("start actions: no wallet/ledger/settlement", async () => {
    await call("start_pickup");
    noFinancialWrites();
  });
  test("return actions: no wallet/ledger/settlement", async () => {
    setJourney("delivered", true, "awaiting_return", "delivered");
    await call("start_return_pickup");
    noFinancialWrites();
  });
});

// 13. confirm_pickup drives canonical status exactly once, no settlement
test("confirm_pickup sets status picked_up once, no settlement", async () => {
  setJourney("en_route_to_pickup");
  await call("confirm_pickup");
  const statusWrites = writes.filter((w) => w.path === `deliveries/${DELIVERY}` && w.payload.status === "picked_up");
  expect(statusWrites).toHaveLength(1);
  expect(completeDeliveryCoreMock).not.toHaveBeenCalled();
});

// 14–16. Settlement exactly-once
describe("settlement exactly-once", () => {
  test("confirm_delivered calls settlement once", async () => {
    setJourney("en_route_to_dropoff", false, "not_required", "picked_up");
    await call("confirm_delivered");
    expect(completeDeliveryCoreMock).toHaveBeenCalledTimes(1);
  });

  test("second confirm_delivered (journey already delivered) does NOT settle again", async () => {
    setJourney("delivered", false, "not_required", "delivered");
    const r = await call("confirm_delivered");
    expect(r.idempotent).toBe(true);
    expect(completeDeliveryCoreMock).not.toHaveBeenCalled();
  });

  test("confirm_delivered treats core's failed-precondition (already settled) as idempotent", async () => {
    setJourney("en_route_to_dropoff", false, "not_required", "delivered");
    completeDeliveryCoreMock.mockRejectedValueOnce(new FakeHttpsError("failed-precondition", "already delivered") as never);
    const r = await call("confirm_delivered");
    expect(r.outboundPhase).toBe("delivered");
    expect(completeDeliveryCoreMock).toHaveBeenCalledTimes(1);
    expect(lastJourney()?.outboundPhase).toBe("delivered");
  });

  test("confirm_delivered re-throws a non-precondition core error", async () => {
    setJourney("en_route_to_dropoff", false, "not_required", "picked_up");
    completeDeliveryCoreMock.mockRejectedValueOnce(new FakeHttpsError("internal", "boom") as never);
    await expect(call("confirm_delivered")).rejects.toMatchObject({ code: "internal" });
  });

  test("failed-precondition with status NOT delivered stays an error (never fake success)", async () => {
    // completeDeliveryCore refuses AND the delivery is cancelled — this is a
    // real precondition failure, not idempotency. Must surface, and must NOT
    // write the journey to 'delivered'.
    setJourney("en_route_to_dropoff", false, "not_required", "picked_up");
    docs.get(`deliveries/${DELIVERY}`)!.data!.status = "cancelled";
    completeDeliveryCoreMock.mockRejectedValueOnce(new FakeHttpsError("failed-precondition", "cannot complete cancelled") as never);
    await expect(call("confirm_delivered")).rejects.toMatchObject({ code: "failed-precondition" });
    expect(lastJourney()?.outboundPhase).not.toBe("delivered");
  });

  test("concurrent confirm_delivered calls settle once", async () => {
    setJourney("en_route_to_dropoff", false, "not_required", "picked_up");
    const settlements = installStatefulSettlement();

    const [a, b] = await Promise.allSettled([call("confirm_delivered"), call("confirm_delivered")]);

    // Exactly one effective settlement, one wallet series, one ledger series.
    expect(settlements()).toBe(1);
    expect(writes.filter((w) => w.path.startsWith("wallets/"))).toHaveLength(1);
    expect(writes.filter((w) => w.path.startsWith("ledger/"))).toHaveLength(1);
    // Both calls resolve (loser is idempotent), final state is delivered.
    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("fulfilled");
    expect(docs.get(`deliveries/${DELIVERY}`)!.data!.status).toBe("delivered");
    expect(lastJourney()?.outboundPhase).toBe("delivered");
  });

  test("reconciliation: settlement OK but journey write failed → retry fixes journey WITHOUT re-settling", async () => {
    setJourney("en_route_to_dropoff", false, "not_required", "picked_up");
    const settlements = installStatefulSettlement();

    // First attempt: settlement succeeds, then the journey write throws.
    failNextSetFor = `deliveries/${DELIVERY}`;
    await expect(call("confirm_delivered")).rejects.toThrow();
    expect(settlements()).toBe(1); // settled once
    expect(docs.get(`deliveries/${DELIVERY}`)!.data!.status).toBe("delivered");
    // Journey NOT yet advanced (write failed).
    expect(lastJourney()?.outboundPhase).not.toBe("delivered");

    // Retry: journey still en_route_to_dropoff → re-enters settlement path →
    // core throws failed-precondition → re-read sees delivered → journey
    // reconciled to delivered, and NO second settlement.
    const r = await call("confirm_delivered");
    expect(r.outboundPhase).toBe("delivered");
    expect(settlements()).toBe(1); // still one — never re-settled
    expect(lastJourney()?.outboundPhase).toBe("delivered");
  });
});

// 10 (per-call proxy). Missing deliveryId refused before any work.
test("missing deliveryId refused", async () => {
  await expect(
    (sandboxDeliveryAdvance as unknown as (r: unknown) => Promise<unknown>)({ auth: { uid: BUYER }, data: { action: "start_pickup" } })
  ).rejects.toMatchObject({ code: "invalid-argument" });
});

// 18. Reset refused from delivered (legacy contract preserved)
test("reset refused from delivered", async () => {
  docs.get(`deliveries/${DELIVERY}`)!.data!.status = "delivered";
  await expect(call("reset")).rejects.toMatchObject({ code: "failed-precondition" });
});

// Idempotency of journey-only actions
test("repeating start_pickup at target phase → idempotent success, no extra write intent", async () => {
  setJourney("en_route_to_pickup");
  const r = await call("start_pickup");
  expect(r.idempotent).toBe(true);
});

// returnRequired derived from proposal on confirm_delivered when the journey
// carries no returnRequired key (legacy/edge — normally start_pickup sets it).
test("confirm_delivered derives returnRequired from exchange proposal", async () => {
  const d = docs.get(`deliveries/${DELIVERY}`)!;
  d.data = {
    ...d.data,
    status: "picked_up",
    // Journey WITHOUT a returnRequired key → forces proposal derivation.
    sandboxJourney: { version: 1, outboundPhase: "en_route_to_dropoff", returnPhase: "not_required" },
  };
  docs.set("exchange_proposals/p-1", { exists: true, data: { details: { type: "exchange" } } });
  const r = await call("confirm_delivered");
  expect(r.returnRequired).toBe(true);
  expect(lastJourney()?.returnPhase).toBe("awaiting_return");
});

// 22. Delivery currency / wallet currency never touched by journey actions
test("no journey action writes a currency field", async () => {
  setJourney("assigned");
  await call("start_pickup");
  const anyCurrencyWrite = writes.find((w) => "currency" in w.payload || "currencyCode" in w.payload);
  expect(anyCurrencyWrite).toBeUndefined();
});
