import 'package:flutter/material.dart';
import 'package:pharmapp_shared/services/unified_auth_service.dart';
import '../screens/pharmacy/pharmacy_main_screen.dart';
import '../screens/courier/courier_main_screen.dart';
import '../screens/admin/admin_main_screen.dart';

/// Role-based router that displays appropriate dashboard based on user type
class RoleRouter extends StatelessWidget {
  final UserType userType;
  final Map<String, dynamic> userData;

  const RoleRouter({
    super.key,
    required this.userType,
    required this.userData,
  });

  @override
  Widget build(BuildContext context) {
    switch (userType) {
      case UserType.pharmacy:
        return PharmacyMainScreen(userData: userData);

      case UserType.courier:
        return CourierMainScreen(userData: userData);

      case UserType.admin:
        return AdminMainScreen(userData: userData);
    }

    // Fallback for unexpected role (should never happen)
    return Scaffold(
          appBar: AppBar(
            title: const Text('Unknown User Type'),
          ),
          body: Center(
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
                  'Unknown user type: ${userType.toString()}',
                  style: const TextStyle(fontSize: 18),
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () {
                    // Sign out and return to login
                    UnifiedAuthService.signOut();
                  },
                  child: const Text('Sign Out'),
                ),
              ],
            ),
          ),
        );
  }
}

/// Role switcher widget for users with multiple roles
class RoleSwitcher extends StatelessWidget {
  final List<UserType> availableRoles;
  final UserType currentRole;
  final Function(UserType) onRoleSelected;

  const RoleSwitcher({
    super.key,
    required this.availableRoles,
    required this.currentRole,
    required this.onRoleSelected,
  });

  @override
  Widget build(BuildContext context) {
    if (availableRoles.length <= 1) {
      return const SizedBox.shrink();
    }

    return PopupMenuButton<UserType>(
      icon: const Icon(Icons.swap_horiz),
      tooltip: 'Switch Role',
      onSelected: onRoleSelected,
      itemBuilder: (context) => availableRoles
          .map(
            (role) => PopupMenuItem<UserType>(
              value: role,
              enabled: role != currentRole,
              child: Row(
                children: [
                  Icon(_getRoleIcon(role)),
                  const SizedBox(width: 12),
                  Text(_getRoleDisplayName(role)),
                  if (role == currentRole)
                    const Padding(
                      padding: EdgeInsets.only(left: 8),
                      child: Icon(Icons.check, size: 16),
                    ),
                ],
              ),
            ),
          )
          .toList(),
    );
  }

  IconData _getRoleIcon(UserType role) {
    switch (role) {
      case UserType.pharmacy:
        return Icons.local_pharmacy;
      case UserType.courier:
        return Icons.delivery_dining;
      case UserType.admin:
        return Icons.admin_panel_settings;
    }
  }

  String _getRoleDisplayName(UserType role) {
    switch (role) {
      case UserType.pharmacy:
        return 'Pharmacy Mode';
      case UserType.courier:
        return 'Courier Mode';
      case UserType.admin:
        return 'Admin Mode';
    }
  }
}
