import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import '../../blocs/unified_auth_bloc.dart';
import '../../blocs/delivery_bloc.dart';
import '../../models/delivery.dart';
import 'deliveries/available_orders_screen.dart';
import 'deliveries/active_delivery_screen.dart';
import 'deliveries/qr_scanner_screen.dart';
import '../../widgets/courier/courier_wallet_widget.dart';
import '../../widgets/notification_bell.dart';

class CourierMainScreen extends StatefulWidget {
  final Map<String, dynamic> userData;

  const CourierMainScreen({
    super.key,
    required this.userData,
  });

  @override
  State<CourierMainScreen> createState() => _CourierMainScreenState();
}

class _CourierMainScreenState extends State<CourierMainScreen> {

  @override
  void initState() {
    super.initState();
    // Load active delivery when screen initializes
    context.read<DeliveryBloc>().add(LoadActiveDelivery());
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false, // Prevent back button from popping
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) {
          // Show confirmation dialog instead of popping
          showDialog(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('Exit App?'),
              content: const Text('Do you want to exit the application?'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Cancel'),
                ),
                TextButton(
                  onPressed: () {
                    // Sign out and exit
                    context.read<UnifiedAuthBloc>().add(SignOutRequested());
                  },
                  child: const Text('Exit'),
                ),
              ],
            ),
          );
        }
      },
      child: Scaffold(
        appBar: AppBar(
        title: const Text('Courier Dashboard'),
        backgroundColor: const Color(0xFF4CAF50),
        foregroundColor: Colors.white,
        actions: [
          const NotificationBell(),
          PopupMenuButton(
            icon: const Icon(Icons.more_vert),
            onSelected: (value) {
              if (value == 'logout') {
                context.read<UnifiedAuthBloc>().add(SignOutRequested());
              }
            },
            itemBuilder: (context) => <PopupMenuEntry>[
              const PopupMenuItem(
                value: 'profile',
                child: ListTile(
                  leading: Icon(Icons.person),
                  title: Text('Profile'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              const PopupMenuItem(
                value: 'settings',
                child: ListTile(
                  leading: Icon(Icons.settings),
                  title: Text('Settings'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem(
                value: 'logout',
                child: ListTile(
                  leading: Icon(Icons.logout, color: Colors.red),
                  title: Text('Sign Out', style: TextStyle(color: Colors.red)),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ],
          ),
        ],
      ),
      body: BlocBuilder<UnifiedAuthBloc, UnifiedAuthState>(
        builder: (context, state) {
          if (state is Authenticated) {
            return SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Welcome Card
                  Card(
                    elevation: 2,
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(
                                Icons.delivery_dining,
                                size: 40,
                                color: Color(0xFF4CAF50),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Ready to deliver!',
                                      style: TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.bold,
                                        color: Colors.grey[800],
                                      ),
                                    ),
                                    Text(
                                      state.userData['fullName'] ?? 'Courier',
                                      style: const TextStyle(
                                        fontSize: 16,
                                        color: Color(0xFF4CAF50),
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              // Availability Toggle
                              Switch(
                                value: state.userData['isAvailable'] ?? false,
                                onChanged: (bool value) {
                                  // TODO: Implement availability toggle
                                },
                                activeThumbColor: const Color(0xFF4CAF50),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Icon(
                                Icons.motorcycle,
                                size: 16,
                                color: Colors.grey[600],
                              ),
                              const SizedBox(width: 4),
                              Text(
                                '${state.userData['vehicleType'] ?? 'Vehicle'} • ${state.userData['licensePlate'] ?? 'N/A'}',
                                style: TextStyle(
                                  color: Colors.grey[600],
                                  fontSize: 14,
                                ),
                              ),
                              const Spacer(),
                              const Icon(
                                Icons.star,
                                size: 16,
                                color: Colors.amber,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                '${(state.userData['rating'] ?? 0.0).toStringAsFixed(1)} (${state.userData['totalDeliveries'] ?? 0} deliveries)',
                                style: TextStyle(
                                  color: Colors.grey[600],
                                  fontSize: 14,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  
                  const SizedBox(height: 24),
                  
                  // Quick Actions
                  Text(
                    'Quick Actions',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: Colors.grey[800],
                    ),
                  ),
                  
                  const SizedBox(height: 16),
                  
                  BlocBuilder<DeliveryBloc, DeliveryState>(
                    builder: (context, deliveryState) {
                      // Extract active delivery from state
                      Delivery? activeDelivery;
                      if (deliveryState is ActiveDeliveryLoaded) {
                        activeDelivery = deliveryState.delivery;
                      }
                      final hasActiveDelivery = activeDelivery != null;

                      // Responsive grid: 4 cols on desktop/tablet (>=600px),
                      // 2 cols on mobile. Keeps cards from ballooning on wide
                      // screens where 2 cols creates huge empty cards.
                      final screenWidth = MediaQuery.of(context).size.width;
                      final int crossAxisCount = screenWidth >= 600 ? 4 : 2;
                      return GridView.count(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        crossAxisCount: crossAxisCount,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12,
                        childAspectRatio: 2.2,
                        children: [
                          _buildActionCard(
                            'Available Orders',
                            Icons.local_shipping,
                            Colors.blue,
                            () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (context) => const AvailableOrdersScreen(),
                                ),
                              );
                            },
                          ),
                          _buildActionCard(
                            hasActiveDelivery ? 'Active Delivery' : 'No Active Delivery',
                            hasActiveDelivery ? Icons.navigation : Icons.directions_off,
                            hasActiveDelivery ? Colors.orange : Colors.grey,
                            hasActiveDelivery
                              ? () {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (context) => ActiveDeliveryScreen(
                                        delivery: activeDelivery!,
                                      ),
                                    ),
                                  );
                                }
                              : () {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('No active delivery found'),
                                      backgroundColor: Colors.orange,
                                    ),
                                  );
                                },
                          ),
                          _buildActionCard(
                            'Scan QR Code',
                            Icons.qr_code_scanner,
                            hasActiveDelivery ? Colors.purple : Colors.grey,
                            hasActiveDelivery
                              ? () => _openQRScanner(activeDelivery!)
                              : () {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('No active delivery to scan for'),
                                      backgroundColor: Colors.orange,
                                    ),
                                  );
                                },
                          ),
                          _buildActionCard(
                            'View Earnings',
                            Icons.attach_money,
                            Colors.green,
                            () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Your detailed earnings are shown below'),
                                  backgroundColor: Color(0xFF4CAF50),
                                ),
                              );
                            },
                          ),
                        ],
                      );
                    },
                  ),
                  
                  const SizedBox(height: 32),
                  
                  // Courier Wallet
                  const CourierWalletWidget(),
                  
                  const SizedBox(height: 32),
                  
                  // Recent Deliveries
                  Text(
                    'Recent Deliveries',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: Colors.grey[800],
                    ),
                  ),
                  
                  const SizedBox(height: 16),
                  
                  _CourierDeliveryHistory(
                    courierId: FirebaseAuth.instance.currentUser?.uid ?? '',
                  ),
                ],
              ),
            );
          }
          return const Center(child: CircularProgressIndicator());
        },
      ),
    ),
    ); // Close PopScope
  }

  void _openQRScanner(Delivery activeDelivery) {
    // Determine which type of scan based on delivery status
    String scanType;
    if (activeDelivery.status == DeliveryStatus.accepted || activeDelivery.status == DeliveryStatus.enRoute) {
      scanType = 'pickup';
    } else if (activeDelivery.status == DeliveryStatus.pickedUp) {
      scanType = 'delivery';
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Cannot scan QR at this delivery stage'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => QRScannerScreen(
          delivery: activeDelivery,
          scanType: scanType,
        ),
      ),
    );
  }

  Widget _buildActionCard(
    String title,
    IconData icon,
    Color color,
    VoidCallback onTap,
  ) {
    return Card(
      elevation: 1.5,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(10.0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 32,
                color: color,
              ),
              const SizedBox(width: 10),
              Flexible(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
/// Shows the 10 most recent deliveries handled by the current courier.
/// Reads `deliveries` filtered by courierId, newest first.
class _CourierDeliveryHistory extends StatelessWidget {
  final String courierId;
  const _CourierDeliveryHistory({required this.courierId});

  @override
  Widget build(BuildContext context) {
    if (courierId.isEmpty) return const SizedBox.shrink();

    final query = FirebaseFirestore.instance
        .collection('deliveries')
        .where('courierId', isEqualTo: courierId)
        .orderBy('createdAt', descending: true)
        .limit(10);

    return StreamBuilder<QuerySnapshot>(
      stream: query.snapshots(),
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Card(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            ),
          );
        }
        if (snap.hasError) {
          return Card(
            color: Colors.red.shade50,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text('Error: ${snap.error}',
                  style: TextStyle(color: Colors.red.shade700)),
            ),
          );
        }
        final docs = snap.data?.docs ?? const [];
        if (docs.isEmpty) {
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  const Icon(Icons.history, size: 48, color: Colors.grey),
                  const SizedBox(height: 12),
                  Text('No recent deliveries',
                      style: TextStyle(fontSize: 16, color: Colors.grey[600])),
                  const SizedBox(height: 8),
                  Text('Your delivery history will appear here',
                      style: TextStyle(fontSize: 14, color: Colors.grey[500])),
                ],
              ),
            ),
          );
        }
        return Card(
          child: Column(
            children: [
              for (var i = 0; i < docs.length; i++) ...[
                _DeliveryRow(
                    data: docs[i].data() as Map<String, dynamic>),
                if (i < docs.length - 1) const Divider(height: 1),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _DeliveryRow extends StatelessWidget {
  final Map<String, dynamic> data;
  const _DeliveryRow({required this.data});

  Color _statusColor(String s) {
    switch (s) {
      case 'delivered':
      case 'completed':
        return Colors.green;
      case 'in_transit':
      case 'picked_up':
        return Colors.indigo;
      case 'accepted':
        return Colors.blue;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = (data['status'] as String?) ?? 'pending';
    final fromName = (data['fromPharmacyName'] as String?) ?? '—';
    final toName = (data['toPharmacyName'] as String?) ?? '—';
    final items = data['items'] as List? ?? const [];
    final medicineName = items.isNotEmpty
        ? (items[0]['medicineName'] as String? ?? '—')
        : '—';
    final courierFee = data['courierFee'] ?? 0;
    final currency = (data['currency'] as String?) ?? '';
    final createdAt = (data['createdAt'] as Timestamp?)?.toDate();

    return ListTile(
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: _statusColor(status).withOpacity(0.15),
          shape: BoxShape.circle,
        ),
        child: Icon(Icons.local_shipping,
            color: _statusColor(status), size: 20),
      ),
      title: Text(
        medicineName,
        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$fromName → $toName',
              style: const TextStyle(fontSize: 12)),
          if (createdAt != null)
            Text(DateFormat('MMM d, HH:mm').format(createdAt),
                style: TextStyle(fontSize: 11, color: Colors.grey[600])),
        ],
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text('$courierFee $currency',
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                  color: Colors.green.shade700)),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: _statusColor(status).withOpacity(0.1),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              status,
              style: TextStyle(
                  fontSize: 10, color: _statusColor(status)),
            ),
          ),
        ],
      ),
    );
  }
}
