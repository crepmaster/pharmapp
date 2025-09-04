import 'package:flutter/material.dart';
import '../../models/location_data.dart';
import '../../services/location_service.dart';
import '../../widgets/auth_text_field.dart';
import '../../widgets/location_picker_widget.dart';

/// Comprehensive location picker screen with map and address input
/// Can be used during registration or as a standalone location editor
class LocationPickerScreen extends StatefulWidget {
  final PharmacyLocationData? initialLocationData;
  final bool isRequired;
  final String title;
  final String subtitle;

  const LocationPickerScreen({
    super.key,
    this.initialLocationData,
    this.isRequired = true,
    this.title = 'Select Pharmacy Location',
    this.subtitle = 'Choose your precise location for better delivery service',
  });

  @override
  State<LocationPickerScreen> createState() => _LocationPickerScreenState();
}

class _LocationPickerScreenState extends State<LocationPickerScreen> {
  final _formKey = GlobalKey<FormState>();
  
  // Address controllers
  final _streetController = TextEditingController();
  final _cityController = TextEditingController();
  final _regionController = TextEditingController();
  final _countryController = TextEditingController();
  final _landmarksController = TextEditingController();
  final _what3wordsController = TextEditingController();
  
  // State variables
  PharmacyCoordinates? _selectedCoordinates;
  AddressType _selectedAddressType = AddressType.formal;
  bool _includeAddress = false;

  @override
  void initState() {
    super.initState();
    _initializeFromExisting();
  }

  void _initializeFromExisting() {
    if (widget.initialLocationData != null) {
      _selectedCoordinates = widget.initialLocationData!.coordinates;
      
      final address = widget.initialLocationData!.address;
      if (address != null) {
        _includeAddress = true;
        _selectedAddressType = address.type;
        
        _streetController.text = address.street ?? '';
        _cityController.text = address.city;
        _regionController.text = address.region;
        _countryController.text = address.country;
        _landmarksController.text = address.landmarks ?? '';
      }
      
      _what3wordsController.text = widget.initialLocationData!.what3words ?? '';
    }
  }

  @override
  void dispose() {
    _streetController.dispose();
    _cityController.dispose();
    _regionController.dispose();
    _countryController.dispose();
    _landmarksController.dispose();
    _what3wordsController.dispose();
    super.dispose();
  }

  void _onLocationSelected(PharmacyCoordinates coordinates) {
    setState(() {
      _selectedCoordinates = coordinates;
    });
  }

  PharmacyLocationData? _buildLocationData() {
    if (_selectedCoordinates == null) return null;
    
    PharmacyAddress? address;
    
    if (_includeAddress) {
      switch (_selectedAddressType) {
        case AddressType.formal:
          if (_streetController.text.isNotEmpty && 
              _cityController.text.isNotEmpty && 
              _regionController.text.isNotEmpty && 
              _countryController.text.isNotEmpty) {
            address = LocationService.createFormalAddress(
              street: _streetController.text.trim(),
              city: _cityController.text.trim(),
              region: _regionController.text.trim(),
              country: _countryController.text.trim(),
            );
          }
          break;
        case AddressType.landmark:
          if (_landmarksController.text.isNotEmpty && 
              _cityController.text.isNotEmpty && 
              _regionController.text.isNotEmpty && 
              _countryController.text.isNotEmpty) {
            address = LocationService.createLandmarkAddress(
              landmarks: _landmarksController.text.trim(),
              city: _cityController.text.trim(),
              region: _regionController.text.trim(),
              country: _countryController.text.trim(),
            );
          }
          break;
        case AddressType.description:
          if (_cityController.text.isNotEmpty && 
              _regionController.text.isNotEmpty && 
              _countryController.text.isNotEmpty) {
            address = PharmacyAddress(
              type: AddressType.description,
              description: _landmarksController.text.trim().isNotEmpty 
                  ? _landmarksController.text.trim() 
                  : 'Map-selected location',
              city: _cityController.text.trim(),
              region: _regionController.text.trim(),
              country: _countryController.text.trim(),
            );
          }
          break;
      }
    }
    
    return LocationService.createLocationData(
      coordinates: _selectedCoordinates!,
      address: address,
      what3words: _what3wordsController.text.trim().isNotEmpty 
          ? _what3wordsController.text.trim() 
          : null,
    );
  }

