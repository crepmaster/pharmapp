import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:pharmapp_shared/services/unified_auth_service.dart';
import 'package:pharmapp_shared/models/payment_preferences.dart';
import 'package:pharmapp_shared/models/master_data_snapshot.dart';
import 'package:pharmapp_shared/services/master_data_service.dart';
import '../../blocs/unified_auth_bloc.dart';
import '../../services/subscription_creation_service.dart';

// ---------------------------------------------------------------------------
// Static helpers — no enum dependency on Country / PaymentOperator
// ---------------------------------------------------------------------------

/// ISO 3166-1 alpha-2 → default currency code.
const _countryCurrencyMap = {
  'CM': 'XAF',
  'KE': 'KES',
  'TZ': 'TZS',
  'UG': 'UGX',
  'NG': 'NGN',
};

/// ISO 3166-1 alpha-2 → legacy Country enum name expected by existing readers.
///
/// Legacy readers (subscription_screen.dart, payment_preferences.fromMap, etc.)
/// parse the `country` Firestore field as a Country enum name string.
/// This map ensures backward compat: `country` keeps writing 'cameroon', not 'CM'.
const _isoToCountryEnumName = {
  'CM': 'cameroon',
  'KE': 'kenya',
  'TZ': 'tanzania',
  'UG': 'uganda',
  'NG': 'nigeria',
};

