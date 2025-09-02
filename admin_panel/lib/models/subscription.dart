import 'package:equatable/equatable.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Subscription status enumeration
enum SubscriptionStatus {
  pendingPayment,    // Just registered, needs payment
  pendingApproval,   // Paid, waiting for admin approval  
  active,            // Full access
  expired,           // Subscription ended
  suspended,         // Admin suspended account
  cancelled          // Account cancelled
}

/// Subscription plan types
enum SubscriptionPlan {
  basic,       // $10/month - 100 medicines, basic features
  professional,// $25/month - Unlimited medicines, analytics
  enterprise   // $50/month - Multi-location, API access
}

/// Subscription model for pharmacy accounts
class Subscription extends Equatable {
  final String id;
  final String pharmacyId;
  final SubscriptionPlan plan;
  final SubscriptionStatus status;
  final double amount;
  final DateTime startDate;
  final DateTime endDate;
  final DateTime createdAt;
  final DateTime? activatedAt;
  final DateTime? suspendedAt;
  final String? paymentReference;
  final String? adminUserId; // Who approved/suspended
  final String? adminNotes;
  final Map<String, dynamic>? features; // Plan-specific features

  const Subscription({
    required this.id,
    required this.pharmacyId,
    required this.plan,
    required this.status,
    required this.amount,
    required this.startDate,
    required this.endDate,
    required this.createdAt,
    this.activatedAt,
    this.suspendedAt,
    this.paymentReference,
    this.adminUserId,
    this.adminNotes,
    this.features,
  });

  /// Check if subscription is currently active and valid
  bool get isActive => 
      status == SubscriptionStatus.active && 
      endDate.isAfter(DateTime.now());

  /// Check if subscription has expired
  bool get isExpired => 
      endDate.isBefore(DateTime.now()) || 
      status == SubscriptionStatus.expired;

  /// Check if subscription needs payment
  bool get needsPayment => status == SubscriptionStatus.pendingPayment;

  /// Check if subscription needs admin approval
  bool get needsApproval => status == SubscriptionStatus.pendingApproval;

  /// Days remaining in subscription
  int get daysRemaining => isActive 
      ? endDate.difference(DateTime.now()).inDays 
      : 0;

  /// Get plan display name
  String get planDisplayName {
    switch (plan) {
      case SubscriptionPlan.basic:
        return 'Basic';
      case SubscriptionPlan.professional:
        return 'Professional';
      case SubscriptionPlan.enterprise:
        return 'Enterprise';
    }
  }

  /// Get plan price per month
  static double getPlanPrice(SubscriptionPlan plan) {
    switch (plan) {
      case SubscriptionPlan.basic:
        return 10.0;
      case SubscriptionPlan.professional:
        return 25.0;
      case SubscriptionPlan.enterprise:
        return 50.0;
    }
  }

  /// Get plan features
  static Map<String, dynamic> getPlanFeatures(SubscriptionPlan plan) {
    switch (plan) {
      case SubscriptionPlan.basic:
        return {
          'maxMedicines': 100,
          'analytics': false,
          'multiLocation': false,
          'apiAccess': false,
          'prioritySupport': false,
        };
      case SubscriptionPlan.professional:
        return {
          'maxMedicines': -1, // Unlimited
          'analytics': true,
          'multiLocation': false,
          'apiAccess': false,
          'prioritySupport': true,
        };
      case SubscriptionPlan.enterprise:
        return {
          'maxMedicines': -1, // Unlimited
          'analytics': true,
          'multiLocation': true,
          'apiAccess': true,
          'prioritySupport': true,
        };
    }
  }

  /// Create a copy with updated fields
  Subscription copyWith({
    String? id,
    String? pharmacyId,
    SubscriptionPlan? plan,
    SubscriptionStatus? status,
    double? amount,
    DateTime? startDate,
    DateTime? endDate,
    DateTime? createdAt,
    DateTime? activatedAt,
    DateTime? suspendedAt,
    String? paymentReference,
    String? adminUserId,
    String? adminNotes,
    Map<String, dynamic>? features,
  }) {
    return Subscription(
      id: id ?? this.id,
      pharmacyId: pharmacyId ?? this.pharmacyId,
      plan: plan ?? this.plan,
      status: status ?? this.status,
      amount: amount ?? this.amount,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
      createdAt: createdAt ?? this.createdAt,
      activatedAt: activatedAt ?? this.activatedAt,
      suspendedAt: suspendedAt ?? this.suspendedAt,
      paymentReference: paymentReference ?? this.paymentReference,
      adminUserId: adminUserId ?? this.adminUserId,
      adminNotes: adminNotes ?? this.adminNotes,
      features: features ?? this.features,
    );
  }

  /// Convert to Firestore map
  Map<String, dynamic> toMap() {
    return {
      'pharmacyId': pharmacyId,
      'plan': plan.toString().split('.').last,
      'status': status.toString().split('.').last,
      'amount': amount,
      'startDate': Timestamp.fromDate(startDate),
      'endDate': Timestamp.fromDate(endDate),
      'createdAt': Timestamp.fromDate(createdAt),
      'activatedAt': activatedAt != null ? Timestamp.fromDate(activatedAt!) : null,
      'suspendedAt': suspendedAt != null ? Timestamp.fromDate(suspendedAt!) : null,
      'paymentReference': paymentReference,
      'adminUserId': adminUserId,
      'adminNotes': adminNotes,
      'features': features ?? getPlanFeatures(plan),
    };
  }

