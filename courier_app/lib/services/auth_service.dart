import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Unified Authentication Service for Courier App
/// Calls the backend Firebase Functions instead of duplicating auth logic
/// Provides anti-orphan protection and consistent business rule enforcement
class AuthService {
  static final FirebaseAuth _auth = FirebaseAuth.instance;
  static const String _baseUrl = 'https://europe-west1-mediexchange.cloudfunctions.net';

  /// Current user getter
  static User? get currentUser => _auth.currentUser;
  
  /// Authentication state stream
  static Stream<User?> get authStateChanges => _auth.authStateChanges();

  /// Sign up courier user using unified backend function
  /// This eliminates code duplication and ensures server-side validation
  static Future<UserCredential?> signUp({
    required String email,
    required String password,
    required String fullName,
    required String phoneNumber,
    required String vehicleType,
    required String licensePlate,
    String operatingCity = '',
  }) async {
    try {
      print('🚚 UnifiedAuth: Starting courier signup for ${_hashEmail(email)}');

      // Prepare request data
      final requestData = {
        'email': email,
        'password': password,
        'fullName': fullName,
        'phoneNumber': phoneNumber,
        'vehicleType': vehicleType,
        'licensePlate': licensePlate,
        'operatingCity': operatingCity,
      };

      // Call unified Firebase Function
      final response = await http.post(
        Uri.parse('$_baseUrl/createCourierUser'),
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
          
          print('✅ Unified courier signup successful - UID: ${credential.user?.uid}');
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
      print('❌ Unified courier signup failed: $e');
      
      // Convert backend errors to user-friendly messages
      String userMessage = _handleError(e.toString());
      throw Exception(userMessage);
    }
  }

  /// Sign in with email and password (unchanged - uses Firebase Auth directly)
  static Future<UserCredential?> signIn({
    required String email,
    required String password,
  }) async {
    try {
      print('🔐 UnifiedAuth: Starting signin for ${_hashEmail(email)}');
      
      final credential = await _auth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );
      
      print('✅ Signin successful - UID: ${credential.user?.uid}');
      return credential;
    } on FirebaseAuthException catch (e) {
      print('❌ Firebase Auth Error: ${e.code} - ${e.message}');
      throw _handleAuthException(e);
    } catch (e) {
      print('❌ Unexpected error in signin: $e');
      rethrow;
    }
  }

  /// Sign out current user
  static Future<void> signOut() async {
    try {
      await _auth.signOut();
      print('✅ Courier signed out successfully');
    } catch (e) {
      print('❌ Sign out error: $e');
      rethrow;
    }
  }

  /// Send password reset email
  static Future<void> resetPassword(String email) async {
    try {
      await _auth.sendPasswordResetEmail(email: email);
      print('✅ Password reset email sent to ${_hashEmail(email)}');
    } on FirebaseAuthException catch (e) {
      print('❌ Password reset error: ${e.code}');
      throw _handleAuthException(e);
    }
  }

  /// Get courier profile data (unchanged)
  static Future<Map<String, dynamic>?> getCourierData() async {
    try {
      final user = _auth.currentUser;
      if (user == null) return null;

      // This could also be moved to a Firebase Function in the future
      final doc = await FirebaseFirestore.instance
          .collection('couriers')
          .doc(user.uid)
          .get();
          
      if (doc.exists) {
        return doc.data();
      }
      return null;
    } catch (e) {
      print('❌ Error fetching courier profile: $e');
      return null;
    }
  }

  // MARK: - Helper Methods

  /// Hash email for logging (privacy protection)
  static String _hashEmail(String email) {
    return email.hashCode.toRadixString(16).substring(0, 8);
  }

  /// Handle backend API errors
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

  /// Handle Firebase Auth exceptions
  static String _handleAuthException(FirebaseAuthException e) {
    switch (e.code) {
      case 'user-not-found':
        return 'No account found with this email address.';
      case 'wrong-password':
        return 'Incorrect password. Please try again.';
      case 'invalid-credential':
        return 'Invalid email or password. Please try again.';
      case 'user-disabled':
        return 'This account has been disabled. Please contact support.';
      case 'too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      case 'operation-not-allowed':
        return 'Email/password authentication is not enabled.';
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