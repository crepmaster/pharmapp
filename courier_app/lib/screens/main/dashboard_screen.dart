import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:pharmapp_unified/blocs/unified_auth_bloc.dart';
import '../../services/delivery_service.dart';
import '../../models/delivery.dart';
import '../deliveries/available_orders_screen.dart';
import '../deliveries/active_delivery_screen.dart';
import '../deliveries/qr_scanner_screen.dart';
import '../../widgets/courier_wallet_widget.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Courier Dashboard'),
        backgroundColor: const Color(0xFF4CAF50),
        foregroundColor: Colors.white,
        actions: [
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
                  
                  GridView.count(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisCount: 2,
                    crossAxisSpacing: 16,
                    mainAxisSpacing: 16,
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
                      StreamBuilder<Delivery?>(
                        stream: DeliveryService.getActiveDelivery(),
                        builder: (context, snapshot) {
                          final hasActiveDelivery = snapshot.hasData && snapshot.data != null;
                          return _buildActionCard(
                            hasActiveDelivery ? 'Active Delivery' : 'No Active Delivery',
                            hasActiveDelivery ? Icons.navigation : Icons.directions_off,
                            hasActiveDelivery ? Colors.orange : Colors.grey,
                            hasActiveDelivery 
                              ? () {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (context) => ActiveDeliveryScreen(
                                        delivery: snapshot.data!,
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
                          );
                        },
                      ),
                      StreamBuilder<Delivery?>(
                        stream: DeliveryService.getActiveDelivery(),
                        builder: (context, snapshot) {
                          final hasActiveDelivery = snapshot.hasData && snapshot.data != null;
                          return _buildActionCard(
                            'Scan QR Code',
                            Icons.qr_code_scanner,
                            hasActiveDelivery ? Colors.purple : Colors.grey,
                            hasActiveDelivery
                              ? () => _openQRScanner(snapshot.data!)
                              : () {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('No active delivery to scan for'),
                                      backgroundColor: Colors.orange,
                                    ),
                                  );
                                },
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
                  
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        children: [
                          const Icon(
                            Icons.history,
                            size: 48,
                            color: Colors.grey,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'No recent deliveries',
                            style: TextStyle(
                              fontSize: 16,
                              color: Colors.grey[600],
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Your delivery history will appear here',
                            style: TextStyle(
                              fontSize: 14,
                              color: Colors.grey[500],
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            );
          }
          return const Center(child: CircularProgressIndicator());
        },
      ),
    );
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
      elevation: 2,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 36,
                color: color,
              ),
              const SizedBox(height: 12),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}