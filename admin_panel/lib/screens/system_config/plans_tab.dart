import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

import '../../models/admin_payout_account.dart';
import '../../models/payout_request.dart';
import '../../models/platform_ledger_entry.dart';
import '../../models/platform_treasury.dart';
import '../../models/provider_option.dart';
import '../../models/system_config.dart';
import '../../services/platform_treasury_service.dart';

/// Sprint 4A — Revenue & Treasury cockpit tab.
///
/// Replaces the Plans placeholder (activated per CONTRACT_ADMIN_MASTER_DATA_AND_TREASURY_V1 §6.2–6.3).
///
/// Three read sections + payout-account CRUD:
///   1. Revenue Policies — read-only from [SystemConfigV1.revenuePolicies].
///   2. Platform Treasuries — read-only stream from [PlatformTreasuryService.getTreasuries].
///   3. My Payout Accounts — CRUD for the current admin's accounts via [PlatformTreasuryService].
///
/// Payout request / execution is out of scope for Sprint 4A (Sprint 4B).
class RevenueTreasuryTab extends StatelessWidget {
  /// V1 system config — source of revenue policies and country/currency/provider data.
  final SystemConfigV1 config;

  /// UID of the currently-authenticated admin (from AdminAuthBloc).
  /// Only payout accounts owned by this admin are shown and managed.
  final String adminUserId;

  const RevenueTreasuryTab({
    super.key,
    required this.config,
    required this.adminUserId,
  });

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _RevenuePoliciesSection(config: config),
          const SizedBox(height: 16),
          const _TreasuriesSection(),
          const SizedBox(height: 16),
          _PayoutAccountsSection(config: config, adminUserId: adminUserId),
          const SizedBox(height: 16),
          _PayoutRequestsSection(adminUserId: adminUserId),
          const SizedBox(height: 16),
          const _PlatformLedgerSection(),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Section 1 — Revenue Policies (read-only)
// ---------------------------------------------------------------------------

class _RevenuePoliciesSection extends StatelessWidget {
  final SystemConfigV1 config;

  const _RevenuePoliciesSection({required this.config});

  @override
  Widget build(BuildContext context) {
    final policies = config.revenuePolicies;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text(
                  'Revenue Policies',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(width: 8),
                _readOnlyChip(),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              'Revenue collection settings from system_config/main. '
              'Editing revenue policies is out of scope for Sprint 4A.',
              style: TextStyle(color: Colors.grey, fontSize: 12),
            ),
            const SizedBox(height: 16),
            if (policies.isEmpty)
              const Text(
                'No revenue policies configured.',
                style: TextStyle(color: Colors.grey),
              )
            else
              ...policies.entries.map((e) => _buildPolicyTile(e.key, e.value)),
          ],
        ),
      ),
    );
  }

  Widget _buildPolicyTile(String key, RevenuePolicy policy) {
    final details = <String>[];
    if (policy.mode != null) details.add('mode: ${policy.mode}');
    if (policy.commissionBps != null) {
      details.add('commission: ${(policy.commissionBps! / 100).toStringAsFixed(2)}%');
    }
    if (policy.platformShareBps != null) {
      details.add('platform share: ${(policy.platformShareBps! / 100).toStringAsFixed(2)}%');
    }

    return ListTile(
      dense: true,
      contentPadding: EdgeInsets.zero,
      leading: Icon(
        policy.enabled ? Icons.check_circle_outline : Icons.cancel_outlined,
        color: policy.enabled ? Colors.green : Colors.grey,
        size: 20,
      ),
      title: Text(_policyLabel(key)),
      subtitle: details.isEmpty ? null : Text(details.join(' · ')),
    );
  }

  String _policyLabel(String key) {
    switch (key) {
      case 'subscriptions':
        return 'Subscriptions';
      case 'purchases':
        return 'Purchases';
      case 'exchanges':
        return 'Exchanges';
      case 'courierFees':
        return 'Courier Fees';
      default:
        return key;
    }
  }
}

// ---------------------------------------------------------------------------
// Section 2 — Platform Treasuries (read-only stream)
// ---------------------------------------------------------------------------

