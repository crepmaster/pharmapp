import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';
import '../blocs/admin_auth_bloc.dart';
import '../services/admin_auth_service.dart';

class AdminLoginScreen extends StatefulWidget {
  const AdminLoginScreen({super.key});

  @override
  State<AdminLoginScreen> createState() => _AdminLoginScreenState();
}

class _AdminLoginScreenState extends State<AdminLoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _submit() {
    // Form submission started
    if (_formKey.currentState!.validate()) {
      final email = _emailController.text.trim();
      final password = _passwordController.text;
      // Form validated successfully
      
      context.read<AdminAuthBloc>().add(
        AdminAuthLoginRequested(
          email: email,
          password: password,
        ),
      );
      // Login event added to BLoC
    } else {
      // Form validation failed
    }
  }

  Future<void> _createTestAdmin(BuildContext context) async {
    try {
      // Import required services
      final authService = AdminAuthService();
      
      await authService.createAdminUser(
        email: 'admin@mediexchange.com',
        displayName: 'Test Admin',
        role: 'super_admin',
      );
      
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Test admin created! Check your email for password reset.'),
            backgroundColor: Colors.green,
            duration: Duration(seconds: 5),
          ),
        );
        
        // Auto-fill the form
        _emailController.text = 'admin@mediexchange.com';
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to create admin: $e'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 5),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Colors.blue.shade900,
              Colors.blue.shade600,
              Colors.blue.shade400,
            ],
          ),
        ),
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: Card(
              elevation: 8,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              child: Container(
                width: 400,
                padding: const EdgeInsets.all(32.0),
                child: BlocConsumer<AdminAuthBloc, AdminAuthState>(
                  listener: (context, state) {
                    if (state is AdminAuthError) {
                      // Admin auth error occurred
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(state.message),
                          backgroundColor: Colors.red,
                          duration: const Duration(seconds: 5),
                          action: SnackBarAction(
                            label: 'Dismiss',
                            onPressed: () {
                              ScaffoldMessenger.of(context).hideCurrentSnackBar();
                            },
                            textColor: Colors.white,
                          ),
                        ),
                      );
                    } else if (state is AdminAuthAuthenticated) {
                      // Admin successfully authenticated
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('Welcome, ${state.adminUser.displayName}!'),
                          backgroundColor: Colors.green,
                        ),
                      );
                    } else if (state is AdminAuthLoading) {
                      // Admin auth loading
                    }
                  },
                  builder: (context, state) {
                    final isLoading = state is AdminAuthLoading;
                    
                    return Form(
                      key: _formKey,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          // Logo and title
                          Icon(
                            Icons.admin_panel_settings,
                            size: 64,
                            color: Colors.blue.shade600,
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'MediExchange',
                            style: GoogleFonts.inter(
                              fontSize: 28,
                              fontWeight: FontWeight.bold,
                              color: Colors.grey.shade800,
                            ),
                            textAlign: TextAlign.center,
                          ),
                          Text(
                            'Admin Control Panel',
                            style: GoogleFonts.inter(
                              fontSize: 16,
                              color: Colors.grey.shade600,
                            ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 32),

                          // Email field
                          TextFormField(
                            controller: _emailController,
                            enabled: !isLoading,
                            keyboardType: TextInputType.emailAddress,
                            decoration: InputDecoration(
                              labelText: 'Admin Email',
                              prefixIcon: const Icon(Icons.email),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              filled: true,
                              fillColor: Colors.grey.shade50,
                            ),
                            validator: (value) {
                              if (value == null || value.trim().isEmpty) {
                                return 'Email is required';
                              }
                              if (!RegExp(r'^[^@]+@[^@]+\.[^@]+').hasMatch(value)) {
                                return 'Enter a valid email';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 16),

                          // Password field
                          TextFormField(
                            controller: _passwordController,
                            enabled: !isLoading,
                            obscureText: _obscurePassword,
                            decoration: InputDecoration(
                              labelText: 'Password',
                              prefixIcon: const Icon(Icons.lock),
                              suffixIcon: IconButton(
                                icon: Icon(
                                  _obscurePassword
                                      ? Icons.visibility
                                      : Icons.visibility_off,
                                ),
                                onPressed: () {
                                  setState(() {
                                    _obscurePassword = !_obscurePassword;
                                  });
                                },
                              ),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              filled: true,
                              fillColor: Colors.grey.shade50,
                            ),
                            validator: (value) {
                              if (value == null || value.isEmpty) {
                                return 'Password is required';
                              }
                              if (value.length < 6) {
                                return 'Password must be at least 6 characters';
                              }
                              return null;
                            },
                            onFieldSubmitted: (_) => _submit(),
                          ),
                          const SizedBox(height: 24),

                          // Login button
                          ElevatedButton(
                            onPressed: isLoading ? null : _submit,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.blue.shade600,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            child: isLoading
                                ? const SizedBox(
                                    height: 20,
                                    width: 20,
                                    child: CircularProgressIndicator(
                                      color: Colors.white,
                                      strokeWidth: 2,
                                    ),
                                  )
                                : Text(
                                    'Sign In',
                                    style: GoogleFonts.inter(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                          ),
                          const SizedBox(height: 16),

                          // Forgot password
                          TextButton(
                            onPressed: isLoading ? null : () {
                              if (_emailController.text.trim().isNotEmpty) {
                                // TODO: Implement forgot password
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('Password reset functionality coming soon'),
                                  ),
                                );
                              } else {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('Please enter your email first'),
                                  ),
                                );
                              }
                            },
                            child: Text(
                              'Forgot Password?',
                              style: GoogleFonts.inter(
                                color: Colors.blue.shade600,
                              ),
                            ),
                          ),

                          const SizedBox(height: 24),

                          // Development helper - Create test admin
                          if (!isLoading) ...[
                            const Divider(),
                            const SizedBox(height: 16),
                            TextButton.icon(
                              onPressed: () => _createTestAdmin(context),
                              icon: const Icon(Icons.person_add),
                              label: const Text('Create Test Admin (Dev Only)'),
                              style: TextButton.styleFrom(
                                foregroundColor: Colors.orange,
                              ),
                            ),
                          ],
                          
                          const SizedBox(height: 24),
                          
                          // Footer info
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.blue.shade50,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Column(
                              children: [
                                Icon(
                                  Icons.security,
                                  color: Colors.blue.shade600,
                                  size: 20,
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  'Admin access only',
                                  style: GoogleFonts.inter(
                                    fontSize: 12,
                                    color: Colors.blue.shade700,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                Text(
                                  'Authorized personnel only. All activities are logged.',
                                  style: GoogleFonts.inter(
                                    fontSize: 10,
                                    color: Colors.blue.shade600,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}