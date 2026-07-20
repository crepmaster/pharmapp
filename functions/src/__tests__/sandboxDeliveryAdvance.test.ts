/**
 * sandboxDeliveryAdvance — unit tests.
 *
 * Covers the staging demo helper that advances a delivery pending→picked_up
 * without a real courier. Gates: SANDBOX_ENABLED env + @promoshake.net email
 * + caller is buyer/seller.
 */
import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPharmacyGet = jest.fn() as jest.MockedFunction<() => Promise<unknown>>;
const mockDeliveryGet = jest.fn() as jest.MockedFunction<() => Promise<unknown>>;
const mockDeliveryUpdate = jest.fn() as jest.MockedFunction<
  (data: Record<string, unknown>) => Promise<void>
>;
mockDeliveryUpdate.mockResolvedValue(undefined);

const mockCollection = jest.fn((name: string) => {
  if (name === "pharmacies") {
    return { doc: () => ({ get: mockPharmacyGet }) };
  }
  if (name === "deliveries") {
    return {
      doc: () => ({ get: mockDeliveryGet, update: mockDeliveryUpdate }),
    };
  }
  return { doc: () => ({ get: jest.fn() }) };
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

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();

import { sandboxDeliveryAdvance } from "../sandboxDeliveryAdvance.js";
const wrapped = testFns.wrap(sandboxDeliveryAdvance);

afterAll(() => testFns.cleanup());

const ORIGINAL_ENV = process.env.SANDBOX_ENABLED;
afterEach(() => {
  jest.clearAllMocks();
  if (ORIGINAL_ENV === undefined) delete process.env.SANDBOX_ENABLED;
  else process.env.SANDBOX_ENABLED = ORIGINAL_ENV;
});

function callAs(uid: string, data: Record<string, unknown>): Promise<unknown> {
  return wrapped({
    data,
    auth: { uid, token: { firebase: { sign_in_provider: "password" } } },
  } as never);
}

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

  test("rejects unknown action", async () => {
    await expect(
      callAs("u1", { deliveryId: "d1", action: "deliver" })
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("sandboxDeliveryAdvance — identity gate (env on)", () => {
  beforeEach(() => {
    process.env.SANDBOX_ENABLED = "true";
  });

  test("rejects when the caller is not a registered pharmacy", async () => {
    mockPharmacyGet.mockResolvedValue({ exists: false });
    await expect(
      callAs("u1", { deliveryId: "d1", action: "pickup" })
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  test("rejects a pharmacy caller whose email is not @promoshake.net", async () => {
    mockPharmacyGet.mockResolvedValue({
      exists: true,
      data: () => ({ email: "real@gmail.com" }),
    });
    await expect(
      callAs("u1", { deliveryId: "d1", action: "pickup" })
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  test("rejects when caller is neither buyer nor seller on the delivery", async () => {
    mockPharmacyGet.mockResolvedValue({
      exists: true,
      data: () => ({ email: "caller@promoshake.net" }),
    });
    mockDeliveryGet.mockResolvedValue({
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

describe("sandboxDeliveryAdvance — happy path (env on)", () => {
  beforeEach(() => {
    process.env.SANDBOX_ENABLED = "true";
    mockPharmacyGet.mockResolvedValue({
      exists: true,
      data: () => ({ email: "buyer@promoshake.net" }),
    });
    mockDeliveryGet.mockResolvedValue({
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
    expect(mockDeliveryUpdate).toHaveBeenCalledTimes(1);
    const payload = mockDeliveryUpdate.mock.calls[0][0] as Record<string, unknown>;
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
    const payload = mockDeliveryUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.courierId).toBe("seller-uid");
  });

  test("rejects when delivery is not in pending status", async () => {
    mockDeliveryGet.mockResolvedValue({
      exists: true,
      data: () => ({
        fromPharmacyId: "buyer-uid",
        toPharmacyId: "seller-uid",
        status: "picked_up", // already
      }),
    });
    await expect(
      callAs("buyer-uid", { deliveryId: "d1", action: "pickup" })
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect(mockDeliveryUpdate).not.toHaveBeenCalled();
  });
});
