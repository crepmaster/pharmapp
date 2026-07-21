/**
 * sandboxDeliveryAdvance — unit tests.
 *
 * Covers the staging demo helper that advances a delivery pending→picked_up
 * or resets failed/cancelled→pending, without a real courier.
 *
 * Gate stack : SANDBOX_ENABLED env + @promoshake.net email + caller ∈ {buyer, seller}
 * + status allowlist per action.
 *
 * Round-4 review updates:
 *   - Whole check-and-write is now inside `runTransaction` — the status is
 *     re-read via `tx.get` so a concurrent flip to `delivered` cannot be
 *     rolled back by a stale-snapshot reset (P0#2).
 *   - Reset allowlist tightened to `[failed, cancelled]` — pending/picked_up/
 *     in_transit are now refused (P1#1).
 */
import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPharmacyGet = jest.fn() as jest.MockedFunction<() => Promise<unknown>>;
// Identity now resolves against pharmacies OR couriers, so the harness must
// stub both. Defaulted to `{exists:false}`: a test that says nothing about
// couriers means "this uid is not a courier".
const mockCourierGet = jest.fn() as jest.MockedFunction<() => Promise<unknown>>;
const mockTxGet = jest.fn() as jest.MockedFunction<(ref: unknown) => Promise<unknown>>;
const mockTxUpdate = jest.fn() as jest.MockedFunction<
  (ref: unknown, data: Record<string, unknown>) => void
>;

// Tracks whether the current tx.get call happened INSIDE runTransaction.
// Any tx.get outside the runTransaction callback would be a bug — the whole
// point of the round-4 fix (P0#2) is that the status check must be re-read
// inside the transaction so a concurrent flip to `delivered` is observed.
let insideRunTransaction = false;
const runTxCallLog: Array<{ inside: boolean }> = [];

const mockRunTransaction = jest.fn(async (cb: (tx: any) => Promise<any>) => {
  insideRunTransaction = true;
  try {
    return await cb({
      get: (ref: unknown) => {
        runTxCallLog.push({ inside: insideRunTransaction });
        return mockTxGet(ref);
      },
      update: (ref: unknown, data: Record<string, unknown>) => {
        mockTxUpdate(ref, data);
      },
    });
  } finally {
    insideRunTransaction = false;
  }
});

const mockCollection = jest.fn((name: string) => {
  if (name === "pharmacies") {
    return { doc: () => ({ get: mockPharmacyGet }) };
  }
  if (name === "couriers") {
    return { doc: () => ({ get: mockCourierGet }) };
  }
  if (name === "deliveries") {
    return { doc: () => ({ /* ref only — reads go through tx.get */ }) };
  }
  return { doc: () => ({}) };
});

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
    serverTimestamp: jest.fn(() => "mock-timestamp"),
    delete: jest.fn(() => "__delete__"),
  },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

// SANDBOX_ENABLED must be set BEFORE importing sandboxDeliveryAdvance because
// the module calls assertSandboxAllowedForProject() at load. The gate is a
// no-op when SANDBOX_ENABLED is off. FUNCTIONS_EMULATOR gets us past the
// allowlist during the test-suite load (jest runs neither in staging nor
// with a real project id).
process.env.FUNCTIONS_EMULATOR = "true";

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();

import { sandboxDeliveryAdvance } from "../sandboxDeliveryAdvance.js";
const wrapped = testFns.wrap(sandboxDeliveryAdvance);

afterAll(() => testFns.cleanup());

beforeEach(() => {
  mockCourierGet.mockResolvedValue({ exists: false });
});

const ORIGINAL_ENV = process.env.SANDBOX_ENABLED;
afterEach(() => {
  jest.clearAllMocks();
  runTxCallLog.length = 0;
  if (ORIGINAL_ENV === undefined) delete process.env.SANDBOX_ENABLED;
  else process.env.SANDBOX_ENABLED = ORIGINAL_ENV;
});

function callAs(uid: string, data: Record<string, unknown>): Promise<unknown> {
  return wrapped({
    data,
    auth: { uid, token: { firebase: { sign_in_provider: "password" } } },
  } as never);
}

// ---------------------------------------------------------------------------
// Env + input validation
// ---------------------------------------------------------------------------

