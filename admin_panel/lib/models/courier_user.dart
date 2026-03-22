import 'package:cloud_firestore/cloud_firestore.dart';

/// Lightweight admin-side model for courier documents (`couriers/{uid}`).
class CourierUser {
  final String uid;
  final String email;
  final String fullName;
  final String phone;
  final String vehicleType;
  final String licensePlate;
  final String operatingCity;
  final String countryCode;
  final String cityCode;
  final bool isActive;
  final DateTime createdAt;

  const CourierUser({
    required this.uid,
    required this.email,
    required this.fullName,
    required this.phone,
    required this.vehicleType,
    required this.licensePlate,
    required this.operatingCity,
    required this.countryCode,
    required this.cityCode,
    required this.isActive,
    required this.createdAt,
  });

  factory CourierUser.fromMap(Map<String, dynamic> map, String uid) {
    return CourierUser(
      uid: uid,
      email: (map['email'] as String?) ?? '',
      fullName: (map['fullName'] as String?) ??
          (map['displayName'] as String?) ??
          (map['name'] as String?) ??
          '',
      phone: (map['phone'] as String?) ??
          (map['phoneNumber'] as String?) ??
          '',
      vehicleType: (map['vehicleType'] as String?) ?? '',
      licensePlate: (map['licensePlate'] as String?) ?? '',
      operatingCity: (map['operatingCity'] as String?) ?? '',
      countryCode: (map['countryCode'] as String?) ?? '',
      cityCode: (map['cityCode'] as String?) ?? '',
      isActive: (map['isActive'] as bool?) ?? true,
      createdAt: (map['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }
}
