/**
 * Wallet-unit locks for the proposal-path pharmacy mutations.
 *
 * completeExchangeDelivery-wallet-units.test.ts already locks the three
 * mutation SHAPES at settlement (decrement deducted, decrement available,
 * increment available). This file locks the two remaining proposal-path
 * callables that move a pharmacy wallet:
 *
 *   - acceptExchangeProposal: held → deducted (walletReserved × 100)
 *   - cancelExchangeProposal: held → available release (walletReserved × 100)
 *
 * The reservation itself (createExchangeProposal) and the medicine-request
 * bridge share the identical `majorToWalletUnits(x, "pharmacy")` boundary
 * call; the settlement + these two prove every held/deducted/available
 * shape converts.
 *
 * Business docs keep walletReserved in MAJOR; only the wallet write is
 * converted. Ledger `amount` stays major.
 */
import { jest } from "@jest/globals";

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

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({
    collection: (col: string) => ({
      doc: (docId?: string) => {
        const id = docId ?? `auto-${col}-${autoId++}`;
        const path = `${col}/${id}`;
        return {
          __path: path,
          id,
          get: () => {
            const d = docs.get(path) ?? { exists: false };
            return Promise.resolve({ ...d, data: () => d.data, ref: makeRef(path), id });
          },
        };
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
    delete: jest.fn(() => "delete"),
  },
  Timestamp: { now: jest.fn(() => ({ __ts: "now" })) },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// License gate is orthogonal to wallet units; allow it through.
jest.mock("../lib/licenseGate.js", () => ({
  assertLicenseAllowsMarketplace: jest.fn(async () => undefined),
  PROTECTED_LICENSE_FIELDS: [],
}));

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();
import { acceptExchangeProposal } from "../acceptExchangeProposal.js";
import { cancelExchangeProposal } from "../cancelExchangeProposal.js";
const wrappedAccept = testFns.wrap(acceptExchangeProposal);
const wrappedCancel = testFns.wrap(cancelExchangeProposal);
afterAll(() => testFns.cleanup());

const BUYER = "buyer-uid"; // fromPharmacyId
const SELLER = "seller-uid"; // toPharmacyId
const PROPOSAL_ID = "p-1";
const INVENTORY_ID = "inv-1";
const RESERVED = 500; // major
const X = 100;

function proposalDoc() {
  return {
    exists: true,
    data: {
      proposalId: PROPOSAL_ID,
      fromPharmacyId: BUYER,
      toPharmacyId: SELLER,
      status: "pending",
      inventoryItemId: INVENTORY_ID,
      // Phase 2 — server-derived authoritative currency snapshot (new proposals
      // carry it; accept revalidates against it).
      currencyCode: "GHS",
      reservations: { walletReserved: RESERVED },
      details: { type: "purchase", totalPrice: RESERVED, currency: "GHS", quantity: 5 },
    },
  };
}

function seedCommon() {
  autoId = 0;
  txWrites = [];
  docs = new Map<string, FakeDoc>([
    [`exchange_proposals/${PROPOSAL_ID}`, proposalDoc()],
    [`wallets/${BUYER}`, { exists: true, data: { available: 100000, held: RESERVED * X, deducted: 0, currency: "GHS" } }],
    // Phase 2 — seller wallet + cityCode on both parties so the accept-path
    // trade-currency guard (wired next) passes for these wallet-unit locks.
    [`wallets/${SELLER}`, { exists: true, data: { available: 0, held: 0, deducted: 0, currency: "GHS" } }],
    [`pharmacies/${BUYER}`, { exists: true, data: { countryCode: "GH", cityCode: "accra", email: "b@x.com" } }],
    [`pharmacies/${SELLER}`, { exists: true, data: { countryCode: "GH", cityCode: "accra", email: "s@x.com" } }],
    [
      `system_config/main`,
      {
        exists: true,
        data: {
          countries: { GH: { defaultCurrencyCode: "GHS", licenseRequired: false, enabled: true } },
          currencies: { GHS: { code: "GHS", enabled: true, decimals: 2 } },
        },
      },
    ],
    [
      `pharmacy_inventory/${INVENTORY_ID}`,
      {
        exists: true,
        data: {
          pharmacyId: SELLER,
          medicineId: "amox",
          medicineName: "Amoxicillin",
          medicineDosage: "500mg",
          medicineForm: "Capsule",
          availableQuantity: 50,
          reservedQuantity: 0,
          batch: { lotNumber: "L1", expirationDate: null },
        },
      },
    ],
  ]);
}

function incrementFor(path: string, field: string): number | undefined {
  const w = txWrites.find(
    (w) =>
      w.path === path &&
      (w.payload[field] as { __op?: string })?.__op === "increment"
  );
  return (w?.payload[field] as { n?: number })?.n;
}

beforeEach(seedCommon);

describe("cancelExchangeProposal — release in legacy pharmacy units", () => {
  const callCancel = () =>
    wrappedCancel({
      data: { proposalId: PROPOSAL_ID },
      auth: { uid: BUYER, token: {} },
    } as never);

  test("available is credited walletReserved × 100", async () => {
    await callCancel();
    expect(incrementFor(`wallets/${BUYER}`, "available")).toBe(RESERVED * X);
  });

  test("held is debited walletReserved × 100", async () => {
    await callCancel();
    expect(incrementFor(`wallets/${BUYER}`, "held")).toBe(-RESERVED * X);
  });
});

describe("legacy proposal (no currency snapshot) — accept refused, cancel still works", () => {
  // D2 contract: a proposal created before Phase 2 has no `currencyCode`
  // snapshot. It can no longer be ACCEPTED (value transfer, strict revalidation)
  // but must still be CANCELLABLE (exit/compensation, never blocked).
  function seedLegacy() {
    seedCommon();
    const p = docs.get(`exchange_proposals/${PROPOSAL_ID}`)!;
    const data = { ...(p.data as Record<string, unknown>) };
    delete data.currencyCode;
    docs.set(`exchange_proposals/${PROPOSAL_ID}`, { exists: true, data });
  }

  test("accept → refused with CURRENCY_SNAPSHOT_MISSING", async () => {
    seedLegacy();
    await expect(
      wrappedAccept({
        data: { proposalId: PROPOSAL_ID },
        auth: { uid: SELLER, token: {} },
      } as never)
    ).rejects.toMatchObject({ details: { code: "CURRENCY_SNAPSHOT_MISSING" } });
  });

  test("cancel → still releases the reservation exactly (compensation non-blocking)", async () => {
    seedLegacy();
    await wrappedCancel({
      data: { proposalId: PROPOSAL_ID },
      auth: { uid: BUYER, token: {} },
    } as never);
    expect(incrementFor(`wallets/${BUYER}`, "available")).toBe(RESERVED * X);
    expect(incrementFor(`wallets/${BUYER}`, "held")).toBe(-RESERVED * X);
  });
});

describe("acceptExchangeProposal — held → deducted in legacy pharmacy units", () => {
  const callAccept = () =>
    wrappedAccept({
      data: { proposalId: PROPOSAL_ID },
      auth: { uid: SELLER, token: {} },
    } as never);

  test("held is debited walletReserved × 100", async () => {
    await callAccept();
    expect(incrementFor(`wallets/${BUYER}`, "held")).toBe(-RESERVED * X);
  });

  test("deducted is credited walletReserved × 100", async () => {
    await callAccept();
    expect(incrementFor(`wallets/${BUYER}`, "deducted")).toBe(RESERVED * X);
  });
});

// ===========================================================================
// createExchangeProposal — purchase reserve wallet-unit lock
// ===========================================================================
import { createExchangeProposal } from "../createExchangeProposal.js";
const wrappedReserve = testFns.wrap(createExchangeProposal);

const RESV_INV_ID = "resv-inv";
const RESERVE_MAJOR = 50;
const RESERVE_WU = RESERVE_MAJOR * 100; // 5000

function seedReserve(buyerAvailable: number) {
  autoId = 0;
  txWrites = [];
  docs = new Map<string, FakeDoc>([
    [`wallets/${BUYER}`, { exists: true, data: { available: buyerAvailable, held: 0, deducted: 0, currency: "GHS" } }],
    // Phase 2 — seller wallet must exist and match the derived currency (D4).
    [`wallets/${SELLER}`, { exists: true, data: { available: 0, held: 0, deducted: 0, currency: "GHS" } }],
    [
      `pharmacies/${BUYER}`,
      {
        exists: true,
        data: {
          countryCode: "GH",
          cityCode: "accra",
          city: "Accra",
          subscriptionStatus: "active",
          licenseStatus: "verified",
        },
      },
    ],
    [`pharmacies/${SELLER}`, { exists: true, data: { countryCode: "GH", cityCode: "accra", city: "Accra" } }],
    [
      `system_config/main`,
      {
        exists: true,
        data: {
          countries: { GH: { defaultCurrencyCode: "GHS", licenseRequired: false, enabled: true } },
          currencies: { GHS: { code: "GHS", enabled: true, decimals: 2 } },
        },
      },
    ],
    [
      `pharmacy_inventory/${RESV_INV_ID}`,
      {
        exists: true,
        data: {
          pharmacyId: SELLER,
          medicineId: "amox",
          medicineName: "Amoxicillin",
          medicineDosage: "500mg",
          medicineForm: "Capsule",
          availableQuantity: 50,
          packaging: "box",
          batch: { lotNumber: "L1", expirationDate: null },
          availabilitySettings: { availableForExchange: true },
        },
      },
    ],
  ]);
}

function callReserve() {
  return wrappedReserve({
    data: {
      inventoryItemId: RESV_INV_ID,
      fromPharmacyId: BUYER,
      toPharmacyId: SELLER,
      details: {
        type: "purchase",
        quantity: 5,
        totalPrice: RESERVE_MAJOR,
        currency: "GHS",
        pricePerUnit: 10,
      },
    },
    auth: { uid: BUYER, token: {} },
  } as never);
}

describe("createExchangeProposal — purchase reserve wallet-unit lock", () => {
  test("insufficient: available 4999 < 5000 WU (50 major × 100) → throws, no reservation", async () => {
    seedReserve(RESERVE_WU - 1);
    await expect(callReserve()).rejects.toMatchObject({ code: "failed-precondition" });
    expect(txWrites.find((w) => w.path === `wallets/${BUYER}`)).toBeUndefined();
  });

  test("sufficient: available exactly 5000 WU → reserves available -5000, held +5000", async () => {
    seedReserve(RESERVE_WU);
    await callReserve();
    expect(incrementFor(`wallets/${BUYER}`, "available")).toBe(-RESERVE_WU);
    expect(incrementFor(`wallets/${BUYER}`, "held")).toBe(RESERVE_WU);
  });

  test("proposal doc keeps walletReserved in MAJOR (50), not wallet units", async () => {
    seedReserve(RESERVE_WU);
    await callReserve();
    const proposalWrite = txWrites.find(
      (w) => w.path.startsWith("exchange_proposals/") && w.op === "set"
    );
    expect(proposalWrite).toBeDefined();
    const reservations = (proposalWrite!.payload.reservations as { walletReserved?: number });
    expect(reservations?.walletReserved).toBe(RESERVE_MAJOR);
  });
});

// ===========================================================================
// createExchangeProposal — trade-currency guard refuses with ZERO mutation.
// Each test starts from a VALID reserve fixture (GH/accra, both GHS wallets,
// GHS config) and alters EXACTLY ONE dimension. The guard runs first inside the
// transaction, so a refusal leaves no wallet hold, no inventory reservation, no
// proposal/delivery/ledger write. `expectNoMutation` proves the total absence.
// ===========================================================================
describe("createExchangeProposal — guard refuses with zero side effects", () => {
  function callReserveCurrency(currency?: string) {
    return wrappedReserve({
      data: {
        inventoryItemId: RESV_INV_ID,
        fromPharmacyId: BUYER,
        toPharmacyId: SELLER,
        details: {
          type: "purchase",
          quantity: 5,
          totalPrice: RESERVE_MAJOR,
          pricePerUnit: 10,
          ...(currency ? { currency } : {}),
        },
      },
      auth: { uid: BUYER, token: {} },
    } as never);
  }
  const expectNoMutation = () => expect(txWrites).toHaveLength(0);

  test("cross-country with SAME currency → CROSS_COUNTRY, zero mutation", async () => {
    seedReserve(RESERVE_WU);
    // Second GHS country (XG); put the seller in it. Same currency, different
    // country ⇒ territorial refusal, not laundered by equal currency.
    docs.set(`system_config/main`, {
      exists: true,
      data: {
        countries: {
          GH: { defaultCurrencyCode: "GHS", enabled: true, licenseRequired: false },
          XG: { defaultCurrencyCode: "GHS", enabled: true, licenseRequired: false },
        },
        currencies: { GHS: { code: "GHS", enabled: true, decimals: 2 } },
      },
    });
    docs.set(`pharmacies/${SELLER}`, {
      exists: true,
      data: { countryCode: "XG", cityCode: "accra", city: "Accra" },
    });
    await expect(callReserveCurrency("GHS")).rejects.toMatchObject({
      details: { code: "CROSS_COUNTRY" },
    });
    expectNoMutation();
  });

  test("cross-city → CROSS_CITY, zero mutation", async () => {
    seedReserve(RESERVE_WU);
    docs.set(`pharmacies/${SELLER}`, {
      exists: true,
      data: { countryCode: "GH", cityCode: "kumasi", city: "Kumasi" },
    });
    await expect(callReserveCurrency("GHS")).rejects.toMatchObject({
      details: { code: "CROSS_CITY" },
    });
    expectNoMutation();
  });

  test("client currency lie → CLIENT_CURRENCY_MISMATCH, zero mutation", async () => {
    seedReserve(RESERVE_WU);
    await expect(callReserveCurrency("XAF")).rejects.toMatchObject({
      details: { code: "CLIENT_CURRENCY_MISMATCH" },
    });
    expectNoMutation();
  });

  test("buyer wallet currency mismatch → BUYER_WALLET_CURRENCY_MISMATCH, zero mutation", async () => {
    seedReserve(RESERVE_WU);
    docs.set(`wallets/${BUYER}`, {
      exists: true,
      data: { available: RESERVE_WU, held: 0, deducted: 0, currency: "XAF" },
    });
    await expect(callReserveCurrency("GHS")).rejects.toMatchObject({
      details: { code: "BUYER_WALLET_CURRENCY_MISMATCH" },
    });
    expectNoMutation();
  });

  test("seller wallet absent → SELLER_WALLET_MISSING, zero mutation", async () => {
    seedReserve(RESERVE_WU);
    docs.delete(`wallets/${SELLER}`);
    await expect(callReserveCurrency("GHS")).rejects.toMatchObject({
      details: { code: "SELLER_WALLET_MISSING" },
    });
    expectNoMutation();
  });

  test("currency config unavailable (no currencies map) → CONFIG_UNAVAILABLE, zero mutation", async () => {
    seedReserve(RESERVE_WU);
    docs.set(`system_config/main`, {
      exists: true,
      data: {
        countries: { GH: { defaultCurrencyCode: "GHS", enabled: true, licenseRequired: false } },
      },
    });
    await expect(callReserveCurrency("GHS")).rejects.toMatchObject({
      details: { code: "CONFIG_UNAVAILABLE" },
    });
    expectNoMutation();
  });

  test("incomplete fixture — country not enabled → COUNTRY_NOT_ENABLED, zero mutation", async () => {
    seedReserve(RESERVE_WU);
    docs.set(`system_config/main`, {
      exists: true,
      data: {
        countries: { GH: { defaultCurrencyCode: "GHS", licenseRequired: false } }, // no `enabled`
        currencies: { GHS: { code: "GHS", enabled: true, decimals: 2 } },
      },
    });
    await expect(callReserveCurrency("GHS")).rejects.toMatchObject({
      details: { code: "COUNTRY_NOT_ENABLED" },
    });
    expectNoMutation();
  });

  test("currency ABSENT from payload → server derivation, hold happens in GHS", async () => {
    // Positive control for the assertion rule: omitting the currency lets the
    // server derive it (GHS); the trade proceeds and the doc carries GHS.
    seedReserve(RESERVE_WU);
    await callReserveCurrency(undefined);
    const proposalWrite = txWrites.find(
      (w) => w.path.startsWith("exchange_proposals/") && w.op === "set"
    );
    expect(proposalWrite).toBeDefined();
    expect(proposalWrite!.payload.currencyCode).toBe("GHS");
    expect(incrementFor(`wallets/${BUYER}`, "held")).toBe(RESERVE_WU);
  });
});