  void _saveLocation() {
    if (widget.isRequired && _selectedCoordinates == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select a location on the map'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_includeAddress && !_formKey.currentState!.validate()) {
      return;
    }

    final locationData = _buildLocationData();
    Navigator.of(context).pop(locationData);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          TextButton(
            onPressed: _saveLocation,
            child: const Text(
              'SAVE',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          // Header info
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            color: const Color(0xFF1976D2),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.subtitle,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Tap on the map or use GPS to mark your location',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.9),
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
          
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Map Section
                  const Text(
                    'Location Map',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  
                  LocationPickerWidget(
                    initialLocation: _selectedCoordinates,
                    onLocationSelected: _onLocationSelected,
                    height: 250,
                  ),
                  
                  const SizedBox(height: 24),
                  
                  // Address Section Toggle
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text(
                      'Add Address Details',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    subtitle: const Text(
                      'Include street address, landmarks, or descriptive location info',
                    ),
                    value: _includeAddress,
                    onChanged: (value) {
                      setState(() => _includeAddress = value);
                    },
                    activeThumbColor: const Color(0xFF1976D2),
                  ),
                  
                  if (_includeAddress) ...[
                    const SizedBox(height: 16),
                    
                    Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Address Type Selection
                          const Text(
                            'Address Type:',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 8),
                          
                          SegmentedButton<AddressType>(
                            segments: const [
                              ButtonSegment(
                                value: AddressType.formal,
                                label: Text('Street'),
                                icon: Icon(Icons.home, size: 16),
                              ),
                              ButtonSegment(
                                value: AddressType.landmark,
                                label: Text('Landmark'),
                                icon: Icon(Icons.place, size: 16),
                              ),
                              ButtonSegment(
                                value: AddressType.description,
                                label: Text('Description'),
                                icon: Icon(Icons.description, size: 16),
                              ),
                            ],
                            selected: {_selectedAddressType},
                            onSelectionChanged: (Set<AddressType> selection) {
                              setState(() => _selectedAddressType = selection.first);
                            },
                          ),
                          
                          const SizedBox(height: 16),
                          
                          // Address Fields based on type
                          if (_selectedAddressType == AddressType.formal) ...[
                            AuthTextField(
                              controller: _streetController,
                              label: 'Street Address',
                              prefixIcon: Icons.home,
                              validator: (value) {
                                if (value == null || value.isEmpty) {
                                  return 'Please enter street address';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 12),
                          ],
                          
                          if (_selectedAddressType == AddressType.landmark) ...[
                            AuthTextField(
                              controller: _landmarksController,
                              label: 'Landmarks & Directions',
                              prefixIcon: Icons.place,
                              maxLines: 2,
                              validator: (value) {
                                if (value == null || value.isEmpty) {
                                  return 'Please enter landmarks or directions';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 12),
                          ],
                          
                          if (_selectedAddressType == AddressType.description) ...[
                            AuthTextField(
                              controller: _landmarksController,
                              label: 'Location Description',
                              prefixIcon: Icons.description,
                              maxLines: 2,
                              hint: 'Describe your location in detail',
                              validator: (value) {
                                if (value == null || value.isEmpty) {
                                  return 'Please describe the location';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 12),
                          ],
                          
                          // City, Region, Country (always shown for address)
                          Row(
                            children: [
                              Expanded(
                                flex: 2,
                                child: AuthTextField(
                                  controller: _cityController,
                                  label: 'City',
                                  prefixIcon: Icons.location_city,
                                  validator: (value) {
                                    if (value == null || value.isEmpty) {
                                      return 'Required';
                                    }
                                    return null;
                                  },
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: AuthTextField(
                                  controller: _regionController,
                                  label: 'Region',
                                  prefixIcon: Icons.map,
                                  validator: (value) {
                                    if (value == null || value.isEmpty) {
                                      return 'Required';
                                    }
                                    return null;
                                  },
                                ),
                              ),
                            ],
                          ),
                          
                          const SizedBox(height: 12),
                          
                          AuthTextField(
                            controller: _countryController,
                            label: 'Country Code (e.g., CM, NG, KE)',
                            prefixIcon: Icons.flag,
                            validator: (value) {
                              if (value == null || value.isEmpty) {
                                return 'Please enter country code';
                              }
                              if (value.length != 2) {
                                return 'Use 2-letter country code (CM, NG, KE, etc.)';
                              }
                              return null;
                            },
                          ),
                          
                          const SizedBox(height: 16),
                          
                          // What3Words (optional)
                          AuthTextField(
                            controller: _what3wordsController,
                            label: 'what3words (Optional)',
                            prefixIcon: Icons.three_mp,
                            hint: 'e.g., ///index.home.raft',
                          ),
                        ],
                      ),
                    ),
                  ],
                  
                  const SizedBox(height: 32),
                  
                  // Location summary
                  if (_selectedCoordinates != null) ...[
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.green[50],
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.green[200]!),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(Icons.check_circle, color: Colors.green[700]),
                              const SizedBox(width: 8),
                              Text(
                                'Location Ready',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.green[700],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'GPS: ${_selectedCoordinates!.latitude.toStringAsFixed(6)}, ${_selectedCoordinates!.longitude.toStringAsFixed(6)}',
                            style: TextStyle(
                              fontFamily: 'monospace',
                              color: Colors.green[600],
                            ),
                          ),
                          Text(
                            'Accuracy: ±${_selectedCoordinates!.accuracy.toStringAsFixed(1)}m',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.green[600],
                            ),
                          ),
                          if (_includeAddress) ...[
                            const SizedBox(height: 8),
                            Text(
                              'Address details will be included',
                              style: TextStyle(
                                color: Colors.green[600],
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}