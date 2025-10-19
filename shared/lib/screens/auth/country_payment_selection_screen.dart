/// Country and Payment Method Selection Screen
/// Multi-country support for PharmApp Mobile
///
/// Features:
/// - Country selection (Cameroon, Kenya, Tanzania, Uganda, Nigeria)
/// - Dynamic payment operator loading based on selected country
/// - Phone number prefix display
/// - Currency display
/// - Automatic phone number validation
/// - Encrypted payment preferences creation

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../models/country_config.dart';
import '../../models/payment_preferences.dart';

class CountryPaymentSelectionScreen extends StatefulWidget {
  final String title;
  final String subtitle;
  final bool allowSkip;
  final Function(PaymentPreferences) onPaymentMethodSelected;

  const CountryPaymentSelectionScreen({
    super.key,
    required this.title,
    required this.subtitle,
    this.allowSkip = false,
    required this.onPaymentMethodSelected,
  });

  @override
  State<CountryPaymentSelectionScreen> createState() =>
      _CountryPaymentSelectionScreenState();
}

class _CountryPaymentSelectionScreenState
    extends State<CountryPaymentSelectionScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();

  Country? _selectedCountry;
  CountryConfig? _countryConfig;
  PaymentOperator? _selectedOperator;
  OperatorConfig? _operatorConfig;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    // Default to Cameroon for backwards compatibility
    _selectCountry(Country.cameroon);
  }

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  void _selectCountry(Country country) {
    setState(() {
      _selectedCountry = country;
      _countryConfig = Countries.getByCountry(country);
      _selectedOperator = null; // Reset operator when country changes
      _operatorConfig = null;
      _phoneController.clear(); // Clear phone when country changes
    });
  }

  void _selectOperator(PaymentOperator operator) {
    setState(() {
      _selectedOperator = operator;
      _operatorConfig = _countryConfig?.getOperatorConfig(operator);
    });
  }

  /// Safe color parser to prevent runtime crashes from malformed hex colors
  Color _parseColor(String hexColor, Color fallback) {
    try {
      return Color(int.parse(hexColor.replaceFirst('#', '0xFF')));
    } catch (e) {
      return fallback;
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    if (_selectedCountry == null || _selectedOperator == null) {
      if (!mounted) return; // ✅ FIX: Add mounted check
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select a country and payment operator'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      // ✅ FIX: Sanitize input to remove non-digits (except +)
      final phoneNumber = _phoneController.text
          .trim()
          .replaceAll(RegExp(r'[^\d+]'), '');

      // Validate phone number
      if (_countryConfig != null && _selectedOperator != null) {
        if (!_countryConfig!.isValidPhoneNumber(phoneNumber, _selectedOperator!)) {
          if (!mounted) return; // ✅ FIX: Add mounted check
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                  'Invalid ${_operatorConfig?.displayName ?? "selected operator"} number. '
                  'Must start with: ${_operatorConfig?.validPrefixes.take(3).join(", ")}...'),
              backgroundColor: Colors.red,
            ),
          );
          if (mounted) {
            setState(() {
              _isLoading = false;
            });
          }
          return;
        }
      }

      // Create secure payment preferences
      final preferences = PaymentPreferences.createSecure(
        method: _selectedOperator!.toString().split('.').last,
        phoneNumber: phoneNumber,
        country: _selectedCountry,
        operator: _selectedOperator,
        isSetupComplete: true,
      );

      if (!mounted) return; // ✅ FIX: Add mounted check before callback
      widget.onPaymentMethodSelected(preferences);
    } catch (e) {
      if (!mounted) return; // ✅ FIX: Add mounted check
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error: ${e.toString()}'),
          backgroundColor: Colors.red,
        ),
      );
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Header
                Text(
                  widget.subtitle,
                  style: TextStyle(
                    fontSize: 16,
                    color: Colors.grey[600],
                  ),
                  textAlign: TextAlign.center,
                ),

                const SizedBox(height: 32),

                // Country Selection
                _buildSectionHeader('Select Your Country'),
                const SizedBox(height: 16),
                _buildCountryGrid(),

                const SizedBox(height: 32),

                // Selected Country Info
                if (_countryConfig != null) ...[
                  _buildSelectedCountryCard(),
                  const SizedBox(height: 24),
                ],

                // Payment Operator Selection
                if (_countryConfig != null) ...[
                  _buildSectionHeader('Select Payment Method'),
                  const SizedBox(height: 16),
                  _buildOperatorsList(),
                  const SizedBox(height: 24),
                ],

                // Phone Number Input
                if (_selectedOperator != null) ...[
                  _buildSectionHeader('Enter Mobile Money Number'),
                  const SizedBox(height: 16),
                  _buildPhoneNumberInput(),
                  const SizedBox(height: 32),
                ],

                // Submit Button
                if (_selectedOperator != null)
                  ElevatedButton(
                    onPressed: _isLoading ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _operatorConfig != null
                          ? _parseColor(_operatorConfig!.primaryColor, Theme.of(context).primaryColor)
                          : Theme.of(context).primaryColor,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.all(16),
                      minimumSize: const Size(double.infinity, 56),
                    ),
                    child: _isLoading
                        ? const CircularProgressIndicator(color: Colors.white)
                        : const Text(
                            'Continue',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                  ),

                // Skip Button (if allowed)
                if (widget.allowSkip) ...[
                  const SizedBox(height: 16),
                  TextButton(
                    onPressed: () {
                      widget.onPaymentMethodSelected(PaymentPreferences.empty());
                    },
                    child: const Text('Skip for now'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.bold,
      ),
    );
  }

  Widget _buildCountryGrid() {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        childAspectRatio: 2.5,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
      ),
      itemCount: Countries.all.length,
      itemBuilder: (context, index) {
        final country = Countries.all[index];
        final isSelected = _selectedCountry == country.country;

        return InkWell(
          onTap: () => _selectCountry(country.country),
          child: Container(
            decoration: BoxDecoration(
              border: Border.all(
                color: isSelected
                    ? Theme.of(context).primaryColor
                    : Colors.grey[300]!,
                width: isSelected ? 2 : 1,
              ),
              borderRadius: BorderRadius.circular(12),
              color: isSelected
                  ? Theme.of(context).primaryColor.withValues(alpha: 0.1)
                  : Colors.white,
            ),
            padding: const EdgeInsets.all(12),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  _getCountryFlag(country.country),
                  style: const TextStyle(fontSize: 24),
                ),
                const SizedBox(height: 4),
                Text(
                  country.name,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                    color: isSelected ? Theme.of(context).primaryColor : Colors.black,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildSelectedCountryCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.blue[50],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.blue[200]!),
      ),
      child: Row(
        children: [
          Text(
            _getCountryFlag(_selectedCountry!),
            style: const TextStyle(fontSize: 32),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _countryConfig!.name,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Currency: ${_countryConfig!.currency} (${_countryConfig!.currencySymbol})',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey[700],
                  ),
                ),
                Text(
                  'Country Code: +${_countryConfig!.countryCode}',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey[700],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOperatorsList() {
    return Column(
      children: _countryConfig!.availableOperators.map((operator) {
        final config = _countryConfig!.getOperatorConfig(operator);
        if (config == null) return const SizedBox.shrink();

        final isSelected = _selectedOperator == operator;

        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          child: InkWell(
            onTap: () => _selectOperator(operator),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                border: Border.all(
                  color: isSelected
                      ? _parseColor(config.primaryColor, Theme.of(context).primaryColor)
                      : Colors.grey[300]!,
                  width: isSelected ? 2 : 1,
                ),
                borderRadius: BorderRadius.circular(12),
                color: isSelected
                    ? _parseColor(config.primaryColor, Theme.of(context).primaryColor)
                        .withValues(alpha: 0.1)
                    : Colors.white,
              ),
              child: Row(
                children: [
                  // Icon placeholder (you can add actual logos later)
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: _parseColor(config.primaryColor, Colors.grey)
                          .withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Center(
                      child: Text(
                        config.name.substring(0, 1),
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: _parseColor(config.primaryColor, Colors.grey),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          config.displayName,
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: isSelected
                                ? _parseColor(config.primaryColor, Theme.of(context).primaryColor)
                                : Colors.black,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Prefixes: ${config.validPrefixes.take(3).join(", ")}...',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey[600],
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (isSelected)
                    Icon(
                      Icons.check_circle,
                      color: _parseColor(config.primaryColor, Theme.of(context).primaryColor),
                      size: 28,
                    ),
                ],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildPhoneNumberInput() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.grey[100],
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              Icon(Icons.info_outline, color: Colors.blue[700], size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Enter number starting with: ${_operatorConfig?.validPrefixes.take(3).join(", ") ?? "valid prefixes"}',  // ✅ FIX CRIT-004: Null-safety check
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey[700],
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            // Country code prefix
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
              decoration: BoxDecoration(
                color: Colors.grey[200],
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.grey[300]!),
              ),
              child: Text(
                '+${_countryConfig!.countryCode}',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            const SizedBox(width: 12),
            // Phone number input
            Expanded(
              child: TextFormField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(_operatorConfig!.maxLength),
                ],
                decoration: InputDecoration(
                  hintText: 'Mobile number',
                  prefixIcon: const Icon(Icons.phone),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                  filled: true,
                  fillColor: Colors.white,
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Please enter phone number';
                  }
                  if (!_operatorConfig!.isValidLocalNumber(value)) {
                    return 'Invalid number for ${_operatorConfig!.displayName}';
                  }
                  return null;
                },
              ),
            ),
          ],
        ),
      ],
    );
  }

  String _getCountryFlag(Country country) {
    switch (country) {
      case Country.cameroon:
        return '🇨🇲';
      case Country.kenya:
        return '🇰🇪';
      case Country.tanzania:
        return '🇹🇿';
      case Country.uganda:
        return '🇺🇬';
      case Country.nigeria:
        return '🇳🇬';
    }
  }
}