  /// Create from Firestore document
  factory Subscription.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return Subscription.fromMap(data, doc.id);
  }

  /// Create from map with ID
  factory Subscription.fromMap(Map<String, dynamic> map, String id) {
    return Subscription(
      id: id,
      pharmacyId: map['pharmacyId'] ?? '',
      plan: _parsePlan(map['plan']),
      status: _parseStatus(map['status']),
      amount: (map['amount'] ?? 0.0).toDouble(),
      startDate: (map['startDate'] as Timestamp?)?.toDate() ?? DateTime.now(),
      endDate: (map['endDate'] as Timestamp?)?.toDate() ?? DateTime.now(),
      createdAt: (map['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      activatedAt: (map['activatedAt'] as Timestamp?)?.toDate(),
      suspendedAt: (map['suspendedAt'] as Timestamp?)?.toDate(),
      paymentReference: map['paymentReference'],
      adminUserId: map['adminUserId'],
      adminNotes: map['adminNotes'],
      features: map['features'] != null 
          ? Map<String, dynamic>.from(map['features']) 
          : null,
    );
  }

  /// Parse plan from string
  static SubscriptionPlan _parsePlan(String? planString) {
    switch (planString?.toLowerCase()) {
      case 'basic':
        return SubscriptionPlan.basic;
      case 'professional':
        return SubscriptionPlan.professional;
      case 'enterprise':
        return SubscriptionPlan.enterprise;
      default:
        return SubscriptionPlan.basic;
    }
  }

  /// Parse status from string
  static SubscriptionStatus _parseStatus(String? statusString) {
    switch (statusString?.toLowerCase()) {
      case 'pendingpayment':
        return SubscriptionStatus.pendingPayment;
      case 'pendingapproval':
        return SubscriptionStatus.pendingApproval;
      case 'active':
        return SubscriptionStatus.active;
      case 'expired':
        return SubscriptionStatus.expired;
      case 'suspended':
        return SubscriptionStatus.suspended;
      case 'cancelled':
        return SubscriptionStatus.cancelled;
      default:
        return SubscriptionStatus.pendingPayment;
    }
  }

  @override
  List<Object?> get props => [
        id,
        pharmacyId,
        plan,
        status,
        amount,
        startDate,
        endDate,
        createdAt,
        activatedAt,
        suspendedAt,
        paymentReference,
        adminUserId,
        adminNotes,
        features,
      ];
}

/// Payment record for subscription payments
class SubscriptionPayment extends Equatable {
  final String id;
  final String pharmacyId;
  final String subscriptionId;
  final double amount;
  final String paymentMethod; // 'mtn_momo', 'orange_money', 'wallet'
  final String status; // 'pending', 'completed', 'failed'
  final String? transactionReference;
  final DateTime createdAt;
  final DateTime? completedAt;
  final bool adminVerified;
  final String? adminUserId;
  final DateTime? verifiedAt;
  final String? notes;

  const SubscriptionPayment({
    required this.id,
    required this.pharmacyId,
    required this.subscriptionId,
    required this.amount,
    required this.paymentMethod,
    required this.status,
    this.transactionReference,
    required this.createdAt,
    this.completedAt,
    this.adminVerified = false,
    this.adminUserId,
    this.verifiedAt,
    this.notes,
  });

  /// Convert to Firestore map
  Map<String, dynamic> toMap() {
    return {
      'pharmacyId': pharmacyId,
      'subscriptionId': subscriptionId,
      'amount': amount,
      'paymentMethod': paymentMethod,
      'status': status,
      'transactionReference': transactionReference,
      'createdAt': Timestamp.fromDate(createdAt),
      'completedAt': completedAt != null ? Timestamp.fromDate(completedAt!) : null,
      'adminVerified': adminVerified,
      'adminUserId': adminUserId,
      'verifiedAt': verifiedAt != null ? Timestamp.fromDate(verifiedAt!) : null,
      'notes': notes,
    };
  }

  /// Create from Firestore document
  factory SubscriptionPayment.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return SubscriptionPayment.fromMap(data, doc.id);
  }

  /// Create from map with ID
  factory SubscriptionPayment.fromMap(Map<String, dynamic> map, String id) {
    return SubscriptionPayment(
      id: id,
      pharmacyId: map['pharmacyId'] ?? '',
      subscriptionId: map['subscriptionId'] ?? '',
      amount: (map['amount'] ?? 0.0).toDouble(),
      paymentMethod: map['paymentMethod'] ?? '',
      status: map['status'] ?? 'pending',
      transactionReference: map['transactionReference'],
      createdAt: (map['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      completedAt: (map['completedAt'] as Timestamp?)?.toDate(),
      adminVerified: map['adminVerified'] ?? false,
      adminUserId: map['adminUserId'],
      verifiedAt: (map['verifiedAt'] as Timestamp?)?.toDate(),
      notes: map['notes'],
    );
  }

  @override
  List<Object?> get props => [
        id,
        pharmacyId,
        subscriptionId,
        amount,
        paymentMethod,
        status,
        transactionReference,
        createdAt,
        completedAt,
        adminVerified,
        adminUserId,
        verifiedAt,
        notes,
      ];
}