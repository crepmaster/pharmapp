import 'package:equatable/equatable.dart';

class PharmacyUser extends Equatable {
  final String uid;
  final String email;
  final String pharmacyName;
  final String phoneNumber;
  final String address;
  final bool isActive;
  final DateTime? createdAt;

  const PharmacyUser({
    required this.uid,
    required this.email,
    required this.pharmacyName,
    required this.phoneNumber,
    required this.address,
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
      'isActive': isActive,
      'role': 'pharmacy',
    };
  }

  @override
  List<Object?> get props => [
        uid,
        email,
        pharmacyName,
        phoneNumber,
        address,
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