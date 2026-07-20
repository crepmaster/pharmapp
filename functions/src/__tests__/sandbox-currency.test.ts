/**
 * sandboxCredit / sandboxDebit — currency-aware money math (E2a).
 *
 * Contract:
 *   - amount IN is major; converted to wallet units at the write boundary
 *     (pharmacy × 100, courier raw major);
 *   - currency derived server-side, never "XAF";
 *   - sandboxCredit: pharmacy-only (courier → COURIER_NOT_ALLOWED), capped
 *     by system_config.currencies[cur].sandboxMaxCreditMajor (major, no
 *     fallback);
 *   - sandboxDebit: pharmacy + courier, bounded ONLY by available balance
 *     (never the credit cap), sufficiency checked in wallet units;
 *   - existing wallet keeps its snapshotted currency but is REFUSED if it
 *     contradicts the owner's currency — never silently corrected;
 *   - ledger `amount` stays major, `walletUnitsDelta` records the converted
 *     delta.
 */
import { jest } from "@jest/globals";

process.env.FUNCTIONS_EMULATOR = "true"; // satisfy isSandboxAllowed()

const incrementMock = jest.fn((n: number) => ({ __op: "increment", n }));

interface FakeDoc {
  exists: boolean;
  data?: Record<string, unknown>;
}
let docs: Map<string, FakeDoc>;
let txWrites: Array<{ op: "set" | "update"; path: string; payload: Record<string, unknown> }>;
let autoId: number;

const makeRef = (path: string) => ({ __path: path, id: path.split("/").pop() });
const pathOfRef = (ref: unknown) => (ref as { __path?: string })?.__path ?? "?";

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

