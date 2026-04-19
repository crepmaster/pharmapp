import 'dart:math' as math;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:pharmapp_shared/pharmapp_shared.dart';
import 'package:uuid/uuid.dart';

import '../../services/withdrawal_service.dart';

/// Static decimals fallback mirroring `functions/src/lib/moneyUnits.ts`
/// (`FALLBACK_DECIMALS`). Client-side snapshot does not expose currency
/// decimals yet (see `MasterDataCurrency`), so we keep a small static
/// table for the markets currently configured in system_config/main.
const Map<String, int> _currencyDecimalsFallback = {
  'XAF': 0,
  'XOF': 0,
  'GHS': 2,
  'KES': 2,
  'NGN': 2,
  'TZS': 2,
  'UGX': 0,
  'EUR': 2,
  'USD': 2,
};

/// Courier Wallet Widget
/// Displays earnings, balance, and withdrawal options for couriers.
class CourierWalletWidget extends StatefulWidget {
  const CourierWalletWidget({super.key});

  @override
  State<CourierWalletWidget> createState() => _CourierWalletWidgetState();
}

class _CourierWalletWidgetState extends State<CourierWalletWidget> {
  Map<String, dynamic>? _walletData;
  bool _loading = true;
  String? _error;
  String _currency = 'XAF';
  String? _countryCode;
  int _minWithdrawal = 1000;

  // --- Multi-country withdrawal context (loaded from MasterData + user doc) ---
  List<MasterDataProvider> _eligibleProviders = const [];
  String? _preselectedProviderId;
  int _currencyDecimals = 0;
  String _dialCode = '';
  String _defaultMsisdn = '';

  /// Parent-owned idempotency key for the withdrawal callable.
  ///
  /// Lifecycle:
  ///  - Lazy-initialised on the first dialog open (in [_onWithdrawPressed]).
  ///  - Reused across retries inside the dialog (same UUID → backend
  ///    idempotency).
  ///  - Reset to null ONLY on confirmed backend success (when the dialog
  ///    returns a non-null [WithdrawalResult]).
  ///  - Preserved on cancel, network error, timeout → next retry reuses it.
  String? _clientRequestId;

  static const Map<String, String> _countryCurrency = {
    'CM': 'XAF',
    'GH': 'GHS',
    'KE': 'KES',
    'NG': 'NGN',
    'TZ': 'TZS',
    'UG': 'UGX',
  };

  static const Map<String, int> _minWithdrawalByCurrency = {
    'XAF': 1000,
    'GHS': 10,
    'KES': 100,
    'NGN': 1000,
    'TZS': 2000,
    'UGX': 4000,
  };

  /// Courier wallet values are stored directly in major units (e.g. XAF 1000
  /// means 1000 XAF). The legacy ×100 convention was incorrect for courier
  /// earnings and caused off-by-100 display bugs. Format the raw value with
  /// locale-style grouping and currency-appropriate decimals.
  String _fmt(num value) {
    final double major = value.toDouble();
    final int decimals = _currency == 'XAF' || _currency == 'XOF' ? 0 : 2;
    final formatted = major.toStringAsFixed(decimals).replaceAllMapped(
          RegExp(r'(\d)(?=(\d{3})+(?:\.|\$))'),
          (m) => '${m[1]},',
        );
    return '$formatted $_currency';
  }

  @override
  void initState() {
    super.initState();
    _loadContext();
    _loadWalletData();
  }

