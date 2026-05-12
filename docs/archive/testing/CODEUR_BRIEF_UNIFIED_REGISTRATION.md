# 🏗️ CODEUR BRIEF - Create Unified Registration Screen

**Date**: 2025-10-21
**From**: Chef de Projet (@Chef) + User Decision
**To**: Développeur (@Codeur)
**Priority**: 🔴 **HIGH - ARCHITECTURE COMPLETION**
**Applications**: pharmapp_unified (then integrate to pharmacy_app + courier_app)

---

## 🎯 MISSION OBJECTIVE

Complete the unified authentication module by creating the missing unified registration screen.

**User Feedback**:
> "Check pharmapp_unified, I think there is already a module, we just need to update it with our new requirement"

**Analysis Result**: User was RIGHT!
- ✅ 70% of unified auth module exists (UnifiedAuthService, UnifiedUser, UnifiedAuthBloc)
- ❌ 30% missing: Unified registration screen
- 🎯 **Your task**: Create the missing 30% with our UX improvements integrated

---

## ✅ **WHAT ALREADY EXISTS**

### **Foundation (Production-Ready)**:

1. ✅ **`shared/lib/services/unified_auth_service.dart`** (700 lines)
   - `signUp()` method with role-based registration
   - Security: Rate limiting, validation, sanitization
   - Firestore integration with transactions
   - Complete error handling

2. ✅ **`shared/lib/models/unified_user.dart`** (200 lines)
   - `UnifiedUser` class with roleData
   - `PharmacyData` and `CourierData` classes
   - Firestore serialization

3. ✅ **`pharmapp_unified/lib/blocs/unified_auth_bloc.dart`** (250 lines)
   - Complete state management
   - Multi-role support

