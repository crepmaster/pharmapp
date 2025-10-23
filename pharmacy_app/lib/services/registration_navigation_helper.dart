import 'package:flutter/material.dart';
import '../screens/main/dashboard_screen.dart';

/// Navigation helper for successful registration
/// Handles success message and automatic dashboard redirect
class RegistrationNavigationHelper {
  
  /// Shows success message and navigates to dashboard
  /// Used by registration screens to provide consistent user experience
  static void handleSuccessfulRegistration({
    required BuildContext context,
    required String userName,
    Color? successColor,
    Duration delay = const Duration(seconds: 2),
  }) {
    // Show success message
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Welcome $userName! Account created successfully.'),
        backgroundColor: successColor ?? const Color(0xFF1976D2),
        duration: delay,
      ),
    );

    // Navigate to dashboard IMMEDIATELY (don't wait for delay)
    // The SnackBar will still be visible on the dashboard
    if (context.mounted) {
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (context) => const DashboardScreen()),
        (route) => false,
      );
    }
  }
}