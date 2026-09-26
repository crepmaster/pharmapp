import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../models/delivery.dart';
import '../../../services/courier_location_service.dart';
import '../../../services/delivery_service.dart';

class OrderDetailsScreen extends StatefulWidget {
  final Delivery delivery;
  final Future<void> Function(String deliveryId)? acceptRunner;
  final Stream<Map<String, dynamic>?>? transportPlanStream;

  const OrderDetailsScreen({
    super.key,
    required this.delivery,
    this.acceptRunner,
    this.transportPlanStream,
  });

  @override
  State<OrderDetailsScreen> createState() => _OrderDetailsScreenState();
}

class _OrderDetailsScreenState extends State<OrderDetailsScreen> {
  Delivery get delivery => widget.delivery;
  bool _isAccepting = false;
  late final Stream<Map<String, dynamic>?> _transportPlanStream;

  @override
  void initState() {
    super.initState();
    _transportPlanStream = widget.transportPlanStream ??
        FirebaseFirestore.instance
            .collection('deliveries')
            .doc(delivery.id)
            .snapshots()
            .map((snapshot) => snapshot.data());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Order Details'),
        backgroundColor: const Color(0xFF4CAF50),
        foregroundColor: Colors.white,
        actions: [
          if (delivery.pickup.hasGPSLocation)
            IconButton(
              onPressed: _openNavigation,
              icon: const Icon(Icons.navigation),
              tooltip: 'Navigate',
            ),
        ],
      ),
      body: StreamBuilder<Map<String, dynamic>?>(
        stream: _transportPlanStream,
        builder: (context, planSnapshot) => SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Status and Earnings Card
              _buildHeaderCard(),

              const SizedBox(height: 16),

              // Pickup Location Card
              _buildLocationCard(
                title: 'Pickup Location',
                location: delivery.pickup,
                color: const Color(0xFF4CAF50),
                icon: Icons.store,
              ),

              const SizedBox(height: 16),

              // Delivery Location Card
              _buildLocationCard(
                title: 'Delivery Location',
                location: delivery.delivery,
                color: Colors.orange,
                icon: Icons.local_hospital,
              ),

              const SizedBox(height: 16),

              _buildTransportPlan(planSnapshot),

              // Items Card
              _buildItemsCard(),

              const SizedBox(height: 16),

              // Distance and Time Card
              _buildDistanceCard(),

              const SizedBox(height: 24),

              // Action Buttons
              if (delivery.isPending)
                _buildAcceptButton(context,
                    planReady: _isPlanReady(planSnapshot)),
            ],
          ),
        ),
      ),
    );
  }

  bool _isPlanReady(AsyncSnapshot<Map<String, dynamic>?> snapshot) {
    if (!snapshot.hasData || snapshot.hasError) return false;
    final transit = snapshot.data?['stockTransit'];
    if (transit is! Map || transit['version'] != 1) return true;
    bool legReady(Object? value) =>
        value is Map &&
        (value['fromPharmacyId']?.toString().isNotEmpty ?? false) &&
        (value['toPharmacyId']?.toString().isNotEmpty ?? false) &&
        (value['medicineName']?.toString().isNotEmpty ?? false) &&
        value['quantity'] is num &&
        (value['quantity'] as num) > 0;
    return legReady(transit['outbound']) && legReady(transit['return']);
  }

  Widget _buildTransportPlan(AsyncSnapshot<Map<String, dynamic>?> snapshot) {
    if (snapshot.hasError) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Text('Transport plan unavailable. Please retry.'),
        ),
      );
    }
    final transit = snapshot.data?['stockTransit'];
    if (transit is! Map || transit['version'] != 1) {
      return snapshot.hasData
          ? const SizedBox.shrink()
          : const Card(
              child: Padding(
              padding: EdgeInsets.all(16),
              child: Text('Loading transport plan…'),
            ));
    }
    final outbound = transit['outbound'];
    final returnLeg = transit['return'];
    if (outbound is! Map || returnLeg is! Map || !_isPlanReady(snapshot)) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Text('Transport plan is incomplete.'),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Transport plan · 2 legs',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              _buildTransportLeg('Outbound', outbound),
              const Divider(height: 24),
              _buildTransportLeg('Return', returnLeg),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTransportLeg(String label, Map leg) {
    final from = _pharmacyName(leg['fromPharmacyId']);
    final to = _pharmacyName(leg['toPharmacyId']);
    final medicine = (leg['medicineName'] ?? '').toString();
    final quantity = leg['quantity']?.toString() ?? '?';
    final lot = (leg['lotNumber'] ?? '').toString();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('$label: $from → $to',
            style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text(
            '$medicine · $quantity units · Lot ${lot.isEmpty ? 'not recorded' : lot}'),
      ],
    );
  }

  String _pharmacyName(Object? pharmacyId) {
    if (pharmacyId == delivery.pickup.pharmacyId) {
      return delivery.pickup.pharmacyName;
    }
    if (pharmacyId == delivery.delivery.pharmacyId) {
      return delivery.delivery.pharmacyName;
    }
    return pharmacyId?.toString() ?? 'Unknown pharmacy';
  }

  Widget _buildHeaderCard() {
    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Delivery Fee',
                  style: TextStyle(
                    fontSize: 16,
                    color: Colors.grey[700],
                  ),
                ),
                Text(
                  delivery.formattedCourierFee,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF4CAF50),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Total Order Value',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey[600],
                  ),
                ),
                Text(
                  delivery.formattedTotalPrice,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(
                  Icons.schedule,
                  size: 16,
                  color: Colors.grey[600],
                ),
                const SizedBox(width: 4),
                Text(
                  'Created ${_formatTime(delivery.createdAt)}',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey[600],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLocationCard({
    required String title,
    required DeliveryLocation location,
    required Color color,
    required IconData icon,
  }) {
    final currentPosition = CourierLocationService.lastKnownPosition;
    double? distance;
    Duration? estimatedTime;

    if (currentPosition != null && location.hasGPSLocation) {
      distance = CourierLocationService.calculateDistance(
        currentPosition.latitude,
        currentPosition.longitude,
        location.latitude!,
        location.longitude!,
      );
      estimatedTime =
          CourierLocationService.calculateEstimatedDeliveryTime(distance);
    }

    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    icon,
                    color: color,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                if (location.hasGPSLocation)
                  IconButton(
                    onPressed: () => _openLocationNavigation(location),
                    icon: const Icon(Icons.navigation),
                    tooltip: 'Navigate',
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              location.pharmacyName,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              location.address,
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey[600],
              ),
            ),
            if (location.phoneNumber != null) ...[
              const SizedBox(height: 8),
              InkWell(
                onTap: () => _makePhoneCall(location.phoneNumber!),
                child: Row(
                  children: [
                    Icon(
                      Icons.phone,
                      size: 16,
                      color: Colors.blue[600],
                    ),
                    const SizedBox(width: 4),
                    Text(
                      location.phoneNumber!,
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.blue[600],
                        decoration: TextDecoration.underline,
                      ),
                    ),
                  ],
                ),
              ),
            ],
            if (location.contactPerson != null) ...[
              const SizedBox(height: 4),
              Row(
                children: [
                  Icon(
                    Icons.person,
                    size: 16,
                    color: Colors.grey[600],
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'Contact: ${location.contactPerson}',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey[600],
                    ),
                  ),
                ],
              ),
            ],
            if (distance != null && estimatedTime != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.grey[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey[200]!),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.directions,
                      size: 16,
                      color: Colors.grey[700],
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${CourierLocationService.formatDistance(distance)} • ${CourierLocationService.formatDuration(estimatedTime)}',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: Colors.grey[700],
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

  Widget _buildItemsCard() {
    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.medical_services,
                  color: Color(0xFF4CAF50),
                  size: 20,
                ),
                const SizedBox(width: 8),
                Text(
                  'Items to Deliver (${delivery.items.length})',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            ...delivery.items.map((item) => _buildItemRow(item)),
          ],
        ),
      ),
    );
  }

  Widget _buildItemRow(DeliveryItem item) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey[50],
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey[200]!),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: const Color(0xFF4CAF50).withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(
              Icons.medication,
              color: Color(0xFF4CAF50),
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.medicineName,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${item.quantity} ${item.unit}',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey[600],
                  ),
                ),
                if (item.expirationDate != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    'Expires: ${_formatDate(item.expirationDate!)}',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.orange[600],
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (item.pricePerUnit != null)
            Text(
              Delivery.formatAmount(item.totalPrice, delivery.currency),
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildDistanceCard() {
    final currentPosition = CourierLocationService.lastKnownPosition;

    if (currentPosition == null ||
        !delivery.pickup.hasGPSLocation ||
        !delivery.delivery.hasGPSLocation) {
      return Container();
    }

    final distanceToPickup = CourierLocationService.calculateDistance(
      currentPosition.latitude,
      currentPosition.longitude,
      delivery.pickup.latitude!,
      delivery.pickup.longitude!,
    );

    final totalDistance = CourierLocationService.calculateDistance(
      delivery.pickup.latitude!,
      delivery.pickup.longitude!,
      delivery.delivery.latitude!,
      delivery.delivery.longitude!,
    );

    final totalTime = CourierLocationService.calculateEstimatedDeliveryTime(
      distanceToPickup + totalDistance,
    );

    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(
                  Icons.route,
                  color: Color(0xFF4CAF50),
                  size: 20,
                ),
                SizedBox(width: 8),
                Text(
                  'Route Information',
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
                  child: _buildRouteInfo(
                    'To Pickup',
                    CourierLocationService.formatDistance(distanceToPickup),
                    CourierLocationService.formatDuration(
                      CourierLocationService.calculateEstimatedDeliveryTime(
                          distanceToPickup),
                    ),
                  ),
                ),
                Container(
                  width: 1,
                  height: 40,
                  color: Colors.grey[300],
                  margin: const EdgeInsets.symmetric(horizontal: 16),
                ),
                Expanded(
                  child: _buildRouteInfo(
                    'Pickup to Delivery',
                    CourierLocationService.formatDistance(totalDistance),
                    CourierLocationService.formatDuration(
                      CourierLocationService.calculateEstimatedDeliveryTime(
                          totalDistance),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF4CAF50).withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                    color: const Color(0xFF4CAF50).withValues(alpha: 0.3)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Total Estimated Time',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    CourierLocationService.formatDuration(totalTime),
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF4CAF50),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRouteInfo(String title, String distance, String time) {
    return Column(
      children: [
        Text(
          title,
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey[600],
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          distance,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          time,
          style: TextStyle(
            fontSize: 14,
            color: Colors.grey[600],
          ),
        ),
      ],
    );
  }

  Widget _buildAcceptButton(BuildContext context, {required bool planReady}) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: _isAccepting || !planReady ? null : _acceptDelivery,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF4CAF50),
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
        ),
        child: _isAccepting
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Text(
                'Accept This Delivery',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
      ),
    );
  }

  String _formatTime(DateTime dateTime) {
    final now = DateTime.now();
    final difference = now.difference(dateTime);

    if (difference.inMinutes < 60) {
      return '${difference.inMinutes} min ago';
    } else if (difference.inHours < 24) {
      return '${difference.inHours} hr ago';
    } else {
      return '${difference.inDays} days ago';
    }
  }

  String _formatDate(DateTime dateTime) {
    return '${dateTime.day}/${dateTime.month}/${dateTime.year}';
  }

  void _openNavigation() {
    if (delivery.pickup.hasGPSLocation) {
      _openLocationNavigation(delivery.pickup);
    }
  }

  void _openLocationNavigation(DeliveryLocation location) {
    if (!location.hasGPSLocation) return;

    final url = CourierLocationService.generateNavigationUrl(
      location.latitude!,
      location.longitude!,
      label: location.pharmacyName,
    );

    _launchURL(url);
  }

  void _makePhoneCall(String phoneNumber) {
    final url = 'tel:$phoneNumber';
    _launchURL(url);
  }

  void _launchURL(String url) async {
    try {
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      // Debug statement removed for production security
    }
  }

  Future<void> _acceptDelivery() async {
    if (_isAccepting) return;
    setState(() => _isAccepting = true);
    try {
      await (widget.acceptRunner ??
          DeliveryService.acceptDelivery)(delivery.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Delivery accepted successfully!'),
          backgroundColor: Color(0xFF4CAF50),
        ),
      );
      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to accept delivery: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      if (mounted) setState(() => _isAccepting = false);
    }
  }
}
