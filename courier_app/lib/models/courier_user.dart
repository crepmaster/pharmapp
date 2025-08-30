import 'package:equatable/equatable.dart';

class CourierUser extends Equatable {
  final String uid;
  final String email;
  final String fullName;
  final String phoneNumber;
  final String vehicleType;
  final String licensePlate;
  final bool isActive;
  final bool isAvailable;
  final double rating;
  final int totalDeliveries;
  final DateTime? createdAt;

  const CourierUser({
    required this.uid,
    required this.email,
    required this.fullName,
    required this.phoneNumber,
    required this.vehicleType,
    required this.licensePlate,
    this.isActive = true,
    this.isAvailable = false,
    this.rating = 0.0,
    this.totalDeliveries = 0,
    this.createdAt,
  });

  factory CourierUser.fromMap(Map<String, dynamic> map, String uid) {
    return CourierUser(
      uid: uid,
      email: map['email'] ?? '',
      fullName: map['fullName'] ?? '',
      phoneNumber: map['phoneNumber'] ?? '',
      vehicleType: map['vehicleType'] ?? '',
      licensePlate: map['licensePlate'] ?? '',
      isActive: map['isActive'] ?? true,
      isAvailable: map['isAvailable'] ?? false,
      rating: (map['rating'] ?? 0.0).toDouble(),
      totalDeliveries: map['totalDeliveries'] ?? 0,
      createdAt: map['createdAt']?.toDate(),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'email': email,
      'fullName': fullName,
      'phoneNumber': phoneNumber,
      'vehicleType': vehicleType,
      'licensePlate': licensePlate,
      'isActive': isActive,
      'isAvailable': isAvailable,
      'rating': rating,
      'totalDeliveries': totalDeliveries,
      'role': 'courier',
    };
  }

  @override
  List<Object?> get props => [
        uid,
        email,
        fullName,
        phoneNumber,
        vehicleType,
        licensePlate,
        isActive,
        isAvailable,
        rating,
        totalDeliveries,
        createdAt,
      ];

  CourierUser copyWith({
    String? uid,
    String? email,
    String? fullName,
    String? phoneNumber,
    String? vehicleType,
    String? licensePlate,
    bool? isActive,
    bool? isAvailable,
    double? rating,
    int? totalDeliveries,
    DateTime? createdAt,
  }) {
    return CourierUser(
      uid: uid ?? this.uid,
      email: email ?? this.email,
      fullName: fullName ?? this.fullName,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      vehicleType: vehicleType ?? this.vehicleType,
      licensePlate: licensePlate ?? this.licensePlate,
      isActive: isActive ?? this.isActive,
      isAvailable: isAvailable ?? this.isAvailable,
      rating: rating ?? this.rating,
      totalDeliveries: totalDeliveries ?? this.totalDeliveries,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}