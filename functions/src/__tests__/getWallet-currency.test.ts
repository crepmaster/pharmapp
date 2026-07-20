/**
 * getWallet — currency derivation on wallet creation.
 *
 * Two invariants, in tension, both asserted here:
 *
 *   1. An EXISTING wallet is returned untouched. Its balances and history
 *      are denominated in the currency stored on it; re-deriving would risk
 *      silently re-denominating value (10000 XAF is not 10000 GHS). Even a
 *      wallet whose currency contradicts its owner's country is left alone
 *      — that is a data-repair matter, not a read-path fix.
 *
 *   2. An ABSENT wallet is created in the currency derived from its owner,
 *      or NOT AT ALL. `walletInit()` used to default to XAF regardless of
 *      country, so opening the dashboard minted a Ghanaian pharmacy an XAF
 *      wallet.
 */
import { jest } from "@jest/globals";

const mockSet = jest.fn(async () => undefined);
const mockTxSet = jest.fn();
const mockTxGet = jest.fn();
const mockRunTransaction = jest.fn(async (cb: never) =>
  (cb as unknown as (tx: unknown) => Promise<unknown>)({
    get: mockTxGet,
    set: mockTxSet,
  })
);

/** Per-path document store: `"collection/doc"` -> data, or undefined. */
let docs: Record<string, unknown> = {};

