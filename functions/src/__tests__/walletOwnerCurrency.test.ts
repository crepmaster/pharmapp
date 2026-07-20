/**
 * Tests for `resolveCurrencyForWalletOwner` — the identity + country half
 * of currency derivation.
 *
 * NOT WIRED ANYWHERE YET, on purpose. `couriers/{uid}.countryCode` is
 * client-writable (firestore.rules allows owner update, and
 * isValidCourierData does not constrain the field), so this resolver must
 * not drive wallet creation until that is hardened. These tests lock the
 * contract in the meantime.
 */
import {
  resolveCurrencyForWalletOwner,
  normaliseOwnerRole,
  walletOwnerRefusalHttpStatus,
} from "../lib/walletOwnerCurrency.js";

const SYSCONFIG = {
  countries: {
    CM: { defaultCurrencyCode: "XAF" },
    GH: { defaultCurrencyCode: "GHS" },
    ZW: {}, // configured country with no defaultCurrencyCode
    // Countries pointing at currencies that are NOT usable. A country
    // referencing a code proves nothing about the platform supporting it.
    KE: { defaultCurrencyCode: "KES" }, // currencies.KES disabled
    NG: { defaultCurrencyCode: "NGN" }, // currencies.NGN missing `enabled`
    CI: { defaultCurrencyCode: "XOF" }, // currencies.XOF absent entirely
  },
  currencies: {
    XAF: { code: "XAF", enabled: true, decimals: 0 },
    GHS: { code: "GHS", enabled: true, decimals: 2 },
    KES: { code: "KES", enabled: false, decimals: 2 },
    NGN: { code: "NGN", decimals: 2 },
  },
};

/**
 * Builds a Firestore stub from a flat `"collection/doc"` map. Absent keys
 * resolve to a non-existent document; a value of `"THROW"` makes the read
 * reject, to exercise the infrastructure-failure branches.
 */
function stubDb(docs: Record<string, unknown>) {
  const reads: string[] = [];
  return {
    reads,
    db: {
      collection: (c: string) => ({
        doc: (d: string) => ({
          get: async () => {
            const key = `${c}/${d}`;
            reads.push(key);
            const value = docs[key];
            if (value === "THROW") throw new Error("UNAVAILABLE");
            if (value === undefined) return { exists: false, data: () => undefined };
            return { exists: true, data: () => value };
          },
        }),
      }),
    } as never,
  };
}

const SYS = { "system_config/main": SYSCONFIG };

describe("normaliseOwnerRole", () => {
  test("maps wallet-owning roles", () => {
    expect(normaliseOwnerRole("pharmacy")).toBe("pharmacy");
    expect(normaliseOwnerRole("courier")).toBe("courier");
  });

  test("is tolerant to case and padding from either producer", () => {
    expect(normaliseOwnerRole("  Pharmacy ")).toBe("pharmacy");
    expect(normaliseOwnerRole("COURIER")).toBe("courier");
  });

  test("marks admin roles ineligible rather than unusable", () => {
    // The distinction matters: "ineligible" is a definitive refusal,
    // null falls through to the legacy probe.
    expect(normaliseOwnerRole("admin")).toBe("ineligible");
    expect(normaliseOwnerRole("super_admin")).toBe("ineligible");
  });

  test("returns null for unusable values", () => {
    for (const v of ["", "   ", "wizard", null, undefined, 42, {}, []]) {
      expect(normaliseOwnerRole(v)).toBeNull();
    }
  });
});

describe("resolveCurrencyForWalletOwner — happy paths", () => {
  test("resolves a pharmacy via users.role", async () => {
    const { db } = stubDb({
      "users/u1": { role: "pharmacy" },
      "pharmacies/u1": { countryCode: "CM" },
      ...SYS,
    });
    await expect(resolveCurrencyForWalletOwner(db, "u1")).resolves.toEqual({
      ok: true,
      currency: "XAF",
      countryCode: "CM",
      ownerType: "pharmacy",
      identitySource: "users_role",
    });
  });

  test("resolves a Ghanaian courier to GHS, not XAF", async () => {
    // The regression this whole sprint exists for.
    const { db } = stubDb({
      "users/u2": { role: "courier" },
      "couriers/u2": { countryCode: "GH" },
      ...SYS,
    });
    await expect(resolveCurrencyForWalletOwner(db, "u2")).resolves.toEqual({
      ok: true,
      currency: "GHS",
      countryCode: "GH",
      ownerType: "courier",
      identitySource: "users_role",
    });
  });

  test("accepts the client-written userType when role is absent", async () => {
    const { db } = stubDb({
      "users/u3": { userType: "courier" },
      "couriers/u3": { countryCode: "GH" },
      ...SYS,
    });
    const r = await resolveCurrencyForWalletOwner(db, "u3");
    expect(r).toMatchObject({ ok: true, currency: "GHS", identitySource: "users_role" });
  });

  test("trims a padded countryCode", async () => {
    const { db } = stubDb({
      "users/u4": { role: "courier" },
      "couriers/u4": { countryCode: "  GH  " },
      ...SYS,
    });
    const r = await resolveCurrencyForWalletOwner(db, "u4");
    expect(r).toMatchObject({ ok: true, currency: "GHS", countryCode: "GH" });
  });
});

