import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'dart:math' as math;
import '../models/admin_user.dart';

class AdminAuthService {
  static final FirebaseAuth _auth = FirebaseAuth.instance;
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  
  static const String _adminsCollection = 'admins';

  /// Get current authenticated user
  User? get currentUser => _auth.currentUser;

  /// Get current admin user stream
  Stream<User?> get authStateChanges => _auth.authStateChanges();

  /// Sign in with email and password
  Future<AdminUser?> signInWithEmailAndPassword({
    required String email,
    required String password,
  }) async {
    try {
      // Step 1: Authenticate with Firebase Auth FIRST.
      // This gives us a valid auth token before any Firestore reads.
      final credential = await _auth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );

      if (credential.user == null) return null;

      final uid = credential.user!.uid;

      // Step 2: Read admins/{uid} — now authenticated, rules allow own-doc read.
      final adminDoc = await _firestore
          .collection(_adminsCollection)
          .doc(uid)
          .get();

      if (!adminDoc.exists || adminDoc.data()?['isActive'] != true) {
        // Not an admin or inactive — sign out and reject.
        await _auth.signOut();
        throw Exception('Access denied. Admin account not found or inactive.');
      }

      // Step 3: Update last login and return admin user.
      await _updateLastLogin(uid);
      final adminUser = await getAdminUser(uid);
      return adminUser;
    } on FirebaseAuthException catch (e) {
      // Firebase Auth Exception occurred
      String message = 'Authentication failed';
      
      switch (e.code) {
        case 'user-not-found':
          message = 'Admin account not found';
          break;
        case 'wrong-password':
          message = 'Invalid password';
          break;
        case 'invalid-email':
          message = 'Invalid email format';
          break;
        case 'user-disabled':
          message = 'Admin account has been disabled';
          break;
        case 'too-many-requests':
          message = 'Too many failed attempts. Please try again later.';
          break;
        default:
          message = e.message ?? 'Authentication failed';
      }
      
      // Debug statement removed for production security
      throw Exception(message);
    } catch (e) {
      // Debug statement removed for production security
      throw Exception(e.toString());
    }
  }

  /// Get admin user data
  Future<AdminUser?> getAdminUser(String uid) async {
    try {
      final doc = await _firestore
          .collection(_adminsCollection)
          .doc(uid)
          .get();

      if (doc.exists) {
        return AdminUser.fromFirestore(doc);
      }
      return null;
    } catch (e) {
      throw Exception('Failed to get admin user data: $e');
    }
  }

  /// Update last login time
  Future<void> _updateLastLogin(String uid) async {
    try {
      await _firestore
          .collection(_adminsCollection)
          .doc(uid)
          .update({'lastLoginAt': Timestamp.now()});
    } catch (e) {
      // Non-critical error, log but don't throw
      // Debug statement removed for production security
    }
  }

  /// Create admin user (super admin operation)
  Future<void> createAdminUser({
    required String email,
    required String displayName,
    required String role,
    List<String>? customPermissions,
    List<String> countryScopes = const [],
  }) async {
    // Guard: non-super_admin roles require non-empty countryScopes (V2A + V2D).
    if (role != 'super_admin' && countryScopes.isEmpty) {
      throw Exception(
          '$role role requires at least one country in countryScopes.');
    }
    try {
      // Create Firebase Auth user first
      final credential = await _auth.createUserWithEmailAndPassword(
        email: email,
        password: _generateTemporaryPassword(),
      );

      if (credential.user != null) {
        // Set display name
        await credential.user!.updateDisplayName(displayName);

        // Create admin document
        final adminUser = AdminUser(
          uid: credential.user!.uid,
          email: email,
          displayName: displayName,
          role: role,
          isActive: true,
          createdAt: DateTime.now(),
          lastLoginAt: DateTime.now(),
          permissions: customPermissions ?? AdminPermissions.getPermissionsForRole(role),
          countryScopes: countryScopes,
        );

        await _firestore
            .collection(_adminsCollection)
            .doc(credential.user!.uid)
            .set(adminUser.toMap());

        // Send password reset email for initial setup
        await _auth.sendPasswordResetEmail(email: email);
      }
    } catch (e) {
      throw Exception('Failed to create admin user: $e');
    }
  }

  /// Generate temporary password for new admin users
  String _generateTemporaryPassword() {
    // Generate a cryptographically secure temporary password
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#\$%^&*';
    final random = math.Random.secure();
    return List.generate(12, (index) => chars[random.nextInt(chars.length)]).join();
  }

  /// Update admin user
  Future<void> updateAdminUser({
    required String uid,
    String? displayName,
    String? role,
    bool? isActive,
    List<String>? permissions,
    List<String>? countryScopes,
  }) async {
    // Guard: non-super_admin roles require non-empty countryScopes (V2A + V2D).
    if (role != null && role != 'super_admin') {
      if (countryScopes != null && countryScopes.isEmpty) {
        throw Exception(
            '$role role requires at least one country in countryScopes.');
      }
      if (countryScopes == null) {
        // Role changed to non-super_admin but no scopes provided — check existing doc.
        final doc = await _firestore.collection(_adminsCollection).doc(uid).get();
        final existing = List<String>.from(doc.data()?['countryScopes'] ?? []);
        if (existing.isEmpty) {
          throw Exception(
              'Cannot set role to $role: existing countryScopes is empty. '
              'Provide countryScopes with at least one country.');
        }
      }
    }
    try {
      final updates = <String, dynamic>{};

      if (displayName != null) updates['displayName'] = displayName;
      if (role != null) updates['role'] = role;
      if (isActive != null) updates['isActive'] = isActive;
      if (permissions != null) updates['permissions'] = permissions;
      if (countryScopes != null) updates['countryScopes'] = countryScopes;

      if (updates.isNotEmpty) {
        await _firestore
            .collection(_adminsCollection)
            .doc(uid)
            .update(updates);
      }
    } catch (e) {
      throw Exception('Failed to update admin user: $e');
    }
  }

  /// Get all admin users
  Future<List<AdminUser>> getAllAdminUsers() async {
    try {
      final querySnapshot = await _firestore
          .collection(_adminsCollection)
          .orderBy('createdAt', descending: true)
          .get();

      return querySnapshot.docs
          .map((doc) => AdminUser.fromFirestore(doc))
          .toList();
    } catch (e) {
      throw Exception('Failed to get admin users: $e');
    }
  }

  /// Send password reset email
  Future<void> sendPasswordResetEmail(String email) async {
    try {
      await _auth.sendPasswordResetEmail(email: email);
    } catch (e) {
      throw Exception('Failed to send password reset email: $e');
    }
  }

  /// Sign out
  Future<void> signOut() async {
    try {
      await _auth.signOut();
    } catch (e) {
      throw Exception('Failed to sign out: $e');
    }
  }

  /// Check if current user is authenticated admin
  Future<bool> isAuthenticatedAdmin() async {
    final user = _auth.currentUser;
    if (user == null) return false;

    try {
      final adminDoc = await _firestore
          .collection(_adminsCollection)
          .doc(user.uid)
          .get();

      return adminDoc.exists && (adminDoc.data()?['isActive'] ?? false);
    } catch (e) {
      return false;
    }
  }

  /// Validate admin permissions for operation
  Future<bool> validatePermission(String permission) async {
    final user = _auth.currentUser;
    if (user == null) return false;

    try {
      final adminUser = await getAdminUser(user.uid);
      return adminUser?.hasPermission(permission) ?? false;
    } catch (e) {
      return false;
    }
  }
}