import 'package:equatable/equatable.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

// Global location system supporting both formal addresses and GPS coordinates
// Designed for universal deployment (Africa, Asia, South America, etc.)

/// GPS coordinates with accuracy and timestamp
class PharmacyCoordinates extends Equatable {
  final double latitude;
  final double longitude;
  final double accuracy; // GPS accuracy in meters
  final DateTime capturedAt;

  const PharmacyCoordinates({
    required this.latitude,
    required this.longitude,
    required this.accuracy,
    required this.capturedAt,
  });

  factory PharmacyCoordinates.fromMap(Map<String, dynamic> map) {
    return PharmacyCoordinates(
      latitude: map['latitude']?.toDouble() ?? 0.0,
      longitude: map['longitude']?.toDouble() ?? 0.0,
      accuracy: map['accuracy']?.toDouble() ?? 0.0,
      capturedAt: (map['capturedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'latitude': latitude,
      'longitude': longitude,
      'accuracy': accuracy,
      'capturedAt': Timestamp.fromDate(capturedAt),
    };
  }

  /// Calculate distance to another coordinate in kilometers using Haversine formula
  double distanceTo(PharmacyCoordinates other) {
    const double earthRadius = 6371; // Earth's radius in kilometers
    const double toRadians = 3.14159 / 180;
    
    double lat1Rad = latitude * toRadians;
    double lat2Rad = other.latitude * toRadians;
    double deltaLat = (other.latitude - latitude) * toRadians;
    double deltaLng = (other.longitude - longitude) * toRadians;

    double sinLat = deltaLat / 2;
    double sinLng = deltaLng / 2;
    double a = sinLat * sinLat + 
               (lat1Rad * lat2Rad).abs() * sinLng * sinLng;
    double c = 2 * (a / (1 - a).abs());
    
    return earthRadius * c;
  }

  @override
  List<Object?> get props => [latitude, longitude, accuracy, capturedAt];
}

/// Address types for different global regions
enum AddressType {
  formal,      // Complete street address (developed areas)
  landmark,    // Landmark-based location (rural areas)
  description, // Free-form description (informal settlements)
}

/// Flexible address system for global markets
class PharmacyAddress extends Equatable {
  final AddressType type;
  final String? street;        // "123 Main Street" or null
  final String city;           // Required: "Douala", "São Paulo", "Manila"
  final String region;         // State/Province: "Littoral", "SP", "Metro Manila"
  final String country;        // ISO code: "CM", "BR", "PH"
  final String? postalCode;    // Postal code or null if not available
  final String? landmarks;     // "Behind Total Station, opposite Lycée"
  final String? description;   // Free-form location description

  const PharmacyAddress({
    required this.type,
    this.street,
    required this.city,
    required this.region,
    required this.country,
    this.postalCode,
    this.landmarks,
    this.description,
  });

  factory PharmacyAddress.fromMap(Map<String, dynamic> map) {
    return PharmacyAddress(
      type: AddressType.values.firstWhere(
        (e) => e.toString() == 'AddressType.${map['type']}',
        orElse: () => AddressType.description,
      ),
      street: map['street'],
      city: map['city'] ?? '',
      region: map['region'] ?? '',
      country: map['country'] ?? '',
      postalCode: map['postalCode'],
      landmarks: map['landmarks'],
      description: map['description'],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'type': type.toString().split('.').last,
      'street': street,
      'city': city,
      'region': region,
      'country': country,
      'postalCode': postalCode,
      'landmarks': landmarks,
      'description': description,
    };
  }

  /// Get display-friendly address string
  String get displayAddress {
    switch (type) {
      case AddressType.formal:
        return [street, city, region, country].where((s) => s?.isNotEmpty == true).join(', ');
      case AddressType.landmark:
        return [landmarks, city, region, country].where((s) => s?.isNotEmpty == true).join(', ');
      case AddressType.description:
        return [description, city, region, country].where((s) => s?.isNotEmpty == true).join(', ');
    }
  }

  /// Get short address for UI lists
  String get shortAddress {
    if (landmarks?.isNotEmpty == true) return landmarks!;
    if (street?.isNotEmpty == true) return '$street, $city';
    if (description?.isNotEmpty == true) return description!;
    return '$city, $region';
  }

  @override
  List<Object?> get props => [
    type, street, city, region, country, postalCode, landmarks, description
  ];
}

/// Complete location data combining GPS and address
class PharmacyLocationData extends Equatable {
  final PharmacyCoordinates coordinates; // Always required - GPS works everywhere
  final PharmacyAddress? address;        // Optional - not all areas have formal addresses
  final String? what3words;              // Ultra-precise location sharing (optional)

  const PharmacyLocationData({
    required this.coordinates,
    this.address,
    this.what3words,
  });

  factory PharmacyLocationData.fromMap(Map<String, dynamic> map) {
    return PharmacyLocationData(
      coordinates: PharmacyCoordinates.fromMap(map['coordinates'] ?? {}),
      address: map['address'] != null ? PharmacyAddress.fromMap(map['address']) : null,
      what3words: map['what3words'],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'coordinates': coordinates.toMap(),
      'address': address?.toMap(),
      'what3words': what3words,
    };
  }

  /// Get the best available location description for display
  String get bestLocationDescription {
    if (address != null) return address!.displayAddress;
    if (what3words != null) return 'what3words: $what3words';
    return 'GPS: ${coordinates.latitude.toStringAsFixed(6)}, ${coordinates.longitude.toStringAsFixed(6)}';
  }

  /// Get location suitable for courier navigation
  String get courierNavigationInfo {
    final parts = <String>[];
    
    // Always include GPS coordinates for navigation
    parts.add('GPS: ${coordinates.latitude}, ${coordinates.longitude}');
    
    // Add address if available
    if (address != null) {
      parts.add('Address: ${address!.displayAddress}');
    }
    
    // Add what3words for ultra-precise location
    if (what3words != null) {
      parts.add('what3words: $what3words');
    }
    
    return parts.join('\n');
  }

  @override
  List<Object?> get props => [coordinates, address, what3words];
}