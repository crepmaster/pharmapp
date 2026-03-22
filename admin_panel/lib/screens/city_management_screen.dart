import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../models/system_config.dart';
import '../services/system_config_service.dart';
import 'system_config/cities_tab.dart';

/// Standalone Cities management screen for scoped admins.
/// Wraps [CitiesTab] with a config stream and country scope filter.
class CityManagementScreen extends StatelessWidget {
  final List<String> allowedCountryCodes;

  const CityManagementScreen({
    super.key,
    this.allowedCountryCodes = const [],
  });

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<SystemConfigV1?>(
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

        return CitiesTab(
          config: config,
          onChanged: () {
            // Stream will auto-refresh via configStream()
          },
          allowedCountryCodes: allowedCountryCodes,
        );
      },
    );
  }
}
