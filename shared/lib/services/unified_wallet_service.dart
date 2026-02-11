import 'dart:convert';
import 'package:http/http.dart' as http;

/// Unified Wallet Service for all PharmApp applications
/// Handles wallet operations for pharmacies, couriers, and admins consistently
class UnifiedWalletService {
  static const String functionsUrl = 'https://europe-west1-mediexchange.cloudfunctions.net';
  
  // ======================= COMMON WALLET OPERATIONS =======================
  
  /// Gets wallet balance for any user (auto-creates if doesn't exist)
  /// Works for pharmacies, couriers, and admins
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
  
  /// Creates top-up intent for mobile money payment
  /// Works for all user types
  static Future<Map<String, dynamic>> createTopup({
    required String userId,
    required int amountXAF,
    required String method, // 'mtn' or 'orange'
    required String phoneNumber,
    String description = 'Wallet top-up',
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$functionsUrl/topupIntent'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'userId': userId,
          'method': method,
          'amount': amountXAF,
          'currency': 'XAF',
          'msisdn': phoneNumber,
          'description': description,
        }),
      );
      
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        throw Exception('Failed to create topup: ${response.body}');
      }
    } catch (e) {
      throw Exception('Network error creating topup: $e');
    }
  }
  
  // ======================= PHARMACY-SPECIFIC OPERATIONS =======================
  
  /// Creates subscription payment for pharmacies
  static Future<Map<String, dynamic>> createSubscriptionPayment({
    required String pharmacyId,
    required int amountXAF,
    required String subscriptionPlan,
    required String method,
    required String phoneNumber,
  }) async {
    return await createTopup(
      userId: pharmacyId,
      amountXAF: amountXAF,
      method: method,
      phoneNumber: phoneNumber,
      description: 'Subscription payment - $subscriptionPlan plan',
    );
  }
  
  /// Gets pharmacy wallet with subscription context
  static Future<Map<String, dynamic>> getPharmacyWalletWithSubscription({
    required String pharmacyId,
  }) async {
    final wallet = await getWalletBalance(userId: pharmacyId);
    
    // Add pharmacy-specific context
    wallet['type'] = 'pharmacy';
    wallet['canPaySubscription'] = (wallet['available'] ?? 0) >= 6000; // Basic plan minimum
    
    return wallet;
  }
  
  // ======================= COURIER-SPECIFIC OPERATIONS =======================
  
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
    // For withdrawals, we'll use the same topup endpoint but with negative amount
    // This would typically be handled by a separate withdrawal function
    try {
      final response = await http.post(
        Uri.parse('$functionsUrl/courierWithdrawal'), // This would need to be implemented
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'userId': courierId,
          'method': method,
          'amount': amountXAF,
          'currency': 'XAF',
          'msisdn': phoneNumber,
          'description': 'Courier earnings withdrawal',
        }),
      );
      
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        throw Exception('Failed to create withdrawal: ${response.body}');
      }
    } catch (e) {
      // Fallback: Return formatted error for now
      return {
        'error': 'Withdrawal feature coming soon',
        'message': 'Contact support for manual withdrawal',
        'amount': amountXAF,
        'method': method,
      };
    }
  }
  
  // ======================= ADMIN OPERATIONS =======================
  
  /// Gets wallet summary for admin dashboard
  static Future<Map<String, dynamic>> getWalletSummary({
    required String adminId,
  }) async {
    final wallet = await getWalletBalance(userId: adminId);
    
    // Add admin-specific context
    wallet['type'] = 'admin';
    wallet['role'] = 'administrator';
    
    return wallet;
  }
  
  // ======================= UNIFIED REGISTRATION INTEGRATION =======================
  
  /// Initializes wallet during user registration
  /// This ensures every user has a wallet immediately after registration
  static Future<void> initializeWalletOnRegistration({
    required String userId,
    required String userType, // 'pharmacy', 'courier', 'admin'
  }) async {
    try {
      // Simply call getWallet - it auto-creates if doesn't exist
      await getWalletBalance(userId: userId);
      print('✅ Wallet initialized for $userType user: $userId');
    } catch (e) {
      print('⚠️ Wallet initialization failed for $userId: $e');
      // Don't throw - wallet will be created on first access
    }
  }
  
  // ======================= UTILITY METHODS =======================
  
  /// Formats XAF currency for display
  static String formatXAF(int amount) {
    return '${amount.toString().replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), 
      (Match m) => '${m[1]},',
    )} XAF';
  }
  
  /// Checks if amount is sufficient for operation
  static bool hasSufficientBalance(Map<String, dynamic> wallet, int requiredAmount) {
    final available = wallet['available'] ?? 0;
    return available >= requiredAmount;
  }
  
  /// Gets user-friendly wallet status
  static String getWalletStatus(Map<String, dynamic> wallet) {
    final available = wallet['available'] ?? 0;
    final held = wallet['held'] ?? 0;
    
    if (available == 0 && held == 0) return 'Empty';
    if (held > 0) return 'Active (${formatXAF(held)} held)';
    if (available > 0) return 'Active';
    return 'Unknown';
  }
  
  /// Gets transaction history (placeholder for future implementation)
  static Future<List<Map<String, dynamic>>> getTransactionHistory({
    required String userId,
    int limit = 20,
  }) async {
    // This would call a backend function to get ledger entries
    // For now, return empty list
    return [];
  }
}