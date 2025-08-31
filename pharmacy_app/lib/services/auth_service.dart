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
    required String pharmacyName,
    required String phoneNumber,
    required String address,
  }) async {
    try {
      final credential = await _auth.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );

      // Create pharmacy profile in Firestore
      if (credential.user != null) {
        await _firestore.collection('pharmacies').doc(credential.user!.uid).set({
          'email': email,
          'pharmacyName': pharmacyName,
          'phoneNumber': phoneNumber,
          'address': address,
          'role': 'pharmacy',
          'createdAt': FieldValue.serverTimestamp(),
          'isActive': true,
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
      print('🔥 AuthService: Attempting Firebase signIn for $email');
      final result = await _auth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );
      print('✅ AuthService: Firebase signIn successful');
      return result;
    } on FirebaseAuthException catch (e) {
      print('❌ AuthService: Firebase Auth Error - Code: ${e.code}, Message: ${e.message}');
      throw _handleAuthException(e);
    } catch (e) {
      print('❌ AuthService: Unexpected error during signIn - $e');
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
  }) async {
    if (currentUser == null) {
      throw 'No authenticated user found';
    }

    try {
      print('🏥 AuthService: Creating pharmacy profile for ${currentUser!.uid}');
      await _firestore.collection('pharmacies').doc(currentUser!.uid).set({
        'email': email,
        'pharmacyName': pharmacyName,
        'phoneNumber': phoneNumber,
        'address': address,
        'role': 'pharmacy',
        'createdAt': FieldValue.serverTimestamp(),
        'isActive': true,
      });
      print('✅ AuthService: Pharmacy profile created successfully');
    } catch (e) {
      print('❌ AuthService: Error creating pharmacy profile - $e');
      throw 'Failed to create pharmacy profile: $e';
    }
  }

  // Get pharmacy data
  static Future<Map<String, dynamic>?> getPharmacyData() async {
    if (currentUser == null) {
      print('❌ AuthService: No current user for pharmacy data');
      return null;
    }

    try {
      print('📛 AuthService: Getting pharmacy data for ${currentUser!.uid}');
      final doc = await _firestore.collection('pharmacies').doc(currentUser!.uid).get();
      final data = doc.data();
      print('📛 AuthService: Pharmacy data ${data != null ? 'found' : 'not found'}');
      return data;
    } catch (e) {
      print('❌ AuthService: Error getting pharmacy data - $e');
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