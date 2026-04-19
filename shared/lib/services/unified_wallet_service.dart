import 'dart:convert';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'authenticated_http_service.dart';

/// Unified Wallet Service for all PharmApp applications.
/// Handles wallet operations for pharmacies, couriers, and admins consistently.
/// All HTTP calls send Firebase Bearer token for backend auth enforcement.
class UnifiedWalletService {
  static const String _baseUrl = AuthenticatedHttpService.functionsBaseUrl;

  // ======================= COMMON WALLET OPERATIONS =======================

  /// Gets wallet balance for any user (auto-creates if doesn't exist).
  static Future<Map<String, dynamic>> getWalletBalance({
    required String userId,
  }) async {
    if (userId.isEmpty) {
      throw ArgumentError('userId must not be empty');
    }

    final response = await AuthenticatedHttpService.get(
      Uri.parse('$_baseUrl/getWallet?userId=$userId'),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    } else if (response.statusCode == 401) {
      throw Exception('Authentication required – please log in again');
    } else if (response.statusCode == 403) {
      throw Exception('Access denied for this wallet');
    } else {
      throw Exception('Failed to get wallet balance (${response.statusCode})');
    }
  }

  /// Creates top-up intent for mobile money payment.
  static Future<Map<String, dynamic>> createTopup({
    required String userId,
    required int amountXAF,
    required String method,
    required String phoneNumber,
    String description = 'Wallet top-up',
  }) async {
    if (userId.isEmpty) throw ArgumentError('userId must not be empty');
    if (amountXAF <= 0) throw ArgumentError('amount must be positive');
    if (method.isEmpty) throw ArgumentError('method must not be empty');
    if (phoneNumber.isEmpty) throw ArgumentError('phoneNumber must not be empty');

    final response = await AuthenticatedHttpService.post(
      Uri.parse('$_baseUrl/topupIntent'),
      {
        'userId': userId,
        'method': method,
        'amount': amountXAF,
        'currency': 'XAF',
        'msisdn': phoneNumber,
        'description': description,
      },
    );

    if (response.statusCode == 200 || response.statusCode == 201) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    } else if (response.statusCode == 401) {
      throw Exception('Authentication required – please log in again');
    } else if (response.statusCode == 403) {
      throw Exception('Access denied');
    } else {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      throw Exception(body['message'] ?? 'Top-up failed (${response.statusCode})');
    }
  }

  // ======================= PHARMACY-SPECIFIC OPERATIONS =======================

  /// Creates subscription payment for pharmacies.
  static Future<Map<String, dynamic>> createSubscriptionPayment({
    required String pharmacyId,
    required int amountXAF,
    required String subscriptionPlan,
    required String method,
    required String phoneNumber,
  }) async {
    return createTopup(
      userId: pharmacyId,
      amountXAF: amountXAF,
      method: method,
      phoneNumber: phoneNumber,
      description: 'Subscription payment - $subscriptionPlan plan',
    );
  }

  /// Gets pharmacy wallet with subscription context.
  static Future<Map<String, dynamic>> getPharmacyWalletWithSubscription({
    required String pharmacyId,
  }) async {
    final wallet = await getWalletBalance(userId: pharmacyId);
    wallet['type'] = 'pharmacy';
    wallet['canPaySubscription'] = (wallet['available'] ?? 0) >= 6000;
    return wallet;
  }

  // ======================= COURIER-SPECIFIC OPERATIONS =======================

  /// Gets courier wallet with earnings breakdown.
  static Future<Map<String, dynamic>> getCourierEarnings({
    required String courierId,
  }) async {
    final wallet = await getWalletBalance(userId: courierId);
    wallet['type'] = 'courier';
    wallet['totalEarnings'] = wallet['available'] ?? 0;
    wallet['canWithdraw'] = (wallet['available'] ?? 0) >= 1000;
    return wallet;
  }

  // NOTE: Legacy `createCourierWithdrawal` removed. Withdrawals now go
  // through `WithdrawalService` (pharmapp_unified) which calls the
  // `createWithdrawalRequest` callable directly. See ADR-001.

  // ======================= ADMIN OPERATIONS =======================

  /// Gets wallet summary for admin dashboard.
  static Future<Map<String, dynamic>> getWalletSummary({
    required String adminId,
  }) async {
    final wallet = await getWalletBalance(userId: adminId);
    wallet['type'] = 'admin';
    wallet['role'] = 'administrator';
    return wallet;
  }

  // ======================= UNIFIED REGISTRATION INTEGRATION =======================

  /// Initializes wallet during user registration.
  static Future<void> initializeWalletOnRegistration({
    required String userId,
    required String userType,
  }) async {
    try {
      await getWalletBalance(userId: userId);
    } catch (_) {
      // Non-blocking – wallet will be created on first access
    }
  }

  // ======================= TRANSACTION HISTORY =======================

  /// Fetches transaction history from the Firestore ledger collection.
  static Future<List<Map<String, dynamic>>> getTransactionHistory({
    required String userId,
    int limit = 20,
  }) async {
    if (userId.isEmpty) return [];

    try {
      final snapshot = await FirebaseFirestore.instance
          .collection('ledger')
          .where('userId', isEqualTo: userId)
          .orderBy('createdAt', descending: true)
          .limit(limit)
          .get();

      return snapshot.docs.map((doc) {
        final data = doc.data();
        data['id'] = doc.id;
        return data;
      }).toList();
    } catch (_) {
      // Ledger may not have an index yet – return empty gracefully
      return [];
    }
  }

  // ======================= UTILITY METHODS =======================

  /// Formats XAF currency for display.
  static String formatXAF(int amount) {
    return '${amount.toString().replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (Match m) => '${m[1]},',
    )} XAF';
  }

  /// Checks if amount is sufficient for operation.
  static bool hasSufficientBalance(Map<String, dynamic> wallet, int requiredAmount) {
    final available = wallet['available'] ?? 0;
    return available >= requiredAmount;
  }

  /// Gets user-friendly wallet status.
  static String getWalletStatus(Map<String, dynamic> wallet) {
    final available = wallet['available'] ?? 0;
    final held = wallet['held'] ?? 0;
    if (available == 0 && held == 0) return 'Empty';
    if (held > 0) return 'Active (${formatXAF(held)} held)';
    if (available > 0) return 'Active';
    return 'Unknown';
  }
}
