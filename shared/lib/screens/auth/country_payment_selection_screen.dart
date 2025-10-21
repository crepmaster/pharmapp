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
import '../../models/country_config.dart';
import '../../models/payment_preferences.dart';

class CountryPaymentSelectionScreen extends StatefulWidget {
  final String title;
  final String subtitle;
  final bool allowSkip;
  final Function(PaymentPreferences)? onPaymentMethodSelected;
  final Widget Function(Country selectedCountry, String selectedCity)? registrationScreenBuilder;

  const CountryPaymentSelectionScreen({
    super.key,
    required this.title,
    required this.subtitle,
    this.allowSkip = false,
    this.onPaymentMethodSelected,
    this.registrationScreenBuilder,
  });

  @override
  State<CountryPaymentSelectionScreen> createState() =>
      _CountryPaymentSelectionScreenState();
}

class _CountryPaymentSelectionScreenState
    extends State<CountryPaymentSelectionScreen> {
  final _formKey = GlobalKey<FormState>();

  Country? _selectedCountry;
  CountryConfig? _countryConfig;
  String? _selectedCity;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    // Default to Cameroon for backwards compatibility
    _selectCountry(Country.cameroon);
  }

  @override
  void dispose() {
    super.dispose();
  }

  void _selectCountry(Country country) {
    setState(() {
      _selectedCountry = country;
      _countryConfig = Countries.getByCountry(country);
      _selectedCity = null; // Reset city when country changes
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    if (_selectedCountry == null || _selectedCity == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select a country and city'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      // Navigate to registration screen with country and city only
      if (widget.registrationScreenBuilder != null) {
        if (!mounted) return;
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (context) => widget.registrationScreenBuilder!(
              _selectedCountry!,
              _selectedCity!,
            ),
          ),
        );
        return;
      }

      // Legacy pattern: Create empty payment preferences
      if (!mounted) return;
      widget.onPaymentMethodSelected!(PaymentPreferences.empty());
    } catch (e) {
      if (!mounted) return;
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

                // City Selection (appears after country selection)
                if (_countryConfig != null) ...[
                  _buildSectionHeader('Select Your City'),
                  const SizedBox(height: 16),
                  _buildCityDropdown(),
                  const SizedBox(height: 24),
                ],

                // Submit Button (appears after city selection)
                if (_selectedCity != null)
                  ElevatedButton(
                    onPressed: _isLoading ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Theme.of(context).primaryColor,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.all(16),
                      minimumSize: const Size(double.infinity, 56),
                    ),
                    child: _isLoading
                        ? const CircularProgressIndicator(color: Colors.white)
                        : const Text(
                            'Continue to Registration',
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
                      if (widget.onPaymentMethodSelected != null) {
                        widget.onPaymentMethodSelected!(PaymentPreferences.empty());
                      }
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

  Widget _buildCityDropdown() {
    return DropdownButtonFormField<String>(
      initialValue: _selectedCity,
      decoration: InputDecoration(
        labelText: 'City',
        hintText: 'Select your city',
        prefixIcon: const Icon(Icons.location_city),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Theme.of(context).primaryColor, width: 2),
        ),
        filled: true,
        fillColor: Colors.white,
      ),
      items: _countryConfig!.majorCities.map((city) {
        return DropdownMenuItem<String>(
          value: city,
          child: Text(city),
        );
      }).toList(),
      onChanged: (value) {
        setState(() {
          _selectedCity = value;
        });
      },
      validator: (value) {
        if (value == null || value.isEmpty) {
          return 'Please select your city';
        }
        return null;
      },
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
