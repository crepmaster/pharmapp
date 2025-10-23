import 'package:equatable/equatable.dart';
import '../services/encryption_service.dart';
import 'country_config.dart';

/// Payment preferences for users (pharmacies and couriers) with encryption
/// Supports multi-country mobile money operators
class PaymentPreferences extends Equatable {
  const PaymentPreferences({
    required this.defaultMethod,
    required this.defaultPhone,
    this.country,
    this.operator,
    this.encryptedPhone,
    this.phoneHash,
    this.autoPayFromWallet = false,
    this.isSetupComplete = false,
  });

  /// Primary mobile money operator: 'mtn', 'orange', 'mpesa', etc.
  final String defaultMethod;

  /// Country selection (for multi-country support)
  final Country? country;

  /// Payment operator (multi-country support)
  final PaymentOperator? operator;
  
  /// Default phone number for mobile money (Cameroon format: +2376XXXXXXXX) - for display only
  final String defaultPhone;
  
  /// Encrypted phone number for secure storage
  final String? encryptedPhone;
  
  /// Phone number hash for validation and lookup
  final String? phoneHash;
  
  /// Whether to automatically use wallet balance first before mobile money
  final bool autoPayFromWallet;
  
  /// Whether payment setup has been completed
  final bool isSetupComplete;

