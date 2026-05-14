/**
 * Sprint 4 (F-BLOC2-P2) — Integration test for the exchange bridge.
 *
 * Exercises `acceptExchangeRequestOfferIntoCanonicalProposal` end-to-end
 * with a faked Firestore transaction. Covers :
 *   - happy path: requester inventory reserved (and ONLY that), proposal
 *     written with canonical shape, delivery written, request matched,
 *     offer converted, other pending offers declined.
 *   - exchangeItem mismatch (medicineId / dosage / form / quantity).
 *   - requester does not own the exchangeInventoryItemId.
 *   - insufficient stock on requester inventory.
 *   - seller inventory expired or missing.
 *   - requester/seller pharmacy city moved out of the request city.
 *
 * Sprint 4 lock #5 verification: tx.update calls touch ONLY the
 * requester's inventory item for the hold. The seller's `inventoryItemId`
 * is read for validation but NOT updated until completeExchangeDelivery.
 */
import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const incrementMock = jest.fn((n: number) => ({ __op: "increment", n }));
const serverTimestampMock = jest.fn(() => "ts");

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

// Shared db stub object — bridge captures this reference at module load.
// Each test rewires its contents to match the requested fake world.
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

import { acceptExchangeRequestOfferIntoCanonicalProposal } from "../lib/requestProposalBridge.js";

// ---------------------------------------------------------------------------
// Fake Firestore world
// ---------------------------------------------------------------------------

const REQUESTER = "requester-uid";
const SELLER = "seller-uid";
const REQUEST_ID = "req-1";
const OFFER_ID = "off-1";
const SELLER_INV_ID = "inv-seller";
const REQUESTER_INV_ID = "inv-requester";
const OTHER_OFFER_ID = "off-other";

interface FakeDoc {
  exists: boolean;
  data?: Record<string, unknown>;
}

interface FakeWorld {
  medicineRequests: Record<string, FakeDoc>;
  medicineRequestOffers: Record<string, FakeDoc>;
  pharmacyInventory: Record<string, FakeDoc>;
  pharmacies: Record<string, FakeDoc>;
  /** All offers indexed for the `.where("requestId", "==", ...).get()` query. */
  offersByRequest: Record<string, Array<{ id: string; data: Record<string, unknown> }>>;
  /** Sprint 4 Finding 1: `system_config/main` doc read by the bridge to
   *  resolve courier fee. Absent by default → bridge falls back to 0. */
  system_config?: Record<string, FakeDoc>;
}

