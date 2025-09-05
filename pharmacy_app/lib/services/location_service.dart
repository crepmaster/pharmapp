import 'package:geolocator/geolocator.dart';
import 'package:location/location.dart' as loc;
import '../models/location_data.dart';

/// Global location service for pharmacy positioning
/// Supports both formal addresses and GPS coordinates for worldwide deployment
class LocationService {
  static final loc.Location _location = loc.Location();

  /// Check if location services are available and permissions are granted
  static Future<bool> isLocationServiceEnabled() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return false;

    LocationPermission permission = await Geolocator.checkPermission();
    return permission == LocationPermission.always || 
           permission == LocationPermission.whileInUse;
  }

  /// Request location permissions from user
  static Future<bool> requestLocationPermission() async {
    try {
      // Check if location service is enabled
      bool serviceEnabled = await _location.serviceEnabled();
      if (!serviceEnabled) {
        serviceEnabled = await _location.requestService();
        if (!serviceEnabled) return false;
      }

      // Check and request permissions
      loc.PermissionStatus permissionGranted = await _location.hasPermission();
      if (permissionGranted == loc.PermissionStatus.denied) {
        permissionGranted = await _location.requestPermission();
        if (permissionGranted != loc.PermissionStatus.granted) {
          return false;
        }
      }

      return true;
    } catch (e) {
      // Debug statement removed for production security
      return false;
    }
  }

  /// Get current GPS position with high accuracy
  static Future<PharmacyCoordinates?> getCurrentPosition() async {
    try {
      // Request permissions first
      bool hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        // Debug statement removed for production security
        return null;
      }

      // Debug statement removed for production security

      // Get high-accuracy position
      Position position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 15),
      );

      // Debug statement removed for production security

      return PharmacyCoordinates(
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        capturedAt: DateTime.now(),
      );
    } catch (e) {
      // Debug statement removed for production security
      return null;
    }
  }

  /// Get last known position (faster, may be less accurate)
  static Future<PharmacyCoordinates?> getLastKnownPosition() async {
    try {
      Position? position = await Geolocator.getLastKnownPosition();
      if (position == null) return null;

      return PharmacyCoordinates(
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        capturedAt: DateTime.now(),
      );
    } catch (e) {
      // Debug statement removed for production security
      return null;
    }
  }

  /// Calculate distance between two pharmacies in kilometers
  static double calculateDistance(
    PharmacyCoordinates from, 
    PharmacyCoordinates to
  ) {
    return from.distanceTo(to);
  }

  /// Calculate delivery fee based on distance (example pricing)
  static double calculateDeliveryFee(double distanceKm) {
    // Example African pricing model
    if (distanceKm <= 2.0) return 500; // CFA Francs or equivalent
    if (distanceKm <= 5.0) return 750;
    if (distanceKm <= 10.0) return 1000;
    if (distanceKm <= 20.0) return 1500;
    return 2000; // Long distance
  }

  /// Create address from manual input (for formal address areas)
  static PharmacyAddress createFormalAddress({
    required String street,
    required String city,
    required String region,
    required String country,
    String? postalCode,
  }) {
    return PharmacyAddress(
      type: AddressType.formal,
      street: street,
      city: city,
      region: region,
      country: country,
      postalCode: postalCode,
    );
  }

  /// Create address from landmarks (for rural/informal areas)
  static PharmacyAddress createLandmarkAddress({
    required String landmarks,
    required String city,
    required String region,
    required String country,
    String? description,
  }) {
    return PharmacyAddress(
      type: AddressType.landmark,
      landmarks: landmarks,
      city: city,
      region: region,
      country: country,
      description: description,
    );
  }

  /// Create complete location data combining GPS + address
  static PharmacyLocationData createLocationData({
    required PharmacyCoordinates coordinates,
    PharmacyAddress? address,
    String? what3words,
  }) {
    return PharmacyLocationData(
      coordinates: coordinates,
      address: address,
      what3words: what3words,
    );
  }

  /// Validate coordinates are reasonable (not null island, etc.)
  static bool isValidCoordinate(double lat, double lng) {
    return lat.abs() <= 90 && lng.abs() <= 180 && !(lat == 0 && lng == 0);
  }

  /// Get country code from coordinates (basic implementation)
  /// In production, you might use a geocoding service
  static Future<String> getCountryFromCoordinates(PharmacyCoordinates coords) async {
    // Basic region detection - in production use proper reverse geocoding
    if (coords.latitude > -35 && coords.latitude < 37 && 
        coords.longitude > -18 && coords.longitude < 52) {
      return 'AF'; // Africa (approximate)
    }
    // Add more regions as needed
    return 'UNKNOWN';
  }
}