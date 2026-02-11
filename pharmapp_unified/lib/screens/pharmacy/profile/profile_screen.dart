import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:pharmapp_unified/blocs/unified_auth_bloc.dart';
import '../../../models/pharmacy_user.dart';
import '../../../models/location_data.dart';
import '../../../widgets/auth_text_field.dart';
import '../../location/location_picker_screen.dart';

/// Comprehensive profile management screen for pharmacies
/// Allows editing of all profile information including location data
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  
  // Controllers for editable fields only
  final _phoneController = TextEditingController();
  final _addressController = TextEditingController();
  
  // State variables
  bool _isLoading = false;
  bool _isUpdating = false;
  PharmacyUser? _currentUser;
  PharmacyLocationData? _locationData;
  
  @override
  void initState() {
    super.initState();
    // Use addPostFrameCallback to ensure context is available
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadUserData();
    });
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  Future<void> _loadUserData() async {
    setState(() => _isLoading = true);
    
    try {
      final authState = context.read<UnifiedAuthBloc>().state;
      if (authState is Authenticated) {
        // Note: UnifiedAuthBloc uses userData Map, need to reconstruct PharmacyUser
        _currentUser = PharmacyUser.fromMap(authState.userData, authState.user.uid);
        _populateFields();
      } else {
        // Reload user data from Firestore
        final currentUser = FirebaseAuth.instance.currentUser;
        if (currentUser != null) {
          final doc = await FirebaseFirestore.instance
              .collection('pharmacies')
              .doc(currentUser.uid)
              .get();
          if (doc.exists) {
            _currentUser = PharmacyUser.fromMap(doc.data()!, currentUser.uid);
            _populateFields();
          }
        }
      }
    } catch (e) {
      // Don't use ScaffoldMessenger during initial load
      // Just log the error and show it in the UI via _isLoading state
      debugPrint('Error loading profile: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _populateFields() {
    if (_currentUser != null) {
      // Pharmacy name is read-only, no controller needed
      _phoneController.text = _currentUser!.phoneNumber;
      _addressController.text = _currentUser!.address;
      _locationData = _currentUser!.locationData;
    }
  }

  Future<void> _openLocationPicker() async {
    final result = await Navigator.of(context).push<PharmacyLocationData>(
      MaterialPageRoute(
        builder: (context) => LocationPickerScreen(
          initialLocationData: _locationData,
          title: 'Update Pharmacy Location',
          subtitle: 'Update your precise location for better delivery service',
          isRequired: false,
        ),
      ),
    );
    
    if (result != null && mounted) {
      setState(() {
        _locationData = result;
      });
    }
  }

  void _clearLocation() {
    if (!mounted) return;
    setState(() {
      _locationData = null;
    });
  }

  Future<void> _saveProfile() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() => _isUpdating = true);

    try {
      final currentUser = FirebaseAuth.instance.currentUser;
      if (currentUser == null) throw Exception('Not authenticated');

      // Update both users and pharmacies collections
      // Note: Pharmacy name is read-only and not included in updates
      final updateData = {
        'phoneNumber': _phoneController.text.trim(),
        'address': _addressController.text.trim(),
        if (_locationData != null) 'locationData': _locationData!.toMap(),
      };

      await Future.wait([
        FirebaseFirestore.instance
            .collection('users')
            .doc(currentUser.uid)
            .update(updateData),
        FirebaseFirestore.instance
            .collection('pharmacies')
            .doc(currentUser.uid)
            .update(updateData),
      ]);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Profile updated successfully!'),
            backgroundColor: Colors.green,
          ),
        );

        // Pop back to dashboard - it will reload data automatically
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error updating profile: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isUpdating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Edit Profile'),
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          TextButton(
            onPressed: _isUpdating ? null : _saveProfile,
            child: _isUpdating
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                    ),
                  )
                : const Text(
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
          // Header
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            color: const Color(0xFF1976D2),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const CircleAvatar(
                      radius: 30,
                      backgroundColor: Colors.white,
                      child: Icon(
                        Icons.local_pharmacy,
                        size: 30,
                        color: Color(0xFF1976D2),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _currentUser?.pharmacyName ?? 'Loading...',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            _currentUser?.email ?? '',
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.9),
                              fontSize: 14,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Basic Information Section
                    const Text(
                      'Basic Information',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16),
                    
                    // Pharmacy Name - Read-only display
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.grey[300]!),
                        borderRadius: BorderRadius.circular(12),
                        color: Colors.grey[100],
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.store, color: Colors.grey[600]),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Pharmacy Name',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.grey[600],
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  _currentUser?.pharmacyName ?? 'Loading...',
                                  style: TextStyle(
                                    fontSize: 16,
                                    color: Colors.grey[800],
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Icon(Icons.lock_outline, color: Colors.grey[400], size: 20),
                        ],
                      ),
                    ),
                    
                    const SizedBox(height: 16),
                    
                    AuthTextField(
                      controller: _phoneController,
                      label: 'Phone Number',
                      prefixIcon: Icons.phone,
                      keyboardType: TextInputType.phone,
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Please enter phone number';
                        }
                        return null;
                      },
                    ),
                    
                    const SizedBox(height: 16),
                    
                    AuthTextField(
                      controller: _addressController,
                      label: 'Legacy Address',
                      prefixIcon: Icons.location_on,
                      maxLines: 2,
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Please enter address';
                        }
                        return null;
                      },
                    ),
                    
                    const SizedBox(height: 24),
                    
                    // Location Information Section
                    const Text(
                      'Enhanced Location',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Precise GPS location for better delivery service',
                      style: TextStyle(
                        color: Colors.grey[600],
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 16),
                    
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.grey[300]!),
                        borderRadius: BorderRadius.circular(12),
                        color: Colors.grey[50],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (_locationData == null) ...[
                            Row(
                              children: [
                                Icon(
                                  Icons.location_off,
                                  color: Colors.grey[400],
                                  size: 24,
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  'No Enhanced Location Set',
                                  style: TextStyle(
                                    fontSize: 16,
                                    color: Colors.grey[600],
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'Add precise GPS coordinates and address details for better courier delivery.',
                              style: TextStyle(
                                fontSize: 14,
                                color: Colors.grey[600],
                              ),
                            ),
                            const SizedBox(height: 16),
                            ElevatedButton.icon(
                              onPressed: _openLocationPicker,
                              icon: const Icon(Icons.map),
                              label: const Text('Select Location'),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF1976D2),
                                foregroundColor: Colors.white,
                                minimumSize: const Size(double.infinity, 48),
                              ),
                            ),
                          ] else ...[
                            Row(
                              children: [
                                Icon(
                                  Icons.location_on,
                                  color: Colors.green[700],
                                  size: 24,
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    'Enhanced Location Set',
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                      color: Colors.green[700],
                                    ),
                                  ),
                                ),
                                IconButton(
                                  onPressed: _clearLocation,
                                  icon: Icon(
                                    Icons.close,
                                    color: Colors.grey[600],
                                    size: 20,
                                  ),
                                  tooltip: 'Remove location',
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.green[50],
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: Colors.green[200]!),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Location Details:',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: Colors.green[700],
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    _locationData!.bestLocationDescription,
                                    style: TextStyle(
                                      color: Colors.green[700],
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    'GPS: ${_locationData!.coordinates.latitude.toStringAsFixed(6)}, ${_locationData!.coordinates.longitude.toStringAsFixed(6)}',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontFamily: 'monospace',
                                      color: Colors.green[600],
                                    ),
                                  ),
                                  Text(
                                    'Accuracy: ±${_locationData!.coordinates.accuracy.toStringAsFixed(1)}m',
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: Colors.green[600],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            
                            const SizedBox(height: 12),
                            
                            Row(
                              children: [
                                Expanded(
                                  child: OutlinedButton.icon(
                                    onPressed: _openLocationPicker,
                                    icon: const Icon(Icons.edit_location, size: 16),
                                    label: const Text('Edit Location'),
                                    style: OutlinedButton.styleFrom(
                                      foregroundColor: const Color(0xFF1976D2),
                                      side: const BorderSide(color: Color(0xFF1976D2)),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                    
                    const SizedBox(height: 24),
                    
                    // Account Information Section
                    const Text(
                      'Account Information',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16),
                    
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.grey[300]!),
                        borderRadius: BorderRadius.circular(12),
                        color: Colors.grey[50],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(Icons.email, color: Colors.grey[600]),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Email Address',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w500,
                                        color: Colors.grey[800],
                                      ),
                                    ),
                                    Text(
                                      _currentUser?.email ?? 'Loading...',
                                      style: TextStyle(
                                        color: Colors.grey[600],
                                        fontSize: 14,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Icon(Icons.calendar_today, color: Colors.grey[600]),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Member Since',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w500,
                                        color: Colors.grey[800],
                                      ),
                                    ),
                                    Text(
                                      _currentUser?.createdAt != null 
                                          ? '${_currentUser!.createdAt!.day}/${_currentUser!.createdAt!.month}/${_currentUser!.createdAt!.year}'
                                          : 'Unknown',
                                      style: TextStyle(
                                        color: Colors.grey[600],
                                        fontSize: 14,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Icon(Icons.verified, color: _currentUser?.isActive == true ? Colors.green : Colors.grey),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Account Status',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w500,
                                        color: Colors.grey[800],
                                      ),
                                    ),
                                    Text(
                                      _currentUser?.isActive == true ? 'Active' : 'Inactive',
                                      style: TextStyle(
                                        color: _currentUser?.isActive == true ? Colors.green : Colors.red,
                                        fontSize: 14,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    
                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}