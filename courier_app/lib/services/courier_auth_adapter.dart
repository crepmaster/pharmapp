import 'package:firebase_auth/firebase_auth.dart';
import 'package:pharmapp_shared/pharmapp_shared.dart';

/// Courier-specific authentication adapter using unified service
/// This adapter bridges the unified auth service with the existing courier app interface
class CourierAuthAdapter {
  
  /// Sign up a new courier user
  static Future<UserCredential?> signUp({
    required String email,
    required String password,
    required String fullName,
    required String phoneNumber,
    required String vehicleType,
    required String licensePlate,
    String operatingCity = '',
  }) async {
    final profileData = <String, dynamic>{
      'fullName': fullName,
      'phoneNumber': phoneNumber,
      'vehicleType': vehicleType,
      'licensePlate': licensePlate,
      'operatingCity': operatingCity,
      'serviceZones': <String>[],
      'isAvailable': false,
      'rating': 0.0,
      'totalDeliveries': 0,
    };

    return await UnifiedAuthService.signUp(
      email: email,
      password: password,
      userType: UserType.courier,
      profileData: profileData,
    );
  }

  /// Sign in a courier user
  static Future<UserCredential?> signIn({
    required String email,
    required String password,
  }) async {
    final profile = await UnifiedAuthService.signIn(
      email: email,
      password: password,
      expectedUserType: UserType.courier,
    );
    
    // If signIn was successful, Firebase Auth should have the UserCredential
    // The unified service handles the actual Firebase authentication
    if (profile != null && _auth.currentUser != null) {
      // Return a mock UserCredential - the actual Firebase UserCredential is handled internally
      return MockUserCredential(_auth.currentUser!);
    }
    
    return null;
  }

  /// Get current courier profile data in the format expected by CourierUser.fromMap()
  static Future<Map<String, dynamic>?> getCourierData() async {
    final profile = await UnifiedAuthService.getCurrentUserProfile();
    if (profile != null && profile.user.role == UserRole.courier) {
      // Convert the unified profile back to the format expected by CourierUser
      return {
        'email': profile.user.email,
        'fullName': profile.roleData['fullName'],
        'phoneNumber': profile.roleData['phoneNumber'],
        'vehicleType': profile.roleData['vehicleType'],
        'licensePlate': profile.roleData['licensePlate'],
        'operatingCity': profile.roleData['operatingCity'],
        'serviceZones': profile.roleData['serviceZones'],
        'isActive': profile.roleData['isActive'] ?? true,
        'isAvailable': profile.roleData['isAvailable'] ?? false,
        'rating': profile.roleData['rating'] ?? 0.0,
        'totalDeliveries': profile.roleData['totalDeliveries'] ?? 0,
        'createdAt': profile.user.createdAt,
        'role': 'courier',
      };
    }
    return null;
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