class _TreasuriesSection extends StatelessWidget {
  const _TreasuriesSection();

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text(
                  'Platform Treasuries',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(width: 8),
                _readOnlyChip(),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              'Platform revenue balances per country/currency. '
              'Written exclusively by Cloud Functions.',
              style: TextStyle(color: Colors.grey, fontSize: 12),
            ),
            const SizedBox(height: 16),
            StreamBuilder<List<PlatformTreasury>>(
              stream: PlatformTreasuryService.getTreasuries(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  final err = snapshot.error;
                  final isPermissionDenied = err is FirebaseException &&
                      err.code == 'permission-denied';
                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        isPermissionDenied
                            ? Icons.lock_outline
                            : Icons.error_outline,
                        color: isPermissionDenied
                            ? Colors.grey.shade400
                            : Colors.orange,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          isPermissionDenied
                              ? 'Access restricted. Finance or Super Admin role required.'
                              : 'Failed to load treasuries: $err',
                          style: TextStyle(
                            color: isPermissionDenied
                                ? Colors.grey.shade600
                                : Colors.orange.shade800,
                          ),
                        ),
                      ),
                    ],
                  );
                }
                final treasuries = snapshot.data ?? [];
                if (treasuries.isEmpty) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: Column(
                        children: [
                          Icon(Icons.account_balance, size: 48, color: Colors.grey),
                          SizedBox(height: 8),
                          Text(
                            'No treasury records yet.',
                            style: TextStyle(color: Colors.grey),
                          ),
                          SizedBox(height: 4),
                          Text(
                            'Treasury documents are created automatically\n'
                            'when the first subscription payment is processed.',
                            style: TextStyle(color: Colors.grey, fontSize: 12),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  );
                }
                return Column(
                  children: treasuries.map(_buildTreasuryCard).toList(),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTreasuryCard(PlatformTreasury t) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      color: Colors.grey.shade50,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  t.id,
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(width: 8),
                Chip(
                  label: Text(t.status),
                  backgroundColor:
                      t.isActive ? Colors.green.shade50 : Colors.red.shade50,
                  labelStyle: TextStyle(
                    color: t.isActive
                        ? Colors.green.shade800
                        : Colors.red.shade800,
                    fontSize: 11,
                  ),
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 24,
              runSpacing: 8,
              children: [
                _balanceItem('Available', t.availableBalance, t.currencyCode,
                    Colors.green.shade700),
                _balanceItem('Pending', t.pendingBalance, t.currencyCode,
                    Colors.orange.shade700),
                _balanceItem('Total Collected', t.totalCollected,
                    t.currencyCode, Colors.blue.shade700),
                _balanceItem('Total Withdrawn', t.totalWithdrawn,
                    t.currencyCode, Colors.grey.shade600),
              ],
            ),
            if (t.lastPayoutAt != null) ...[
              const SizedBox(height: 4),
              Text(
                'Last payout: ${_formatDate(t.lastPayoutAt!)}',
                style: const TextStyle(color: Colors.grey, fontSize: 11),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _balanceItem(
      String label, double amount, String currency, Color color) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(color: Colors.grey.shade600, fontSize: 11),
        ),
        Text(
          '${amount.toStringAsFixed(0)} $currency',
          style: TextStyle(fontWeight: FontWeight.bold, color: color),
        ),
      ],
    );
  }

  String _formatDate(DateTime d) => '${d.day}/${d.month}/${d.year}';
}

// ---------------------------------------------------------------------------
// Section 3 — Payout Accounts (CRUD for current admin)
// ---------------------------------------------------------------------------

class _PayoutAccountsSection extends StatelessWidget {
  final SystemConfigV1 config;
  final String adminUserId;

