/**
 * Single source of truth for the `system_config/main` payload used by the
 * Sprint 5 emulator and real-staging seeds. Sprint 5 optimisation #6:
 * previously `seedEmulator.mjs` carried a 113-line payload and `seedStaging.mjs`
 * carried a 26-line "keep in sync" mirror — drift was inevitable. Now both
 * scripts import `SYSTEM_CONFIG` from here.
 *
 * NOTE: keep the GH/CM matrix in sync with the recette assertions
 *  (docs/release/SPRINT_5_E2E_CLOSURE_PLAN.md). The Accra entry intentionally
 * omits `exchangeFee` so the fallback `deliveryFee × 1.2` path is exercised by
 * lock #6 (courierFee 2400 in S5).
 */

export const SYSTEM_CONFIG = {
  schemaVersion: 1,
  primaryCountryCode: "CM",
  countries: {
    CM: {
      code: "CM",
      licenseRequired: false,
      defaultCurrencyCode: "XAF",
      name: "Cameroon",
      dialCode: "237",
      enabled: true,
      sortOrder: 0,
      defaultCityCode: "douala",
      providerIds: ["mtn_momo_cm"],
    },
    GH: {
      code: "GH",
      licenseRequired: true,
      licenseFormatRegex: "^GH-\\d{4}$",
      licenseGracePeriodDays: 30,
      licenseLabel: "Pharmacy Council License",
      licenseHelpText: "Enter your Pharmacy Council of Ghana license number.",
      licenseVerificationRequired: true,
      licenseDocumentRequired: true,
      defaultCurrencyCode: "GHS",
      name: "Ghana",
      dialCode: "233",
      enabled: true,
      sortOrder: 1,
      defaultCityCode: "accra",
      providerIds: ["mtn_momo_gh"],
    },
  },
  citiesByCountry: {
    CM: {
      douala: {
        code: "douala",
        name: "Douala",
        enabled: true,
        deliveryFee: 1000,
        exchangeFee: 1200,
        currencyCode: "XAF",
        sortOrder: 0,
      },
      yaounde: {
        code: "yaounde",
        name: "Yaounde",
        enabled: true,
        deliveryFee: 1000,
        exchangeFee: 1200,
        currencyCode: "XAF",
        sortOrder: 1,
      },
    },
    GH: {
      // exchangeFee absent on purpose to exercise the deliveryFee × 1.2 fallback
      accra: {
        code: "accra",
        name: "Accra",
        enabled: true,
        deliveryFee: 2000,
        currencyCode: "GHS",
        sortOrder: 0,
      },
    },
  },
  currencies: {
    XAF: {
      code: "XAF",
      name: "Central African CFA franc",
      enabled: true,
      sortOrder: 0,
      decimals: 0,
      minWithdrawalMinor: 1000,
      symbol: "FCFA",
    },
    GHS: {
      code: "GHS",
      name: "Ghanaian cedi",
      enabled: true,
      sortOrder: 1,
      decimals: 2,
      minWithdrawalMinor: 10000,
      symbol: "GH₵",
    },
  },
  mobileMoneyProviders: {
    mtn_momo_cm: {
      id: "mtn_momo_cm",
      name: "MTN Mobile Money",
      countryCode: "CM",
      currencyCode: "XAF",
      enabled: true,
      displayOrder: 0,
      requiresMsisdn: true,
      supportsCollections: true,
      supportsPayouts: true,
      methodCode: "mtn_momo",
    },
    mtn_momo_gh: {
      id: "mtn_momo_gh",
      name: "MTN Mobile Money Ghana",
      countryCode: "GH",
      currencyCode: "GHS",
      enabled: true,
      displayOrder: 0,
      requiresMsisdn: true,
      supportsCollections: true,
      supportsPayouts: true,
      methodCode: "mtn_gh",
    },
  },
};
