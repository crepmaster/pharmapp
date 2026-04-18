import 'package:cloud_firestore/cloud_firestore.dart';

/// Minimal row used for drill-down lists in the analytics section.
class EntityRow {
  final String id;
  final String name;
  final String email;
  final String phone;
  final bool isActive;
  final String? extra; // e.g. vehicle type for courier

  const EntityRow({
    required this.id,
    required this.name,
    required this.email,
    required this.phone,
    required this.isActive,
    this.extra,
  });
}

/// Aggregated stats for a single city, produced by [AnalyticsService].
class CityStats {
  final String countryCode;
  final String cityCode;
  final String cityDisplayName;

  final int pharmaciesTotal;
  final int pharmaciesActive;
  final int couriersTotal;
  final int couriersActive;

  final int exchangesTotal;
  final int exchangesPending;
  final int exchangesCompleted;
  final int exchangesCancelled;

  final int deliveriesTotal;
  final int deliveriesPending;
  final int deliveriesCompleted;

  /// Volume per currency (sum of totalPrice across completed exchanges).
  /// Keyed by currency code, e.g. {'XAF': 450000, 'GHS': 1500}.
  final Map<String, double> volumeByCurrency;

  /// Full list of pharmacies in this city — used for drill-down.
  final List<EntityRow> pharmacies;

  /// Full list of couriers in this city — used for drill-down.
  final List<EntityRow> couriers;

  const CityStats({
    required this.countryCode,
    required this.cityCode,
    required this.cityDisplayName,
    this.pharmaciesTotal = 0,
    this.pharmaciesActive = 0,
    this.couriersTotal = 0,
    this.couriersActive = 0,
    this.exchangesTotal = 0,
    this.exchangesPending = 0,
    this.exchangesCompleted = 0,
    this.exchangesCancelled = 0,
    this.deliveriesTotal = 0,
    this.deliveriesPending = 0,
    this.deliveriesCompleted = 0,
    this.volumeByCurrency = const {},
    this.pharmacies = const [],
    this.couriers = const [],
  });
}

/// Aggregated stats for a whole country — rolls up all its cities.
class CountryStats {
  final String countryCode;
  final String countryDisplayName;
  final List<CityStats> cities;

  int get pharmaciesTotal =>
      cities.fold(0, (s, c) => s + c.pharmaciesTotal);
  int get pharmaciesActive =>
      cities.fold(0, (s, c) => s + c.pharmaciesActive);
  int get couriersTotal => cities.fold(0, (s, c) => s + c.couriersTotal);
  int get couriersActive => cities.fold(0, (s, c) => s + c.couriersActive);
  int get exchangesTotal => cities.fold(0, (s, c) => s + c.exchangesTotal);
  int get exchangesPending =>
      cities.fold(0, (s, c) => s + c.exchangesPending);
  int get exchangesCompleted =>
      cities.fold(0, (s, c) => s + c.exchangesCompleted);
  int get deliveriesTotal => cities.fold(0, (s, c) => s + c.deliveriesTotal);
  int get deliveriesPending =>
      cities.fold(0, (s, c) => s + c.deliveriesPending);
  int get deliveriesCompleted =>
      cities.fold(0, (s, c) => s + c.deliveriesCompleted);

  Map<String, double> get volumeByCurrency {
    final Map<String, double> agg = {};
    for (final city in cities) {
      city.volumeByCurrency.forEach((cur, amt) {
        agg[cur] = (agg[cur] ?? 0) + amt;
      });
    }
    return agg;
  }

  const CountryStats({
    required this.countryCode,
    required this.countryDisplayName,
    required this.cities,
  });
}

/// Client-side analytics service for the admin dashboard.
///
/// Pragmatic MVP: runs 4 Firestore queries per refresh and joins on the client.
/// Suitable for a few thousand documents. For larger volumes, migrate to a
/// precomputed `stats_by_city_day` collection maintained by Cloud Function
/// triggers.
class AnalyticsService {
  static final FirebaseFirestore _db = FirebaseFirestore.instance;

