import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../models/system_config.dart';
import '../models/country_option.dart';
import '../models/city_option.dart';
import '../models/currency_option.dart';
import '../models/provider_option.dart';

/// Service for reading and writing `system_config/main` (V1 schema).
///
/// Every write method performs an atomic Firestore `update()` on the
/// specific field(s) it owns — never a full-document `set()`.
///
/// Read is pure — no implicit document creation (no write-on-read).
class SystemConfigService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  static const String _configCollection = 'system_config';
  static const String _configDocId = 'main';
  static const String _plansCollection = 'dynamic_subscription_plans';

  static DocumentReference get _configRef =>
      _firestore.collection(_configCollection).doc(_configDocId);

  // ---------------------------------------------------------------------------
  // READ
  // ---------------------------------------------------------------------------

  /// Load the current V1 config. Returns `null` if the document does not exist
  /// or is not parseable. **No implicit creation.**
  static Future<SystemConfigV1?> loadConfig() async {
    try {
      final doc = await _configRef.get();
      if (!doc.exists) return null;
      return SystemConfigV1.fromFirestore(doc);
    } catch (e) {
      return null;
    }
  }

  /// Stream the config for real-time UI updates.
  static Stream<SystemConfigV1?> configStream() {
    return _configRef.snapshots().map((doc) {
      if (!doc.exists) return null;
      return SystemConfigV1.fromFirestore(doc);
    });
  }

  // ---------------------------------------------------------------------------
  // BOOTSTRAP
  // ---------------------------------------------------------------------------

  /// Creates a minimal V1 document only if `system_config/main` does not exist.
  ///
  /// Uses `set()` intentionally — the document does not exist yet so `update()`
  /// would fail. This is the only method allowed to use `set()` on this ref.
  /// Returns `true` if the document was created, `false` if it already existed
  /// or an error occurred.
  static Future<bool> initializeEmptyConfig(String adminUid) async {
    try {
      final doc = await _configRef.get();
      if (doc.exists) return false;
      await _configRef.set({
        'schemaVersion': 1,
        'status': 'active',
        'primaryCountryCode': '',
        'countries': <String, dynamic>{},
        'citiesByCountry': <String, dynamic>{},
        'currencies': <String, dynamic>{},
        'mobileMoneyProviders': <String, dynamic>{},
        'revenuePolicies': {
          'subscriptions': {
            'enabled': false,
            'mode': 'full_amount_to_platform',
          },
          'purchases': {'enabled': false, 'commissionBps': 0},
          'exchanges': {'enabled': false, 'commissionBps': 0},
          'courierFees': {'enabled': false, 'platformShareBps': 0},
        },
        'updatedAt': FieldValue.serverTimestamp(),
        'updatedByAdminId': adminUid,
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // COUNTRIES
  // ---------------------------------------------------------------------------

  /// Sprint 2B.1 follow-up — write base country fields as dotted-paths
  /// so a country edit cannot clobber the 7 license fields written by
  /// [setCountryLicenseConfigViaCallable].
  ///
  /// The previous shape (`'countries.$code': country.toMap()`) replaced
  /// the whole `countries.{code}` map server-side, deleting every key
  /// that wasn't in [CountryOption.toMap] — including all licence
  /// configuration. We now build one `countries.{code}.{field}` entry
  /// per base key so a write only touches what `toMap()` exposes.
  static Future<bool> upsertCountry(String code, CountryOption country) async {
    try {
      final updates = buildCountryUpsertPayload(code, country);
      updates['updatedAt'] = FieldValue.serverTimestamp();
      await _configRef.update(updates);
      return true;
    } catch (e) {
      return false;
    }
  }

  /// Pure helper for [upsertCountry] — returns the Firestore update map
  /// that should be passed to `update()`. Exposed so unit tests can
  /// assert that the payload uses dotted-paths and never includes any
  /// of the 9 backend-controlled license fields, even indirectly.
  static Map<String, dynamic> buildCountryUpsertPayload(
      String code, CountryOption country) {
    final map = country.toMap();
    final updates = <String, dynamic>{};
    map.forEach((key, value) {
      updates['countries.$code.$key'] = value;
    });
    return updates;
  }

  static Future<bool> toggleCountry(String code, bool enabled) async {
    try {
      await _configRef.update({
        'countries.$code.enabled': enabled,
        'updatedAt': FieldValue.serverTimestamp(),
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  static Future<bool> setPrimaryCountry(String code) async {
    try {
      await _configRef.update({
        'primaryCountryCode': code,
        'updatedAt': FieldValue.serverTimestamp(),
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  /// Sprint 2B.1 — Update the 7 license fields on a country via backend
  /// callable `setCountryLicenseConfig`. Other country fields keep
  /// their existing client-direct-write path (`upsertCountry`).
  ///
  /// Pass only the fields you want to update (dotted-path merge on
  /// backend side). The callable enforces RBAC (super_admin OR admin
  /// with `manage_pharmacies` permission + `countryCode ∈ countryScopes`).
  ///
  /// Returns `null` on success, a user-facing error message on failure.
  static Future<String?> setCountryLicenseConfigViaCallable({
    required String countryCode,
    bool? licenseRequired,
    String? licenseLabel,
    String? licenseHelpText,
    bool? licenseVerificationRequired,
    String? licenseFormatRegex,
    bool? licenseDocumentRequired,
    int? licenseGracePeriodDays,
  }) async {
    try {
      final callable = FirebaseFunctions.instanceFor(region: 'europe-west1')
          .httpsCallable('setCountryLicenseConfig');
      final payload = <String, dynamic>{'countryCode': countryCode};
      if (licenseRequired != null) {
        payload['licenseRequired'] = licenseRequired;
      }
      if (licenseLabel != null) payload['licenseLabel'] = licenseLabel;
      if (licenseHelpText != null) payload['licenseHelpText'] = licenseHelpText;
      if (licenseVerificationRequired != null) {
        payload['licenseVerificationRequired'] = licenseVerificationRequired;
      }
      if (licenseFormatRegex != null) {
        payload['licenseFormatRegex'] = licenseFormatRegex;
      }
      if (licenseDocumentRequired != null) {
        payload['licenseDocumentRequired'] = licenseDocumentRequired;
      }
      if (licenseGracePeriodDays != null) {
        payload['licenseGracePeriodDays'] = licenseGracePeriodDays;
      }
      await callable.call<Map<String, dynamic>>(payload);
      return null; // success
    } on FirebaseFunctionsException catch (e) {
      return e.message ?? 'An error occurred while saving the license configuration.';
    } catch (e) {
      return 'Unexpected error: $e';
    }
  }

  // ---------------------------------------------------------------------------
  // CITIES — V2B: all writes go through backend callable `upsertCity`.
  // No hard delete — use enabled=false to deactivate.
  // ---------------------------------------------------------------------------

  /// Create or update a city via backend callable.
  /// Returns a user-facing error message on failure, or `null` on success.
  static Future<String?> upsertCityViaCallable(
      String countryCode, String cityCode, CityOption city) async {
    try {
      final callable = FirebaseFunctions.instanceFor(region: 'europe-west1')
          .httpsCallable('upsertCity');
      await callable.call<Map<String, dynamic>>({
        'countryCode': countryCode,
        'cityCode': cityCode,
        'name': city.name,
        'region': city.region,
        'enabled': city.enabled,
        'isMajorCity': city.isMajorCity,
        'deliveryFee': city.deliveryFee,
        'currencyCode': city.currencyCode,
        'latitude': city.latitude,
        'longitude': city.longitude,
        'validationRadiusKm': city.validationRadiusKm,
        'sortOrder': city.sortOrder,
      });
      return null; // success
    } on FirebaseFunctionsException catch (e) {
      return e.message ?? 'An error occurred while saving the city.';
    } catch (e) {
      return 'Unexpected error: $e';
    }
  }


  // ---------------------------------------------------------------------------
  // CURRENCIES
  // ---------------------------------------------------------------------------

  static Future<bool> upsertCurrency(String code, CurrencyOption currency) async {
    try {
      await _configRef.update({
        'currencies.$code': currency.toMap(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  static Future<bool> toggleCurrency(String code, bool enabled) async {
    try {
      await _configRef.update({
        'currencies.$code.enabled': enabled,
        'updatedAt': FieldValue.serverTimestamp(),
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  /// One-shot cleanup: remove the legacy `primaryCurrencyCode` field from
  /// `system_config/main`. Currency is now per-country via `defaultCurrencyCode`.
  static Future<bool> removeLegacyPrimaryCurrencyCode() async {
    try {
      await _configRef.update({
        'primaryCurrencyCode': FieldValue.delete(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // MOBILE MONEY PROVIDERS
  // ---------------------------------------------------------------------------

  static Future<bool> upsertProvider(String id, ProviderOption provider) async {
    try {
      await _configRef.update({
        'mobileMoneyProviders.$id': provider.toMap(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  static Future<bool> toggleProvider(String id, bool enabled) async {
    try {
      await _configRef.update({
        'mobileMoneyProviders.$id.enabled': enabled,
        'updatedAt': FieldValue.serverTimestamp(),
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // REVENUE POLICIES
  // ---------------------------------------------------------------------------

  static Future<bool> updateRevenuePolicies(
      Map<String, RevenuePolicy> policies) async {
    try {
      await _configRef.update({
        'revenuePolicies': policies.map((k, v) => MapEntry(k, v.toMap())),
        'updatedAt': FieldValue.serverTimestamp(),
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // SUBSCRIPTION PLANS (separate collection: dynamic_subscription_plans)
  // ---------------------------------------------------------------------------

  static Stream<List<DynamicSubscriptionPlan>> getSubscriptionPlans() {
    return _firestore
        .collection(_plansCollection)
        .where('isActive', isEqualTo: true)
        .snapshots()
        .map((snapshot) {
      return snapshot.docs
          .map((doc) => DynamicSubscriptionPlan.fromFirestore(doc))
          .toList()
        ..sort((a, b) => a.pricesByCurrency.values.first
            .compareTo(b.pricesByCurrency.values.first));
    });
  }

  static Stream<List<DynamicSubscriptionPlan>> getAllSubscriptionPlans() {
    return _firestore
        .collection(_plansCollection)
        .snapshots()
        .map((snapshot) {
      return snapshot.docs
          .map((doc) => DynamicSubscriptionPlan.fromFirestore(doc))
          .toList()
        ..sort((a, b) => a.pricesByCurrency.values.first
            .compareTo(b.pricesByCurrency.values.first));
    });
  }

  static Future<bool> createSubscriptionPlan(DynamicSubscriptionPlan plan) async {
    try {
      await _firestore.collection(_plansCollection).add(plan.toFirestore());
      return true;
    } catch (e) {
      return false;
    }
  }

  static Future<bool> updateSubscriptionPlan(DynamicSubscriptionPlan plan) async {
    try {
      await _firestore
          .collection(_plansCollection)
          .doc(plan.id)
          .update(plan.toFirestore());
      return true;
    } catch (e) {
      return false;
    }
  }

  static Future<bool> deleteSubscriptionPlan(String planId) async {
    try {
      await _firestore.collection(_plansCollection).doc(planId).delete();
      return true;
    } catch (e) {
      return false;
    }
  }

  static Future<bool> toggleSubscriptionPlan(String planId, bool isActive) async {
    try {
      await _firestore.collection(_plansCollection).doc(planId).update({
        'isActive': isActive,
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  static Future<void> createDefaultPlans() async {
    final plans = [
      DynamicSubscriptionPlan(
        id: '',
        name: 'Essential',
        description: 'Perfect for small pharmacies getting started',
        pricesByCurrency: {
          'XAF': 6000.0,
          'KES': 1500.0,
          'NGN': 8000.0,
          'GHS': 120.0,
          'USD': 10.0,
        },
        inventoryLimit: 100,
        features: [
          'Up to 100 medicine listings',
          'Create and receive exchange proposals',
          'Basic inventory management',
          'Mobile app access',
          'Customer support',
        ],
        trialDays: 14,
        isActive: true,
        createdAt: DateTime.now(),
      ),
      DynamicSubscriptionPlan(
        id: '',
        name: 'Professional',
        description: 'Advanced features for growing pharmacy networks',
        pricesByCurrency: {
          'XAF': 15000.0,
          'KES': 3750.0,
          'NGN': 20000.0,
          'GHS': 300.0,
          'USD': 25.0,
        },
        inventoryLimit: -1,
        features: [
          'Unlimited medicine listings',
          'Advanced analytics dashboard',
          'Priority customer support',
          'Bulk inventory operations',
          'Exchange history reports',
          'All Essential features included',
        ],
        trialDays: 30,
        isActive: true,
        createdAt: DateTime.now(),
      ),
      DynamicSubscriptionPlan(
        id: '',
        name: 'Enterprise',
        description: 'Complete solution for large pharmacy chains',
        pricesByCurrency: {
          'XAF': 30000.0,
          'KES': 7500.0,
          'NGN': 40000.0,
          'GHS': 600.0,
          'USD': 50.0,
        },
        inventoryLimit: -1,
        features: [
          'Multi-location management',
          'API access for integrations',
          'Custom reporting tools',
          'Dedicated account manager',
          'White-label options',
          'All Professional features included',
        ],
        trialDays: 30,
        isActive: true,
        createdAt: DateTime.now(),
      ),
    ];

    for (final plan in plans) {
      await createSubscriptionPlan(plan);
    }
  }

  // ---------------------------------------------------------------------------
  // PHARMACIES BY CITY (admin view)
  // ---------------------------------------------------------------------------

  static Stream<Map<String, List<Map<String, dynamic>>>> getPharmaciesByCity() {
    return _firestore
        .collection('pharmacies')
        .snapshots()
        .map((snapshot) {
      final Map<String, List<Map<String, dynamic>>> pharmaciesByCity = {};

      for (final doc in snapshot.docs) {
        final data = doc.data();
        final city =
            data['locationData']?['address']?['city'] ?? 'Unknown City';

        if (!pharmaciesByCity.containsKey(city)) {
          pharmaciesByCity[city] = [];
        }

        pharmaciesByCity[city]!.add({
          'id': doc.id,
          'pharmacyName': data['pharmacyName'] ?? 'Unknown',
          'email': data['email'] ?? 'No email',
          'subscriptionStatus': data['subscriptionStatus'] ?? 'unknown',
          'subscriptionPlan': data['subscriptionPlan'] ?? 'basic',
        });
      }

      return pharmaciesByCity;
    });
  }
}
