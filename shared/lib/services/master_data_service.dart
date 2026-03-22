import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/master_data_snapshot.dart';
import '../models/country_config.dart';
import '../models/cities_config.dart';

/// Runtime service providing a cached [MasterDataSnapshot] from
/// Firestore `system_config/main`, with automatic fallback to static config.
///
/// Usage:
/// ```dart
/// final snapshot = await MasterDataService.load();
/// final countries = snapshot.getEnabledCountries();
/// ```
///
/// Caching policy: only **remote** snapshots are cached for the session.
/// The static fallback is intentionally NOT cached — if Firestore was
/// transiently unavailable, the next [load] call will re-attempt the fetch
/// rather than locking the app on stale fallback data indefinitely.
/// Call [invalidate] to force a reload after an admin config change.
///
/// Thread-safety: Flutter is single-threaded; no extra synchronisation needed.
class MasterDataService {
  MasterDataService._();

  static MasterDataSnapshot? _cached;

  /// Returns the cached snapshot, loading from Firestore on first call.
  /// Falls back to static config if Firestore is unavailable or the document
  /// does not exist / has no V1 schema.
  static Future<MasterDataSnapshot> load() async {
    if (_cached != null) return _cached!;
    try {
      final doc = await FirebaseFirestore.instance
          .collection('system_config')
          .doc('main')
          .get();
      if (doc.exists) {
        final data = doc.data();
        if (data != null && (data['schemaVersion'] as int? ?? 0) >= 1) {
          _cached = _parseFromFirestore(data);
          return _cached!;
        }
      }
    } catch (_) {
      // Firestore unavailable — fall through to static fallback.
    }
    // Fallback is NOT cached: the next load() call will re-attempt Firestore.
    // Caching the fallback would permanently lock the app on stale data after
    // any transient network failure at startup.
    return _buildStaticFallback();
  }

  /// Clears the in-memory cache. The next [load] call will re-fetch Firestore.
  static void invalidate() => _cached = null;

  // ---------------------------------------------------------------------------
  // FIRESTORE PARSING
  // ---------------------------------------------------------------------------

  static MasterDataSnapshot _parseFromFirestore(Map<String, dynamic> data) {
    // --- countries ---
    final countriesRaw = data['countries'] as Map<String, dynamic>? ?? {};
    final countries = <String, MasterDataCountry>{};
    for (final entry in countriesRaw.entries) {
      final m = entry.value as Map<String, dynamic>? ?? {};
      countries[entry.key] = MasterDataCountry(
        code: m['code'] as String? ?? entry.key,
        name: m['name'] as String? ?? entry.key,
        dialCode: m['dialCode'] as String? ?? '',
        defaultCurrencyCode: m['defaultCurrencyCode'] as String? ?? '',
        enabled: m['enabled'] as bool? ?? false,
        sortOrder: m['sortOrder'] as int? ?? 0,
        defaultCityCode: m['defaultCityCode'] as String? ?? '',
        providerIds: List<String>.from(m['providerIds'] as List? ?? []),
      );
    }

    // --- citiesByCountry ---
    final citiesRaw = data['citiesByCountry'] as Map<String, dynamic>? ?? {};
    final citiesByCountry = <String, Map<String, MasterDataCity>>{};
    for (final countryEntry in citiesRaw.entries) {
      final cityMap = countryEntry.value as Map<String, dynamic>? ?? {};
      final cities = <String, MasterDataCity>{};
      for (final cityEntry in cityMap.entries) {
        final m = cityEntry.value as Map<String, dynamic>? ?? {};
        cities[cityEntry.key] = MasterDataCity(
          code: m['code'] as String? ?? cityEntry.key,
          name: m['name'] as String? ?? cityEntry.key,
          enabled: m['enabled'] as bool? ?? false,
          deliveryFee: (m['deliveryFee'] ?? 0).toDouble(),
          currencyCode: m['currencyCode'] as String? ?? '',
          sortOrder: m['sortOrder'] as int? ?? 0,
        );
      }
      citiesByCountry[countryEntry.key] = cities;
    }

    // --- currencies ---
    final currenciesRaw = data['currencies'] as Map<String, dynamic>? ?? {};
    final currencies = <String, MasterDataCurrency>{};
    for (final entry in currenciesRaw.entries) {
      final m = entry.value as Map<String, dynamic>? ?? {};
      currencies[entry.key] = MasterDataCurrency(
        code: m['code'] as String? ?? entry.key,
        name: m['name'] as String? ?? entry.key,
        symbol: m['symbol'] as String? ?? entry.key,
        enabled: m['enabled'] as bool? ?? false,
        sortOrder: m['sortOrder'] as int? ?? 0,
      );
    }

    // --- providers ---
    final providersRaw =
        data['mobileMoneyProviders'] as Map<String, dynamic>? ?? {};
    final providers = <String, MasterDataProvider>{};
    for (final entry in providersRaw.entries) {
      final m = entry.value as Map<String, dynamic>? ?? {};
      providers[entry.key] = MasterDataProvider(
        id: m['id'] as String? ?? entry.key,
        name: m['name'] as String? ?? entry.key,
        countryCode: m['countryCode'] as String? ?? '',
        currencyCode: m['currencyCode'] as String? ?? '',
        methodCode: m['methodCode'] as String? ?? '',
        enabled: m['enabled'] as bool? ?? false,
        displayOrder: m['displayOrder'] as int? ?? 0,
        requiresMsisdn: m['requiresMsisdn'] as bool? ?? true,
        supportsCollections: m['supportsCollections'] as bool? ?? false,
        supportsPayouts: m['supportsPayouts'] as bool? ?? false,
      );
    }

    return MasterDataSnapshot(
      source: MasterDataSource.remote,
      primaryCountryCode: data['primaryCountryCode'] as String? ?? '',
      countries: countries,
      citiesByCountry: citiesByCountry,
      currencies: currencies,
      providers: providers,
    );
  }

