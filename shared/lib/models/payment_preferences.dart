import 'package:equatable/equatable.dart';
import '../services/encryption_service.dart';
import 'country_config.dart';

/// Payment preferences for users (pharmacies and couriers) with encryption.
/// Supports both the legacy enum-based flow and the new data-driven flow
/// (Sprint 2A) that uses canonical string identifiers.
class PaymentPreferences extends Equatable {
  const PaymentPreferences({
    required this.defaultMethod,
    required this.defaultPhone,
    // New canonical fields (data-driven flow):
    this.countryCode,
    this.providerId,
    // Legacy enum fields (kept for backward compat):
    this.country,
    this.operator,
    this.encryptedPhone,
    this.phoneHash,
    this.autoPayFromWallet = false,
    this.isSetupComplete = false,
  });

  /// Primary mobile money method identifier (e.g. 'mtn', 'mtn_cm', 'mpesa').
  final String defaultMethod;

  // ---------------------------------------------------------------------------
  // NEW — data-driven canonical identifiers (Sprint 2A)
  // ---------------------------------------------------------------------------

  /// ISO 3166-1 alpha-2 country code, e.g. "CM". Set by the new
  /// data-driven registration flow. Null when loaded from legacy data.
  final String? countryCode;

  /// Stable provider ID from system_config/main → mobileMoneyProviders,
  /// e.g. "mtn_cm". Set by the new registration flow.
  final String? providerId;

  // ---------------------------------------------------------------------------
  // LEGACY — enum-based fields (kept for backward compat)
  // ---------------------------------------------------------------------------

  /// Country enum (legacy multi-country support). Prefer [countryCode].
  final Country? country;

  /// Payment operator enum (legacy). Prefer [providerId].
  final PaymentOperator? operator;

  // ---------------------------------------------------------------------------
  // COMMON FIELDS
  // ---------------------------------------------------------------------------

  /// Default phone number for mobile money — for display/backend use.
  final String defaultPhone;

  /// Encrypted phone number for secure Firestore storage.
  final String? encryptedPhone;

  /// Phone number hash for validation and lookup.
  final String? phoneHash;

  /// Whether to automatically use wallet balance first before mobile money.
  final bool autoPayFromWallet;

  /// Whether payment setup has been completed.
  final bool isSetupComplete;

  // ---------------------------------------------------------------------------
  // COUNTRY-AWARE LOOKUPS
  // ---------------------------------------------------------------------------

  /// Dial prefix (without +) for the selected country.
  String get _dialCode {
    if (countryCode != null) {
      return _dialCodeMap[countryCode] ?? '237';
    }
    if (country != null) {
      return Countries.getByCountry(country!)?.countryCode ?? '237';
    }
    return '237';
  }

  // Static lookup maps — avoids async calls in getters.
  static const _dialCodeMap = {
    'CM': '237',
    'KE': '254',
    'TZ': '255',
    'UG': '256',
    'NG': '234',
  };

  /// Maps ISO 3166-1 alpha-2 codes to [Country] enum values.
  /// Used by [isPhoneValid] to look up the [CountryConfig] for the
  /// canonical `countryCode` field set by the data-driven registration flow.
  static const _isoToCountry = {
    'CM': Country.cameroon,
    'KE': Country.kenya,
    'TZ': Country.tanzania,
    'UG': Country.uganda,
    'NG': Country.nigeria,
  };

  static const _currencyMap = {
    'CM': 'XAF',
    'KE': 'KES',
    'TZ': 'TZS',
    'UG': 'UGX',
    'NG': 'NGN',
  };

  static const _symbolMap = {
    'XAF': 'FCFA',
    'KES': 'KSh',
    'TZS': 'TSh',
    'UGX': 'USh',
    'NGN': '₦',
    'USD': '\$',
    'GHS': 'GH₵',
  };

  // ---------------------------------------------------------------------------
  // DISPLAY GETTERS
  // ---------------------------------------------------------------------------

