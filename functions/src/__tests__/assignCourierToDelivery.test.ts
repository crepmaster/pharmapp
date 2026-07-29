/**
 * TD-COURIER-ASSIGN-GUARD (Lot B) — unit tests for `assignCourierToDelivery`.
 *
 * Mocked Firestore (docs Map + tx capture). Each negative starts from a VALID
 * world and alters EXACTLY ONE dimension, asserting the typed refusal AND zero
 * mutation (no `deliveries` write). The real concurrency proof lives in
 * `assignCourierToDelivery-concurrency.test.ts` (Firestore emulator).
 */
import { jest } from "@jest/globals";

interface FakeDoc { exists: boolean; data?: Record<string, unknown>; }
let docs: Map<string, FakeDoc>;
let txWrites: Array<{ op: "update" | "set"; path: string; payload: Record<string, unknown> }>;

const makeRef = (path: string) => ({ __path: path, id: path.split("/").pop() });
const pathOfRef = (ref: unknown) => (ref as { __path?: string })?.__path ?? "?";

jest.mock("firebase-admin/app", () => ({ getApps: jest.fn(() => []), initializeApp: jest.fn() }));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({
    collection: (col: string) => ({
      doc: (id: string) => ({ __path: `${col}/${id}`, id }),
    }),
    runTransaction: async (fn: any) => {
      const tx = {
        get: (ref: unknown) => {
          const path = pathOfRef(ref);
          const d = docs.get(path) ?? { exists: false };
          return Promise.resolve({ ...d, data: () => d.data, ref: makeRef(path) });
        },
        update: (ref: unknown, payload: Record<string, unknown>) =>
          txWrites.push({ op: "update", path: pathOfRef(ref), payload }),
        set: (ref: unknown, payload: Record<string, unknown>) =>
          txWrites.push({ op: "set", path: pathOfRef(ref), payload }),
      };
      return fn(tx);
    },
  })),
  FieldValue: { serverTimestamp: jest.fn(() => "ts"), increment: jest.fn((n: number) => ({ __op: "increment", n })) },
}));