/// Builds the Firestore profile map for a new user registration.
///
/// Writes both canonical fields (countryCode, cityCode) and legacy fields
/// (country, city) in the format expected by existing readers:
///   - `country`: legacy Country enum name string (e.g. 'cameroon'), NOT ISO code
///   - `city`: human-readable city display name (e.g. 'Douala'), NOT slug
///
/// [cityDisplayName] must be the human-readable city name. Callers derive it
/// from MasterDataService (or fall back to cityCode when MasterData is absent).
Map<String, dynamic> buildUnifiedRegistrationProfileData({
  required UserType userType,
  required String phoneNumber,
  required String countryCode,
  required String cityCode,
  required String cityDisplayName,
  required PaymentPreferences paymentPreferences,
  String pharmacyName = '',
  String address = '',
  String fullName = '',
  String vehicleType = 'Motorcycle',
  String licensePlate = '',
  String adminName = '',
  String department = '',
}) {
  final commonData = {
    'phoneNumber': phoneNumber.trim(),
    // Canonical fields (Sprint 2A):
    'countryCode': countryCode,
    'cityCode': cityCode,
    // Legacy fields — written in OLD format so existing readers keep working:
    'country': _isoToCountryEnumName[countryCode] ?? countryCode.toLowerCase(),
    'city': cityDisplayName,
    'paymentPreferences': paymentPreferences.toMap(),
  };

  switch (userType) {
    case UserType.pharmacy:
      return {
        ...commonData,
        'pharmacyName': pharmacyName.trim(),
        'displayName': pharmacyName.trim(),
        'name': pharmacyName.trim(),
        'address': address.trim(),
        'latitude': 0.0,
        'longitude': 0.0,
      };

    case UserType.courier:
      return {
        ...commonData,
        'fullName': fullName.trim(),
        'displayName': fullName.trim(),
        'name': fullName.trim(),
        'vehicleType': vehicleType,
        'licensePlate': licensePlate.trim(),
        // operatingCity uses display name for compat with delivery_service city filter.
        'operatingCity': cityDisplayName,
      };

    case UserType.admin:
      return {
        ...commonData,
        'displayName': adminName.trim(),
        'name': adminName.trim(),
        'department': department.trim(),
      };
  }
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

/// Unified Registration Screen for all user types.
///
/// Accepts canonical string identifiers from [CountryPaymentSelectionScreen]:
///   - [countryCode]: ISO 3166-1 alpha-2 (e.g. "CM")
///   - [cityCode]: stable slug (e.g. "douala")
///
/// Loads [MasterDataService] (already cached) to display available payment
/// providers for the selected country.
class UnifiedRegistrationScreen extends StatefulWidget {
  final UserType userType;

  /// ISO 3166-1 alpha-2 code, e.g. "CM"
  final String countryCode;

  /// Stable city slug, e.g. "douala"
  final String cityCode;

  const UnifiedRegistrationScreen({
    super.key,
    required this.userType,
    required this.countryCode,
    required this.cityCode,
  });

  @override
  State<UnifiedRegistrationScreen> createState() =>
      _UnifiedRegistrationScreenState();
}

class _UnifiedRegistrationScreenState
    extends State<UnifiedRegistrationScreen> {
  final _formKey = GlobalKey<FormState>();

  // COMMON CONTROLLERS
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _phoneController = TextEditingController();

  // PAYMENT CONTROLLERS
  final _paymentPhoneController = TextEditingController();
  String? _selectedProviderId;
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

  // Master data (loaded from cache — already warm from previous screen).
  MasterDataSnapshot? _masterData;

  @override
  void initState() {
    super.initState();
    _loadMasterData();
  }

  Future<void> _loadMasterData() async {
    final snapshot = await MasterDataService.load();
    if (!mounted) return;
    setState(() => _masterData = snapshot);
  }

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
                _buildStepIndicator(),
                const SizedBox(height: 32),

                _buildSectionHeader('Account Information', Icons.person),
                const SizedBox(height: 16),
                _buildCommonFields(),

                const SizedBox(height: 32),

                _buildSectionHeader(
                    _getRoleSpecificSectionTitle(), _getRoleSpecificIcon()),
                const SizedBox(height: 16),
                _buildRoleSpecificFields(),

                const SizedBox(height: 32),

                _buildSectionHeader('Payment Information', Icons.payment),
                const SizedBox(height: 16),
                _buildPaymentSection(),

                const SizedBox(height: 32),

                _buildSubmitButton(),

                const SizedBox(height: 16),

                _buildLoginLink(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // HEADER HELPERS
  // ---------------------------------------------------------------------------

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

  String _getCountryDisplayName() {
    // Use MasterData name if available, otherwise fall back to code.
    return _masterData?.countries[widget.countryCode]?.name ??
        widget.countryCode;
  }

  String _getCityDisplayName() {
    return _masterData
            ?.citiesByCountry[widget.countryCode]?[widget.cityCode]
            ?.name ??
        widget.cityCode;
  }

  // ---------------------------------------------------------------------------
  // WIDGETS
  // ---------------------------------------------------------------------------

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
                  'Location: ${_getCityDisplayName()}, ${_getCountryDisplayName()}',
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
            border:
                OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
          keyboardType: TextInputType.emailAddress,
          validator: (value) {
            if (value == null || value.isEmpty) return 'Please enter your email';
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
            border:
                OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
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
            border:
                OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
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
            border:
                OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
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
        TextFormField(
          controller: _pharmacyNameController,
          decoration: InputDecoration(
            labelText: 'Pharmacy Name',
            hintText: 'Enter pharmacy name',
            prefixIcon: const Icon(Icons.local_pharmacy),
            border:
                OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
          validator: (value) {
            if (value == null || value.isEmpty) {
              return 'Please enter pharmacy name';
            }
            return null;
          },
        ),
        const SizedBox(height: 16),
        TextFormField(
          controller: _addressController,
          decoration: InputDecoration(
            labelText: 'Address',
            hintText: 'Enter pharmacy address',
            prefixIcon: const Icon(Icons.location_on),
            border:
                OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
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
        TextFormField(
          controller: _fullNameController,
          decoration: InputDecoration(
            labelText: 'Full Name',
            hintText: 'Enter your full name',
            prefixIcon: const Icon(Icons.person),
            border:
                OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
          validator: (value) {
            if (value == null || value.isEmpty) {
              return 'Please enter your full name';
            }
            return null;
          },
        ),
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
          initialValue: _selectedVehicleType,
          decoration: InputDecoration(
            labelText: 'Vehicle Type',
            prefixIcon: const Icon(Icons.directions_bike),
            border:
                OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
          items: ['Motorcycle', 'Bicycle', 'Car', 'Scooter', 'Van', 'Other']
              .map((v) => DropdownMenuItem(value: v, child: Text(v)))
              .toList(),
          onChanged: (value) {
            if (value != null) setState(() => _selectedVehicleType = value);
          },
        ),
        const SizedBox(height: 16),
        TextFormField(
          controller: _licensePlateController,
          decoration: InputDecoration(
            labelText: 'License Plate',
            hintText: 'Enter vehicle license plate',
            prefixIcon: const Icon(Icons.credit_card),
            border:
                OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
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
        TextFormField(
          controller: _adminNameController,
          decoration: InputDecoration(
            labelText: 'Admin Name',
            hintText: 'Enter your name',
            prefixIcon: const Icon(Icons.admin_panel_settings),
            border:
                OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
          validator: (value) {
            if (value == null || value.isEmpty) {
              return 'Please enter your name';
            }
            return null;
          },
        ),
        const SizedBox(height: 16),
        TextFormField(
          controller: _departmentController,
          decoration: InputDecoration(
            labelText: 'Department',
            hintText: 'Enter your department',
            prefixIcon: const Icon(Icons.business),
            border:
                OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // PAYMENT SECTION
  // ---------------------------------------------------------------------------

  Widget _buildPaymentSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _getPaymentSectionDescription(),
          style: TextStyle(fontSize: 14, color: Colors.grey[600]),
        ),
        const SizedBox(height: 16),

        _buildProviderDropdown(),

        const SizedBox(height: 16),

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
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12)),
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

  Widget _buildProviderDropdown() {
    final providers = _masterData?.getEnabledProviders(widget.countryCode) ?? [];

    if (providers.isEmpty) {
      // Fallback message while master data loads or no providers configured.
      return DropdownButtonFormField<String>(
        initialValue: _selectedProviderId,
        decoration: InputDecoration(
          labelText: 'Payment Method',
          hintText: 'Loading payment options…',
          prefixIcon: const Icon(Icons.account_balance_wallet),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        ),
        items: const [],
        onChanged: null,
        validator: (value) {
          if (value == null) return 'Please select a payment method';
          return null;
        },
      );
    }

    // Deduplicate by id (safety guard against malformed config).
    final seen = <String>{};
    final unique = providers.where((p) => seen.add(p.id)).toList();

    return DropdownButtonFormField<String>(
      initialValue: _selectedProviderId,
      decoration: InputDecoration(
        labelText: 'Payment Method',
        hintText: 'Select payment operator',
        prefixIcon: const Icon(Icons.account_balance_wallet),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      ),
      items: unique
          .map((p) => DropdownMenuItem<String>(
                value: p.id,
                child: Row(
                  children: [
                    Icon(_providerIcon(p.methodCode), size: 20),
                    const SizedBox(width: 8),
                    Text(p.name),
                  ],
                ),
              ))
          .toList(),
      onChanged: (value) => setState(() => _selectedProviderId = value),
      validator: (value) {
        if (value == null) return 'Please select a payment method';
        return null;
      },
    );
  }

  IconData _providerIcon(String methodCode) {
    final code = methodCode.toLowerCase();
    if (code.contains('mtn')) return Icons.phone_android;
    if (code.contains('orange')) return Icons.phone_iphone;
    if (code.contains('mpesa') || code.contains('airtel')) {
      return Icons.account_balance_wallet;
    }
    return Icons.payment;
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

  // ---------------------------------------------------------------------------
  // FORM ACTIONS
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // REGISTRATION LOGIC
  // ---------------------------------------------------------------------------

  Future<void> _handleRegistration() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    try {
      // Resolve the selected provider to obtain methodCode.
      // Fail closed: if the provider cannot be resolved or has no methodCode,
      // block submission — never write an incoherent PaymentPreferences to Firestore.
      final provider = _masterData?.providers[_selectedProviderId];
      if (provider == null || provider.methodCode.trim().isEmpty) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
                'Payment method configuration unavailable. Please try again.'),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }

      final paymentPhone = _useDifferentPaymentPhone
          ? _paymentPhoneController.text.trim()
          : _phoneController.text.trim();

      final paymentPreferences = PaymentPreferences.createSecure(
        // method = methodCode from the provider (the payment rail identifier),
        // NOT the providerId.  providerId is the stable config key ("mtn_cm");
        // methodCode is the payment method string ("mtn_cameroon", "mpesa_kenya"…).
        method: provider.methodCode,
        phoneNumber: paymentPhone,
        countryCode: widget.countryCode,
        providerId: _selectedProviderId,
        isSetupComplete: true,
      );

      final profileData = _buildProfileData(paymentPreferences);

      final userCredential = await UnifiedAuthService.signUp(
        email: _emailController.text.trim(),
        password: _passwordController.text,
        userType: widget.userType,
        profileData: profileData,
      );

      // Create 30-day trial subscription for new pharmacies.
      if (widget.userType == UserType.pharmacy && userCredential?.user != null) {
        final currency =
            _countryCurrencyMap[widget.countryCode] ??
            _masterData?.countries[widget.countryCode]?.defaultCurrencyCode ??
            'XAF';

        await SubscriptionCreationService.createTrialSubscription(
          userCredential!.user!.uid,
          currency: currency,
        );
      }

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
    return buildUnifiedRegistrationProfileData(
      userType: widget.userType,
      phoneNumber: _phoneController.text,
      countryCode: widget.countryCode,
      cityCode: widget.cityCode,
      cityDisplayName: _getCityDisplayName(),
      paymentPreferences: paymentPreferences,
      pharmacyName: _pharmacyNameController.text,
      address: _addressController.text,
      fullName: _fullNameController.text,
      vehicleType: _selectedVehicleType,
      licensePlate: _licensePlateController.text,
      adminName: _adminNameController.text,
      department: _departmentController.text,
    );
  }

  void _navigateToDashboard(UserType userType) {
    // Pop all registration screens — AuthWrapper will navigate to dashboard.
    Navigator.of(context).popUntil((route) => route.isFirst);
  }
}