  /// Human-readable name for the payment method.
  String get methodDisplayName {
    // Prefer operator enum config when available (legacy path).
    if (operator != null && country != null) {
      final countryConfig = Countries.getByCountry(country!);
      final operatorConfig = countryConfig?.getOperatorConfig(operator!);
      if (operatorConfig != null) return operatorConfig.displayName;
    }

    switch (defaultMethod.toLowerCase()) {
      case 'mtn':
      case 'mtn_cameroon':
      case 'mtn_cm':
        return 'MTN Mobile Money';
      case 'orange':
      case 'orange_cameroon':
      case 'orange_cm':
        return 'Orange Money';
      case 'mpesa':
      case 'mpesa_kenya':
        return 'M-Pesa';
      case 'mpesa_tanzania':
        return 'M-Pesa (Vodacom)';
      case 'airtel':
      case 'airtel_kenya':
      case 'airtel_nigeria':
      case 'airtel_tanzania':
      case 'airtel_uganda':
        return 'Airtel Money';
      case 'mtn_nigeria':
        return 'MTN MoMo';
      case 'mtn_uganda':
        return 'MTN Mobile Money';
      case 'glo':
      case 'glo_nigeria':
        return 'Glo Mobile Money';
      case '9mobile':
      case 'nine_mobile':
        return '9mobile Payment';
      case 'tigo':
      case 'tigo_tanzania':
        return 'Tigo Pesa';
      default:
        return 'Mobile Money';
    }
  }

  /// Masked phone number for secure display (e.g. 677****56).
  String get maskedPhone {
    return EncryptionService.maskPhoneNumber(defaultPhone);
  }

  /// Formatted phone with country prefix (masked).
  String get formattedPhone {
    return '+$_dialCode $maskedPhone';
  }

  /// Full phone number with country prefix (use only for payment processing).
  String get fullPhoneNumber {
    final dial = _dialCode;
    if (defaultPhone.startsWith('+')) return defaultPhone;
    if (defaultPhone.startsWith(dial)) return '+$defaultPhone';
    return '+$dial$defaultPhone';
  }

  /// ISO 4217 currency code for the selected country.
  String get currency {
    if (countryCode != null) {
      return _currencyMap[countryCode] ?? 'XAF';
    }
    if (country != null) {
      return Countries.getByCountry(country!)?.currency ?? 'XAF';
    }
    return 'XAF';
  }

  /// Currency display symbol.
  String get currencySymbol {
    return _symbolMap[currency] ?? 'FCFA';
  }

  // ---------------------------------------------------------------------------
  // VALIDATION
  // ---------------------------------------------------------------------------

  bool get isPhoneValid {
    // Country-aware path: resolve CountryConfig from canonical countryCode
    // (new data-driven flow) or legacy country enum, then validate against
    // any operator in that country.
    final Country? countryEnum = _isoToCountry[countryCode] ?? country;
    if (countryEnum != null) {
      final config = Countries.getByCountry(countryEnum);
      if (config != null) {
        return config.availableOperators
            .any((op) => config.isValidPhoneNumber(defaultPhone, op));
      }
    }
    // No country context available — fall back to Cameroon validation
    // (legacy compat for pre-Sprint-2A records without countryCode/country).
    return EncryptionService.isValidCameroonPhone(defaultPhone);
  }

  bool get isPhoneMethodValid {
    return EncryptionService.validatePhoneWithMethod(defaultPhone, defaultMethod);
  }

  bool get isTestNumber {
    return EncryptionService.isTestPhoneNumber(defaultPhone);
  }

  bool get isSecurityCompliant {
    return isPhoneValid &&
        isPhoneMethodValid &&
        EncryptionService.isValidPaymentMethod(defaultMethod) &&
        (!EncryptionService.isProductionEnvironment() || !isTestNumber);
  }

  // ---------------------------------------------------------------------------
  // SERIALISATION
  // ---------------------------------------------------------------------------