  const _PayoutAccountsSection({
    required this.config,
    required this.adminUserId,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'My Payout Accounts',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                ElevatedButton.icon(
                  onPressed: () => _showCreateDialog(context),
                  icon: const Icon(Icons.add),
                  label: const Text('Add Account'),
                ),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              'Mobile money accounts for receiving platform payouts. '
              'Private to your admin account.',
              style: TextStyle(color: Colors.grey, fontSize: 12),
            ),
            const SizedBox(height: 16),
            StreamBuilder<List<AdminPayoutAccount>>(
              stream:
                  PlatformTreasuryService.getAdminPayoutAccounts(adminUserId),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return Text(
                    'Error loading accounts: ${snapshot.error}',
                    style: const TextStyle(color: Colors.red),
                  );
                }
                final accounts = snapshot.data ?? [];
                if (accounts.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      child: Column(
                        children: [
                          Icon(Icons.account_balance_wallet,
                              size: 48, color: Colors.grey.shade400),
                          const SizedBox(height: 8),
                          const Text(
                            'No payout accounts configured yet.',
                            style: TextStyle(color: Colors.grey),
                          ),
                          const SizedBox(height: 12),
                          ElevatedButton.icon(
                            onPressed: () => _showCreateDialog(context),
                            icon: const Icon(Icons.add),
                            label:
                                const Text('Add your first payout account'),
                          ),
                        ],
                      ),
                    ),
                  );
                }
                return Column(
                  children: accounts
                      .map((a) => _buildAccountTile(context, a))
                      .toList(),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAccountTile(BuildContext context, AdminPayoutAccount account) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor:
              account.isActive ? Colors.blue.shade50 : Colors.grey.shade100,
          child: Icon(
            Icons.account_balance_wallet,
            color:
                account.isActive ? Colors.blue.shade700 : Colors.grey.shade400,
          ),
        ),
        title: Row(
          children: [
            Flexible(
              child: Text(
                account.label,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
            if (account.isDefault) ...[
              const SizedBox(width: 6),
              Chip(
                label: const Text('Default'),
                backgroundColor: Colors.blue.shade50,
                labelStyle: TextStyle(
                    color: Colors.blue.shade800, fontSize: 11),
                visualDensity: VisualDensity.compact,
              ),
            ],
            if (!account.isActive) ...[
              const SizedBox(width: 6),
              Chip(
                label: const Text('Inactive'),
                backgroundColor: Colors.grey.shade100,
                labelStyle:
                    const TextStyle(color: Colors.grey, fontSize: 11),
                visualDensity: VisualDensity.compact,
              ),
            ],
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${account.providerId} · ${account.msisdn}'),
            Text(
              '${account.countryCode} · ${account.currencyCode}'
              ' · ${account.accountName}'
              ' · ${account.verificationStatus}',
              style: const TextStyle(fontSize: 11),
            ),
          ],
        ),
        isThreeLine: true,
        trailing: PopupMenuButton<_AccountAction>(
          onSelected: (action) =>
              _handleAction(context, action, account),
          itemBuilder: (_) => [
            const PopupMenuItem(
              value: _AccountAction.edit,
              child: Row(children: [
                Icon(Icons.edit, size: 18),
                SizedBox(width: 8),
                Text('Edit'),
              ]),
            ),
            PopupMenuItem(
              value: _AccountAction.toggleActive,
              child: Row(children: [
                Icon(
                  account.isActive ? Icons.toggle_off : Icons.toggle_on,
                  size: 18,
                ),
                const SizedBox(width: 8),
                Text(account.isActive ? 'Deactivate' : 'Activate'),
              ]),
            ),
            if (!account.isDefault)
              const PopupMenuItem(
                value: _AccountAction.setDefault,
                child: Row(children: [
                  Icon(Icons.star_outline, size: 18),
                  SizedBox(width: 8),
                  Text('Set as Default'),
                ]),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _handleAction(
    BuildContext context,
    _AccountAction action,
    AdminPayoutAccount account,
  ) async {
    switch (action) {
      case _AccountAction.edit:
        await _showEditDialog(context, account);
      case _AccountAction.toggleActive:
        final ok = await PlatformTreasuryService.setPayoutAccountActive(
          account.id,
          !account.isActive,
        );
        if (!ok && context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Failed to update account status.'),
            backgroundColor: Colors.red,
          ));
        }
      case _AccountAction.setDefault:
        final ok = await PlatformTreasuryService.setDefaultPayoutAccount(
          accountId: account.id,
          adminUserId: account.adminUserId,
          countryCode: account.countryCode,
          currencyCode: account.currencyCode,
        );
        if (!ok && context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Failed to set default account.'),
            backgroundColor: Colors.red,
          ));
        }
    }
  }

  Future<void> _showCreateDialog(BuildContext context) async {
    await showDialog<void>(
      context: context,
      builder: (_) => _CreatePayoutAccountDialog(
        config: config,
        adminUserId: adminUserId,
      ),
    );
  }

  Future<void> _showEditDialog(
      BuildContext context, AdminPayoutAccount account) async {
    await showDialog<void>(
      context: context,
      builder: (_) => _EditPayoutAccountDialog(account: account),
    );
  }
}

enum _AccountAction { edit, toggleActive, setDefault }

// ---------------------------------------------------------------------------
// Create payout account dialog
// ---------------------------------------------------------------------------

class _CreatePayoutAccountDialog extends StatefulWidget {
  final SystemConfigV1 config;
  final String adminUserId;

  const _CreatePayoutAccountDialog({
    required this.config,
    required this.adminUserId,
  });

  @override
  State<_CreatePayoutAccountDialog> createState() =>
      _CreatePayoutAccountDialogState();
}