describe("resolveCurrencyForWalletOwner — legacy probe", () => {
  test("falls back to probing when users/{uid} is absent", async () => {
    const { db } = stubDb({
      "couriers/u5": { countryCode: "GH" },
      ...SYS,
    });
    const r = await resolveCurrencyForWalletOwner(db, "u5");
    expect(r).toMatchObject({
      ok: true,
      currency: "GHS",
      ownerType: "courier",
      identitySource: "legacy_probe",
    });
  });

  test("falls back when the declared role is unusable", async () => {
    const { db } = stubDb({
      "users/u6": { role: "wizard" },
      "pharmacies/u6": { countryCode: "CM" },
      ...SYS,
    });
    const r = await resolveCurrencyForWalletOwner(db, "u6");
    expect(r).toMatchObject({ ok: true, ownerType: "pharmacy", identitySource: "legacy_probe" });
  });

  test("does NOT probe when users.role is usable", async () => {
    // Guards the read-count benefit of the canonical source.
    const { db, reads } = stubDb({
      "users/u7": { role: "courier" },
      "couriers/u7": { countryCode: "GH" },
      ...SYS,
    });
    await resolveCurrencyForWalletOwner(db, "u7");
    expect(reads).not.toContain("pharmacies/u7");
  });

  test("refuses when the uid exists in BOTH role collections", async () => {
    const { db } = stubDb({
      "pharmacies/u8": { countryCode: "CM" },
      "couriers/u8": { countryCode: "GH" },
      ...SYS,
    });
    await expect(resolveCurrencyForWalletOwner(db, "u8")).resolves.toEqual({
      ok: false,
      reason: "ambiguous_owner",
    });
  });
});

describe("resolveCurrencyForWalletOwner — refusals", () => {
  test("refuses admins outright, without probing", async () => {
    const { db, reads } = stubDb({ "users/a1": { role: "admin" }, ...SYS });
    await expect(resolveCurrencyForWalletOwner(db, "a1")).resolves.toEqual({
      ok: false,
      reason: "owner_not_eligible",
    });
    expect(reads).not.toContain("pharmacies/a1");
    expect(reads).not.toContain("couriers/a1");
  });

  test("refuses an unknown uid", async () => {
    const { db } = stubDb({ ...SYS });
    await expect(resolveCurrencyForWalletOwner(db, "ghost")).resolves.toEqual({
      ok: false,
      reason: "owner_not_found",
    });
  });

  test("refuses when the declared role has no profile document", async () => {
    const { db } = stubDb({ "users/u9": { role: "pharmacy" }, ...SYS });
    const r = await resolveCurrencyForWalletOwner(db, "u9");
    expect(r).toMatchObject({ ok: false, reason: "owner_not_found", ownerType: "pharmacy" });
  });

  test("refuses when countryCode is missing, empty or non-string", async () => {
    for (const [i, country] of [undefined, "", "   ", 42, null].entries()) {
      const uid = `nc${i}`;
      const { db } = stubDb({
        [`users/${uid}`]: { role: "courier" },
        [`couriers/${uid}`]: country === undefined ? {} : { countryCode: country },
        ...SYS,
      });
      const r = await resolveCurrencyForWalletOwner(db, uid);
      expect(r).toMatchObject({ ok: false, reason: "country_missing" });
    }
  });

  test("refuses a country absent from system_config", async () => {
    const { db } = stubDb({
      "users/u10": { role: "courier" },
      "couriers/u10": { countryCode: "ZZ" }, // not in countries at all
      ...SYS,
    });
    const r = await resolveCurrencyForWalletOwner(db, "u10");
    expect(r).toMatchObject({ ok: false, reason: "country_unknown" });
  });

  test("refuses a configured country with no default currency", async () => {
    const { db } = stubDb({
      "users/u11": { role: "courier" },
      "couriers/u11": { countryCode: "ZW" },
      ...SYS,
    });
    const r = await resolveCurrencyForWalletOwner(db, "u11");
    expect(r).toMatchObject({ ok: false, reason: "country_unknown" });
  });
});

