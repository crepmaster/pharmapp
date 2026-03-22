import 'package:flutter/material.dart';

import '../../models/provider_option.dart';
import '../../models/system_config.dart';
import '../../services/system_config_service.dart';

class MobileMoneyTab extends StatelessWidget {
  final SystemConfigV1 config;
  final VoidCallback onChanged;

  const MobileMoneyTab(
      {super.key, required this.config, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final providers = config.mobileMoneyProviders.values.toList()
      ..sort((a, b) => a.displayOrder.compareTo(b.displayOrder));

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Mobile Money Providers',
                          style: TextStyle(
                              fontSize: 18, fontWeight: FontWeight.bold)),
                      ElevatedButton.icon(
                        onPressed: () => _showAddProviderDialog(context),
                        icon: const Icon(Icons.add),
                        label: const Text('Add Provider'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  if (providers.isEmpty)
                    const Text('No mobile money providers configured.',
                        style: TextStyle(color: Colors.grey))
                  else
                    ...providers
                        .map((p) => _buildProviderTile(context, p)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProviderTile(BuildContext context, ProviderOption provider) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: provider.enabled ? Colors.green : Colors.grey,
          child: Text(
            provider.countryCode,
            style: const TextStyle(color: Colors.white, fontSize: 11),
          ),
        ),
        title: Text(provider.name),
        subtitle: Text(
          '${provider.id} · ${provider.currencyCode} · ${provider.methodCode}'
          '${provider.supportsCollections ? ' · collect' : ''}'
          '${provider.supportsPayouts ? ' · payout' : ''}',
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: const Icon(Icons.edit, size: 20),
              onPressed: () => _showEditProviderDialog(context, provider),
            ),
            Switch(
              value: provider.enabled,
              onChanged: (value) async {
                final ok = await SystemConfigService.toggleProvider(
                    provider.id, value);
                if (ok) onChanged();
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showAddProviderDialog(BuildContext context) {
    final idCtl = TextEditingController();
    final nameCtl = TextEditingController();
    final countryCtl = TextEditingController();
    final currencyCtl = TextEditingController();
    final methodCtl = TextEditingController();
    final orderCtl = TextEditingController(
        text: ((config.mobileMoneyProviders.length + 1) * 10).toString());
    var supportsCollections = true;
    var supportsPayouts = false;
    var requiresMsisdn = true;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Add Provider'),
          content: SizedBox(
            width: 400,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: idCtl,
                    decoration: const InputDecoration(
                        labelText: 'Provider ID (e.g. mtn_cm)',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: nameCtl,
                    decoration: const InputDecoration(
                        labelText: 'Name (e.g. MTN Mobile Money)',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: countryCtl,
                    decoration: const InputDecoration(
                        labelText: 'Country Code (e.g. CM)',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: currencyCtl,
                    decoration: const InputDecoration(
                        labelText: 'Currency Code (e.g. XAF)',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: methodCtl,
                    decoration: const InputDecoration(
                        labelText: 'Method Code (e.g. mtn_momo)',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: orderCtl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Display Order',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 4),
                  CheckboxListTile(
                    title: const Text('Supports Collections'),
                    value: supportsCollections,
                    onChanged: (v) => setDialogState(
                        () => supportsCollections = v ?? true),
                    contentPadding: EdgeInsets.zero,
                  ),
                  CheckboxListTile(
                    title: const Text('Supports Payouts'),
                    value: supportsPayouts,
                    onChanged: (v) =>
                        setDialogState(() => supportsPayouts = v ?? false),
                    contentPadding: EdgeInsets.zero,
                  ),
                  CheckboxListTile(
                    title: const Text('Requires MSISDN'),
                    value: requiresMsisdn,
                    onChanged: (v) =>
                        setDialogState(() => requiresMsisdn = v ?? true),
                    contentPadding: EdgeInsets.zero,
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
                final id = idCtl.text.trim().toLowerCase();
                if (id.isEmpty || nameCtl.text.trim().isEmpty) return;
                final provider = ProviderOption(
                  id: id,
                  name: nameCtl.text.trim(),
                  countryCode: countryCtl.text.trim().toUpperCase(),
                  currencyCode: currencyCtl.text.trim().toUpperCase(),
                  methodCode: methodCtl.text.trim().toLowerCase(),
                  kind: 'mobile_money',
                  enabled: true,
                  requiresMsisdn: requiresMsisdn,
                  supportsCollections: supportsCollections,
                  supportsPayouts: supportsPayouts,
                  displayOrder: int.tryParse(orderCtl.text.trim()) ??
                      (config.mobileMoneyProviders.length + 1) * 10,
                  brandColor: '#000000',
                  logoAsset: '',
                );
                final ok =
                    await SystemConfigService.upsertProvider(id, provider);
                if (ctx.mounted) Navigator.pop(ctx);
                if (ok) onChanged();
              },
              child: const Text('Add'),
            ),
          ],
        ),
      ),
    );
  }

  void _showEditProviderDialog(BuildContext context, ProviderOption provider) {
    final nameCtl = TextEditingController(text: provider.name);
    final countryCtl = TextEditingController(text: provider.countryCode);
    final currencyCtl = TextEditingController(text: provider.currencyCode);
    final methodCtl = TextEditingController(text: provider.methodCode);
    final orderCtl =
        TextEditingController(text: provider.displayOrder.toString());
    var supportsCollections = provider.supportsCollections;
    var supportsPayouts = provider.supportsPayouts;
    var requiresMsisdn = provider.requiresMsisdn;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text('Edit ${provider.id}'),
          content: SizedBox(
            width: 400,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: nameCtl,
                    decoration: const InputDecoration(
                        labelText: 'Name', border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: countryCtl,
                    decoration: const InputDecoration(
                        labelText: 'Country Code',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: currencyCtl,
                    decoration: const InputDecoration(
                        labelText: 'Currency Code',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: methodCtl,
                    decoration: const InputDecoration(
                        labelText: 'Method Code',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: orderCtl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Display Order',
                        border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 4),
                  CheckboxListTile(
                    title: const Text('Supports Collections'),
                    value: supportsCollections,
                    onChanged: (v) => setDialogState(
                        () => supportsCollections = v ?? true),
                    contentPadding: EdgeInsets.zero,
                  ),
                  CheckboxListTile(
                    title: const Text('Supports Payouts'),
                    value: supportsPayouts,
                    onChanged: (v) =>
                        setDialogState(() => supportsPayouts = v ?? false),
                    contentPadding: EdgeInsets.zero,
                  ),
                  CheckboxListTile(
                    title: const Text('Requires MSISDN'),
                    value: requiresMsisdn,
                    onChanged: (v) =>
                        setDialogState(() => requiresMsisdn = v ?? true),
                    contentPadding: EdgeInsets.zero,
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
                final updated = provider.copyWith(
                  name: nameCtl.text.trim(),
                  countryCode: countryCtl.text.trim().toUpperCase(),
                  currencyCode: currencyCtl.text.trim().toUpperCase(),
                  methodCode: methodCtl.text.trim().toLowerCase(),
                  supportsCollections: supportsCollections,
                  supportsPayouts: supportsPayouts,
                  requiresMsisdn: requiresMsisdn,
                  displayOrder: int.tryParse(orderCtl.text.trim()) ??
                      provider.displayOrder,
                );
                final ok = await SystemConfigService.upsertProvider(
                    provider.id, updated);
                if (ctx.mounted) Navigator.pop(ctx);
                if (ok) onChanged();
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }
}