  /// Loads courier country + currency + MasterData-driven withdrawal context
  /// (eligible providers, dial code, decimals) and any saved payment prefs
  /// to pre-select the provider / phone in the dialog.
  Future<void> _loadContext() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;
    try {
      final doc = await FirebaseFirestore.instance
          .collection('couriers')
          .doc(uid)
          .get();
      if (!doc.exists || !mounted) return;

      final courierData = doc.data();
      final cc = courierData?['countryCode'] as String?;
      final currency = cc == null ? null : _countryCurrency[cc];

      // Load MasterData snapshot (cached session-wide after first call).
      List<MasterDataProvider> providers = const [];
      String dialCode = '';
      int decimals = 0;
      if (cc != null) {
        try {
          final snapshot = await MasterDataService.load();
          providers = snapshot
              .getEnabledProviders(cc)
              .where((p) => p.supportsPayouts)
              .toList();
          dialCode = snapshot.countries[cc]?.dialCode ?? '';
          final currencyCodeForDecimals = currency ?? 'XAF';
          decimals = _currencyDecimalsFallback[currencyCodeForDecimals] ?? 0;
        } catch (_) {
          // Snapshot unavailable → withdrawal button disabled by empty
          // provider list. Don't crash.
        }
      }

      // Try to read saved payment preferences to pre-select provider + phone.
      // Reuse courier doc already loaded above — paymentPreferences lives on
      // couriers/{uid}.paymentPreferences (written by UnifiedAuthService.signUp).
      String? preselectedId;
      String defaultMsisdn = '';
      final prefsRaw = courierData?['paymentPreferences'];
      if (prefsRaw is Map) {
        try {
          final prefData = Map<String, dynamic>.from(prefsRaw);
          final prefs = PaymentPreferences.fromMap(prefData);
          final prefProviderId = prefs.providerId;
          if (prefProviderId != null &&
              providers.any((p) => p.id == prefProviderId)) {
            preselectedId = prefProviderId;
          }
          defaultMsisdn = prefs.defaultPhone;
        } catch (e) {
          debugPrint('paymentPreferences parse failed: $e');
        }
      }

      if (!mounted) return;
      setState(() {
        _countryCode = cc;
        if (currency != null) {
          _currency = currency;
          _minWithdrawal = _minWithdrawalByCurrency[currency] ?? 1000;
        }
        _eligibleProviders = providers;
        _preselectedProviderId = preselectedId;
        _currencyDecimals = decimals;
        _dialCode = dialCode;
        _defaultMsisdn = defaultMsisdn;
      });
    } catch (_) {}
  }

  Future<void> _loadWalletData() async {
    if (!mounted) return;

    try {
      setState(() {
        _loading = true;
        _error = null;
      });

      final userId = FirebaseAuth.instance.currentUser?.uid;
      if (userId == null) {
        throw Exception('User not authenticated');
      }

      final walletData = await UnifiedWalletService.getCourierEarnings(
        courierId: userId,
      );

      if (mounted) {
        setState(() {
          _walletData = walletData;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  Future<void> _onWithdrawPressed() async {
    // CRITICAL: lazy-generate ONCE. Every subsequent reopen (after a cancel,
    // timeout, or error) reuses the same UUID so the backend idempotency
    // check returns the existing request instead of double-debiting.
    _clientRequestId ??= const Uuid().v4();

    final result = await showDialog<WithdrawalResult?>(
      context: context,
      builder: (_) => _WithdrawalDialog(
        // CRITICAL: parent-owned UUID. Dialog stores it as final and NEVER
        // regenerates, even across internal retries.
        clientRequestId: _clientRequestId!,
        eligibleProviders: _eligibleProviders,
        preselectedProviderId: _preselectedProviderId,
        currencyCode: _currency,
        currencyDecimals: _currencyDecimals,
        walletBalanceMajor: (_walletData?['available'] ?? 0) as num,
        formattedBalance: _fmt((_walletData?['available'] ?? 0) as num),
        dialCode: _dialCode,
        defaultMsisdn: _defaultMsisdn,
      ),
    );

    if (!mounted) return;
    if (result != null) {
      // CRITICAL: backend success confirmed. Reset UUID so the next
      // withdrawal is a fresh intent with a new idempotency key.
      setState(() => _clientRequestId = null);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Demande de retrait enregistrée.'),
          backgroundColor: Color(0xFF4CAF50),
        ),
      );
      await _loadWalletData();
    }
    // result == null → cancel, error, or timeout. UUID preserved for retry.
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(16.0),
          child: Row(
            children: [
              CircularProgressIndicator(),
              SizedBox(width: 16),
              Text('Loading earnings...'),
            ],
          ),
        ),
      );
    }

    if (_error != null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            children: [
              const Icon(Icons.error_outline, color: Colors.red),
              const SizedBox(height: 8),
              Text('Error loading wallet: $_error'),
              const SizedBox(height: 8),
              ElevatedButton(
                onPressed: _loadWalletData,
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    final available = _walletData?['available'] ?? 0;
    final held = _walletData?['held'] ?? 0;
    final canWithdraw = _walletData?['canWithdraw'] ?? false;
    // Payouts are enabled when at least one MasterData provider in the
    // courier's country supports payouts. Country gating by hardcoded CM
    // has been removed — multi-country support is driven entirely by
    // system_config/main.mobileMoneyProviders.
    final bool payoutsSupported = _eligibleProviders.isNotEmpty;
    final bool withdrawButtonEnabled = canWithdraw && payoutsSupported;

    final String payoutsUnavailableMsg = _countryCode == null
        ? 'Informations pays indisponibles. Réessayez plus tard.'
        : 'Retraits non disponibles dans votre pays pour le moment.';

    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                const Icon(
                  Icons.account_balance_wallet,
                  color: Color(0xFF4CAF50),
                  size: 24,
                ),
                const SizedBox(width: 8),
                const Text(
                  'My Earnings',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.refresh),
                  onPressed: _loadWalletData,
                  tooltip: 'Refresh',
                ),
              ],
            ),

            const SizedBox(height: 16),

            // Balance Display
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFF4CAF50).withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
                border:
                    Border.all(color: const Color(0xFF4CAF50).withOpacity(0.3)),
              ),
              child: Column(
                children: [
                  const Text(
                    'Available Balance',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _fmt(available),
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF4CAF50),
                    ),
                  ),
                  if (held > 0) ...[
                    const SizedBox(height: 8),
                    Text(
                      'Held: ${_fmt(held)}',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                  ],
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Action Buttons
            Row(
              children: [
                Expanded(
                  child: Tooltip(
                    message: payoutsSupported ? '' : payoutsUnavailableMsg,
                    child: ElevatedButton.icon(
                      onPressed: withdrawButtonEnabled
                          ? _onWithdrawPressed
                          : (payoutsSupported
                              ? null
                              : () {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text(payoutsUnavailableMsg),
                                    ),
                                  );
                                }),
                      icon: const Icon(Icons.money_off),
                      label: const Text('Withdraw'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: withdrawButtonEnabled
                            ? const Color(0xFF4CAF50)
                            : Colors.grey,
                        foregroundColor: Colors.white,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Transaction history coming soon!'),
                        ),
                      );
                    },
                    icon: const Icon(Icons.history),
                    label: const Text('History'),
                  ),
                ),
              ],
            ),

            // Status Info
            const SizedBox(height: 12),
            Text(
              !payoutsSupported
                  ? payoutsUnavailableMsg
                  : canWithdraw
                      ? 'Ready for withdrawal (min: ${_fmt(_minWithdrawal)})'
                      : 'Minimum withdrawal: ${_fmt(_minWithdrawal)}',
              style: TextStyle(
                fontSize: 12,
                color: withdrawButtonEnabled
                    ? const Color(0xFF4CAF50)
                    : Colors.grey[600],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Test-only builder that materialises the private withdrawal dialog
/// without requiring Firebase or a parent widget. Exposes the same
/// constructor arguments used by [_CourierWalletWidgetState._onWithdrawPressed].
@visibleForTesting
Widget debugBuildWithdrawalDialog({
  required String clientRequestId,
  required List<MasterDataProvider> eligibleProviders,
  String? preselectedProviderId,
  String currencyCode = 'XAF',
  int currencyDecimals = 0,
  num walletBalanceMajor = 0,
  String? formattedBalance,
  String dialCode = '',
  String defaultMsisdn = '',
}) {
  return _WithdrawalDialog(
    clientRequestId: clientRequestId,
    eligibleProviders: eligibleProviders,
    preselectedProviderId: preselectedProviderId,
    currencyCode: currencyCode,
    currencyDecimals: currencyDecimals,
    walletBalanceMajor: walletBalanceMajor,
    formattedBalance:
        formattedBalance ?? '$walletBalanceMajor $currencyCode',
    dialCode: dialCode,
    defaultMsisdn: defaultMsisdn,
  );
}

/// Multi-country withdrawal dialog. Mirrors the top-up dialog style
/// (StatefulWidget class, Form in a constrained SizedBox, Cancel/Confirm
/// actions). All country-specific details (provider list, dial prefix,
/// currency decimals) flow in via constructor params — no hardcoding.
class _WithdrawalDialog extends StatefulWidget {
  final String clientRequestId;
  final List<MasterDataProvider> eligibleProviders;
  final String? preselectedProviderId;
  final String currencyCode;
  final int currencyDecimals;
  final num walletBalanceMajor;
  final String formattedBalance;
  final String dialCode;
  final String defaultMsisdn;

  const _WithdrawalDialog({
    required this.clientRequestId,
    required this.eligibleProviders,
    required this.preselectedProviderId,
    required this.currencyCode,
    required this.currencyDecimals,
    required this.walletBalanceMajor,
    required this.formattedBalance,
    required this.dialCode,
    required this.defaultMsisdn,
  });

  @override
  State<_WithdrawalDialog> createState() => _WithdrawalDialogState();
}

class _WithdrawalDialogState extends State<_WithdrawalDialog> {
  final _formKey = GlobalKey<FormState>();
  late String? _selectedProviderId = widget.preselectedProviderId;
  final _amountController = TextEditingController();
  late final TextEditingController _msisdnController =
      TextEditingController(text: widget.defaultMsisdn);
  bool _isSubmitting = false;
  String? _error;

  @override
  void dispose() {
    _amountController.dispose();
    _msisdnController.dispose();
    super.dispose();
  }

  MasterDataProvider? get _selectedProvider {
    if (_selectedProviderId == null) return null;
    for (final p in widget.eligibleProviders) {
      if (p.id == _selectedProviderId) return p;
    }
    return null;
  }

  Future<void> _submit() async {
    if (_selectedProviderId == null) {
      setState(() => _error = 'Sélectionnez un opérateur');
      return;
    }
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() {
      _isSubmitting = true;
      _error = null;
    });

    try {
      final major = double.parse(_amountController.text.replaceAll(',', '.'));
      final factor = math.pow(10, widget.currencyDecimals).toDouble();
      final amountMinor = (major * factor).round();

      final result = await WithdrawalService.createWithdrawal(
        amountMinor: amountMinor,
        currencyCode: widget.currencyCode,
        providerId: _selectedProviderId!,
        msisdn: _msisdnController.text.trim(),
        // CRITICAL: reuse parent-owned UUID. Same on every retry within
        // this dialog lifetime → backend returns existing request if
        // already created (idempotent). Never regenerate here.
        clientRequestId: widget.clientRequestId,
        ownerType: 'courier',
      );

      if (!mounted) return;
      Navigator.of(context).pop(result);
    } on WithdrawalException catch (e) {
      debugPrint('withdrawal_error: code=${e.code}');
      if (!mounted) return;
      setState(() => _error = e.userMessage);
    } catch (_) {
      debugPrint('withdrawal_unexpected_error');
      if (!mounted) return;
      setState(() => _error = 'Une erreur est survenue. Veuillez réessayer.');
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final selectedProvider = _selectedProvider;
    return AlertDialog(
      title: const Row(
        children: [
          Icon(Icons.arrow_upward, color: Color(0xFF1976D2)),
          SizedBox(width: 8),
          Text('Retrait'),
        ],
      ),
      content: SizedBox(
        width: MediaQuery.of(context).size.width * 0.9,
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Balance display
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFF4CAF50).withOpacity(0.08),
                  borderRadius: BorderRadius.circular(8),
                ),
                width: double.infinity,
                child: Text(
                  'Solde disponible : ${widget.formattedBalance}',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF2E7D32),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Provider dropdown (from MasterData, filtered supportsPayouts).
              DropdownButtonFormField<String>(
                value: _selectedProviderId,
                decoration: const InputDecoration(
                  labelText: 'Opérateur',
                  border: OutlineInputBorder(),
                ),
                items: widget.eligibleProviders
                    .map(
                      (p) => DropdownMenuItem<String>(
                        value: p.id,
                        child: Text(p.name),
                      ),
                    )
                    .toList(),
                validator: (v) =>
                    v == null ? 'Sélectionnez un opérateur' : null,
                onChanged: (v) => setState(() => _selectedProviderId = v),
              ),
              const SizedBox(height: 16),

              // Amount (major units — converted to minor before callable).
              TextFormField(
                controller: _amountController,
                keyboardType: TextInputType.numberWithOptions(
                  decimal: widget.currencyDecimals > 0,
                ),
                decoration: InputDecoration(
                  labelText: 'Montant (${widget.currencyCode})',
                  border: const OutlineInputBorder(),
                ),
                validator: (v) {
                  if (v == null || v.trim().isEmpty) {
                    return 'Saisissez un montant';
                  }
                  final parsed = double.tryParse(v.replaceAll(',', '.'));
                  if (parsed == null || parsed <= 0) {
                    return 'Montant invalide';
                  }
                  if (parsed > widget.walletBalanceMajor.toDouble()) {
                    return 'Solde insuffisant';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),

              // Phone number with country dial prefix (from MasterData).
              TextFormField(
                controller: _msisdnController,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(
                  labelText: 'Numéro mobile',
                  border: const OutlineInputBorder(),
                  prefixText: widget.dialCode.isNotEmpty
                      ? '+${widget.dialCode} '
                      : null,
                ),
                validator: (v) {
                  if (v == null || v.trim().isEmpty) {
                    return 'Numéro requis';
                  }
                  if (selectedProvider == null) {
                    return 'Sélectionnez un opérateur';
                  }
                  // MANDATORY: shared validator, no local fallback.
                  final ok = EncryptionService.validatePhoneWithMethod(
                    v.trim(),
                    selectedProvider.methodCode,
                  );
                  return ok ? null : 'Numéro invalide pour cet opérateur';
                },
              ),

              if (_error != null) ...[
                const SizedBox(height: 16),
                Text(
                  _error!,
                  style: const TextStyle(color: Colors.red),
                ),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isSubmitting ? null : () => Navigator.of(context).pop(),
          child: const Text('Annuler'),
        ),
        ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF1976D2),
            foregroundColor: Colors.white,
          ),
          onPressed: _isSubmitting ? null : _submit,
          child: _isSubmitting
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Text('Confirmer le retrait'),
        ),
      ],
    );
  }
}