  /// Display name for payment method (multi-country support)
  String get methodDisplayName {
    // Use operator config if available
    if (operator != null && country != null) {
      final countryConfig = Countries.getByCountry(country!);
      final operatorConfig = countryConfig?.getOperatorConfig(operator!);
      if (operatorConfig != null) {
        return operatorConfig.displayName;
      }
    }

    // Fallback to legacy string-based method
    switch (defaultMethod.toLowerCase()) {
      case 'mtn':
      case 'mtn_cameroon':
        return 'MTN Mobile Money';
      case 'orange':
      case 'orange_cameroon':
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

  /// Masked phone number for secure display
  String get maskedPhone {
    return EncryptionService.maskPhoneNumber(defaultPhone);
  }
  
  /// Formatted phone number for display (masked for security, multi-country)
  String get formattedPhone {
    if (country != null) {
      final countryConfig = Countries.getByCountry(country!);
      if (countryConfig != null) {
        return '+${countryConfig.countryCode} ${maskedPhone}';
      }
    }
    // Default to Cameroon for backwards compatibility
    return '+237 ${maskedPhone}';
  }

  /// Get full phone number (use with caution - for payment processing only)
  String get fullPhoneNumber {
    final countryCode = country != null
        ? Countries.getByCountry(country!)?.countryCode ?? '237'
        : '237';

    if (defaultPhone.startsWith('+')) {
      return defaultPhone;
    }
    if (defaultPhone.startsWith(countryCode)) {
      return '+$defaultPhone';
    }
    return '+$countryCode$defaultPhone';
  }

  /// Get currency for selected country
  String get currency {
    if (country != null) {
      final countryConfig = Countries.getByCountry(country!);
      return countryConfig?.currency ?? 'XAF';
    }
    return 'XAF'; // Default to Cameroon
  }

  /// Get currency symbol for selected country
  String get currencySymbol {
    if (country != null) {
      final countryConfig = Countries.getByCountry(country!);
      return countryConfig?.currencySymbol ?? 'FCFA';
    }
    return 'FCFA'; // Default to Cameroon
  }

  /// Validate Cameroon phone number format
  bool get isPhoneValid {
    return EncryptionService.isValidCameroonPhone(defaultPhone);
  }
  
  /// Cross-validate phone number with selected payment method
  bool get isPhoneMethodValid {
    return EncryptionService.validatePhoneWithMethod(defaultPhone, defaultMethod);
  }
  
  /// Check if this is a test/sandbox phone number
  bool get isTestNumber {
    return EncryptionService.isTestPhoneNumber(defaultPhone);
  }

  /// Create from Firestore data (with encryption support + multi-country)
  factory PaymentPreferences.fromMap(Map<String, dynamic> map) {
    // Parse country
    Country? country;
    if (map['country'] != null) {
      try {
        final countryStr = map['country'] as String;
        country = Country.values.firstWhere(
          (c) => c.toString().split('.').last == countryStr,
          orElse: () => Country.cameroon,
        );
      } catch (e) {
        country = Country.cameroon; // Default to Cameroon
      }
    }

    // Parse operator
    PaymentOperator? operator;
    if (map['operator'] != null) {
      try {
        final operatorStr = map['operator'] as String;
        operator = PaymentOperator.values.firstWhere(
          (o) => o.toString().split('.').last == operatorStr,
          orElse: () => PaymentOperator.mtnCameroon,
        );
      } catch (e) {
        operator = null;
      }
    }

    return PaymentPreferences(
      defaultMethod: map['defaultMethod'] as String? ?? '',
      defaultPhone: map['defaultPhone'] as String? ?? '',
      country: country,
      operator: operator,
      encryptedPhone: map['encryptedPhone'] as String?,
      phoneHash: map['phoneHash'] as String?,
      autoPayFromWallet: map['autoPayFromWallet'] as bool? ?? false,
      isSetupComplete: map['isSetupComplete'] as bool? ?? false,
    );
  }

  /// Convert to Firestore data (with encryption + multi-country)
  Map<String, dynamic> toMap() {
    return {
      'defaultMethod': defaultMethod,
      'defaultPhone': EncryptionService.maskPhoneNumber(defaultPhone), // 🔒 SECURITY: Store masked version only
      'country': country?.toString().split('.').last,
      'operator': operator?.toString().split('.').last,
      'encryptedPhone': encryptedPhone ?? EncryptionService.encryptData(defaultPhone),
      'phoneHash': phoneHash ?? EncryptionService.hashPhoneNumber(defaultPhone),
      'autoPayFromWallet': autoPayFromWallet,
      'isSetupComplete': isSetupComplete,
    };
  }
  
  /// Convert to backend data (legacy format for compatibility)
  Map<String, dynamic> toBackendMap() {
    // Send simplified format that backend expects
    return {
      'defaultMethod': defaultMethod,
      'defaultPhone': defaultPhone, // Send original phone to backend
      'autoPayFromWallet': autoPayFromWallet,
      'isSetupComplete': isSetupComplete,
      // Exclude encrypted fields for backend compatibility
    };
  }
  
  /// Create secure version with encrypted data (multi-country support)
  static PaymentPreferences createSecure({
    required String method,
    required String phoneNumber,
    Country? country,
    PaymentOperator? operator,
    bool autoPayFromWallet = false,
    bool isSetupComplete = false,
  }) {
    return PaymentPreferences(
      defaultMethod: method,
      defaultPhone: phoneNumber, // Keep original for backend processing
      country: country,
      operator: operator,
      encryptedPhone: EncryptionService.encryptData(phoneNumber),
      phoneHash: EncryptionService.hashPhoneNumber(phoneNumber),
      autoPayFromWallet: autoPayFromWallet,
      isSetupComplete: isSetupComplete,
    );
  }

  /// Create empty preferences (for new users)
  factory PaymentPreferences.empty() {
    return const PaymentPreferences(
      defaultMethod: '',
      defaultPhone: '',
      autoPayFromWallet: false,
      isSetupComplete: false,
    );
  }

  /// Copy with new values (maintains encryption + multi-country)
  PaymentPreferences copyWith({
    String? defaultMethod,
    String? defaultPhone,
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
      country: country ?? this.country,
      operator: operator ?? this.operator,
      encryptedPhone: encryptedPhone ?? this.encryptedPhone,
      phoneHash: phoneHash ?? this.phoneHash,
      autoPayFromWallet: autoPayFromWallet ?? this.autoPayFromWallet,
      isSetupComplete: isSetupComplete ?? this.isSetupComplete,
    );
  }

  @override
  List<Object?> get props => [
        defaultMethod,
        defaultPhone,
        country,
        operator,
        encryptedPhone,
        phoneHash,
        autoPayFromWallet,
        isSetupComplete,
      ];

  @override
  String toString() {
    return 'PaymentPreferences(method: $defaultMethod, phone: ${maskedPhone}, autoWallet: $autoPayFromWallet, complete: $isSetupComplete)';
  }

  /// Get sandbox test number (environment-aware)
  static String getSandboxNumber(String method) {
    // Only return test numbers in development
    if (EncryptionService.isProductionEnvironment()) {
      return ''; // No test numbers in production
    }
    
    switch (method.toLowerCase()) {
      case 'mtn':
        return '677123456'; // MTN test number
      case 'orange':
        return '694123456'; // Orange test number
      default:
        return '677123456';
    }
  }
  
  /// Validate payment preferences for security compliance
  bool get isSecurityCompliant {
    return isPhoneValid && 
           isPhoneMethodValid && 
           EncryptionService.isValidPaymentMethod(defaultMethod) &&
           (!EncryptionService.isProductionEnvironment() || !isTestNumber);
  }
}