class _CreatePayoutAccountDialogState
    extends State<_CreatePayoutAccountDialog> {
  final _formKey = GlobalKey<FormState>();
  final _labelController = TextEditingController();
  final _msisdnController = TextEditingController();
  final _accountNameController = TextEditingController();

  String? _selectedCountryCode;
  String? _derivedCurrencyCode;
  String? _selectedProviderId;
  bool _isDefault = false;
  bool _isSaving = false;
  bool _loadingProviders = false;
  List<ProviderOption> _eligibleProviders = [];

  @override
  void dispose() {
    _labelController.dispose();
    _msisdnController.dispose();
    _accountNameController.dispose();
    super.dispose();
  }

  Future<void> _onCountryChanged(String? code) async {
    if (code == null) return;
    setState(() {
      _selectedCountryCode = code;
      _selectedProviderId = null;
      _derivedCurrencyCode = null;
      _eligibleProviders = [];
      _loadingProviders = true;
    });

    final country = widget.config.countries[code];
    final currencyCode = country?.defaultCurrencyCode ?? '';
    final providers = currencyCode.isNotEmpty
        ? await PlatformTreasuryService.getEligiblePayoutProviders(
            code, currencyCode)
        : <ProviderOption>[];

    if (!mounted) return;
    setState(() {
      _derivedCurrencyCode =
          currencyCode.isNotEmpty ? currencyCode : null;
      _eligibleProviders = providers;
      _loadingProviders = false;
    });
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedCountryCode == null ||
        _derivedCurrencyCode == null ||
        _selectedProviderId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Please select a country and a provider.'),
      ));
      return;
    }

    setState(() => _isSaving = true);
    final id = await PlatformTreasuryService.createPayoutAccount(
      adminUserId: widget.adminUserId,
      label: _labelController.text.trim(),
      countryCode: _selectedCountryCode!,
      currencyCode: _derivedCurrencyCode!,
      providerId: _selectedProviderId!,
      msisdn: _msisdnController.text.trim(),
      accountName: _accountNameController.text.trim(),
      isDefault: _isDefault,
    );

    if (!mounted) return;
    setState(() => _isSaving = false);

    if (id != null) {
      Navigator.pop(context);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Failed to create account. Check your permissions.'),
        backgroundColor: Colors.red,
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final enabledCountries = widget.config.countries.entries
        .where((e) => e.value.enabled)
        .toList()
      ..sort((a, b) => a.value.sortOrder.compareTo(b.value.sortOrder));

    return AlertDialog(
      title: const Text('Add Payout Account'),
      content: SizedBox(
        width: 420,
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                DropdownButtonFormField<String>(
                  decoration:
                      const InputDecoration(labelText: 'Country *'),
                  value: _selectedCountryCode,
                  items: enabledCountries
                      .map((e) => DropdownMenuItem(
                            value: e.key,
                            child: Text('${e.value.name} (${e.key})'),
                          ))
                      .toList(),
                  onChanged: _onCountryChanged,
                  validator: (v) =>
                      v == null ? 'Select a country' : null,
                ),
                const SizedBox(height: 12),
                if (_selectedCountryCode != null) ...[
                  InputDecorator(
                    decoration: InputDecoration(
                      labelText: 'Currency (derived)',
                      border: const OutlineInputBorder(),
                      fillColor: Colors.grey.shade50,
                      filled: true,
                    ),
                    child: Text(
                      _derivedCurrencyCode ?? '—',
                      style: TextStyle(color: Colors.grey.shade700),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                if (_loadingProviders)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (_selectedCountryCode != null)
                  DropdownButtonFormField<String>(
                    decoration:
                        const InputDecoration(labelText: 'Provider *'),
                    value: _selectedProviderId,
                    items: _eligibleProviders.isEmpty
                        ? [
                            const DropdownMenuItem(
                              value: '__none',
                              child: Text(
                                'No payout providers available',
                                style: TextStyle(color: Colors.grey),
                              ),
                            )
                          ]
                        : _eligibleProviders
                            .map((p) => DropdownMenuItem(
                                  value: p.id,
                                  child: Text(p.name),
                                ))
                            .toList(),
                    onChanged: _eligibleProviders.isEmpty
                        ? null
                        : (v) =>
                            setState(() => _selectedProviderId = v),
                    validator: (v) =>
                        (v == null || v == '__none')
                            ? 'Select a provider'
                            : null,
                  ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _msisdnController,
                  decoration: const InputDecoration(
                    labelText: 'MSISDN *',
                    hintText: 'International format, e.g. 2376XXXXXXXX',
                  ),
                  keyboardType: TextInputType.phone,
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _accountNameController,
                  decoration: const InputDecoration(
                    labelText: 'Account holder name *',
                  ),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _labelController,
                  decoration: const InputDecoration(
                    labelText: 'Label *',
                    hintText: 'e.g. MTN Cameroun principal',
                  ),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
                const SizedBox(height: 8),
                CheckboxListTile(
                  title: const Text(
                      'Set as default for this country/currency'),
                  value: _isDefault,
                  onChanged: (v) =>
                      setState(() => _isDefault = v ?? false),
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                ),
                const SizedBox(height: 4),
                Text(
                  'Verification status will be "unverified". '
                  'Promotion is out of scope for this sprint.',
                  style: TextStyle(
                      color: Colors.grey.shade500, fontSize: 11),
                ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isSaving ? null : () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: _isSaving ? null : _save,
          child: _isSaving
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Save'),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Edit payout account dialog (mutable fields only)
// ---------------------------------------------------------------------------

class _EditPayoutAccountDialog extends StatefulWidget {
  final AdminPayoutAccount account;

  const _EditPayoutAccountDialog({required this.account});

  @override
  State<_EditPayoutAccountDialog> createState() =>
      _EditPayoutAccountDialogState();
}

class _EditPayoutAccountDialogState
    extends State<_EditPayoutAccountDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _labelController;
  late final TextEditingController _msisdnController;
  late final TextEditingController _accountNameController;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _labelController =
        TextEditingController(text: widget.account.label);
    _msisdnController =
        TextEditingController(text: widget.account.msisdn);
    _accountNameController =
        TextEditingController(text: widget.account.accountName);
  }

  @override
  void dispose() {
    _labelController.dispose();
    _msisdnController.dispose();
    _accountNameController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isSaving = true);
    final ok = await PlatformTreasuryService.updatePayoutAccount(
      accountId: widget.account.id,
      label: _labelController.text.trim(),
      msisdn: _msisdnController.text.trim(),
      accountName: _accountNameController.text.trim(),
    );
    if (!mounted) return;
    setState(() => _isSaving = false);
    if (ok) {
      Navigator.pop(context);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Failed to update account.'),
        backgroundColor: Colors.red,
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.account;
    return AlertDialog(
      title: const Text('Edit Payout Account'),
      content: SizedBox(
        width: 400,
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Read-only context card
                Card(
                  color: Colors.grey.shade50,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${a.providerId} · ${a.countryCode} · ${a.currencyCode}',
                          style:
                              const TextStyle(fontWeight: FontWeight.w500),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Verification: ${a.verificationStatus}',
                          style: TextStyle(
                              color: Colors.grey.shade600, fontSize: 11),
                        ),
                        Text(
                          'Immutable fields (provider, country, currency) cannot be changed.',
                          style: TextStyle(
                              color: Colors.grey.shade500, fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _labelController,
                  decoration:
                      const InputDecoration(labelText: 'Label *'),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _msisdnController,
                  decoration:
                      const InputDecoration(labelText: 'MSISDN *'),
                  keyboardType: TextInputType.phone,
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _accountNameController,
                  decoration: const InputDecoration(
                      labelText: 'Account holder name *'),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isSaving ? null : () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: _isSaving ? null : _save,
          child: _isSaving
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Save'),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Section 4 — Payout Requests (Sprint 4B)
// ---------------------------------------------------------------------------

class _PayoutRequestsSection extends StatelessWidget {
  final String adminUserId;

  const _PayoutRequestsSection({required this.adminUserId});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Payout Requests',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                ElevatedButton.icon(
                  onPressed: () => _showRequestPayoutDialog(context),
                  icon: const Icon(Icons.send),
                  label: const Text('Request Payout'),
                ),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              'Payout requests from platform treasuries to your payout accounts. '
              'All operations go through backend callables.',
              style: TextStyle(color: Colors.grey, fontSize: 12),
            ),
            const SizedBox(height: 16),
            StreamBuilder<List<PayoutRequest>>(
              stream:
                  PlatformTreasuryService.getPayoutRequests(adminUserId),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return Text(
                    'Error loading requests: ${snapshot.error}',
                    style: const TextStyle(color: Colors.red),
                  );
                }
                final requests = snapshot.data ?? [];
                if (requests.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      child: Column(
                        children: [
                          Icon(Icons.receipt_long,
                              size: 48, color: Colors.grey.shade400),
                          const SizedBox(height: 8),
                          const Text(
                            'No payout requests yet.',
                            style: TextStyle(color: Colors.grey),
                          ),
                        ],
                      ),
                    ),
                  );
                }
                return Column(
                  children:
                      requests.map((r) => _buildRequestTile(context, r)).toList(),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRequestTile(BuildContext context, PayoutRequest req) {
    final statusColor = switch (req.status) {
      'requested' => Colors.orange,
      'completed' => Colors.green,
      'failed' => Colors.red,
      _ => Colors.grey,
    };

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: statusColor.withValues(alpha: 0.1),
          child: Icon(
            switch (req.status) {
              'requested' => Icons.hourglass_top,
              'completed' => Icons.check_circle,
              'failed' => Icons.cancel,
              _ => Icons.help_outline,
            },
            color: statusColor,
          ),
        ),
        title: Row(
          children: [
            Text(
              '${req.amount.toStringAsFixed(0)} ${req.currencyCode}',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            const SizedBox(width: 8),
            Chip(
              label: Text(req.status.toUpperCase()),
              backgroundColor: statusColor.withValues(alpha: 0.1),
              labelStyle: TextStyle(color: statusColor, fontSize: 11),
              visualDensity: VisualDensity.compact,
            ),
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${req.accountLabel} · ${req.providerId} · ${req.msisdn}'),
            Text(
              'Treasury: ${req.treasuryId}'
              '${req.requestedAt != null ? ' · ${_formatDate(req.requestedAt!)}' : ''}',
              style: const TextStyle(fontSize: 11),
            ),
            if (req.note.isNotEmpty)
              Text('Note: ${req.note}',
                  style: const TextStyle(fontSize: 11, fontStyle: FontStyle.italic)),
            if (req.externalReference != null && req.externalReference!.isNotEmpty)
              Text('Ref: ${req.externalReference}',
                  style: const TextStyle(fontSize: 11)),
            if (req.failureReason != null && req.failureReason!.isNotEmpty)
              Text('Reason: ${req.failureReason}',
                  style: TextStyle(fontSize: 11, color: Colors.red.shade700)),
          ],
        ),
        isThreeLine: true,
        trailing: req.isRequested
            ? PopupMenuButton<String>(
                onSelected: (action) =>
                    _handleResolve(context, action, req),
                itemBuilder: (_) => [
                  const PopupMenuItem(
                    value: 'completed',
                    child: Row(children: [
                      Icon(Icons.check, size: 18, color: Colors.green),
                      SizedBox(width: 8),
                      Text('Mark Completed'),
                    ]),
                  ),
                  const PopupMenuItem(
                    value: 'failed',
                    child: Row(children: [
                      Icon(Icons.close, size: 18, color: Colors.red),
                      SizedBox(width: 8),
                      Text('Mark Failed'),
                    ]),
                  ),
                ],
              )
            : null,
      ),
    );
  }

  Future<void> _handleResolve(
    BuildContext context,
    String action,
    PayoutRequest req,
  ) async {
    if (action == 'completed') {
      await _showCompleteDialog(context, req);
    } else if (action == 'failed') {
      await _showFailDialog(context, req);
    }
  }

  Future<void> _showCompleteDialog(
      BuildContext context, PayoutRequest req) async {
    final refController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Mark Payout Completed'),
        content: SizedBox(
          width: 400,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${req.amount.toStringAsFixed(0)} ${req.currencyCode} → ${req.accountLabel}',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: refController,
                decoration: const InputDecoration(
                  labelText: 'External reference (optional)',
                  hintText: 'e.g. Mobile money transaction ID',
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirm Completed'),
          ),
        ],
      ),
    );

    if (confirmed != true || !context.mounted) return;

    try {
      await PlatformTreasuryService.resolvePayout(
        requestId: req.id,
        resolution: 'completed',
        externalReference: refController.text.trim(),
      );
    } on FirebaseFunctionsException catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Failed: ${e.message}'),
        backgroundColor: Colors.red,
      ));
    }
    refController.dispose();
  }

  Future<void> _showFailDialog(
      BuildContext context, PayoutRequest req) async {
    final reasonController = TextEditingController();
    final formKey = GlobalKey<FormState>();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Mark Payout Failed'),
        content: SizedBox(
          width: 400,
          child: Form(
            key: formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${req.amount.toStringAsFixed(0)} ${req.currencyCode} → ${req.accountLabel}',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                Text(
                  'Funds will be returned to available balance.',
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: reasonController,
                  decoration: const InputDecoration(
                    labelText: 'Failure reason *',
                    hintText: 'e.g. Provider timeout, wrong number',
                  ),
                  maxLines: 2,
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () {
              if (formKey.currentState!.validate()) {
                Navigator.pop(context, true);
              }
            },
            child: const Text('Confirm Failed'),
          ),
        ],
      ),
    );

    if (confirmed != true || !context.mounted) return;

    try {
      await PlatformTreasuryService.resolvePayout(
        requestId: req.id,
        resolution: 'failed',
        failureReason: reasonController.text.trim(),
      );
    } on FirebaseFunctionsException catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Failed: ${e.message}'),
        backgroundColor: Colors.red,
      ));
    }
    reasonController.dispose();
  }

  Future<void> _showRequestPayoutDialog(BuildContext context) async {
    // Load treasuries snapshot for the dialog.
    List<PlatformTreasury> treasuries;
    try {
      final snapshot = await FirebaseFirestore.instance
          .collection('platform_treasuries')
          .orderBy(FieldPath.documentId)
          .get();
      treasuries = snapshot.docs
          .map((doc) => PlatformTreasury.fromFirestore(doc))
          .toList();
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Could not load treasuries.'),
        backgroundColor: Colors.red,
      ));
      return;
    }

    if (!context.mounted) return;
    if (treasuries.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('No treasuries available for payout.'),
      ));
      return;
    }

    await showDialog<void>(
      context: context,
      builder: (_) => _RequestPayoutDialog(
        adminUserId: adminUserId,
        treasuries: treasuries,
      ),
    );
  }

  String _formatDate(DateTime d) =>
      '${d.day}/${d.month}/${d.year} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

