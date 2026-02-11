import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

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

  /// Gets wallet currency for a user
  ///
  /// Returns 'XAF' as default if not found
  static Future<String> getCurrency(String userId) async {
    try {
      final walletDoc = await _firestore
          .collection('wallets')
          .doc(userId)
          .get();

      if (!walletDoc.exists) {
        return 'XAF';
      }

      final data = walletDoc.data();
      return data?['currency'] as String? ?? 'XAF';
    } catch (e) {
      debugPrint('Error fetching wallet currency: $e');
      return 'XAF';
    }
  }
}
