import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:pharmapp_shared/services/unified_auth_service.dart';
import 'package:pharmapp_shared/models/payment_preferences.dart';
import 'package:pharmapp_shared/models/country_config.dart';
import '../../blocs/unified_auth_bloc.dart';

/// Unified Registration Screen for all user types
///
/// Features:
/// - Multi-role support (pharmacy, courier, admin)
/// - Encrypted payment preferences integration
/// - Role-specific fields that adapt based on user type
/// - Payment operator selection
/// - Complete form validation
/// - Integration with UnifiedAuthService and UnifiedAuthBloc
class UnifiedRegistrationScreen extends StatefulWidget {
  final UserType userType;
  final Country selectedCountry;
  final String selectedCity;

  const UnifiedRegistrationScreen({
    super.key,
    required this.userType,
    required this.selectedCountry,
    required this.selectedCity,
  });

  @override
  State<UnifiedRegistrationScreen> createState() =>
      _UnifiedRegistrationScreenState();
}

class _UnifiedRegistrationScreenState
    extends State<UnifiedRegistrationScreen> {
  final _formKey = GlobalKey<FormState>();

  // COMMON CONTROLLERS (all user types)
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _phoneController = TextEditingController();

  // PAYMENT CONTROLLERS
  final _paymentPhoneController = TextEditingController();
  PaymentOperator? _selectedPaymentOperator;
  bool _useDifferentPaymentPhone = false;

  // PHARMACY-SPECIFIC CONTROLLERS
  final _pharmacyNameController = TextEditingController();
  final _addressController = TextEditingController();

  // COURIER-SPECIFIC CONTROLLERS
  final _fullNameController = TextEditingController();
  final _licensePlateController = TextEditingController();
  String _selectedVehicleType = 'Motorcycle';

  // ADMIN-SPECIFIC CONTROLLERS
  final _adminNameController = TextEditingController();
  final _departmentController = TextEditingController();

  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;
  bool _isLoading = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _phoneController.dispose();
    _paymentPhoneController.dispose();
    _pharmacyNameController.dispose();
    _addressController.dispose();
    _fullNameController.dispose();
    _licensePlateController.dispose();
    _adminNameController.dispose();
    _departmentController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_getScreenTitle()),
        elevation: 0,
      ),
      body: BlocListener<UnifiedAuthBloc, UnifiedAuthState>(
        listener: (context, state) {
          if (state is Authenticated) {
            // Navigate to appropriate dashboard based on role
            _navigateToDashboard(state.userType);
          } else if (state is AuthError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.error),
                backgroundColor: Colors.red,
              ),
            );
            setState(() => _isLoading = false);
          }
        },
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // STEP INDICATOR
                _buildStepIndicator(),
                const SizedBox(height: 32),

                // COMMON FIELDS SECTION
                _buildSectionHeader('Account Information', Icons.person),
                const SizedBox(height: 16),
                _buildCommonFields(),

                const SizedBox(height: 32),

                // ROLE-SPECIFIC FIELDS SECTION
                _buildSectionHeader(
                    _getRoleSpecificSectionTitle(), _getRoleSpecificIcon()),
                const SizedBox(height: 16),
                _buildRoleSpecificFields(),

                const SizedBox(height: 32),

                // PAYMENT SECTION
                _buildSectionHeader('Payment Information', Icons.payment),
                const SizedBox(height: 16),
                _buildPaymentSection(),

                const SizedBox(height: 32),

                // SUBMIT BUTTON
                _buildSubmitButton(),

                const SizedBox(height: 16),

                // LOGIN LINK
                _buildLoginLink(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _getScreenTitle() {
    switch (widget.userType) {
      case UserType.pharmacy:
        return 'Pharmacy Registration';
      case UserType.courier:
        return 'Courier Registration';
      case UserType.admin:
        return 'Admin Registration';
    }
  }

  String _getRoleSpecificSectionTitle() {
    switch (widget.userType) {
      case UserType.pharmacy:
        return 'Pharmacy Details';
      case UserType.courier:
        return 'Courier Details';
      case UserType.admin:
        return 'Admin Details';
    }
  }

  IconData _getRoleSpecificIcon() {
    switch (widget.userType) {
      case UserType.pharmacy:
        return Icons.local_pharmacy;
      case UserType.courier:
        return Icons.delivery_dining;
      case UserType.admin:
        return Icons.admin_panel_settings;
    }
  }

  Widget _buildStepIndicator() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).primaryColor.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(
            Icons.check_circle,
            color: Theme.of(context).primaryColor,
            size: 24,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Step 2 of 2: Complete Registration',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Theme.of(context).primaryColor,
                  ),
                ),
                Text(
                  'Location: ${widget.selectedCity}, ${_getCountryName()}',
                  style: TextStyle(
                    fontSize: 13,
                    color: Colors.grey[600],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _getCountryName() {
    switch (widget.selectedCountry) {
      case Country.cameroon:
        return 'Cameroon';
      case Country.kenya:
        return 'Kenya';
      case Country.tanzania:
        return 'Tanzania';
      case Country.uganda:
        return 'Uganda';
      case Country.nigeria:
        return 'Nigeria';
    }
  }

  Widget _buildSectionHeader(String title, IconData icon) {
    return Row(
      children: [
        Icon(icon, color: Theme.of(context).primaryColor),
        const SizedBox(width: 8),
        Text(
          title,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: Theme.of(context).primaryColor,
          ),
        ),
      ],
    );
  }

  // COMMON FIELDS (all user types use these)
  Widget _buildCommonFields() {
    return Column(
      children: [
        // Email
        TextFormField(
          controller: _emailController,
          decoration: InputDecoration(
            labelText: 'Email',
            hintText: 'Enter your email',
            prefixIcon: const Icon(Icons.email),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
          keyboardType: TextInputType.emailAddress,
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

        // Password
        TextFormField(
          controller: _passwordController,
          decoration: InputDecoration(
            labelText: 'Password',
            hintText: 'Enter your password',
            prefixIcon: const Icon(Icons.lock),
            suffixIcon: IconButton(
              icon: Icon(
                  _obscurePassword ? Icons.visibility : Icons.visibility_off),
              onPressed: () =>
                  setState(() => _obscurePassword = !_obscurePassword),
            ),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
          obscureText: _obscurePassword,
          validator: (value) {
            if (value == null || value.isEmpty) {
              return 'Please enter a password';
            }
            if (value.length < 8) {
              return 'Password must be at least 8 characters';
            }
            return null;
          },
        ),
        const SizedBox(height: 16),

        // Confirm Password
        TextFormField(
          controller: _confirmPasswordController,
          decoration: InputDecoration(
            labelText: 'Confirm Password',
            hintText: 'Re-enter your password',
            prefixIcon: const Icon(Icons.lock_outline),
            suffixIcon: IconButton(
              icon: Icon(_obscureConfirmPassword
                  ? Icons.visibility
                  : Icons.visibility_off),
              onPressed: () => setState(
                  () => _obscureConfirmPassword = !_obscureConfirmPassword),
            ),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
          obscureText: _obscureConfirmPassword,
          validator: (value) {
            if (value != _passwordController.text) {
              return 'Passwords do not match';
            }
            return null;
          },
        ),
        const SizedBox(height: 16),

        // Phone Number
        TextFormField(
          controller: _phoneController,
          decoration: InputDecoration(
            labelText: 'Phone Number',
            hintText: 'Enter your phone number',
            prefixIcon: const Icon(Icons.phone),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
          keyboardType: TextInputType.phone,
          validator: (value) {
            if (value == null || value.isEmpty) {
              return 'Please enter your phone number';
            }
            return null;
          },
        ),
      ],
    );
  }

  // ROLE-SPECIFIC FIELDS
  Widget _buildRoleSpecificFields() {
    switch (widget.userType) {
      case UserType.pharmacy:
        return _buildPharmacyFields();
      case UserType.courier:
        return _buildCourierFields();
      case UserType.admin:
        return _buildAdminFields();
    }
  }

  Widget _buildPharmacyFields() {
    return Column(
      children: [
        // Pharmacy Name
        TextFormField(
          controller: _pharmacyNameController,
          decoration: InputDecoration(
            labelText: 'Pharmacy Name',
            hintText: 'Enter pharmacy name',
            prefixIcon: const Icon(Icons.local_pharmacy),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
          validator: (value) {
            if (value == null || value.isEmpty) {
              return 'Please enter pharmacy name';
            }
            return null;
          },
        ),
        const SizedBox(height: 16),

        // Address
        TextFormField(
          controller: _addressController,
          decoration: InputDecoration(
            labelText: 'Address',
            hintText: 'Enter pharmacy address',
            prefixIcon: const Icon(Icons.location_on),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
          maxLines: 2,
          validator: (value) {
            if (value == null || value.isEmpty) {
              return 'Please enter address';
            }
            return null;
          },
        ),
      ],
    );
  }

  Widget _buildCourierFields() {
    return Column(
      children: [
        // Full Name
        TextFormField(
          controller: _fullNameController,
          decoration: InputDecoration(
            labelText: 'Full Name',
            hintText: 'Enter your full name',
            prefixIcon: const Icon(Icons.person),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
          validator: (value) {
            if (value == null || value.isEmpty) {
              return 'Please enter your full name';
            }
            return null;
          },
        ),
        const SizedBox(height: 16),

        // Vehicle Type
        DropdownButtonFormField<String>(
          initialValue: _selectedVehicleType,
          decoration: InputDecoration(
            labelText: 'Vehicle Type',
            prefixIcon: const Icon(Icons.directions_bike),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
          items: ['Motorcycle', 'Bicycle', 'Car', 'Scooter', 'Van', 'Other']
              .map((vehicle) => DropdownMenuItem(
                    value: vehicle,
                    child: Text(vehicle),
                  ))
              .toList(),
          onChanged: (value) {
            if (value != null) {
              setState(() => _selectedVehicleType = value);
            }
          },
        ),
        const SizedBox(height: 16),

        // License Plate
        TextFormField(
          controller: _licensePlateController,
          decoration: InputDecoration(
            labelText: 'License Plate',
            hintText: 'Enter vehicle license plate',
            prefixIcon: const Icon(Icons.credit_card),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
          validator: (value) {
            if (value == null || value.isEmpty) {
              return 'Please enter license plate';
            }
            return null;
          },
        ),
      ],
    );
  }

  Widget _buildAdminFields() {
    return Column(
      children: [
        // Admin Name
        TextFormField(
          controller: _adminNameController,
          decoration: InputDecoration(
            labelText: 'Admin Name',
            hintText: 'Enter your name',
            prefixIcon: const Icon(Icons.admin_panel_settings),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
          validator: (value) {
            if (value == null || value.isEmpty) {
              return 'Please enter your name';
            }
            return null;
          },
        ),
        const SizedBox(height: 16),

        // Department
        TextFormField(
          controller: _departmentController,
          decoration: InputDecoration(
            labelText: 'Department',
            hintText: 'Enter your department',
            prefixIcon: const Icon(Icons.business),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
      ],
    );
  }

  // PAYMENT SECTION
  Widget _buildPaymentSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _getPaymentSectionDescription(),
          style: TextStyle(fontSize: 14, color: Colors.grey[600]),
        ),
        const SizedBox(height: 16),

        // Payment Operator Dropdown
        DropdownButtonFormField<PaymentOperator>(
          initialValue: _selectedPaymentOperator,
          decoration: InputDecoration(
            labelText: 'Payment Method',
            hintText: 'Select payment operator',
            prefixIcon: const Icon(Icons.account_balance_wallet),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
          items: _getAvailableOperators()
              .map((operator) => DropdownMenuItem(
                    value: operator,
                    child: Row(
                      children: [
                        Icon(_getOperatorIcon(operator), size: 20),
                        const SizedBox(width: 8),
                        Text(_getOperatorDisplayName(operator)),
                      ],
                    ),
                  ))
              .toList(),
          onChanged: (value) {
            setState(() => _selectedPaymentOperator = value);
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
            color: Colors.blue.shade50,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.blue.shade200),
          ),
          child: Row(
            children: [
              Icon(Icons.info_outline, color: Colors.blue.shade700, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Your phone number above will be used for payments',
                  style: TextStyle(fontSize: 13, color: Colors.blue.shade900),
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
            setState(() => _useDifferentPaymentPhone = value ?? false);
          },
        ),

        if (_useDifferentPaymentPhone) ...[
          const SizedBox(height: 8),
          TextFormField(
            controller: _paymentPhoneController,
            decoration: InputDecoration(
              labelText: 'Payment Phone Number',
              hintText: 'Enter phone for payments',
              prefixIcon: const Icon(Icons.phone),
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
            keyboardType: TextInputType.phone,
            validator: (value) {
              if (_useDifferentPaymentPhone &&
                  (value == null || value.isEmpty)) {
                return 'Please enter payment phone number';
              }
              return null;
            },
          ),
        ],
      ],
    );
  }

  String _getPaymentSectionDescription() {
    switch (widget.userType) {
      case UserType.pharmacy:
        return 'Select how you want to receive payments from customers';
      case UserType.courier:
        return 'Select how you want to receive your delivery earnings';
      case UserType.admin:
        return 'Select your payment method';
    }
  }

  // Payment helper methods
  List<PaymentOperator> _getAvailableOperators() {
    final config = _getCountryConfig();
    return config?.availableOperators ?? [];
  }

  CountryConfig? _getCountryConfig() {
    return Countries.getByCountry(widget.selectedCountry);
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
    final config = _getCountryConfig();
    if (config == null) return operator.toString();

    final operatorConfig = config.getOperatorConfig(operator);
    return operatorConfig?.displayName ?? operator.toString().split('.').last;
  }

  Widget _buildSubmitButton() {
    return ElevatedButton(
      onPressed: _isLoading ? null : _handleRegistration,
      style: ElevatedButton.styleFrom(
        padding: const EdgeInsets.symmetric(vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      child: _isLoading
          ? const SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Text(
              'Create ${_getAccountType()} Account',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
    );
  }

  String _getAccountType() {
    switch (widget.userType) {
      case UserType.pharmacy:
        return 'Pharmacy';
      case UserType.courier:
        return 'Courier';
      case UserType.admin:
        return 'Admin';
    }
  }

  Widget _buildLoginLink() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Text('Already have an account?'),
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Sign In'),
        ),
      ],
    );
  }

  // REGISTRATION LOGIC
  Future<void> _handleRegistration() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() => _isLoading = true);

    try {
      // Determine payment phone
      final paymentPhone = _useDifferentPaymentPhone
          ? _paymentPhoneController.text.trim()
          : _phoneController.text.trim();

      // Create payment preferences with encryption
      final paymentPreferences = PaymentPreferences.createSecure(
        method: _selectedPaymentOperator!.toString().split('.').last,
        phoneNumber: paymentPhone,
        country: widget.selectedCountry,
        operator: _selectedPaymentOperator,
        isSetupComplete: true,
      );

      // Prepare role-specific profile data
      final profileData = _buildProfileData(paymentPreferences);

      // Call unified auth service
      await UnifiedAuthService.signUp(
        email: _emailController.text.trim(),
        password: _passwordController.text,
        userType: widget.userType,
        profileData: profileData,
      );

      // Sign in automatically after registration
      if (!mounted) return;
      context.read<UnifiedAuthBloc>().add(
            SignInRequested(
              email: _emailController.text.trim(),
              password: _passwordController.text,
            ),
          );
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Registration failed: ${e.toString()}'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Map<String, dynamic> _buildProfileData(
      PaymentPreferences paymentPreferences) {
    final commonData = {
      'phoneNumber': _phoneController.text.trim(),
      'country': widget.selectedCountry.toString().split('.').last,
      'city': widget.selectedCity,
      'paymentPreferences': paymentPreferences.toMap(),
    };

    switch (widget.userType) {
      case UserType.pharmacy:
        return {
          ...commonData,
          'displayName': _pharmacyNameController.text.trim(),
          'name': _pharmacyNameController.text.trim(),
          'address': _addressController.text.trim(),
        };

      case UserType.courier:
        return {
          ...commonData,
          'displayName': _fullNameController.text.trim(),
          'name': _fullNameController.text.trim(),
          'vehicleType': _selectedVehicleType,
          'licensePlate': _licensePlateController.text.trim(),
          'operatingCity': widget.selectedCity,
        };

      case UserType.admin:
        return {
          ...commonData,
          'displayName': _adminNameController.text.trim(),
          'name': _adminNameController.text.trim(),
          'department': _departmentController.text.trim(),
        };
    }
  }

  void _navigateToDashboard(UserType userType) {
    // Navigate to appropriate dashboard
    final route = '/${userType.toString()}/dashboard';
    Navigator.of(context).pushReplacementNamed(route);
  }
}
