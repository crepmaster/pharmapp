/**
 * Sprint 4 (F-BLOC2-P2, post-livraison Finding 1 fix) — Direct callable-
 * level tests for `createExchangeProposal` on the EXCHANGE branch.
 *
 * Goals :
 *  1. Prove the reservation now flows through the shared canonical helper
 *     `reserveExchangeInventory`, so an `exchangeInventoryItemId` whose
 *     `medicineId` doesn't match `details.exchangeMedicineId` is refused
 *     (this was silently accepted before the refactor).
 *  2. Prove the produced `exchange_proposals/{id}` carries a fully-typed
 *     `details.exchangeInventorySnapshot` (medicineId / medicineName /
 *     dosage / form populated from the real inventory doc, not empty
 *     strings).
 *
 * Mock strategy follows the same offline `firebase-functions-test` +
 * mutable `dbStub` pattern as `acceptExchangeRequestOfferBridge.test.ts`.
 */
import { jest } from "@jest/globals";

const incrementMock = jest.fn((n: number) => ({ __op: "increment", n }));
const serverTimestampMock = jest.fn(() => "ts");

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

const dbStub: Record<string, unknown> = {};
jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => dbStub),
  FieldValue: {
    increment: incrementMock,
    serverTimestamp: serverTimestampMock,
    delete: jest.fn(),
  },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();
import { createExchangeProposal } from "../createExchangeProposal.js";
const wrapped = testFns.wrap(createExchangeProposal);
afterAll(() => testFns.cleanup());

const PROPOSER = "proposer-uid";
const TARGET = "target-uid";
const TARGET_INV_ID = "inv-target"; // item A: target pharmacy's item
const PROPOSER_INV_ID = "inv-proposer"; // item B: proposer's offered item

interface FakeDoc {
  exists: boolean;
  data?: Record<string, unknown>;
}

interface FakeWorld {
  pharmacies: Record<string, FakeDoc>;
  pharmacyInventory: Record<string, FakeDoc>;
}

function defaultWorld(): FakeWorld {
  return {
    pharmacies: {
      [PROPOSER]: {
        exists: true,
        data: {
          countryCode: "CM",
          cityCode: "douala",
          city: "Douala",
          subscriptionStatus: "active",
          // license gate fields (sysconfig says not required, so any status passes)
          licenseStatus: "verified",
        },
      },
      [TARGET]: {
        exists: true,
        data: {
          countryCode: "CM",
          cityCode: "douala",
          city: "Douala",
        },
      },
    },
    pharmacyInventory: {
      [TARGET_INV_ID]: {
        exists: true,
        data: {
          pharmacyId: TARGET,
          medicineId: "M-A",
          medicineName: "Drug A",
          availableQuantity: 50,
          packaging: "box",
          batch: { lotNumber: "LA", expirationDate: null },
          availabilitySettings: { availableForExchange: true },
        },
      },
      [PROPOSER_INV_ID]: {
        exists: true,
        data: {
          pharmacyId: PROPOSER,
          medicineId: "M-B",
          medicineName: "Drug B",
          medicineDosage: "10mg",
          medicineForm: "tablet",
          availableQuantity: 100,
          packaging: "box",
          batch: { lotNumber: "LB", expirationDate: null },
        },
      },
    },
  };
}

interface CapturedWrite {
  op: "set" | "update";
  collection: string;
  id: string;
  data: Record<string, unknown>;
}

