import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:firebase_auth/firebase_auth.dart';

/// Error categories for subscription validation results.
/// Used to distinguish business errors from infrastructure errors.
enum AccessErrorCategory {
  none,                  // No error — access granted
  subscriptionRequired,  // No active subscription
  limitExceeded,         // Plan limit reached
  unauthorized,          // Auth token invalid or missing
  transportError,        // Network/connection failure — server unreachable
  serverError,           // Server returned unexpected status
}

/// 🔒 SECURE SUBSCRIPTION SERVICE
/// Uses server-side validation functions to prevent client-side bypass attacks
/// ALL subscription validation is now done server-side for maximum security
class SecureSubscriptionService {
  static const String _baseUrl = 'https://europe-west1-mediexchange.cloudfunctions.net';
  static final FirebaseAuth _auth = FirebaseAuth.instance;

  /// Get authenticated headers with Firebase ID token
  static Future<Map<String, String>> _authHeaders() async {
    final token = await _auth.currentUser?.getIdToken();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  /// Validate inventory access (server-side enforcement)
  /// This replaces the client-side SubscriptionGuardService.canCreateInventoryItem()
  static Future<InventoryAccessResult> validateInventoryAccess() async {
    final userId = _auth.currentUser?.uid;
    if (userId == null) {
      return InventoryAccessResult(
        canAccess: false,
        errorCategory: AccessErrorCategory.unauthorized,
        error: 'User not authenticated',
      );
    }

    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/validateInventoryAccess?userId=$userId'),
        headers: await _authHeaders(),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body) as Map<String, dynamic>;
        return InventoryAccessResult(
          canAccess: true,
          errorCategory: AccessErrorCategory.none,
          plan: data['plan'],
          status: data['status'],
          remainingSlots: data['remainingSlots'],
        );
      } else if (response.statusCode == 401) {
        return InventoryAccessResult(
          canAccess: false,
          errorCategory: AccessErrorCategory.unauthorized,
          error: 'Authentication failed',
        );
      } else if (response.statusCode == 403) {
        final error = json.decode(response.body) as Map<String, dynamic>;
        final errorCode = error['error'] as String?;
        return InventoryAccessResult(
          canAccess: false,
          errorCategory: errorCode == 'INVENTORY_LIMIT_EXCEEDED'
              ? AccessErrorCategory.limitExceeded
              : AccessErrorCategory.subscriptionRequired,
          error: error['message'],
          errorCode: errorCode,
          currentCount: error['currentCount'],
          maxAllowed: error['maxAllowed'],
        );
      } else {
        return InventoryAccessResult(
          canAccess: false,
          errorCategory: AccessErrorCategory.serverError,
          error: 'Server validation failed: ${response.statusCode}',
        );
      }
    } catch (e) {
      return InventoryAccessResult(
        canAccess: false,
        errorCategory: AccessErrorCategory.transportError,
        error: 'Network error: $e',
      );
    }
  }

  /// Validate proposal access (server-side enforcement)  
  /// This replaces the client-side SubscriptionGuardService.canCreateProposal()
  static Future<ProposalAccessResult> validateProposalAccess() async {
    final userId = _auth.currentUser?.uid;
    if (userId == null) {
      return ProposalAccessResult(
        canAccess: false,
        errorCategory: AccessErrorCategory.unauthorized,
        error: 'User not authenticated',
      );
    }

    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/validateProposalAccess?userId=$userId'),
        headers: await _authHeaders(),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body) as Map<String, dynamic>;
        return ProposalAccessResult(
          canAccess: true,
          errorCategory: AccessErrorCategory.none,
          plan: data['plan'],
          status: data['status'],
        );
      } else if (response.statusCode == 401) {
        return ProposalAccessResult(
          canAccess: false,
          errorCategory: AccessErrorCategory.unauthorized,
          error: 'Authentication failed',
        );
      } else if (response.statusCode == 403) {
        final error = json.decode(response.body) as Map<String, dynamic>;
        return ProposalAccessResult(
          canAccess: false,
          errorCategory: AccessErrorCategory.subscriptionRequired,
          error: error['message'],
          errorCode: error['error'],
        );
      } else {
        return ProposalAccessResult(
          canAccess: false,
          errorCategory: AccessErrorCategory.serverError,
          error: 'Server validation failed: ${response.statusCode}',
        );
      }
    } catch (e) {
      return ProposalAccessResult(
        canAccess: false,
        errorCategory: AccessErrorCategory.transportError,
        error: 'Network error: $e',
      );
    }
  }

  /// Get comprehensive subscription status (server-side truth source)
  /// This replaces all client-side subscription checks
  static Future<SubscriptionStatusResult> getSubscriptionStatus() async {
    final userId = _auth.currentUser?.uid;
    if (userId == null) {
      return SubscriptionStatusResult(
        isValid: false,
        error: 'User not authenticated',
      );
    }

    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/getSubscriptionStatus?userId=$userId'),
        headers: await _authHeaders(),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body) as Map<String, dynamic>;
        return SubscriptionStatusResult(
          isValid: data['isValid'],
          status: data['status'],
          plan: data['plan'],
          daysRemaining: data['daysRemaining'],
          endDate: data['endDate'] != null ? DateTime.parse(data['endDate']) : null,
          limits: SubscriptionLimits.fromMap(data['limits']),
        );
      } else {
        final error = json.decode(response.body) as Map<String, dynamic>;
        return SubscriptionStatusResult(
          isValid: false,
          error: error['message'],
        );
      }
    } catch (e) {
      return SubscriptionStatusResult(
        isValid: false,
        error: 'Network error: $e',
      );
    }
  }
}

