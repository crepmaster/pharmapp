/**
 * Endpoint-level proof that the semantic currency gate refuses BEFORE any
 * Firestore write.
 *
 * Context: `validators.currency` was narrowed to a syntactic ISO 4217 check
 * (3 uppercase letters), which by design lets `ZZZ` through. The guarantee
 * that unsupported currencies never reach money-moving code therefore has
 * to live in the endpoints. These tests are that guarantee.
 *
 * `createExchangeHold` matters most here: it is not a "pending doc" writer,
 * it debits `available` and credits `held` on two wallets and appends two
 * ledger entries. A currency it does not understand must die before the
 * transaction opens.
 *
 * Scope limit (deliberate): these tests prove "is this currency configured
 * and enabled?". They do NOT prove "does this currency match the owner's
 * country" — that needs the generic wallet-owner resolver and lands in a
 * follow-up commit.
 */
import { jest } from "@jest/globals";

const mockSet = jest.fn(async () => undefined);
const mockRunTransaction = jest.fn(async () => undefined);
const mockSysConfigGet = jest.fn();

// `system_config/main` is the only doc these tests read. Everything else
// resolves to a doc stub whose set() we watch to prove non-writing.
const mockCollection = jest.fn((name: string) => ({
  doc: jest.fn(() => ({
    id: "generated-doc-id",
    get: name === "system_config" ? mockSysConfigGet : jest.fn(async () => ({ exists: false })),
    set: mockSet,
  })),
}));

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
  Timestamp: { fromDate: jest.fn((d: Date) => ({ __date: d })) },
}));

// Auth is orthogonal to what we assert; always resolve to a caller who is
// a legitimate participant of the exchange under test.
jest.mock("../lib/auth.js", () => ({
  requireAuth: jest.fn(async () => "pharmacyA"),
}));

