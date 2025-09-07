import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../services/unified_wallet_service.dart';

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

  @override
  void initState() {
    super.initState();
    _loadWalletData();
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
                    'Available: ${UnifiedWalletService.formatXAF(_walletData?['available'] ?? 0)}',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF4CAF50),
                    ),
                  ),
                  const SizedBox(height: 16),
                  
                  // Payment Method Selection
                  DropdownButtonFormField<String>(
                    value: selectedMethod,
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
                    decoration: const InputDecoration(
                      labelText: 'Withdrawal Amount (XAF)',
                      border: OutlineInputBorder(),
                      helperText: 'Minimum: 1,000 XAF',
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
                if (amount == null || amount < 1000) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Please enter a valid amount (min: 1,000 XAF)'),
                      backgroundColor: Colors.red,
                    ),
                  );
                  return;
                }

                if (phoneController.text.isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Please enter your phone number'),
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
                    UnifiedWalletService.formatXAF(available),
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF4CAF50),
                    ),
                  ),
                  if (held > 0) ...[
                    const SizedBox(height: 8),
                    Text(
                      'Held: ${UnifiedWalletService.formatXAF(held)}',
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
                  child: ElevatedButton.icon(
                    onPressed: canWithdraw ? _showWithdrawalDialog : null,
                    icon: const Icon(Icons.money_off),
                    label: const Text('Withdraw'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: canWithdraw 
                          ? const Color(0xFF4CAF50) 
                          : Colors.grey,
                      foregroundColor: Colors.white,
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
              canWithdraw 
                  ? '✅ Ready for withdrawal (min: 1,000 XAF)'
                  : '⏳ Minimum withdrawal: 1,000 XAF',
              style: TextStyle(
                fontSize: 12,
                color: canWithdraw ? const Color(0xFF4CAF50) : Colors.grey[600],
              ),
            ),
          ],
        ),
      ),
    );
  }
}