function buildFakeFirestore(world: FakeWorld) {
  const writes: CapturedWrite[] = [];
  let autoIdCounter = 0;

  function makeRef(collection: string, id: string) {
    return { id, _coll: collection } as unknown as FirebaseFirestore.DocumentReference;
  }

  const collectionMap: Record<string, string> = {
    pharmacy_inventory: "pharmacyInventory",
    pharmacies: "pharmacies",
  };

  function pickDoc(collKey: string, id: string): FakeDoc | undefined {
    return (world as unknown as Record<string, Record<string, FakeDoc>>)[
      collKey
    ]?.[id];
  }

  function makeRefWithGet(collection: string, id: string) {
    const ref = makeRef(collection, id) as unknown as Record<string, unknown>;
    ref.get = () => fakeGet(ref);
    return ref;
  }

  function collectionFn(internalKey: string) {
    return {
      doc(id?: string) {
        const docId = id ?? `auto-${internalKey}-${++autoIdCounter}`;
        return makeRefWithGet(internalKey, docId);
      },
    };
  }

  // system_config returns missing → license gate uses fallback / pharmacy.licenseStatus.
  // For this test we configure license gate so the helper resolves to allow:
  // sysconfig contains country CM with licenseRequired=false.
  const systemConfig = {
    exists: true,
    data: () => ({
      countries: {
        CM: { licenseRequired: false },
      },
      // No citiesByCountry → courier fee path stays at 0 for exchange but
      // it doesn't matter for this test, which asserts proposal shape.
    }),
  };

  function fakeGet(ref: unknown) {
    const r = ref as { _coll: string; id: string };
    if (r._coll === "system_config") {
      if (r.id === "main") return Promise.resolve(systemConfig);
      return Promise.resolve({ exists: false, data: () => undefined });
    }
    const doc = pickDoc(r._coll, r.id);
    if (!doc || !doc.exists) {
      return Promise.resolve({ exists: false, ref, data: () => undefined });
    }
    return Promise.resolve({ exists: true, ref, data: () => doc.data });
  }

  const fakeDb: Record<string, unknown> = {
    collection(name: string) {
      // Special-case sysconfig and exchange_proposals which aren't in world.
      if (name === "system_config") {
        return {
          doc(id?: string) {
            return makeRefWithGet("system_config", id ?? "main");
          },
        };
      }
      const key = collectionMap[name];
      if (key) return collectionFn(key);
      // exchange_proposals + any other write target — just generate refs.
      return {
        doc(id?: string) {
          return makeRefWithGet(name, id ?? `auto-${name}-${++autoIdCounter}`);
        },
      };
    },
    async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const tx = {
        async get(ref: unknown) {
          return fakeGet(ref);
        },
        set(ref: { _coll: string; id: string }, data: Record<string, unknown>) {
          writes.push({ op: "set", collection: ref._coll, id: ref.id, data });
        },
        update(
          ref: { _coll: string; id: string },
          data: Record<string, unknown>
        ) {
          writes.push({
            op: "update",
            collection: ref._coll,
            id: ref.id,
            data,
          });
        },
      };
      return fn(tx);
    },
  };

  return { fakeDb, writes, fakeGet };
}

async function runCreate(
  world: FakeWorld,
  exchangeInventoryItemId: string,
  exchangeMedicineId: string
) {
  const { fakeDb, writes } = buildFakeFirestore(world);
  for (const k of Object.keys(dbStub)) delete dbStub[k];
  Object.assign(dbStub, fakeDb);

  return {
    result: await wrapped({
      data: {
        inventoryItemId: TARGET_INV_ID,
        fromPharmacyId: PROPOSER,
        toPharmacyId: TARGET,
        details: {
          type: "exchange",
          quantity: 5,
          exchangeMedicineId,
          exchangeInventoryItemId,
          exchangeQuantity: 10,
        },
      },
      auth: { uid: PROPOSER },
    } as never),
    writes,
  };
}

describe("createExchangeProposal — exchange branch (Sprint 4 post-livraison Finding 1)", () => {
  test("exchangeInventoryItemId medicineId mismatch → failed-precondition (canonical helper)", async () => {
    const world = defaultWorld();
    // Proposer's inventory says medicineId='M-B', but caller passes
    // exchangeMedicineId='M-X-WRONG'. The shared helper must refuse.
    await expect(
      runCreate(world, PROPOSER_INV_ID, "M-X-WRONG")
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  test("happy path → proposal carries fully-populated exchangeInventorySnapshot", async () => {
    const world = defaultWorld();
    const { result, writes } = await runCreate(world, PROPOSER_INV_ID, "M-B");
    expect(result).toMatchObject({ status: "success" });

    // Find the exchange_proposals set
    const proposalSet = writes.find(
      (w) => w.op === "set" && w.collection === "exchange_proposals"
    );
    expect(proposalSet).toBeDefined();
    const details = proposalSet!.data.details as Record<string, unknown>;
    expect(details.type).toBe("exchange");
    expect(details.exchangeMedicineId).toBe("M-B");
    expect(details.exchangeInventoryItemId).toBe(PROPOSER_INV_ID);

    const snap = details.exchangeInventorySnapshot as Record<string, unknown>;
    // Finding 2 evidence — snapshot fully populated, no empty strings.
    expect(snap.medicineId).toBe("M-B");
    expect(snap.medicineName).toBe("Drug B");
    expect(snap.dosage).toBe("10mg");
    expect(snap.form).toBe("tablet");
    expect(snap.packaging).toBe("box");
    expect(snap.lotNumber).toBe("LB");
    expect(snap.quantityAtAcceptance).toBe(100);

    // Single inventory hold on proposer's own item, via canonical helper.
    const invHolds = writes.filter(
      (w) =>
        w.op === "update" &&
        w.collection === "pharmacyInventory" &&
        w.id === PROPOSER_INV_ID
    );
    expect(invHolds).toHaveLength(1);
    expect(invHolds[0].data).toMatchObject({
      availableQuantity: { __op: "increment", n: -10 },
      reservedQuantity: { __op: "increment", n: 10 },
    });
  });

  test("requester does not own exchangeInventoryItemId → permission-denied", async () => {
    const world = defaultWorld();
    // Reassign the proposer-inv to a third party.
    world.pharmacyInventory[PROPOSER_INV_ID].data!.pharmacyId = "someone-else";
    await expect(
      runCreate(world, PROPOSER_INV_ID, "M-B")
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});
