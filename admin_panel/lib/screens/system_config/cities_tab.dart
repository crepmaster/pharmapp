import 'package:flutter/material.dart';

import '../../models/city_option.dart';
import '../../models/system_config.dart';
import '../../services/system_config_service.dart';

/// Cities management tab. Used both inside System Config (super_admin, all
/// countries) and as a standalone screen for scoped admins (filtered countries).
class CitiesTab extends StatefulWidget {
  final SystemConfigV1 config;
  final VoidCallback onChanged;

  /// If non-empty, only these country codes are shown and editable.
  /// Empty or null = all countries (super_admin mode).
  final List<String> allowedCountryCodes;

  const CitiesTab({
    super.key,
    required this.config,
    required this.onChanged,
    this.allowedCountryCodes = const [],
  });

  @override
  State<CitiesTab> createState() => _CitiesTabState();
}

class _CitiesTabState extends State<CitiesTab> {
  String? _selectedCountryCode;

  List<MapEntry<String, dynamic>> get _visibleCountries {
    var countries = widget.config.countries.entries.toList();
    if (widget.allowedCountryCodes.isNotEmpty) {
      countries = countries
          .where((e) => widget.allowedCountryCodes.contains(e.key))
          .toList();
    }
    countries.sort((a, b) => a.value.sortOrder.compareTo(b.value.sortOrder));
    return countries;
  }

  @override
  void initState() {
    super.initState();
    final countries = _visibleCountries;
    if (countries.isNotEmpty) {
      _selectedCountryCode = countries.first.key;
    }
  }

  List<CityOption> get _cities {
    if (_selectedCountryCode == null) return [];
    final countryMap =
        widget.config.citiesByCountry[_selectedCountryCode] ?? {};
    return countryMap.values.toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  }

