import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
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
    print('🔐 Admin login attempt for: $email');
    try {
      print('📊 Checking admin document in Firestore...');
      // First verify this email is an admin
      final adminDoc = await _firestore
          .collection(_adminsCollection)
          .where('email', isEqualTo: email)
          .where('isActive', isEqualTo: true)
          .get();
      print('📊 Admin doc query result: ${adminDoc.docs.length} documents found');

      if (adminDoc.docs.isEmpty) {
        print('❌ No admin document found for email: $email');
        throw Exception('Access denied. Admin account not found.');
      }

      print('✅ Admin document found, proceeding with Firebase Auth...');
      // Authenticate with Firebase Auth
      final credential = await _auth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );
      print('✅ Firebase Auth successful for user: ${credential.user?.uid}');

      if (credential.user != null) {
        print('🕐 Updating last login time...');
        // Update last login time
        await _updateLastLogin(credential.user!.uid);
        
        print('👤 Getting admin user data...');
        // Get admin user data
        final adminUser = await getAdminUser(credential.user!.uid);
        print('✅ Admin login complete: ${adminUser?.email}');
        return adminUser;
      }

      print('❌ Firebase Auth returned null user');
      return null;
    } on FirebaseAuthException catch (e) {
      print('🔥 Firebase Auth Exception: ${e.code} - ${e.message}');
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
      
      print('❌ Throwing exception: $message');
      throw Exception(message);
    } catch (e) {
      print('💥 General exception during login: $e');
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
      print('Failed to update last login: $e');
    }
  }

  /// Create admin user (super admin operation)
  Future<void> createAdminUser({
    required String email,
    required String displayName,
    required String role,
    List<String>? customPermissions,
  }) async {
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
    import 'dart:math' as math;
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
  }) async {
    try {
      final updates = <String, dynamic>{};
      
      if (displayName != null) updates['displayName'] = displayName;
      if (role != null) updates['role'] = role;
      if (isActive != null) updates['isActive'] = isActive;
      if (permissions != null) updates['permissions'] = permissions;

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