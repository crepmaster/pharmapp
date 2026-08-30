/**
 * Unit spec for `tradeCurrencyGuard` (phase 2, G1–G6).
 *
 * Pure function — no Firestore, no mocks. Covers the full refusal matrix,
 * the territorial-vs-monetary distinction (two different XAF countries must
 * be refused territorially even though the currency matches), the two
 * wallet.currency controls, and the snapshot revalidation.
 */
import {
  resolveTradeTerritory,
  resolveTradeCurrency,
  assertTradeCurrency,
  assertClientCurrencyMatches,
  assertCourierMatchesTrade,
  assertMatchesSnapshot,
  assertMatchesSnapshotTerritory,
  tradeCurrencyHttpsError,
  type TradePartyInput,
  type TradeSysConfig,
} from "../lib/tradeCurrencyGuard.js";

const SYS: TradeSysConfig = {
  countries: {
    CM: { defaultCurrencyCode: "XAF", enabled: true },
    GH: { defaultCurrencyCode: "GHS", enabled: true },
    // Second XAF country (Chad) — same currency as CM, different country.
    TD: { defaultCurrencyCode: "XAF", enabled: true },
    ZW: { defaultCurrencyCode: "XAF", enabled: false }, // configured but disabled
    NC: { enabled: true }, // enabled but no defaultCurrencyCode
    CI: { defaultCurrencyCode: "XOF", enabled: true }, // XOF absent from currencies
    NG: { defaultCurrencyCode: "NGN", enabled: true }, // NGN present but no `enabled`
    KE: { defaultCurrencyCode: "KES", enabled: true }, // KES disabled
  },
  currencies: {
    XAF: { code: "XAF", enabled: true, decimals: 0 },
    GHS: { code: "GHS", enabled: true, decimals: 2 },
    KES: { code: "KES", enabled: false },
    NGN: { code: "NGN" }, // no `enabled` flag
  },
};

function party(
  uid: string,
  countryCode: unknown,
  cityCode: unknown,
  walletCurrency?: unknown
): TradePartyInput {
  return { uid, countryCode, cityCode, walletCurrency };
}

// Success-path parties carry MATCHING wallets: the full guard now requires
// both wallets to exist and match the derived currency (D4 fail-closed).
const cmBuyer = party("b", "CM", "douala", "XAF");
const cmSeller = party("s", "CM", "douala", "XAF");

describe("resolveTradeTerritory — territorial-only (no wallet dimension)", () => {
  test("same country+city, wallets IGNORED → derives XAF", () => {
    // No wallet currencies supplied, and it still resolves: the territorial
    // resolver never looks at wallets. This is what the compensation paths use
    // to signal a territorial anomaly without touching wallet state.
    expect(
      resolveTradeTerritory(party("b", "CM", "douala"), party("s", "CM", "douala"), SYS)
    ).toEqual({ ok: true, currency: "XAF", countryCode: "CM", cityCode: "douala" });
  });

  test("ignores a wallet mismatch that the full guard would refuse", () => {
    expect(
      resolveTradeTerritory(
        party("b", "CM", "douala", "GHS"),
        party("s", "CM", "douala", "XAF"),
        SYS
      )
    ).toMatchObject({ ok: true, currency: "XAF" });
  });

  test("still enforces territory: two XAF countries → cross_country", () => {
    expect(
      resolveTradeTerritory(party("b", "CM", "douala"), party("s", "TD", "ndjamena"), SYS)
    ).toEqual({ ok: false, reason: "cross_country" });
  });
});

describe("resolveTradeCurrency — happy paths (wallets required)", () => {
  test("same country+city, matching wallets → derives XAF", () => {
    expect(resolveTradeCurrency(cmBuyer, cmSeller, SYS)).toEqual({
      ok: true,
      currency: "XAF",
      countryCode: "CM",
      cityCode: "douala",
    });
  });

  test("Ghana pair with GHS wallets → GHS", () => {
    expect(
      resolveTradeCurrency(
        party("b", "GH", "accra", "GHS"),
        party("s", "GH", "accra", "GHS"),
        SYS
      )
    ).toMatchObject({ ok: true, currency: "GHS" });
  });

  test("canonicalises casing/slug: 'cm'+'Douala' == 'CM'+'douala'", () => {
    expect(
      resolveTradeCurrency(
        party("b", "cm", "Douala", "XAF"),
        party("s", "CM", "douala", "XAF"),
        SYS
      )
    ).toMatchObject({ ok: true, currency: "XAF", countryCode: "CM", cityCode: "douala" });
  });
});