4. ✅ **`shared/lib/screens/auth/country_payment_selection_screen.dart`** (380 lines)
   - Country + City selection (with our Fix #2)

5. ✅ **`shared/lib/models/payment_preferences.dart`** (190 lines)
   - Payment encryption (HMAC-SHA256)

---

## 📝 **WHAT YOU NEED TO CREATE**

### **File**: `pharmapp_unified/lib/screens/auth/unified_registration_screen.dart`

**Purpose**: Single registration screen that adapts based on user type (pharmacy/courier/admin)

**Key Features**:
1. ✅ Common fields for all user types (email, password, phone)
2. ✅ Payment section (from our UX improvement)
3. ✅ Role-specific fields (pharmacy name vs courier vehicle)
4. ✅ Integration with UnifiedAuthService
5. ✅ Integration with UnifiedAuthBloc
6. ✅ Payment preferences encryption

---

## 🔧 **IMPLEMENTATION SPECIFICATION**

### **Part 1: Screen Structure**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:pharmapp_shared/services/unified_auth_service.dart';
import 'package:pharmapp_shared/models/unified_user.dart';
import 'package:pharmapp_shared/models/payment_preferences.dart';
import 'package:pharmapp_shared/models/country_config.dart';
import '../blocs/unified_auth_bloc.dart';

class UnifiedRegistrationScreen extends StatefulWidget {
  final UserType userType; // pharmacy, courier, or admin
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

  // PAYMENT CONTROLLERS (from UX improvement)
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
                _buildSectionHeader(_getRoleSpecificSectionTitle(), _getRoleSpecificIcon()),
                const SizedBox(height: 16),
                _buildRoleSpecificFields(),

                const SizedBox(height: 32),

                // PAYMENT SECTION (from UX improvement)
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
      default:
        return 'Registration';
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
      default:
        return 'Details';
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
      default:
        return Icons.person;
    }
  }

  Widget _buildStepIndicator() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).primaryColor.withOpacity(0.1),
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
            if (!value.contains('@')) {
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
              icon: Icon(_obscurePassword ? Icons.visibility : Icons.visibility_off),
              onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
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
              icon: Icon(_obscureConfirmPassword ? Icons.visibility : Icons.visibility_off),
              onPressed: () => setState(() => _obscureConfirmPassword = !_obscureConfirmPassword),
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
      default:
        return const SizedBox.shrink();
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
          value: _selectedVehicleType,
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

  // PAYMENT SECTION (from UX improvement)
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
          value: _selectedPaymentOperator,
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
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
            keyboardType: TextInputType.phone,
            validator: (value) {
              if (_useDifferentPaymentPhone && (value == null || value.isEmpty)) {
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
      default:
        return 'Select your payment method';
    }
  }

  // Payment helper methods
  List<PaymentOperator> _getAvailableOperators() {
    final config = _getCountryConfig();
    return config?.availableOperators ?? [];
  }

  CountryConfig? _getCountryConfig() {
    switch (widget.selectedCountry) {
      case Country.cameroon:
        return Countries.cameroon;
      case Country.kenya:
        return Countries.kenya;
      case Country.tanzania:
        return Countries.tanzania;
      case Country.uganda:
        return Countries.uganda;
      case Country.nigeria:
        return Countries.nigeria;
    }
  }

  IconData _getOperatorIcon(PaymentOperator operator) {
    final config = _getCountryConfig();
    if (config == null) return Icons.payment;

    final operatorConfig = config.operatorConfigs[operator];
    return operatorConfig?.icon ?? Icons.payment;
  }

  String _getOperatorDisplayName(PaymentOperator operator) {
    final config = _getCountryConfig();
    if (config == null) return operator.toString();

    final operatorConfig = config.operatorConfigs[operator];
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
      default:
        return '';
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
        city: widget.selectedCity,
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

  Map<String, dynamic> _buildProfileData(PaymentPreferences paymentPreferences) {
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

      default:
        return commonData;
    }
  }

  void _navigateToDashboard(UserType userType) {
    // TODO: Navigate to appropriate dashboard
    // This will be implemented when connecting to actual dashboard screens
    Navigator.of(context).pushReplacementNamed('/${userType.toString()}/dashboard');
  }
}
```

---

## ✅ **DELIVERABLES**

1. **Create File**: `pharmapp_unified/lib/screens/auth/unified_registration_screen.dart`
2. **Export in Main**: Add to `pharmapp_unified/lib/screens/auth/auth_screens.dart` (create if needed)
3. **Tests**: Create unit tests for unified registration
4. **Documentation**: Update code_explanation_unified_auth_module.md

---

## 🧪 **TESTING REQUIREMENTS**

### **Unit Tests** (create in `pharmapp_unified/test/screens/auth/`):

1. **Test Common Fields Render**
2. **Test Pharmacy Fields Render** (when userType = pharmacy)
3. **Test Courier Fields Render** (when userType = courier)
4. **Test Admin Fields Render** (when userType = admin)
5. **Test Payment Section Renders**
6. **Test Form Validation**
7. **Test Registration Flow**

---

## ⚡ **SUCCESS CRITERIA**

- [ ] File created: `unified_registration_screen.dart` (~600 lines)
- [ ] Common fields work for all user types
- [ ] Role-specific fields switch based on userType
- [ ] Payment section integrated (from UX improvement)
- [ ] UnifiedAuthService integration working
- [ ] Form validation working
- [ ] `flutter analyze` passes (0 errors)
- [ ] Unit tests created and passing
- [ ] Documentation updated

---

## 📝 **NOTES**

**Reuse These Implementations**:
1. ✅ Payment section UI - From pharmacy_app register_screen.dart (lines 450-600)
2. ✅ Form validation - From existing register screens
3. ✅ Common fields - From pharmacy_app/courier_app

**Key Integration Points**:
- `UnifiedAuthService.signUp()` - Already exists
- `PaymentPreferences.createSecure()` - Already exists
- `UnifiedAuthBloc.SignInRequested` - Already exists

**After This File is Created**:
- Next step: Update pharmacy_app to use this screen
- Next step: Update courier_app to use this screen
- Result: Eliminate 1,302 lines of duplicate code!

---

**BON COURAGE @Codeur!** This completes the unified auth module! 🚀
