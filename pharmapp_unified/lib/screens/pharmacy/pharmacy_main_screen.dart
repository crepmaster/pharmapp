import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../blocs/unified_auth_bloc.dart';
import '../../navigation/role_router.dart';

class PharmacyMainScreen extends StatelessWidget {
  final Map<String, dynamic> userData;

  const PharmacyMainScreen({
    super.key,
    required this.userData,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const Icon(Icons.local_pharmacy),
            const SizedBox(width: 8),
            Text(userData['pharmacyName'] ?? 'Pharmacy Dashboard'),
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
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.check_circle_outline,
                size: 100,
                color: Colors.green,
              ),
              const SizedBox(height: 24),
              const Text(
                'Registration Successful!',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              Text(
                'Welcome, ${userData['pharmacyName'] ?? 'Pharmacy'}!',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w500),
              ),
              const SizedBox(height: 32),
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.blue.shade200),
                ),
                child: Column(
                  children: [
                    const Icon(Icons.info_outline, color: Colors.blue, size: 48),
                    const SizedBox(height: 16),
                    const Text(
                      'Please use the dedicated Pharmacy App',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'The full pharmacy dashboard is available in the dedicated pharmacy application.',
                      style: TextStyle(fontSize: 14, color: Colors.grey),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 20),
                    Container(
                      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.blue.shade300),
                      ),
                      child: const Text(
                        '🔗 http://localhost:8084',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Colors.blue,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'You can now sign in using your registered email and password.',
                      style: TextStyle(fontSize: 13, color: Colors.grey),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
