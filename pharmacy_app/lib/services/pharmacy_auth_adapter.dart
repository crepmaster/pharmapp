import 'package:firebase_auth/firebase_auth.dart';
import 'package:pharmapp_shared/pharmapp_shared.dart';
import '../models/location_data.dart';

/// Pharmacy-specific authentication adapter using unified service
/// This adapter bridges the unified auth service with the existing pharmacy app interface
class PharmacyAuthAdapter {
  
  /// Sign up a new pharmacy user
  static Future<UserCredential?> signUp({
    required String email,
    required String password,
    required String pharmacyName,
    required String phoneNumber,
    required String address,
    PharmacyLocationData? locationData,
  }) async {
    final profileData = <String, dynamic>{
      'displayName': pharmacyName,
      'pharmacyName': pharmacyName,
      'phoneNumber': phoneNumber,
      'address': address,
    };

    // Add location data if provided
    if (locationData != null) {
      profileData['locationData'] = locationData.toMap();
    }

    return await UnifiedAuthService.signUp(
      email: email,
      password: password,
      userType: UserType.pharmacy,
      profileData: profileData,
    );
  }

  /// Sign in a pharmacy user
  static Future<UserCredential?> signIn({
    required String email,
    required String password,
  }) async {
    final profile = await UnifiedAuthService.signIn(
      email: email,
      password: password,
      expectedUserType: UserType.pharmacy,
    );
    
    // If signIn was successful, Firebase Auth should have the UserCredential
    // The unified service handles the actual Firebase authentication
    if (profile != null && _auth.currentUser != null) {
      // Return a mock UserCredential - the actual Firebase UserCredential is handled internally
      return MockUserCredential(_auth.currentUser!);
    }
    
    return null;
  }

  /// Get current pharmacy profile data in the format expected by PharmacyUser.fromMap()
  static Future<Map<String, dynamic>?> getPharmacyData() async {
    final profile = await UnifiedAuthService.getCurrentUserProfile();
    if (profile != null && profile.user.role == UserRole.pharmacy) {
      // Convert the unified profile back to the format expected by PharmacyUser
      return {
        'email': profile.user.email,
        'pharmacyName': profile.roleData['pharmacyName'],
        'phoneNumber': profile.roleData['phoneNumber'],
        'address': profile.roleData['address'],
        'locationData': profile.roleData['locationData'],
        'isActive': profile.roleData['isActive'] ?? true,
        'createdAt': profile.user.createdAt,
        'role': 'pharmacy',
        'subscriptionStatus': profile.roleData['subscriptionStatus'],
        'subscriptionPlan': profile.roleData['subscriptionPlan'],
        'subscriptionEndDate': profile.roleData['subscriptionEndDate'],
        'hasActiveSubscription': profile.roleData['hasActiveSubscription'] ?? false,
      };
    }
    return null;
  }
  
  /// Create pharmacy profile (for compatibility with existing code)
  static Future<void> createPharmacyProfile({
    required String pharmacyName,
    required String phoneNumber,
    required String address,
  }) async {
    // This would typically be handled during signup in the unified service
    // For backward compatibility, we'll update the existing profile
    await updatePharmacyProfile(
      pharmacyName: pharmacyName,
      phoneNumber: phoneNumber,
      address: address,
    );
  }
  
  /// Update pharmacy profile
  static Future<void> updatePharmacyProfile({
    String? pharmacyName,
    String? phoneNumber,
    String? address,
    PharmacyLocationData? locationData,
  }) async {
    // For now, this would need to be implemented in the unified service
    // As a placeholder, we'll just throw an exception
    throw UnimplementedError('Profile updates need to be implemented in UnifiedAuthService');
  }

  // Delegate all other methods to unified service
  static final FirebaseAuth _auth = FirebaseAuth.instance;
  
  static User? get currentUser => UnifiedAuthService.currentUser;
  static Stream<User?> get authStateChanges => UnifiedAuthService.authStateChanges;
  static Future<void> signOut() => UnifiedAuthService.signOut();
  static Future<void> resetPassword(String email) => UnifiedAuthService.resetPassword(email);
}

/// Simple UserCredential wrapper for compatibility
class MockUserCredential implements UserCredential {
  @override
  final User user;
  
  @override
  AdditionalUserInfo? additionalUserInfo;
  
  @override
  AuthCredential? credential;

  MockUserCredential(this.user);
}