const mockCollection = jest.fn((name: string) => ({
  doc: jest.fn((id: string) => ({
    id: id ?? "generated",
    path: `${name}/${id}`,
    get: jest.fn(async () => {
      const data = docs[`${name}/${id}`];
      return data === undefined
        ? { exists: false, data: () => undefined }
        : { exists: true, data: () => data };
    }),
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

jest.mock("../lib/auth.js", () => ({
  requireAuth: jest.fn(async () => "owner-uid"),
}));

jest.mock("firebase-functions/params", () => ({
  defineSecret: jest.fn(() => ({ value: () => "token" })),
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("firebase-admin/auth", () => ({
  getAuth: jest.fn(() => ({
    createUser: jest.fn(),
    deleteUser: jest.fn(),
    getUserByEmail: jest.fn(),
    setCustomUserClaims: jest.fn(),
    verifyIdToken: jest.fn(),
  })),
}));

import { getWallet } from "../index.js";

const SYSCONFIG = {
  countries: { CM: { defaultCurrencyCode: "XAF" }, GH: { defaultCurrencyCode: "GHS" } },
  currencies: {
    XAF: { code: "XAF", enabled: true, decimals: 0 },
    GHS: { code: "GHS", enabled: true, decimals: 2 },
  },
};

function mockRes() {
  const res: Record<string, unknown> = {};
  res.statusCode = 200;
  res.body = undefined;
  res.on = jest.fn(() => res);
  res.once = jest.fn(() => res);
  res.emit = jest.fn(() => false);
  res.removeListener = jest.fn(() => res);
  res.end = jest.fn(() => res);
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

const req = () => ({
  method: "GET",
  headers: {},
  query: {},
  get: jest.fn(() => undefined),
  ip: "127.0.0.1",
});

const call = (res: unknown) =>
  (getWallet as never as (q: unknown, s: unknown) => Promise<void>)(req(), res);

function nothingWasWritten() {
  expect(mockSet).not.toHaveBeenCalled();
  expect(mockTxSet).not.toHaveBeenCalled();
  expect(mockRunTransaction).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  docs = {};
  mockTxGet.mockResolvedValue({ exists: false, data: () => undefined } as never);
});

describe("getWallet — existing wallet is never touched", () => {
  test("returns the stored wallet as-is", async () => {
    docs["wallets/owner-uid"] = { available: 5000, held: 0, currency: "GHS" };
    const res = mockRes();
    await call(res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ available: 5000, currency: "GHS" });
    nothingWasWritten();
  });

  test("a wallet whose currency contradicts its country is LEFT ALONE", async () => {
    // The exact production case: a Ghanaian courier holding an XAF wallet.
    // getWallet must report XAF, not silently re-label it GHS — the balance
    // is denominated in the stored currency.
    docs["wallets/owner-uid"] = { available: 10000, held: 0, currency: "XAF" };
    docs["users/owner-uid"] = { role: "courier" };
    docs["couriers/owner-uid"] = { countryCode: "GH" };
    docs["system_config/main"] = SYSCONFIG;

    const res = mockRes();
    await call(res);

    expect(res.body).toMatchObject({ currency: "XAF", available: 10000 });
    nothingWasWritten();
  });

  test("does not even resolve the currency when the wallet exists", async () => {
    // Guards the read path's cost: no owner/config reads on the hot path.
    docs["wallets/owner-uid"] = { available: 0, held: 0, currency: "XAF" };
    const res = mockRes();
    await call(res);
    const paths = mockCollection.mock.calls.map((c) => c[0]);
    expect(paths).not.toContain("users");
    expect(paths).not.toContain("system_config");
  });
});

describe("getWallet — absent wallet is created in the derived currency", () => {
  test("Ghanaian courier gets a GHS wallet, not XAF", async () => {
    docs["users/owner-uid"] = { role: "courier" };
    docs["couriers/owner-uid"] = { countryCode: "GH" };
    docs["system_config/main"] = SYSCONFIG;

    const res = mockRes();
    await call(res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ currency: "GHS", available: 0, held: 0 });
    expect(mockTxSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ currency: "GHS" })
    );
  });

  test("Cameroonian pharmacy gets an XAF wallet", async () => {
    docs["users/owner-uid"] = { role: "pharmacy" };
    docs["pharmacies/owner-uid"] = { countryCode: "CM" };
    docs["system_config/main"] = SYSCONFIG;

    const res = mockRes();
    await call(res);

    expect(res.body).toMatchObject({ currency: "XAF" });
  });
});

describe("getWallet — unresolvable currency writes nothing", () => {
  test("owner has no profile document → refuses, no write", async () => {
    docs["system_config/main"] = SYSCONFIG;
    const res = mockRes();
    await call(res);
    expect(res.statusCode).toBe(404);
    nothingWasWritten();
  });

  test("owner has no countryCode → refuses, no write", async () => {
    docs["users/owner-uid"] = { role: "courier" };
    docs["couriers/owner-uid"] = { fullName: "No Country" };
    docs["system_config/main"] = SYSCONFIG;
    const res = mockRes();
    await call(res);
    expect(res.statusCode).toBe(422);
    nothingWasWritten();
  });

  test("country unknown to system_config → refuses, no write", async () => {
    docs["users/owner-uid"] = { role: "courier" };
    docs["couriers/owner-uid"] = { countryCode: "ZZ" };
    docs["system_config/main"] = SYSCONFIG;
    const res = mockRes();
    await call(res);
    expect(res.statusCode).toBe(422);
    nothingWasWritten();
  });

  test("system_config missing → 503, no write", async () => {
    docs["users/owner-uid"] = { role: "courier" };
    docs["couriers/owner-uid"] = { countryCode: "GH" };
    const res = mockRes();
    await call(res);
    expect(res.statusCode).toBe(503);
    nothingWasWritten();
  });

  test("admin owner → refuses, no wallet minted", async () => {
    docs["users/owner-uid"] = { role: "admin" };
    docs["system_config/main"] = SYSCONFIG;
    const res = mockRes();
    await call(res);
    expect(res.statusCode).toBe(422);
    nothingWasWritten();
  });

  test("never falls back to XAF in any refusal response", async () => {
    docs["users/owner-uid"] = { role: "courier" };
    docs["couriers/owner-uid"] = { countryCode: "ZZ" };
    docs["system_config/main"] = SYSCONFIG;
    const res = mockRes();
    await call(res);
    expect(JSON.stringify(res.body)).not.toContain("XAF");
  });
});

describe("getWallet — concurrent first-time reads", () => {
  test("loser of the race returns the winner's wallet instead of overwriting", async () => {
    // Both callers saw "no wallet" outside the transaction. Inside it, the
    // second one re-reads and finds the wallet the first just committed.
    // Without the re-read, it would clobber a wallet that may already have
    // been credited.
    docs["users/owner-uid"] = { role: "courier" };
    docs["couriers/owner-uid"] = { countryCode: "GH" };
    docs["system_config/main"] = SYSCONFIG;

    const winnersWallet = { available: 250, held: 0, currency: "GHS" };
    mockTxGet.mockResolvedValue({ exists: true, data: () => winnersWallet } as never);

    const res = mockRes();
    await call(res);

    expect(mockTxSet).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ available: 250, currency: "GHS" });
  });

  test("winner of the race does write, inside the transaction", async () => {
    // Contrast case: proves the guard above is a real branch, not a
    // permanently-disabled write path.
    docs["users/owner-uid"] = { role: "courier" };
    docs["couriers/owner-uid"] = { countryCode: "GH" };
    docs["system_config/main"] = SYSCONFIG;
    mockTxGet.mockResolvedValue({ exists: false, data: () => undefined } as never);

    const res = mockRes();
    await call(res);

    expect(mockTxSet).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({ currency: "GHS", available: 0 });
  });

  test("creation happens in a transaction, never a bare set()", async () => {
    docs["users/owner-uid"] = { role: "pharmacy" };
    docs["pharmacies/owner-uid"] = { countryCode: "CM" };
    docs["system_config/main"] = SYSCONFIG;

    const res = mockRes();
    await call(res);

    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockSet).not.toHaveBeenCalled(); // the old non-atomic path
  });
});
