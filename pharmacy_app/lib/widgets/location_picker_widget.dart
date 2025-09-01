import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../models/location_data.dart';
import '../services/location_service.dart';

/// Interactive map widget for selecting pharmacy location
/// Supports both GPS positioning and map-based selection
class LocationPickerWidget extends StatefulWidget {
  final PharmacyCoordinates? initialLocation;
  final Function(PharmacyCoordinates) onLocationSelected;
  final double height;
  final bool showMyLocationButton;

  const LocationPickerWidget({
    super.key,
    this.initialLocation,
    required this.onLocationSelected,
    this.height = 300,
    this.showMyLocationButton = true,
  });

  @override
  State<LocationPickerWidget> createState() => _LocationPickerWidgetState();
}

class _LocationPickerWidgetState extends State<LocationPickerWidget> {
  GoogleMapController? _mapController;
  PharmacyCoordinates? _selectedLocation;
  bool _isGettingLocation = false;
  
  // Default location (Douala, Cameroon - major African commercial center)
  static const LatLng _defaultLocation = LatLng(4.0511, 9.7679);
  
  Set<Marker> _markers = {};

  @override
  void initState() {
    super.initState();
    _selectedLocation = widget.initialLocation;
    _updateMarker();
  }

  void _updateMarker() {
    if (_selectedLocation != null) {
      _markers = {
        Marker(
          markerId: const MarkerId('selected_location'),
          position: LatLng(_selectedLocation!.latitude, _selectedLocation!.longitude),
          draggable: true,
          onDragEnd: _onMarkerDragEnd,
          infoWindow: InfoWindow(
            title: 'Pharmacy Location',
            snippet: 'Accuracy: ±${_selectedLocation!.accuracy.toStringAsFixed(1)}m',
          ),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueBlue),
        ),
      };
    } else {
      _markers = {};
    }
  }

  void _onMarkerDragEnd(LatLng position) {
    final newLocation = PharmacyCoordinates(
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: 10.0, // Default accuracy for map selection
      capturedAt: DateTime.now(),
    );
    
    setState(() {
      _selectedLocation = newLocation;
      _updateMarker();
    });
    
    widget.onLocationSelected(newLocation);
  }

  void _onMapTapped(LatLng position) {
    final newLocation = PharmacyCoordinates(
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: 15.0, // Default accuracy for tap selection
      capturedAt: DateTime.now(),
    );
    
    setState(() {
      _selectedLocation = newLocation;
      _updateMarker();
    });
    
    widget.onLocationSelected(newLocation);
  }

  Future<void> _getCurrentLocation() async {
    setState(() => _isGettingLocation = true);
    
    try {
      final coordinates = await LocationService.getCurrentPosition();
      if (coordinates != null && mounted) {
        setState(() {
          _selectedLocation = coordinates;
          _updateMarker();
        });
        
        widget.onLocationSelected(coordinates);
        
        // Animate to current location
        if (_mapController != null) {
          _mapController!.animateCamera(
            CameraUpdate.newLatLngZoom(
              LatLng(coordinates.latitude, coordinates.longitude),
              16.0,
            ),
          );
        }
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Current location captured (±${coordinates.accuracy.toStringAsFixed(1)}m)',
            ),
            backgroundColor: Colors.green,
          ),
        );
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Unable to get current location. Please check permissions.'),
            backgroundColor: Colors.orange,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Location error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isGettingLocation = false);
    }
  }

  void _onMapCreated(GoogleMapController controller) {
    _mapController = controller;
    
    // Move to initial location if provided
    if (_selectedLocation != null) {
      controller.animateCamera(
        CameraUpdate.newLatLngZoom(
          LatLng(_selectedLocation!.latitude, _selectedLocation!.longitude),
          16.0,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: widget.height,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[300]!),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Stack(
          children: [
            // Google Map
            GoogleMap(
              onMapCreated: _onMapCreated,
              initialCameraPosition: CameraPosition(
                target: _selectedLocation != null
                    ? LatLng(_selectedLocation!.latitude, _selectedLocation!.longitude)
                    : _defaultLocation,
                zoom: _selectedLocation != null ? 16.0 : 12.0,
              ),
              markers: _markers,
              onTap: _onMapTapped,
              myLocationEnabled: true,
              myLocationButtonEnabled: false, // We'll use our custom button
              zoomControlsEnabled: true,
              mapToolbarEnabled: false,
              compassEnabled: true,
              buildingsEnabled: true,
              indoorViewEnabled: false,
              trafficEnabled: false,
              mapType: MapType.normal,
            ),
            
            // Instructions overlay
            if (_selectedLocation == null) 
              Positioned(
                top: 16,
                left: 16,
                right: 16,
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.blue[50],
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.blue[200]!),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.info_outline, color: Colors.blue[700], size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Tap on the map to select your pharmacy location',
                          style: TextStyle(
                            color: Colors.blue[700],
                            fontSize: 14,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            
            // My Location Button (if enabled)
            if (widget.showMyLocationButton)
              Positioned(
                bottom: 16,
                right: 16,
                child: FloatingActionButton(
                  mini: true,
                  onPressed: _isGettingLocation ? null : _getCurrentLocation,
                  backgroundColor: Colors.white,
                  foregroundColor: const Color(0xFF1976D2),
                  child: _isGettingLocation
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF1976D2)),
                          ),
                        )
                      : const Icon(Icons.my_location, size: 20),
                ),
              ),
            
            // Selected location info
            if (_selectedLocation != null)
              Positioned(
                bottom: 16,
                left: 16,
                right: widget.showMyLocationButton ? 72 : 16,
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.green[50],
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.green[200]!),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.location_on, color: Colors.green[700], size: 16),
                          const SizedBox(width: 4),
                          Text(
                            'Location Selected',
                            style: TextStyle(
                              color: Colors.green[700],
                              fontWeight: FontWeight.bold,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${_selectedLocation!.latitude.toStringAsFixed(6)}, ${_selectedLocation!.longitude.toStringAsFixed(6)}',
                        style: TextStyle(
                          color: Colors.green[600],
                          fontSize: 11,
                          fontFamily: 'monospace',
                        ),
                      ),
                      Text(
                        'Accuracy: ±${_selectedLocation!.accuracy.toStringAsFixed(1)}m',
                        style: TextStyle(
                          color: Colors.green[600],
                          fontSize: 10,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _mapController?.dispose();
    super.dispose();
  }
}