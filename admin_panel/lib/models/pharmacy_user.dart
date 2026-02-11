import 'package:equatable/equatable.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class PharmacyUser extends Equatable {
  final String uid;
  final String email;
  final String pharmacyName;
  final String phoneNumber;
  final String address;
  final bool isActive;
  final DateTime createdAt;

  const PharmacyUser({
    required this.uid,
    required this.email,
    required this.pharmacyName,
    required this.phoneNumber,
    required this.address,
    this.isActive = true,
    required this.createdAt,
  });

  /// Create from Firestore document
  factory PharmacyUser.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return PharmacyUser.fromMap(data, doc.id);
  }

  /// Create from map with UID
  factory PharmacyUser.fromMap(Map<String, dynamic> map, String uid) {
    return PharmacyUser(
      uid: uid,
      email: map['email'] ?? '',
      pharmacyName: map['pharmacyName'] ?? '',
      phoneNumber: map['phoneNumber'] ?? '',
      address: map['address'] ?? '',
      isActive: map['isActive'] ?? true,
      createdAt: (map['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }

  /// Convert to Firestore map
  Map<String, dynamic> toMap() {
    return {
      'email': email,
      'pharmacyName': pharmacyName,
      'phoneNumber': phoneNumber,
      'address': address,
      'isActive': isActive,
      'createdAt': Timestamp.fromDate(createdAt),
      'role': 'pharmacy',
    };
  }

  /// Create a copy with updated fields
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
}