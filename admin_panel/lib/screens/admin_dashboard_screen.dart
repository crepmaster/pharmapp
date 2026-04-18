import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../blocs/admin_auth_bloc.dart';
import '../models/admin_user.dart';
import 'pharmacy_management_screen.dart';
import 'courier_management_screen.dart';
import 'city_management_screen.dart';
import 'subscription_management_screen.dart';
import 'financial_reports_screen.dart';
import 'system_config/system_config_screen.dart';
import '../widgets/analytics_by_city_section.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  int _selectedIndex = 0;

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
                      'NoWasteMed Admin',
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
          body: _AdminDashboardBody(
            adminUser: adminUser,
            selectedIndex: _selectedIndex,
            onDestinationSelected: (index) =>
                setState(() => _selectedIndex = index),
          ),
        );
      },
    );
  }
}

/// Builds the navigation rail and screen list dynamically based on admin role
/// and permissions. Scoped admins see only permitted surfaces.
class _AdminDashboardBody extends StatelessWidget {
  final AdminUser adminUser;
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;

  const _AdminDashboardBody({
    required this.adminUser,
    required this.selectedIndex,
    required this.onDestinationSelected,
  });

  @override
  Widget build(BuildContext context) {
    final entries = _buildEntries();
    final clampedIndex =
        selectedIndex < entries.length ? selectedIndex : 0;

    return Row(
      children: [
        NavigationRail(
          selectedIndex: clampedIndex,
          onDestinationSelected: onDestinationSelected,
          labelType: NavigationRailLabelType.all,
          backgroundColor: Colors.grey.shade50,
          destinations: entries
              .map((e) => NavigationRailDestination(
                    icon: Icon(e.icon),
                    selectedIcon: Icon(e.icon),
                    label: Text(e.label),
                  ))
              .toList(),
        ),
        const VerticalDivider(thickness: 1, width: 1),
        Expanded(child: entries[clampedIndex].screen),
      ],
    );
  }

  List<_NavEntry> _buildEntries() {
    final entries = <_NavEntry>[
      _NavEntry(
        icon: Icons.dashboard,
        label: 'Dashboard',
        screen: DashboardHomeScreen(
          countryScopes: adminUser.countryScopes,
          isSuperAdmin: adminUser.isSuperAdmin,
        ),
      ),
    ];

    if (adminUser.canManagePharmacies) {
      entries.add(_NavEntry(
        icon: Icons.local_pharmacy,
        label: 'Pharmacies',
        screen: PharmacyManagementScreen(
          countryScopes: adminUser.countryScopes,
          isSuperAdmin: adminUser.isSuperAdmin,
        ),
      ));

      // V2B: scoped admins with actual country scopes get a dedicated Cities
      // surface. super_admin manages cities via System Config instead.
      // An admin without countryScopes is misconfigured and sees nothing (V2A rule).
      if (!adminUser.isSuperAdmin && adminUser.countryScopes.isNotEmpty) {
        entries.add(_NavEntry(
          icon: Icons.location_city,
          label: 'Cities',
          screen: CityManagementScreen(
            allowedCountryCodes: adminUser.countryScopes,
          ),
        ));
      }

      // V2C: Couriers management — same gate as pharmacies.
      entries.add(_NavEntry(
        icon: Icons.delivery_dining,
        label: 'Couriers',
        screen: CourierManagementScreen(
          countryScopes: adminUser.countryScopes,
          isSuperAdmin: adminUser.isSuperAdmin,
        ),
      ));
    }

    // Subscriptions, Reports, System Config — super_admin or matching permission.
    // Scoped admins with manage_subscriptions could see subscriptions in the future;
    // for V2A, we keep the existing permission gates.
    if (adminUser.canManageSubscriptions) {
      entries.add(const _NavEntry(
        icon: Icons.subscriptions,
        label: 'Subscriptions',
        screen: SubscriptionManagementScreen(),
      ));
    }

    // V2D: Finance surface — super_admin gets global, scoped admins see
    // only their countries. Non-super_admin without scopes sees nothing.
    if (adminUser.canViewFinancials) {
      if (adminUser.isSuperAdmin || adminUser.countryScopes.isNotEmpty) {
        entries.add(_NavEntry(
          icon: Icons.analytics,
          label: 'Finance',
          screen: FinancialReportsScreen(
            countryScopes: adminUser.countryScopes,
            isSuperAdmin: adminUser.isSuperAdmin,
          ),
        ));
      }
    }

    if (adminUser.isSuperAdmin) {
      entries.add(const _NavEntry(
        icon: Icons.settings,
        label: 'System Config',
        screen: SystemConfigScreen(),
      ));
    }

    return entries;
  }
}

