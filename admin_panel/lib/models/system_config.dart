import 'package:cloud_firestore/cloud_firestore.dart';

import 'country_option.dart';
import 'city_option.dart';
import 'currency_option.dart';
import 'provider_option.dart';

/// Revenue policy for a specific revenue stream.
class RevenuePolicy {
  final bool enabled;
  final String? mode; // e.g. "full_amount_to_platform"
  final int? commissionBps;
  final int? platformShareBps;

  const RevenuePolicy({
    required this.enabled,
    this.mode,
    this.commissionBps,
    this.platformShareBps,
  });

  factory RevenuePolicy.fromMap(Map<String, dynamic> map) {
    return RevenuePolicy(
      enabled: map['enabled'] ?? false,
      mode: map['mode'],
      commissionBps: map['commissionBps'],
      platformShareBps: map['platformShareBps'],
    );
  }

  Map<String, dynamic> toMap() {
    final m = <String, dynamic>{'enabled': enabled};
    if (mode != null) m['mode'] = mode;
    if (commissionBps != null) m['commissionBps'] = commissionBps;
    if (platformShareBps != null) m['platformShareBps'] = platformShareBps;
    return m;
  }
}

/// V1 system configuration matching CONTRACT_ADMIN_MASTER_DATA_AND_TREASURY_V1 §6.1.
///
/// Source of truth: Firestore document `system_config/main`.
class SystemConfigV1 {
  final int schemaVersion;
  final String status;
  final String primaryCountryCode;
  final Map<String, CountryOption> countries;
  final Map<String, Map<String, CityOption>> citiesByCountry;
  final Map<String, CurrencyOption> currencies;
  final Map<String, ProviderOption> mobileMoneyProviders;
  final Map<String, RevenuePolicy> revenuePolicies;
  final DateTime? updatedAt;
  final String updatedByAdminId;

  const SystemConfigV1({
    required this.schemaVersion,
    required this.status,
    required this.primaryCountryCode,
    required this.countries,
    required this.citiesByCountry,
    required this.currencies,
    required this.mobileMoneyProviders,
    required this.revenuePolicies,
    this.updatedAt,
    required this.updatedByAdminId,
  });

