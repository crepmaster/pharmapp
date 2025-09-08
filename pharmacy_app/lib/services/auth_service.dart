import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/location_data.dart';
import 'package:pharmapp_shared/models/payment_preferences.dart';

/// Unified Authentication Service for Pharmacy App
/// Calls the backend Firebase Functions instead of duplicating auth logic
/// Provides anti-orphan protection and consistent business rule enforcement
class AuthService {
  static final FirebaseAuth _auth = FirebaseAuth.instance;
  static const String _baseUrl = 'https://europe-west1-mediexchange.cloudfunctions.net';
  
  // Get current user
  static User? get currentUser => _auth.currentUser;
  static Stream<User?> get authStateChanges => _auth.authStateChanges();

  // Sign up pharmacy user using unified backend function
  // This eliminates code duplication and ensures server-side validation
  static Future<UserCredential?> signUp({
    required String email,
    required String password,
    required String pharmacyName,
    required String phoneNumber,
    required String address,
    PharmacyLocationData? locationData,
  }) async {
    try {
      // Starting pharmacy signup process

      // Prepare request data
      final requestData = {
        'email': email,
        'password': password,
        'pharmacyName': pharmacyName,
        'phoneNumber': phoneNumber,
        'address': address,
        if (locationData != null) 'locationData': locationData.toMap(),
      };

      // Call unified Firebase Function
      final response = await http.post(
        Uri.parse('$_baseUrl/createPharmacyUser'),
        headers: {
          'Content-Type': 'application/json',
        },
        body: json.encode(requestData),
      );

      if (response.statusCode == 200) {
        final responseData = json.decode(response.body);
        if (responseData['success'] == true) {
          // Firebase Function created the user successfully
          // Now sign in to get the UserCredential for the client
          final credential = await _auth.signInWithEmailAndPassword(
            email: email,
            password: password,
          );
          
          // Pharmacy signup successful
          return credential;
        } else {
          throw Exception(responseData['error'] ?? 'Unknown error occurred');
        }
      } else {
        // Handle HTTP errors
        final errorData = json.decode(response.body);
        final errorMessage = errorData['error'] ?? 'Server error occurred';
        throw Exception(errorMessage);
      }

    } catch (e) {
      // Pharmacy signup failed
      
      // Convert backend errors to user-friendly messages
      String userMessage = _handleError(e.toString());
      throw Exception(userMessage);
    }
  }

  // Sign up pharmacy user with payment preferences using unified backend function
  static Future<UserCredential?> signUpWithPaymentPreferences({
    required String email,
    required String password,
    required String pharmacyName,
    required String phoneNumber,
    required String address,
    PharmacyLocationData? locationData,
    required PaymentPreferences paymentPreferences,
  }) async {
    try {
      // Prepare request data with payment preferences
      final requestData = {
        'email': email,
        'password': password,
        'pharmacyName': pharmacyName,
        'phoneNumber': phoneNumber,
        'address': address,
        if (locationData != null) 'locationData': locationData.toMap(),
        // Only include payment preferences if they're properly set up
        if (paymentPreferences.isSetupComplete) 'paymentPreferences': paymentPreferences.toBackendMap(),
      };

      // Debug: Log the request data being sent
      print('🔍 DEBUG: Sending to backend: ${json.encode(requestData)}');
      
      // Call unified Firebase Function
      final response = await http.post(
        Uri.parse('$_baseUrl/createPharmacyUser'),
        headers: {
          'Content-Type': 'application/json',
        },
        body: json.encode(requestData),
      );

      // Debug: Log the response
      print('🔍 DEBUG: Backend response: ${response.statusCode} - ${response.body}');
      
      if (response.statusCode == 200) {
        final responseData = json.decode(response.body);
        
        if (responseData['success'] == true) {
          // User was created successfully by the Firebase Function
          return null; // Return null since we're using existing auth
        } else {
          // Handle specific backend errors
          final errorMessage = responseData['error'] ?? 'Failed to create pharmacy user';
          print('🚨 Backend error: $errorMessage');
          throw Exception(errorMessage);
        }
      } else {
        // Handle HTTP errors
        final errorData = json.decode(response.body);
        final errorMessage = errorData['error'] ?? 'Server error during registration';
        throw Exception(errorMessage);
      }

    } catch (e) {
      // Convert backend errors to user-friendly messages
      String userMessage = _handleError(e.toString());
      throw Exception(userMessage);
    }
  }