jest.mock("firebase-functions/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();
import { assignCourierToDelivery } from "../assignCourierToDelivery.js";
const wrapped = testFns.wrap(assignCourierToDelivery);
afterAll(() => testFns.cleanup());

const COURIER = "cour-1";
const BUYER = "buyer-1";
const SELLER = "seller-1";
const DELIVERY = "d-1";
const PROPOSAL = "p-1";

function seed() {
  txWrites = [];
  docs = new Map<string, FakeDoc>([
    [`deliveries/${DELIVERY}`, { exists: true, data: { proposalId: PROPOSAL, status: "pending", courierId: null } }],
    [`exchange_proposals/${PROPOSAL}`, { exists: true, data: {
      status: "accepted", deliveryId: DELIVERY,
      fromPharmacyId: BUYER, toPharmacyId: SELLER, currencyCode: "GHS",
    } }],
    [`pharmacies/${BUYER}`, { exists: true, data: { countryCode: "GH", cityCode: "accra" } }],
    [`pharmacies/${SELLER}`, { exists: true, data: { countryCode: "GH", cityCode: "accra" } }],
    [`wallets/${BUYER}`, { exists: true, data: { currency: "GHS" } }],
    [`wallets/${SELLER}`, { exists: true, data: { currency: "GHS" } }],
    [`couriers/${COURIER}`, { exists: true, data: { role: "courier", isActive: true, countryCode: "GH", cityCode: "accra", fullName: "Kwame" } }],
    [`wallets/${COURIER}`, { exists: true, data: { currency: "GHS" } }],
    [`system_config/main`, { exists: true, data: {
      countries: { GH: { defaultCurrencyCode: "GHS", enabled: true } },
      currencies: { GHS: { code: "GHS", enabled: true, decimals: 2 } },
    } }],
  ]);
}

const callAssign = (uid: string | null = COURIER, deliveryId: unknown = DELIVERY) =>
  wrapped({ data: { deliveryId }, auth: uid ? { uid, token: {} } : undefined } as never);

const deliveryWrite = () => txWrites.find((w) => w.path === `deliveries/${DELIVERY}`);
const expectNoMutation = () => expect(txWrites).toHaveLength(0);

beforeEach(seed);

describe("assignCourierToDelivery — happy path", () => {
  test("claims the delivery: courierId=self, status=accepted", async () => {
    const res = await callAssign();
    expect(res).toMatchObject({ success: true, deliveryId: DELIVERY, courierId: COURIER, status: "accepted" });
    const w = deliveryWrite()!;
    expect(w.op).toBe("update");
    expect(w.payload).toMatchObject({ courierId: COURIER, status: "accepted", courierName: "Kwame" });
  });
});

describe("assignCourierToDelivery — input / identity refusals (zero mutation)", () => {
  test("unauthenticated → unauthenticated", async () => {
    await expect(callAssign(null)).rejects.toMatchObject({ code: "unauthenticated" });
    expectNoMutation();
  });
  test("missing deliveryId → invalid-argument", async () => {
    await expect(callAssign(COURIER, "")).rejects.toMatchObject({ code: "invalid-argument" });
    expectNoMutation();
  });
  test("delivery not found → not-found", async () => {
    docs.delete(`deliveries/${DELIVERY}`);
    await expect(callAssign()).rejects.toMatchObject({ code: "not-found" });
    expectNoMutation();
  });
  test("caller is not an active courier → COURIER_NOT_ACTIVE", async () => {
    docs.set(`couriers/${COURIER}`, { exists: true, data: { role: "courier", isActive: false, countryCode: "GH", cityCode: "accra" } });
    await expect(callAssign()).rejects.toMatchObject({ details: { code: "COURIER_NOT_ACTIVE" } });
    expectNoMutation();
  });
  test("caller has no courier doc → COURIER_NOT_ACTIVE", async () => {
    docs.delete(`couriers/${COURIER}`);
    await expect(callAssign()).rejects.toMatchObject({ details: { code: "COURIER_NOT_ACTIVE" } });
    expectNoMutation();
  });
});

describe("assignCourierToDelivery — state / link refusals (zero mutation)", () => {
  test("delivery not pending → DELIVERY_NOT_ASSIGNABLE", async () => {
    docs.get(`deliveries/${DELIVERY}`)!.data!.status = "accepted";
    await expect(callAssign()).rejects.toMatchObject({ details: { code: "DELIVERY_NOT_ASSIGNABLE" } });
    expectNoMutation();
  });
  test("delivery already has a courier → DELIVERY_NOT_ASSIGNABLE", async () => {
    docs.get(`deliveries/${DELIVERY}`)!.data!.courierId = "someone-else";
    await expect(callAssign()).rejects.toMatchObject({ details: { code: "DELIVERY_NOT_ASSIGNABLE" } });
    expectNoMutation();
  });
  test("proposal not accepted → PROPOSAL_NOT_ACCEPTED", async () => {
    docs.get(`exchange_proposals/${PROPOSAL}`)!.data!.status = "pending";
    await expect(callAssign()).rejects.toMatchObject({ details: { code: "PROPOSAL_NOT_ACCEPTED" } });
    expectNoMutation();
  });
  test("proposal points at another delivery → DELIVERY_PROPOSAL_LINK_INVALID", async () => {
    docs.get(`exchange_proposals/${PROPOSAL}`)!.data!.deliveryId = "other";
    await expect(callAssign()).rejects.toMatchObject({ details: { code: "DELIVERY_PROPOSAL_LINK_INVALID" } });
    expectNoMutation();
  });
  test("currency snapshot missing → CURRENCY_SNAPSHOT_MISSING", async () => {
    delete docs.get(`exchange_proposals/${PROPOSAL}`)!.data!.currencyCode;
    await expect(callAssign()).rejects.toMatchObject({ details: { code: "CURRENCY_SNAPSHOT_MISSING" } });
    expectNoMutation();
  });
});

describe("assignCourierToDelivery — courier frontier refusals (zero mutation)", () => {
  test("courier in another country → COURIER_CROSS_COUNTRY", async () => {
    docs.get(`couriers/${COURIER}`)!.data!.countryCode = "CM";
    await expect(callAssign()).rejects.toMatchObject({ details: { code: "COURIER_CROSS_COUNTRY" } });
    expectNoMutation();
  });
  test("courier in another city → COURIER_CROSS_CITY", async () => {
    docs.get(`couriers/${COURIER}`)!.data!.cityCode = "kumasi";
    await expect(callAssign()).rejects.toMatchObject({ details: { code: "COURIER_CROSS_CITY" } });
    expectNoMutation();
  });
  test("courier wallet in another currency → COURIER_WALLET_CURRENCY_MISMATCH", async () => {
    docs.set(`wallets/${COURIER}`, { exists: true, data: { currency: "XAF" } });
    await expect(callAssign()).rejects.toMatchObject({ details: { code: "COURIER_WALLET_CURRENCY_MISMATCH" } });
    expectNoMutation();
  });
  test("courier wallet absent → COURIER_WALLET_MISSING", async () => {
    docs.delete(`wallets/${COURIER}`);
    await expect(callAssign()).rejects.toMatchObject({ details: { code: "COURIER_WALLET_MISSING" } });
    expectNoMutation();
  });
});
