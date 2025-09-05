import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/system_config.dart';

class SystemConfigService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  static const String _configCollection = 'system_config';
  static const String _plansCollection = 'dynamic_subscription_plans';

  /// Get current system configuration
  static Future<SystemConfig?> getSystemConfig() async {
    try {
      final doc = await _firestore
          .collection(_configCollection)
          .doc('main')
          .get();

      if (doc.exists) {
        return SystemConfig.fromFirestore(doc);
      }

      // Create default config if none exists
      return await _createDefaultConfig();
    } catch (e) {
      // Debug statement removed for production security
      return null;
    }
  }

  /// Update system configuration
  static Future<bool> updateSystemConfig(SystemConfig config) async {
    try {
      await _firestore
          .collection(_configCollection)
          .doc('main')
          .set(config.toFirestore());
      return true;
    } catch (e) {
      // Debug statement removed for production security
      return false;
    }
  }

  /// Create default African-focused configuration
  static Future<SystemConfig> _createDefaultConfig() async {
    final defaultConfig = SystemConfig(
      id: 'main',
      primaryCurrency: 'XAF', // Start with Central African CFA Franc
      supportedCurrencies: CurrencyConfig.getAfricanDefaults(),
      supportedCities: [
        // Cameroon cities
        'Yaoundé', 'Douala', 'Bamenda', 'Bafoussam',
        // Kenya cities
        'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru',
        // Nigeria cities
        'Lagos', 'Abuja', 'Kano', 'Port Harcourt',
        // Ghana cities
        'Accra', 'Kumasi', 'Tamale', 'Sekondi-Takoradi',
      ],
      deliveryRatesByCity: {
        // Cameroon (XAF)
        'Yaoundé': 1000.0, 'Douala': 1200.0, 'Bamenda': 800.0, 'Bafoussam': 800.0,
        // Kenya (KES)
        'Nairobi': 200.0, 'Mombasa': 250.0, 'Kisumu': 180.0, 'Nakuru': 180.0,
        // Nigeria (NGN)
        'Lagos': 500.0, 'Abuja': 400.0, 'Kano': 350.0, 'Port Harcourt': 400.0,
        // Ghana (GHS)
        'Accra': 15.0, 'Kumasi': 12.0, 'Tamale': 10.0, 'Sekondi-Takoradi': 12.0,
      },
      lastUpdated: DateTime.now(),
      updatedByAdminId: 'system',
    );

    await _firestore
        .collection(_configCollection)
        .doc('main')
        .set(defaultConfig.toFirestore());

    return defaultConfig;
  }

  /// Add new supported city
  static Future<bool> addCity(String cityName, double deliveryRate) async {
    try {
      final config = await getSystemConfig();
      if (config == null) return false;

      final updatedCities = [...config.supportedCities, cityName];
      final updatedRates = {...config.deliveryRatesByCity, cityName: deliveryRate};

      final updatedConfig = config.copyWith(
        supportedCities: updatedCities,
        deliveryRatesByCity: updatedRates,
      );

      return await updateSystemConfig(updatedConfig);
    } catch (e) {
      // Debug statement removed for production security
      return false;
    }
  }

  /// Update currency exchange rates
  static Future<bool> updateCurrencyRates(Map<String, double> newRates) async {
    try {
      final config = await getSystemConfig();
      if (config == null) return false;

      final updatedCurrencies = Map<String, CurrencyConfig>.from(config.supportedCurrencies);
      
      for (final entry in newRates.entries) {
        if (updatedCurrencies.containsKey(entry.key)) {
          final currency = updatedCurrencies[entry.key]!;
          updatedCurrencies[entry.key] = CurrencyConfig(
            code: currency.code,
            symbol: currency.symbol,
            name: currency.name,
            exchangeRate: entry.value,
            isActive: currency.isActive,
          );
        }
      }

      final updatedConfig = config.copyWith(
        supportedCurrencies: updatedCurrencies,
      );

      return await updateSystemConfig(updatedConfig);
    } catch (e) {
      // Debug statement removed for production security
      return false;
    }
  }

  /// Get all dynamic subscription plans
  static Stream<List<DynamicSubscriptionPlan>> getSubscriptionPlans() {
    return _firestore
        .collection(_plansCollection)
        .where('isActive', isEqualTo: true)
        .snapshots()
        .map((snapshot) {
      return snapshot.docs
          .map((doc) => DynamicSubscriptionPlan.fromFirestore(doc))
          .toList()
        ..sort((a, b) => a.pricesByCurrency.values.first.compareTo(b.pricesByCurrency.values.first));
    });
  }

  /// Create new subscription plan
  static Future<bool> createSubscriptionPlan(DynamicSubscriptionPlan plan) async {
    try {
      await _firestore
          .collection(_plansCollection)
          .add(plan.toFirestore());
      return true;
    } catch (e) {
      // Debug statement removed for production security
      return false;
    }
  }

  /// Update subscription plan
  static Future<bool> updateSubscriptionPlan(DynamicSubscriptionPlan plan) async {
    try {
      await _firestore
          .collection(_plansCollection)
          .doc(plan.id)
          .update(plan.toFirestore());
      return true;
    } catch (e) {
      // Debug statement removed for production security
      return false;
    }
  }

  /// Create default African subscription plans
  static Future<void> createDefaultPlans() async {
    final config = await getSystemConfig();
    if (config == null) return;

    final plans = [
      DynamicSubscriptionPlan(
        id: '',
        name: 'Essential',
        description: 'Perfect for small pharmacies getting started',
        pricesByCurrency: {
          'XAF': 6000.0,  // 6,000 FCFA (~$10)
          'KES': 1500.0,  // 1,500 KSh (~$10)
          'NGN': 8000.0,  // 8,000 ₦ (~$10)
          'GHS': 120.0,   // 120 GH₵ (~$10)
          'USD': 10.0,    // $10
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
          'XAF': 15000.0, // 15,000 FCFA (~$25)
          'KES': 3750.0,  // 3,750 KSh (~$25)
          'NGN': 20000.0, // 20,000 ₦ (~$25)
          'GHS': 300.0,   // 300 GH₵ (~$25)
          'USD': 25.0,    // $25
        },
        inventoryLimit: -1, // Unlimited
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
          'XAF': 30000.0, // 30,000 FCFA (~$50)
          'KES': 7500.0,  // 7,500 KSh (~$50)
          'NGN': 40000.0, // 40,000 ₦ (~$50)
          'GHS': 600.0,   // 600 GH₵ (~$50)
          'USD': 50.0,    // $50
        },
        inventoryLimit: -1, // Unlimited
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

  /// Get pharmacies by city for admin management
  static Stream<Map<String, List<Map<String, dynamic>>>> getPharmaciesByCity() {
    return _firestore
        .collection('pharmacies')
        .snapshots()
        .map((snapshot) {
      final Map<String, List<Map<String, dynamic>>> pharmaciesByCity = {};

      for (final doc in snapshot.docs) {
        final data = doc.data();
        final city = data['locationData']?['address']?['city'] ?? 'Unknown City';
        
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