  // Sign in with email and password (unchanged - uses Firebase Auth directly)
  static Future<UserCredential?> signIn({
    required String email,
    required String password,
  }) async {
    try {
      // Starting signin process
      
      final credential = await _auth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );
      
      // Signin successful
      return credential;
    } on FirebaseAuthException catch (e) {
      // Firebase Auth Error occurred
      throw _handleAuthException(e);
    } catch (e) {
      // Unexpected signin error
      rethrow;
    }
  }

  // Sign out current user
  static Future<void> signOut() async {
    try {
      await _auth.signOut();
      // Pharmacy signed out successfully
    } catch (e) {
      // Sign out error occurred
      rethrow;
    }
  }

  // Send password reset email
  static Future<void> resetPassword(String email) async {
    try {
      await _auth.sendPasswordResetEmail(email: email);
      // Password reset email sent
    } on FirebaseAuthException catch (e) {
      // Password reset error occurred
      throw _handleAuthException(e);
    }
  }

  // Get pharmacy profile data with retry mechanism for registration flow
  static Future<Map<String, dynamic>?> getPharmacyData({int maxRetries = 3}) async {
    try {
      final user = _auth.currentUser;
      if (user == null) return null;

      // Retry mechanism to handle Firestore eventual consistency after user creation
      for (int attempt = 0; attempt < maxRetries; attempt++) {
        final doc = await FirebaseFirestore.instance
            .collection('pharmacies')
            .doc(user.uid)
            .get();
            
        if (doc.exists) {
          return doc.data();
        }
        
        // If document doesn't exist and we have retries left, wait and try again
        if (attempt < maxRetries - 1) {
          await Future.delayed(Duration(milliseconds: 500 * (attempt + 1))); // Progressive delay
        }
      }
      
      return null;
    } catch (e) {
      // Error fetching pharmacy profile
      return null;
    }
  }

  // Create pharmacy profile (now handled by Firebase Function)
  static Future<void> createPharmacyProfile({
    required String pharmacyName,
    required String phoneNumber,
    required String address,
    PharmacyLocationData? locationData,
  }) async {
    // This functionality is now handled by the unified Firebase Function
    // during the signUp process, so this method is no longer needed
    throw UnimplementedError(
      'Profile creation is now handled automatically by the unified signup process'
    );
  }

  // Update pharmacy profile (direct Firestore update for existing users)
  static Future<void> updatePharmacyProfile({
    required String pharmacyName,
    required String phoneNumber,
    required String address,
    PharmacyLocationData? locationData,
  }) async {
    try {
      final user = _auth.currentUser;
      if (user == null) throw Exception('User not authenticated');

      // Updating pharmacy profile

      final updateData = {
        'pharmacyName': pharmacyName,
        'phoneNumber': phoneNumber,
        'address': address,
        'updatedAt': FieldValue.serverTimestamp(),
      };

      // Add location data if provided
      if (locationData != null) {
        updateData['locationData'] = locationData.toMap();
      }

      // Update Firestore document
      await FirebaseFirestore.instance
          .collection('pharmacies')
          .doc(user.uid)
          .update(updateData);
          
      // Pharmacy profile updated successfully
    } catch (e) {
      // Error updating pharmacy profile
      rethrow;
    }
  }

  // MARK: - Helper Methods

  // Hash email for logging (privacy protection)
  static String _hashEmail(String email) {
    return email.hashCode.toRadixString(16).substring(0, 8);
  }

  // Handle backend API errors
  static String _handleError(String error) {
    // Convert technical errors to user-friendly messages
    if (error.contains('email-already-in-use') || error.contains('EMAIL_ALREADY_EXISTS')) {
      return 'An account with this email already exists.';
    } else if (error.contains('weak-password') || error.contains('WEAK_PASSWORD')) {
      return 'Password is too weak. Please choose a stronger password.';
    } else if (error.contains('invalid-email')) {
      return 'Please enter a valid email address.';
    } else if (error.contains('Missing required')) {
      return 'Please fill in all required fields.';
    } else if (error.contains('network') || error.contains('timeout')) {
      return 'Network error. Please check your internet connection.';
    } else {
      return 'Registration failed. Please try again.';
    }
  }

  // Handle Firebase Auth exceptions
  static String _handleAuthException(FirebaseAuthException e) {
    switch (e.code) {
      case 'user-not-found':
      case 'wrong-password':
      case 'invalid-credential':
        return 'Invalid email or password. Please check your credentials.';
      case 'user-disabled':
        return 'This account has been disabled. Please contact support.';
      case 'too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      case 'email-already-in-use':
        return 'An account with this email already exists.';
      case 'weak-password':
        return 'Password is too weak. Please choose a stronger password.';
      case 'invalid-email':
        return 'Please enter a valid email address.';
      case 'network-request-failed':
        return 'Network error. Please check your internet connection.';
      default:
        return 'Authentication failed. Please try again.';
    }
  }
}