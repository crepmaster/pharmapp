import 'package:flutter/material.dart';

import '../../models/system_config.dart';
import '../../models/country_option.dart';
import '../../services/system_config_service.dart';

class CountriesTab extends StatelessWidget {
  final SystemConfigV1 config;
  final VoidCallback onChanged;

  const CountriesTab({super.key, required this.config, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final countries = config.countries.values.toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Primary country
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Primary Country',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    value: config.primaryCountryCode.isNotEmpty
                        ? config.primaryCountryCode
                        : null,
                    decoration: const InputDecoration(
                      labelText: 'Select Primary Country',
                      border: OutlineInputBorder(),
                    ),
                    items: countries
                        .where((c) => c.enabled)
                        .map((c) => DropdownMenuItem(
                              value: c.code,
                              child: Text('${c.name} (${c.code})'),
                            ))
                        .toList(),
                    onChanged: (value) async {
                      if (value != null) {
                        final ok = await SystemConfigService.setPrimaryCountry(value);
                        if (ok) onChanged();
                      }
                    },
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Country list
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Countries',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                      ElevatedButton.icon(
                        onPressed: () => _showAddCountryDialog(context),
                        icon: const Icon(Icons.add),
                        label: const Text('Add Country'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  if (countries.isEmpty)
                    const Text('No countries configured.',
                        style: TextStyle(color: Colors.grey))
                  else
                    ...countries.map((country) => _buildCountryTile(context, country)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCountryTile(BuildContext context, CountryOption country) {
    final isPrimary = country.code == config.primaryCountryCode;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: country.enabled ? Colors.green : Colors.grey,
          child: Text(country.code,
              style: const TextStyle(color: Colors.white, fontSize: 12)),
        ),
        title: Row(
          children: [
            Text(country.name),
            if (isPrimary) ...[
              const SizedBox(width: 8),
              Chip(
                label: const Text('Primary', style: TextStyle(fontSize: 10)),
                backgroundColor: Colors.blue.shade100,
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                visualDensity: VisualDensity.compact,
              ),
            ],
          ],
        ),
        subtitle: Text(
            '+${country.dialCode} · ${country.defaultCurrencyCode} · ${country.timezone}'),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: const Icon(Icons.edit, size: 20),
              onPressed: () => _showEditCountryDialog(context, country),
            ),
            Switch(
              value: country.enabled,
              onChanged: (value) async {
                final ok = await SystemConfigService.toggleCountry(country.code, value);
                if (ok) onChanged();
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showAddCountryDialog(BuildContext context) {
    final codeCtl = TextEditingController();
    final nameCtl = TextEditingController();
    final dialCtl = TextEditingController();
    final currencyCtl = TextEditingController();
    final timezoneCtl = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Country'),
        content: SizedBox(
          width: 400,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                    controller: codeCtl,
                    decoration: const InputDecoration(
                        labelText: 'ISO Code (e.g. CM)',
                        border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(
                    controller: nameCtl,
                    decoration: const InputDecoration(
                        labelText: 'Country Name',
                        border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(
                    controller: dialCtl,
                    decoration: const InputDecoration(
                        labelText: 'Dial Code (e.g. 237)',
                        border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(
                    controller: currencyCtl,
                    decoration: const InputDecoration(
                        labelText: 'Default Currency Code (e.g. XAF)',
                        border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(
                    controller: timezoneCtl,
                    decoration: const InputDecoration(
                        labelText: 'Timezone (e.g. Africa/Douala)',
                        border: OutlineInputBorder())),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              final code = codeCtl.text.trim().toUpperCase();
              if (code.isEmpty || nameCtl.text.trim().isEmpty) return;
              final country = CountryOption(
                code: code,
                name: nameCtl.text.trim(),
                dialCode: dialCtl.text.trim(),
                defaultCurrencyCode: currencyCtl.text.trim().toUpperCase(),
                timezone: timezoneCtl.text.trim(),
                enabled: true,
                defaultCityCode: '',
                providerIds: [],
                sortOrder: (config.countries.length + 1) * 10,
              );
              final ok = await SystemConfigService.upsertCountry(code, country);
              if (ctx.mounted) Navigator.pop(ctx);
              if (ok) onChanged();
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }

  void _showEditCountryDialog(BuildContext context, CountryOption country) {
    final nameCtl = TextEditingController(text: country.name);
    final dialCtl = TextEditingController(text: country.dialCode);
    final currencyCtl = TextEditingController(text: country.defaultCurrencyCode);
    final timezoneCtl = TextEditingController(text: country.timezone);
    final cityCtl = TextEditingController(text: country.defaultCityCode);

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Edit ${country.code}'),
        content: SizedBox(
          width: 400,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                    controller: nameCtl,
                    decoration: const InputDecoration(
                        labelText: 'Country Name',
                        border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(
                    controller: dialCtl,
                    decoration: const InputDecoration(
                        labelText: 'Dial Code',
                        border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(
                    controller: currencyCtl,
                    decoration: const InputDecoration(
                        labelText: 'Default Currency Code',
                        border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(
                    controller: timezoneCtl,
                    decoration: const InputDecoration(
                        labelText: 'Timezone',
                        border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(
                    controller: cityCtl,
                    decoration: const InputDecoration(
                        labelText: 'Default City Code',
                        border: OutlineInputBorder())),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              final updated = country.copyWith(
                name: nameCtl.text.trim(),
                dialCode: dialCtl.text.trim(),
                defaultCurrencyCode: currencyCtl.text.trim().toUpperCase(),
                timezone: timezoneCtl.text.trim(),
                defaultCityCode: cityCtl.text.trim(),
              );
              final ok =
                  await SystemConfigService.upsertCountry(country.code, updated);
              if (ctx.mounted) Navigator.pop(ctx);
              if (ok) onChanged();
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }
}
