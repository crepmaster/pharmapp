/**
 * TD-COURIER-ASSIGN-GUARD (Lot C) — tests for `advanceCourierDelivery`.
 * Pure transition table + callable (authorised transitions, forbidden ones
 * with zero mutation, assigned-only, terminal-never).
 */
import { jest } from "@jest/globals";
import { nextDeliveryStatus } from "../advanceCourierDelivery.js";

interface FakeDoc { exists: boolean; data?: Record<string, unknown>; }
let docs: Map<string, FakeDoc>;
let txWrites: Array<{ path: string; payload: Record<string, unknown> }>;
const pathOfRef = (ref: unknown) => (ref as { __path?: string })?.__path ?? "?";

jest.mock("firebase-admin/app", () => ({ getApps: jest.fn(() => []), initializeApp: jest.fn() }));
jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({
    collection: (col: string) => ({ doc: (id: string) => ({ __path: `${col}/${id}`, id }) }),
    runTransaction: async (fn: any) => {
      const tx = {
        get: (ref: unknown) => {
          const d = docs.get(pathOfRef(ref)) ?? { exists: false };
          return Promise.resolve({ ...d, data: () => d.data });
        },
        update: (ref: unknown, payload: Record<string, unknown>) =>
          txWrites.push({ path: pathOfRef(ref), payload }),
      };
      return fn(tx);
    },
  })),
  FieldValue: { serverTimestamp: jest.fn(() => "ts") },
}));
jest.mock("firebase-functions/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();
import { advanceCourierDelivery } from "../advanceCourierDelivery.js";
const wrapped = testFns.wrap(advanceCourierDelivery);
afterAll(() => testFns.cleanup());

const COURIER = "cour-1";
const D = "d-1";

function seed(status: string, courierId: string = COURIER) {
  txWrites = [];
  docs = new Map([[`deliveries/${D}`, { exists: true, data: { status, courierId } }]]);
}
const call = (action: string, uid: string | null = COURIER, deliveryId: unknown = D) =>
  wrapped({ data: { deliveryId, action }, auth: uid ? { uid, token: {} } : undefined } as never);
const dWrite = () => txWrites.find((w) => w.path === `deliveries/${D}`);
const expectNoMutation = () => expect(txWrites).toHaveLength(0);

describe("nextDeliveryStatus — pure transition table", () => {
  test("mark_in_transit only from accepted", () => {
    expect(nextDeliveryStatus("accepted", "mark_in_transit")).toBe("in_transit");
    expect(nextDeliveryStatus("in_transit", "mark_in_transit")).toBeNull();
    expect(nextDeliveryStatus("picked_up", "mark_in_transit")).toBeNull();
    expect(nextDeliveryStatus("pending", "mark_in_transit")).toBeNull();
  });
  test("confirm_pickup from accepted or in_transit", () => {
    expect(nextDeliveryStatus("accepted", "confirm_pickup")).toBe("picked_up");
    expect(nextDeliveryStatus("in_transit", "confirm_pickup")).toBe("picked_up");
    expect(nextDeliveryStatus("picked_up", "confirm_pickup")).toBeNull();
    expect(nextDeliveryStatus("delivered", "confirm_pickup")).toBeNull();
    expect(nextDeliveryStatus("pending", "confirm_pickup")).toBeNull();
  });
});

describe("advanceCourierDelivery — authorised transitions", () => {
  test("accepted → in_transit (mark_in_transit)", async () => {
    seed("accepted");
    const res = await call("mark_in_transit");
    expect(res).toMatchObject({ success: true, status: "in_transit" });
    expect(dWrite()!.payload).toMatchObject({ status: "in_transit" });
    expect(dWrite()!.payload.pickedUpAt).toBeUndefined();
  });
  test("accepted → picked_up (confirm_pickup) sets pickedUpAt", async () => {
    seed("accepted");
    await call("confirm_pickup");
    expect(dWrite()!.payload).toMatchObject({ status: "picked_up", pickedUpAt: "ts" });
  });
  test("in_transit → picked_up (confirm_pickup)", async () => {
    seed("in_transit");
    await call("confirm_pickup");
    expect(dWrite()!.payload).toMatchObject({ status: "picked_up" });
  });
});

describe("advanceCourierDelivery — forbidden transitions (zero mutation)", () => {
  test("picked_up → in_transit refused (no going back on the road)", async () => {
    seed("picked_up");
    await expect(call("mark_in_transit")).rejects.toMatchObject({ details: { code: "INVALID_DELIVERY_TRANSITION" } });
    expectNoMutation();
  });
  test("confirm_pickup when already picked_up refused", async () => {
    seed("picked_up");
    await expect(call("confirm_pickup")).rejects.toMatchObject({ details: { code: "INVALID_DELIVERY_TRANSITION" } });
    expectNoMutation();
  });
  test("any action from delivered refused (terminal never reversible)", async () => {
    seed("delivered");
    await expect(call("confirm_pickup")).rejects.toMatchObject({ details: { code: "INVALID_DELIVERY_TRANSITION" } });
    expectNoMutation();
  });
});

describe("advanceCourierDelivery — authorization / input", () => {
  test("non-assigned courier refused", async () => {
    seed("accepted", "someone-else");
    await expect(call("confirm_pickup")).rejects.toMatchObject({ code: "permission-denied" });
    expectNoMutation();
  });
  test("unauthenticated refused", async () => {
    seed("accepted");
    await expect(call("confirm_pickup", null)).rejects.toMatchObject({ code: "unauthenticated" });
    expectNoMutation();
  });
  test("invalid action refused", async () => {
    seed("accepted");
    await expect(call("teleport")).rejects.toMatchObject({ code: "invalid-argument" });
    expectNoMutation();
  });
  test("delivery not found refused", async () => {
    seed("accepted");
    docs.delete(`deliveries/${D}`);
    await expect(call("confirm_pickup")).rejects.toMatchObject({ code: "not-found" });
    expectNoMutation();
  });
});