  // ---------------------------------------------------------------------------
  // STATIC FALLBACK — built from country_config.dart / cities_config.dart
  // ---------------------------------------------------------------------------

  /// Maps [Country] enum values to ISO 3166-1 alpha-2 codes.
  static const _enumToIso = {
    Country.cameroon: 'CM',
    Country.kenya: 'KE',
    Country.tanzania: 'TZ',
    Country.uganda: 'UG',
    Country.nigeria: 'NG',
  };

  /// Maps PaymentOperator enum names (used as provider IDs in the static
  /// fallback) to legacy-compatible methodCode strings that are already
  /// accepted by [EncryptionService.isValidPaymentMethod] and
  /// [EncryptionService.validatePhoneWithMethod].
  ///
  /// Without this map, the static fallback would write enum camelCase names
  /// (e.g. "mtnCameroon") as methodCode, which EncryptionService does not
  /// recognise.
  static const _operatorMethodCode = {
    'mtnCameroon': 'mtn_cameroon',
    'orangeCameroon': 'orange_cameroon',
    'mpesaKenya': 'mpesa_kenya',
    'airtelKenya': 'airtel_kenya',
    'mpesaTanzania': 'mpesa_tanzania',
    'tigoTanzania': 'tigo_tanzania',
    'airtelTanzania': 'airtel_tanzania',
    'mtnUganda': 'mtn_uganda',
    'airtelUganda': 'airtel_uganda',
    'mtnNigeria': 'mtn_nigeria',
    'airtelNigeria': 'airtel_nigeria',
    'gloNigeria': 'glo_nigeria',
    'nineMobile': 'nine_mobile',
  };

  static MasterDataSnapshot _buildStaticFallback() {
    final countries = <String, MasterDataCountry>{};
    final citiesByCountry = <String, Map<String, MasterDataCity>>{};
    final currencies = <String, MasterDataCurrency>{};
    final providers = <String, MasterDataProvider>{};

    int countrySortOrder = 0;

    for (final countryEnum in Country.values) {
      final isoCode = _enumToIso[countryEnum]!;
      final config = Countries.getByCountry(countryEnum);
      if (config == null) continue;

      final providerIds = config.availableOperators
          .map((op) => op.toString().split('.').last)
          .toList();

      countries[isoCode] = MasterDataCountry(
        code: isoCode,
        name: config.name,
        dialCode: config.countryCode,
        defaultCurrencyCode: config.currency,
        enabled: true,
        sortOrder: countrySortOrder++,
        defaultCityCode: '',
        providerIds: providerIds,
      );

      // Cities
      final cityConfigs = Cities.getByCountry(countryEnum);
      final cityMap = <String, MasterDataCity>{};
      int citySortOrder = 0;
      for (final city in cityConfigs) {
        final slug = citySlug(city.name);
        cityMap[slug] = MasterDataCity(
          code: slug,
          name: city.name,
          enabled: true,
          deliveryFee: 0.0,
          currencyCode: config.currency,
          sortOrder: citySortOrder++,
        );
      }
      citiesByCountry[isoCode] = cityMap;

      // Currency
      if (!currencies.containsKey(config.currency)) {
        currencies[config.currency] = MasterDataCurrency(
          code: config.currency,
          name: _currencyName(config.currency),
          symbol: config.currencySymbol,
          enabled: true,
          sortOrder: currencies.length,
        );
      }

      // Providers
      int opOrder = 0;
      for (final op in config.availableOperators) {
        final opConfig = config.getOperatorConfig(op);
        final id = op.toString().split('.').last;
        if (!providers.containsKey(id)) {
          providers[id] = MasterDataProvider(
            id: id,
            name: opConfig?.displayName ?? id,
            countryCode: isoCode,
            currencyCode: config.currency,
            methodCode: _operatorMethodCode[id] ?? id,
            enabled: true,
            displayOrder: opOrder++,
            requiresMsisdn: true,
            supportsCollections: true,
            supportsPayouts: true,
          );
        }
      }
    }

    return MasterDataSnapshot(
      source: MasterDataSource.fallback,
      primaryCountryCode: 'CM',
      countries: countries,
      citiesByCountry: citiesByCountry,
      currencies: currencies,
      providers: providers,
    );
  }

  /// Converts a city display name to a stable lowercase slug.
  ///
  /// Public so that services outside `MasterDataService` can compute the
  /// canonical `cityCode` from a legacy `city` display name (e.g. for lazy
  /// backfill of existing Firestore documents).
  static String citySlug(String name) {
    return name
        .toLowerCase()
        .replaceAll(' ', '_')
        .replaceAll("'", '')
        .replaceAll('é', 'e')
        .replaceAll('è', 'e')
        .replaceAll('ê', 'e')
        .replaceAll('ô', 'o')
        .replaceAll('â', 'a')
        .replaceAll('ü', 'u')
        .replaceAll('ö', 'o');
  }

  static String _currencyName(String code) {
    const names = {
      'XAF': 'CFA Franc (CEMAC)',
      'KES': 'Kenyan Shilling',
      'TZS': 'Tanzanian Shilling',
      'UGX': 'Ugandan Shilling',
      'NGN': 'Nigerian Naira',
      'USD': 'US Dollar',
      'GHS': 'Ghanaian Cedi',
    };
    return names[code] ?? code;
  }
}
