import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:firebase_auth/firebase_auth.dart';

/// 🔒 SECURE SUBSCRIPTION SERVICE
/// Uses server-side validation functions to prevent client-side bypass attacks
/// ALL subscription validation is now done server-side for maximum security
class SecureSubscriptionService {
  static const String _baseUrl = 'https://europe-west1-mediexchange.cloudfunctions.net';
  static final FirebaseAuth _auth = FirebaseAuth.instance;

  /// Validate inventory access (server-side enforcement)
  /// This replaces the client-side SubscriptionGuardService.canCreateInventoryItem()
  static Future<InventoryAccessResult> validateInventoryAccess() async {
    final userId = _auth.currentUser?.uid;
    if (userId == null) {
      return InventoryAccessResult(
        canAccess: false,
        error: 'User not authenticated',
      );
    }

    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/validateInventoryAccess?userId=$userId'),
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body) as Map<String, dynamic>;
        return InventoryAccessResult(
          canAccess: true,
          plan: data['plan'],
          status: data['status'],
          remainingSlots: data['remainingSlots'],
        );
      } else if (response.statusCode == 403) {
        final error = json.decode(response.body) as Map<String, dynamic>;
        return InventoryAccessResult(
          canAccess: false,
          error: error['message'],
          errorCode: error['error'],
          currentCount: error['currentCount'],
          maxAllowed: error['maxAllowed'],
        );
      } else {
        return InventoryAccessResult(
          canAccess: false,
          error: 'Server validation failed: ${response.statusCode}',
        );
      }
    } catch (e) {
      return InventoryAccessResult(
        canAccess: false,
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
        error: 'User not authenticated',
      );
    }

    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/validateProposalAccess?userId=$userId'),
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body) as Map<String, dynamic>;
        return ProposalAccessResult(
          canAccess: true,
          plan: data['plan'],
          status: data['status'],
        );
      } else if (response.statusCode == 403) {
        final error = json.decode(response.body) as Map<String, dynamic>;
        return ProposalAccessResult(
          canAccess: false,
          error: error['message'],
          errorCode: error['error'],
        );
      } else {
        return ProposalAccessResult(
          canAccess: false,
          error: 'Server validation failed: ${response.statusCode}',
        );
      }
    } catch (e) {
      return ProposalAccessResult(
        canAccess: false,
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
        headers: {'Content-Type': 'application/json'},
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
  final String? plan;
  final String? status;
  final int? remainingSlots;
  final String? error;
  final String? errorCode;
  final int? currentCount;
  final int? maxAllowed;

  InventoryAccessResult({
    required this.canAccess,
    this.plan,
    this.status,
    this.remainingSlots,
    this.error,
    this.errorCode,
    this.currentCount,
    this.maxAllowed,
  });

  bool get isLimitExceeded => errorCode == 'INVENTORY_LIMIT_EXCEEDED';
  bool get needsSubscription => errorCode == 'SUBSCRIPTION_REQUIRED';
}

class ProposalAccessResult {
  final bool canAccess;
  final String? plan;
  final String? status;
  final String? error;
  final String? errorCode;

  ProposalAccessResult({
    required this.canAccess,
    this.plan,
    this.status,
    this.error,
    this.errorCode,
  });

  bool get needsSubscription => errorCode == 'SUBSCRIPTION_REQUIRED';
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