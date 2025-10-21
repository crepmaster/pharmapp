import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../blocs/auth_bloc.dart';
import '../../widgets/auth_text_field.dart';
import '../../widgets/auth_button.dart';
import '../../services/registration_navigation_helper.dart';
import 'package:pharmapp_shared/models/payment_preferences.dart';
import 'package:pharmapp_shared/models/country_config.dart';

class RegisterScreen extends StatefulWidget {
  final Country? selectedCountry;
  final String? selectedCity;

  const RegisterScreen({
    super.key,
    this.selectedCountry,
    this.selectedCity,
  });

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _fullNameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _licensePlateController = TextEditingController();
  final _paymentPhoneController = TextEditingController();
  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;
  bool _useDifferentPaymentPhone = false;
  PaymentOperator? _selectedPaymentOperator;
  String _selectedVehicleType = 'Motorcycle';

  final List<String> _vehicleTypes = [
    'Motorcycle',
    'Bicycle',
    'Car',
    'Scooter',
    'Van',
    'Other',
  ];

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _fullNameController.dispose();
    _phoneController.dispose();
    _licensePlateController.dispose();
    _paymentPhoneController.dispose();
    super.dispose();
  }

  // Payment helper methods
  List<PaymentOperator> _getAvailableOperators() {
    if (widget.selectedCountry == null) return [];

    final countryConfig = Countries.getByCountry(widget.selectedCountry!);
    return countryConfig?.availableOperators ?? [];
  }

  IconData _getOperatorIcon(PaymentOperator operator) {
    switch (operator) {
      case PaymentOperator.mtnCameroon:
      case PaymentOperator.mtnUganda:
      case PaymentOperator.mtnNigeria:
        return Icons.phone_android;
      case PaymentOperator.orangeCameroon:
        return Icons.phone_iphone;
      case PaymentOperator.mpesaKenya:
      case PaymentOperator.mpesaTanzania:
        return Icons.account_balance_wallet;
      case PaymentOperator.airtelKenya:
      case PaymentOperator.airtelTanzania:
      case PaymentOperator.airtelUganda:
      case PaymentOperator.airtelNigeria:
        return Icons.mobile_friendly;
      case PaymentOperator.tigoTanzania:
        return Icons.payment;
      case PaymentOperator.gloNigeria:
      case PaymentOperator.nineMobile:
        return Icons.smartphone;
    }
  }

  String _getOperatorDisplayName(PaymentOperator operator) {
    final countryConfig = Countries.getByCountry(widget.selectedCountry!);
    final operatorConfig = countryConfig?.getOperatorConfig(operator);
    return operatorConfig?.displayName ?? operator.toString().split('.').last;
  }

  // Complete registration with payment preferences
  void _proceedWithRegistration() {
    if (!mounted) return;

    // Determine payment phone number
    final paymentPhone = _useDifferentPaymentPhone
        ? _paymentPhoneController.text.trim()
        : _phoneController.text.trim();

    // Create payment preferences with phone from registration form
    final paymentPreferences = _selectedPaymentOperator != null
        ? PaymentPreferences.createSecure(
            method: _selectedPaymentOperator!.toString().split('.').last,
            phoneNumber: paymentPhone,
            country: widget.selectedCountry,
            operator: _selectedPaymentOperator,
            isSetupComplete: true,
          )
        : PaymentPreferences.empty();

    context.read<AuthBloc>().add(
      AuthSignUpWithPaymentPreferences(
        email: _emailController.text.trim(),
        password: _passwordController.text,
        fullName: _fullNameController.text.trim(),
        phoneNumber: _phoneController.text.trim(),
        vehicleType: _selectedVehicleType,
        licensePlate: _licensePlateController.text.trim(),
        city: widget.selectedCity,
        paymentPreferences: paymentPreferences,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Join as Courier'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: const Color(0xFF4CAF50),
      ),
      body: BlocConsumer<AuthBloc, AuthState>(
        listener: (context, state) {
          if (state is AuthError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: Colors.red,
              ),
            );
          } else if (state is AuthAuthenticated) {
            // Use unified registration navigation helper
            RegistrationNavigationHelper.handleSuccessfulRegistration(
              context: context,
              userName: state.user.fullName,
              successColor: const Color(0xFF4CAF50), // Courier green
            );
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
                    // Logo
                    Center(
                      child: Image.asset(
                        'assets/images/logo.png',
                        width: 150,
                        height: 150,
                      ),
                    ),
                    const SizedBox(height: 16),

                    const Text(
                      'Become a Courier',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF4CAF50),
                      ),
                      textAlign: TextAlign.center,
                    ),
                    
                    const SizedBox(height: 8),
                    Text(
                      'Start earning by delivering medicines',
                      style: TextStyle(
                        fontSize: 16,
                        color: Colors.grey[600],
                      ),
                      textAlign: TextAlign.center,
                    ),
                    
                    const SizedBox(height: 32),
                    
                    // Full Name
                    AuthTextField(
                      controller: _fullNameController,
                      label: 'Full Name',
                      prefixIcon: Icons.person,
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Please enter your full name';
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
                    
                    // Vehicle Type Dropdown
                    DropdownButtonFormField<String>(
                      initialValue: _selectedVehicleType,
                      decoration: InputDecoration(
                        labelText: 'Vehicle Type',
                        prefixIcon: const Icon(Icons.motorcycle),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: Colors.grey.shade300),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Color(0xFF4CAF50), width: 2),
                        ),
                        filled: true,
                        fillColor: Colors.grey.shade50,
                      ),
                      items: _vehicleTypes.map((String type) {
                        return DropdownMenuItem<String>(
                          value: type,
                          child: Text(type),
                        );
                      }).toList(),
                      onChanged: (String? newValue) {
                        setState(() {
                          _selectedVehicleType = newValue!;
                        });
                      },
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Please select a vehicle type';
                        }
                        return null;
                      },
                    ),
                    
                    const SizedBox(height: 16),
                    
                    // License Plate
                    AuthTextField(
                      controller: _licensePlateController,
                      label: 'License Plate / ID',
                      prefixIcon: Icons.badge,
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Please enter your vehicle license plate or ID';
                        }
                        return null;
                      },
                    ),

                    const SizedBox(height: 32),

                    // Payment Information Section
                    Row(
                      children: [
                        Icon(Icons.payment, color: Theme.of(context).primaryColor),
                        const SizedBox(width: 8),
                        Text(
                          'Payment Information',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: Theme.of(context).primaryColor,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Select how you want to receive earnings',
                      style: TextStyle(fontSize: 14, color: Colors.grey[600]),
                    ),
                    const SizedBox(height: 16),

                    // Payment Operator Dropdown
                    DropdownButtonFormField<PaymentOperator>(
                      initialValue: _selectedPaymentOperator,
                      decoration: InputDecoration(
                        labelText: 'Payment Method',
                        hintText: 'Select payment operator',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        prefixIcon: const Icon(Icons.account_balance_wallet),
                        filled: true,
                        fillColor: Colors.grey.shade50,
                      ),
                      items: _getAvailableOperators().map((operator) {
                        return DropdownMenuItem(
                          value: operator,
                          child: Row(
                            children: [
                              Icon(_getOperatorIcon(operator), size: 20),
                              const SizedBox(width: 8),
                              Text(_getOperatorDisplayName(operator)),
                            ],
                          ),
                        );
                      }).toList(),
                      onChanged: (value) {
                        setState(() {
                          _selectedPaymentOperator = value;
                        });
                      },
                      validator: (value) {
                        if (value == null) {
                          return 'Please select a payment method';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),

                    // Payment Phone Info
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.green.shade50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.green.shade200),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.info_outline, color: Colors.green.shade700, size: 20),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Your phone number above will be used for payments',
                              style: TextStyle(fontSize: 13, color: Colors.green.shade900),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Optional: Different Payment Phone
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Use a different phone number for payments'),
                      value: _useDifferentPaymentPhone,
                      onChanged: (value) {
                        setState(() {
                          _useDifferentPaymentPhone = value ?? false;
                        });
                      },
                    ),

                    if (_useDifferentPaymentPhone) ...[
                      const SizedBox(height: 8),
                      AuthTextField(
                        controller: _paymentPhoneController,
                        label: 'Payment Phone Number',
                        keyboardType: TextInputType.phone,
                        prefixIcon: Icons.phone,
                        validator: (value) {
                          if (_useDifferentPaymentPhone && (value == null || value.isEmpty)) {
                            return 'Please enter payment phone number';
                          }
                          return null;
                        },
                      ),
                    ],

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
                    
                    // Continue to Payment Method Button
                    AuthButton(
                      text: 'Continue',
                      backgroundColor: const Color(0xFF4CAF50),
                      isLoading: state is AuthLoading,
                      onPressed: () {
                        if (_formKey.currentState!.validate()) {
                          _proceedWithRegistration();
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
                              color: Color(0xFF4CAF50),
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