describe("resolveTradeCurrency — TERRITORIAL refusals (distinct from currency)", () => {
  test("different countries, different currency → cross_country", () => {
    expect(
      resolveTradeCurrency(party("b", "CM", "douala"), party("s", "GH", "accra"), SYS)
    ).toEqual({ ok: false, reason: "cross_country" });
  });

  test("KEY: two different XAF countries → cross_country, NOT allowed by equal currency", () => {
    // CM and TD both use XAF. Equal currency must NOT launder a cross-border
    // trade — this is the territorial-vs-monetary separation.
    expect(
      resolveTradeCurrency(party("b", "CM", "douala"), party("s", "TD", "ndjamena"), SYS)
    ).toEqual({ ok: false, reason: "cross_country" });
  });

  test("same country, different city → cross_city", () => {
    expect(
      resolveTradeCurrency(party("b", "CM", "douala"), party("s", "CM", "yaounde"), SYS)
    ).toEqual({ ok: false, reason: "cross_city" });
  });

  test("missing country / city → typed reason per side", () => {
    expect(resolveTradeCurrency(party("b", "", "douala"), cmSeller, SYS)).toEqual({
      ok: false,
      reason: "buyer_country_missing",
    });
    expect(resolveTradeCurrency(cmBuyer, party("s", "CM", null), SYS)).toEqual({
      ok: false,
      reason: "seller_city_missing",
    });
  });
});

describe("resolveTradeCurrency — MONETARY refusals (fail-closed, never XAF)", () => {
  test("country not enabled → country_not_enabled", () => {
    expect(
      resolveTradeCurrency(party("b", "ZW", "harare"), party("s", "ZW", "harare"), SYS)
    ).toEqual({ ok: false, reason: "country_not_enabled" });
  });

  test("enabled country with no defaultCurrencyCode → currency_unresolved", () => {
    expect(
      resolveTradeCurrency(party("b", "NC", "x"), party("s", "NC", "x"), SYS)
    ).toEqual({ ok: false, reason: "currency_unresolved" });
  });

  test("currency absent from currencies map → currency_not_configured", () => {
    expect(
      resolveTradeCurrency(party("b", "CI", "abidjan"), party("s", "CI", "abidjan"), SYS)
    ).toEqual({ ok: false, reason: "currency_not_configured" });
  });

  test("currency present but disabled → currency_disabled", () => {
    expect(
      resolveTradeCurrency(party("b", "KE", "nairobi"), party("s", "KE", "nairobi"), SYS)
    ).toEqual({ ok: false, reason: "currency_disabled" });
  });

  test("currency entry with no `enabled` flag → currency_invalid_configuration", () => {
    expect(
      resolveTradeCurrency(party("b", "NG", "lagos"), party("s", "NG", "lagos"), SYS)
    ).toEqual({ ok: false, reason: "currency_invalid_configuration" });
  });

  test("currencies map absent entirely → config_unavailable", () => {
    const noCurrencies: TradeSysConfig = {
      countries: { CM: { defaultCurrencyCode: "XAF", enabled: true } },
    };
    expect(resolveTradeCurrency(cmBuyer, cmSeller, noCurrencies)).toEqual({
      ok: false,
      reason: "config_unavailable",
    });
  });

  test("never returns 'XAF' as a fallback on any refusal", () => {
    const refusals = [
      resolveTradeCurrency(party("b", "CI", "abidjan"), party("s", "CI", "abidjan"), SYS),
      resolveTradeCurrency(party("b", "KE", "nairobi"), party("s", "KE", "nairobi"), SYS),
      resolveTradeCurrency(party("b", "NC", "x"), party("s", "NC", "x"), SYS),
    ];
    for (const r of refusals) {
      expect(r.ok).toBe(false);
      expect(JSON.stringify(r)).not.toContain("XAF");
    }
  });
});