  factory SystemConfigV1.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};

    // Parse countries
    final countriesRaw = data['countries'] as Map<String, dynamic>? ?? {};
    final countries = countriesRaw.map(
      (key, value) => MapEntry(key, CountryOption.fromMap(value as Map<String, dynamic>)),
    );

    // Parse citiesByCountry (nested: { "CM": { "douala": { ... } } })
    final citiesRaw = data['citiesByCountry'] as Map<String, dynamic>? ?? {};
    final citiesByCountry = citiesRaw.map((countryCode, citiesMap) {
      final cities = (citiesMap as Map<String, dynamic>).map(
        (cityCode, cityData) => MapEntry(cityCode, CityOption.fromMap(cityData as Map<String, dynamic>)),
      );
      return MapEntry(countryCode, cities);
    });

    // Parse currencies
    final currenciesRaw = data['currencies'] as Map<String, dynamic>? ?? {};
    final currencies = currenciesRaw.map(
      (key, value) => MapEntry(key, CurrencyOption.fromMap(value as Map<String, dynamic>)),
    );

    // Parse providers
    final providersRaw = data['mobileMoneyProviders'] as Map<String, dynamic>? ?? {};
    final providers = providersRaw.map(
      (key, value) => MapEntry(key, ProviderOption.fromMap(value as Map<String, dynamic>)),
    );

    // Parse revenue policies
    final policiesRaw = data['revenuePolicies'] as Map<String, dynamic>? ?? {};
    final policies = policiesRaw.map(
      (key, value) => MapEntry(key, RevenuePolicy.fromMap(value as Map<String, dynamic>)),
    );

    // Parse updatedAt
    DateTime? updatedAt;
    if (data['updatedAt'] is Timestamp) {
      updatedAt = (data['updatedAt'] as Timestamp).toDate();
    }

    return SystemConfigV1(
      schemaVersion: data['schemaVersion'] ?? 0,
      status: data['status'] ?? 'unknown',
      primaryCountryCode: data['primaryCountryCode'] ?? '',
      countries: countries,
      citiesByCountry: citiesByCountry,
      currencies: currencies,
      mobileMoneyProviders: providers,
      revenuePolicies: policies,
      updatedAt: updatedAt,
      updatedByAdminId: data['updatedByAdminId'] ?? '',
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'schemaVersion': schemaVersion,
      'status': status,
      'primaryCountryCode': primaryCountryCode,
      'countries': countries.map((k, v) => MapEntry(k, v.toMap())),
      'citiesByCountry': citiesByCountry.map(
        (countryCode, cities) => MapEntry(
          countryCode,
          cities.map((cityCode, city) => MapEntry(cityCode, city.toMap())),
        ),
      ),
      'currencies': currencies.map((k, v) => MapEntry(k, v.toMap())),
      'mobileMoneyProviders': mobileMoneyProviders.map((k, v) => MapEntry(k, v.toMap())),
      'revenuePolicies': revenuePolicies.map((k, v) => MapEntry(k, v.toMap())),
      'updatedAt': FieldValue.serverTimestamp(),
      'updatedByAdminId': updatedByAdminId,
    };
  }

  /// Convenience getters for sorted/filtered access.
  List<CountryOption> get enabledCountries =>
      countries.values.where((c) => c.enabled).toList()..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

  List<CityOption> getEnabledCities(String countryCode) {
    final cities = citiesByCountry[countryCode];
    if (cities == null) return [];
    return cities.values.where((c) => c.enabled).toList()..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  }

  List<CurrencyOption> get enabledCurrencies =>
      currencies.values.where((c) => c.enabled).toList()..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

  List<ProviderOption> getEnabledProviders(String countryCode) =>
      mobileMoneyProviders.values
          .where((p) => p.enabled && p.countryCode == countryCode)
          .toList()
        ..sort((a, b) => a.displayOrder.compareTo(b.displayOrder));

  CurrencyOption? getCurrency(String code) => currencies[code];

  double? getCityDeliveryFee(String countryCode, String cityCode) =>
      citiesByCountry[countryCode]?[cityCode]?.deliveryFee;
}

// ---------------------------------------------------------------------------
// DynamicSubscriptionPlan — kept as-is from legacy, lives in its own
// Firestore collection `dynamic_subscription_plans`.
// ---------------------------------------------------------------------------

class DynamicSubscriptionPlan {
  final String id;
  final String name;
  final String description;
  final Map<String, double> pricesByCurrency;
  final int inventoryLimit;
  final List<String> features;
  final int trialDays;
  final bool isActive;
  final DateTime createdAt;

  DynamicSubscriptionPlan({
    required this.id,
    required this.name,
    required this.description,
    required this.pricesByCurrency,
    required this.inventoryLimit,
    required this.features,
    required this.trialDays,
    required this.isActive,
    required this.createdAt,
  });

  factory DynamicSubscriptionPlan.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return DynamicSubscriptionPlan(
      id: doc.id,
      name: data['name'] ?? '',
      description: data['description'] ?? '',
      pricesByCurrency: Map<String, double>.from(data['pricesByCurrency'] ?? {}),
      inventoryLimit: data['inventoryLimit'] ?? 0,
      features: List<String>.from(data['features'] ?? []),
      trialDays: data['trialDays'] ?? 0,
      isActive: data['isActive'] ?? true,
      createdAt: (data['createdAt'] as Timestamp).toDate(),
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'name': name,
      'description': description,
      'pricesByCurrency': pricesByCurrency,
      'inventoryLimit': inventoryLimit,
      'features': features,
      'trialDays': trialDays,
      'isActive': isActive,
      'createdAt': FieldValue.serverTimestamp(),
    };
  }

  double getPriceForCurrency(String currencyCode) {
    return pricesByCurrency[currencyCode] ?? pricesByCurrency['USD'] ?? 0.0;
  }
}
