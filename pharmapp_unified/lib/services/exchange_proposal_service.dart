import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import '../models/exchange_proposal.dart';

/// 🔒 SECURE Service for managing exchange proposals between pharmacies
///
/// DEFENSE IN DEPTH ARCHITECTURE:
/// - Layer 1 (Frontend): Quick validation for UX (fast feedback)
/// - Layer 2 (This Service → Firebase Function): Server-side business logic ✅
/// - Layer 3 (Firestore Rules): Data integrity enforcement ✅
///
/// This service calls a Firebase Cloud Function which validates:
/// - Subscription status (active OR trial)
/// - Wallet balance (for purchase proposals)
/// - Self-proposal prevention
/// - Inventory ownership and quantity
/// - Expiration dates
class ExchangeProposalService {
  static final FirebaseAuth _auth = FirebaseAuth.instance;
  static final FirebaseFunctions _functions = FirebaseFunctions.instanceFor(region: 'europe-west1');

  /// 🔒 Creates a new exchange or purchase proposal via secure Firebase Function
  ///
  /// This method calls the `createExchangeProposal` Cloud Function which:
  /// - Validates subscription (cannot be bypassed by client)
  /// - Checks wallet balance for purchase proposals
  /// - Prevents self-proposals
  /// - Validates inventory ownership and expiration
  ///
  /// Throws [UnauthorizedException] if user is not authenticated
  /// Throws [FirebaseFunctionsException] if validation fails or function errors
  static Future<String> createProposal(ExchangeProposal proposal) async {
    final currentUser = _auth.currentUser;
    if (currentUser == null) {
      throw UnauthorizedException('User must be logged in to create proposals');
    }

    try {
      // 🔒 CRITICAL: Call Firebase Function (server-side validation)
      // This cannot be bypassed by modified APK or web inspector
      final callable = _functions.httpsCallable('createExchangeProposal');

      final result = await callable.call<Map<String, dynamic>>({
        'inventoryItemId': proposal.inventoryItemId,
        'fromPharmacyId': proposal.fromPharmacyId,
        'toPharmacyId': proposal.toPharmacyId,
        'details': {
          'type': proposal.details.proposalType.toString().split('.').last,
          'quantity': proposal.details.requestedQuantity,
          'pricePerUnit': proposal.details.offeredPrice,
          'totalPrice': proposal.details.offeredPrice * proposal.details.requestedQuantity,
          'currency': proposal.details.currency,
          if (proposal.details.exchangeMedicineId != null)
            'exchangeMedicineId': proposal.details.exchangeMedicineId,
          if (proposal.details.exchangeInventoryItemId != null)
            'exchangeInventoryItemId': proposal.details.exchangeInventoryItemId,
          if (proposal.details.exchangeQuantity != null)
            'exchangeQuantity': proposal.details.exchangeQuantity,
        },
      });

      final data = result.data;
      final proposalId = data['proposalId'] as String;

      debugPrint('✅ Proposal created successfully via Firebase Function: $proposalId');
      return proposalId;

    } on FirebaseFunctionsException catch (e) {
      // Map function errors to user-friendly messages
      debugPrint('❌ Firebase Function error: ${e.code} - ${e.message}');

      switch (e.code) {
        case 'unauthenticated':
          throw UnauthorizedException('Authentication required to create proposals');

        case 'failed-precondition':
          // Subscription or business logic error
          final details = e.details as Map<String, dynamic>?;
          if (details?['code'] == 'SUBSCRIPTION_REQUIRED') {
            throw SubscriptionRequiredException(
              e.message ?? 'Active subscription required to create proposals',
              subscriptionStatus: details?['subscriptionStatus'] as String?,
            );
          } else if (details?['code'] == 'INSUFFICIENT_BALANCE') {
            throw InsufficientBalanceException(
              e.message ?? 'Insufficient wallet balance',
              required: details?['required'] as double?,
              available: details?['available'] as double?,
              currency: details?['currency'] as String?,
            );
          }
          throw ProposalValidationException(e.message ?? 'Proposal validation failed');

        case 'permission-denied':
          throw UnauthorizedException(e.message ?? 'Permission denied');

        case 'not-found':
          throw ProposalValidationException(e.message ?? 'Resource not found');

        case 'invalid-argument':
          throw ProposalValidationException(e.message ?? 'Invalid proposal data');

        default:
          throw ProposalCreationException(
            'Failed to create proposal: ${e.message ?? e.code}',
          );
      }
    } catch (e) {
      debugPrint('❌ Unexpected error creating proposal: $e');
      throw ProposalCreationException('Failed to create proposal: $e');
    }
  }

  /// Gets the current authenticated user ID
  ///
  /// Returns null if no user is authenticated
  static String? getCurrentUserId() {
    return _auth.currentUser?.uid;
  }

  /// Validates that the current user is authenticated
  ///
  /// Throws [UnauthorizedException] if user is not authenticated
  static void requireAuthentication() {
    if (_auth.currentUser == null) {
      throw UnauthorizedException('User must be logged in');
    }
  }
}

/// Custom exception for unauthorized access
class UnauthorizedException implements Exception {
  final String message;

  UnauthorizedException(this.message);

  @override
  String toString() => 'UnauthorizedException: $message';
}

/// Exception thrown when subscription is required
class SubscriptionRequiredException implements Exception {
  final String message;
  final String? subscriptionStatus;

  SubscriptionRequiredException(this.message, {this.subscriptionStatus});

  @override
  String toString() => 'SubscriptionRequiredException: $message (status: $subscriptionStatus)';
}

/// Exception thrown when wallet balance is insufficient
class InsufficientBalanceException implements Exception {
  final String message;
  final double? required;
  final double? available;
  final String? currency;

  InsufficientBalanceException(
    this.message, {
    this.required,
    this.available,
    this.currency,
  });

  @override
  String toString() =>
      'InsufficientBalanceException: $message (required: $required, available: $available $currency)';
}

/// Exception thrown when proposal validation fails
class ProposalValidationException implements Exception {
  final String message;

  ProposalValidationException(this.message);

  @override
  String toString() => 'ProposalValidationException: $message';
}

/// Exception thrown when proposal creation fails
class ProposalCreationException implements Exception {
  final String message;

  ProposalCreationException(this.message);

  @override
  String toString() => 'ProposalCreationException: $message';
}
