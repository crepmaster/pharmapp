/**
 * mtnMomoTopupIntent — unit tests (Round 2 #4).
 *
 * Foundational coverage for the MTN MoMo top-up callable: auth,
 * input validation (amount + MSISDN length), pharmacy gating,
 * MTN auth (token) failure, RequestToPay failure, and the happy
 * path that returns `pending` + persists a `payments/{ref}` doc.
 */
import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Mocks — must run BEFORE the import of the module under test.
// ---------------------------------------------------------------------------

const mockPharmacyGet = jest.fn() as jest.MockedFunction<() => Promise<unknown>>;
const mockSysConfigGet = jest.fn() as jest.MockedFunction<() => Promise<unknown>>;
const mockPaymentSet = jest.fn() as jest.MockedFunction<
  (data: Record<string, unknown>) => Promise<void>
>;
mockPaymentSet.mockResolvedValue(undefined);
const mockPaymentDoc = jest.fn() as jest.MockedFunction<
  (ref: string) => { set: typeof mockPaymentSet }
>;
mockPaymentDoc.mockImplementation(() => ({ set: mockPaymentSet }));

const mockCollection = jest.fn((name: string) => {
  if (name === "pharmacies") return { doc: () => ({ get: mockPharmacyGet }) };
  if (name === "system_config") return { doc: () => ({ get: mockSysConfigGet }) };
  if (name === "payments") return { doc: mockPaymentDoc };
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

jest.mock("firebase-functions/params", () => ({
  defineSecret: jest.fn(() => ({ value: jest.fn(() => "test-mtn-secret") })),
}));

const FIXED_UUID = "22222222-2222-4222-8222-222222222222";
jest.mock("crypto", () => {
  const actual = jest.requireActual("crypto") as Record<string, unknown>;
  return { ...actual, randomUUID: jest.fn(() => FIXED_UUID) };
});

// ---------------------------------------------------------------------------
// Import after mocks.
// ---------------------------------------------------------------------------

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();

import { mtnMomoTopupIntent } from "../mtnMomoTopupIntent.js";

const wrapped = testFns.wrap(mtnMomoTopupIntent);

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
(globalThis as { fetch: typeof fetch }).fetch = mockFetch;

afterAll(() => testFns.cleanup());

beforeEach(() => {
  jest.clearAllMocks();
  mockPharmacyGet.mockResolvedValue({
    exists: true,
    data: () => ({ email: "test@promoshake.net", role: "pharmacy" }),
  });
  mockSysConfigGet.mockResolvedValue({
    data: () => ({ currencies: { XAF: { decimals: 0 }, GHS: { decimals: 2 } } }),
  });
});

function callOk(data: Record<string, unknown>, uid: string = "test-uid"): Promise<unknown> {
  return wrapped({
    data,
    auth: { uid, token: { firebase: { sign_in_provider: "password" } } },
  } as never);
}

describe("mtnMomoTopupIntent — unauthenticated / input validation", () => {
  test("rejects unauthenticated requests", async () => {
    await expect(
      wrapped({ data: { amount: 100, phoneNumber: "237670123456" }, auth: undefined } as never)
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  test("rejects amount <= 0", async () => {
    await expect(callOk({ amount: 0, phoneNumber: "237670123456" })).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("rejects missing phoneNumber", async () => {
    await expect(callOk({ amount: 100 })).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("rejects phoneNumber shorter than 9 digits", async () => {
    await expect(callOk({ amount: 100, phoneNumber: "+123" })).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });
});

describe("mtnMomoTopupIntent — MTN external API failure", () => {
  test("translates an MTN auth (token) 401 into HttpsError(internal)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    } as Response);

    await expect(
      callOk({ amount: 100, phoneNumber: "237670123456", currency: "XAF" })
    ).rejects.toMatchObject({ code: "internal" });
    expect(mockPaymentSet).not.toHaveBeenCalled();
  });

  test("translates a RequestToPay non-202 into HttpsError(internal) and does NOT persist payment", async () => {
    // 1st fetch = OAuth token OK
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "mock-token" }),
    } as Response);
    // 2nd fetch = RequestToPay rejected
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "Bad request",
    } as Response);

    await expect(
      callOk({ amount: 100, phoneNumber: "237670123456", currency: "XAF" })
    ).rejects.toMatchObject({ code: "internal" });
    expect(mockPaymentSet).not.toHaveBeenCalled();
  });
});

describe("mtnMomoTopupIntent — happy path", () => {
  test("returns status pending + referenceId + persists payments/{ref}", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "mock-token" }),
    } as Response);
    mockFetch.mockResolvedValueOnce({
      status: 202, // 202 Accepted = MTN async acknowledged
      ok: false, // sandbox returns ok=false but status=202 is what we check
    } as Response);

    const result = (await callOk({
      amount: 100,
      phoneNumber: "+237670123456",
      currency: "XAF",
    })) as { success: boolean; referenceId: string; status: string };

    expect(result).toMatchObject({
      success: true,
      referenceId: FIXED_UUID,
      status: "pending",
    });
    expect(mockPaymentDoc).toHaveBeenCalledWith(FIXED_UUID);
    expect(mockPaymentSet).toHaveBeenCalledTimes(1);
    const payload = mockPaymentSet.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.referenceId).toBe(FIXED_UUID);
    expect(payload.ownerType).toBe("pharmacy");
    expect(payload.amountMinor).toBe(100); // XAF has 0 decimals
    expect(payload.displayCurrency).toBe("XAF");
    expect(payload.currency).toBe("EUR"); // sandbox wires EUR
    expect(payload.phoneNumber).toBe("237670123456"); // normalised (digits only)
    expect(payload.provider).toBe("mtn_momo");
    expect(payload.status).toBe("pending");
    expect(payload.environment).toBe("sandbox");
  });

  test("defaults displayCurrency to XAF when omitted (Cameroon)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "mock-token" }),
    } as Response);
    mockFetch.mockResolvedValueOnce({ status: 202, ok: false } as Response);

    await callOk({ amount: 100, phoneNumber: "237670123456" });
    const payload = mockPaymentSet.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.displayCurrency).toBe("XAF");
  });
});
