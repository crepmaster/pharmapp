/**
 * paystackTopupIntent — unit tests (Round 2 #4).
 *
 * Foundational coverage for the Paystack top-up callable: auth,
 * input validation, missing pharmacy profile data, external API
 * failure (Paystack 401 / non-2xx), and the happy path that
 * persists a `payments/{reference}` doc.
 *
 * The actual `fetch` to Paystack is mocked globally so no network is
 * hit. `firebase-admin/firestore` is mocked to return a fake pharmacy
 * snapshot and capture the `payments` doc the callable creates.
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

// Wallet + ledger mocks for the sandbox-bypass transaction path.
const mockWalletGet = jest.fn() as jest.MockedFunction<() => Promise<unknown>>;
const mockTxGet = jest.fn() as jest.MockedFunction<(ref: unknown) => Promise<unknown>>;
const mockTxSet = jest.fn();
const mockTxUpdate = jest.fn();
const mockLedgerDoc = jest.fn(() => ({ id: "ledger-id" }));
const mockRunTransaction = jest.fn() as jest.MockedFunction<
  (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>
>;
mockRunTransaction.mockImplementation(async (fn) =>
  fn({ get: mockTxGet, set: mockTxSet, update: mockTxUpdate })
);

const mockCollection = jest.fn((name: string) => {
  if (name === "pharmacies") {
    return { doc: () => ({ get: mockPharmacyGet }) };
  }
  if (name === "system_config") {
    return { doc: () => ({ get: mockSysConfigGet }) };
  }
  if (name === "payments") {
    return { doc: mockPaymentDoc };
  }
  if (name === "wallets") {
    return { doc: () => ({ get: mockWalletGet }) };
  }
  if (name === "ledger") {
    return { doc: mockLedgerDoc };
  }
  return { doc: () => ({ get: jest.fn() }) };
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
    increment: jest.fn((n: number) => ({ __op: "increment", n })),
  },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("firebase-functions/params", () => ({
  defineSecret: jest.fn(() => ({ value: jest.fn(() => "test-paystack-secret") })),
}));

// crypto.randomUUID is deterministic-mockable.
const FIXED_UUID = "11111111-1111-4111-8111-111111111111";
jest.mock("crypto", () => {
  const actual = jest.requireActual("crypto") as Record<string, unknown>;
  return { ...actual, randomUUID: jest.fn(() => FIXED_UUID) };
});

// ---------------------------------------------------------------------------
// Import after mocks.
// ---------------------------------------------------------------------------

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();

import { paystackTopupIntent } from "../paystackTopupIntent.js";

const wrapped = testFns.wrap(paystackTopupIntent);

// Global fetch mock.
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
(globalThis as { fetch: typeof fetch }).fetch = mockFetch;

afterAll(() => {
  testFns.cleanup();
});

beforeEach(() => {
  jest.clearAllMocks();
  // Default: a valid pharmacy with an email + GHS currency configured.
  mockPharmacyGet.mockResolvedValue({
    exists: true,
    data: () => ({
      email: "test@promoshake.net",
      role: "pharmacy",
    }),
  });
  mockSysConfigGet.mockResolvedValue({
    data: () => ({ currencies: { GHS: { decimals: 2 } } }),
  });
});

function callOk(data: Record<string, unknown>, uid: string = "test-uid"): Promise<unknown> {
  return wrapped({
    data,
    auth: { uid, token: { firebase: { sign_in_provider: "password" } } },
  } as never);
}

describe("paystackTopupIntent — unauthenticated / input validation", () => {
  test("rejects unauthenticated requests", async () => {
    await expect(
      wrapped({ data: { amount: 100 }, auth: undefined } as never)
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  test("rejects amount <= 0", async () => {
    await expect(callOk({ amount: 0 })).rejects.toMatchObject({
      code: "invalid-argument",
    });
    await expect(callOk({ amount: -10 })).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("rejects non-numeric amount", async () => {
    await expect(callOk({ amount: "not-a-number" })).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });
});

describe("paystackTopupIntent — pharmacy profile gating", () => {
  test("rejects when the pharmacy doc has no email", async () => {
    mockPharmacyGet.mockResolvedValue({
      exists: true,
      data: () => ({ email: "", role: "pharmacy" }),
    });
    await expect(callOk({ amount: 100, currency: "GHS" })).rejects.toMatchObject({
      code: "failed-precondition",
    });
    // Did NOT create a payment doc.
    expect(mockPaymentSet).not.toHaveBeenCalled();
  });
});

describe("paystackTopupIntent — Paystack API failure", () => {
  test("translates a Paystack 401 into HttpsError(internal) and does NOT create a payments doc", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ status: false, message: "Invalid key" }),
    } as Response);

    await expect(callOk({ amount: 100, currency: "GHS" })).rejects.toMatchObject({
      code: "internal",
    });
    expect(mockPaymentSet).not.toHaveBeenCalled();
  });

  test("translates a Paystack-malformed response into HttpsError(internal)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: true, data: {} /* no authorization_url */ }),
    } as Response);

    await expect(callOk({ amount: 100, currency: "GHS" })).rejects.toMatchObject({
      code: "internal",
    });
    expect(mockPaymentSet).not.toHaveBeenCalled();
  });
});

