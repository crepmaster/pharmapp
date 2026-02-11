import 'dart:convert';
import 'package:crypto/crypto.dart';

/// Encryption service for securing sensitive payment data
/// Multi-country support with enhanced security
class EncryptionService {
  // ✅ SECURITY FIX: Use environment variable instead of hardcoded salt
  static String get _defaultSalt =>
    const String.fromEnvironment('ENCRYPTION_SALT',
      defaultValue: 'pharmapp_2025_default_CHANGE_IN_PRODUCTION');
  
  /// Encrypt sensitive data using HMAC-SHA256
  static String encryptData(String data, {String? customSalt}) {
    if (data.isEmpty) return '';
    
    final salt = customSalt ?? _defaultSalt;
    final key = utf8.encode(salt);
    final bytes = utf8.encode(data);
    final hmacSha256 = Hmac(sha256, key);
    final digest = hmacSha256.convert(bytes);
    
    return digest.toString();
  }
  
  /// Hash phone number for secure storage
  static String hashPhoneNumber(String phoneNumber) {
    if (phoneNumber.isEmpty) return '';
    
    // Normalize phone number (remove spaces, +, -)
    final normalized = phoneNumber.replaceAll(RegExp(r'[\s\+\-\(\)]'), '');
    
    // Add specific salt for phone numbers
    return encryptData(normalized, customSalt: '${_defaultSalt}_phone_hash');
  }
  
  /// Create display-friendly masked phone number (multi-country support)
  static String maskPhoneNumber(String phoneNumber) {
    if (phoneNumber.isEmpty) return '';

    // ✅ FIX CRIT-003: Remove all non-digit characters and country codes properly
    String phone = phoneNumber.replaceAll(RegExp(r'[\s\+\-\(\)]'), '');

    // Remove known country codes (Cameroon: 237, Kenya: 254, Tanzania: 255, Uganda: 256, Nigeria: 234)
    // Check for 3-digit codes first (more specific), then 2-digit codes
    if (phone.startsWith('237') || phone.startsWith('254') ||
        phone.startsWith('255') || phone.startsWith('256') || phone.startsWith('234')) {
      phone = phone.substring(3); // Remove 3-digit country code
    } else if (phone.length > 9 && phone.substring(0, 2).contains(RegExp(r'^[1-9]{2}$'))) {
      // Fallback: if starts with 2 non-zero digits and phone is too long, might be 2-digit code
      phone = phone.substring(2);
    }

    if (phone.length >= 9) {
      // Show first 3 digits and last 2: 677****56
      return '${phone.substring(0, 3)}****${phone.substring(phone.length - 2)}';
    } else if (phone.length >= 6) {
      // Show first 2 digits and last 2: 67****56
      return '${phone.substring(0, 2)}****${phone.substring(phone.length - 2)}';
    }

    return '****';
  }
  
  /// Validate phone format before processing
  static bool isValidCameroonPhone(String phoneNumber) {
    // Remove country code and formatting
    String phone = phoneNumber.replaceAll(RegExp(r'[\s\+\-\(\)]'), '').replaceAll('237', '');
    
    // Check Cameroon format: 9 digits starting with 6-9
    final phoneRegex = RegExp(r'^[6-9]\d{8}$');
    return phoneRegex.hasMatch(phone);
  }
  
  /// Generate secure random salt for user-specific encryption
  static String generateUserSalt(String userId) {
    return encryptData(userId, customSalt: '${_defaultSalt}_user_${userId.substring(0, 8)}');
  }
  
  /// Environment-based test number management
  static bool isProductionEnvironment() {
    return const bool.fromEnvironment('PRODUCTION', defaultValue: false);
  }
  
  /// Check if phone number is a test/sandbox number
  static bool isTestPhoneNumber(String phoneNumber) {
    // In production, no test numbers allowed
    if (isProductionEnvironment()) {
      return false;
    }
    
    final phone = phoneNumber.replaceAll(RegExp(r'[\s\+\-\(\)]'), '').replaceAll('237', '');
    
    // Development test numbers
    const testNumbers = [
      '677123456', // MTN test
      '678987654', // MTN test  
      '679111222', // MTN test
      '694123456', // Orange test
      '695987654', // Orange test
      '696111222', // Orange test
    ];
    
    return testNumbers.contains(phone);
  }
  
  /// Validate payment method selection (multi-country support)
  /// ✅ FIX: Support all operators across all countries
  static bool isValidPaymentMethod(String method) {
    const validMethods = [
      // Cameroon
      'mtn', 'orange', 'camtel', 'mtn_cameroon', 'orange_cameroon',
      // Kenya
      'mpesa', 'mpesa_kenya', 'airtel_kenya',
      // Tanzania
      'mpesa_tanzania', 'tigo', 'tigo_tanzania', 'airtel_tanzania',
      // Uganda
      'mtn_uganda', 'airtel_uganda',
      // Nigeria
      'mtn_nigeria', 'airtel_nigeria', 'glo', 'glo_nigeria', '9mobile', 'nine_mobile',
      // Generic
      'airtel',
    ];
    return validMethods.contains(method.toLowerCase().replaceAll(' ', '_'));
  }

