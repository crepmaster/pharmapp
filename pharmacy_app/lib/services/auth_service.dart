import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/location_data.dart';

class AuthService {
  static final FirebaseAuth _auth = FirebaseAuth.instance;
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // Get current user
  static User? get currentUser => _auth.currentUser;

  // Auth state stream
  static Stream<User?> get authStateChanges => _auth.authStateChanges();

  // Sign up with email and password
  static Future<UserCredential?> signUp({
    required String email,
    required String password,
    required String pharmacyName,
    required String phoneNumber,
    required String address,
    PharmacyLocationData? locationData,
  }) async {
    try {
      final credential = await _auth.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );

      // Create pharmacy profile in Firestore
      if (credential.user != null) {
        final data = {
          'email': email,
          'pharmacyName': pharmacyName,
          'phoneNumber': phoneNumber,
          'address': address,
          'role': 'pharmacy',
          'createdAt': FieldValue.serverTimestamp(),
          'isActive': true,
        };

        // Add location data if provided
        if (locationData != null) {
          data['locationData'] = locationData.toMap();
        }

        await _firestore.collection('pharmacies').doc(credential.user!.uid).set(data);
      }

      return credential;
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  // Sign in with email and password
  static Future<UserCredential?> signIn({
    required String email,
    required String password,
  }) async {
    try {
      // Attempting Firebase authentication
      final result = await _auth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );
      // Firebase sign-in completed successfully
      return result;
    } on FirebaseAuthException catch (e) {
      // Firebase authentication error occurred
      throw _handleAuthException(e);
    } catch (e) {
      // Unexpected authentication error
      rethrow;
    }
  }

  // Sign out
  static Future<void> signOut() async {
    await _auth.signOut();
  }

  // Reset password
  static Future<void> resetPassword(String email) async {
    try {
      await _auth.sendPasswordResetEmail(email: email);
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  // Create pharmacy profile for existing Firebase users
  static Future<void> createPharmacyProfile({
    required String email,
    required String pharmacyName,
    required String phoneNumber,
    required String address,
    PharmacyLocationData? locationData,
  }) async {
    if (currentUser == null) {
      throw 'No authenticated user found';
    }

    try {
      // Debug statement removed for production security
      final data = {
        'email': email,
        'pharmacyName': pharmacyName,
        'phoneNumber': phoneNumber,
        'address': address,
        'role': 'pharmacy',
        'createdAt': FieldValue.serverTimestamp(),
        'isActive': true,
      };

      // Add location data if provided
      if (locationData != null) {
        data['locationData'] = locationData.toMap();
      }

      await _firestore.collection('pharmacies').doc(currentUser!.uid).set(data);
      // Debug statement removed for production security
    } catch (e) {
      // Debug statement removed for production security
      throw 'Failed to create pharmacy profile: $e';
    }
  }

  // Update pharmacy profile
  static Future<void> updatePharmacyProfile({
    required String pharmacyName,
    required String phoneNumber,
    required String address,
    PharmacyLocationData? locationData,
  }) async {
    if (currentUser == null) {
      throw 'No authenticated user found';
    }

    try {
      // Debug statement removed for production security
      final data = {
        'pharmacyName': pharmacyName,
        'phoneNumber': phoneNumber,
        'address': address,
        'updatedAt': FieldValue.serverTimestamp(),
      };

      // Add location data if provided, remove if null
      if (locationData != null) {
        data['locationData'] = locationData.toMap();
      } else {
        data['locationData'] = FieldValue.delete();
      }

      await _firestore.collection('pharmacies').doc(currentUser!.uid).update(data);
      // Debug statement removed for production security
    } catch (e) {
      // Debug statement removed for production security
      throw 'Failed to update pharmacy profile: $e';
    }
  }

  // Get pharmacy data
  static Future<Map<String, dynamic>?> getPharmacyData() async {
    if (currentUser == null) {
      // Debug statement removed for production security
      return null;
    }

    try {
      // Debug statement removed for production security
      final doc = await _firestore.collection('pharmacies').doc(currentUser!.uid).get();
      final data = doc.data();
      // Debug statement removed for production security
      return data;
    } catch (e) {
      // Debug statement removed for production security
      throw 'Failed to load pharmacy data: $e';
    }
  }

  // Handle auth exceptions
  static String _handleAuthException(FirebaseAuthException e) {
    switch (e.code) {
      case 'user-not-found':
        return 'No user found with this email address.';
      case 'wrong-password':
        return 'Incorrect password.';
      case 'invalid-login-credentials':
      case 'INVALID_LOGIN_CREDENTIALS':
      case 'invalid-credential':
        return 'Invalid email or password. Please check your credentials.';
      case 'email-already-in-use':
        return 'An account already exists with this email address.';
      case 'weak-password':
        return 'Password is too weak.';
      case 'invalid-email':
        return 'Please enter a valid email address.';
      case 'user-disabled':
        return 'This account has been disabled.';
      case 'too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      default:
        return 'Authentication error: ${e.message ?? 'Unknown error'}';
    }
  }
}