describe("resolveTradeCurrency — the two wallet.currency controls", () => {
  test("buyer wallet contradicts derived → buyer_wallet_currency_mismatch", () => {
    expect(
      resolveTradeCurrency(
        party("b", "CM", "douala", "GHS"),
        party("s", "CM", "douala", "XAF"),
        SYS
      )
    ).toEqual({ ok: false, reason: "buyer_wallet_currency_mismatch" });
  });

  test("seller wallet contradicts derived → seller_wallet_currency_mismatch", () => {
    expect(
      resolveTradeCurrency(
        party("b", "CM", "douala", "XAF"),
        party("s", "CM", "douala", "GHS"),
        SYS
      )
    ).toEqual({ ok: false, reason: "seller_wallet_currency_mismatch" });
  });

  test("D4 fail-closed: absent buyer wallet → buyer_wallet_missing (not tolerated)", () => {
    expect(
      resolveTradeCurrency(
        party("b", "CM", "douala", null),
        party("s", "CM", "douala", "XAF"),
        SYS
      )
    ).toEqual({ ok: false, reason: "buyer_wallet_missing" });
  });

  test("D4 fail-closed: absent seller wallet → seller_wallet_missing", () => {
    expect(
      resolveTradeCurrency(
        party("b", "CM", "douala", "XAF"),
        party("s", "CM", "douala", undefined),
        SYS
      )
    ).toEqual({ ok: false, reason: "seller_wallet_missing" });
  });

  test("both wallets present + matching → ok", () => {
    expect(
      resolveTradeCurrency(
        party("b", "CM", "douala", "XAF"),
        party("s", "CM", "douala", "XAF"),
        SYS
      )
    ).toMatchObject({ ok: true, currency: "XAF" });
  });

  test("territorial refusal precedes the wallet check", () => {
    // A cross-country pair with a matching wallet must still fail territorial.
    expect(
      resolveTradeCurrency(
        party("b", "CM", "douala", "XAF"),
        party("s", "TD", "ndjamena", "XAF"),
        SYS
      )
    ).toEqual({ ok: false, reason: "cross_country" });
  });
});

describe("assertTradeCurrency — throwing wrapper", () => {
  test("returns the currency on success", () => {
    expect(assertTradeCurrency(cmBuyer, cmSeller, SYS, "test")).toEqual({
      currency: "XAF",
      countryCode: "CM",
      cityCode: "douala",
    });
  });

  test("throws failed-precondition with details.code on a territorial refusal", () => {
    try {
      assertTradeCurrency(party("b", "CM", "douala"), party("s", "GH", "accra"), SYS, "acceptX");
      throw new Error("should have thrown");
    } catch (e: any) {
      expect(e.code).toBe("failed-precondition");
      expect(e.details).toMatchObject({ code: "CROSS_COUNTRY" });
      expect(e.message).toContain("acceptX");
    }
  });

  test("maps config_unavailable to the 'unavailable' code", () => {
    const err = tradeCurrencyHttpsError("config_unavailable", "x");
    expect(err.code).toBe("unavailable");
    expect(err.details).toMatchObject({ code: "CONFIG_UNAVAILABLE" });
  });
});

describe("assertClientCurrencyMatches — client currency is an assertion, not authoritative", () => {
  test("absent client currency → no throw (server derivation stands)", () => {
    expect(() => assertClientCurrencyMatches(undefined, "XAF", "x")).not.toThrow();
    expect(() => assertClientCurrencyMatches("", "XAF", "x")).not.toThrow();
    expect(() => assertClientCurrencyMatches(null, "XAF", "x")).not.toThrow();
  });

  test("identical (any casing) → no throw", () => {
    expect(() => assertClientCurrencyMatches("XAF", "XAF", "x")).not.toThrow();
    expect(() => assertClientCurrencyMatches("xaf", "XAF", "x")).not.toThrow();
  });

  test("different → CLIENT_CURRENCY_MISMATCH (invalid-argument)", () => {
    try {
      assertClientCurrencyMatches("GHS", "XAF", "createX");
      throw new Error("should have thrown");
    } catch (e: any) {
      expect(e.code).toBe("invalid-argument");
      expect(e.details).toMatchObject({ code: "CLIENT_CURRENCY_MISMATCH" });
      expect(e.message).toContain("createX");
    }
  });
});