describe("resolveCurrencyForWalletOwner — derived currency must be usable", () => {
  // A country naming a currency does not prove the platform operates in it.
  // Without this layer, `GH -> GHS` would succeed even with `currencies.GHS`
  // absent or disabled, minting a wallet in an unsupported currency.

  test("refuses when the country's currency is absent from currencies", async () => {
    const { db } = stubDb({
      "users/c1": { role: "courier" },
      "couriers/c1": { countryCode: "CI" }, // -> XOF, not in currencies
      ...SYS,
    });
    const r = await resolveCurrencyForWalletOwner(db, "c1");
    expect(r).toMatchObject({ ok: false, reason: "currency_not_configured" });
  });

  test("refuses when the country's currency is disabled", async () => {
    const { db } = stubDb({
      "users/c2": { role: "courier" },
      "couriers/c2": { countryCode: "KE" }, // -> KES, enabled: false
      ...SYS,
    });
    const r = await resolveCurrencyForWalletOwner(db, "c2");
    expect(r).toMatchObject({ ok: false, reason: "currency_disabled" });
  });

  test("refuses when the currency entry has no usable `enabled` flag", async () => {
    const { db } = stubDb({
      "users/c3": { role: "courier" },
      "couriers/c3": { countryCode: "NG" }, // -> NGN, `enabled` missing
      ...SYS,
    });
    const r = await resolveCurrencyForWalletOwner(db, "c3");
    expect(r).toMatchObject({ ok: false, reason: "currency_invalid_configuration" });
  });

  test("treats a missing currencies map as config_unavailable, not success", async () => {
    const { db } = stubDb({
      "users/c4": { role: "courier" },
      "couriers/c4": { countryCode: "GH" },
      "system_config/main": { countries: { GH: { defaultCurrencyCode: "GHS" } } },
    });
    const r = await resolveCurrencyForWalletOwner(db, "c4");
    expect(r).toMatchObject({ ok: false, reason: "config_unavailable" });
  });

  test("never falls back to XAF on any currency refusal", async () => {
    for (const cc of ["CI", "KE", "NG"]) {
      const uid = `nofallback_${cc}`;
      const { db } = stubDb({
        [`users/${uid}`]: { role: "courier" },
        [`couriers/${uid}`]: { countryCode: cc },
        ...SYS,
      });
      const r = await resolveCurrencyForWalletOwner(db, uid);
      expect(r.ok).toBe(false);
      expect(JSON.stringify(r)).not.toContain("XAF");
    }
  });

  test("succeeds only when the currency is explicitly enabled", async () => {
    const { db } = stubDb({
      "users/c5": { role: "courier" },
      "couriers/c5": { countryCode: "GH" },
      ...SYS,
    });
    await expect(resolveCurrencyForWalletOwner(db, "c5")).resolves.toEqual({
      ok: true,
      currency: "GHS",
      countryCode: "GH",
      ownerType: "courier",
      identitySource: "users_role",
    });
  });

  test("refuses empty / non-string uids without touching Firestore", async () => {
    const { db, reads } = stubDb({ ...SYS });
    for (const bad of ["", "   ", null, undefined]) {
      await expect(
        resolveCurrencyForWalletOwner(db, bad as never)
      ).resolves.toEqual({ ok: false, reason: "owner_not_found" });
    }
    expect(reads).toHaveLength(0);
  });
});

describe("resolveCurrencyForWalletOwner — infrastructure failures", () => {
  test("fails closed when users/{uid} read throws", async () => {
    const { db } = stubDb({ "users/u12": "THROW", ...SYS });
    await expect(resolveCurrencyForWalletOwner(db, "u12")).resolves.toEqual({
      ok: false,
      reason: "config_unavailable",
    });
  });

  test("fails closed when the probe throws", async () => {
    const { db } = stubDb({ "pharmacies/u13": "THROW", ...SYS });
    const r = await resolveCurrencyForWalletOwner(db, "u13");
    expect(r).toMatchObject({ ok: false, reason: "config_unavailable" });
  });

  test("fails closed when system_config is missing", async () => {
    const { db } = stubDb({
      "users/u14": { role: "courier" },
      "couriers/u14": { countryCode: "GH" },
    });
    const r = await resolveCurrencyForWalletOwner(db, "u14");
    expect(r).toMatchObject({ ok: false, reason: "config_unavailable" });
  });

  test("fails closed when system_config read throws", async () => {
    const { db } = stubDb({
      "users/u15": { role: "courier" },
      "couriers/u15": { countryCode: "GH" },
      "system_config/main": "THROW",
    });
    const r = await resolveCurrencyForWalletOwner(db, "u15");
    expect(r).toMatchObject({ ok: false, reason: "config_unavailable" });
  });
});

describe("walletOwnerRefusalHttpStatus", () => {
  test("503 only for server-side unavailability", () => {
    expect(walletOwnerRefusalHttpStatus("config_unavailable")).toBe(503);
  });

  test("404 for an unknown owner, 409 for contradictory data", () => {
    expect(walletOwnerRefusalHttpStatus("owner_not_found")).toBe(404);
    expect(walletOwnerRefusalHttpStatus("ambiguous_owner")).toBe(409);
  });

  test("422 for the caller-visible refusals", () => {
    expect(walletOwnerRefusalHttpStatus("owner_not_eligible")).toBe(422);
    expect(walletOwnerRefusalHttpStatus("country_missing")).toBe(422);
    expect(walletOwnerRefusalHttpStatus("country_unknown")).toBe(422);
    expect(walletOwnerRefusalHttpStatus("currency_not_configured")).toBe(422);
    expect(walletOwnerRefusalHttpStatus("currency_disabled")).toBe(422);
    expect(walletOwnerRefusalHttpStatus("currency_invalid_configuration")).toBe(422);
  });
});
