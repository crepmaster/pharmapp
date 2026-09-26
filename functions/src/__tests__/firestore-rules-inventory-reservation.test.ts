/** Inventory reservations are mutated only by transaction-backed Functions. */
import fs from "fs";
import path from "path";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";

const OWNER = "reserved-lot-owner";
const ITEM = "reserved-lot";
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-pharmapp-rules-inventory-reservation",
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, "../../../firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  if (env) await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `pharmacies/${OWNER}`), {
      subscriptionStatus: "active",
      hasActiveSubscription: true,
      subscriptionEndDate: new Date(Date.now() + 86400000),
    });
    await setDoc(doc(ctx.firestore(), `pharmacy_inventory/${ITEM}`), {
      pharmacyId: OWNER,
      medicineId: "amoxicillin",
      availableQuantity: 7,
      reservedQuantity: 3,
      batch: { lotNumber: "LOT-1", expirationDate: new Date("2027-12-01") },
      availabilitySettings: { availableForExchange: true },
    });
  });
});

test("owner may replenish available stock and unpublish a reserved lot", async () => {
  const item = doc(env.authenticatedContext(OWNER).firestore(), `pharmacy_inventory/${ITEM}`);
  await assertSucceeds(updateDoc(item, { availableQuantity: 10 }));
  await assertSucceeds(updateDoc(item, { "availabilitySettings.availableForExchange": false }));
});

test("owner cannot alter reserved quantity, medicine, batch or delete committed lot", async () => {
  const item = doc(env.authenticatedContext(OWNER).firestore(), `pharmacy_inventory/${ITEM}`);
  await assertFails(updateDoc(item, { reservedQuantity: 0 }));
  await assertFails(updateDoc(item, { reservedQuantity: 4 }));
  await assertFails(updateDoc(item, { medicineId: "other" }));
  await assertFails(updateDoc(item, { "batch.lotNumber": "LOT-2" }));
  await assertFails(deleteDoc(item));
});

test("new client inventory cannot seed an artificial reservation", async () => {
  const item = doc(env.authenticatedContext(OWNER).firestore(), "pharmacy_inventory/new-lot");
  await assertFails(setDoc(item, {
    pharmacyId: OWNER,
    medicineId: "amoxicillin",
    availableQuantity: 4,
    reservedQuantity: 3,
    batch: { lotNumber: "LOT-NEW" },
  }));
  await assertSucceeds(setDoc(item, {
    pharmacyId: OWNER,
    medicineId: "amoxicillin",
    availableQuantity: 4,
    batch: { lotNumber: "LOT-NEW" },
  }));
});

test("unreserved lot can still be deleted", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), `pharmacy_inventory/${ITEM}`), { reservedQuantity: 0 });
  });
  await assertSucceeds(deleteDoc(doc(env.authenticatedContext(OWNER).firestore(), `pharmacy_inventory/${ITEM}`)));
});