describe("assertCourierMatchesTrade — the third (courier) currency frontier", () => {
  const TRADE = { currency: "XAF", countryCode: "CM", cityCode: "douala" };
  const courier = (
    countryCode: unknown,
    cityCode: unknown,
    walletCurrency?: unknown
  ): TradePartyInput => ({ uid: "cour", countryCode, cityCode, walletCurrency });

  test("courier in the same country+city+currency with a matching wallet → ok", () => {
    expect(() =>
      assertCourierMatchesTrade(courier("CM", "douala", "XAF"), TRADE, SYS, "settle")
    ).not.toThrow();
  });

  test("courier in another country → COURIER_CROSS_COUNTRY", () => {
    try {
      assertCourierMatchesTrade(courier("GH", "accra", "XAF"), TRADE, SYS, "settle");
      throw new Error("should throw");
    } catch (e: any) {
      expect(e.details).toMatchObject({ code: "COURIER_CROSS_COUNTRY" });
    }
  });

  test("courier in another city → COURIER_CROSS_CITY", () => {
    try {
      assertCourierMatchesTrade(courier("CM", "yaounde", "XAF"), TRADE, SYS, "settle");
      throw new Error("should throw");
    } catch (e: any) {
      expect(e.details).toMatchObject({ code: "COURIER_CROSS_CITY" });
    }
  });

  test("courier with no country → COURIER_COUNTRY_MISSING", () => {
    try {
      assertCourierMatchesTrade(courier("", "douala", "XAF"), TRADE, SYS, "settle");
      throw new Error("should throw");
    } catch (e: any) {
      expect(e.details).toMatchObject({ code: "COURIER_COUNTRY_MISSING" });
    }
  });

  test("courier wallet absent → COURIER_WALLET_MISSING", () => {
    try {
      assertCourierMatchesTrade(courier("CM", "douala", null), TRADE, SYS, "settle");
      throw new Error("should throw");
    } catch (e: any) {
      expect(e.details).toMatchObject({ code: "COURIER_WALLET_MISSING" });
    }
  });

  test("courier wallet in another currency → COURIER_WALLET_CURRENCY_MISMATCH", () => {
    try {
      assertCourierMatchesTrade(courier("CM", "douala", "GHS"), TRADE, SYS, "settle");
      throw new Error("should throw");
    } catch (e: any) {
      expect(e.details).toMatchObject({ code: "COURIER_WALLET_CURRENCY_MISMATCH" });
    }
  });
});

describe("assertMatchesSnapshot — revalidation (G6)", () => {
  test("live currency equal to snapshot → returns it", () => {
    expect(assertMatchesSnapshot(cmBuyer, cmSeller, SYS, "XAF", "settle")).toBe("XAF");
  });

  test("territory primitive returns canonical {currency, countryCode, cityCode}", () => {
    expect(assertMatchesSnapshotTerritory(cmBuyer, cmSeller, SYS, "XAF", "assign")).toEqual({
      currency: "XAF",
      countryCode: "CM",
      cityCode: "douala",
    });
  });

  test("wrapper and primitive agree on the currency", () => {
    const prim = assertMatchesSnapshotTerritory(cmBuyer, cmSeller, SYS, "XAF", "x");
    const wrap = assertMatchesSnapshot(cmBuyer, cmSeller, SYS, "XAF", "x");
    expect(wrap).toBe(prim.currency);
  });

  test("missing snapshot → CURRENCY_SNAPSHOT_MISSING", () => {
    try {
      assertMatchesSnapshot(cmBuyer, cmSeller, SYS, "", "settle");
      throw new Error("should have thrown");
    } catch (e: any) {
      expect(e.details).toMatchObject({ code: "CURRENCY_SNAPSHOT_MISSING" });
    }
  });

  test("live drifts from snapshot → CURRENCY_SNAPSHOT_MISMATCH", () => {
    // Parties now derive GHS (with matching GHS wallets, so the live guard
    // passes), but the proposal was snapshotted as XAF → drift refusal.
    try {
      assertMatchesSnapshot(
        party("b", "GH", "accra", "GHS"),
        party("s", "GH", "accra", "GHS"),
        SYS,
        "XAF",
        "settle"
      );
      throw new Error("should have thrown");
    } catch (e: any) {
      expect(e.details).toMatchObject({ code: "CURRENCY_SNAPSHOT_MISMATCH" });
    }
  });

  test("live derivation itself failing surfaces the underlying refusal", () => {
    // A now-cross-country pair fails the live derivation before the snapshot
    // comparison.
    try {
      assertMatchesSnapshot(
        party("b", "CM", "douala"),
        party("s", "GH", "accra"),
        SYS,
        "XAF",
        "settle"
      );
      throw new Error("should have thrown");
    } catch (e: any) {
      expect(e.details).toMatchObject({ code: "CROSS_COUNTRY" });
    }
  });
});
