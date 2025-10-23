import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:pharmapp_shared/services/unified_auth_service.dart';
import 'package:pharmapp_shared/screens/auth/country_payment_selection_screen.dart';
import '../../blocs/unified_auth_bloc.dart';
import 'unified_registration_screen.dart';

/// Role-based authentication screen that provides login/registration for specific user types
/// Shows after user selects their role (pharmacy/courier) from landing page
class RoleBasedAuthScreen extends StatefulWidget {
  final UserType userType;

  const RoleBasedAuthScreen({
    super.key,
    required this.userType,
  });

  @override
  State<RoleBasedAuthScreen> createState() => _RoleBasedAuthScreenState();
}

class _RoleBasedAuthScreenState extends State<RoleBasedAuthScreen> {
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

  void _handleSignIn() {
    if (_formKey.currentState!.validate()) {
      context.read<UnifiedAuthBloc>().add(
            SignInRequested(
              email: _emailController.text.trim(),
              password: _passwordController.text,
            ),
          );
    }
  }

  void _handleRegister() {
    // Ensure widget is still mounted before navigation
    if (!mounted) return;

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (newContext) => BlocProvider.value(
          value: context.read<UnifiedAuthBloc>(),
          child: CountryPaymentSelectionScreen(
            title: 'Step 1: Select Your Location',
            subtitle: 'Choose your country and city',
            allowSkip: false,
            registrationScreenBuilder: (selectedCountry, selectedCity) {
              return UnifiedRegistrationScreen(
                userType: widget.userType,
                selectedCountry: selectedCountry,
                selectedCity: selectedCity,
              );
            },
          ),
        ),
      ),
    );
  }

  Color _getRoleColor() {
    switch (widget.userType) {
      case UserType.pharmacy:
        return const Color(0xFF1976D2); // Blue
      case UserType.courier:
        return const Color(0xFF4CAF50); // Green
      case UserType.admin:
        return const Color(0xFFFF9800); // Orange
    }
  }

  IconData _getRoleIcon() {
    switch (widget.userType) {
      case UserType.pharmacy:
        return Icons.local_pharmacy;
      case UserType.courier:
        return Icons.delivery_dining;
      case UserType.admin:
        return Icons.admin_panel_settings;
    }
  }

  String _getRoleTitle() {
    switch (widget.userType) {
      case UserType.pharmacy:
        return 'Pharmacy Login';
      case UserType.courier:
        return 'Courier Login';
      case UserType.admin:
        return 'Admin Login';
    }
  }

  @override
  Widget build(BuildContext context) {
    final roleColor = _getRoleColor();

    return Scaffold(
      appBar: AppBar(
        backgroundColor: roleColor,
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(_getRoleTitle()),
      ),
      body: BlocConsumer<UnifiedAuthBloc, UnifiedAuthState>(
        listener: (context, state) {
          if (state is AuthError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.error),
                backgroundColor: Colors.red,
              ),
            );
          }
        },
        builder: (context, state) {
          final isLoading = state is AuthLoading;

          return Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 400),
                child: Card(
                  elevation: 8,
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          // Role Icon
                          Icon(
                            _getRoleIcon(),
                            size: 64,
                            color: roleColor,
                          ),
                          const SizedBox(height: 16),
                          Text(
                            _getRoleTitle(),
                            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                                  fontWeight: FontWeight.bold,
                                  color: roleColor,
                                ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 32),

                          // Email Field
                          TextFormField(
                            controller: _emailController,
                            keyboardType: TextInputType.emailAddress,
                            enabled: !isLoading,
                            decoration: InputDecoration(
                              labelText: 'Email',
                              prefixIcon: Icon(Icons.email, color: roleColor),
                              border: const OutlineInputBorder(),
                              focusedBorder: OutlineInputBorder(
                                borderSide: BorderSide(color: roleColor, width: 2),
                              ),
                            ),
                            validator: (value) {
                              if (value == null || value.isEmpty) {
                                return 'Please enter your email';
                              }
                              if (!value.contains('@')) {
                                return 'Please enter a valid email';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 16),

                          // Password Field
                          TextFormField(
                            controller: _passwordController,
                            obscureText: _obscurePassword,
                            enabled: !isLoading,
                            decoration: InputDecoration(
                              labelText: 'Password',
                              prefixIcon: Icon(Icons.lock, color: roleColor),
                              border: const OutlineInputBorder(),
                              focusedBorder: OutlineInputBorder(
                                borderSide: BorderSide(color: roleColor, width: 2),
                              ),
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
                            ),
                            validator: (value) {
                              if (value == null || value.isEmpty) {
                                return 'Please enter your password';
                              }
                              if (value.length < 6) {
                                return 'Password must be at least 6 characters';
                              }
                              return null;
                            },
                            onFieldSubmitted: (_) => _handleSignIn(),
                          ),
                          const SizedBox(height: 24),

                          // Sign In Button
                          ElevatedButton(
                            onPressed: isLoading ? null : _handleSignIn,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: roleColor,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 16),
                            ),
                            child: isLoading
                                ? const SizedBox(
                                    height: 20,
                                    width: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Text(
                                    'Sign In',
                                    style: TextStyle(fontSize: 16),
                                  ),
                          ),
                          const SizedBox(height: 16),

                          // Register Button
                          OutlinedButton(
                            onPressed: isLoading ? null : _handleRegister,
                            style: OutlinedButton.styleFrom(
                              foregroundColor: roleColor,
                              side: BorderSide(color: roleColor),
                              padding: const EdgeInsets.symmetric(vertical: 16),
                            ),
                            child: const Text(
                              'Create Account',
                              style: TextStyle(fontSize: 16),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