describe("paystackTopupIntent — staging sandbox bypass", () => {
  const originalEnv = process.env.SANDBOX_ENABLED;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SANDBOX_ENABLED;
    else process.env.SANDBOX_ENABLED = originalEnv;
  });

  test("with SANDBOX_ENABLED + @promoshake.net: skips Paystack, credits wallet, returns sandboxCredited", async () => {
    process.env.SANDBOX_ENABLED = "true";
    // No wallet exists yet -> the bypass creates one with the credited amount.
    mockWalletGet.mockResolvedValue({ exists: false });
    mockTxGet.mockResolvedValue({ exists: false });

    const result = (await callOk({ amount: 100, currency: "GHS" })) as {
      success: boolean;
      sandboxCredited: boolean;
      authorizationUrl: string | null;
      referenceId: string;
    };

    expect(result.success).toBe(true);
    expect(result.sandboxCredited).toBe(true);
    expect(result.authorizationUrl).toBeNull();
    expect(result.referenceId).toBe(`PS_${FIXED_UUID}`);

    // Did NOT call Paystack.
    expect(mockFetch).not.toHaveBeenCalled();
    // Ran the credit transaction.
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    // Wrote the wallet doc (new wallet path, set with the legacy delta).
    const walletSet = mockTxSet.mock.calls.find(
      (c) => typeof (c[1] as Record<string, unknown>)?.available === "number"
    );
    expect(walletSet).toBeDefined();
    expect((walletSet?.[1] as Record<string, unknown>).available).toBe(10000); // 100 GHS at 2 decimals = 10000 legacy units
    expect((walletSet?.[1] as Record<string, unknown>).currency).toBe("GHS");
    // Wrote the payment doc with status='successful' and sandboxMode=true.
    const paymentSet = mockTxSet.mock.calls.find(
      (c) => (c[1] as Record<string, unknown>)?.status === "successful"
    );
    expect(paymentSet).toBeDefined();
    expect((paymentSet?.[1] as Record<string, unknown>).sandboxMode).toBe(true);
    expect((paymentSet?.[1] as Record<string, unknown>).amountMinor).toBe(10000);
    // Wrote a ledger entry.
    const ledgerSet = mockTxSet.mock.calls.find(
      (c) => (c[1] as Record<string, unknown>)?.type === "wallet_topup"
    );
    expect(ledgerSet).toBeDefined();
    expect((ledgerSet?.[1] as Record<string, unknown>).sandboxMode).toBe(true);
  });

  test("with SANDBOX_ENABLED but non-@promoshake.net email: takes the real Paystack branch", async () => {
    process.env.SANDBOX_ENABLED = "true";
    mockPharmacyGet.mockResolvedValue({
      exists: true,
      data: () => ({ email: "real-user@gmail.com", role: "pharmacy" }),
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: true,
        data: {
          authorization_url: "https://checkout.paystack.com/abc",
          reference: `PS_${FIXED_UUID}`,
        },
      }),
    } as Response);

    const result = (await callOk({ amount: 100, currency: "GHS" })) as {
      sandboxCredited?: boolean;
      authorizationUrl: string;
    };
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.sandboxCredited).toBeUndefined();
    expect(result.authorizationUrl).toBe("https://checkout.paystack.com/abc");
  });
});

describe("paystackTopupIntent — happy path", () => {
  test("returns the Paystack authorizationUrl + persists a payments/{ref} doc", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: true,
        data: {
          authorization_url: "https://checkout.paystack.com/abc123",
          reference: `PS_${FIXED_UUID}`,
        },
      }),
    } as Response);

    const result = (await callOk({ amount: 100, currency: "GHS" })) as {
      success: boolean;
      referenceId: string;
      authorizationUrl: string;
    };

    expect(result.success).toBe(true);
    expect(result.authorizationUrl).toBe("https://checkout.paystack.com/abc123");
    expect(result.referenceId).toBe(`PS_${FIXED_UUID}`);

    // Verify the payments doc is created at the right reference and shape.
    expect(mockPaymentDoc).toHaveBeenCalledWith(`PS_${FIXED_UUID}`);
    expect(mockPaymentSet).toHaveBeenCalledTimes(1);
    const payload = mockPaymentSet.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.referenceId).toBe(`PS_${FIXED_UUID}`);
    expect(payload.ownerType).toBe("pharmacy");
    expect(payload.ownerId).toBe("test-uid");
    expect(payload.userId).toBe("test-uid");
    expect(payload.amountMinor).toBe(10000); // 100 GHS at 2 decimals
    expect(payload.displayCurrency).toBe("GHS");
    expect(payload.provider).toBe("paystack");
    expect(payload.status).toBe("pending");
    expect(payload.authorizationUrl).toBe(
      "https://checkout.paystack.com/abc123"
    );
  });

  test("defaults currency to GHS when omitted", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: true,
        data: {
          authorization_url: "https://checkout.paystack.com/abc456",
          reference: `PS_${FIXED_UUID}`,
        },
      }),
    } as Response);

    await callOk({ amount: 50 });
    const payload = mockPaymentSet.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.displayCurrency).toBe("GHS");
  });
});
