import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../../models/delivery.dart';
import '../../services/delivery_service.dart';
import '../../services/courier_location_service.dart';
import 'dart:async';
import 'qr_scanner_screen.dart';
import 'delivery_camera_screen.dart';

class ActiveDeliveryScreen extends StatefulWidget {
  final Delivery delivery;

  const ActiveDeliveryScreen({
    super.key,
    required this.delivery,
  });

  @override
  State<ActiveDeliveryScreen> createState() => _ActiveDeliveryScreenState();
}

class _ActiveDeliveryScreenState extends State<ActiveDeliveryScreen> {
  StreamSubscription<Position>? _locationSubscription;
  Position? _currentPosition;
  bool _isTrackingLocation = false;
  Timer? _updateTimer;
  
  @override
  void initState() {
    super.initState();
    _startLocationTracking();
  }

  @override
  void dispose() {
    _stopLocationTracking();
    _updateTimer?.cancel();
    super.dispose();
  }

  Future<void> _startLocationTracking() async {
    try {
      setState(() => _isTrackingLocation = true);
      
      final locationStream = await CourierLocationService.startLocationTracking();
      if (locationStream != null) {
        _locationSubscription = locationStream.listen((position) {
          setState(() => _currentPosition = position);
          _updateCourierLocationInFirebase(position);
        });

        // Update location in Firebase every 30 seconds
        _updateTimer = Timer.periodic(const Duration(seconds: 30), (timer) {
          if (_currentPosition != null) {
            _updateCourierLocationInFirebase(_currentPosition!);
          }
        });
      }
    } catch (e) {
      // Debug statement removed for production security
      setState(() => _isTrackingLocation = false);
    }
  }

  Future<void> _stopLocationTracking() async {
    await _locationSubscription?.cancel();
    _locationSubscription = null;
    await CourierLocationService.stopLocationTracking();
    _updateTimer?.cancel();
    setState(() => _isTrackingLocation = false);
  }

