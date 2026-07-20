import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:pharmapp_shared/pharmapp_shared.dart';

/// Service for managing user wallet operations
/// Handles balance checks and wallet-related queries
class WalletService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Gets the available balance for a user
  ///
  /// Returns 0 if wallet doesn't exist or has no balance
  /// [userId] - The user's Firebase Auth UID
  static Future<double> getBalance(String userId) async {
    try {
      final walletDoc = await _firestore
          .collection('wallets')
          .doc(userId)
          .get();

      if (!walletDoc.exists) {
        return 0.0;
      }

      final data = walletDoc.data();
      if (data == null) {
        return 0.0;
      }

      // Get available balance (not held balance)
      final available = data['available'];
      if (available == null) {
        return 0.0;
      }

      // Handle both int and double types
      if (available is int) {
        return available.toDouble();
      } else if (available is double) {
        return available;
      }

      return 0.0;
    } catch (e) {
      // Log error but return 0 to prevent blocking user
      debugPrint('Error fetching wallet balance: $e');
      return 0.0;
    }
  }

  /// Checks if user has sufficient balance for a purchase
  ///
  /// Returns true if balance >= amount, false otherwise
  static Future<bool> hasSufficientBalance(String userId, double amount) async {
    final balance = await getBalance(userId);
    return balance >= amount;
  }

  /// Gets the operating currency for a user's wallet.
  ///
  /// Resolution order (2026-07-20 currency-derived-from-country rewrite) :
  ///  1. Country default from MasterData via the user's pharmacy
  ///     countryCode — canonical source of truth
  ///     (`system_config/main.countries[cc].defaultCurrencyCode`).
  ///  2. The `currency` field on the wallet doc — legacy fallback that
  ///     may drift (see TD-WALLET-CURRENCY-SERVER-SIDE), used only when
  ///     master data or pharmacy country is unresolvable.
  ///  3. `'XAF'` — final safety net so no caller ever gets an empty
  ///     string. Logged so operators can spot the failure.
  static Future<String> getCurrency(String userId) async {
    String? countryCode;
    try {
      final pharmacyDoc = await _firestore
          .collection('pharmacies')
          .doc(userId)
          .get();
      if (pharmacyDoc.exists) {
        countryCode = pharmacyDoc.data()?['countryCode'] as String?;
      }
    } catch (e) {
      debugPrint('WalletService.getCurrency: pharmacy lookup failed: $e');
    }

    if (countryCode != null && countryCode.isNotEmpty) {
      try {
        final snapshot = await MasterDataService.load();
        final derived = snapshot.getDefaultCurrencyForCountry(countryCode);
        if (derived != null) return derived;
      } catch (e) {
        debugPrint('WalletService.getCurrency: master data unavailable: $e');
      }
    }

    // Fallback : legacy wallet field. May be XAF on a Ghana account if
    // it was created before the country-derived currency contract.
    try {
      final walletDoc = await _firestore
          .collection('wallets')
          .doc(userId)
          .get();
      final data = walletDoc.data();
      final walletCurrency = data?['currency'] as String?;
      if (walletCurrency != null && walletCurrency.isNotEmpty) {
        debugPrint(
          'WalletService.getCurrency: falling back to wallet.currency='
          '$walletCurrency for user $userId (country=$countryCode)',
        );
        return walletCurrency;
      }
    } catch (e) {
      debugPrint('WalletService.getCurrency: wallet lookup failed: $e');
    }

    debugPrint(
      'WalletService.getCurrency: could not resolve currency for user '
      '$userId — falling back to XAF',
    );
    return 'XAF';
  }
}
