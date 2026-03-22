import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:pharmapp_shared/models/cities_config.dart';
import 'package:pharmapp_shared/models/country_config.dart';

/// Service for migrating legacy `system_config/main` to V1 schema.
///
/// Operations are one-shot, guarded by `schemaVersion`, and always
/// preceded by a raw backup of the current document.
class MigrationService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Map Country enum → ISO 3166-1 alpha-2 code.
  static const Map<Country, String> _countryIsoCode = {
    Country.cameroon: 'CM',
    Country.kenya: 'KE',
    Country.tanzania: 'TZ',
    Country.uganda: 'UG',
    Country.nigeria: 'NG',
  };

  /// Backup the current `system_config/main` document as-is into
  /// `system_config_backups/{ISO_timestamp}`.
  ///
  /// Returns the backup document ID, or `null` on failure.
  static Future<String?> backupCurrentConfig() async {
    try {
      final doc =
          await _firestore.collection('system_config').doc('main').get();
      if (!doc.exists) return null;

      final backupId = DateTime.now().toUtc().toIso8601String().replaceAll(':', '-');
      await _firestore
          .collection('system_config_backups')
          .doc(backupId)
          .set({
        ...doc.data()!,
        '_backupMeta': {
          'sourceDoc': 'system_config/main',
          'backedUpAt': FieldValue.serverTimestamp(),
          'originalSchemaVersion': doc.data()!['schemaVersion'] ?? 0,
        },
      });

      return backupId;
    } catch (e) {
      return null;
    }
  }

  /// Migrate the legacy `system_config/main` to V1 schema.
  ///
  /// Strategy:
  /// 1. Read legacy doc fields (`supportedCurrencies`, `supportedCities`,
  ///    `deliveryRatesByCity`, `primaryCurrency`).
  /// 2. For each city in `supportedCities`, resolve its country via
  ///    [Cities.findCityByName]. If unresolvable → add to `unmigrated`.
  /// 3. For each currency in `supportedCurrencies`, transpose to V1 format.
  /// 4. Write the new doc with `schemaVersion: 1`.
  ///
  /// Returns a [MigrationReport].
  static Future<MigrationReport> migrateToV1() async {
    final report = MigrationReport();

    try {
      final doc =
          await _firestore.collection('system_config').doc('main').get();

      if (!doc.exists) {
        report.addWarning('system_config/main does not exist — nothing to migrate');
        return report;
      }

      final data = doc.data()!;

      // Already V1?
      if (data['schemaVersion'] == 1) {
        report.addWarning('Document is already schemaVersion 1');
        return report;
      }

      // --- Parse legacy fields ---
      final legacyCurrencies =
          data['supportedCurrencies'] as Map<String, dynamic>? ?? {};
      final legacyCities = List<String>.from(data['supportedCities'] ?? []);
      final legacyRates =
          Map<String, double>.from(data['deliveryRatesByCity'] ?? {});
      final legacyPrimary = data['primaryCurrency'] ?? 'XAF';

      // --- Migrate currencies ---
      final Map<String, Map<String, dynamic>> currencies = {};
      int currSortOrder = 10;
      for (final entry in legacyCurrencies.entries) {
        final code = entry.key;
        final old = entry.value as Map<String, dynamic>;
        currencies[code] = {
          'code': code,
          'name': old['name'] ?? code,
          'symbol': old['symbol'] ?? code,
          'decimals': code == 'XAF' || code == 'XOF' ? 0 : 2,
          'enabled': old['isActive'] ?? true,
          'displayPattern': '#,##0 $code',
          'fxBaseRate': (old['exchangeRate'] ?? 1).toDouble(),
          'sortOrder': currSortOrder,
        };
        currSortOrder += 10;
        report.addMigrated('currency: $code');
      }

      // --- Migrate cities (resolve country via static catalog) ---
      final Map<String, Map<String, Map<String, dynamic>>> citiesByCountry = {};
      final Map<String, bool> countriesSeen = {};
      int citySortOrder = 10;

      for (final cityName in legacyCities) {
        final found = Cities.findCityByName(cityName);
        if (found == null) {
          report.addUnmigrated(
              'city: $cityName — not found in static catalog, skipped');
          continue;
        }

        final isoCode = _countryIsoCode[found.countryEnum];
        if (isoCode == null) {
          report.addUnmigrated(
              'city: $cityName — country enum ${found.countryEnum} has no ISO mapping, skipped');
          continue;
        }

        countriesSeen[isoCode] = true;
        final citySlug = cityName
            .toLowerCase()
            .replaceAll(RegExp(r'[éèê]'), 'e')
            .replaceAll(RegExp(r'[àâ]'), 'a')
            .replaceAll(RegExp(r'[ùû]'), 'u')
            .replaceAll(RegExp(r'[ôö]'), 'o')
            .replaceAll(RegExp(r'[îï]'), 'i')
            .replaceAll(RegExp(r'[^a-z0-9]'), '_')
            .replaceAll(RegExp(r'_+'), '_')
            .replaceAll(RegExp(r'^_|_$'), '');

        citiesByCountry.putIfAbsent(isoCode, () => {});
        final deliveryFee = legacyRates[cityName] ?? 0.0;
        // Infer currency from country
        final countryConfig = Countries.getByCountry(found.countryEnum);
        final cityCurrency = countryConfig?.currency ?? legacyPrimary;

        citiesByCountry[isoCode]![citySlug] = {
          'code': citySlug,
          'name': found.name,
          'region': found.region ?? '',
          'enabled': true,
          'isMajorCity': found.isMajorCity,
          'deliveryFee': deliveryFee,
          'currencyCode': cityCurrency,
          'latitude': 0.0,
          'longitude': 0.0,
          'validationRadiusKm': 20.0,
          'sortOrder': citySortOrder,
        };
        citySortOrder += 10;
        report.addMigrated('city: $cityName → $isoCode/$citySlug');
      }

      // --- Build minimal countries from what we found ---
      final Map<String, Map<String, dynamic>> countries = {};
      int countrySortOrder = 10;
      for (final isoCode in countriesSeen.keys) {
        final countryEnum = _countryIsoCode.entries
            .firstWhere((e) => e.value == isoCode)
            .key;
        final config = Countries.getByCountry(countryEnum);

        countries[isoCode] = {
          'code': isoCode,
          'name': config?.name ?? isoCode,
          'dialCode': config?.countryCode ?? '',
          'defaultCurrencyCode': config?.currency ?? legacyPrimary,
          'timezone': _timezoneForCountry(isoCode),
          'enabled': true,
          'defaultCityCode':
              citiesByCountry[isoCode]?.keys.first ?? '',
          'providerIds': <String>[],
          'sortOrder': countrySortOrder,
        };
        countrySortOrder += 10;
        report.addMigrated('country: $isoCode');
      }

      // --- Infer primary country from primary currency ---
      String primaryCountryCode = 'CM';
      for (final entry in countries.entries) {
        final defCurrency = entry.value['defaultCurrencyCode'];
        if (defCurrency == legacyPrimary) {
          primaryCountryCode = entry.key;
          break;
        }
      }

      // --- Write V1 document ---
      final v1Doc = <String, dynamic>{
        'schemaVersion': 1,
        'status': 'active',
        'primaryCountryCode': primaryCountryCode,
        'countries': countries,
        'citiesByCountry': citiesByCountry,
        'currencies': currencies,
        'mobileMoneyProviders': <String, dynamic>{},
        'revenuePolicies': {
          'subscriptions': {'enabled': false, 'mode': 'full_amount_to_platform'},
          'purchases': {'enabled': false, 'commissionBps': 0},
          'exchanges': {'enabled': false, 'commissionBps': 0},
          'courierFees': {'enabled': false, 'platformShareBps': 0},
        },
        'updatedAt': FieldValue.serverTimestamp(),
        'updatedByAdminId': 'migration_service',
      };

      await _firestore.collection('system_config').doc('main').set(v1Doc);
      report.success = true;
    } catch (e) {
      report.addWarning('Migration failed: $e');
    }

    return report;
  }

  static String _timezoneForCountry(String isoCode) {
    switch (isoCode) {
      case 'CM':
        return 'Africa/Douala';
      case 'KE':
        return 'Africa/Nairobi';
      case 'TZ':
        return 'Africa/Dar_es_Salaam';
      case 'UG':
        return 'Africa/Kampala';
      case 'NG':
        return 'Africa/Lagos';
      default:
        return 'UTC';
    }
  }
}

/// Report of a migration run.
class MigrationReport {
  bool success = false;
  final List<String> migrated = [];
  final List<String> unmigrated = [];
  final List<String> warnings = [];

  void addMigrated(String item) => migrated.add(item);
  void addUnmigrated(String item) => unmigrated.add(item);
  void addWarning(String item) => warnings.add(item);

  @override
  String toString() {
    final buf = StringBuffer();
    buf.writeln('Migration ${success ? "SUCCEEDED" : "FAILED"}');
    buf.writeln('Migrated (${migrated.length}):');
    for (final m in migrated) {
      buf.writeln('  ✓ $m');
    }
    if (unmigrated.isNotEmpty) {
      buf.writeln('Unmigrated (${unmigrated.length}):');
      for (final u in unmigrated) {
        buf.writeln('  ✗ $u');
      }
    }
    if (warnings.isNotEmpty) {
      buf.writeln('Warnings (${warnings.length}):');
      for (final w in warnings) {
        buf.writeln('  ⚠ $w');
      }
    }
    return buf.toString();
  }
}
