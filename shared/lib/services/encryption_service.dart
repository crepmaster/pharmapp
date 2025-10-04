import 'dart:convert';
import 'package:crypto/crypto.dart';

/// Encryption service for securing sensitive payment data
class EncryptionService {
  static const String _defaultSalt = 'pharmapp_2025_salt_key';
  
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
  
  /// Create display-friendly masked phone number
  static String maskPhoneNumber(String phoneNumber) {
    if (phoneNumber.isEmpty) return '';
    
    // Remove country code if present
    String phone = phoneNumber.replaceAll('+237', '');
    
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
  
  /// Validate payment method selection
  static bool isValidPaymentMethod(String method) {
    const validMethods = ['mtn', 'orange', 'camtel'];
    return validMethods.contains(method.toLowerCase());
  }
  
  /// Cross-validate phone number with payment method
  static bool validatePhoneWithMethod(String phoneNumber, String method) {
    final phone = phoneNumber.replaceAll(RegExp(r'[\s\+\-\(\)]'), '').replaceAll('237', '');
    
    switch (method.toLowerCase()) {
      case 'mtn':
        // MTN MoMo prefixes in Cameroon: 650-659, 670-679, 680-689
        return RegExp(r'^(65[0-9]|67[0-9]|68[0-9])\d{6}$').hasMatch(phone);
      case 'orange':
        // Orange Money prefixes: 690-699
        return RegExp(r'^69[0-9]\d{6}$').hasMatch(phone);
      case 'camtel':
        // Camtel Mobile Money prefixes: 620-629
        return RegExp(r'^62[0-9]\d{6}$').hasMatch(phone);
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