function docHandle(path: string, id: string) {
  return {
    __path: path,
    id,
    get: () => {
      const d = docs.get(path) ?? { exists: false };
      return Promise.resolve({ ...d, data: () => d.data, ref: makeRef(path), id });
    },
    set: (payload: Record<string, unknown>) =>
      txWrites.push({ op: "set", path, payload }),
  };
}

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({
    collection: (col: string) => ({
      doc: (docId?: string) => {
        const id = docId ?? `auto-${col}-${autoId++}`;
        return docHandle(`${col}/${id}`, id);
      },
    }),
    runTransaction: async (fn: any) => {
      const tx = {
        get: (ref: unknown) => {
          const path = pathOfRef(ref);
          const d = docs.get(path) ?? { exists: false };
          return Promise.resolve({ ...d, data: () => d.data, ref: makeRef(path) });
        },
        set: (ref: unknown, payload: Record<string, unknown>) =>
          txWrites.push({ op: "set", path: pathOfRef(ref), payload }),
        update: (ref: unknown, payload: Record<string, unknown>) =>
          txWrites.push({ op: "update", path: pathOfRef(ref), payload }),
      };
      return fn(tx);
    },
  })),
  FieldValue: {
    increment: incrementMock,
    serverTimestamp: jest.fn(() => "ts"),
  },
  Timestamp: {
    fromDate: jest.fn((d: Date) => ({ __date: d })),
    now: jest.fn(() => ({ __ts: "now" })),
  },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("firebase-functions/params", () => ({
  defineSecret: jest.fn(() => ({ value: () => "token" })),
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

import { sandboxCredit, sandboxDebit } from "../index.js";

const SYSCONFIG = {
  countries: { CM: { defaultCurrencyCode: "XAF" }, GH: { defaultCurrencyCode: "GHS" } },
  currencies: {
    XAF: { code: "XAF", enabled: true, decimals: 0, sandboxMaxCreditMajor: 100000 },
    GHS: { code: "GHS", enabled: true, decimals: 2, sandboxMaxCreditMajor: 2000 },
  },
};

const TEST_EMAIL = "sandbox@promoshake.net";

function mockRes() {
  const res: Record<string, unknown> = {};
  res.statusCode = 200;
  res.body = undefined;
  // v2 onRequest wrapper + cors middleware duck-type the response.
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
  res.status = jest.fn((c: number) => {
    res.statusCode = c;
    return res;
  });
  res.json = jest.fn((p: unknown) => {
    res.body = p;
    return res;
  });
  res.send = jest.fn((p: unknown) => {
    res.body = p;
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

const callCredit = (res: unknown, body: Record<string, unknown>) =>
  (sandboxCredit as never as (q: unknown, s: unknown) => Promise<void>)(mockReq(body), res);
const callDebit = (res: unknown, body: Record<string, unknown>) =>
  (sandboxDebit as never as (q: unknown, s: unknown) => Promise<void>)(mockReq(body), res);

function walletIncrement(uid: string): number | undefined {
  const w = txWrites.find(
    (w) => w.path === `wallets/${uid}` && (w.payload.available as { __op?: string })?.__op === "increment"
  );
  return (w?.payload.available as { n?: number })?.n;
}

function ledgerWrite(): Record<string, unknown> | undefined {
  return txWrites.find((w) => w.path.startsWith("ledger/"))?.payload;
}

function noWalletWrite(uid: string) {
  expect(txWrites.find((w) => w.path === `wallets/${uid}`)).toBeUndefined();
}

function seed(entries: Array<[string, FakeDoc]>) {
  autoId = 0;
  txWrites = [];
  docs = new Map<string, FakeDoc>([["system_config/main", { exists: true, data: () => SYSCONFIG } as never], ...entries]);
  // system_config stored with a data() thunk mismatch — normalise:
  docs.set("system_config/main", { exists: true, data: SYSCONFIG });
}

const pharmacyGH = (uid: string): [string, FakeDoc] => [
  `pharmacies/${uid}`,
  { exists: true, data: { email: TEST_EMAIL, countryCode: "GH", userType: "pharmacy" } },
];
const pharmacyCM = (uid: string): [string, FakeDoc] => [
  `pharmacies/${uid}`,
  { exists: true, data: { email: TEST_EMAIL, countryCode: "CM", userType: "pharmacy" } },
];
const courierGH = (uid: string): [string, FakeDoc] => [
  `couriers/${uid}`,
  { exists: true, data: { email: TEST_EMAIL, countryCode: "GH", userType: "courier" } },
];
const usersRole = (uid: string, role: string): [string, FakeDoc] => [
  `users/${uid}`,
  { exists: true, data: { role } },
];
const wallet = (uid: string, currency: string, available: number): [string, FakeDoc] => [
  `wallets/${uid}`,
  { exists: true, data: { available, held: 0, deducted: 0, currency } },
];

beforeEach(() => jest.clearAllMocks());

describe("sandboxCredit — pharmacy conversion + cap", () => {
  test("GH pharmacy credit 50 → available += 5000, ledger amount 50 major", async () => {
    seed([usersRole("p1", "pharmacy"), pharmacyGH("p1")]); // wallet absent → created
    const res = mockRes();
    await callCredit(res, { userId: "p1", amount: 50 });
    expect(res.statusCode).toBe(200);
    expect(walletIncrement("p1")).toBe(5000);
    const l = ledgerWrite();
    expect(l?.amount).toBe(50);
    expect(l?.walletUnitsDelta).toBe(5000);
    expect(l?.currency).toBe("GHS");
  });

  test("CM pharmacy credit 5000 → available += 500000", async () => {
    seed([usersRole("p2", "pharmacy"), pharmacyCM("p2"), wallet("p2", "XAF", 0)]);
    const res = mockRes();
    await callCredit(res, { userId: "p2", amount: 5000 });
    expect(walletIncrement("p2")).toBe(500000);
  });

  test("absent wallet is created in the derived currency (GHS)", async () => {
    seed([usersRole("p3", "pharmacy"), pharmacyGH("p3")]);
    const res = mockRes();
    await callCredit(res, { userId: "p3", amount: 10 });
    const walletSet = txWrites.find((w) => w.path === "wallets/p3" && w.op === "set");
    expect((walletSet?.payload as { currency?: string })?.currency).toBe("GHS");
  });

  test("courier credit → COURIER_NOT_ALLOWED, no write (F1b preserved)", async () => {
    seed([usersRole("c1", "courier"), courierGH("c1")]);
    const res = mockRes();
    await callCredit(res, { userId: "c1", amount: 50 });
    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string })?.code).toBe("COURIER_NOT_ALLOWED");
    noWalletWrite("c1");
  });

  test("amount over the GHS cap (2000) → refused, no write", async () => {
    seed([usersRole("p4", "pharmacy"), pharmacyGH("p4"), wallet("p4", "GHS", 0)]);
    const res = mockRes();
    await callCredit(res, { userId: "p4", amount: 2001 });
    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string })?.code).toBe("AMOUNT_TOO_HIGH");
    noWalletWrite("p4");
  });

  test("amount exactly at the cap (2000 GHS) → allowed", async () => {
    seed([usersRole("p5", "pharmacy"), pharmacyGH("p5"), wallet("p5", "GHS", 0)]);
    const res = mockRes();
    await callCredit(res, { userId: "p5", amount: 2000 });
    expect(res.statusCode).toBe(200);
    expect(walletIncrement("p5")).toBe(200000);
  });

  test("cap missing for the currency → config error, no write", async () => {
    // A currency without sandboxMaxCreditMajor must not silently allow credit.
    const noCapConfig = {
      ...SYSCONFIG,
      currencies: { GHS: { code: "GHS", enabled: true, decimals: 2 } },
    };
    seed([usersRole("p6", "pharmacy"), pharmacyGH("p6")]);
    docs.set("system_config/main", { exists: true, data: noCapConfig });
    const res = mockRes();
    await callCredit(res, { userId: "p6", amount: 50 });
    expect(res.statusCode).toBe(422);
    noWalletWrite("p6");
  });

  test("existing wallet whose currency contradicts the owner → refused, no write", async () => {
    // GH pharmacy but wallet somehow labelled XAF: never silently corrected.
    seed([usersRole("p7", "pharmacy"), pharmacyGH("p7"), wallet("p7", "XAF", 0)]);
    const res = mockRes();
    await callCredit(res, { userId: "p7", amount: 50 });
    expect(res.statusCode).toBe(409);
    // No available-increment write survives the thrown transaction.
    expect(walletIncrement("p7")).toBeUndefined();
  });

  test("never defaults to XAF for a GH pharmacy", async () => {
    seed([usersRole("p8", "pharmacy"), pharmacyGH("p8")]);
    const res = mockRes();
    await callCredit(res, { userId: "p8", amount: 10 });
    expect((res.body as { currency?: string })?.currency).toBe("GHS");
  });
});

