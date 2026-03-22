import 'package:flutter/material.dart';

import '../../models/currency_option.dart';
import '../../models/system_config.dart';
import '../../services/system_config_service.dart';

class CurrenciesTab extends StatelessWidget {
  final SystemConfigV1 config;
  final VoidCallback onChanged;

  const CurrenciesTab(
      {super.key, required this.config, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final currencies = config.currencies.values.toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Primary currency
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Primary Currency',
                      style:
                          TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    value: config.primaryCurrencyCode.isNotEmpty
                        ? config.primaryCurrencyCode
                        : null,
                    decoration: const InputDecoration(
                      labelText: 'Select Primary Currency',
                      border: OutlineInputBorder(),
                    ),
                    items: currencies
                        .where((c) => c.enabled)
                        .map((c) => DropdownMenuItem(
                              value: c.code,
                              child: Text('${c.name} (${c.code})'),
                            ))
                        .toList(),
                    onChanged: (value) async {
                      if (value != null) {
                        final ok =
                            await SystemConfigService.setPrimaryCurrency(value);
                        if (ok) onChanged();
                      }
                    },
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Currency list
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Currencies',
                          style: TextStyle(
                              fontSize: 18, fontWeight: FontWeight.bold)),
                      ElevatedButton.icon(
                        onPressed: () => _showAddCurrencyDialog(context),
                        icon: const Icon(Icons.add),
                        label: const Text('Add Currency'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  if (currencies.isEmpty)
                    const Text('No currencies configured.',
                        style: TextStyle(color: Colors.grey))
                  else
                    ...currencies
                        .map((c) => _buildCurrencyTile(context, c)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCurrencyTile(BuildContext context, CurrencyOption currency) {
    final isPrimary = currency.code == config.primaryCurrencyCode;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: currency.enabled ? Colors.green : Colors.grey,
          child: Text(
            currency.code.length > 3
                ? currency.code.substring(0, 3)
                : currency.code,
            style: const TextStyle(color: Colors.white, fontSize: 10),
          ),
        ),
        title: Row(
          children: [
            Text(currency.name),
            if (isPrimary) ...[
              const SizedBox(width: 8),
              Chip(
                label:
                    const Text('Primary', style: TextStyle(fontSize: 10)),
                backgroundColor: Colors.blue.shade100,
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                visualDensity: VisualDensity.compact,
              ),
            ],
          ],
        ),
        subtitle: Text(
          '${currency.symbol} · decimals=${currency.decimals}'
          ' · fx=${currency.fxBaseRate}',
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: const Icon(Icons.edit, size: 20),
              onPressed: () => _showEditCurrencyDialog(context, currency),
            ),
            Switch(
              value: currency.enabled,
              onChanged: (value) async {
                final ok = await SystemConfigService.toggleCurrency(
                    currency.code, value);
                if (ok) onChanged();
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showAddCurrencyDialog(BuildContext context) {
    final codeCtl = TextEditingController();
    final nameCtl = TextEditingController();
    final symbolCtl = TextEditingController();
    final decimalsCtl = TextEditingController(text: '2');
    final patternCtl = TextEditingController();
    final fxCtl = TextEditingController(text: '1.0');

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Currency'),
        content: SizedBox(
          width: 400,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: codeCtl,
                  decoration: const InputDecoration(
                      labelText: 'ISO Code (e.g. XAF)',
                      border: OutlineInputBorder()),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: nameCtl,
                  decoration: const InputDecoration(
                      labelText: 'Currency Name',
                      border: OutlineInputBorder()),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: symbolCtl,
                  decoration: const InputDecoration(
                      labelText: 'Symbol (e.g. FCFA)',
                      border: OutlineInputBorder()),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: decimalsCtl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                      labelText: 'Decimals (0 or 2)',
                      border: OutlineInputBorder()),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: patternCtl,
                  decoration: const InputDecoration(
                      labelText: 'Display Pattern (e.g. #,##0 XAF)',
                      border: OutlineInputBorder()),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: fxCtl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                      labelText: 'FX Base Rate (to USD)',
                      border: OutlineInputBorder()),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              final code = codeCtl.text.trim().toUpperCase();
              if (code.isEmpty || nameCtl.text.trim().isEmpty) return;
              final pattern = patternCtl.text.trim();
              final currency = CurrencyOption(
                code: code,
                name: nameCtl.text.trim(),
                symbol: symbolCtl.text.trim(),
                decimals: int.tryParse(decimalsCtl.text.trim()) ?? 2,
                enabled: true,
                displayPattern:
                    pattern.isEmpty ? '#,##0 $code' : pattern,
                fxBaseRate: double.tryParse(fxCtl.text.trim()) ?? 1.0,
                sortOrder: (config.currencies.length + 1) * 10,
              );
              final ok =
                  await SystemConfigService.upsertCurrency(code, currency);
              if (ctx.mounted) Navigator.pop(ctx);
              if (ok) onChanged();
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }

  void _showEditCurrencyDialog(
      BuildContext context, CurrencyOption currency) {
    final nameCtl = TextEditingController(text: currency.name);
    final symbolCtl = TextEditingController(text: currency.symbol);
    final decimalsCtl =
        TextEditingController(text: currency.decimals.toString());
    final patternCtl =
        TextEditingController(text: currency.displayPattern);
    final fxCtl =
        TextEditingController(text: currency.fxBaseRate.toString());

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Edit ${currency.code}'),
        content: SizedBox(
          width: 400,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameCtl,
                  decoration: const InputDecoration(
                      labelText: 'Currency Name',
                      border: OutlineInputBorder()),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: symbolCtl,
                  decoration: const InputDecoration(
                      labelText: 'Symbol', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: decimalsCtl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                      labelText: 'Decimals',
                      border: OutlineInputBorder()),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: patternCtl,
                  decoration: const InputDecoration(
                      labelText: 'Display Pattern',
                      border: OutlineInputBorder()),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: fxCtl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                      labelText: 'FX Base Rate',
                      border: OutlineInputBorder()),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              final updated = currency.copyWith(
                name: nameCtl.text.trim(),
                symbol: symbolCtl.text.trim(),
                decimals: int.tryParse(decimalsCtl.text.trim()) ??
                    currency.decimals,
                displayPattern: patternCtl.text.trim(),
                fxBaseRate: double.tryParse(fxCtl.text.trim()) ??
                    currency.fxBaseRate,
              );
              final ok = await SystemConfigService.upsertCurrency(
                  currency.code, updated);
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
