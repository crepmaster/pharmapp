import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:pharmapp_shared/services/unified_wallet_service.dart';

/// Courier Wallet Widget
/// Displays earnings, balance, and withdrawal options for couriers
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
    final formatted = major
        .toStringAsFixed(decimals)
        .replaceAllMapped(
          RegExp(r'(\d)(?=(\d{3})+(?:\.|\$))'),
          (m) => '${m[1]},',
        );
    return '$formatted $_currency';
  }

  @override
  void initState() {
    super.initState();
    _loadCurrency();
    _loadWalletData();
  }

  Future<void> _loadCurrency() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;
    try {
      final doc = await FirebaseFirestore.instance
          .collection('couriers')
          .doc(uid)
          .get();
      if (!doc.exists || !mounted) return;
      final cc = doc.data()?['countryCode'] as String?;
      final currency = cc == null ? null : _countryCurrency[cc];
      setState(() {
        _countryCode = cc;
        if (currency != null) {
          _currency = currency;
          _minWithdrawal = _minWithdrawalByCurrency[currency] ?? 1000;
        }
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

  Future<void> _showWithdrawalDialog() async {
    final phoneController = TextEditingController();
    final amountController = TextEditingController();
    String selectedMethod = 'mtn';

    return showDialog(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          title: const Text('💰 Withdraw Earnings'),
          content: StatefulBuilder(
            builder: (context, setDialogState) {
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Available: ${_fmt(_walletData?['available'] ?? 0)}',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF4CAF50),
                    ),
                  ),
                  const SizedBox(height: 16),
                  
                  // LEGACY: withdrawal dialog is Cameroon-only — operator list,
                  // dial prefix (+237), and phone regex are all hardcoded for
                  // the Cameroon market. UnifiedWalletService.createCourierWithdrawal
                  // also passes +237 prefix to the backend payout rail.
                  // Refactor to country-aware when multi-country payout is introduced.
                  // Payment Method Selection
                  DropdownButtonFormField<String>(
                    initialValue: selectedMethod,
                    decoration: const InputDecoration(
                      labelText: 'Payment Method',
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(value: 'mtn', child: Text('🟠 MTN MoMo')),
                      DropdownMenuItem(value: 'orange', child: Text('🟧 Orange Money')),
                    ],
                    onChanged: (value) {
                      setDialogState(() => selectedMethod = value!);
                    },
                  ),
                  
                  const SizedBox(height: 16),
                  
                  // Phone Number
                  TextField(
                    controller: phoneController,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'Phone Number',
                      prefixText: '+237 ',
                      border: OutlineInputBorder(),
                      helperText: 'Your mobile money number',
                    ),
                  ),
                  
                  const SizedBox(height: 16),
                  
                  // Amount
                  TextField(
                    controller: amountController,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: 'Withdrawal Amount ($_currency)',
                      border: const OutlineInputBorder(),
                      helperText: 'Minimum: ${_fmt(_minWithdrawal)}',
                    ),
                  ),
                ],
              );
            },
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF4CAF50),
                foregroundColor: Colors.white,
              ),
              onPressed: () async {
                final amount = int.tryParse(amountController.text);
                if (amount == null || amount < _minWithdrawal) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Please enter a valid amount (min: ${_fmt(_minWithdrawal)})'),
                      backgroundColor: Colors.red,
                    ),
                  );
                  return;
                }

                // Validate phone number format for Cameroon
                final phoneRegex = RegExp(r'^[6-9]\d{8}$'); // Cameroon mobile format
                if (phoneController.text.isEmpty || !phoneRegex.hasMatch(phoneController.text)) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Please enter a valid phone number (9 digits, starting with 6-9)'),
                      backgroundColor: Colors.red,
                    ),
                  );
                  return;
                }

                Navigator.of(dialogContext).pop();
                
                // Process withdrawal
                try {
                  final userId = FirebaseAuth.instance.currentUser!.uid;
                  await UnifiedWalletService.createCourierWithdrawal(
                    courierId: userId,
                    amountXAF: amount,
                    method: selectedMethod,
                    phoneNumber: '+237${phoneController.text}',
                  );

                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('🎉 Withdrawal request submitted!'),
                        backgroundColor: Color(0xFF4CAF50),
                      ),
                    );
                    _loadWalletData(); // Refresh data
                  }
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('Withdrawal error: $e'),
                        backgroundColor: Colors.red,
                      ),
                    );
                  }
                }
              },
              child: const Text('Withdraw'),
            ),
          ],
        );
      },
    );
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
    // F1b: withdrawal flow is currently Cameroon-only. Gate on countryCode
    // directly (not currency proxy) since currency can be shared across
    // countries (XAF = Cameroon + other CEMAC states). Other countries will
    // be enabled once country-aware payout rails are implemented.
    final bool _payoutsSupported = _countryCode == 'CM';
    final bool payoutsSupported = _payoutsSupported;
    final bool withdrawButtonEnabled = canWithdraw && payoutsSupported;

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
                border: Border.all(color: const Color(0xFF4CAF50).withOpacity(0.3)),
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
                    message: payoutsSupported
                        ? ''
                        : 'Payouts are currently available for Cameroon only. Other countries coming soon.',
                    child: ElevatedButton.icon(
                      onPressed: withdrawButtonEnabled
                          ? _showWithdrawalDialog
                          : (payoutsSupported
                              ? null
                              : () {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text(
                                        'Payouts are currently available for Cameroon only. Other countries coming soon.',
                                      ),
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
                      // TODO: Navigate to transaction history
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
                  ? 'Payouts are currently available for Cameroon only. Other countries coming soon.'
                  : canWithdraw
                      ? '✅ Ready for withdrawal (min: ${_fmt(_minWithdrawal)})'
                      : '⏳ Minimum withdrawal: ${_fmt(_minWithdrawal)}',
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