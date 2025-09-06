import 'package:cloud_firestore/cloud_firestore.dart';

/// Unified user model supporting multiple roles
class UnifiedUser {
  final String uid;
  final String email;
  final String displayName;
  final String phoneNumber;
  final UserRole role;
  final bool isActive;
  final DateTime createdAt;
  final DateTime? updatedAt;
  
  // Role-specific data
  final Map<String, dynamic> roleData;
  
  const UnifiedUser({
    required this.uid,
    required this.email,
    required this.displayName,
    required this.phoneNumber,
    required this.role,
    required this.isActive,
    required this.createdAt,
    this.updatedAt,
    required this.roleData,
  });

  /// Create from Firestore document
  factory UnifiedUser.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return UnifiedUser(
      uid: doc.id,
      email: data['email'] ?? '',
      displayName: data['displayName'] ?? '',
      phoneNumber: data['phoneNumber'] ?? '',
      role: UserRole.fromString(data['role'] ?? 'user'),
      isActive: data['isActive'] ?? true,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedAt: (data['updatedAt'] as Timestamp?)?.toDate(),
      roleData: data['roleData'] ?? {},
    );
  }

  /// Convert to Firestore document
  Map<String, dynamic> toFirestore() {
    return {
      'email': email,
      'displayName': displayName,
      'phoneNumber': phoneNumber,
      'role': role.toString(),
      'isActive': isActive,
      'createdAt': Timestamp.fromDate(createdAt),
      'updatedAt': updatedAt != null ? Timestamp.fromDate(updatedAt!) : null,
      'roleData': roleData,
    };
  }

  /// Get pharmacy-specific data
  PharmacyData? get pharmacyData {
    if (role != UserRole.pharmacy) return null;
    return PharmacyData.fromMap(roleData);
  }

  /// Get courier-specific data
  CourierData? get courierData {
    if (role != UserRole.courier) return null;
    return CourierData.fromMap(roleData);
  }

  /// Create copy with updated fields
  UnifiedUser copyWith({
    String? email,
    String? displayName,
    String? phoneNumber,
    UserRole? role,
    bool? isActive,
    DateTime? updatedAt,
    Map<String, dynamic>? roleData,
  }) {
    return UnifiedUser(
      uid: uid,
      email: email ?? this.email,
      displayName: displayName ?? this.displayName,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      role: role ?? this.role,
      isActive: isActive ?? this.isActive,
      createdAt: createdAt,
      updatedAt: updatedAt ?? DateTime.now(),
      roleData: roleData ?? this.roleData,
    );
  }
}

/// User roles enum
enum UserRole {
  pharmacy,
  courier,
  admin,
  user;

  static UserRole fromString(String role) {
    switch (role.toLowerCase()) {
      case 'pharmacy':
        return UserRole.pharmacy;
      case 'courier':
        return UserRole.courier;
      case 'admin':
        return UserRole.admin;
      default:
        return UserRole.user;
    }
  }

  @override
  String toString() {
    switch (this) {
      case UserRole.pharmacy:
        return 'pharmacy';
      case UserRole.courier:
        return 'courier';
      case UserRole.admin:
        return 'admin';
      case UserRole.user:
        return 'user';
    }
  }
}

/// Pharmacy-specific data
class PharmacyData {
  final String pharmacyName;
  final String address;
  final String? licenseNumber;
  final Map<String, dynamic>? locationData;

  const PharmacyData({
    required this.pharmacyName,
    required this.address,
    this.licenseNumber,
    this.locationData,
  });

  factory PharmacyData.fromMap(Map<String, dynamic> map) {
    return PharmacyData(
      pharmacyName: map['pharmacyName'] ?? '',
      address: map['address'] ?? '',
      licenseNumber: map['licenseNumber'],
      locationData: map['locationData'],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'pharmacyName': pharmacyName,
      'address': address,
      'licenseNumber': licenseNumber,
      'locationData': locationData,
    };
  }
}

/// Courier-specific data
class CourierData {
  final String fullName;
  final String vehicleType;
  final String licensePlate;
  final String operatingCity;
  final List<String> serviceZones;
  final bool isAvailable;
  final double rating;
  final int totalDeliveries;

  const CourierData({
    required this.fullName,
    required this.vehicleType,
    required this.licensePlate,
    required this.operatingCity,
    required this.serviceZones,
    required this.isAvailable,
    required this.rating,
    required this.totalDeliveries,
  });

  factory CourierData.fromMap(Map<String, dynamic> map) {
    return CourierData(
      fullName: map['fullName'] ?? '',
      vehicleType: map['vehicleType'] ?? '',
      licensePlate: map['licensePlate'] ?? '',
      operatingCity: map['operatingCity'] ?? '',
      serviceZones: List<String>.from(map['serviceZones'] ?? []),
      isAvailable: map['isAvailable'] ?? false,
      rating: (map['rating'] ?? 0.0).toDouble(),
      totalDeliveries: map['totalDeliveries'] ?? 0,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'fullName': fullName,
      'vehicleType': vehicleType,
      'licensePlate': licensePlate,
      'operatingCity': operatingCity,
      'serviceZones': serviceZones,
      'isAvailable': isAvailable,
      'rating': rating,
      'totalDeliveries': totalDeliveries,
    };
  }
}