describe("sandboxDeliveryAdvance — env gate", () => {
  test("refuses when SANDBOX_ENABLED is not set", async () => {
    delete process.env.SANDBOX_ENABLED;
    await expect(
      callAs("u1", { deliveryId: "d1", action: "pickup" })
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });
});

describe("sandboxDeliveryAdvance — input validation (env on)", () => {
  beforeEach(() => {
    process.env.SANDBOX_ENABLED = "true";
  });

  test("rejects unauthenticated", async () => {
    await expect(
      wrapped({ data: { deliveryId: "d1", action: "pickup" }, auth: undefined } as never)
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  test("rejects missing deliveryId", async () => {
    await expect(callAs("u1", { action: "pickup" })).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("rejects unknown action (only pickup + reset are accepted)", async () => {
    await expect(
      callAs("u1", { deliveryId: "d1", action: "deliver" })
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

// ---------------------------------------------------------------------------
// Identity gate
// ---------------------------------------------------------------------------

describe("sandboxDeliveryAdvance — identity gate (env on)", () => {
  beforeEach(() => {
    process.env.SANDBOX_ENABLED = "true";
  });

  test("rejects a caller who is neither a pharmacy nor a courier", async () => {
    mockPharmacyGet.mockResolvedValue({ exists: false });
    mockCourierGet.mockResolvedValue({ exists: false });
    await expect(
      callAs("u1", { deliveryId: "d1", action: "pickup" })
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  // The account-domain requirement is deliberately NOT applied by this
  // callable: the staging project allowlist and SANDBOX_ENABLED already
  // restrict it, and requiring @promoshake.net here is what stopped the
  // courier UI from working. The shared `isSandboxAccountEmail` used by the
  // payment and settlement bypasses is untouched.
  test("accepts a pharmacy caller with a business email", async () => {
    mockPharmacyGet.mockResolvedValue({
      exists: true,
      data: () => ({ email: "accra1@gmail.com" }),
    });
    mockTxGet.mockResolvedValue({
      exists: true,
      data: () => ({
        fromPharmacyId: "u1",
        toPharmacyId: "seller-uid",
        status: "pending",
      }),
    });
    await expect(
      callAs("u1", { deliveryId: "d1", action: "pickup" })
    ).resolves.toMatchObject({ ok: true, newStatus: "picked_up" });
  });

  test("still rejects an account carrying no email", async () => {
    mockPharmacyGet.mockResolvedValue({ exists: true, data: () => ({}) });
    await expect(
      callAs("u1", { deliveryId: "d1", action: "pickup" })
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  // The reason this lot exists: the courier drives the timeline from its own
  // screen, so a genuine `couriers/{uid}` account must authenticate.
  test("accepts a genuine courier account assigned to the delivery", async () => {
    mockPharmacyGet.mockResolvedValue({ exists: false });
    mockCourierGet.mockResolvedValue({
      exists: true,
      data: () => ({ email: "kwame.courier@gmail.com" }),
    });
    mockTxGet.mockResolvedValue({
      exists: true,
      data: () => ({
        fromPharmacyId: "buyer-uid",
        toPharmacyId: "seller-uid",
        courierId: "courier-uid",
        status: "pending",
      }),
    });
    await expect(
      callAs("courier-uid", { deliveryId: "d1", action: "pickup" })
    ).resolves.toMatchObject({ ok: true, newStatus: "picked_up" });
  });

  // Being a courier is identity, not authorization.
  test("rejects a courier account not assigned to this delivery", async () => {
    mockPharmacyGet.mockResolvedValue({ exists: false });
    mockCourierGet.mockResolvedValue({
      exists: true,
      data: () => ({ email: "other.courier@gmail.com" }),
    });
    mockTxGet.mockResolvedValue({
      exists: true,
      data: () => ({
        fromPharmacyId: "buyer-uid",
        toPharmacyId: "seller-uid",
        courierId: "courier-uid",
        status: "pending",
      }),
    });
    await expect(
      callAs("someone-else-uid", { deliveryId: "d1", action: "pickup" })
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  test("rejects when caller is neither buyer nor seller on the delivery", async () => {
    mockPharmacyGet.mockResolvedValue({
      exists: true,
      data: () => ({ email: "caller@promoshake.net" }),
    });
    mockTxGet.mockResolvedValue({
      exists: true,
      data: () => ({
        fromPharmacyId: "buyer-uid",
        toPharmacyId: "seller-uid",
        status: "pending",
      }),
    });
    await expect(
      callAs("outsider-uid", { deliveryId: "d1", action: "pickup" })
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});

// ---------------------------------------------------------------------------
// Pickup — happy path
// ---------------------------------------------------------------------------

describe("sandboxDeliveryAdvance — pickup happy path (env on)", () => {
  beforeEach(() => {
    process.env.SANDBOX_ENABLED = "true";
    mockPharmacyGet.mockResolvedValue({
      exists: true,
      data: () => ({ email: "buyer@promoshake.net" }),
    });
    mockTxGet.mockResolvedValue({
      exists: true,
      data: () => ({
        fromPharmacyId: "buyer-uid",
        toPharmacyId: "seller-uid",
        status: "pending",
      }),
    });
  });

  test("pickup by buyer: writes picked_up + courierId=caller + pickedUpAt", async () => {
    const result = (await callAs("buyer-uid", {
      deliveryId: "d1",
      action: "pickup",
    })) as { ok: boolean; deliveryId: string; newStatus: string };

    expect(result).toEqual({
      ok: true,
      deliveryId: "d1",
      newStatus: "picked_up",
    });
    expect(mockTxUpdate).toHaveBeenCalledTimes(1);
    const payload = mockTxUpdate.mock.calls[0][1];
    expect(payload.status).toBe("picked_up");
    expect(payload.courierId).toBe("buyer-uid");
    expect(payload.pickedUpAt).toBe("mock-timestamp");
    expect(payload.sandboxDemoAdvancedBy).toBe("buyer-uid");
  });

  test("pickup by seller works too (seller can drive the demo)", async () => {
    const result = (await callAs("seller-uid", {
      deliveryId: "d1",
      action: "pickup",
    })) as { ok: boolean };
    expect(result.ok).toBe(true);
    const payload = mockTxUpdate.mock.calls[0][1];
    expect(payload.courierId).toBe("seller-uid");
  });

  test("rejects pickup when delivery is not in pending status", async () => {
    mockTxGet.mockResolvedValue({
      exists: true,
      data: () => ({
        fromPharmacyId: "buyer-uid",
        toPharmacyId: "seller-uid",
        status: "picked_up", // already picked up
      }),
    });
    await expect(
      callAs("buyer-uid", { deliveryId: "d1", action: "pickup" })
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect(mockTxUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Reset — allowlist (P1#1)
// ---------------------------------------------------------------------------

describe("sandboxDeliveryAdvance — reset allowlist (env on)", () => {
  beforeEach(() => {
    process.env.SANDBOX_ENABLED = "true";
    mockPharmacyGet.mockResolvedValue({
      exists: true,
      data: () => ({ email: "buyer@promoshake.net" }),
    });
  });

  const buildDelivery = (status: string) => ({
    exists: true,
    data: () => ({
      fromPharmacyId: "buyer-uid",
      toPharmacyId: "seller-uid",
      status,
    }),
  });

  test.each(["failed", "cancelled"] as const)(
    "reset ALLOWED from status=%s → pending, clears courierId + pickedUpAt",
    async (fromStatus) => {
      mockTxGet.mockResolvedValue(buildDelivery(fromStatus));

      const result = (await callAs("buyer-uid", {
        deliveryId: "d1",
        action: "reset",
      })) as { newStatus: string };

      expect(result.newStatus).toBe("pending");
      const payload = mockTxUpdate.mock.calls[0][1];
      expect(payload.status).toBe("pending");
      expect(payload.courierId).toBe("__delete__");
      expect(payload.pickedUpAt).toBe("__delete__");
      expect(payload.sandboxDemoResetAt).toBe("mock-timestamp");
    }
  );

  test.each([
    "delivered",
    "pending",
    "picked_up",
    "in_transit",
    "unknown_status",
    "",
  ] as const)(
    "reset REFUSED from status=%s (only failed/cancelled are allowed)",
    async (fromStatus) => {
      mockTxGet.mockResolvedValue(buildDelivery(fromStatus));

      await expect(
        callAs("buyer-uid", { deliveryId: "d1", action: "reset" })
      ).rejects.toMatchObject({ code: "failed-precondition" });
      expect(mockTxUpdate).not.toHaveBeenCalled();
    }
  );
});

// ---------------------------------------------------------------------------
// Reset — race proof (P0#2)
// ---------------------------------------------------------------------------

describe("sandboxDeliveryAdvance — reset race proof (env on)", () => {
  beforeEach(() => {
    process.env.SANDBOX_ENABLED = "true";
    mockPharmacyGet.mockResolvedValue({
      exists: true,
      data: () => ({ email: "buyer@promoshake.net" }),
    });
  });

  test("check-and-write happens INSIDE runTransaction (structural proof of P0#2 fix)", async () => {
    mockTxGet.mockResolvedValue({
      exists: true,
      data: () => ({
        fromPharmacyId: "buyer-uid",
        toPharmacyId: "seller-uid",
        status: "failed",
      }),
    });

    await callAs("buyer-uid", { deliveryId: "d1", action: "reset" });

    // Proof #1: runTransaction was called.
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    // Proof #2: at least one tx.get happened, and it happened while the
    // insideRunTransaction flag was set → the read is done inside the
    // transaction, not from a stale pre-tx snapshot.
    expect(runTxCallLog.length).toBeGreaterThan(0);
    expect(runTxCallLog.every((c) => c.inside)).toBe(true);
    // Proof #3: the update also flowed through the transaction's tx.update
    // (mockTxUpdate is the tx-scoped update spy).
    expect(mockTxUpdate).toHaveBeenCalledTimes(1);
  });

  test("concurrent flip to delivered inside the transaction refuses the reset", async () => {
    // Simulates a concurrent `completeExchangeDelivery` that runs between
    // whatever the client thought it saw and this transaction's re-read.
    // The pre-tx snapshot (if there were one) might have shown `failed`
    // (which is normally resetable), but tx.get observes `delivered` — the
    // re-read must catch this and refuse.
    mockTxGet.mockResolvedValue({
      exists: true,
      data: () => ({
        fromPharmacyId: "buyer-uid",
        toPharmacyId: "seller-uid",
        status: "delivered",
      }),
    });

    await expect(
      callAs("buyer-uid", { deliveryId: "d1", action: "reset" })
    ).rejects.toMatchObject({ code: "failed-precondition" });

    // Critical: no write emitted → the delivered status stays.
    expect(mockTxUpdate).not.toHaveBeenCalled();
  });

  test("retry pattern: first tx observes failed, retry observes delivered → refused", async () => {
    // Simulates Firestore's optimistic-concurrency retry loop. On the first
    // attempt the state is `failed` and the transaction would commit; but
    // Firestore aborts (we simulate by rejecting the first attempt) and the
    // retry sees `delivered` (concurrent settlement won). The retry must
    // refuse — proving the status decision uses the CURRENT tx read, not
    // whatever the first attempt observed.
    let attempt = 0;
    mockRunTransaction.mockImplementationOnce(
      async (cb: (tx: any) => Promise<any>) => {
        for (;;) {
          attempt++;
          insideRunTransaction = true;
          try {
            const tx = {
              get: (_ref: unknown) => {
                runTxCallLog.push({ inside: insideRunTransaction });
                if (attempt === 1) {
                  return Promise.resolve({
                    exists: true,
                    data: () => ({
                      fromPharmacyId: "buyer-uid",
                      toPharmacyId: "seller-uid",
                      status: "failed",
                    }),
                  });
                }
                return Promise.resolve({
                  exists: true,
                  data: () => ({
                    fromPharmacyId: "buyer-uid",
                    toPharmacyId: "seller-uid",
                    status: "delivered",
                  }),
                });
              },
              update: (ref: unknown, data: Record<string, unknown>) => {
                if (attempt === 1) {
                  // Simulate ABORTED from Firestore — retry.
                  throw Object.assign(new Error("aborted"), {
                    code: 10,
                  });
                }
                mockTxUpdate(ref, data);
              },
            };
            return await cb(tx);
          } catch (err: unknown) {
            if (attempt >= 3) throw err;
            const code = (err as { code?: number }).code;
            if (code !== 10) throw err; // rethrow real errors
            // else retry loop
          } finally {
            insideRunTransaction = false;
          }
        }
      }
    );

    await expect(
      callAs("buyer-uid", { deliveryId: "d1", action: "reset" })
    ).rejects.toMatchObject({ code: "failed-precondition" });

    // Attempt 1 succeeded through the get but failed at commit; attempt 2
    // saw delivered and refused. Two attempts total, two tx.get calls, and
    // NO tx.update on attempt 2.
    expect(attempt).toBe(2);
    expect(runTxCallLog.length).toBe(2);
    expect(mockTxUpdate).not.toHaveBeenCalled();
  });
});
