import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';

import '../blocs/admin_auth_bloc.dart';
import '../models/system_config.dart';
import '../services/system_config_service.dart';
import 'system_config/plans_tab.dart';

/// V2D — Scoped Finance screen for admins with `view_financials`.
///
/// Wraps [RevenueTreasuryTab] with a config stream and the admin's scope.
/// super_admin gets global view; scoped admins see only their countries.
/// Platform Ledger is hidden for non-super_admin (V2D decision).
class FinancialReportsScreen extends StatelessWidget {
  final List<String> countryScopes;
  final bool isSuperAdmin;

  const FinancialReportsScreen({
    super.key,
    this.countryScopes = const [],
    this.isSuperAdmin = false,
  });

  @override
  Widget build(BuildContext context) {
    // Get adminUserId from bloc.
    final authState = context.read<AdminAuthBloc>().state;
    final adminUserId = authState is AdminAuthAuthenticated
        ? authState.adminUser.uid
        : '';

    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Finance',
            style: GoogleFonts.inter(
              fontSize: 24,
              fontWeight: FontWeight.bold,
            ),
          ),
          if (!isSuperAdmin && countryScopes.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'Scoped to: ${countryScopes.join(', ')}',
                style: GoogleFonts.inter(
                  fontSize: 13,
                  color: Colors.grey.shade600,
                ),
              ),
            ),
          const SizedBox(height: 16),
          Expanded(
            child: StreamBuilder<SystemConfigV1?>(
              stream: SystemConfigService.configStream(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                final config = snapshot.data;
                if (config == null) {
                  return Center(
                    child: Text(
                      'System configuration not available.',
                      style: GoogleFonts.inter(color: Colors.grey),
                    ),
                  );
                }

                return RevenueTreasuryTab(
                  config: config,
                  adminUserId: adminUserId,
                  countryScopes: countryScopes,
                  isSuperAdmin: isSuperAdmin,
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