// ---------------------------------------------------------------------------
// Request Payout Dialog
// ---------------------------------------------------------------------------

class _RequestPayoutDialog extends StatefulWidget {
  final String adminUserId;
  final List<PlatformTreasury> treasuries;

  const _RequestPayoutDialog({
    required this.adminUserId,
    required this.treasuries,
  });

  @override
  State<_RequestPayoutDialog> createState() => _RequestPayoutDialogState();
}

class _RequestPayoutDialogState extends State<_RequestPayoutDialog> {
  final _formKey = GlobalKey<FormState>();
  final _amountController = TextEditingController();
  final _noteController = TextEditingController();

  PlatformTreasury? _selectedTreasury;
  AdminPayoutAccount? _selectedAccount;
  List<AdminPayoutAccount> _eligibleAccounts = [];
  bool _loadingAccounts = false;
  bool _isSaving = false;

  @override
  void dispose() {
    _amountController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _onTreasuryChanged(PlatformTreasury? treasury) async {
    if (treasury == null) return;
    setState(() {
      _selectedTreasury = treasury;
      _selectedAccount = null;
      _eligibleAccounts = [];
      _loadingAccounts = true;
    });

    // Load payout accounts matching this treasury's tuple.
    try {
      final snapshot = await FirebaseFirestore.instance
          .collection('admin_payout_accounts')
          .where('adminUserId', isEqualTo: widget.adminUserId)
          .where('countryCode', isEqualTo: treasury.countryCode)
          .where('currencyCode', isEqualTo: treasury.currencyCode)
          .where('isActive', isEqualTo: true)
          .get();
      if (!mounted) return;
      setState(() {
        _eligibleAccounts = snapshot.docs
            .map((doc) => AdminPayoutAccount.fromFirestore(doc))
            .toList();
        _loadingAccounts = false;
        // Auto-select default if exists.
        final defaultAcc =
            _eligibleAccounts.where((a) => a.isDefault).firstOrNull;
        if (defaultAcc != null) _selectedAccount = defaultAcc;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadingAccounts = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Failed to load payout accounts: $e'),
        backgroundColor: Colors.red,
      ));
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedTreasury == null || _selectedAccount == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Select a treasury and a payout account.'),
      ));
      return;
    }