  /// Compute stats scoped to [countryScopes]. If empty and [isSuperAdmin]
  /// is true, the global dataset is used.
  static Future<List<CountryStats>> computeStats({
    required List<String> countryScopes,
    required bool isSuperAdmin,
    required Map<String, String> countryNames, // countryCode -> display
    required Map<String, Map<String, String>> cityNames, // countryCode -> cityCode -> display
  }) async {
    // 1. Pharmacies
    Query<Map<String, dynamic>> pharmacyQuery = _db.collection('pharmacies');
    if (!isSuperAdmin) {
      if (countryScopes.isEmpty) return []; // misconfigured
      pharmacyQuery =
          pharmacyQuery.where('countryCode', whereIn: countryScopes);
    }
    final pharmacySnap = await pharmacyQuery.get();

    // 2. Couriers
    Query<Map<String, dynamic>> courierQuery = _db.collection('couriers');
    if (!isSuperAdmin) {
      courierQuery =
          courierQuery.where('countryCode', whereIn: countryScopes);
    }
    final courierSnap = await courierQuery.get();

    // Build a lookup: pharmacyId → (countryCode, cityCode)
    // Used to join exchange_proposals without denormalized city fields.
    final pharmacyLookup = <String, Map<String, String>>{};
    for (final doc in pharmacySnap.docs) {
      final d = doc.data();
      pharmacyLookup[doc.id] = {
        'countryCode': (d['countryCode'] as String?) ?? '',
        'cityCode': (d['cityCode'] as String?) ?? '',
      };
    }

    // 3. Exchange proposals — load all, filter on client via pharmacyLookup.
    // For MVP demo this is fine (low volume). Production should precompute.
    final proposalSnap = await _db.collection('exchange_proposals').get();

    // 4. Deliveries — same approach.
    final deliverySnap = await _db.collection('deliveries').get();

    // Aggregate per city.
    // Key = "countryCode|cityCode"
    final cityAgg = <String, _MutableCityStats>{};

    String cityKey(String country, String city) => '$country|$city';

    _MutableCityStats ensureCity(String country, String city) {
      final key = cityKey(country, city);
      return cityAgg.putIfAbsent(
        key,
        () => _MutableCityStats(countryCode: country, cityCode: city),
      );
    }

    // Pharmacies
    for (final doc in pharmacySnap.docs) {
      final d = doc.data();
      final country = (d['countryCode'] as String?) ?? '';
      final city = (d['cityCode'] as String?) ?? '';
      if (country.isEmpty || city.isEmpty) continue;
      final agg = ensureCity(country, city);
      final isActive = d['isActive'] != false;
      agg.pharmaciesTotal++;
      if (isActive) agg.pharmaciesActive++;
      agg.pharmacies.add(EntityRow(
        id: doc.id,
        name: (d['pharmacyName'] as String?) ??
            (d['displayName'] as String?) ??
            (d['name'] as String?) ??
            'Unknown Pharmacy',
        email: (d['email'] as String?) ?? '',
        phone: (d['phoneNumber'] as String?) ?? (d['phone'] as String?) ?? '',
        isActive: isActive,
      ));
    }

    // Couriers
    for (final doc in courierSnap.docs) {
      final d = doc.data();
      final country = (d['countryCode'] as String?) ?? '';
      final city = (d['cityCode'] as String?) ?? '';
      if (country.isEmpty || city.isEmpty) continue;
      final agg = ensureCity(country, city);
      final isActive = d['isActive'] != false;
      agg.couriersTotal++;
      if (isActive) agg.couriersActive++;
      agg.couriers.add(EntityRow(
        id: doc.id,
        name: (d['fullName'] as String?) ??
            (d['displayName'] as String?) ??
            (d['name'] as String?) ??
            'Unknown Courier',
        email: (d['email'] as String?) ?? '',
        phone: (d['phoneNumber'] as String?) ?? (d['phone'] as String?) ?? '',
        isActive: isActive,
        extra: (d['vehicleType'] as String?) ?? '',
      ));
    }

    // Exchange proposals — join via fromPharmacyId → pharmacyLookup
    for (final doc in proposalSnap.docs) {
      final d = doc.data();
      final fromId = (d['fromPharmacyId'] as String?) ?? '';
      final lookup = pharmacyLookup[fromId];
      if (lookup == null) continue; // Out of scope
      final country = lookup['countryCode'] ?? '';
      final city = lookup['cityCode'] ?? '';
      if (country.isEmpty || city.isEmpty) continue;
      final agg = ensureCity(country, city);
      agg.exchangesTotal++;
      final status = (d['status'] as String?) ?? '';
      switch (status) {
        case 'pending':
          agg.exchangesPending++;
          break;
        case 'completed':
          agg.exchangesCompleted++;
          // Add to volume only for completed.
          final details = d['details'] as Map<String, dynamic>?;
          final total = (details?['totalPrice'] as num?)?.toDouble() ?? 0;
          final cur =
              (details?['currency'] as String?) ?? '';
          if (total > 0 && cur.isNotEmpty) {
            agg.volumeByCurrency[cur] =
                (agg.volumeByCurrency[cur] ?? 0) + total;
          }
          break;
        case 'rejected':
        case 'cancelled':
        case 'canceled':
          agg.exchangesCancelled++;
          break;
      }
    }

    // Deliveries — use cityCode if present, else slug the legacy city name
    for (final doc in deliverySnap.docs) {
      final d = doc.data();
      String cityCode = (d['cityCode'] as String?) ?? '';
      String legacyCity = (d['city'] as String?) ?? '';
      if (cityCode.isEmpty && legacyCity.isNotEmpty) {
        cityCode = _slug(legacyCity);
      }
      if (cityCode.isEmpty) continue;
      // Derive countryCode from any cityCode match in pharmacyLookup entries.
      // If no match, skip (out of scope).
      String country = '';
      for (final l in pharmacyLookup.values) {
        if (l['cityCode'] == cityCode) {
          country = l['countryCode'] ?? '';
          break;
        }
      }
      if (country.isEmpty) continue;
      if (!isSuperAdmin && !countryScopes.contains(country)) continue;
      final agg = ensureCity(country, cityCode);
      agg.deliveriesTotal++;
      final status = (d['status'] as String?) ?? '';
      if (status == 'pending') {
        agg.deliveriesPending++;
      } else if (status == 'delivered' || status == 'completed') {
        agg.deliveriesCompleted++;
      }
    }

    // Group cities by country
    final byCountry = <String, List<CityStats>>{};
    for (final entry in cityAgg.values) {
      final city = entry.toCityStats(
        cityNames[entry.countryCode]?[entry.cityCode] ?? entry.cityCode,
      );
      byCountry.putIfAbsent(entry.countryCode, () => []).add(city);
    }

    // Build final country list, sorted by country name.
    final countries = byCountry.entries
        .map((e) => CountryStats(
              countryCode: e.key,
              countryDisplayName: countryNames[e.key] ?? e.key,
              cities: e.value..sort((a, b) => a.cityDisplayName
                  .compareTo(b.cityDisplayName)),
            ))
        .toList()
      ..sort((a, b) =>
          a.countryDisplayName.compareTo(b.countryDisplayName));
    return countries;
  }

