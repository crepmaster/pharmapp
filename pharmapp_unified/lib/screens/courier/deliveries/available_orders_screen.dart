import 'package:flutter/material.dart';
import '../../../models/delivery.dart';
import '../../../services/delivery_service.dart';
import '../../../services/courier_location_service.dart';
import 'order_details_screen.dart';
import 'active_delivery_screen.dart';

class AvailableOrdersScreen extends StatefulWidget {
  const AvailableOrdersScreen({super.key});

  @override
  State<AvailableOrdersScreen> createState() => _AvailableOrdersScreenState();
}

class _AvailableOrdersScreenState extends State<AvailableOrdersScreen> {
  bool _isCreatingMock = false;
  bool _locationInitialized = false;
  bool _isLoadingLocation = true;

  @override
  void initState() {
    super.initState();
    _initializeLocation();
  }

  Future<void> _initializeLocation() async {
    try {
      final position = await CourierLocationService.getCurrentPosition();
      if (mounted) {
        setState(() {
          _locationInitialized = position != null;
          _isLoadingLocation = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _locationInitialized = false;
          _isLoadingLocation = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Available Orders'),
        backgroundColor: const Color(0xFF4CAF50),
        foregroundColor: Colors.white,
        actions: [
          // Location status indicator
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Center(
              child: _isLoadingLocation
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                      ),
                    )
                  : Icon(
                      _locationInitialized ? Icons.gps_fixed : Icons.gps_off,
                      color: _locationInitialized ? Colors.white : Colors.white70,
                      size: 20,
                    ),
            ),
          ),
          IconButton(
            onPressed: _isCreatingMock ? null : _createMockDelivery,
            icon: _isCreatingMock 
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                )
              : const Icon(Icons.add_box),
            tooltip: 'Create Test Order',
          ),
        ],
      ),
      body: StreamBuilder<List<Delivery>>(
        stream: DeliveryService.getAvailableDeliveries(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF4CAF50)),
              ),
            );
          }

          if (snapshot.hasError) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.error_outline,
                    size: 64,
                    color: Colors.red,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Error loading orders',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.grey[800],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${snapshot.error}',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey[600],
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => setState(() {}),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            );
          }

          final deliveries = snapshot.data ?? [];
          
          // Sort deliveries by proximity if location is available
          final sortedDeliveries = _sortDeliveriesByProximity(deliveries);

          if (sortedDeliveries.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.local_shipping_outlined,
                    size: 64,
                    color: Colors.grey,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'No Available Orders',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.grey[800],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Check back later for new delivery opportunities',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey[600],
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton.icon(
                    onPressed: _isCreatingMock ? null : _createMockDelivery,
                    icon: _isCreatingMock 
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.add),
                    label: Text(_isCreatingMock ? 'Creating...' : 'Create Test Order'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF4CAF50),
                      foregroundColor: Colors.white,
                    ),
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () async => setState(() {}),
            color: const Color(0xFF4CAF50),
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: sortedDeliveries.length,
              itemBuilder: (context, index) {
                final delivery = sortedDeliveries[index];
                final isNearbyOrder = index < 3 && _isNearbyOrder(delivery); // Top 3 nearby orders
                return _buildDeliveryCard(delivery, isNearbyOrder: isNearbyOrder);
              },
            ),
          );
        },
      ),
    );
  }

  // Sort deliveries by proximity and route efficiency
  List<Delivery> _sortDeliveriesByProximity(List<Delivery> deliveries) {
    final currentPosition = CourierLocationService.lastKnownPosition;
    if (currentPosition == null || !_locationInitialized) {
      // No location - sort by creation time (newest first)
      final sorted = [...deliveries];
      sorted.sort((a, b) => b.createdAt.compareTo(a.createdAt));
      return sorted;
    }

    // Calculate proximity scores for each delivery
    final deliveryScores = deliveries.map((delivery) {
      double score = 0;
      
      // Factor 1: Distance to pickup (60% weight)
      if (delivery.pickup.hasGPSLocation) {
        final distanceToPickup = CourierLocationService.calculateDistance(
          currentPosition.latitude,
          currentPosition.longitude,
          delivery.pickup.latitude!,
          delivery.pickup.longitude!,
        );
        score += (1.0 / (1.0 + distanceToPickup)) * 0.6;
      }
      
      // Factor 2: Delivery fee (20% weight)
      score += (delivery.deliveryFee / 50.0).clamp(0.0, 1.0) * 0.2;
      
      // Factor 3: Route efficiency - shorter pickup to delivery distance (20% weight)
      if (delivery.pickup.hasGPSLocation && delivery.delivery.hasGPSLocation) {
        final routeDistance = CourierLocationService.calculateDistance(
          delivery.pickup.latitude!,
          delivery.pickup.longitude!,
          delivery.delivery.latitude!,
          delivery.delivery.longitude!,
        );
        score += (1.0 / (1.0 + routeDistance)) * 0.2;
      }
      
      return MapEntry(delivery, score);
    }).toList();

    // Sort by score descending (highest score first)
    deliveryScores.sort((a, b) => b.value.compareTo(a.value));
    return deliveryScores.map((entry) => entry.key).toList();
  }

  // Check if delivery is within nearby range (< 5km to pickup)
  bool _isNearbyOrder(Delivery delivery) {
    final currentPosition = CourierLocationService.lastKnownPosition;
    if (currentPosition == null || !delivery.pickup.hasGPSLocation) {
      return false;
    }
    
    final distance = CourierLocationService.calculateDistance(
      currentPosition.latitude,
      currentPosition.longitude,
      delivery.pickup.latitude!,
      delivery.pickup.longitude!,
    );
    
    return distance < 5.0; // Less than 5km
  }

  Widget _buildDeliveryCard(Delivery delivery, {bool isNearbyOrder = false}) {
    final currentPosition = CourierLocationService.lastKnownPosition;
    double? distanceToPickup;
    
    if (currentPosition != null && delivery.pickup.hasGPSLocation) {
      distanceToPickup = CourierLocationService.calculateDistance(
        currentPosition.latitude,
        currentPosition.longitude,
        delivery.pickup.latitude!,
        delivery.pickup.longitude!,
      );
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: isNearbyOrder ? 4 : 2,
      color: isNearbyOrder ? const Color(0xFFF1F8E9) : null,
      child: InkWell(
        onTap: () => _viewOrderDetails(delivery),
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Priority indicator for nearby orders
              if (isNearbyOrder)
                Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF4CAF50),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.star, color: Colors.white, size: 14),
                      SizedBox(width: 4),
                      Text(
                        'NEARBY ORDER',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),
                ),
              
              // Header with delivery fee and distance
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFF4CAF50),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      '\$${delivery.deliveryFee.toStringAsFixed(2)}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                  ),
                  if (distanceToPickup != null)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: isNearbyOrder ? const Color(0xFF4CAF50) : Colors.grey[100],
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.location_on,
                            size: 12,
                            color: isNearbyOrder ? Colors.white : Colors.grey[700],
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '${CourierLocationService.formatDistance(distanceToPickup)} away',
                            style: TextStyle(
                              color: isNearbyOrder ? Colors.white : Colors.grey[700],
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
              
              const SizedBox(height: 12),
              
              // Pickup location
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    margin: const EdgeInsets.only(top: 6, right: 8),
                    decoration: const BoxDecoration(
                      color: Color(0xFF4CAF50),
                      shape: BoxShape.circle,
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'PICKUP',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: Colors.grey[600],
                            letterSpacing: 1.2,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          delivery.pickup.pharmacyName,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          delivery.pickup.address,
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
              
              const SizedBox(height: 16),
              
              // Delivery location
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    margin: const EdgeInsets.only(top: 6, right: 8),
                    decoration: const BoxDecoration(
                      color: Colors.orange,
                      shape: BoxShape.circle,
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'DELIVERY',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: Colors.grey[600],
                            letterSpacing: 1.2,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          delivery.delivery.pharmacyName,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          delivery.delivery.address,
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
              
              const SizedBox(height: 16),
              
              // Route information (if GPS available)
              if (_locationInitialized && delivery.pickup.hasGPSLocation && delivery.delivery.hasGPSLocation)
                Container(
                  margin: const EdgeInsets.only(bottom: 16),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.blue[50],
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.blue[100]!),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.route, color: Colors.blue, size: 16),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _buildRouteInfo(delivery),
                      ),
                    ],
                  ),
                ),
              
              // Items and total value
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '${delivery.items.length} item${delivery.items.length != 1 ? 's' : ''}',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey[600],
                    ),
                  ),
                  Text(
                    'Total: \$${delivery.totalValue.toStringAsFixed(2)}',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              
              const SizedBox(height: 16),
              
              // Accept button
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => _acceptDelivery(delivery),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF4CAF50),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: const Text(
                    'Accept Delivery',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRouteInfo(Delivery delivery) {
    final currentPosition = CourierLocationService.lastKnownPosition;
    if (currentPosition == null) return const SizedBox();

    final distanceToPickup = CourierLocationService.calculateDistance(
      currentPosition.latitude,
      currentPosition.longitude,
      delivery.pickup.latitude!,
      delivery.pickup.longitude!,
    );

    final deliveryDistance = CourierLocationService.calculateDistance(
      delivery.pickup.latitude!,
      delivery.pickup.longitude!,
      delivery.delivery.latitude!,
      delivery.delivery.longitude!,
    );

    final totalDistance = distanceToPickup + deliveryDistance;
    final estimatedTime = CourierLocationService.calculateEstimatedDeliveryTime(totalDistance);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Route: ${CourierLocationService.formatDistance(totalDistance)}',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Colors.blue,
              ),
            ),
            Text(
              'Est: ${CourierLocationService.formatDuration(estimatedTime)}',
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[700],
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            Expanded(
              child: Text(
                'To pickup: ${CourierLocationService.formatDistance(distanceToPickup)}',
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.grey[600],
                ),
              ),
            ),
            Text(
              'Delivery: ${CourierLocationService.formatDistance(deliveryDistance)}',
              style: TextStyle(
                fontSize: 11,
                color: Colors.grey[600],
              ),
            ),
          ],
        ),
      ],
    );
  }

  void _viewOrderDetails(Delivery delivery) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => OrderDetailsScreen(delivery: delivery),
      ),
    );
  }

  Future<void> _acceptDelivery(Delivery delivery) async {
    try {
      await DeliveryService.acceptDelivery(delivery.id);
      
      if (mounted) {
        // Show success message
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Delivery accepted! Starting active tracking...'),
            backgroundColor: Color(0xFF4CAF50),
            duration: Duration(seconds: 2),
          ),
        );
        
        // Navigate to active delivery screen
        final acceptedDelivery = delivery.copyWith(
          courierId: 'current_courier_id', // This would be set by the service
          status: DeliveryStatus.accepted,
        );
        
        await Future.delayed(const Duration(milliseconds: 500));
        
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => ActiveDeliveryScreen(
              delivery: acceptedDelivery,
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to accept delivery: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _createMockDelivery() async {
    setState(() => _isCreatingMock = true);
    
    try {
      await DeliveryService.createMockDelivery();
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Test delivery created successfully!'),
            backgroundColor: Color(0xFF4CAF50),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to create test delivery: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isCreatingMock = false);
      }
    }
  }
}