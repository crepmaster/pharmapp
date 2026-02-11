import 'dart:convert';
import 'package:http/http.dart' as http;

/// Unified Wallet Service for courier app
/// Copy of shared service for immediate implementation
class UnifiedWalletService {
  static const String functionsUrl = 'https://europe-west1-mediexchange.cloudfunctions.net';
  
  /// Gets wallet balance for any user (auto-creates if doesn't exist)
  static Future<Map<String, dynamic>> getWalletBalance({
    required String userId,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$functionsUrl/getWallet?userId=$userId'),
        headers: {'Content-Type': 'application/json'},
      );
      
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        throw Exception('Failed to get wallet balance: ${response.body}');
      }
    } catch (e) {
      throw Exception('Network error getting wallet: $e');
    }
  }
  
  /// Gets courier wallet with earnings breakdown
  static Future<Map<String, dynamic>> getCourierEarnings({
    required String courierId,
  }) async {
    final wallet = await getWalletBalance(userId: courierId);
    
    // Add courier-specific context
    wallet['type'] = 'courier';
    wallet['totalEarnings'] = wallet['available'] ?? 0;
    wallet['canWithdraw'] = (wallet['available'] ?? 0) >= 1000; // Minimum withdrawal
    
    return wallet;
  }
  
  /// Creates withdrawal request for couriers
  static Future<Map<String, dynamic>> createCourierWithdrawal({
    required String courierId,
    required int amountXAF,
    required String method,
    required String phoneNumber,
  }) async {
    try {
      // For now, return a placeholder response
      return {
        'success': false,
        'message': 'Withdrawal feature coming soon! Contact support for manual withdrawal.',
        'amount': amountXAF,
        'method': method,
        'phone': phoneNumber,
      };
    } catch (e) {
      return {
        'error': 'Withdrawal feature coming soon',
        'message': 'Contact support for manual withdrawal',
        'amount': amountXAF,
        'method': method,
      };
    }
  }
  
  /// Formats XAF currency for display
  static String formatXAF(int amount) {
    return '${amount.toString().replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), 
      (Match m) => '${m[1]},',
    )} XAF';
  }
  
  /// Initializes wallet during user registration
  static Future<void> initializeWalletOnRegistration({
    required String userId,
    required String userType,
  }) async {
    try {
      await getWalletBalance(userId: userId);
      print('✅ Wallet initialized for $userType user: $userId');
    } catch (e) {
      print('⚠️ Wallet initialization failed for $userId: $e');
    }
  }
}