class _NavEntry {
  final IconData icon;
  final String label;
  final Widget screen;

  const _NavEntry({
    required this.icon,
    required this.label,
    required this.screen,
  });
}

class DashboardHomeScreen extends StatefulWidget {
  final List<String> countryScopes;
  final bool isSuperAdmin;

  const DashboardHomeScreen({
    super.key,
    this.countryScopes = const [],
    this.isSuperAdmin = false,
  });

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
      
      // Get pharmacies — scoped unless super_admin.
      Query<Map<String, dynamic>> query =
          firestore.collection('pharmacies');
      if (!widget.isSuperAdmin && widget.countryScopes.isNotEmpty) {
        query = query.where('countryCode',
            whereIn: widget.countryScopes);
      } else if (!widget.isSuperAdmin && widget.countryScopes.isEmpty) {
        // Misconfigured admin — show zero stats.
        if (mounted) {
          setState(() => isLoading = false);
        }
        return;
      }
      final pharmaciesSnapshot = await query.get();
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
    return SingleChildScrollView(
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
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 4,
            crossAxisSpacing: 16,
            mainAxisSpacing: 16,
            childAspectRatio: 1.4,
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
          const SizedBox(height: 32),

          // Country × City statistics section
          _AnalyticsLoader(
            countryScopes: widget.countryScopes,
            isSuperAdmin: widget.isSuperAdmin,
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

/// Fetches country and city display-name lookups from system_config once,
/// then renders the analytics section with those names.
class _AnalyticsLoader extends StatefulWidget {
  final List<String> countryScopes;
  final bool isSuperAdmin;

  const _AnalyticsLoader({
    required this.countryScopes,
    required this.isSuperAdmin,
  });

  @override
  State<_AnalyticsLoader> createState() => _AnalyticsLoaderState();
}

class _AnalyticsLoaderState extends State<_AnalyticsLoader> {
  Map<String, String> _countryNames = {};
  Map<String, Map<String, String>> _cityNames = {};
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _loadNames();
  }

  Future<void> _loadNames() async {
    try {
      final doc = await FirebaseFirestore.instance
          .collection('system_config')
          .doc('main')
          .get();
      if (!doc.exists) {
        if (mounted) setState(() => _ready = true);
        return;
      }
      final data = doc.data()!;
      final countries =
          (data['countries'] as Map<String, dynamic>?) ?? {};
      final citiesByCountry =
          (data['citiesByCountry'] as Map<String, dynamic>?) ?? {};

      final cNames = <String, String>{};
      countries.forEach((code, info) {
        if (info is Map) {
          cNames[code] = (info['name'] as String?) ?? code;
        }
      });

      final cityNames = <String, Map<String, String>>{};
      citiesByCountry.forEach((countryCode, cities) {
        if (cities is Map) {
          final map = <String, String>{};
          cities.forEach((cityCode, info) {
            if (info is Map) {
              map[cityCode] = (info['name'] as String?) ?? cityCode;
            }
          });
          cityNames[countryCode] = map;
        }
      });

      if (!mounted) return;
      setState(() {
        _countryNames = cNames;
        _cityNames = cityNames;
        _ready = true;
      });
    } catch (_) {
      if (mounted) setState(() => _ready = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    return AnalyticsByCitySection(
      countryScopes: widget.countryScopes,
      isSuperAdmin: widget.isSuperAdmin,
      countryNames: _countryNames,
      cityNames: _cityNames,
    );
  }
}