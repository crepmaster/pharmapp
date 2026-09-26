import test from "node:test";
import assert from "node:assert/strict";
import {
  MARKER, PROJECT, MIN_WALLET_UNITS, validateSpec, uidFor, inventoryId,
  assertConfig, assertExistingAccount, assertFixtureCollision,
  planWallet, planInventory,
} from "./lib/demoFixtures.mjs";

const spec = {
  seller: { mode: "existing", uid: "seller-uid" },
  buyer: { mode: "create", email: "demo-buyer@example.test" },
  courier: { mode: "create", email: "demo-courier@example.test" },
};

test("spec resolves stable IDs and rejects duplicate identities or unknown fields", () => {
  assert.equal(PROJECT, "mediexchange-staging");
  assert.deepEqual(validateSpec(spec), spec);
  assert.equal(uidFor("seller", spec.seller), "seller-uid");
  assert.equal(uidFor("buyer", spec.buyer), `demo-${MARKER}-buyer`);
  assert.equal(inventoryId("seller"), `demo-${MARKER}-seller-lot`);
  assert.throws(() => validateSpec({ ...spec, courier: { mode: "existing", uid: "seller-uid" } }), /unique/);
  assert.throws(() => validateSpec({ ...spec, admin: {} }), /exactly/);
  assert.throws(() => validateSpec({ ...spec, seller: { mode: "existing", uid: "s", password: "bad" } }), /unsupported/);
});

test("GH/Kumasi/GHS policy is required before any fixture can be planned", () => {
  const config = {
    countries: { GH: { enabled: true, defaultCurrencyCode: "GHS" } },
    citiesByCountry: { GH: { kumasi: { enabled: true, currencyCode: "GHS", deliveryFee: 20, exchangeFee: 24 } } },
    currencies: { GHS: { enabled: true, decimals: 2 } },
  };
  assert.deepEqual(assertConfig(config), { deliveryFee: 20, exchangeFee: 24 });
  const withoutExplicitExchangeFee = {
    ...config,
    citiesByCountry: { GH: { kumasi: { enabled: true, currencyCode: "GHS", deliveryFee: 21 } } },
  };
  assert.deepEqual(assertConfig(withoutExplicitExchangeFee), { deliveryFee: 21, exchangeFee: 25 });
  assert.throws(() => assertConfig({ ...config, currencies: { GHS: { enabled: true, decimals: 0 } } }), /assumptions/);
});

test("existing account refuses wrong territory, currency, role, incomplete or held wallet", () => {
  const auth = { uid: "s", email: "s@example.test", disabled: false };
  const user = { role: "pharmacy", email: auth.email };
  const profile = { ...user, countryCode: "GH", cityCode: "kumasi", licenseStatus: "verified" };
  const wallet = { currency: "GHS", available: 100, held: 0 };
  assert.doesNotThrow(() => assertExistingAccount("seller", "s", auth, user, profile, wallet));
  assert.throws(() => assertExistingAccount("seller", "s", auth, user,
    { ...profile, cityCode: "accra" }, wallet), /mismatch/);
  assert.throws(() => assertExistingAccount("seller", "s", auth, user, profile,
    { ...wallet, held: 1 }), /held/);
  assert.throws(() => assertExistingAccount("seller", "s", auth, user,
    { ...profile, licenseStatus: "expired" }, wallet), /license/);
  assert.throws(() => assertExistingAccount("seller", "s", null, user, profile, wallet), /incomplete/);
});

test("wallet plan tops up only below demo minimum and refuses held or wrong-currency money", () => {
  assert.deepEqual(planWallet("seller", { currency: "GHS", available: 0, held: 0 }, false),
    { available: MIN_WALLET_UNITS });
  assert.equal(planWallet("buyer", { currency: "GHS", available: MIN_WALLET_UNITS + 1, held: 0 }, false), null);
  assert.equal(planWallet("courier", { currency: "GHS", available: 0, held: 0 }, true), null);
  assert.throws(() => planWallet("seller", { currency: "XAF", available: 0, held: 0 }, true), /safely/);
  assert.throws(() => planWallet("seller", { currency: "GHS", available: 0, held: 1 }, true), /safely/);
  assert.throws(() => planWallet("courier", { currency: "XAF", available: 0, held: 0 }, true), /safely/);
});

test("only marked fixture lots can be re-run, without resetting consumed quantities", () => {
  assert.equal(planInventory("seller", null).medicineId, "paracetamol-syrup-120mg-5ml");
  assert.equal(planInventory("buyer", null).medicineId, "ibuprofen-400mg");
  assert.equal(planInventory("seller", { demoFixture: MARKER, demoRole: "seller", availableQuantity: 2 }), null);
  assert.throws(() => assertFixtureCollision("pharmacy_inventory/x", { pharmacyId: "someone" }, "seller"), /another record/);
});