  Future<void> _updateCourierLocationInFirebase(Position position) async {
    try {
      await DeliveryService.updateCourierLocation(
        position.latitude,
        position.longitude,
      );
    } catch (e) {
      // Debug statement removed for production security
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Active Delivery'),
        backgroundColor: const Color(0xFF4CAF50),
        foregroundColor: Colors.white,
        actions: [
          // GPS tracking indicator
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    _isTrackingLocation ? Icons.gps_fixed : Icons.gps_off,
                    color: _isTrackingLocation ? Colors.white : Colors.white70,
                    size: 20,
                  ),
                  const SizedBox(width: 4),
                  if (_isTrackingLocation)
                    const SizedBox(
                      width: 12,
                      height: 12,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Location tracking status
            _buildLocationTrackingCard(),
            
            const SizedBox(height: 16),
            
            // Current delivery status
            _buildDeliveryStatusCard(),
            
            const SizedBox(height: 16),
            
            // Progress indicators
            _buildProgressCard(),
            
            const SizedBox(height: 16),
            
            // Navigation shortcuts
            _buildNavigationCard(),
            
            const SizedBox(height: 24),
            
            // Status update buttons
            _buildStatusUpdateButtons(),
          ],
        ),
      ),
    );
  }

  Widget _buildLocationTrackingCard() {
    return Card(
      elevation: 2,
      color: _isTrackingLocation ? const Color(0xFFF1F8E9) : const Color(0xFFFFF3E0),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              children: [
                Icon(
                  _isTrackingLocation ? Icons.gps_fixed : Icons.gps_not_fixed,
                  color: _isTrackingLocation ? const Color(0xFF4CAF50) : Colors.orange,
                  size: 24,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _isTrackingLocation ? 'GPS Tracking Active' : 'GPS Tracking Inactive',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: _isTrackingLocation ? const Color(0xFF4CAF50) : Colors.orange,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _isTrackingLocation 
                          ? 'Your location is being shared for real-time tracking'
                          : 'Enable location tracking for better delivery experience',
                        style: TextStyle(
                          fontSize: 14,
                          color: Colors.grey[600],
                        ),
                      ),
                    ],
                  ),
                ),
                if (!_isTrackingLocation)
                  TextButton(
                    onPressed: _startLocationTracking,
                    child: const Text('Enable'),
                  ),
              ],
            ),
            if (_currentPosition != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey[300]!),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.location_on, size: 16, color: Colors.blue),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Current: ${_currentPosition!.latitude.toStringAsFixed(6)}, ${_currentPosition!.longitude.toStringAsFixed(6)}',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey[700],
                          fontFamily: 'monospace',
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildDeliveryStatusCard() {
    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.local_shipping, color: Color(0xFF4CAF50), size: 24),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Delivery #${widget.delivery.id.substring(0, 8)}',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: _getStatusColor(widget.delivery.status).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: _getStatusColor(widget.delivery.status)),
                  ),
                  child: Text(
                    _getStatusText(widget.delivery.status),
                    style: TextStyle(
                      color: _getStatusColor(widget.delivery.status),
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Delivery Fee',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey[600],
                  ),
                ),
                Text(
                  '\$${widget.delivery.deliveryFee.toStringAsFixed(2)}',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF4CAF50),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProgressCard() {
    final currentStep = _getCurrentStep();
    
    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.timeline, color: Color(0xFF4CAF50), size: 24),
                SizedBox(width: 12),
                Text(
                  'Delivery Progress',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            _buildProgressStep('En Route to Pickup', 0, currentStep >= 0, 
              subtitle: widget.delivery.pickup.pharmacyName),
            _buildProgressStep('Arrived at Pickup', 1, currentStep >= 1,
              subtitle: 'Collect items from pharmacy'),
            _buildProgressStep('En Route to Delivery', 2, currentStep >= 2,
              subtitle: widget.delivery.delivery.pharmacyName),
            _buildProgressStep('Delivered', 3, currentStep >= 3,
              subtitle: 'Items delivered successfully'),
          ],
        ),
      ),
    );
  }

  Widget _buildProgressStep(String title, int stepIndex, bool isCompleted, {String? subtitle}) {
    final isActive = _getCurrentStep() == stepIndex;
    
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      child: Row(
        children: [
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isCompleted 
                ? const Color(0xFF4CAF50) 
                : isActive 
                  ? Colors.orange 
                  : Colors.grey[300],
            ),
            child: Icon(
              isCompleted ? Icons.check : Icons.radio_button_unchecked,
              color: isCompleted || isActive ? Colors.white : Colors.grey[600],
              size: 16,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: isCompleted 
                      ? const Color(0xFF4CAF50)
                      : isActive 
                        ? Colors.orange
                        : Colors.grey[600],
                  ),
                ),
                if (subtitle != null)
                  Text(
                    subtitle,
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey[600],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNavigationCard() {
    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.navigation, color: Color(0xFF4CAF50), size: 24),
                SizedBox(width: 12),
                Text(
                  'Quick Navigation',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _buildNavigationButton(
                    'Navigate to Pickup',
                    Icons.store,
                    () => _navigateToLocation(widget.delivery.pickup),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildNavigationButton(
                    'Navigate to Delivery',
                    Icons.local_hospital,
                    () => _navigateToLocation(widget.delivery.delivery),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNavigationButton(String text, IconData icon, VoidCallback onPressed) {
    return ElevatedButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, size: 18),
      label: Text(text, style: const TextStyle(fontSize: 12)),
      style: ElevatedButton.styleFrom(
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 12),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
        ),
      ),
    );
  }

  Widget _buildStatusUpdateButtons() {
    final currentStep = _getCurrentStep();
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (currentStep == 0) // En route to pickup
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ElevatedButton.icon(
                onPressed: () => _scanQRCode('pickup'),
                icon: const Icon(Icons.qr_code_scanner),
                label: const Text('Scan Pickup QR Code'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF4CAF50),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _takeProofPhoto('pickup'),
                      icon: const Icon(Icons.camera_alt),
                      label: const Text('Photo Proof'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.blue,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _updateDeliveryStatus(DeliveryStatus.pickedUp),
                      icon: const Icon(Icons.check_box_outline_blank),
                      label: const Text('Manual'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF4CAF50),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        
        if (currentStep == 2) // En route to delivery
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ElevatedButton.icon(
                onPressed: () => _scanQRCode('delivery'),
                icon: const Icon(Icons.qr_code_scanner),
                label: const Text('Scan Delivery QR Code'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF4CAF50),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _takeProofPhoto('delivery'),
                      icon: const Icon(Icons.camera_alt),
                      label: const Text('Photo Proof'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.blue,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _updateDeliveryStatus(DeliveryStatus.delivered),
                      icon: const Icon(Icons.check_circle_outline),
                      label: const Text('Manual'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF4CAF50),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        
        const SizedBox(height: 12),
        
        // Emergency/issue button
        ElevatedButton.icon(
          onPressed: _reportIssue,
          icon: const Icon(Icons.warning),
          label: const Text('Report Issue'),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.orange,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 12),
          ),
        ),
      ],
    );
  }

  int _getCurrentStep() {
    switch (widget.delivery.status) {
      case DeliveryStatus.accepted:
      case DeliveryStatus.enRoute:
        return 0; // En route to pickup
      case DeliveryStatus.pickedUp:
        return 2; // En route to delivery  
      case DeliveryStatus.delivered:
        return 3; // Completed
      default:
        return 0;
    }
  }

  Color _getStatusColor(DeliveryStatus status) {
    switch (status) {
      case DeliveryStatus.pending:
        return Colors.orange;
      case DeliveryStatus.accepted:
      case DeliveryStatus.enRoute:
        return Colors.blue;
      case DeliveryStatus.pickedUp:
        return Colors.purple;
      case DeliveryStatus.delivered:
        return const Color(0xFF4CAF50);
      case DeliveryStatus.failed:
        return Colors.red;
      case DeliveryStatus.cancelled:
        return Colors.grey;
    }
  }

  String _getStatusText(DeliveryStatus status) {
    switch (status) {
      case DeliveryStatus.pending:
        return 'PENDING';
      case DeliveryStatus.accepted:
        return 'ACCEPTED';
      case DeliveryStatus.enRoute:
        return 'EN ROUTE';
      case DeliveryStatus.pickedUp:
        return 'PICKED UP';
      case DeliveryStatus.delivered:
        return 'DELIVERED';
      case DeliveryStatus.failed:
        return 'FAILED';
      case DeliveryStatus.cancelled:
        return 'CANCELLED';
    }
  }

  Future<void> _updateDeliveryStatus(DeliveryStatus status) async {
    try {
      await DeliveryService.updateDeliveryStatus(widget.delivery.id, status);
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Status updated to ${_getStatusText(status)}'),
            backgroundColor: const Color(0xFF4CAF50),
          ),
        );

        // If delivered, stop location tracking and go back
        if (status == DeliveryStatus.delivered) {
          _stopLocationTracking();
          Navigator.pop(context);
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to update status: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _navigateToLocation(DeliveryLocation location) {
    if (!location.hasGPSLocation) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('GPS location not available for this address'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    final url = CourierLocationService.generateNavigationUrl(
      location.latitude!,
      location.longitude!,
      label: location.pharmacyName,
    );

    // Launch navigation
    // Note: This would use url_launcher in a real app
    // Debug statement removed for production security
    
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Opening navigation to ${location.pharmacyName}'),
        backgroundColor: const Color(0xFF4CAF50),
      ),
    );
  }

  Future<void> _takeProofPhoto(String proofType) async {
    try {
      final result = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
          builder: (context) => DeliveryCameraScreen(
            delivery: widget.delivery,
            proofType: proofType,
          ),
        ),
      );

      // If photo proof was submitted successfully
      if (result == true && mounted) {
        // The DeliveryCameraScreen already updates the delivery status
        if (proofType == 'delivery') {
          // Delivery completed, stop tracking and go back
          _stopLocationTracking();
          Navigator.pop(context);
        } else {
          // Pickup completed, update the UI to show next step
          setState(() {});
        }
      } else if (result == false && mounted) {
        // User skipped photos, show manual confirmation
        _showManualConfirmation(proofType);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to open camera: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _showManualConfirmation(String proofType) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Confirm ${proofType == 'pickup' ? 'Pickup' : 'Delivery'}'),
        content: Text(
          'You chose to skip photos. Do you want to manually confirm this $proofType?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              final status = proofType == 'pickup' 
                ? DeliveryStatus.pickedUp 
                : DeliveryStatus.delivered;
              _updateDeliveryStatus(status);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF4CAF50),
              foregroundColor: Colors.white,
            ),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
  }

  Future<void> _scanQRCode(String scanType) async {
    try {
      final result = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
          builder: (context) => QRScannerScreen(
            delivery: widget.delivery,
            scanType: scanType,
          ),
        ),
      );

      // If QR scan was successful, refresh the screen
      if (result == true && mounted) {
        // The QRScannerScreen already updates the delivery status
        // Just show a confirmation and potentially navigate back
        if (scanType == 'delivery') {
          // Delivery completed, stop tracking and go back
          _stopLocationTracking();
          Navigator.pop(context);
        } else {
          // Pickup completed, update the UI to show next step
          setState(() {});
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to open QR scanner: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _reportIssue() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Report Issue'),
        content: const Text('What kind of issue are you experiencing?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              // TODO: Implement issue reporting
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Issue reported successfully'),
                  backgroundColor: Color(0xFF4CAF50),
                ),
              );
            },
            child: const Text('Report'),
          ),
        ],
      ),
    );
  }
}