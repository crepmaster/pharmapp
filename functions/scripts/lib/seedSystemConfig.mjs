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
      bafoussam: {
        code: "bafoussam",
        name: "Bafoussam",
        enabled: true,
        deliveryFee: 1500,
        exchangeFee: 1800,
        currencyCode: "XAF",
        sortOrder: 2,
      },
      bamenda: {
        code: "bamenda",
        name: "Bamenda",
        enabled: true,
        deliveryFee: 1800,
        exchangeFee: 2200,
        currencyCode: "XAF",
        sortOrder: 3,
      },
    },
    GH: {
      // Accra keeps `exchangeFee` absent on purpose so lock #6 exercises
      // the `deliveryFee × 1.2` fallback via `resolveCourierFee` (proven
      // in the Sprint 5 recette: courierFee=2400). Other cities get
      // explicit exchangeFee so their runtime cost is deterministic.
      accra: {
        code: "accra",
        name: "Accra",
        enabled: true,
        deliveryFee: 2000,
        currencyCode: "GHS",
        sortOrder: 0,
      },
      kumasi: {
        code: "kumasi",
        name: "Kumasi",
        enabled: true,
        deliveryFee: 2000,
        exchangeFee: 2400,
        currencyCode: "GHS",
        sortOrder: 1,
      },
      tamale: {
        code: "tamale",
        name: "Tamale",
        enabled: true,
        deliveryFee: 2500,
        exchangeFee: 3000,
        currencyCode: "GHS",
        sortOrder: 2,
      },
      "cape-coast": {
        code: "cape-coast",
        name: "Cape Coast",
        enabled: true,
        deliveryFee: 2200,
        exchangeFee: 2600,
        currencyCode: "GHS",
        sortOrder: 3,
      },
      takoradi: {
        code: "takoradi",
        name: "Takoradi",
        enabled: true,
        deliveryFee: 2200,
        exchangeFee: 2600,
        currencyCode: "GHS",
        sortOrder: 4,
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
      // Sandbox credit guard rail (major). Demo cap, NOT an FX equivalence.
      // Enforced by sandboxCredit; mandatory (no backend fallback).
      sandboxMaxCreditMajor: 100000,
    },
    GHS: {
      code: "GHS",
      name: "Ghanaian cedi",
      enabled: true,
      sortOrder: 1,
      decimals: 2,
      minWithdrawalMinor: 10000,
      symbol: "GH₵",
      // Sandbox credit guard rail (major). Demo cap, NOT an FX equivalence.
      sandboxMaxCreditMajor: 2000,
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
