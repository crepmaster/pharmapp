/**
 * TD-COURIER-ASSIGN-GUARD (Lot B) — REAL concurrency proof for
 * `assignCourierToDelivery`, against the Firestore EMULATOR via the Admin SDK.
 *
 * A mocked transaction cannot prove that two concurrent claims produce exactly
 * one winner; only the emulator's real optimistic-transaction contention can.
 *
 * Named `firestore-rules-*` on PURPOSE so it inherits the emulator harness:
 * `jest.config.cjs` excludes `firestore-rules*` from the plain `npm test`
 * (no Java needed there), and `npm run test:rules` runs it under
 * `firebase emulators:exec --only firestore` (FIRESTORE_EMULATOR_HOST set).
 * It is NOT a security-rules test — it drives the callable with the Admin SDK.
 */

let wrapped: (req: unknown) => Promise<{ courierId: string }>;
let db: FirebaseFirestore.Firestore;

const PROJECT = "demo-courier-concurrency";
const D = "delivery-concurrency";
const P = "proposal-concurrency";
const BUYER = "buyer-c";
const SELLER = "seller-c";
const COURIER_A = "courier-a";
const COURIER_B = "courier-b";

beforeAll(async () => {
  process.env.GCLOUD_PROJECT = PROJECT;
  process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
  // Initialise the Admin app (default) BEFORE importing the callable, whose
  // module body calls getFirestore(). Dynamic imports guarantee the order.
  const { initializeApp } = await import("firebase-admin/app");
  initializeApp({ projectId: PROJECT });
  const { getFirestore } = await import("firebase-admin/firestore");
  db = getFirestore();
  const functionsTest = (await import("firebase-functions-test")).default;
  const testFns = functionsTest();
  const mod = await import("../assignCourierToDelivery.js");
  wrapped = testFns.wrap(mod.assignCourierToDelivery) as never;
});

async function seedFreshWorld() {
  // Reset the delivery to pending/unassigned before each run.
  const batch = db.batch();
  batch.set(db.collection("deliveries").doc(D), {
    proposalId: P,
    status: "pending",
    courierId: null,
  });
  batch.set(db.collection("exchange_proposals").doc(P), {
    status: "accepted",
    deliveryId: D,
    fromPharmacyId: BUYER,
    toPharmacyId: SELLER,
    currencyCode: "GHS",
  });
  batch.set(db.collection("pharmacies").doc(BUYER), { countryCode: "GH", cityCode: "accra" });
  batch.set(db.collection("pharmacies").doc(SELLER), { countryCode: "GH", cityCode: "accra" });
  batch.set(db.collection("wallets").doc(BUYER), { currency: "GHS" });
  batch.set(db.collection("wallets").doc(SELLER), { currency: "GHS" });
  batch.set(db.collection("system_config").doc("main"), {
    countries: { GH: { defaultCurrencyCode: "GHS", enabled: true } },
    currencies: { GHS: { code: "GHS", enabled: true, decimals: 2 } },
  });
  for (const c of [COURIER_A, COURIER_B]) {
    batch.set(db.collection("couriers").doc(c), {
      role: "courier", isActive: true, countryCode: "GH", cityCode: "accra", fullName: c,
    });
    batch.set(db.collection("wallets").doc(c), { currency: "GHS" });
  }
  await batch.commit();
}

describe("assignCourierToDelivery — real concurrency (Firestore emulator)", () => {
  test("two concurrent claims on the same delivery → exactly one winner", async () => {
    await seedFreshWorld();

    const results = await Promise.allSettled([
      wrapped({ data: { deliveryId: D }, auth: { uid: COURIER_A, token: {} } }),
      wrapped({ data: { deliveryId: D }, auth: { uid: COURIER_B, token: {} } }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ courierId: string }>[];
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    // Exactly one success, exactly one refusal.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The loser is refused with the assignable precondition, not a crash.
    expect((rejected[0].reason as { details?: { code?: string } })?.details?.code).toBe(
      "DELIVERY_NOT_ASSIGNABLE"
    );

    // The delivery ends with EXACTLY the winner's courierId + accepted, no
    // divergent field.
    const finalSnap = await db.collection("deliveries").doc(D).get();
    const finalData = finalSnap.data()!;
    const winner = fulfilled[0].value.courierId;
    expect(finalData.status).toBe("accepted");
    expect([COURIER_A, COURIER_B]).toContain(finalData.courierId);
    expect(finalData.courierId).toBe(winner);
  });

  test("a second claim after a successful one is refused (compare-and-set holds)", async () => {
    await seedFreshWorld();
    await wrapped({ data: { deliveryId: D }, auth: { uid: COURIER_A, token: {} } });
    await expect(
      wrapped({ data: { deliveryId: D }, auth: { uid: COURIER_B, token: {} } })
    ).rejects.toMatchObject({ details: { code: "DELIVERY_NOT_ASSIGNABLE" } });
    const finalData = (await db.collection("deliveries").doc(D).get()).data()!;
    expect(finalData.courierId).toBe(COURIER_A);
  });
});
