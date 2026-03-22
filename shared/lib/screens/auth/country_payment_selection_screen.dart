/// Country and City Selection Screen — Sprint 2A data-driven version.
///
/// Reads countries and cities from [MasterDataService] (Firestore
/// system_config/main, with static fallback). The [registrationScreenBuilder]
/// callback now receives canonical string identifiers:
///   - countryCode: ISO 3166-1 alpha-2, e.g. "CM"
///   - cityCode:    stable slug, e.g. "douala"

import 'package:flutter/material.dart';

import '../../models/master_data_snapshot.dart';
import '../../models/payment_preferences.dart';
import '../../services/master_data_service.dart';

class CountryPaymentSelectionScreen extends StatefulWidget {
  final String title;
  final String subtitle;
  final bool allowSkip;

  /// Legacy callback kept for backward compatibility.
  final Function(PaymentPreferences)? onPaymentMethodSelected;

  /// Registration flow builder. Receives canonical identifiers:
  ///   - countryCode: ISO 3166-1 alpha-2 (e.g. "CM")
  ///   - cityCode:    stable slug (e.g. "douala")
  final Widget Function(String countryCode, String cityCode)?
      registrationScreenBuilder;

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

  MasterDataSnapshot? _snapshot;
  bool _isLoadingData = true;

  String? _selectedCountryCode;
  MasterDataCountry? _selectedCountry;
  String? _selectedCityCode;

  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _loadMasterData();
  }

  Future<void> _loadMasterData() async {
    final snapshot = await MasterDataService.load();
    if (!mounted) return;
    setState(() {
      _snapshot = snapshot;
      _isLoadingData = false;
      // Default to primary country or first enabled country.
      final countries = snapshot.getEnabledCountries();
      if (countries.isNotEmpty) {
        final primary = countries.firstWhere(
          (c) => c.code == snapshot.primaryCountryCode,
          orElse: () => countries.first,
        );
        _selectCountry(primary);
      }
    });
  }

  void _selectCountry(MasterDataCountry country) {
    setState(() {
      _selectedCountryCode = country.code;
      _selectedCountry = country;
      _selectedCityCode = null; // reset city when country changes
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    if (_selectedCountryCode == null || _selectedCityCode == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select a country and city'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    if (widget.registrationScreenBuilder != null) {
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (context) => widget.registrationScreenBuilder!(
            _selectedCountryCode!,
            _selectedCityCode!,
          ),
        ),
      );
      return;
    }

    // Legacy path: emit empty preferences.
    if (!mounted) return;
    widget.onPaymentMethodSelected!(PaymentPreferences.empty());
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
        child: _isLoadingData
            ? const Center(child: CircularProgressIndicator())
            : SingleChildScrollView(
                padding: const EdgeInsets.all(24.0),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        widget.subtitle,
                        style: TextStyle(
                          fontSize: 16,
                          color: Colors.grey[600],
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 32),

                      _buildSectionHeader('Select Your Country'),
                      const SizedBox(height: 16),
                      _buildCountryGrid(),

                      const SizedBox(height: 32),

                      if (_selectedCountry != null) ...[
                        _buildSelectedCountryCard(),
                        const SizedBox(height: 24),
                      ],

                      if (_selectedCountry != null) ...[
                        _buildSectionHeader('Select Your City'),
                        const SizedBox(height: 16),
                        _buildCityDropdown(),
                        const SizedBox(height: 24),
                      ],

                      if (_selectedCityCode != null)
                        ElevatedButton(
                          onPressed: _isSubmitting ? null : _submit,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Theme.of(context).primaryColor,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.all(16),
                            minimumSize: const Size(double.infinity, 56),
                          ),
                          child: _isSubmitting
                              ? const CircularProgressIndicator(
                                  color: Colors.white)
                              : const Text(
                                  'Continue to Registration',
                                  style: TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                        ),

                      if (widget.allowSkip) ...[
                        const SizedBox(height: 16),
                        TextButton(
                          onPressed: () {
                            if (widget.onPaymentMethodSelected != null) {
                              widget.onPaymentMethodSelected!(
                                  PaymentPreferences.empty());
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
    final countries = _snapshot?.getEnabledCountries() ?? [];
    if (countries.isEmpty) {
      return const Text(
        'No countries available. Please try again later.',
        style: TextStyle(color: Colors.grey),
      );
    }

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        childAspectRatio: 2.5,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
      ),
      itemCount: countries.length,
      itemBuilder: (context, index) {
        final country = countries[index];
        final isSelected = _selectedCountryCode == country.code;

        return InkWell(
          onTap: () => _selectCountry(country),
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
                  ? Theme.of(context).primaryColor.withOpacity(0.1)
                  : Colors.white,
            ),
            padding: const EdgeInsets.all(12),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  _countryFlag(country.code),
                  style: const TextStyle(fontSize: 24),
                ),
                const SizedBox(height: 4),
                Text(
                  country.name,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight:
                        isSelected ? FontWeight.bold : FontWeight.normal,
                    color: isSelected
                        ? Theme.of(context).primaryColor
                        : Colors.black,
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
    final country = _selectedCountry!;
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
            _countryFlag(country.code),
            style: const TextStyle(fontSize: 32),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  country.name,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Currency: ${country.defaultCurrencyCode}',
                  style: TextStyle(fontSize: 14, color: Colors.grey[700]),
                ),
                Text(
                  'Country Code: +${country.dialCode}',
                  style: TextStyle(fontSize: 14, color: Colors.grey[700]),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCityDropdown() {
    if (_snapshot == null || _selectedCountryCode == null) {
      return const SizedBox.shrink();
    }

    final cities = _snapshot!.getEnabledCities(_selectedCountryCode!);
    if (cities.isEmpty) {
      return Text(
        'No cities configured for ${_selectedCountry?.name ?? _selectedCountryCode}.',
        style: const TextStyle(color: Colors.grey),
      );
    }

    return DropdownButtonFormField<String>(
      initialValue: _selectedCityCode,
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
          borderSide:
              BorderSide(color: Theme.of(context).primaryColor, width: 2),
        ),
        filled: true,
        fillColor: Colors.white,
      ),
      items: cities.map((city) {
        return DropdownMenuItem<String>(
          value: city.code,
          child: Text(city.name),
        );
      }).toList(),
      onChanged: (value) {
        setState(() => _selectedCityCode = value);
      },
      validator: (value) {
        if (value == null || value.isEmpty) {
          return 'Please select your city';
        }
        return null;
      },
    );
  }

  String _countryFlag(String code) {
    switch (code) {
      case 'CM':
        return '🇨🇲';
      case 'KE':
        return '🇰🇪';
      case 'TZ':
        return '🇹🇿';
      case 'UG':
        return '🇺🇬';
      case 'NG':
        return '🇳🇬';
      default:
        return '🌍';
    }
  }
}
