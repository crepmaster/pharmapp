import 'package:equatable/equatable.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class AdminUser extends Equatable {
  final String uid;
  final String email;
  final String displayName;
  final String role; // 'super_admin', 'admin', 'finance'
  final bool isActive;
  final DateTime createdAt;
  final DateTime lastLoginAt;
  final List<String> permissions;

  const AdminUser({
    required this.uid,
    required this.email,
    required this.displayName,
    required this.role,
    this.isActive = true,
    required this.createdAt,
    required this.lastLoginAt,
    this.permissions = const [],
  });

  /// Check if admin has specific permission
  bool hasPermission(String permission) {
    return permissions.contains(permission) || role == 'super_admin';
  }

  /// Check if admin can manage pharmacies
  bool get canManagePharmacies => hasPermission('manage_pharmacies');

  /// Check if admin can manage subscriptions
  bool get canManageSubscriptions => hasPermission('manage_subscriptions');

  /// Check if admin can verify payments
  bool get canVerifyPayments => hasPermission('verify_payments');

  /// Check if admin can view financial reports
  bool get canViewFinancials => hasPermission('view_financials');

  /// Check if user is super admin
  bool get isSuperAdmin => role == 'super_admin';

  /// Get role display name
  String get roleDisplayName {
    switch (role) {
      case 'super_admin':
        return 'Super Admin';
      case 'admin':
        return 'Admin';
      case 'finance':
        return 'Finance Manager';
      default:
        return role;
    }
  }

  /// Create a copy with updated fields
  AdminUser copyWith({
    String? uid,
    String? email,
    String? displayName,
    String? role,
    bool? isActive,
    DateTime? createdAt,
    DateTime? lastLoginAt,
    List<String>? permissions,
  }) {
    return AdminUser(
      uid: uid ?? this.uid,
      email: email ?? this.email,
      displayName: displayName ?? this.displayName,
      role: role ?? this.role,
      isActive: isActive ?? this.isActive,
      createdAt: createdAt ?? this.createdAt,
      lastLoginAt: lastLoginAt ?? this.lastLoginAt,
      permissions: permissions ?? this.permissions,
    );
  }

  /// Convert to Firestore map
  Map<String, dynamic> toMap() {
    return {
      'email': email,
      'displayName': displayName,
      'role': role,
      'isActive': isActive,
      'createdAt': Timestamp.fromDate(createdAt),
      'lastLoginAt': Timestamp.fromDate(lastLoginAt),
      'permissions': permissions,
    };
  }

  /// Create from Firestore document
  factory AdminUser.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return AdminUser.fromMap(data, doc.id);
  }

  /// Create from map with UID
  factory AdminUser.fromMap(Map<String, dynamic> map, String uid) {
    return AdminUser(
      uid: uid,
      email: map['email'] ?? '',
      displayName: map['displayName'] ?? '',
      role: map['role'] ?? 'admin',
      isActive: map['isActive'] ?? true,
      createdAt: (map['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      lastLoginAt: (map['lastLoginAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      permissions: List<String>.from(map['permissions'] ?? []),
    );
  }

  @override
  List<Object?> get props => [
        uid,
        email,
        displayName,
        role,
        isActive,
        createdAt,
        lastLoginAt,
        permissions,
      ];
}

/// Default admin permissions for different roles
class AdminPermissions {
  static const List<String> superAdmin = [
    'manage_pharmacies',
    'manage_subscriptions',
    'verify_payments',
    'view_financials',
    'manage_admins',
    'system_settings',
  ];

  static const List<String> admin = [
    'manage_pharmacies',
    'manage_subscriptions',
    'verify_payments',
  ];

  static const List<String> finance = [
    'verify_payments',
    'view_financials',
  ];

  static List<String> getPermissionsForRole(String role) {
    switch (role) {
      case 'super_admin':
        return superAdmin;
      case 'admin':
        return admin;
      case 'finance':
        return finance;
      default:
        return [];
    }
  }
}