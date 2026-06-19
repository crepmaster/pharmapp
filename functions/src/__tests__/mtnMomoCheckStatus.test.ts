/**
 * mtnMomoCheckStatus — unit tests (Round 2 #4).
 *
 * Foundational coverage for the MTN MoMo status-poll callable: auth,
 * input validation, payment-not-found, cross-user permission check,
 * cached terminal status short-circuit, pending status, and the
 * settlement_blocked branch for non-pharmacy ownerType.
 *
 * The full SUCCESSFUL → wallet-credit path is out of scope here (it
 * runs a real Firestore transaction); it is exercised end-to-end by
 * the staging recette and the `topup` integration tests.
 */
import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Mocks — must run BEFORE the import of the module under test.
// ---------------------------------------------------------------------------

const mockPaymentGet = jest.fn() as jest.MockedFunction<() => Promise<unknown>>;
const mockPaymentUpdate = jest.fn() as jest.MockedFunction<
  (data: Record<string, unknown>) => Promise<void>
>;
mockPaymentUpdate.mockResolvedValue(undefined);
const mockPaymentDoc = jest.fn(() => ({
  get: mockPaymentGet,
  update: mockPaymentUpdate,
}));

const mockCollection = jest.fn((name: string) => {
  if (name === "payments") return { doc: mockPaymentDoc };
  return { doc: () => ({ get: jest.fn(), update: jest.fn() }) };
});

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({ collection: mockCollection })),
  FieldValue: { serverTimestamp: jest.fn(() => "mock-timestamp") },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("firebase-functions/params", () => ({
  defineSecret: jest.fn(() => ({ value: jest.fn(() => "test-mtn-secret") })),
}));

// ---------------------------------------------------------------------------
// Import after mocks.
// ---------------------------------------------------------------------------

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();

import { mtnMomoCheckStatus } from "../mtnMomoCheckStatus.js";

const wrapped = testFns.wrap(mtnMomoCheckStatus);

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
(globalThis as { fetch: typeof fetch }).fetch = mockFetch;

afterAll(() => testFns.cleanup());

beforeEach(() => {
  jest.clearAllMocks();
});

function callAs(uid: string, referenceId: string): Promise<unknown> {
  return wrapped({
    data: { referenceId },
    auth: { uid, token: { firebase: { sign_in_provider: "password" } } },
  } as never);
}

describe("mtnMomoCheckStatus — unauthenticated / input validation", () => {
  test("rejects unauthenticated requests", async () => {
    await expect(
      wrapped({ data: { referenceId: "ref-1" }, auth: undefined } as never)
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  test("rejects missing referenceId", async () => {
    await expect(
      wrapped({
        data: {},
        auth: { uid: "u1", token: { firebase: { sign_in_provider: "password" } } },
      } as never)
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("mtnMomoCheckStatus — payment lookup gating", () => {
  test("rejects when the payment intent does not exist", async () => {
    mockPaymentGet.mockResolvedValue({ exists: false });

    await expect(callAs("u1", "ref-missing")).rejects.toMatchObject({
      code: "not-found",
    });
  });

  test("rejects when the caller is not the payment owner", async () => {
    mockPaymentGet.mockResolvedValue({
      exists: true,
      data: () => ({ userId: "owner-uid", status: "pending" }),
    });

    await expect(callAs("attacker-uid", "ref-1")).rejects.toMatchObject({
      code: "permission-denied",
    });
  });
});

describe("mtnMomoCheckStatus — cached terminal status (no external call)", () => {
  test("returns cached successful status without hitting MTN", async () => {
    mockPaymentGet.mockResolvedValue({
      exists: true,
      data: () => ({ userId: "u1", status: "successful", amount: 100 }),
    });

    const result = (await callAs("u1", "ref-ok")) as Record<string, unknown>;
    expect(result.status).toBe("successful");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns cached failed status without hitting MTN", async () => {
    mockPaymentGet.mockResolvedValue({
      exists: true,
      data: () => ({ userId: "u1", status: "failed", amount: 100 }),
    });

    const result = (await callAs("u1", "ref-fail")) as Record<string, unknown>;
    expect(result.status).toBe("failed");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("mtnMomoCheckStatus — live MTN poll", () => {
  test("MTN PENDING → returns { status: 'pending' }", async () => {
    mockPaymentGet.mockResolvedValue({
      exists: true,
      data: () => ({ userId: "u1", status: "pending" }),
    });
    // 1st fetch = token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "mock-token" }),
    } as Response);
    // 2nd fetch = MTN status
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "PENDING" }),
    } as Response);

    const result = (await callAs("u1", "ref-pending")) as Record<string, unknown>;
    expect(result).toEqual({ status: "pending" });
    expect(mockPaymentUpdate).not.toHaveBeenCalled();
  });

  test("settlement_blocked when ownerType is non-pharmacy (defence in depth)", async () => {
    mockPaymentGet.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: "u1",
        ownerType: "courier",
        ownerId: "u1",
        status: "pending",
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "mock-token" }),
    } as Response);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "SUCCESSFUL", financialTransactionId: "tx-1" }),
    } as Response);

    const result = (await callAs("u1", "ref-courier")) as Record<string, unknown>;
    expect(result.status).toBe("settlement_blocked");
    expect(mockPaymentUpdate).toHaveBeenCalledTimes(1);
    const updatePayload = mockPaymentUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload.status).toBe("settlement_blocked");
    expect(updatePayload.settlementBlockedReason).toContain("non-pharmacy");
  });
});
