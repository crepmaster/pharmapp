import 'package:equatable/equatable.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// 🌍 AFRICAN MARKET CONFIGURATION
/// Admin-configurable subscription pricing for different countries/currencies

/// Supported currencies for African markets
enum SupportedCurrency {
  xaf('XAF', 'Central African CFA Franc', '₣'),           // Cameroon, Chad, CAR, etc.
  xof('XOF', 'West African CFA Franc', 'F'),              // Senegal, Mali, Burkina Faso, etc.
  ngn('NGN', 'Nigerian Naira', '₦'),                      // Nigeria
  kes('KES', 'Kenyan Shilling', 'KSh'),                   // Kenya
  ghs('GHS', 'Ghanaian Cedi', '₵'),                       // Ghana
  mad('MAD', 'Moroccan Dirham', 'DH'),                    // Morocco
  egd('EGD', 'Egyptian Pound', '£E'),                     // Egypt
  zar('ZAR', 'South African Rand', 'R'),                  // South Africa
  usd('USD', 'US Dollar', '\$');                          // Fallback/International

  const SupportedCurrency(this.code, this.name, this.symbol);
  final String code;
  final String name;
  final String symbol;
}

/// Admin-configurable subscription plan pricing
class SubscriptionPlanConfig extends Equatable {
  final String id;
  final String planName;              // e.g., "Basic", "Professional", "Enterprise"
  final String description;
  final SupportedCurrency currency;
  final double monthlyPrice;
  final double yearlyPrice;           // Usually discounted
  final int trialDays;                // Free trial period
  final List<String> features;
  final Map<String, dynamic> limits;  // e.g., {"medicines": 100, "locations": 1}
  final bool isActive;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String createdBy;             // Admin who created this config

  const SubscriptionPlanConfig({
    required this.id,
    required this.planName,
    required this.description,
    required this.currency,
    required this.monthlyPrice,
    required this.yearlyPrice,
    required this.trialDays,
    required this.features,
    required this.limits,
    required this.isActive,
    required this.createdAt,
    required this.updatedAt,
    required this.createdBy,
  });

  factory SubscriptionPlanConfig.fromMap(Map<String, dynamic> map) {
    return SubscriptionPlanConfig(
      id: map['id'] as String,
      planName: map['planName'] as String,
      description: map['description'] as String,
      currency: _parseCurrency(map['currency']),
      monthlyPrice: (map['monthlyPrice'] as num).toDouble(),
      yearlyPrice: (map['yearlyPrice'] as num).toDouble(),
      trialDays: map['trialDays'] as int,
      features: List<String>.from(map['features']),
      limits: Map<String, dynamic>.from(map['limits']),
      isActive: map['isActive'] as bool,
      createdAt: (map['createdAt'] as Timestamp).toDate(),
      updatedAt: (map['updatedAt'] as Timestamp).toDate(),
      createdBy: map['createdBy'] as String,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'planName': planName,
      'description': description,
      'currency': currency.code,
      'monthlyPrice': monthlyPrice,
      'yearlyPrice': yearlyPrice,
      'trialDays': trialDays,
      'features': features,
      'limits': limits,
      'isActive': isActive,
      'createdAt': Timestamp.fromDate(createdAt),
      'updatedAt': Timestamp.fromDate(updatedAt),
      'createdBy': createdBy,
    };
  }

  static SupportedCurrency _parseCurrency(String? currencyCode) {
    return SupportedCurrency.values
        .firstWhere(
          (currency) => currency.code == currencyCode,
          orElse: () => SupportedCurrency.xaf, // Default to XAF for Africa
        );
  }

  /// Format price with currency symbol
  String getFormattedMonthlyPrice() {
    return '${currency.symbol}${monthlyPrice.toStringAsFixed(0)}/month';
  }

  String getFormattedYearlyPrice() {
    return '${currency.symbol}${yearlyPrice.toStringAsFixed(0)}/year';
  }

  /// Calculate yearly savings
  double getYearlySavings() {
    return (monthlyPrice * 12) - yearlyPrice;
  }

  String getFormattedYearlySavings() {
    final savings = getYearlySavings();
    if (savings <= 0) return '';
    return 'Save ${currency.symbol}${savings.toStringAsFixed(0)}/year';
  }

  @override
  List<Object?> get props => [
        id,
        planName,
        description,
        currency,
        monthlyPrice,
        yearlyPrice,
        trialDays,
        features,
        limits,
        isActive,
        createdAt,
        updatedAt,
        createdBy,
      ];
}

/// Country-specific subscription configuration
class CountrySubscriptionConfig extends Equatable {
  final String countryCode;          // e.g., "CM" for Cameroon
  final String countryName;          // e.g., "Cameroon"
  final SupportedCurrency currency;
  final List<SubscriptionPlanConfig> plans;
  final bool isActive;
  final DateTime createdAt;
  final DateTime updatedAt;

