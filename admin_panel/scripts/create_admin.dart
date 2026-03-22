import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

// Simple script to create an admin user
// Run with: dart run scripts/create_admin.dart

void main() async {
  print('🔧 Creating MediExchange Admin User...\n');

  try {
    // Initialize Firebase (you'll need to set up firebase_options.dart)
    await Firebase.initializeApp();
    
    // Get admin details
    stdout.write('Enter admin email: ');
    final email = stdin.readLineSync() ?? '';
    
    stdout.write('Enter admin display name: ');
    final displayName = stdin.readLineSync() ?? '';
    
    stdout.write('Enter admin role (super_admin/admin/finance): ');
    final role = stdin.readLineSync() ?? 'admin';

    // Country scopes — required for admin role
    List<String> countryScopes = [];
    if (role == 'admin') {
      stdout.write('Enter country scopes (comma-separated ISO codes, e.g. CM,KE): ');
      final scopesInput = stdin.readLineSync() ?? '';
      countryScopes = scopesInput
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .where((s) => s.isNotEmpty)
          .toList();
      if (countryScopes.isEmpty) {
        print('❌ admin role requires at least one country scope');
        return;
      }
    }

    // Get password from admin (no hardcoded passwords)
    stdout.write('Enter temporary password for admin: ');
    final tempPassword = stdin.readLineSync() ?? '';
    if (tempPassword.isEmpty) {
      print('❌ Password cannot be empty');
      return;
    }
    print('\n(Admin should change this on first login)\n');

    // Create Firebase Auth user
    final auth = FirebaseAuth.instance;
    final credential = await auth.createUserWithEmailAndPassword(
      email: email,
      password: tempPassword,
    );

    if (credential.user != null) {
      final uid = credential.user!.uid;
      
      // Update display name
      await credential.user!.updateDisplayName(displayName);
      
      // Create admin document in Firestore
      final firestore = FirebaseFirestore.instance;
      final permissions = _getPermissionsForRole(role);
      
      await firestore.collection('admins').doc(uid).set({
        'email': email,
        'displayName': displayName,
        'role': role,
        'isActive': true,
        'createdAt': FieldValue.serverTimestamp(),
        'lastLoginAt': FieldValue.serverTimestamp(),
        'permissions': permissions,
        'countryScopes': countryScopes,
      });

      print('✅ Admin user created successfully!');
      print('📧 Email: $email');
      print('🔑 Password: $tempPassword');
      print('👤 Role: $role');
      print('🔗 Admin Panel: http://localhost:8084');
      print('\n⚠️  IMPORTANT: Admin should change password on first login!');
      
      // Send password reset email
      try {
        await auth.sendPasswordResetEmail(email: email);
        print('📨 Password reset email sent to $email');
      } catch (e) {
        print('⚠️  Could not send password reset email: $e');
      }
      
    } else {
      print('❌ Failed to create admin user');
    }
    
  } catch (e) {
    print('❌ Error creating admin: $e');
  }
  
  print('\nScript completed. Press any key to exit...');
  stdin.readLineSync();
}

List<String> _getPermissionsForRole(String role) {
  switch (role) {
    case 'super_admin':
      return [
        'manage_pharmacies',
        'manage_subscriptions',
        'verify_payments',
        'view_financials',
        'manage_admins',
        'system_settings',
      ];
    case 'admin':
      return [
        'manage_pharmacies',
        'manage_subscriptions',
        'verify_payments',
      ];
    case 'finance':
      return [
        'verify_payments',
        'view_financials',
      ];
    default:
      return ['manage_pharmacies'];
  }
}