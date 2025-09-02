import 'package:equatable/equatable.dart';
import 'location_data.dart';
import 'subscription.dart';

class PharmacyUser extends Equatable {
  final String uid;
  final String email;
  final String pharmacyName;
  final String phoneNumber;
  final String address; // Legacy field - kept for backward compatibility
  final PharmacyLocationData? locationData; // New global location system
  final bool isActive;
  final DateTime? createdAt;
  
  // Subscription-related fields
  final SubscriptionStatus subscriptionStatus;
  final SubscriptionPlan subscriptionPlan;
  final DateTime? subscriptionEndDate;
  final bool hasActiveSubscription;

  const PharmacyUser({
    required this.uid,
    required this.email,
    required this.pharmacyName,
    required this.phoneNumber,
    required this.address,
    this.locationData,
    this.isActive = true,
    this.createdAt,
    this.subscriptionStatus = SubscriptionStatus.pendingPayment,
    this.subscriptionPlan = SubscriptionPlan.basic,
    this.subscriptionEndDate,
    this.hasActiveSubscription = false,
  });

  factory PharmacyUser.fromMap(Map<String, dynamic> map, String uid) {
    return PharmacyUser(
      uid: uid,
      email: map['email'] ?? '',
      pharmacyName: map['pharmacyName'] ?? '',
      phoneNumber: map['phoneNumber'] ?? '',
      address: map['address'] ?? '',
      locationData: map['locationData'] != null 
          ? PharmacyLocationData.fromMap(map['locationData']) 
          : null,
      isActive: map['isActive'] ?? true,
      createdAt: map['createdAt']?.toDate(),
      subscriptionStatus: _parseSubscriptionStatus(map['subscriptionStatus']),
      subscriptionPlan: _parseSubscriptionPlan(map['subscriptionPlan']),
      subscriptionEndDate: map['subscriptionEndDate']?.toDate(),
      hasActiveSubscription: map['hasActiveSubscription'] ?? false,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'email': email,
      'pharmacyName': pharmacyName,
      'phoneNumber': phoneNumber,
      'address': address,
      'locationData': locationData?.toMap(),
      'isActive': isActive,
      'role': 'pharmacy',
      'subscriptionStatus': subscriptionStatus.toString().split('.').last,
      'subscriptionPlan': subscriptionPlan.toString().split('.').last,
      'subscriptionEndDate': subscriptionEndDate,
      'hasActiveSubscription': hasActiveSubscription,
    };
  }

  /// Get the best available location description for display
  String get bestLocationDescription {
    if (locationData != null) {
      return locationData!.bestLocationDescription;
    }
    return address; // Fallback to legacy address
  }

  /// Get location info for courier navigation
  String get courierNavigationInfo {
    if (locationData != null) {
      return locationData!.courierNavigationInfo;
    }
    return 'Legacy address: $address';
  }

  /// Check if pharmacy has GPS coordinates
  bool get hasGPSLocation => locationData?.coordinates != null;

  @override
  List<Object?> get props => [
        uid,
        email,
        pharmacyName,
        phoneNumber,
        address,
        locationData,
        isActive,
        createdAt,
        subscriptionStatus,
        subscriptionPlan,
        subscriptionEndDate,
        hasActiveSubscription,
      ];

  PharmacyUser copyWith({
    String? uid,
    String? email,
    String? pharmacyName,
    String? phoneNumber,
    String? address,
    PharmacyLocationData? locationData,
    bool? isActive,
    DateTime? createdAt,
    SubscriptionStatus? subscriptionStatus,
    SubscriptionPlan? subscriptionPlan,
    DateTime? subscriptionEndDate,
    bool? hasActiveSubscription,
  }) {
    return PharmacyUser(
      uid: uid ?? this.uid,
      email: email ?? this.email,
      pharmacyName: pharmacyName ?? this.pharmacyName,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      address: address ?? this.address,
      locationData: locationData ?? this.locationData,
      isActive: isActive ?? this.isActive,
      createdAt: createdAt ?? this.createdAt,
      subscriptionStatus: subscriptionStatus ?? this.subscriptionStatus,
      subscriptionPlan: subscriptionPlan ?? this.subscriptionPlan,
      subscriptionEndDate: subscriptionEndDate ?? this.subscriptionEndDate,
      hasActiveSubscription: hasActiveSubscription ?? this.hasActiveSubscription,
    );
  }

  static SubscriptionStatus _parseSubscriptionStatus(String? statusString) {
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

  static SubscriptionPlan _parseSubscriptionPlan(String? planString) {
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
}