  const CountrySubscriptionConfig({
    required this.countryCode,
    required this.countryName,
    required this.currency,
    required this.plans,
    required this.isActive,
    required this.createdAt,
    required this.updatedAt,
  });

  factory CountrySubscriptionConfig.fromMap(Map<String, dynamic> map) {
    return CountrySubscriptionConfig(
      countryCode: map['countryCode'] as String,
      countryName: map['countryName'] as String,
      currency: SubscriptionPlanConfig._parseCurrency(map['currency']),
      plans: (map['plans'] as List<dynamic>)
          .map((plan) => SubscriptionPlanConfig.fromMap(plan as Map<String, dynamic>))
          .toList(),
      isActive: map['isActive'] as bool,
      createdAt: (map['createdAt'] as Timestamp).toDate(),
      updatedAt: (map['updatedAt'] as Timestamp).toDate(),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'countryCode': countryCode,
      'countryName': countryName,
      'currency': currency.code,
      'plans': plans.map((plan) => plan.toMap()).toList(),
      'isActive': isActive,
      'createdAt': Timestamp.fromDate(createdAt),
      'updatedAt': Timestamp.fromDate(updatedAt),
    };
  }

  /// Get active plans for this country
  List<SubscriptionPlanConfig> getActivePlans() {
    return plans.where((plan) => plan.isActive).toList();
  }

  @override
  List<Object?> get props => [
        countryCode,
        countryName,
        currency,
        plans,
        isActive,
        createdAt,
        updatedAt,
      ];
}

/// 🌍 CAMEROON DEFAULT CONFIGURATION (XAF Pricing)
class CameroonSubscriptionDefaults {
  static CountrySubscriptionConfig get defaultConfig {
    final now = DateTime.now();
    
    return CountrySubscriptionConfig(
      countryCode: 'CM',
      countryName: 'Cameroon',
      currency: SupportedCurrency.xaf,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      plans: [
        // Basic Plan - Affordable for small pharmacies
        SubscriptionPlanConfig(
          id: 'basic_cm_xaf',
          planName: 'Essential',
          description: 'Perfect for small neighborhood pharmacies',
          currency: SupportedCurrency.xaf,
          monthlyPrice: 6000,      // ~$10 USD = 6,000 XAF
          yearlyPrice: 60000,      // 10 months price for yearly (2 months free)
          trialDays: 14,           // 2 weeks free trial
          features: [
            'Up to 100 medicine listings',
            'Create and receive exchange proposals',
            'Basic inventory management',
            'Mobile app access',
            'WhatsApp support',
          ],
          limits: {
            'medicines': 100,
            'proposals_per_month': 50,
            'locations': 1,
            'analytics': false,
          },
          isActive: true,
          createdAt: now,
          updatedAt: now,
          createdBy: 'system',
        ),
        
        // Professional Plan - For growing pharmacies
        SubscriptionPlanConfig(
          id: 'professional_cm_xaf',
          planName: 'Professionnel',
          description: 'For growing pharmacies with advanced needs',
          currency: SupportedCurrency.xaf,
          monthlyPrice: 15000,     // ~$25 USD = 15,000 XAF
          yearlyPrice: 150000,     // 10 months price for yearly
          trialDays: 30,           // 1 month free trial for premium
          features: [
            'Unlimited medicine listings',
            'Advanced analytics dashboard',
            'Priority customer support',
            'Bulk inventory operations',
            'All Essential features included',
            'SMS notifications',
          ],
          limits: {
            'medicines': -1,        // Unlimited
            'proposals_per_month': -1,
            'locations': 3,
            'analytics': true,
          },
          isActive: true,
          createdAt: now,
          updatedAt: now,
          createdBy: 'system',
        ),
        
        // Enterprise Plan - For pharmacy chains
        SubscriptionPlanConfig(
          id: 'enterprise_cm_xaf',
          planName: 'Entreprise',
          description: 'For pharmacy chains and large operations',
          currency: SupportedCurrency.xaf,
          monthlyPrice: 30000,     // ~$50 USD = 30,000 XAF
          yearlyPrice: 300000,     // 10 months price for yearly
          trialDays: 30,           // 1 month free trial
          features: [
            'Multi-location management',
            'API access for integrations',
            'Custom reporting tools',
            'Dedicated account manager',
            'All Professional features included',
            'Training and onboarding',
          ],
          limits: {
            'medicines': -1,        // Unlimited
            'proposals_per_month': -1,
            'locations': -1,        // Unlimited
            'analytics': true,
            'api_access': true,
          },
          isActive: true,
          createdAt: now,
          updatedAt: now,
          createdBy: 'system',
        ),
      ],
    );
  }
}