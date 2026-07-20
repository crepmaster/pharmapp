import 'dart:convert';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'authenticated_http_service.dart';

/// Unified Wallet Service for all PharmApp applications.
/// Handles wallet operations for pharmacies, couriers, and admins consistently.
/// All HTTP calls send Firebase Bearer token for backend auth enforcement.
///
/// Round-4 currency sprint phase 4a (2026-07-20) : XAF-baked helpers
/// removed — see memory `project-currency-money-context-sprint.md` for
/// the "no hardcoded currency in producers" contract. Specifically :
///
///   - `createTopup(amountXAF, ...)` : deleted. Zero external callers.
///     Top-up creation goes directly through the payment-provider
///     callables (mtnMomoTopupIntent / paystackTopupIntent) which
///     derive currency server-side from the pharmacy country.
///   - `createSubscriptionPayment(amountXAF, ...)` : deleted. Zero
///     external callers ; admin_panel has its own subscription flow.
///   - `getPharmacyWalletWithSubscription` : deleted. Its
///     `canPaySubscription: available >= 6000` field baked in the
///     Cameroon subscription threshold — meaningless for Ghana's ~10
///     GHS equivalent. Zero external callers.
///   - `formatXAF(int)` : deleted. Zero external callers. Callers
///     should use `MoneyFormatter.formatMajor` from pharmapp_shared
///     with the wallet's actual currency, not hard-code XAF.
///   - `getWalletStatus` : deleted (relied on formatXAF).
class UnifiedWalletService {
  // Sprint 5 phase 1 emulator HTTP routing — was `static const`, now
  // a getter so it tracks `AuthenticatedHttpService.functionsBaseUrl`
  // (also a getter, USE_EMULATOR-gated). Const referencing a getter
  // is not allowed in Dart, hence the change.
  static String get _baseUrl => AuthenticatedHttpService.functionsBaseUrl;

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

  // ======================= COURIER-SPECIFIC OPERATIONS =======================

  /// Gets courier wallet with earnings breakdown.
  ///
  /// NOTE: withdraw eligibility is no longer computed here. The UI
  /// (`courier_wallet_widget.dart`) owns this logic because the minimum
  /// threshold depends on the courier's country/currency (see
  /// `_minWithdrawalByCurrency`). Hardcoding a 1000 XAF floor at this
  /// layer blocked non-XAF couriers whose local minimum is lower.
  static Future<Map<String, dynamic>> getCourierEarnings({
    required String courierId,
  }) async {
    final wallet = await getWalletBalance(userId: courierId);
    wallet['type'] = 'courier';
    wallet['totalEarnings'] = wallet['available'] ?? 0;
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

  /// Checks if amount is sufficient for operation.
  static bool hasSufficientBalance(
      Map<String, dynamic> wallet, int requiredAmount) {
    final available = wallet['available'] ?? 0;
    return available >= requiredAmount;
  }
}
