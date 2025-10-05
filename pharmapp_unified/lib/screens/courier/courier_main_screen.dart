import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../blocs/unified_auth_bloc.dart';
import '../../navigation/role_router.dart';

class CourierMainScreen extends StatelessWidget {
  final Map<String, dynamic> userData;

  const CourierMainScreen({
    super.key,
    required this.userData,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const Icon(Icons.delivery_dining),
            const SizedBox(width: 8),
            Text(userData['fullName'] ?? 'Courier Dashboard'),
          ],
        ),
        actions: [
          // Role switcher if user has multiple roles
          BlocBuilder<UnifiedAuthBloc, UnifiedAuthState>(
            builder: (context, state) {
              if (state is Authenticated && state.availableRoles.length > 1) {
                return RoleSwitcher(
                  availableRoles: state.availableRoles,
                  currentRole: state.userType,
                  onRoleSelected: (newRole) {
                    context.read<UnifiedAuthBloc>().add(SwitchRole(newRole));
                  },
                );
              }
              return const SizedBox.shrink();
            },
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () {
              context.read<UnifiedAuthBloc>().add(SignOutRequested());
            },
          ),
        ],
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.delivery_dining,
              size: 100,
              color: Colors.green,
            ),
            const SizedBox(height: 24),
            const Text(
              'Courier Dashboard',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            Text(
              'Welcome, ${userData['fullName'] ?? 'Courier'}!',
              style: const TextStyle(fontSize: 16),
            ),
            const SizedBox(height: 32),
            const Text(
              'Courier screens will be migrated here',
              style: TextStyle(color: Colors.grey),
            ),
          ],
        ),
      ),
    );
  }
}
