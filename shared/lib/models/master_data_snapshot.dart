/// Lightweight runtime types for master data consumed by the registration
/// and runtime flows. These types are read-only — no toMap(), no copyWith(),
/// no admin-CRUD helpers (Option B: separate from admin_panel models).
///
/// Source: Firestore system_config/main (V1 schema).
/// Produced by: MasterDataService.

/// Indicates where the snapshot data was loaded from.
enum MasterDataSource {
  /// Data loaded successfully from Firestore system_config/main.
  remote,

  /// Firestore was unavailable — built from static country_config / cities_config.
  fallback,
}

/// A country entry as needed by the runtime flow.
class MasterDataCountry {
  /// ISO 3166-1 alpha-2, e.g. "CM"
  final String code;

  /// Display name, e.g. "Cameroon"
  final String name;

  /// Dial prefix without +, e.g. "237"
  final String dialCode;

  /// Default ISO 4217 currency code, e.g. "XAF"
  final String defaultCurrencyCode;

  final bool enabled;
  final int sortOrder;

  /// Slug of the default city, e.g. "douala"
  final String defaultCityCode;

  /// Stable IDs of mobile money providers operating in this country.
  final List<String> providerIds;

  const MasterDataCountry({
    required this.code,
    required this.name,
    required this.dialCode,
    required this.defaultCurrencyCode,
    required this.enabled,
    required this.sortOrder,
    required this.defaultCityCode,
    required this.providerIds,
  });
}

/// A city entry as needed by the runtime flow.
class MasterDataCity {
  /// Stable slug, lowercase, e.g. "douala"
  final String code;

  /// Display name, e.g. "Douala"
  final String name;

  final bool enabled;

  /// Delivery fee in local currency.
  final double deliveryFee;

  /// ISO 4217 currency for the delivery fee.
  final String currencyCode;

  final int sortOrder;

  const MasterDataCity({
    required this.code,
    required this.name,
    required this.enabled,
    required this.deliveryFee,
    required this.currencyCode,
    required this.sortOrder,
  });
}

/// A currency entry as needed by the runtime flow.
class MasterDataCurrency {
  /// ISO 4217 code, e.g. "XAF"
  final String code;

  final String name;

  /// Display symbol, e.g. "FCFA"
  final String symbol;

  final bool enabled;
  final int sortOrder;

  /// ISO 4217 minor-unit exponent (e.g. 0 for XAF/UGX, 2 for GHS/KES/NGN).
  /// Hotfix 3.2b Fix 3: sourced from `system_config/main.currencies[code].decimals`
  /// so client-side money math aligns with the backend canonical table in
  /// `functions/src/lib/moneyUnits.ts` (FALLBACK_DECIMALS). Nullable so a
  /// missing Firestore field does NOT break parsing; consumers are expected
  /// to fall back to a local table when null.
  final int? decimals;

  /// Minimum withdrawal amount, expressed in MINOR units of this currency.
  /// Sprint 3.2c-α: sourced from
  /// `system_config/main.currencies[code].minWithdrawalMinor` so client-side
  /// gating mirrors the backend hardcoded table in
  /// `functions/src/createWithdrawalRequest.ts`
  /// (`MIN_WITHDRAWAL_MINOR_BY_CURRENCY`). Nullable so a missing Firestore
  /// field does NOT break parsing; consumers fall back to a local legacy
  /// table when null.
  final int? minWithdrawalMinor;

  const MasterDataCurrency({
    required this.code,
    required this.name,
    required this.symbol,
    required this.enabled,
    required this.sortOrder,
    this.decimals,
    this.minWithdrawalMinor,
  });
}

/// A mobile money provider entry as needed by the runtime flow.
class MasterDataProvider {
  /// Stable slug ID, e.g. "mtn_cm"
  final String id;

  final String name;

  /// ISO 3166-1 alpha-2 country code.
  final String countryCode;

  /// ISO 4217 currency code.
  final String currencyCode;

  /// Method code, e.g. "mtn_momo"
  final String methodCode;

  final bool enabled;
  final int displayOrder;
  final bool requiresMsisdn;
  final bool supportsCollections;
  final bool supportsPayouts;

  const MasterDataProvider({
    required this.id,
    required this.name,
    required this.countryCode,
    required this.currencyCode,
    required this.methodCode,
    required this.enabled,
    required this.displayOrder,
    required this.requiresMsisdn,
    required this.supportsCollections,
    required this.supportsPayouts,
  });
}

/// Immutable runtime snapshot of master data used across the registration
/// and app flows. Produced and cached by [MasterDataService].
class MasterDataSnapshot {
  final MasterDataSource source;
  final String primaryCountryCode;

  /// Keyed by ISO 3166-1 alpha-2 country code.
  final Map<String, MasterDataCountry> countries;

  /// Keyed by [countryCode][cityCode].
  final Map<String, Map<String, MasterDataCity>> citiesByCountry;

  /// Keyed by ISO 4217 currency code.
  final Map<String, MasterDataCurrency> currencies;

  /// Keyed by provider stable ID.
  final Map<String, MasterDataProvider> providers;

  const MasterDataSnapshot({
    required this.source,
    required this.primaryCountryCode,
    required this.countries,
    required this.citiesByCountry,
    required this.currencies,
    required this.providers,
  });

  /// Returns enabled countries sorted by sortOrder.
  List<MasterDataCountry> getEnabledCountries() {
    return countries.values
        .where((c) => c.enabled)
        .toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  }

  /// Returns enabled cities for [countryCode] sorted by sortOrder.
  List<MasterDataCity> getEnabledCities(String countryCode) {
    final cities = citiesByCountry[countryCode];
    if (cities == null) return [];
    return cities.values
        .where((c) => c.enabled)
        .toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  }

  /// Lookup a currency by ISO code. Returns null if not found.
  MasterDataCurrency? getCurrency(String code) => currencies[code];

  /// Returns enabled providers for [countryCode] sorted by displayOrder.
  List<MasterDataProvider> getEnabledProviders(String countryCode) {
    return providers.values
        .where((p) => p.enabled && p.countryCode == countryCode)
        .toList()
      ..sort((a, b) => a.displayOrder.compareTo(b.displayOrder));
  }

  /// Returns the delivery fee for a specific city, or null if unknown.
  double? getCityDeliveryFee(String countryCode, String cityCode) {
    return citiesByCountry[countryCode]?[cityCode]?.deliveryFee;
  }
}
