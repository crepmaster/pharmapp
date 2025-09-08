import 'package:equatable/equatable.dart';
import '../services/encryption_service.dart';

/// Payment preferences for users (pharmacies and couriers) with encryption
class PaymentPreferences extends Equatable {
  const PaymentPreferences({
    required this.defaultMethod,
    required this.defaultPhone,
    this.encryptedPhone,
    this.phoneHash,
    this.autoPayFromWallet = false,
    this.isSetupComplete = false,
  });

  /// Primary mobile money operator: 'mtn', 'orange', 'camtel'
  final String defaultMethod;
  
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

  /// Display name for payment method
  String get methodDisplayName {
    switch (defaultMethod.toLowerCase()) {
      case 'mtn':
        return 'MTN MoMo';
      case 'orange':
        return 'Orange Money';
      case 'camtel':
        return 'Camtel Mobile Money';
      default:
        return 'Unknown';
    }
  }

  /// Masked phone number for secure display
  String get maskedPhone {
    return EncryptionService.maskPhoneNumber(defaultPhone);
  }
  
  /// Formatted phone number for display (masked for security)
  String get formattedPhone {
    return '+237 ${maskedPhone}';
  }
  
  /// Get full phone number (use with caution - for payment processing only)
  String get fullPhoneNumber {
    if (defaultPhone.startsWith('+237')) {
      return defaultPhone;
    }
    return '+237$defaultPhone';
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

  /// Create from Firestore data (with encryption support)
  factory PaymentPreferences.fromMap(Map<String, dynamic> map) {
    return PaymentPreferences(
      defaultMethod: map['defaultMethod'] as String? ?? '',
      defaultPhone: map['defaultPhone'] as String? ?? '',
      encryptedPhone: map['encryptedPhone'] as String?,
      phoneHash: map['phoneHash'] as String?,
      autoPayFromWallet: map['autoPayFromWallet'] as bool? ?? false,
      isSetupComplete: map['isSetupComplete'] as bool? ?? false,
    );
  }

  /// Convert to Firestore data (with encryption)
  Map<String, dynamic> toMap() {
    return {
      'defaultMethod': defaultMethod,
      'defaultPhone': EncryptionService.maskPhoneNumber(defaultPhone), // Store only masked version
      'encryptedPhone': encryptedPhone ?? EncryptionService.encryptData(defaultPhone),
      'phoneHash': phoneHash ?? EncryptionService.hashPhoneNumber(defaultPhone),
      'autoPayFromWallet': autoPayFromWallet,
      'isSetupComplete': isSetupComplete,
    };
  }
  
  /// Convert to backend data (includes original phone for processing)
  Map<String, dynamic> toBackendMap() {
    return {
      'defaultMethod': defaultMethod,
      'defaultPhone': defaultPhone, // Send original phone to backend
      'autoPayFromWallet': autoPayFromWallet,
      'isSetupComplete': isSetupComplete,
    };
  }
  
  /// Create secure version with encrypted data
  static PaymentPreferences createSecure({
    required String method,
    required String phoneNumber,
    bool autoPayFromWallet = false,
    bool isSetupComplete = false,
  }) {
    return PaymentPreferences(
      defaultMethod: method,
      defaultPhone: phoneNumber, // Keep original for backend processing
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

  /// Copy with new values (maintains encryption)
  PaymentPreferences copyWith({
    String? defaultMethod,
    String? defaultPhone,
    String? encryptedPhone,
    String? phoneHash,
    bool? autoPayFromWallet,
    bool? isSetupComplete,
  }) {
    return PaymentPreferences(
      defaultMethod: defaultMethod ?? this.defaultMethod,
      defaultPhone: defaultPhone ?? this.defaultPhone,
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