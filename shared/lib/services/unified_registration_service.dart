import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'unified_wallet_service.dart';

/// Unified Registration Service for all PharmApp applications
/// Handles registration flow and automatic navigation consistently
class UnifiedRegistrationService {
  
  /// Handles successful registration with unified navigation and wallet initialization
  /// Works for pharmacy, courier, and admin apps
  static Future<void> handleRegistrationSuccess({
    required BuildContext context,
    required String userType, // 'pharmacy', 'courier', 'admin'
    required String userId,
    required String userName,
    required Widget dashboardScreen,
    Duration delay = const Duration(seconds: 2),
  }) async {
    // Initialize wallet for new user
    await UnifiedWalletService.initializeWalletOnRegistration(
      userId: userId,
      userType: userType,
    );
    
    // Show success message with user type specific styling
    final color = _getSuccessColor(userType);
    
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Welcome $userName! $userType account created successfully.\n💰 Your wallet is ready!'),
        backgroundColor: color,
        duration: delay,
      ),
    );
    
    // Navigate to dashboard after delay
    Future.delayed(delay, () {
      if (context.mounted) {
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(builder: (context) => dashboardScreen),
          (route) => false,
        );
      }
    });
  }
  
  /// Get app-specific success color
  static Color _getSuccessColor(String userType) {
    switch (userType) {
      case 'pharmacy':
        return const Color(0xFF1976D2); // Blue
      case 'courier':
        return const Color(0xFF4CAF50); // Green
      case 'admin':
        return const Color(0xFF9C27B0); // Purple
      default:
        return Colors.green;
    }
  }
  
  /// Register with unified success handling for Pharmacy
  static void registerPharmacy({
    required BuildContext context,
    required String email,
    required String password,
    required String pharmacyName,
    required String phoneNumber,
    required String address,
    dynamic locationData,
  }) {
    // Get pharmacy auth bloc and dashboard screen
    context.read<dynamic>().add(
      // This would be the specific registration event
      RegisterEvent(
        email: email,
        password: password,
        pharmacyName: pharmacyName,
        phoneNumber: phoneNumber,
        address: address,
        locationData: locationData,
      ),
    );
  }
  
  /// Register with unified success handling for Courier
  static void registerCourier({
    required BuildContext context,
    required String email,
    required String password,
    required String fullName,
    required String phoneNumber,
    required String vehicleType,
    required String licensePlate,
  }) {
    // Get courier auth bloc
    context.read<dynamic>().add(
      // This would be the specific registration event
      RegisterEvent(
        email: email,
        password: password,
        fullName: fullName,
        phoneNumber: phoneNumber,
        vehicleType: vehicleType,
        licensePlate: licensePlate,
      ),
    );
  }
}

/// Generic registration event that can be extended
abstract class RegisterEvent {
  const RegisterEvent();
}