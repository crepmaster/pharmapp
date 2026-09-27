/** Real Admin SDK transactions against the local Firestore emulator only. */
import { jest } from "@jest/globals";

jest.mock("../lib/licenseGate.js", () => ({
  assertLicenseAllowsMarketplace: jest.fn(async () => undefined),
  PROTECTED_LICENSE_FIELDS: [],
}));

let db: FirebaseFirestore.Firestore;
let accept: (req: unknown) => Promise<{ proposalId: string }>;
let create: (req: unknown) => Promise<{ proposalId: string }>;
let cancel: (req: unknown) => Promise<{ proposalId: string }>;
const PROJECT = "demo-proposal-concurrency";
let SELLER: string;
let BUYER_A: string;
let BUYER_B: string;
let LOT: string;

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Firestore emulator required");
  process.env.GCLOUD_PROJECT = PROJECT;
  process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
  const { initializeApp } = await import("firebase-admin/app");
  initializeApp({ projectId: PROJECT });
  const { getFirestore } = await import("firebase-admin/firestore");
  db = getFirestore();
  const functionsTest = (await import("firebase-functions-test")).default;
  const testFns = functionsTest();
  accept = testFns.wrap((await import("../acceptExchangeProposal.js")).acceptExchangeProposal) as never;
  create = testFns.wrap((await import("../createExchangeProposal.js")).createExchangeProposal) as never;
  cancel = testFns.wrap((await import("../cancelExchangeProposal.js")).cancelExchangeProposal) as never;
});

async function seed(scenario: string) {
  // Unique documents per test. A create-vs-accept race may intentionally leave
  // its newly created proposal pending; it must never enter the next test's
  // lot query or contaminate its wallet assertions.
  SELLER = `seller-${scenario}`;
  BUYER_A = `buyer-a-${scenario}`;
  BUYER_B = `buyer-b-${scenario}`;
  LOT = `seller-lot-${scenario}`;
  const batch = db.batch();
  batch.set(db.collection("system_config").doc("main"), {
    countries: { GH: { defaultCurrencyCode: "GHS", enabled: true, licenseRequired: false } },
    currencies: { GHS: { code: "GHS", enabled: true, decimals: 2 } },
    citiesByCountry: { GH: { kumasi: { deliveryFee: 20, exchangeFee: 24 } } },
  });
  for (const uid of [SELLER, BUYER_A, BUYER_B]) {
    batch.set(db.collection("pharmacies").doc(uid), {
      countryCode: "GH", cityCode: "kumasi", city: "Kumasi", name: uid,
      subscriptionStatus: "active", licenseStatus: "verified",
    });
    batch.set(db.collection("wallets").doc(uid), {
      currency: "GHS", available: 100000, held: 0, deducted: 0,
    });
  }
  batch.set(db.collection("pharmacy_inventory").doc(LOT), {
    pharmacyId: SELLER, medicineId: "amox", medicineName: "Amoxicillin",
    availableQuantity: 50, reservedQuantity: 0,
    batch: { lotNumber: "L-1", expirationDate: null },
    availabilitySettings: { availableForExchange: true, maxExchangeQuantity: 50 },
  });
  await batch.commit();
}

const createCall = (buyer: string) => create({
  data: { inventoryItemId: LOT, fromPharmacyId: buyer, toPharmacyId: SELLER,
    details: { type: "purchase", quantity: 1, pricePerUnit: 10, totalPrice: 10, currency: "GHS" } },
  auth: { uid: buyer, token: {} },
});
const acceptCall = (proposalId: string) => accept({
  data: { proposalId }, auth: { uid: SELLER, token: {} },
});
const cancelCall = (proposalId: string) => cancel({
  data: { proposalId, action: "cancel" }, auth: { uid: BUYER_A, token: {} },
});

describe("proposal accept concurrency — Firestore emulator", () => {
  test("two simultaneous acceptances have one winner and release the rival hold", async () => {
    await seed("two-accepts");
    const a = await createCall(BUYER_A);
    const b = await createCall(BUYER_B);
    const results = await Promise.allSettled([acceptCall(a.proposalId), acceptCall(b.proposalId)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const proposals = await Promise.all([a, b].map((item) =>
      db.collection("exchange_proposals").doc(item.proposalId).get()));
    expect(proposals.map((snapshot) => snapshot.data()?.status).sort()).toEqual(["accepted", "cancelled"]);
    const deliveries = await db.collection("deliveries").where("proposalId", "in", [a.proposalId, b.proposalId]).get();
    expect(deliveries.size).toBe(1);
    for (const buyer of [BUYER_A, BUYER_B]) {
      const wallet = (await db.collection("wallets").doc(buyer).get()).data()!;
      expect(wallet.held).toBe(0);
    }
  });

  test("create racing accept is either included in cancellation or commits afterward", async () => {
    await seed("create-vs-accept");
    const first = await createCall(BUYER_A);
    const results = await Promise.allSettled([acceptCall(first.proposalId), createCall(BUYER_B)]);
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    const second = (results[1] as PromiseFulfilledResult<{ proposalId: string }>).value;
    const accepted = (await db.collection("exchange_proposals").doc(first.proposalId).get()).data()!;
    const rival = (await db.collection("exchange_proposals").doc(second.proposalId).get()).data()!;
    expect(accepted.status).toBe("accepted");
    expect(["cancelled", "pending"]).toContain(rival.status);
    if (rival.status === "pending") {
      expect(rival.createdAt.toMillis()).toBeGreaterThanOrEqual(accepted.acceptedAt.toMillis());
    }
    const buyerWallet = (await db.collection("wallets").doc(BUYER_B).get()).data()!;
    expect(buyerWallet.held).toBe(rival.status === "pending" ? 1000 : 0);
  });

  test("cancel racing accept has exactly one winner, one wallet transition and no orphan delivery", async () => {
    await seed("cancel-vs-accept");
    const proposal = await createCall(BUYER_A);
    const results = await Promise.allSettled([
      acceptCall(proposal.proposalId), cancelCall(proposal.proposalId),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const finalProposal = (await db.collection("exchange_proposals")
      .doc(proposal.proposalId).get()).data()!;
    const wallet = (await db.collection("wallets").doc(BUYER_A).get()).data()!;
    const deliveries = await db.collection("deliveries")
      .where("proposalId", "==", proposal.proposalId).get();
    const releases = await db.collection("ledger")
      .where("proposalId", "==", proposal.proposalId)
      .where("type", "==", "proposal_wallet_hold_released").get();
    expect(wallet.held).toBe(0);
    if (finalProposal.status === "accepted") {
      expect(wallet.available).toBe(99000);
      expect(wallet.deducted).toBe(1000);
      expect(deliveries.size).toBe(1);
      expect(releases.size).toBe(0);
      expect(finalProposal.deliveryId).toBe(deliveries.docs[0].id);
    } else {
      expect(finalProposal.status).toBe("cancelled");
      expect(wallet.available).toBe(100000);
      expect(wallet.deducted).toBe(0);
      expect(deliveries.size).toBe(0);
      expect(releases.size).toBe(1);
      expect(finalProposal.deliveryId).toBeUndefined();
    }
  });
});
