import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../blocs/auth_bloc.dart';
import '../../widgets/auth_text_field.dart';
import '../../widgets/auth_button.dart';
import '../../models/location_data.dart';
import '../location/location_picker_screen.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _pharmacyNameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _addressController = TextEditingController();
  
  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;
  
  PharmacyLocationData? _selectedLocationData;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _pharmacyNameController.dispose();
    _phoneController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  // Location helper methods
  Future<void> _openLocationPicker() async {
    final result = await Navigator.of(context).push<PharmacyLocationData>(
      MaterialPageRoute(
        builder: (context) => LocationPickerScreen(
          initialLocationData: _selectedLocationData,
          title: 'Select Pharmacy Location',
          subtitle: 'Choose your precise location for better delivery service',
        ),
      ),
    );
    
    if (result != null) {
      setState(() {
        _selectedLocationData = result;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Create Account'),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: BlocConsumer<AuthBloc, AuthState>(
        listener: (context, state) {
          if (state is AuthError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: Colors.red,
                duration: const Duration(seconds: 5),
              ),
            );
          } else if (state is AuthAuthenticated) {
            // Show success message and navigate back
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('Welcome ${state.user.pharmacyName}! Account created successfully.'),
                backgroundColor: Colors.green,
                duration: const Duration(seconds: 3),
              ),
            );
            // The AuthWrapper in main.dart will automatically navigate to DashboardScreen
          }
        },
        builder: (context, state) {
          return SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24.0),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Header
                    const Icon(
                      Icons.local_pharmacy,
                      size: 60,
                      color: Color(0xFF1976D2),
                    ),
                    const SizedBox(height: 16),
                    
                    const Text(
                      'Join Pharmacy Exchange',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF1976D2),
                      ),
                      textAlign: TextAlign.center,
                    ),
                    
                    const SizedBox(height: 8),
                    Text(
                      'Create your pharmacy account',
                      style: TextStyle(
                        fontSize: 16,
                        color: Colors.grey[600],
                      ),
                      textAlign: TextAlign.center,
                    ),
                    
                    const SizedBox(height: 32),
                    
                    // Pharmacy Name
                    AuthTextField(
                      controller: _pharmacyNameController,
                      label: 'Pharmacy Name',
                      prefixIcon: Icons.store,
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Please enter your pharmacy name';
                        }
                        return null;
                      },
                    ),
                    
                    const SizedBox(height: 16),
                    
                    // Email
                    AuthTextField(
                      controller: _emailController,
                      label: 'Email Address',
                      keyboardType: TextInputType.emailAddress,
                      prefixIcon: Icons.email_outlined,
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Please enter your email';
                        }
                        if (!RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$').hasMatch(value)) {
                          return 'Please enter a valid email';
                        }
                        return null;
                      },
                    ),
                    
                    const SizedBox(height: 16),
                    
                    // Phone Number
                    AuthTextField(
                      controller: _phoneController,
                      label: 'Phone Number',
                      keyboardType: TextInputType.phone,
                      prefixIcon: Icons.phone,
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Please enter your phone number';
                        }
                        return null;
                      },
                    ),
                    
                    const SizedBox(height: 16),
                    
                    // Address
                    AuthTextField(
                      controller: _addressController,
                      label: 'Pharmacy Address (Legacy)',
                      prefixIcon: Icons.location_on,
                      maxLines: 2,
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Please enter your pharmacy address';
                        }
                        return null;
                      },
                    ),
                    
                    const SizedBox(height: 24),
                    
                    // Enhanced Location Section
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.grey[300]!),
                        borderRadius: BorderRadius.circular(12),
                        color: Colors.grey[50],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Row(
                            children: [
                              Icon(
                                Icons.map,
                                color: Color(0xFF1976D2),
                                size: 24,
                              ),
                              SizedBox(width: 8),
                              Text(
                                'Enhanced Location (Recommended)',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFF1976D2),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Select your exact location using an interactive map for precise delivery',
                            style: TextStyle(
                              fontSize: 14,
                              color: Colors.grey[600],
                            ),
                          ),
                          const SizedBox(height: 16),
                          
                          // Location Picker Button
                          ElevatedButton.icon(
                            onPressed: _openLocationPicker,
                            icon: _selectedLocationData != null
                                ? const Icon(Icons.check_circle)
                                : const Icon(Icons.map),
                            label: Text(_selectedLocationData != null 
                                ? 'Location Selected ✓' 
                                : 'Select on Map'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: _selectedLocationData != null 
                                  ? Colors.green 
                                  : const Color(0xFF1976D2),
                              foregroundColor: Colors.white,
                              minimumSize: const Size(double.infinity, 48),
                            ),
                          ),
                          
                          // Location Summary
                          if (_selectedLocationData != null) ...[
                            const SizedBox(height: 12),
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.green[50],
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: Colors.green[200]!),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Selected Location:',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: Colors.green[700],
                                    ),
                                  ),
                                  Text(
                                    _selectedLocationData!.bestLocationDescription,
                                    style: TextStyle(
                                      color: Colors.green[700],
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    'GPS: ${_selectedLocationData!.coordinates.latitude.toStringAsFixed(6)}, ${_selectedLocationData!.coordinates.longitude.toStringAsFixed(6)}',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontFamily: 'monospace',
                                      color: Colors.green[600],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    
                    const SizedBox(height: 16),
                    
                    // Password
                    AuthTextField(
                      controller: _passwordController,
                      label: 'Password',
                      obscureText: _obscurePassword,
                      prefixIcon: Icons.lock_outline,
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscurePassword ? Icons.visibility : Icons.visibility_off,
                        ),
                        onPressed: () {
                          setState(() {
                            _obscurePassword = !_obscurePassword;
                          });
                        },
                      ),
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Please enter a password';
                        }
                        if (value.length < 6) {
                          return 'Password must be at least 6 characters';
                        }
                        return null;
                      },
                    ),
                    
                    const SizedBox(height: 16),
                    
                    // Confirm Password
                    AuthTextField(
                      controller: _confirmPasswordController,
                      label: 'Confirm Password',
                      obscureText: _obscureConfirmPassword,
                      prefixIcon: Icons.lock_outline,
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscureConfirmPassword ? Icons.visibility : Icons.visibility_off,
                        ),
                        onPressed: () {
                          setState(() {
                            _obscureConfirmPassword = !_obscureConfirmPassword;
                          });
                        },
                      ),
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Please confirm your password';
                        }
                        if (value != _passwordController.text) {
                          return 'Passwords do not match';
                        }
                        return null;
                      },
                    ),
                    
                    const SizedBox(height: 32),
                    
                    // Register Button
                    AuthButton(
                      text: 'Create Account',
                      isLoading: state is AuthLoading,
                      onPressed: () {
                        if (_formKey.currentState!.validate()) {
                          context.read<AuthBloc>().add(
                            AuthSignUpRequested(
                              email: _emailController.text.trim(),
                              password: _passwordController.text,
                              pharmacyName: _pharmacyNameController.text.trim(),
                              phoneNumber: _phoneController.text.trim(),
                              address: _addressController.text.trim(),
                              locationData: _selectedLocationData,
                            ),
                          );
                        }
                      },
                    ),
                    
                    const SizedBox(height: 24),
                    
                    // Sign In Link
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          "Already have an account? ",
                          style: TextStyle(color: Colors.grey[600]),
                        ),
                        TextButton(
                          onPressed: () {
                            Navigator.pop(context);
                          },
                          child: const Text(
                            'Sign In',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}