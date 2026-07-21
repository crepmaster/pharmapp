/**
 * Lot 2 — Firestore rules: terminal delivery statuses are backend-only.
 *
 * The assigned-courier update branch used to restrict WHICH FIELDS could be
 * written but not WHICH VALUES `status` could take. A courier could therefore
 * write `delivered`, `failed` or `cancelled` straight to the document,
 * bypassing the settlement and the compensation entirely — leaving the
 * proposal, the wallet and the reserved stock out of sync with a delivery
 * that claimed to be finished.
 *
 * These three statuses now belong exclusively to `completeExchangeDelivery`
 * and `terminateExchangeDelivery`, which run through the Admin SDK and are
 * not subject to these rules. Non-terminal steps stay client-writable so the
 * courier UI keeps working; the full transition matrix is a later lot.
 */
import fs from "fs";
import path from "path";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

let testEnv: RulesTestEnvironment;

const COURIER_UID = "courier-lot2";
const OTHER_COURIER_UID = "other-courier-lot2";
const SUPER_ADMIN_UID = "superadmin-lot2";
const BUYER_UID = "buyer-lot2";
const SELLER_UID = "seller-lot2";
const DELIVERY_ID = "delivery-lot2";
const PROPOSAL_ID = "proposal-lot2";

const ASSIGNED_DELIVERY = Object.freeze({
  proposalId: "p-lot2",
  fromPharmacyId: "buyer-lot2",
  toPharmacyId: "seller-lot2",
  courierId: COURIER_UID,
  status: "picked_up",
  courierFee: 20,
  totalPrice: 50,
  currency: "GHS",
  cityCode: "accra",
});

beforeAll(async () => {
  const rulesPath = path.resolve(__dirname, "../../../firestore.rules");
  const rules = fs.readFileSync(rulesPath, "utf8");
  testEnv = await initializeTestEnvironment({
    // Own projectId — jest runs test files in parallel workers against the
    // same emulator, and a shared projectId means one file's
    // `clearFirestore()` wipes another's seed mid-test.
    projectId: "demo-pharmapp-rules-lot2",
    firestore: { rules, host: "127.0.0.1", port: 8080 },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  if (testEnv) await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), `deliveries/${DELIVERY_ID}`),
      ASSIGNED_DELIVERY
    );
    await setDoc(doc(ctx.firestore(), `couriers/${COURIER_UID}`), {
      email: "c@example.test",
      role: "courier",
      countryCode: "GH",
      operatingCity: "Accra",
    });
    // A REAL super_admin, so the admin branch of the rules is exercised by
    // an authenticated client context rather than by disabling the rules.
    await setDoc(doc(ctx.firestore(), `admins/${SUPER_ADMIN_UID}`), {
      email: "sa@example.test",
      role: "super_admin",
      isActive: true,
    });
    // Both trade parties hold an active subscription: the previous rules
    // granted them an unrestricted update, so the tests below must fail for
    // the RIGHT reason (writes are now backend-only), not because the
    // subscription predicate happened to be false.
    for (const uid of [BUYER_UID, SELLER_UID]) {
      await setDoc(doc(ctx.firestore(), `pharmacies/${uid}`), {
        email: `${uid}@example.test`,
        role: "pharmacy",
        subscriptionStatus: "active",
        hasActiveSubscription: true,
        subscriptionEndDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      });
    }
    await setDoc(doc(ctx.firestore(), `exchange_proposals/${PROPOSAL_ID}`), {
      fromPharmacyId: BUYER_UID,
      toPharmacyId: SELLER_UID,
      deliveryId: DELIVERY_ID,
      status: "accepted",
      reservations: { walletReserved: 50, inventoryReserved: null },
      details: { type: "purchase", totalPrice: 50, currency: "GHS" },
    });
  });
});

function asCourier() {
  return doc(
    testEnv.authenticatedContext(COURIER_UID).firestore(),
    `deliveries/${DELIVERY_ID}`
  );
}

describe("REQ-LOT2 — assigned courier cannot write a TERMINAL status", () => {
  test("REQ-LOT2-001: status → 'delivered' DENIED (settlement is backend-only)", async () => {
    await assertFails(updateDoc(asCourier(), { status: "delivered" }));
  });

  test("REQ-LOT2-002: status → 'failed' DENIED (compensation is backend-only)", async () => {
    await assertFails(
      updateDoc(asCourier(), { status: "failed", failureReason: "accident" })
    );
  });

  test("REQ-LOT2-003: status → 'cancelled' DENIED", async () => {
    await assertFails(updateDoc(asCourier(), { status: "cancelled" }));
  });

  test("REQ-LOT2-004: 'delivered' stays denied even alongside allowed fields", async () => {
    // The field whitelist alone used to let this through — proving the
    // value check, not the key check, is what denies it.
    await assertFails(
      updateDoc(asCourier(), {
        status: "delivered",
        deliveredAt: new Date(),
        proofImages: ["a"],
      })
    );
  });
});

describe("REQ-LOT2 — non-terminal steps still work for the courier UI", () => {
  test("REQ-LOT2-005: status → 'in_transit' ALLOWED", async () => {
    await assertSucceeds(updateDoc(asCourier(), { status: "in_transit" }));
  });

  test("REQ-LOT2-006: status → 'picked_up' with pickedUpAt ALLOWED", async () => {
    await assertSucceeds(
      updateDoc(asCourier(), { status: "picked_up", pickedUpAt: new Date() })
    );
  });

  test("REQ-LOT2-007: issue reporting fields ALLOWED", async () => {
    await assertSucceeds(
      updateDoc(asCourier(), { hasIssue: true, lastIssueReportedAt: new Date() })
    );
  });
});