  @override
  Widget build(BuildContext context) {
    final countries = _visibleCountries;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Country selector
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: DropdownButtonFormField<String>(
                value: _selectedCountryCode,
                decoration: const InputDecoration(
                  labelText: 'Country',
                  border: OutlineInputBorder(),
                ),
                items: countries
                    .map((e) => DropdownMenuItem(
                          value: e.key,
                          child: Text('${e.value.name} (${e.key})'),
                        ))
                    .toList(),
                onChanged: (value) {
                  if (value != null) setState(() => _selectedCountryCode = value);
                },
              ),
            ),
          ),
          const SizedBox(height: 16),

          // City list
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Cities',
                          style: TextStyle(
                              fontSize: 18, fontWeight: FontWeight.bold)),
                      ElevatedButton.icon(
                        onPressed: _selectedCountryCode != null
                            ? () => _showAddCityDialog(context)
                            : null,
                        icon: const Icon(Icons.add),
                        label: const Text('Add City'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  if (_selectedCountryCode == null)
                    const Text('Select a country above.',
                        style: TextStyle(color: Colors.grey))
                  else if (_cities.isEmpty)
                    const Text('No cities configured for this country.',
                        style: TextStyle(color: Colors.grey))
                  else
                    ..._cities.map((city) => _buildCityTile(context, city)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCityTile(BuildContext context, CityOption city) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: city.enabled ? Colors.green : Colors.grey,
          child: Text(
            city.code.isNotEmpty ? city.code[0].toUpperCase() : '?',
            style: const TextStyle(color: Colors.white, fontSize: 12),
          ),
        ),
        title: Row(
          children: [
            Text(city.name),
            if (!city.enabled) ...[
              const SizedBox(width: 8),
              Chip(
                label: const Text('Disabled', style: TextStyle(fontSize: 10)),
                backgroundColor: Colors.red.shade100,
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                visualDensity: VisualDensity.compact,
              ),
            ],
            if (city.isMajorCity) ...[
              const SizedBox(width: 8),
              Chip(
                label: const Text('Major', style: TextStyle(fontSize: 10)),
                backgroundColor: Colors.blue.shade100,
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                visualDensity: VisualDensity.compact,
              ),
            ],
          ],
        ),
        subtitle: Text(
          '${city.currencyCode} ${city.deliveryFee.toStringAsFixed(0)}'
          ' · r=${city.validationRadiusKm}km'
          '${city.region.isNotEmpty ? ' · ${city.region}' : ''}',
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: const Icon(Icons.edit, size: 20),
              onPressed: () => _showEditCityDialog(context, city),
            ),
            Switch(
              value: city.enabled,
              onChanged: (value) => _toggleCity(city, value),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _toggleCity(CityOption city, bool enabled) async {
    final updated = city.copyWith(enabled: enabled);
    final error = await SystemConfigService.upsertCityViaCallable(
        _selectedCountryCode!, city.code, updated);
    if (error != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error), backgroundColor: Colors.red),
      );
    } else {
      widget.onChanged();
    }
  }

  void _showAddCityDialog(BuildContext context) {
    final countryCode = _selectedCountryCode!;
    final defaultCurrency =
        widget.config.countries[countryCode]?.defaultCurrencyCode ?? '';
    final existingCount =
        widget.config.citiesByCountry[countryCode]?.length ?? 0;

    final codeCtl = TextEditingController();
    final nameCtl = TextEditingController();
    final regionCtl = TextEditingController();
    final feeCtl = TextEditingController(text: '0');
    final radiusCtl = TextEditingController(text: '20');
    final latCtl = TextEditingController(text: '0.0');
    final lngCtl = TextEditingController(text: '0.0');
    var isMajorCity = false;
    var isSaving = false;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Add City'),
          content: SizedBox(
            width: 400,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: codeCtl,
                    decoration: const InputDecoration(
                        labelText: 'City Code (slug, e.g. douala)',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: nameCtl,
                    decoration: const InputDecoration(
                        labelText: 'City Name',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: regionCtl,
                    decoration: const InputDecoration(
                        labelText: 'Region',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: feeCtl,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                        labelText: 'Delivery Fee ($defaultCurrency)',
                        border: const OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: radiusCtl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Validation Radius (km)',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: latCtl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Latitude',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: lngCtl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Longitude',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 4),
                  CheckboxListTile(
                    title: const Text('Major City'),
                    value: isMajorCity,
                    onChanged: (v) =>
                        setDialogState(() => isMajorCity = v ?? false),
                    contentPadding: EdgeInsets.zero,
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
                onPressed: isSaving ? null : () => Navigator.pop(ctx),
                child: const Text('Cancel')),
            ElevatedButton(
              onPressed: isSaving
                  ? null
                  : () async {
                      final code = codeCtl.text.trim().toLowerCase();
                      if (code.isEmpty || nameCtl.text.trim().isEmpty) return;
                      setDialogState(() => isSaving = true);
                      final city = CityOption(
                        code: code,
                        name: nameCtl.text.trim(),
                        region: regionCtl.text.trim(),
                        enabled: true,
                        isMajorCity: isMajorCity,
                        deliveryFee:
                            double.tryParse(feeCtl.text.trim()) ?? 0,
                        currencyCode: defaultCurrency,
                        latitude:
                            double.tryParse(latCtl.text.trim()) ?? 0,
                        longitude:
                            double.tryParse(lngCtl.text.trim()) ?? 0,
                        validationRadiusKm:
                            double.tryParse(radiusCtl.text.trim()) ?? 20,
                        sortOrder: (existingCount + 1) * 10,
                      );
                      final error =
                          await SystemConfigService.upsertCityViaCallable(
                              countryCode, code, city);
                      if (ctx.mounted) Navigator.pop(ctx);
                      if (error != null) {
                        if (mounted) {
                          ScaffoldMessenger.of(this.context).showSnackBar(
                            SnackBar(
                                content: Text(error),
                                backgroundColor: Colors.red),
                          );
                        }
                      } else {
                        widget.onChanged();
                      }
                    },
              child: isSaving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Add'),
            ),
          ],
        ),
      ),
    );
  }

  void _showEditCityDialog(BuildContext context, CityOption city) {
    final nameCtl = TextEditingController(text: city.name);
    final regionCtl = TextEditingController(text: city.region);
    final feeCtl =
        TextEditingController(text: city.deliveryFee.toStringAsFixed(0));
    final radiusCtl = TextEditingController(
        text: city.validationRadiusKm.toStringAsFixed(1));
    final latCtl = TextEditingController(text: city.latitude.toString());
    final lngCtl = TextEditingController(text: city.longitude.toString());
    var isSaving = false;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text('Edit ${city.name}'),
          content: SizedBox(
            width: 400,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: nameCtl,
                    decoration: const InputDecoration(
                        labelText: 'City Name',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: regionCtl,
                    decoration: const InputDecoration(
                        labelText: 'Region',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: feeCtl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Delivery Fee',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: radiusCtl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Validation Radius (km)',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: latCtl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Latitude',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: lngCtl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Longitude',
                        border: OutlineInputBorder()),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
                onPressed: isSaving ? null : () => Navigator.pop(ctx),
                child: const Text('Cancel')),
            ElevatedButton(
              onPressed: isSaving
                  ? null
                  : () async {
                      setDialogState(() => isSaving = true);
                      final updated = city.copyWith(
                        name: nameCtl.text.trim(),
                        region: regionCtl.text.trim(),
                        deliveryFee: double.tryParse(feeCtl.text.trim()) ??
                            city.deliveryFee,
                        validationRadiusKm:
                            double.tryParse(radiusCtl.text.trim()) ??
                                city.validationRadiusKm,
                        latitude: double.tryParse(latCtl.text.trim()) ??
                            city.latitude,
                        longitude: double.tryParse(lngCtl.text.trim()) ??
                            city.longitude,
                      );
                      final error =
                          await SystemConfigService.upsertCityViaCallable(
                              _selectedCountryCode!, city.code, updated);
                      if (ctx.mounted) Navigator.pop(ctx);
                      if (error != null) {
                        if (mounted) {
                          ScaffoldMessenger.of(this.context).showSnackBar(
                            SnackBar(
                                content: Text(error),
                                backgroundColor: Colors.red),
                          );
                        }
                      } else {
                        widget.onChanged();
                      }
                    },
              child: isSaving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }
}