jest.mock("firebase-functions/params", () => ({
  defineSecret: jest.fn(() => ({ value: () => "token" })),
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Importing `../index.js` pulls in all 40+ re-exported modules, several of
// which call getAuth()/getFirestore() at module scope. Stubbed so the
// import resolves; none of it is exercised by these tests.
jest.mock("firebase-admin/auth", () => ({
  getAuth: jest.fn(() => ({
    createUser: jest.fn(),
    deleteUser: jest.fn(),
    getUserByEmail: jest.fn(),
    setCustomUserClaims: jest.fn(),
    verifyIdToken: jest.fn(),
  })),
}));

import { topupIntent, createExchangeHold } from "../index.js";

const SYSCONFIG = {
  currencies: {
    XAF: { code: "XAF", enabled: true, decimals: 0 },
    GHS: { code: "GHS", enabled: true, decimals: 2 },
    XOF: { code: "XOF", enabled: true, decimals: 0 },
    KES: { code: "KES", enabled: false, decimals: 2 }, // configured but off
    NGN: { code: "NGN", decimals: 2 },                 // `enabled` missing
  },
};

function mockRes() {
  const res: Record<string, unknown> = {};
  res.statusCode = 200;
  res.body = undefined;
  // The v2 onRequest wrapper subscribes to response lifecycle events before
  // invoking the handler; without these it throws `res.on is not a function`.
  res.on = jest.fn(() => res);
  res.once = jest.fn(() => res);
  res.emit = jest.fn(() => false);
  res.removeListener = jest.fn(() => res);
  res.end = jest.fn(() => res);
  // `cors: true` on topupIntent runs the cors middleware, which duck-types
  // the response via getHeader/setHeader (see vary/index.js).
  const headers: Record<string, unknown> = {};
  res.getHeader = jest.fn((k: string) => headers[k]);
  res.setHeader = jest.fn((k: string, v: unknown) => {
    headers[k] = v;
    return res;
  });
  res.removeHeader = jest.fn((k: string) => {
    delete headers[k];
    return res;
  });
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((payload: unknown) => {
    res.body = payload;
    return res;
  });
  res.send = jest.fn((payload: unknown) => {
    res.body = payload;
    return res;
  });
  return res;
}

function mockReq(body: Record<string, unknown>) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    get: jest.fn(() => undefined),
    ip: "127.0.0.1",
    query: {},
  };
}

function sysConfigPresent() {
  mockSysConfigGet.mockResolvedValue({ exists: true, data: () => SYSCONFIG } as never);
}

function sysConfigAbsent() {
  mockSysConfigGet.mockResolvedValue({ exists: false, data: () => undefined } as never);
}

function sysConfigThrows() {
  mockSysConfigGet.mockRejectedValue(new Error("deadline exceeded") as never);
}

function noMoneyWasMoved() {
  expect(mockRunTransaction).not.toHaveBeenCalled();
  expect(mockSet).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("topupIntent — semantic currency gate", () => {
  const base = { userId: "pharmacyA", method: "mtn_momo", amount: 5000 };

  test("accepts GHS when configured and enabled", async () => {
    sysConfigPresent();
    const res = mockRes();
    await (topupIntent as never as (q: unknown, s: unknown) => Promise<void>)(
      mockReq({ ...base, currency: "GHS" }), res
    );
    expect(res.statusCode).toBe(201);
    expect(mockSet).toHaveBeenCalled(); // payment intent written
  });

  test("accepts XOF when configured and enabled", async () => {
    sysConfigPresent();
    const res = mockRes();
    await (topupIntent as never as (q: unknown, s: unknown) => Promise<void>)(
      mockReq({ ...base, currency: "XOF" }), res
    );
    expect(res.statusCode).toBe(201);
  });

  test("refuses ZZZ — well-formed but absent from system_config — before writing", async () => {
    sysConfigPresent();
    const res = mockRes();
    await (topupIntent as never as (q: unknown, s: unknown) => Promise<void>)(
      mockReq({ ...base, currency: "ZZZ" }), res
    );
    expect(res.statusCode).toBe(422);
    noMoneyWasMoved();
  });

  test("refuses a configured but disabled currency", async () => {
    sysConfigPresent();
    const res = mockRes();
    await (topupIntent as never as (q: unknown, s: unknown) => Promise<void>)(
      mockReq({ ...base, currency: "KES" }), res
    );
    expect(res.statusCode).toBe(422);
    noMoneyWasMoved();
  });

  test("refuses a currency whose `enabled` flag is missing", async () => {
    sysConfigPresent();
    const res = mockRes();
    await (topupIntent as never as (q: unknown, s: unknown) => Promise<void>)(
      mockReq({ ...base, currency: "NGN" }), res
    );
    expect(res.statusCode).toBe(422);
    noMoneyWasMoved();
  });

  test("answers 503 — not 422 — when system_config is unreadable", async () => {
    // Server-side fault: the client's request is well-formed and should be
    // retried, so this must not look like a permanent input error.
    sysConfigAbsent();
    const res = mockRes();
    await (topupIntent as never as (q: unknown, s: unknown) => Promise<void>)(
      mockReq({ ...base, currency: "XAF" }), res
    );
    expect(res.statusCode).toBe(503);
    noMoneyWasMoved();
  });

  test("never leaks the underlying failure to the client", async () => {
    sysConfigThrows();
    const res = mockRes();
    await (topupIntent as never as (q: unknown, s: unknown) => Promise<void>)(
      mockReq({ ...base, currency: "XAF" }), res
    );
    expect(res.statusCode).toBe(503);
    const body = JSON.stringify(res.body ?? {});
    expect(body).not.toContain("deadline exceeded");
    expect(body).toContain("config_unavailable");
    noMoneyWasMoved();
  });

  test("refuses a malformed currency before reading system_config", async () => {
    sysConfigPresent();
    const res = mockRes();
    await (topupIntent as never as (q: unknown, s: unknown) => Promise<void>)(
      mockReq({ ...base, currency: "ghs" }), res
    );
    expect(res.statusCode).toBe(400);
    expect(mockSysConfigGet).not.toHaveBeenCalled();
    noMoneyWasMoved();
  });
});

describe("createExchangeHold — semantic currency gate", () => {
  // This endpoint moves money. Every refusal below must happen before the
  // transaction that debits `available` and credits `held`.
  const base = { aId: "pharmacyA", bId: "pharmacyB", courierFee: 3000 };

  test("refuses ZZZ before opening the wallet transaction", async () => {
    sysConfigPresent();
    const res = mockRes();
    await (createExchangeHold as never as (q: unknown, s: unknown) => Promise<void>)(
      mockReq({ ...base, currency: "ZZZ" }), res
    );
    expect(res.statusCode).toBe(422);
    noMoneyWasMoved();
  });

  test("refuses a configured but disabled currency before any hold", async () => {
    sysConfigPresent();
    const res = mockRes();
    await (createExchangeHold as never as (q: unknown, s: unknown) => Promise<void>)(
      mockReq({ ...base, currency: "KES" }), res
    );
    expect(res.statusCode).toBe(422);
    noMoneyWasMoved();
  });

  test("refuses a currency whose `enabled` flag is missing, before any hold", async () => {
    sysConfigPresent();
    const res = mockRes();
    await (createExchangeHold as never as (q: unknown, s: unknown) => Promise<void>)(
      mockReq({ ...base, currency: "NGN" }), res
    );
    expect(res.statusCode).toBe(422);
    noMoneyWasMoved();
  });

  test("answers 503 when system_config is unreadable, without opening the transaction", async () => {
    sysConfigAbsent();
    const res = mockRes();
    await (createExchangeHold as never as (q: unknown, s: unknown) => Promise<void>)(
      mockReq({ ...base, currency: "GHS" }), res
    );
    expect(res.statusCode).toBe(503);
    noMoneyWasMoved();
  });

  test("answers 503 when Firestore throws, without opening the transaction", async () => {
    sysConfigThrows();
    const res = mockRes();
    await (createExchangeHold as never as (q: unknown, s: unknown) => Promise<void>)(
      mockReq({ ...base, currency: "GHS" }), res
    );
    expect(res.statusCode).toBe(503);
    noMoneyWasMoved();
  });

  test("refuses a malformed currency before reading system_config", async () => {
    sysConfigPresent();
    const res = mockRes();
    await (createExchangeHold as never as (q: unknown, s: unknown) => Promise<void>)(
      mockReq({ ...base, currency: "xaf" }), res
    );
    expect(res.statusCode).toBe(400);
    expect(mockSysConfigGet).not.toHaveBeenCalled();
    noMoneyWasMoved();
  });

  test("lets a configured currency through the gate to the business logic", async () => {
    // Proof the gate is not blanket-denying: GHS reaches the transaction.
    sysConfigPresent();
    const res = mockRes();
    await (createExchangeHold as never as (q: unknown, s: unknown) => Promise<void>)(
      mockReq({ ...base, currency: "GHS" }), res
    );
    expect(res.statusCode).not.toBe(422);
    expect(mockRunTransaction).toHaveBeenCalled();
  });
});