  /// Cross-validate phone number with payment method (multi-country)
  /// ✅ FIX: Support validation for all countries
  /// Note: For full multi-country validation, use CountryConfig.isValidPhoneNumber()
  static bool validatePhoneWithMethod(String phoneNumber, String method) {
    final phone = phoneNumber.replaceAll(RegExp(r'[\s\+\-\(\)]'), '');

    // ✅ FIX CRIT-003: Remove country codes properly (3-digit codes first)
    String normalizedPhone = phone;
    if (normalizedPhone.startsWith('237') || normalizedPhone.startsWith('254') ||
        normalizedPhone.startsWith('255') || normalizedPhone.startsWith('256') ||
        normalizedPhone.startsWith('234')) {
      normalizedPhone = normalizedPhone.substring(3);
    }

    switch (method.toLowerCase().replaceAll(' ', '_')) {
      // Cameroon operators
      case 'mtn':
      case 'mtn_cameroon':
        // MTN MoMo prefixes in Cameroon: 650-659, 670-679, 680-689
        return RegExp(r'^(65[0-9]|67[0-9]|68[0-9])\d{6}$').hasMatch(normalizedPhone);
      case 'orange':
      case 'orange_cameroon':
        // Orange Money prefixes: 690-699
        return RegExp(r'^69[0-9]\d{6}$').hasMatch(normalizedPhone);
      case 'camtel':
        // Camtel Mobile Money prefixes: 620-629
        return RegExp(r'^62[0-9]\d{6}$').hasMatch(normalizedPhone);

      // Kenya operators
      case 'mpesa':
      case 'mpesa_kenya':
        // M-Pesa Kenya: 7XX (700-729)
        return RegExp(r'^7[0-2][0-9]\d{6}$').hasMatch(normalizedPhone);
      case 'airtel_kenya':
        // Airtel Kenya: 73X
        return RegExp(r'^73[0-9]\d{6}$').hasMatch(normalizedPhone);

      // Tanzania operators
      case 'mpesa_tanzania':
        // M-Pesa Tanzania: 74, 75, 76
        return RegExp(r'^7[4-6]\d{7}$').hasMatch(normalizedPhone);
      case 'tigo':
      case 'tigo_tanzania':
        // Tigo Pesa: 71, 65, 67
        return RegExp(r'^(71|65|67)\d{7}$').hasMatch(normalizedPhone);
      case 'airtel_tanzania':
        // Airtel Tanzania: 68, 69, 78
        return RegExp(r'^(68|69|78)\d{7}$').hasMatch(normalizedPhone);

      // Uganda operators
      case 'mtn_uganda':
        // MTN Uganda: 77, 78
        return RegExp(r'^7[7-8]\d{7}$').hasMatch(normalizedPhone);
      case 'airtel_uganda':
        // Airtel Uganda: 70, 75
        return RegExp(r'^(70|75)\d{7}$').hasMatch(normalizedPhone);

      // Nigeria operators (10 digits)
      case 'mtn_nigeria':
        // MTN Nigeria: 703, 706, 803, 806, 810, 813, 814, 816, 903, 906
        return RegExp(r'^(703|706|803|806|810|813|814|816|903|906)\d{7}$').hasMatch(normalizedPhone);
      case 'airtel':
      case 'airtel_nigeria':
        // Airtel Nigeria: 701, 708, 802, 808, 812, 901, 902, 904, 907, 912
        return RegExp(r'^(701|708|802|808|812|901|902|904|907|912)\d{7}$').hasMatch(normalizedPhone);
      case 'glo':
      case 'glo_nigeria':
        // Glo Nigeria: 705, 805, 807, 811, 815, 905
        return RegExp(r'^(705|805|807|811|815|905)\d{7}$').hasMatch(normalizedPhone);
      case '9mobile':
      case 'nine_mobile':
        // 9mobile: 809, 817, 818, 909, 908
        return RegExp(r'^(809|817|818|909|908)\d{7}$').hasMatch(normalizedPhone);

      default:
        return false;
    }
  }
  
  /// Generate secure audit log entry (no sensitive data)
  static Map<String, dynamic> createSecureAuditLog({
    required String userId,
    required String action,
    required String method,
    String? additionalData,
  }) {
    return {
      'userId': hashPhoneNumber(userId), // Hash user ID for privacy
      'action': action,
      'method': method,
      'timestamp': DateTime.now().toIso8601String(),
      'additionalData': additionalData,
      'sessionHash': encryptData('${userId}_${DateTime.now().millisecondsSinceEpoch}'),
    };
  }
}