describe("REQ-LOT2 — the pre-existing protections are unchanged", () => {
  test("REQ-LOT2-008: a courier who is NOT assigned cannot update at all", async () => {
    const other = doc(
      testEnv.authenticatedContext(OTHER_COURIER_UID).firestore(),
      `deliveries/${DELIVERY_ID}`
    );
    await assertFails(updateDoc(other, { status: "in_transit" }));
  });

  test("REQ-LOT2-009: financial fields remain unwritable", async () => {
    await assertFails(updateDoc(asCourier(), { courierFee: 9999 }));
    await assertFails(updateDoc(asCourier(), { currency: "XAF" }));
  });

  test("REQ-LOT2-010: the Admin SDK bypasses rules and CAN set a terminal status", async () => {
    // This is how the callables write it — proving the rule constrains
    // clients only, and that the backend path is not broken by this lot.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await assertSucceeds(
        updateDoc(doc(ctx.firestore(), `deliveries/${DELIVERY_ID}`), {
          status: "failed",
        })
      );
    });
  });
});

describe("REQ-LOT2 — super_admin client cannot write a terminal status either", () => {
  function asSuperAdmin(path: string) {
    return doc(
      testEnv.authenticatedContext(SUPER_ADMIN_UID).firestore(),
      path
    );
  }

  test("REQ-LOT2-011: super_admin → 'delivered' DENIED", async () => {
    // The admin branch used to be an unconditional `|| isSuperAdmin(...)`,
    // which bypassed deliveryStatusNotTerminal entirely. Proven here with a
    // genuinely authenticated admin context, NOT withSecurityRulesDisabled —
    // the latter proves nothing about the rule.
    await assertFails(
      updateDoc(asSuperAdmin(`deliveries/${DELIVERY_ID}`), {
        status: "delivered",
      })
    );
  });

  test("REQ-LOT2-012: super_admin → 'failed' + compensation markers DENIED", async () => {
    await assertFails(
      updateDoc(asSuperAdmin(`deliveries/${DELIVERY_ID}`), {
        status: "failed",
        compensationStatus: "completed",
        compensationVersion: 1,
      })
    );
  });

  test("REQ-LOT2-013: super_admin CAN still perform non-terminal repairs", async () => {
    // The lot restricts the value, not the admin's usefulness.
    await assertSucceeds(
      updateDoc(asSuperAdmin(`deliveries/${DELIVERY_ID}`), {
        status: "in_transit",
        notes: "admin repair",
      })
    );
  });
});

describe("REQ-LOT2 — exchange_proposals is backend-only", () => {
  function asParty(uid: string) {
    return doc(
      testEnv.authenticatedContext(uid).firestore(),
      `exchange_proposals/${PROPOSAL_ID}`
    );
  }

  // Each of these was permitted before this lot: the update rule had no
  // field whitelist at all, only a subscription check.
  test("REQ-LOT2-014: party cannot write status", async () => {
    await assertFails(updateDoc(asParty(BUYER_UID), { status: "cancelled" }));
    await assertFails(updateDoc(asParty(SELLER_UID), { status: "cancelled" }));
  });

  test("REQ-LOT2-015: party cannot clear reservations", async () => {
    // The dangerous pair: cancelled + reservations null with no compensation
    // released the proposal on paper while the money stayed in `deducted`.
    await assertFails(
      updateDoc(asParty(BUYER_UID), { status: "cancelled", reservations: null })
    );
  });

  test("REQ-LOT2-016: party cannot repoint deliveryId", async () => {
    await assertFails(
      updateDoc(asParty(BUYER_UID), { deliveryId: "another-delivery" })
    );
  });

  test("REQ-LOT2-017: party cannot forge compensation markers", async () => {
    await assertFails(
      updateDoc(asParty(BUYER_UID), {
        compensatedAt: new Date(),
        compensationVersion: 1,
      })
    );
  });

  test("REQ-LOT2-018: party cannot alter the currency or the amounts", async () => {
    await assertFails(
      updateDoc(asParty(BUYER_UID), {
        details: { type: "purchase", totalPrice: 1, currency: "XAF" },
      })
    );
  });

  test("REQ-LOT2-019: party cannot create or delete a proposal directly", async () => {
    await assertFails(
      setDoc(
        doc(
          testEnv.authenticatedContext(BUYER_UID).firestore(),
          "exchange_proposals/forged"
        ),
        { fromPharmacyId: BUYER_UID, status: "accepted" }
      )
    );
    await assertFails(deleteDoc(asParty(BUYER_UID)));
  });

  test("REQ-LOT2-020: reading a proposal is still allowed", async () => {
    // The lock is on writes only — the UI must keep displaying proposals.
    await assertSucceeds(getDoc(asParty(BUYER_UID)));
  });

  test("REQ-LOT2-021: the Admin SDK still writes proposals (callable path)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await assertSucceeds(
        updateDoc(doc(ctx.firestore(), `exchange_proposals/${PROPOSAL_ID}`), {
          status: "cancelled",
          reservations: null,
        })
      );
    });
  });
});
