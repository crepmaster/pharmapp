import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

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
    required String fullName,
    required String phoneNumber,
    required String vehicleType,
    required String licensePlate,
  }) async {
    try {
      final credential = await _auth.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );

      // Create courier profile in Firestore
      if (credential.user != null) {
        await _firestore.collection('couriers').doc(credential.user!.uid).set({
          'email': email,
          'fullName': fullName,
          'phoneNumber': phoneNumber,
          'vehicleType': vehicleType,
          'licensePlate': licensePlate,
          'role': 'courier',
          'createdAt': FieldValue.serverTimestamp(),
          'isActive': true,
          'isAvailable': false,
          'rating': 0.0,
          'totalDeliveries': 0,
        });
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
      return await _auth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
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

  // Get courier data
  static Future<Map<String, dynamic>?> getCourierData() async {
    if (currentUser == null) return null;

    try {
      final doc = await _firestore.collection('couriers').doc(currentUser!.uid).get();
      return doc.data();
    } catch (e) {
      throw 'Failed to load courier data: $e';
    }
  }

  // Update courier availability
  static Future<void> updateAvailability(bool isAvailable) async {
    if (currentUser == null) return;

    try {
      await _firestore.collection('couriers').doc(currentUser!.uid).update({
        'isAvailable': isAvailable,
        'lastSeen': FieldValue.serverTimestamp(),
      });
    } catch (e) {
      throw 'Failed to update availability: $e';
    }
  }

  // Handle auth exceptions
  static String _handleAuthException(FirebaseAuthException e) {
    switch (e.code) {
      case 'user-not-found':
        return 'No user found with this email address.';
      case 'wrong-password':
        return 'Incorrect password.';
      case 'email-already-in-use':
        return 'An account already exists with this email address.';
      case 'weak-password':
        return 'Password is too weak.';
      case 'invalid-email':
        return 'Please enter a valid email address.';
      case 'user-disabled':
        return 'This account has been disabled.';
      default:
        return 'Authentication error: ${e.message}';
    }
  }
}