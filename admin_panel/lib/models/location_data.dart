import 'package:equatable/equatable.dart';

/// Simplified location data for admin panel
/// (We don't need all the complex location features here)
class PharmacyLocationData extends Equatable {
  final double? latitude;
  final double? longitude;
  final String? address;

  const PharmacyLocationData({
    this.latitude,
    this.longitude,
    this.address,
  });

  /// Create from map
  factory PharmacyLocationData.fromMap(Map<String, dynamic> map) {
    return PharmacyLocationData(
      latitude: map['coordinates']?['latitude']?.toDouble(),
      longitude: map['coordinates']?['longitude']?.toDouble(),
      address: map['address']?['description'] ?? map['address']?['formatted'],
    );
  }

  /// Convert to map
  Map<String, dynamic> toMap() {
    return {
      'coordinates': {
        'latitude': latitude,
        'longitude': longitude,
      },
      'address': {
        'description': address,
      },
    };
  }

  @override
  List<Object?> get props => [latitude, longitude, address];
}