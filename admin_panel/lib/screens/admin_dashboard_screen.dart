import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../blocs/admin_auth_bloc.dart';
import 'pharmacy_management_screen.dart';
import 'subscription_management_screen.dart';
import 'financial_reports_screen.dart';
import 'system_config_screen.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  int _selectedIndex = 0;
  
  final List<Widget> _screens = [
    const DashboardHomeScreen(),
    const PharmacyManagementScreen(),
    const SubscriptionManagementScreen(),
    const FinancialReportsScreen(),
    const SystemConfigScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<AdminAuthBloc, AdminAuthState>(
      listener: (context, state) {
        if (state is AdminAuthUnauthenticated || state is AdminAuthError) {
          // Navigation will be handled by the main app
        }
      },
      builder: (context, state) {
        if (state is! AdminAuthAuthenticated) {
          return const Scaffold(
            body: Center(
              child: CircularProgressIndicator(),
            ),
          );
        }

        final adminUser = state.adminUser;

        return Scaffold(
          appBar: AppBar(
            title: Row(
              children: [
                Icon(
                  Icons.admin_panel_settings,
                  color: Colors.blue.shade600,
                ),
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'MediExchange Admin',
                      style: GoogleFonts.inter(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      adminUser.roleDisplayName,
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            actions: [
              // Admin info and logout
              PopupMenuButton<String>(
                icon: CircleAvatar(
                  backgroundColor: Colors.blue.shade100,
                  child: Text(
                    adminUser.displayName.isNotEmpty
                        ? adminUser.displayName[0].toUpperCase()
                        : adminUser.email[0].toUpperCase(),
                    style: GoogleFonts.inter(
                      fontWeight: FontWeight.bold,
                      color: Colors.blue.shade700,
                    ),
                  ),
                ),
                itemBuilder: (context) => [
                  PopupMenuItem(
                    enabled: false,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          adminUser.displayName,
                          style: GoogleFonts.inter(
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          adminUser.email,
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            color: Colors.grey.shade600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const PopupMenuDivider(),
                  const PopupMenuItem(
                    value: 'logout',
                    child: Row(
                      children: [
                        Icon(Icons.logout, size: 18),
                        SizedBox(width: 8),
                        Text('Sign Out'),
                      ],
                    ),
                  ),
                ],
                onSelected: (value) {
                  if (value == 'logout') {
                    context.read<AdminAuthBloc>().add(AdminAuthLogoutRequested());
                  }
                },
              ),
              const SizedBox(width: 16),
            ],
            backgroundColor: Colors.white,
            elevation: 2,
          ),
          body: Row(
            children: [
              // Sidebar navigation
              NavigationRail(
                selectedIndex: _selectedIndex,
                onDestinationSelected: (index) {
                  setState(() {
                    _selectedIndex = index;
                  });
                },
                labelType: NavigationRailLabelType.all,
                backgroundColor: Colors.grey.shade50,
                destinations: [
                  const NavigationRailDestination(
                    icon: Icon(Icons.dashboard),
                    selectedIcon: Icon(Icons.dashboard),
                    label: Text('Dashboard'),
                  ),
                  NavigationRailDestination(
                    icon: const Icon(Icons.local_pharmacy),
                    selectedIcon: const Icon(Icons.local_pharmacy),
                    label: const Text('Pharmacies'),
                    disabled: !adminUser.canManagePharmacies,
                  ),
                  NavigationRailDestination(
                    icon: const Icon(Icons.subscriptions),
                    selectedIcon: const Icon(Icons.subscriptions),
                    label: const Text('Subscriptions'),
                    disabled: !adminUser.canManageSubscriptions,
                  ),
                  NavigationRailDestination(
                    icon: const Icon(Icons.analytics),
                    selectedIcon: const Icon(Icons.analytics),
                    label: const Text('Reports'),
                    disabled: !adminUser.canViewFinancials,
                  ),
                  NavigationRailDestination(
                    icon: const Icon(Icons.settings),
                    selectedIcon: const Icon(Icons.settings),
                    label: const Text('System Config'),
                    disabled: !adminUser.isSuperAdmin,
                  ),
                ],
              ),
              
              // Vertical divider
              const VerticalDivider(thickness: 1, width: 1),
              
              // Main content
              Expanded(
                child: _screens[_selectedIndex],
              ),
            ],
          ),
        );
      },
    );
  }
}

class DashboardHomeScreen extends StatefulWidget {
  const DashboardHomeScreen({super.key});

  @override
  State<DashboardHomeScreen> createState() => _DashboardHomeScreenState();
}

class _DashboardHomeScreenState extends State<DashboardHomeScreen> {
  int totalPharmacies = 0;
  int activeSubscriptions = 0;
  int pendingApprovals = 0;
  double monthlyRevenue = 0.0;
  bool isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadDashboardData();
  }

  Future<void> _loadDashboardData() async {
    // Loading dashboard data
    try {
      final firestore = FirebaseFirestore.instance;
      
      // Get total pharmacies
      // Fetching pharmacies data
      final pharmaciesSnapshot = await firestore.collection('pharmacies').get();
      final pharmacies = pharmaciesSnapshot.docs;
      // Pharmacies data retrieved
      
      int activeCount = 0;
      int pendingCount = 0;
      
      for (var doc in pharmacies) {
        final data = doc.data();
        final subscriptionStatus = data['subscriptionStatus'] as String?;
        // Processing pharmacy subscription status
        
        if (subscriptionStatus == 'active') {
          activeCount++;
        } else if (subscriptionStatus == 'pendingPayment' || 
                   subscriptionStatus == 'pendingApproval') {
          pendingCount++;
        }
      }
      
      // Dashboard statistics calculated
      
      setState(() {
        totalPharmacies = pharmacies.length;
        activeSubscriptions = activeCount;
        pendingApprovals = pendingCount;
        monthlyRevenue = activeCount * 25.0; // Estimate based on average plan
        isLoading = false;
      });
      
      // Dashboard load completed
    } catch (e) {
      // Dashboard load error
      setState(() {
        isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'Dashboard Overview',
                style: GoogleFonts.inter(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const Spacer(),
              if (isLoading)
                const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                IconButton(
                  onPressed: _loadDashboardData,
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Refresh Data',
                ),
            ],
          ),
          const SizedBox(height: 24),
          
          // Quick stats cards
          Expanded(
            child: GridView.count(
              crossAxisCount: 4,
              crossAxisSpacing: 16,
              mainAxisSpacing: 16,
              children: [
                _buildStatCard(
                  title: 'Total Pharmacies',
                  value: isLoading ? '...' : totalPharmacies.toString(),
                  icon: Icons.local_pharmacy,
                  color: Colors.blue,
                ),
                _buildStatCard(
                  title: 'Active Subscriptions',
                  value: isLoading ? '...' : activeSubscriptions.toString(),
                  icon: Icons.subscriptions,
                  color: Colors.green,
                ),
                _buildStatCard(
                  title: 'Pending Approvals',
                  value: isLoading ? '...' : pendingApprovals.toString(),
                  icon: Icons.pending_actions,
                  color: Colors.orange,
                ),
                _buildStatCard(
                  title: 'Monthly Revenue',
                  value: isLoading ? '...' : '\$${monthlyRevenue.toStringAsFixed(0)}',
                  icon: Icons.attach_money,
                  color: Colors.purple,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatCard({
    required String title,
    required String value,
    required IconData icon,
    required Color color,
  }) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 32,
              color: color,
            ),
            const SizedBox(height: 8),
            Text(
              value,
              style: GoogleFonts.inter(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            Text(
              title,
              style: GoogleFonts.inter(
                fontSize: 14,
                color: Colors.grey.shade600,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}