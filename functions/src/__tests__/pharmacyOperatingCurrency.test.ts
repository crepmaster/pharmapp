import { assertOwnerOperatingCurrency, assertPharmacyOperatingCurrency } from "../lib/pharmacyOperatingCurrency.js";

const config = {
  countries: {
    GH: { enabled: true, defaultCurrencyCode: "GHS" },
    CM: { enabled: true, defaultCurrencyCode: "XAF" },
  },
  currencies: {
    GHS: { enabled: true, decimals: 2 },
    XAF: { enabled: true, decimals: 0 },
  },
};

describe("pharmacy operating currency", () => {
  test("derives the only valid currency from each country", () => {
    expect(assertPharmacyOperatingCurrency({ countryCode: "GH" }, config)).toBe("GHS");
    expect(assertPharmacyOperatingCurrency({ countryCode: "CM" }, config)).toBe("XAF");
  });

  test("refuses a payment snapshot from another country", () => {
    expect(() => assertPharmacyOperatingCurrency(
      { countryCode: "GH" }, config, "XAF", { currency: "GHS" }
    )).toThrow("Currency does not match the wallet owner's country.");
  });

  test("refuses a preexisting wallet from another currency", () => {
    expect(() => assertPharmacyOperatingCurrency(
      { countryCode: "CM" }, config, "XAF", { currency: "GHS" }
    )).toThrow("Wallet currency does not match the owner's country.");
  });

  test("refuses a Cameroon courier withdrawal through a GHS provider", () => {
    expect(() => assertOwnerOperatingCurrency(
      { countryCode: "CM" }, config, "GHS", { currency: "GHS" }
    )).toThrow("Currency does not match the wallet owner's country.");
  });

  test("fails closed when country or currency is disabled or unknown", () => {
    expect(() => assertPharmacyOperatingCurrency({ countryCode: "ZZ" }, config)).toThrow();
    expect(() => assertPharmacyOperatingCurrency({ countryCode: "GH" }, {
      ...config,
      currencies: { ...config.currencies, GHS: { enabled: false } },
    })).toThrow();
  });
});
