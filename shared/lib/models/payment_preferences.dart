import 'package:equatable/equatable.dart';

/// Payment preferences for users (pharmacies and couriers)
class PaymentPreferences extends Equatable {
  const PaymentPreferences({
    required this.defaultMethod,
    required this.defaultPhone,
    this.autoPayFromWallet = false,
    this.isSetupComplete = false,
  });

  /// Primary mobile money operator: 'mtn', 'orange', 'camtel'
  final String defaultMethod;
  
  /// Default phone number for mobile money (Cameroon format: +2376XXXXXXXX)
  final String defaultPhone;
  
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

  /// Formatted phone number for display
  String get formattedPhone {
    if (defaultPhone.startsWith('+237')) {
      return defaultPhone;
    }
    return '+237$defaultPhone';
  }

  /// Validate Cameroon phone number format
  bool get isPhoneValid {
    // Remove country code if present
    String phone = defaultPhone.replaceAll('+237', '');
    // Check if it's 9 digits starting with 6-9
    final phoneRegex = RegExp(r'^[6-9]\d{8}$');
    return phoneRegex.hasMatch(phone);
  }

  /// Create from Firestore data
  factory PaymentPreferences.fromMap(Map<String, dynamic> map) {
    return PaymentPreferences(
      defaultMethod: map['defaultMethod'] as String? ?? '',
      defaultPhone: map['defaultPhone'] as String? ?? '',
      autoPayFromWallet: map['autoPayFromWallet'] as bool? ?? false,
      isSetupComplete: map['isSetupComplete'] as bool? ?? false,
    );
  }

  /// Convert to Firestore data
  Map<String, dynamic> toMap() {
    return {
      'defaultMethod': defaultMethod,
      'defaultPhone': defaultPhone,
      'autoPayFromWallet': autoPayFromWallet,
      'isSetupComplete': isSetupComplete,
    };
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

  /// Copy with new values
  PaymentPreferences copyWith({
    String? defaultMethod,
    String? defaultPhone,
    bool? autoPayFromWallet,
    bool? isSetupComplete,
  }) {
    return PaymentPreferences(
      defaultMethod: defaultMethod ?? this.defaultMethod,
      defaultPhone: defaultPhone ?? this.defaultPhone,
      autoPayFromWallet: autoPayFromWallet ?? this.autoPayFromWallet,
      isSetupComplete: isSetupComplete ?? this.isSetupComplete,
    );
  }

  @override
  List<Object?> get props => [
        defaultMethod,
        defaultPhone,
        autoPayFromWallet,
        isSetupComplete,
      ];

  @override
  String toString() {
    return 'PaymentPreferences(method: $defaultMethod, phone: $defaultPhone, autoWallet: $autoPayFromWallet, complete: $isSetupComplete)';
  }

  /// Sandbox test phone numbers for development/testing
  static const Map<String, List<String>> sandboxTestNumbers = {
    'mtn': [
      '677123456', // MTN MoMo test number
      '678987654', // MTN MoMo test number  
      '679111222', // MTN MoMo test number
    ],
    'orange': [
      '694123456', // Orange Money test number
      '695987654', // Orange Money test number
      '696111222', // Orange Money test number
    ],
  };

  /// Check if phone number is a sandbox test number
  bool get isSandboxNumber {
    final phone = defaultPhone.replaceAll('+237', '');
    return sandboxTestNumbers['mtn']?.contains(phone) == true ||
           sandboxTestNumbers['orange']?.contains(phone) == true;
  }

  /// Get a random sandbox test number for the selected method
  static String getSandboxNumber(String method) {
    final numbers = sandboxTestNumbers[method.toLowerCase()];
    if (numbers != null && numbers.isNotEmpty) {
      return numbers.first;
    }
    return method.toLowerCase() == 'mtn' ? '677123456' : '694123456';
  }
}