  static String _slug(String input) {
    return input
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '_')
        .replaceAll(RegExp(r'^_|_$'), '');
  }
}

class _MutableCityStats {
  final String countryCode;
  final String cityCode;
  int pharmaciesTotal = 0;
  int pharmaciesActive = 0;
  int couriersTotal = 0;
  int couriersActive = 0;
  int exchangesTotal = 0;
  int exchangesPending = 0;
  int exchangesCompleted = 0;
  int exchangesCancelled = 0;
  int deliveriesTotal = 0;
  int deliveriesPending = 0;
  int deliveriesCompleted = 0;
  final Map<String, double> volumeByCurrency = {};
  final List<EntityRow> pharmacies = [];
  final List<EntityRow> couriers = [];

  _MutableCityStats({required this.countryCode, required this.cityCode});

  CityStats toCityStats(String displayName) => CityStats(
        countryCode: countryCode,
        cityCode: cityCode,
        cityDisplayName: displayName,
        pharmaciesTotal: pharmaciesTotal,
        pharmaciesActive: pharmaciesActive,
        couriersTotal: couriersTotal,
        couriersActive: couriersActive,
        exchangesTotal: exchangesTotal,
        exchangesPending: exchangesPending,
        exchangesCompleted: exchangesCompleted,
        exchangesCancelled: exchangesCancelled,
        deliveriesTotal: deliveriesTotal,
        deliveriesPending: deliveriesPending,
        deliveriesCompleted: deliveriesCompleted,
        volumeByCurrency: Map.unmodifiable(volumeByCurrency),
        pharmacies: List.unmodifiable(
          pharmacies..sort((a, b) => a.name.compareTo(b.name)),
        ),
        couriers: List.unmodifiable(
          couriers..sort((a, b) => a.name.compareTo(b.name)),
        ),
      );
}