describe("sandboxDebit — owner-type conversion, no cap, balance in wallet units", () => {
  test("GH pharmacy debit 20 → available -= 2000", async () => {
    seed([usersRole("p1", "pharmacy"), pharmacyGH("p1"), wallet("p1", "GHS", 5000)]);
    const res = mockRes();
    await callDebit(res, { userId: "p1", amount: 20 });
    expect(res.statusCode).toBe(200);
    expect(walletIncrement("p1")).toBe(-2000);
  });

  test("GH courier debit 50 → available -= 50 (raw major, NOT ×100)", async () => {
    seed([usersRole("c1", "courier"), courierGH("c1"), wallet("c1", "GHS", 1000)]);
    const res = mockRes();
    await callDebit(res, { userId: "c1", amount: 50 });
    expect(res.statusCode).toBe(200);
    expect(walletIncrement("c1")).toBe(-50);
  });

  test("insufficient balance checked in wallet units → refused, no write", async () => {
    // pharmacy wallet available 1999 WU, debit 20 major = 2000 WU → refuse.
    seed([usersRole("p2", "pharmacy"), pharmacyGH("p2"), wallet("p2", "GHS", 1999)]);
    const res = mockRes();
    await callDebit(res, { userId: "p2", amount: 20 });
    expect(res.statusCode).not.toBe(200);
    expect(walletIncrement("p2")).toBeUndefined();
  });

  test("debit is NOT bounded by the credit cap", async () => {
    // Debit 3000 GHS (> credit cap 2000) succeeds if balance allows.
    seed([usersRole("p3", "pharmacy"), pharmacyGH("p3"), wallet("p3", "GHS", 1000000)]);
    const res = mockRes();
    await callDebit(res, { userId: "p3", amount: 3000 });
    expect(res.statusCode).toBe(200);
    expect(walletIncrement("p3")).toBe(-300000);
  });

  test("wallet currency mismatch → refused, no write", async () => {
    seed([usersRole("p4", "pharmacy"), pharmacyGH("p4"), wallet("p4", "XAF", 100000)]);
    const res = mockRes();
    await callDebit(res, { userId: "p4", amount: 20 });
    expect(res.statusCode).toBe(409);
    expect(walletIncrement("p4")).toBeUndefined();
  });

  test("ledger keeps amount major, walletUnitsDelta negative", async () => {
    seed([usersRole("p5", "pharmacy"), pharmacyGH("p5"), wallet("p5", "GHS", 5000)]);
    const res = mockRes();
    await callDebit(res, { userId: "p5", amount: 20 });
    const l = ledgerWrite();
    expect(l?.amount).toBe(20);
    expect(l?.walletUnitsDelta).toBe(-2000);
  });
});

describe("sandbox — no lost update under concurrency", () => {
  test("two concurrent credits both apply as separate increments", async () => {
    // Each credit uses FieldValue.increment, so two distinct calls produce
    // two increments — neither overwrites the other. This proves no lost
    // update; it does NOT claim retry idempotence (there is none).
    seed([usersRole("p1", "pharmacy"), pharmacyGH("p1"), wallet("p1", "GHS", 0)]);
    const res1 = mockRes();
    const res2 = mockRes();
    await Promise.all([
      callCredit(res1, { userId: "p1", amount: 10 }),
      callCredit(res2, { userId: "p1", amount: 30 }),
    ]);
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    const increments = txWrites
      .filter((w) => w.path === "wallets/p1" && (w.payload.available as { __op?: string })?.__op === "increment")
      .map((w) => (w.payload.available as { n?: number }).n);
    expect(increments).toContain(1000); // 10 × 100
    expect(increments).toContain(3000); // 30 × 100
    expect(increments).toHaveLength(2); // both preserved, no overwrite
  });
});
