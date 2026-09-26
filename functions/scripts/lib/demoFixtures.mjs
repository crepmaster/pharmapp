/** Pure, credential-free planning helpers for the Ordre staging demonstration. */
export const PROJECT = "mediexchange-staging";
export const MARKER = "ordre-2026-09-28";
export const ROLES = ["seller", "buyer", "courier"];
export const MIN_WALLET_UNITS = 120000; // GHS 1,200; pharmacy wallet = major × 100.

export function validateSpec(spec) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec) ||
      Object.keys(spec).sort().join(",") !== "buyer,courier,seller") {
    throw new Error("Spec must contain exactly seller, buyer and courier.");
  }
  const seen = new Set();
  for (const role of ROLES) {
    const entry = spec[role];
    if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
        !["existing", "create"].includes(entry.mode)) {
      throw new Error(`${role}: mode must be existing or create.`);
    }
    const allowed = entry.mode === "existing" ? ["mode", "uid"] : ["mode", "email"];
    if (Object.keys(entry).some((key) => !allowed.includes(key))) {
      throw new Error(`${role}: unsupported field in account spec.`);
    }
    const identity = entry.mode === "existing" ? entry.uid : entry.email;
    if (typeof identity !== "string" || !identity.trim()) {
      throw new Error(`${role}: missing ${entry.mode === "existing" ? "uid" : "email"}.`);
    }
    if (entry.mode === "create" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity)) {
      throw new Error(`${role}: invalid email.`);
    }
    if (seen.has(identity.toLowerCase())) throw new Error("Account identities must be unique.");
    seen.add(identity.toLowerCase());
  }
  return spec;
}

export function uidFor(role, entry) {
  return entry.mode === "existing" ? entry.uid.trim() : `demo-${MARKER}-${role}`;
}

export function inventoryId(role) {
  return `demo-${MARKER}-${role}-lot`;
}

export function assertConfig(config) {
  const gh = config?.countries?.GH;
  const city = config?.citiesByCountry?.GH?.kumasi;
  const currency = config?.currencies?.GHS;
  if (gh?.enabled !== true || gh.defaultCurrencyCode !== "GHS" ||
      city?.enabled !== true || city.currencyCode !== "GHS" ||
      currency?.enabled !== true || currency.decimals !== 2 ||
      !Number.isFinite(city.deliveryFee) || city.deliveryFee <= 0) {
    throw new Error("Staging GH/Kumasi/GHS config does not match demo assumptions.");
  }
  // Mirrors resolveCourierFee's city fallback for exchanges.
  const exchangeFee = Number.isFinite(city.exchangeFee) && city.exchangeFee > 0
    ? Math.round(city.exchangeFee) : Math.round(city.deliveryFee * 1.2);
  return { deliveryFee: Math.round(city.deliveryFee), exchangeFee };
}

export function assertExistingAccount(role, uid, auth, user, profile, wallet) {
  const expectedRole = role === "courier" ? "courier" : "pharmacy";
  if (!auth || auth.uid !== uid || auth.disabled || !user || !profile || !wallet) {
    throw new Error(`${role}: existing account is incomplete or disabled.`);
  }
  if (user.role !== expectedRole || profile.role !== expectedRole ||
      user.email !== auth.email || profile.email !== auth.email ||
      profile.countryCode !== "GH" || profile.cityCode !== "kumasi" ||
      wallet.currency !== "GHS") {
    throw new Error(`${role}: role, identity, territory or wallet currency mismatch.`);
  }
  if (role !== "courier" && profile.licenseStatus !== "verified") {
    throw new Error(`${role}: existing pharmacy license is not verified.`);
  }
  if (!Number.isSafeInteger(wallet.available) || wallet.available < 0 ||
      wallet.held !== 0) {
    throw new Error(`${role}: wallet balance invalid or funds currently held.`);
  }
}

export function assertFixtureCollision(path, data, role) {
  if (data && (data.demoFixture !== MARKER || data.demoRole !== role)) {
    throw new Error(`${path}: deterministic fixture ID belongs to another record.`);
  }
}

export function planWallet(role, wallet, isDedicated) {
  if (role === "courier") {
    if (wallet && (wallet.currency !== "GHS" || wallet.held !== 0 ||
        !Number.isSafeInteger(wallet.available) || wallet.available < 0)) {
      throw new Error("courier: wallet cannot be prepared safely.");
    }
    return wallet ? null : { available: 0, held: 0, currency: "GHS" };
  }
  if (!wallet) {
    if (!isDedicated) throw new Error(`${role}: existing wallet missing.`);
    return { available: MIN_WALLET_UNITS, held: 0, currency: "GHS" };
  }
  if (wallet.currency !== "GHS" || wallet.held !== 0 ||
      !Number.isSafeInteger(wallet.available) || wallet.available < 0) {
    throw new Error(`${role}: wallet cannot be prepared safely.`);
  }
  return wallet.available < MIN_WALLET_UNITS
    ? { available: MIN_WALLET_UNITS }
    : null;
}

export function planInventory(role, existing) {
  const path = `pharmacy_inventory/${inventoryId(role)}`;
  assertFixtureCollision(path, existing, role);
  // An existing fixture may already have changed through a real proposal.
  // Never reset stock or its reservation; re-running is a no-op.
  return existing ? null : role === "seller" ? {
    medicineId: "paracetamol-syrup-120mg-5ml",
    medicineName: "Paracetamol",
    medicineDosage: "120mg/5ml",
    medicineForm: "Syrup",
    medicineCategory: "Analgesics",
    quantity: 50,
    lotNumber: "DEMO-ORDRE-PARA-0926",
  } : {
    medicineId: "ibuprofen-400mg",
    medicineName: "Ibuprofen",
    medicineDosage: "400mg",
    medicineForm: "Tablet",
    medicineCategory: "Analgesics",
    quantity: 40,
    lotNumber: "DEMO-ORDRE-IBU-0926",
  };
}