/// Result classes for server-side validation responses

class InventoryAccessResult {
  final bool canAccess;
  final AccessErrorCategory errorCategory;
  final String? plan;
  final String? status;
  final int? remainingSlots;
  final String? error;
  final String? errorCode;
  final int? currentCount;
  final int? maxAllowed;

  InventoryAccessResult({
    required this.canAccess,
    this.errorCategory = AccessErrorCategory.none,
    this.plan,
    this.status,
    this.remainingSlots,
    this.error,
    this.errorCode,
    this.currentCount,
    this.maxAllowed,
  });

  bool get isLimitExceeded => errorCategory == AccessErrorCategory.limitExceeded;
  bool get needsSubscription => errorCategory == AccessErrorCategory.subscriptionRequired;
  bool get isTransportError => errorCategory == AccessErrorCategory.transportError;
  bool get isServerError => errorCategory == AccessErrorCategory.serverError;
}

class ProposalAccessResult {
  final bool canAccess;
  final AccessErrorCategory errorCategory;
  final String? plan;
  final String? status;
  final String? error;
  final String? errorCode;

  ProposalAccessResult({
    required this.canAccess,
    this.errorCategory = AccessErrorCategory.none,
    this.plan,
    this.status,
    this.error,
    this.errorCode,
  });

  bool get needsSubscription => errorCategory == AccessErrorCategory.subscriptionRequired;
  bool get isTransportError => errorCategory == AccessErrorCategory.transportError;
}

class SubscriptionStatusResult {
  final bool isValid;
  final String? status;
  final String? plan;
  final int? daysRemaining;
  final DateTime? endDate;
  final SubscriptionLimits? limits;
  final String? error;

  SubscriptionStatusResult({
    required this.isValid,
    this.status,
    this.plan,
    this.daysRemaining,
    this.endDate,
    this.limits,
    this.error,
  });

  bool get isInTrial => status == 'trial';
  bool get isActive => status == 'active';
  bool get needsPayment => status == 'pendingPayment';
}

class SubscriptionLimits {
  final InventoryLimit inventory;
  final bool analytics;
  final bool multiLocation;
  final bool apiAccess;

  SubscriptionLimits({
    required this.inventory,
    required this.analytics,
    required this.multiLocation,
    required this.apiAccess,
  });

  factory SubscriptionLimits.fromMap(Map<String, dynamic> map) {
    return SubscriptionLimits(
      inventory: InventoryLimit.fromMap(map['inventory']),
      analytics: map['analytics'] ?? false,
      multiLocation: map['multiLocation'] ?? false,
      apiAccess: map['apiAccess'] ?? false,
    );
  }
}

class InventoryLimit {
  final bool unlimited;
  final int? max;
  final int? current;

  InventoryLimit({
    required this.unlimited,
    this.max,
    this.current,
  });

  factory InventoryLimit.fromMap(Map<String, dynamic> map) {
    return InventoryLimit(
      unlimited: map['unlimited'] ?? false,
      max: map['max'],
      current: map['current'],
    );
  }

  int? get remaining => unlimited ? null : (max != null && current != null) ? max! - current! : null;
}