function defaultWorld(): FakeWorld {
  return {
    medicineRequests: {
      [REQUEST_ID]: {
        exists: true,
        data: {
          requesterPharmacyId: REQUESTER,
          requestMode: "exchange",
          status: "open",
          countryCode: "CM",
          cityCode: "douala",
          medicineId: "M-A",
        },
      },
    },
    medicineRequestOffers: {
      [OFFER_ID]: {
        exists: true,
        data: {
          requestId: REQUEST_ID,
          status: "pending",
          offerType: "exchange",
          sellerPharmacyId: SELLER,
          inventoryItemId: SELLER_INV_ID,
          offeredQuantity: 30,
          exchangeItem: {
            medicineId: "M-B",
            medicineName: "Drug B",
            dosage: "10mg",
            form: "tablet",
            quantity: 20,
          },
        },
      },
      [OTHER_OFFER_ID]: {
        exists: true,
        data: {
          requestId: REQUEST_ID,
          status: "pending",
          offerType: "exchange",
          sellerPharmacyId: "other-seller",
        },
      },
    },
    pharmacyInventory: {
      [SELLER_INV_ID]: {
        exists: true,
        data: {
          pharmacyId: SELLER,
          medicineId: "M-A",
          medicineName: "Drug A",
          medicineDosage: "5mg",
          medicineForm: "tablet",
          availableQuantity: 100,
          packaging: "box",
          batch: { lotNumber: "LA", expirationDate: null },
        },
      },
      [REQUESTER_INV_ID]: {
        exists: true,
        data: {
          pharmacyId: REQUESTER,
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
    pharmacies: {
      [REQUESTER]: {
        exists: true,
        data: {
          pharmacyName: "Requester Pharm",
          countryCode: "CM",
          cityCode: "douala",
          city: "Douala",
          address: "Addr R",
          phoneNumber: "+237600",
        },
      },
      [SELLER]: {
        exists: true,
        data: {
          pharmacyName: "Seller Pharm",
          countryCode: "CM",
          cityCode: "douala",
          city: "Douala",
          address: "Addr S",
          phoneNumber: "+237601",
        },
      },
    },
    offersByRequest: {
      [REQUEST_ID]: [
        {
          id: OFFER_ID,
          data: { status: "pending" },
        },
        {
          id: OTHER_OFFER_ID,
          data: { status: "pending" },
        },
      ],
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

  function pickDoc(collection: string, id: string): FakeDoc | undefined {
    const map = (world as unknown as Record<string, Record<string, FakeDoc>>)[
      collection
    ];
    return map?.[id];
  }

  function collectionFn(collection: string) {
    return {
      doc(id?: string) {
        const docId =
          id ?? `auto-${collection}-${++autoIdCounter}`;
        return makeRef(collection, docId);
      },
      where(field: string, op: string, value: unknown) {
        return {
          // returned to tx.get
          __isQuery: true,
          collection,
          field,
          op,
          value,
        };
      },
    };
  }

  const collectionMap: Record<string, string> = {
    medicine_requests: "medicineRequests",
    medicine_request_offers: "medicineRequestOffers",
    pharmacy_inventory: "pharmacyInventory",
    pharmacies: "pharmacies",
    exchange_proposals: "exchange_proposals", // write-only here
    deliveries: "deliveries",
    ledger: "ledger",
  };

  const fakeDb = {
    collection(name: string) {
      return collectionFn(collectionMap[name] ?? name);
    },
  };

  const tx = {
    async get(refOrQuery: any): Promise<unknown> {
      if (refOrQuery?.__isQuery) {
        // Only `medicine_request_offers.where("requestId", "==", X)` used.
        const offers = world.offersByRequest[refOrQuery.value] ?? [];
        return {
          docs: offers.map((o) => ({
            id: o.id,
            ref: makeRef(refOrQuery.collection, o.id),
            data: () => o.data,
          })),
        };
      }
      const coll = (refOrQuery as { _coll: string })._coll;
      const id = (refOrQuery as { id: string }).id;
      const doc = pickDoc(coll, id);
      if (!doc || !doc.exists) {
        return { exists: false, ref: refOrQuery, data: () => undefined };
      }
      return {
        exists: true,
        ref: refOrQuery,
        data: () => doc.data,
      };
    },
    set(ref: { _coll: string; id: string }, data: Record<string, unknown>) {
      writes.push({ op: "set", collection: ref._coll, id: ref.id, data });
    },
    update(ref: { _coll: string; id: string }, data: Record<string, unknown>) {
      writes.push({ op: "update", collection: ref._coll, id: ref.id, data });
    },
  };

  return { fakeDb, tx, writes };
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

async function runBridge(
  world: FakeWorld,
  exchangeInventoryItemId: string = REQUESTER_INV_ID
) {
  const { fakeDb, tx, writes } = buildFakeFirestore(world);
  // Rewire `dbStub` (the singleton the bridge captured at import time)
  // to delegate to this world's fake db.
  for (const k of Object.keys(dbStub)) delete dbStub[k];
  Object.assign(dbStub, fakeDb);
  const result = await acceptExchangeRequestOfferIntoCanonicalProposal(
    tx as never,
    {
      callerUid: REQUESTER,
      requestId: REQUEST_ID,
      offerId: OFFER_ID,
      exchangeInventoryItemId,
    }
  );
  return { result, writes };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("acceptExchangeRequestOfferIntoCanonicalProposal — happy path", () => {
  test("reserves ONLY requester inventory and writes canonical proposal+delivery", async () => {
    const world = defaultWorld();
    const { result, writes } = await runBridge(world);

    expect(result.proposalId).toBeTruthy();
    expect(result.deliveryId).toBeTruthy();

    // ---- Single inventory hold: requester's exchange item B ----
    const inventoryUpdates = writes.filter(
      (w) =>
        w.op === "update" &&
        w.collection === "pharmacyInventory"
    );
    expect(inventoryUpdates).toHaveLength(1);
    expect(inventoryUpdates[0].id).toBe(REQUESTER_INV_ID);
    expect(inventoryUpdates[0].data).toMatchObject({
      availableQuantity: { __op: "increment", n: -20 },
      reservedQuantity: { __op: "increment", n: 20 },
    });

    // ---- Proposal: canonical exchange shape ----
    const proposalSets = writes.filter(
      (w) => w.op === "set" && w.collection === "exchange_proposals"
    );
    expect(proposalSets).toHaveLength(1);
    const proposal = proposalSets[0].data;
    expect((proposal.details as { type: string }).type).toBe("exchange");
    expect(proposal.fromPharmacyId).toBe(REQUESTER);
    expect(proposal.toPharmacyId).toBe(SELLER);
    expect(proposal.reservations).toEqual({
      walletReserved: null,
      inventoryReserved: 20,
    });
    expect((proposal.details as { exchangeInventoryItemId: string }).exchangeInventoryItemId).toBe(
      REQUESTER_INV_ID
    );
    expect(proposal.status).toBe("accepted");
    expect(proposal._sourceRequestId).toBe(REQUEST_ID);
    expect(proposal._sourceOfferId).toBe(OFFER_ID);

    // ---- Delivery created ----
    const deliverySets = writes.filter(
      (w) => w.op === "set" && w.collection === "deliveries"
    );
    expect(deliverySets).toHaveLength(1);
    expect(deliverySets[0].data.proposalType).toBe("exchange");
    expect(deliverySets[0].data.paymentStatus).toBe("n/a");
    expect(deliverySets[0].data.totalPrice).toBe(0);

    // ---- Request → matched, offer → converted, other offer → declined ----
    const requestUpdates = writes.filter(
      (w) => w.collection === "medicineRequests" && w.id === REQUEST_ID
    );
    expect(requestUpdates.find((u) => (u.data.status as string) === "matched")).toBeDefined();

    const offerUpdates = writes.filter(
      (w) => w.collection === "medicineRequestOffers" && w.id === OFFER_ID
    );
    expect(offerUpdates.find((u) => (u.data.status as string) === "converted")).toBeDefined();

    const otherOfferUpdates = writes.filter(
      (w) => w.collection === "medicineRequestOffers" && w.id === OTHER_OFFER_ID
    );
    expect(otherOfferUpdates.find((u) => (u.data.status as string) === "declined")).toBeDefined();

    // ---- NO wallet write (barter; lock #1) ----
    const walletWrites = writes.filter((w) => w.collection === "wallets");
    expect(walletWrites).toHaveLength(0);

    // ---- NO seller inventory write at accept (lock #5) ----
    const sellerInventoryWrites = writes.filter(
      (w) => w.collection === "pharmacyInventory" && w.id === SELLER_INV_ID
    );
    expect(sellerInventoryWrites).toHaveLength(0);
  });
});

describe("acceptExchangeRequestOfferIntoCanonicalProposal — courier fee (Finding 1)", () => {
  test("city has explicit exchangeFee → delivery.courierFee = exchangeFee", async () => {
    const world = defaultWorld();
    world.system_config = {
      main: {
        exists: true,
        data: {
          citiesByCountry: {
            CM: {
              douala: { deliveryFee: 1000, exchangeFee: 1500 },
            },
          },
        },
      },
    };
    const { writes } = await runBridge(world);
    const delivery = writes.find(
      (w) => w.op === "set" && w.collection === "deliveries"
    );
    expect(delivery).toBeDefined();
    expect(delivery!.data.courierFee).toBe(1500);
  });

  test("city has deliveryFee only → delivery.courierFee = deliveryFee × 1.2 rounded", async () => {
    const world = defaultWorld();
    world.system_config = {
      main: {
        exists: true,
        data: {
          citiesByCountry: {
            CM: { douala: { deliveryFee: 500 } },
          },
        },
      },
    };
    const { writes } = await runBridge(world);
    const delivery = writes.find(
      (w) => w.op === "set" && w.collection === "deliveries"
    );
    expect(delivery!.data.courierFee).toBe(600); // 500 * 1.2 = 600
  });

  test("no per-city config → delivery.courierFee = 0 (documented no-config posture)", async () => {
    const world = defaultWorld();
    // No world.system_config defined.
    const { writes } = await runBridge(world);
    const delivery = writes.find(
      (w) => w.op === "set" && w.collection === "deliveries"
    );
    expect(delivery!.data.courierFee).toBe(0);
  });

  test("system_config exists but unrelated country → delivery.courierFee = 0", async () => {
    const world = defaultWorld();
    world.system_config = {
      main: {
        exists: true,
        data: {
          citiesByCountry: {
            GH: { accra: { deliveryFee: 999 } },
          },
        },
      },
    };
    const { writes } = await runBridge(world);
    const delivery = writes.find(
      (w) => w.op === "set" && w.collection === "deliveries"
    );
    expect(delivery!.data.courierFee).toBe(0);
  });
});

describe("acceptExchangeRequestOfferIntoCanonicalProposal — negative paths", () => {
  async function expectThrow(
    setup: (w: FakeWorld) => void,
    code: string,
    exchangeInventoryId?: string
  ) {
    const world = defaultWorld();
    setup(world);
    await expect(runBridge(world, exchangeInventoryId)).rejects.toMatchObject({
      code,
    });
  }

  test("exchangeItem medicineId mismatch (requester inv is wrong medicine) → failed-precondition", async () => {
    await expectThrow(
      (w) => {
        w.pharmacyInventory[REQUESTER_INV_ID].data!.medicineId = "M-WRONG";
      },
      "failed-precondition"
    );
  });

  test("exchangeItem dosage mismatch → failed-precondition", async () => {
    await expectThrow(
      (w) => {
        w.pharmacyInventory[REQUESTER_INV_ID].data!.medicineDosage = "50mg";
      },
      "failed-precondition"
    );
  });

  test("exchangeItem form mismatch → failed-precondition", async () => {
    await expectThrow(
      (w) => {
        w.pharmacyInventory[REQUESTER_INV_ID].data!.medicineForm = "syrup";
      },
      "failed-precondition"
    );
  });

  test("requester does not own exchangeInventoryItemId → permission-denied", async () => {
    await expectThrow(
      (w) => {
        w.pharmacyInventory[REQUESTER_INV_ID].data!.pharmacyId = "someone-else";
      },
      "permission-denied"
    );
  });

  test("insufficient stock on requester inv → failed-precondition", async () => {
    await expectThrow(
      (w) => {
        w.pharmacyInventory[REQUESTER_INV_ID].data!.availableQuantity = 5;
      },
      "failed-precondition"
    );
  });

  test("seller inventory expired → failed-precondition", async () => {
    await expectThrow((w) => {
      w.pharmacyInventory[SELLER_INV_ID].data!.batch = {
        lotNumber: "L",
        expirationDate: { toDate: () => new Date("2020-01-01") },
      };
    }, "failed-precondition");
  });

  test("seller inventory missing → not-found", async () => {
    await expectThrow((w) => {
      w.pharmacyInventory[SELLER_INV_ID].exists = false;
      w.pharmacyInventory[SELLER_INV_ID].data = undefined;
    }, "not-found");
  });

  test("requester pharmacy moved out of request city → failed-precondition", async () => {
    await expectThrow((w) => {
      w.pharmacies[REQUESTER].data!.cityCode = "yaounde";
    }, "failed-precondition");
  });

  test("offer status != pending → failed-precondition", async () => {
    await expectThrow((w) => {
      w.medicineRequestOffers[OFFER_ID].data!.status = "withdrawn";
    }, "failed-precondition");
  });

  test("offer offerType != exchange → failed-precondition", async () => {
    await expectThrow((w) => {
      w.medicineRequestOffers[OFFER_ID].data!.offerType = "purchase";
    }, "failed-precondition");
  });

  test("offer.exchangeItem missing → failed-precondition", async () => {
    await expectThrow((w) => {
      delete w.medicineRequestOffers[OFFER_ID].data!.exchangeItem;
    }, "failed-precondition");
  });

  test("request mode != exchange → failed-precondition", async () => {
    await expectThrow((w) => {
      w.medicineRequests[REQUEST_ID].data!.requestMode = "purchase";
    }, "failed-precondition");
  });
});