  factory PaymentPreferences.fromMap(Map<String, dynamic> map) {
    // Parse legacy Country enum.
    Country? country;
    if (map['country'] != null) {
      try {
        final s = map['country'] as String;
        country = Country.values.firstWhere(
          (c) => c.toString().split('.').last == s,
          orElse: () => Country.cameroon,
        );
      } catch (_) {
        country = Country.cameroon;
      }
    }

    // Parse legacy PaymentOperator enum.
    PaymentOperator? operator;
    if (map['operator'] != null) {
      try {
        final s = map['operator'] as String;
        operator = PaymentOperator.values.firstWhere(
          (o) => o.toString().split('.').last == s,
          orElse: () => PaymentOperator.mtnCameroon,
        );
      } catch (_) {
        operator = null;
      }
    }

    return PaymentPreferences(
      defaultMethod: map['defaultMethod'] as String? ?? '',
      defaultPhone: map['defaultPhone'] as String? ?? '',
      countryCode: map['countryCode'] as String?,
      providerId: map['providerId'] as String?,
      country: country,
      operator: operator,
      encryptedPhone: map['encryptedPhone'] as String?,
      phoneHash: map['phoneHash'] as String?,
      autoPayFromWallet: map['autoPayFromWallet'] as bool? ?? false,
      isSetupComplete: map['isSetupComplete'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'defaultMethod': defaultMethod,
      // 🔒 SECURITY: store masked version only.
      'defaultPhone': EncryptionService.maskPhoneNumber(defaultPhone),
      // Canonical fields (new flow):
      if (countryCode != null) 'countryCode': countryCode,
      if (providerId != null) 'providerId': providerId,
      // Legacy fields:
      'country': country?.toString().split('.').last,
      'operator': operator?.toString().split('.').last,
      'encryptedPhone':
          encryptedPhone ?? EncryptionService.encryptData(defaultPhone),
      'phoneHash': phoneHash ?? EncryptionService.hashPhoneNumber(defaultPhone),
      'autoPayFromWallet': autoPayFromWallet,
      'isSetupComplete': isSetupComplete,
    };
  }

  /// Backend-compatible simplified format (excludes encrypted fields).
  Map<String, dynamic> toBackendMap() {
    return {
      'defaultMethod': defaultMethod,
      'defaultPhone': defaultPhone,
      'autoPayFromWallet': autoPayFromWallet,
      'isSetupComplete': isSetupComplete,
    };
  }

  // ---------------------------------------------------------------------------
  // FACTORIES
  // ---------------------------------------------------------------------------

  /// Creates a [PaymentPreferences] with encrypted phone data.
  ///
  /// The new data-driven registration flow passes [countryCode] and [providerId]
  /// (string identifiers). The legacy flow passes [country] and [operator] enums.
  /// Both sets of parameters are optional and independent.
  static PaymentPreferences createSecure({
    required String method,
    required String phoneNumber,
    // New canonical params:
    String? countryCode,
    String? providerId,
    // Legacy enum params:
    Country? country,
    PaymentOperator? operator,
    bool autoPayFromWallet = false,
    bool isSetupComplete = false,
  }) {
    return PaymentPreferences(
      defaultMethod: method,
      defaultPhone: phoneNumber,
      countryCode: countryCode,
      providerId: providerId,
      country: country,
      operator: operator,
      encryptedPhone: EncryptionService.encryptData(phoneNumber),
      phoneHash: EncryptionService.hashPhoneNumber(phoneNumber),
      autoPayFromWallet: autoPayFromWallet,
      isSetupComplete: isSetupComplete,
    );
  }

  factory PaymentPreferences.empty() {
    return const PaymentPreferences(
      defaultMethod: '',
      defaultPhone: '',
      autoPayFromWallet: false,
      isSetupComplete: false,
    );
  }

  PaymentPreferences copyWith({
    String? defaultMethod,
    String? defaultPhone,
    String? countryCode,
    String? providerId,
    Country? country,
    PaymentOperator? operator,
    String? encryptedPhone,
    String? phoneHash,
    bool? autoPayFromWallet,
    bool? isSetupComplete,
  }) {
    return PaymentPreferences(
      defaultMethod: defaultMethod ?? this.defaultMethod,
      defaultPhone: defaultPhone ?? this.defaultPhone,
      countryCode: countryCode ?? this.countryCode,
      providerId: providerId ?? this.providerId,
      country: country ?? this.country,
      operator: operator ?? this.operator,
      encryptedPhone: encryptedPhone ?? this.encryptedPhone,
      phoneHash: phoneHash ?? this.phoneHash,
      autoPayFromWallet: autoPayFromWallet ?? this.autoPayFromWallet,
      isSetupComplete: isSetupComplete ?? this.isSetupComplete,
    );
  }

  /// Environment-aware sandbox test number.
  static String getSandboxNumber(String method) {
    if (EncryptionService.isProductionEnvironment()) return '';
    switch (method.toLowerCase()) {
      case 'mtn':
        return '677123456';
      case 'orange':
        return '694123456';
      default:
        return '677123456';
    }
  }

  @override
  List<Object?> get props => [
        defaultMethod,
        defaultPhone,
        countryCode,
        providerId,
        country,
        operator,
        encryptedPhone,
        phoneHash,
        autoPayFromWallet,
        isSetupComplete,
      ];

  @override
  String toString() {
    return 'PaymentPreferences(method: $defaultMethod, phone: $maskedPhone, '
        'countryCode: $countryCode, autoWallet: $autoPayFromWallet, '
        'complete: $isSetupComplete)';
  }
}
