import 'dart:async';
import 'package:geolocator/geolocator.dart' as geolocator;
import 'package:location/location.dart';
import 'dart:math';

class CourierLocationService {
  static Location _location = Location();
  static StreamSubscription<LocationData>? _locationSubscription;
  static geolocator.Position? _currentPosition;
  static StreamController<geolocator.Position>? _positionController;

  // Get current location permission status
  static Future<bool> hasLocationPermission() async {
    bool serviceEnabled;
    PermissionStatus permissionGranted;

    serviceEnabled = await _location.serviceEnabled();
    if (!serviceEnabled) {
      serviceEnabled = await _location.requestService();
      if (!serviceEnabled) {
        return false;
      }
    }

    permissionGranted = await _location.hasPermission();
    if (permissionGranted == PermissionStatus.denied) {
      permissionGranted = await _location.requestPermission();
      if (permissionGranted != PermissionStatus.granted) {
        return false;
      }
    }

    return true;
  }

  // Get current position once
  static Future<geolocator.Position?> getCurrentPosition() async {
    try {
      if (!await hasLocationPermission()) {
        print('📍 CourierLocationService: Location permission denied');
        return null;
      }

      final position = await geolocator.Geolocator.getCurrentPosition(
        desiredAccuracy: geolocator.LocationAccuracy.high,
      );
      
      _currentPosition = position;
      print('📍 CourierLocationService: Current position - ${position.latitude}, ${position.longitude}');
      return position;
    } catch (e) {
      print('❌ CourierLocationService: Error getting current position - $e');
      return null;
    }
  }

  // Start real-time location tracking (for active deliveries)
  static Future<Stream<geolocator.Position>?> startLocationTracking() async {
    try {
      if (!await hasLocationPermission()) {
        print('📍 CourierLocationService: Location permission denied for tracking');
        return null;
      }

      _positionController = StreamController<geolocator.Position>.broadcast();

      _locationSubscription = _location.onLocationChanged.listen((LocationData locationData) {
        if (locationData.latitude != null && locationData.longitude != null) {
          final position = geolocator.Position(
            longitude: locationData.longitude!,
            latitude: locationData.latitude!,
            timestamp: DateTime.now(),
            accuracy: locationData.accuracy ?? 0.0,
            altitude: locationData.altitude ?? 0.0,
            altitudeAccuracy: 0.0,
            heading: locationData.heading ?? 0.0,
            headingAccuracy: 0.0,
            speed: locationData.speed ?? 0.0,
            speedAccuracy: 0.0,
          );
          
          _currentPosition = position;
          _positionController?.add(position);
          print('📍 CourierLocationService: Live position - ${position.latitude}, ${position.longitude}');
        }
      });

      return _positionController?.stream;
    } catch (e) {
      print('❌ CourierLocationService: Error starting location tracking - $e');
      return null;
    }
  }

  // Stop location tracking
  static Future<void> stopLocationTracking() async {
    await _locationSubscription?.cancel();
    _locationSubscription = null;
    await _positionController?.close();
    _positionController = null;
    print('📍 CourierLocationService: Location tracking stopped');
  }

  // Get last known position
  static geolocator.Position? get lastKnownPosition => _currentPosition;

  // Calculate distance between two points (in kilometers)
  static double calculateDistance(
    double lat1, double lon1,
    double lat2, double lon2,
  ) {
    return geolocator.Geolocator.distanceBetween(lat1, lon1, lat2, lon2) / 1000; // Convert to km
  }

  // Calculate estimated delivery time based on distance (assuming 25 km/h average speed)
  static Duration calculateEstimatedDeliveryTime(double distanceKm) {
    const double averageSpeedKmH = 25.0;
    final double hours = distanceKm / averageSpeedKmH;
    return Duration(minutes: (hours * 60).round());
  }

  // Generate Google Maps navigation URL
  static String generateNavigationUrl(double lat, double lng, {String? label}) {
    final labelParam = label != null ? '($label)' : '';
    return 'https://www.google.com/maps/dir/?api=1&destination=$lat,$lng$labelParam';
  }

  // Check if courier is near a location (within 100 meters)
  static bool isNearLocation(double targetLat, double targetLng, {double radiusMeters = 100.0}) {
    if (_currentPosition == null) return false;
    
    final distance = geolocator.Geolocator.distanceBetween(
      _currentPosition!.latitude,
      _currentPosition!.longitude,
      targetLat,
      targetLng,
    );
    
    return distance <= radiusMeters;
  }

  // Get bearing (direction) to target location
  static double getBearingToLocation(double targetLat, double targetLng) {
    if (_currentPosition == null) return 0.0;
    
    return geolocator.Geolocator.bearingBetween(
      _currentPosition!.latitude,
      _currentPosition!.longitude,
      targetLat,
      targetLng,
    );
  }

  // Format distance for display
  static String formatDistance(double distanceKm) {
    if (distanceKm < 1.0) {
      return '${(distanceKm * 1000).round()}m';
    } else {
      return '${distanceKm.toStringAsFixed(1)}km';
    }
  }

  // Format duration for display
  static String formatDuration(Duration duration) {
    if (duration.inHours > 0) {
      return '${duration.inHours}h ${duration.inMinutes % 60}min';
    } else {
      return '${duration.inMinutes}min';
    }
  }
}