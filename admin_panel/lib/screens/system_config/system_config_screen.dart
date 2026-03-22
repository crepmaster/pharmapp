import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../blocs/admin_auth_bloc.dart';
import '../../models/system_config.dart';
import '../../services/migration_service.dart';
import '../../services/system_config_service.dart';
import 'countries_tab.dart';
import 'cities_tab.dart';
import 'currencies_tab.dart';
import 'mobile_money_tab.dart';
import 'plans_tab.dart';

/// Shell screen that loads SystemConfigV1 and renders 5 tabs.
/// Lot 1 tabs: Countries, Cities, Currencies, Mobile Money.
/// Lot 4 tab: Revenue & Treasury — activated in Sprint 4A.
class SystemConfigScreen extends StatefulWidget {
  const SystemConfigScreen({super.key});

  @override
  State<SystemConfigScreen> createState() => _SystemConfigScreenState();
}

class _SystemConfigScreenState extends State<SystemConfigScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  SystemConfigV1? _config;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 5, vsync: this);
    _loadConfig();
  }

  Future<void> _loadConfig() async {
    setState(() => _isLoading = true);
    try {
      final config = await SystemConfigService.loadConfig();
      if (mounted) {
        setState(() {
          _config = config;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading config: $e')),
        );
      }
    }
  }

  Future<void> _runMigration() async {
    setState(() => _isLoading = true);
    final report = await MigrationService.migrateToV1();
    if (!mounted) return;
    setState(() => _isLoading = false);
    await showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(report.success ? 'Migration succeeded' : 'Migration result'),
        content: SingleChildScrollView(
          child: Text(report.toString()),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
    if (mounted) _loadConfig();
  }

  Future<void> _createEmptyConfig() async {
    final state = context.read<AdminAuthBloc>().state;
    if (state is! AdminAuthAuthenticated) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
              'Cannot create config: admin session not available. Please re-authenticate.'),
        ),
      );
      return;
    }

    final adminUid = state.adminUser.uid;
    setState(() => _isLoading = true);
    final ok = await SystemConfigService.initializeEmptyConfig(adminUid);
    if (!mounted) return;
    setState(() => _isLoading = false);

    if (ok) {
      _loadConfig();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
              'Could not create config — document may already exist. Try reloading.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('System Configuration'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Reload config',
            onPressed: _loadConfig,
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabs: const [
            Tab(icon: Icon(Icons.flag), text: 'Countries'),
            Tab(icon: Icon(Icons.location_city), text: 'Cities'),
            Tab(icon: Icon(Icons.attach_money), text: 'Currencies'),
            Tab(icon: Icon(Icons.phone_android), text: 'Mobile Money'),
            Tab(icon: Icon(Icons.account_balance), text: 'Revenue & Treasury'),
          ],
        ),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_config == null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.warning_amber, size: 64, color: Colors.orange),
            const SizedBox(height: 16),
            const Text(
              'No system configuration found.',
              style: TextStyle(fontSize: 18),
            ),
            const SizedBox(height: 8),
            const Text(
              'Choose an action below to initialize system_config/main.',
              style: TextStyle(color: Colors.grey),
            ),
            const SizedBox(height: 24),
            Wrap(
              spacing: 16,
              runSpacing: 12,
              alignment: WrapAlignment.center,
              children: [
                ElevatedButton.icon(
                  onPressed: _runMigration,
                  icon: const Icon(Icons.upgrade),
                  label: const Text('Run Migration'),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 24, vertical: 14),
                  ),
                ),
                OutlinedButton.icon(
                  onPressed: _createEmptyConfig,
                  icon: const Icon(Icons.add_circle_outline),
                  label: const Text('Create Empty Config'),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 24, vertical: 14),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            TextButton.icon(
              onPressed: _loadConfig,
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    // Read adminUserId from bloc — guaranteed non-null here (screen is behind auth).
    final authState = context.read<AdminAuthBloc>().state;
    final adminUserId = authState is AdminAuthAuthenticated
        ? authState.adminUser.uid
        : '';

    return TabBarView(
      controller: _tabController,
      children: [
        CountriesTab(config: _config!, onChanged: _loadConfig),
        CitiesTab(config: _config!, onChanged: _loadConfig),
        CurrenciesTab(config: _config!, onChanged: _loadConfig),
        MobileMoneyTab(config: _config!, onChanged: _loadConfig),
        RevenueTreasuryTab(config: _config!, adminUserId: adminUserId),
      ],
    );
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }
}
