import 'package:cloud_firestore/cloud_firestore.dart';

/// System-wide configuration managed by administrators
class SystemConfig {
  final String id;
  final String primaryCurrency;
  final Map<String, CurrencyConfig> supportedCurrencies;
  final List<String> supportedCities;
  final Map<String, double> deliveryRatesByCity;
  final DateTime lastUpdated;
  final String updatedByAdminId;

  SystemConfig({
    required this.id,
    required this.primaryCurrency,
    required this.supportedCurrencies,
    required this.supportedCities,
    required this.deliveryRatesByCity,
    required this.lastUpdated,
    required this.updatedByAdminId,
  });

  factory SystemConfig.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    
    return SystemConfig(
      id: doc.id,
      primaryCurrency: data['primaryCurrency'] ?? 'USD',
      supportedCurrencies: (data['supportedCurrencies'] as Map<String, dynamic>? ?? {})
          .map((key, value) => MapEntry(key, CurrencyConfig.fromMap(value))),
      supportedCities: List<String>.from(data['supportedCities'] ?? []),
      deliveryRatesByCity: Map<String, double>.from(data['deliveryRatesByCity'] ?? {}),
      lastUpdated: (data['lastUpdated'] as Timestamp).toDate(),
      updatedByAdminId: data['updatedByAdminId'] ?? '',
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'primaryCurrency': primaryCurrency,
      'supportedCurrencies': supportedCurrencies.map((key, value) => MapEntry(key, value.toMap())),
      'supportedCities': supportedCities,
      'deliveryRatesByCity': deliveryRatesByCity,
      'lastUpdated': FieldValue.serverTimestamp(),
      'updatedByAdminId': updatedByAdminId,
    };
  }

  SystemConfig copyWith({
    String? primaryCurrency,
    Map<String, CurrencyConfig>? supportedCurrencies,
    List<String>? supportedCities,
    Map<String, double>? deliveryRatesByCity,
    String? updatedByAdminId,
  }) {
    return SystemConfig(
      id: id,
      primaryCurrency: primaryCurrency ?? this.primaryCurrency,
      supportedCurrencies: supportedCurrencies ?? this.supportedCurrencies,
      supportedCities: supportedCities ?? this.supportedCities,
      deliveryRatesByCity: deliveryRatesByCity ?? this.deliveryRatesByCity,
      lastUpdated: DateTime.now(),
      updatedByAdminId: updatedByAdminId ?? this.updatedByAdminId,
    );
  }
}

class CurrencyConfig {
  final String code; // XAF, USD, EUR
  final String symbol; // FCFA, $, €
  final String name; // Central African CFA Franc
  final double exchangeRate; // Rate to USD
  final bool isActive;

  CurrencyConfig({
    required this.code,
    required this.symbol,
    required this.name,
    required this.exchangeRate,
    required this.isActive,
  });

  factory CurrencyConfig.fromMap(Map<String, dynamic> map) {
    return CurrencyConfig(
      code: map['code'] ?? '',
      symbol: map['symbol'] ?? '',
      name: map['name'] ?? '',
      exchangeRate: (map['exchangeRate'] ?? 0.0).toDouble(),
      isActive: map['isActive'] ?? true,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'code': code,
      'symbol': symbol,
      'name': name,
      'exchangeRate': exchangeRate,
      'isActive': isActive,
    };
  }

  static Map<String, CurrencyConfig> getAfricanDefaults() {
    return {
      'XAF': CurrencyConfig(
        code: 'XAF',
        symbol: 'FCFA',
        name: 'Central African CFA Franc',
        exchangeRate: 600.0, // ~600 XAF = 1 USD
        isActive: true,
      ),
      'XOF': CurrencyConfig(
        code: 'XOF',
        symbol: 'FCFA',
        name: 'West African CFA Franc',
        exchangeRate: 600.0,
        isActive: true,
      ),
      'KES': CurrencyConfig(
        code: 'KES',
        symbol: 'KSh',
        name: 'Kenyan Shilling',
        exchangeRate: 150.0, // ~150 KES = 1 USD
        isActive: true,
      ),
      'NGN': CurrencyConfig(
        code: 'NGN',
        symbol: '₦',
        name: 'Nigerian Naira',
        exchangeRate: 800.0, // ~800 NGN = 1 USD
        isActive: true,
      ),
      'GHS': CurrencyConfig(
        code: 'GHS',
        symbol: 'GH₵',
        name: 'Ghanaian Cedi',
        exchangeRate: 12.0, // ~12 GHS = 1 USD
        isActive: true,
      ),
      'USD': CurrencyConfig(
        code: 'USD',
        symbol: '\$',
        name: 'US Dollar',
        exchangeRate: 1.0,
        isActive: true,
      ),
    };
  }
}

class DynamicSubscriptionPlan {
  final String id;
  final String name;
  final String description;
  final Map<String, double> pricesByCurrency; // XAF: 6000, USD: 10
  final int inventoryLimit; // -1 for unlimited
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