    setState(() => _isSaving = true);
    try {
      await PlatformTreasuryService.requestPayout(
        treasuryId: _selectedTreasury!.id,
        payoutAccountId: _selectedAccount!.id,
        amount: double.parse(_amountController.text.trim()),
        note: _noteController.text.trim(),
      );
      if (!mounted) return;
      Navigator.pop(context);
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      setState(() => _isSaving = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Error: ${e.message}'),
        backgroundColor: Colors.red,
      ));
    } catch (e) {
      if (!mounted) return;
      setState(() => _isSaving = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Unexpected error: $e'),
        backgroundColor: Colors.red,
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Request Payout'),
      content: SizedBox(
        width: 450,
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Treasury selector
                DropdownButtonFormField<PlatformTreasury>(
                  decoration:
                      const InputDecoration(labelText: 'Treasury *'),
                  items: widget.treasuries
                      .where((t) => t.isActive)
                      .map((t) => DropdownMenuItem(
                            value: t,
                            child: Text(
                                '${t.id} — Available: ${t.availableBalance.toStringAsFixed(0)} ${t.currencyCode}'),
                          ))
                      .toList(),
                  onChanged: _onTreasuryChanged,
                  validator: (v) =>
                      v == null ? 'Select a treasury' : null,
                ),
                const SizedBox(height: 12),

                // Balance info
                if (_selectedTreasury != null)
                  Card(
                    color: Colors.blue.shade50,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Available',
                                    style: TextStyle(fontSize: 11)),
                                Text(
                                  '${_selectedTreasury!.availableBalance.toStringAsFixed(0)} ${_selectedTreasury!.currencyCode}',
                                  style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: Colors.green.shade700),
                                ),
                              ],
                            ),
                          ),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Pending',
                                    style: TextStyle(fontSize: 11)),
                                Text(
                                  '${_selectedTreasury!.pendingBalance.toStringAsFixed(0)} ${_selectedTreasury!.currencyCode}',
                                  style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: Colors.orange.shade700),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                const SizedBox(height: 12),

                // Payout account selector
                if (_loadingAccounts)
                  const Center(child: CircularProgressIndicator())
                else if (_selectedTreasury != null)
                  DropdownButtonFormField<AdminPayoutAccount>(
                    decoration: const InputDecoration(
                        labelText: 'Payout account *'),
                    initialValue: _selectedAccount,
                    items: _eligibleAccounts.isEmpty
                        ? [
                            const DropdownMenuItem(
                              value: null,
                              child: Text('No active accounts for this tuple',
                                  style: TextStyle(color: Colors.grey)),
                            )
                          ]
                        : _eligibleAccounts
                            .map((a) => DropdownMenuItem(
                                  value: a,
                                  child: Text(
                                      '${a.label} (${a.msisdn})'),
                                ))
                            .toList(),
                    onChanged: _eligibleAccounts.isEmpty
                        ? null
                        : (v) => setState(() => _selectedAccount = v),
                    validator: (v) =>
                        v == null ? 'Select an account' : null,
                  ),
                const SizedBox(height: 12),

                // Amount
                TextFormField(
                  controller: _amountController,
                  decoration: InputDecoration(
                    labelText: 'Amount *',
                    suffixText: _selectedTreasury?.currencyCode ?? '',
                  ),
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: false),
                  validator: (v) {
                    if (v == null || v.trim().isEmpty) return 'Required';
                    final n = double.tryParse(v.trim());
                    if (n == null || n <= 0) return 'Must be > 0';
                    if (_selectedTreasury != null &&
                        n > _selectedTreasury!.availableBalance) {
                      return 'Exceeds available balance';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 12),

                // Note
                TextFormField(
                  controller: _noteController,
                  decoration: const InputDecoration(
                    labelText: 'Note (optional)',
                    hintText: 'e.g. Monthly payout March 2026',
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isSaving ? null : () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: _isSaving ? null : _submit,
          child: _isSaving
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Submit Request'),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Section 5 — Platform Ledger (read-only stream — Sprint 4C)
// ---------------------------------------------------------------------------

class _PlatformLedgerSection extends StatefulWidget {
  const _PlatformLedgerSection();

  @override
  State<_PlatformLedgerSection> createState() => _PlatformLedgerSectionState();
}

class _PlatformLedgerSectionState extends State<_PlatformLedgerSection> {
  String? _filterTreasuryId;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text(
                  'Platform Ledger',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(width: 8),
                _readOnlyChip(),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              'Financial events on platform treasuries (subscriptions, payouts). '
              'Last 100 entries, most recent first.',
              style: TextStyle(color: Colors.grey, fontSize: 12),
            ),
            const SizedBox(height: 16),
            StreamBuilder<List<PlatformLedgerEntry>>(
              stream: PlatformTreasuryService.getPlatformLedger(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  final err = snapshot.error;
                  final isPermissionDenied = err is FirebaseException &&
                      err.code == 'permission-denied';
                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        isPermissionDenied
                            ? Icons.lock_outline
                            : Icons.error_outline,
                        color: isPermissionDenied
                            ? Colors.grey.shade400
                            : Colors.orange,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          isPermissionDenied
                              ? 'Access restricted. Finance or Super Admin role required.'
                              : 'Failed to load ledger: $err',
                          style: TextStyle(
                            color: isPermissionDenied
                                ? Colors.grey.shade600
                                : Colors.orange.shade800,
                          ),
                        ),
                      ),
                    ],
                  );
                }
                final allEntries = snapshot.data ?? [];
                if (allEntries.isEmpty) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: Column(
                        children: [
                          Icon(Icons.receipt_long, size: 48, color: Colors.grey),
                          SizedBox(height: 8),
                          Text(
                            'No platform ledger entries yet.',
                            style: TextStyle(color: Colors.grey),
                          ),
                        ],
                      ),
                    ),
                  );
                }

                // Collect unique treasury IDs for the filter dropdown.
                final treasuryIds = allEntries
                    .map((e) => e.treasuryId)
                    .where((id) => id.isNotEmpty)
                    .toSet()
                    .toList()
                  ..sort();

                // Apply client-side treasury filter.
                final entries = _filterTreasuryId == null
                    ? allEntries
                    : allEntries
                        .where((e) => e.treasuryId == _filterTreasuryId)
                        .toList();

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Filter row
                    if (treasuryIds.length > 1)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Wrap(
                          spacing: 4,
                          runSpacing: 4,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            const Text('Filter: ',
                                style: TextStyle(fontSize: 12)),
                            ChoiceChip(
                              label: const Text('All'),
                              selected: _filterTreasuryId == null,
                              onSelected: (_) =>
                                  setState(() => _filterTreasuryId = null),
                              visualDensity: VisualDensity.compact,
                            ),
                            ...treasuryIds.map((id) => ChoiceChip(
                                  label: Text(id),
                                  selected: _filterTreasuryId == id,
                                  onSelected: (_) =>
                                      setState(() => _filterTreasuryId = id),
                                  visualDensity: VisualDensity.compact,
                                )),
                          ],
                        ),
                      ),
                    // Entries
                    Text(
                      '${entries.length} entries${_filterTreasuryId != null ? ' (filtered)' : ''}',
                      style: TextStyle(
                          color: Colors.grey.shade600, fontSize: 11),
                    ),
                    const SizedBox(height: 8),
                    ...entries.map(_buildLedgerTile),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLedgerTile(PlatformLedgerEntry entry) {
    final typeColor = switch (entry.type) {
      'platform_subscription_revenue' => Colors.green,
      'platform_payout_requested' => Colors.orange,
      'platform_payout_completed' => Colors.blue,
      'platform_payout_failed' => Colors.red,
      _ => Colors.grey,
    };

    final details = <String>[];
    details.add('${entry.from} → ${entry.to}');
    if (entry.sourceId != null) details.add('source: ${entry.sourceId}');
    if (entry.payoutRequestId != null) {
      details.add('request: ${entry.payoutRequestId}');
    }
    if (entry.externalReference != null &&
        entry.externalReference!.isNotEmpty) {
      details.add('ref: ${entry.externalReference}');
    }
    if (entry.failureReason != null && entry.failureReason!.isNotEmpty) {
      details.add('reason: ${entry.failureReason}');
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 4),
      color: Colors.grey.shade50,
      child: ListTile(
        dense: true,
        leading: Icon(
          switch (entry.type) {
            'platform_subscription_revenue' => Icons.arrow_downward,
            'platform_payout_requested' => Icons.hourglass_top,
            'platform_payout_completed' => Icons.arrow_upward,
            'platform_payout_failed' => Icons.replay,
            _ => Icons.receipt,
          },
          color: typeColor,
          size: 20,
        ),
        title: Row(
          children: [
            Text(
              '${entry.amount.toStringAsFixed(0)} ${entry.currency}',
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                entry.typeLabel,
                style: TextStyle(color: typeColor, fontSize: 11),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${entry.treasuryId}'
              '${entry.createdAt != null ? ' · ${_fmtDate(entry.createdAt!)}' : ''}',
              style: const TextStyle(fontSize: 11),
            ),
            if (details.isNotEmpty)
              Text(
                details.join(' · '),
                style: TextStyle(fontSize: 10, color: Colors.grey.shade600),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
          ],
        ),
      ),
    );
  }

  String _fmtDate(DateTime d) =>
      '${d.day}/${d.month}/${d.year} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

Widget _readOnlyChip() {
  return Chip(
    label: const Text('Read-only'),
    avatar: const Icon(Icons.lock_outline, size: 14),
    backgroundColor: Colors.grey.shade100,
    labelStyle: const TextStyle(fontSize: 11, color: Colors.grey),
    visualDensity: VisualDensity.compact,
    padding: EdgeInsets.zero,
  );
}
