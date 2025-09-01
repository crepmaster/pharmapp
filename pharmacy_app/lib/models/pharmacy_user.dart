import 'package:equatable/equatable.dart';
import 'location_data.dart';

class PharmacyUser extends Equatable {
  final String uid;
  final String email;
  final String pharmacyName;
  final String phoneNumber;
  final String address; // Legacy field - kept for backward compatibility
  final PharmacyLocationData? locationData; // New global location system
  final bool isActive;
  final DateTime? createdAt;

  const PharmacyUser({
    required this.uid,
    required this.email,
    required this.pharmacyName,
    required this.phoneNumber,
    required this.address,
    this.locationData,
    this.isActive = true,
    this.createdAt,
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
      ];

  PharmacyUser copyWith({
    String? uid,
    String? email,
    String? pharmacyName,
    String? phoneNumber,
    String? address,
    bool? isActive,
    DateTime? createdAt,
  }) {
    return PharmacyUser(
      uid: uid ?? this.uid,
      email: email ?? this.email,
      pharmacyName: pharmacyName ?? this.pharmacyName,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      address: address ?? this.address,
      isActive: isActive ?? this.isActive,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}