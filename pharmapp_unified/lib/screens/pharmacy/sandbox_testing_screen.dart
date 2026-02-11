import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

/// 🧪 SANDBOX TESTING SCREEN - REMOVE BEFORE PRODUCTION
///
/// This screen provides testing capabilities for wallet operations in sandbox mode.
/// It allows manual wallet crediting/debiting without real mobile money transactions.
///
/// ⚠️ WARNING: This file MUST be removed before production deployment!
class SandboxTestingScreen extends StatefulWidget {
  const SandboxTestingScreen({super.key});

  @override
  State<SandboxTestingScreen> createState() => _SandboxTestingScreenState();
}

class _SandboxTestingScreenState extends State<SandboxTestingScreen> {
  static const String functionsUrl = 'https://europe-west1-mediexchange.cloudfunctions.net';

  final _creditAmountController = TextEditingController(text: '10000');
  final _debitAmountController = TextEditingController(text: '5000');

  bool _isLoading = false;
  String? _lastOperation;
  Map<String, dynamic>? _walletBalance;

  @override
  void initState() {
    super.initState();
    _loadWalletBalance();
  }

  @override
  void dispose() {
    _creditAmountController.dispose();
    _debitAmountController.dispose();
    super.dispose();
  }

  Future<void> _loadWalletBalance() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    try {
      final response = await http.get(
        Uri.parse('$functionsUrl/getWallet?userId=${user.uid}'),
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode == 200) {
        setState(() {
          _walletBalance = jsonDecode(response.body);
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading wallet: $e')),
        );
      }
    }
  }

  Future<void> _sandboxCredit() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final amount = int.tryParse(_creditAmountController.text);
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid amount')),
      );
      return;
    }

    setState(() => _isLoading = true);

    try {
      final response = await http.post(
        Uri.parse('$functionsUrl/sandboxCredit'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'userId': user.uid,
          'amount': amount,
          'currency': 'XAF',
        }),
      );

      if (response.statusCode == 200) {
        jsonDecode(response.body);
        setState(() {
          _lastOperation = '✅ Credit successful: ${_formatAmount(amount)} XAF';
        });
        await _loadWalletBalance();

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('✅ Added ${_formatAmount(amount)} XAF to wallet'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } else {
        throw Exception('Credit failed: ${response.body}');
      }
    } catch (e) {
      setState(() {
        _lastOperation = '❌ Credit failed: $e';
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('❌ Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _sandboxDebit() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final amount = int.tryParse(_debitAmountController.text);
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid amount')),
      );
      return;
    }

    // Check if sufficient balance
    if (_walletBalance != null) {
      final available = _walletBalance!['available'] ?? 0;
      if (amount > available) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Insufficient balance: ${_formatAmount(available)} XAF available'),
            backgroundColor: Colors.orange,
          ),
        );
        return;
      }
    }

    setState(() => _isLoading = true);

    try {
      final response = await http.post(
        Uri.parse('$functionsUrl/sandboxDebit'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'userId': user.uid,
          'amount': amount,
          'currency': 'XAF',
        }),
      );

      if (response.statusCode == 200) {
        jsonDecode(response.body);
        setState(() {
          _lastOperation = '✅ Debit successful: ${_formatAmount(amount)} XAF';
        });
        await _loadWalletBalance();

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('✅ Withdrew ${_formatAmount(amount)} XAF from wallet'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } else {
        throw Exception('Debit failed: ${response.body}');
      }
    } catch (e) {
      setState(() {
        _lastOperation = '❌ Debit failed: $e';
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('❌ Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      setState(() => _isLoading = false);
    }
  }

  String _formatAmount(int amount) {
    return amount.toString().replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (Match m) => '${m[1]},',
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    return Scaffold(
      appBar: AppBar(
        title: const Text('🧪 Sandbox Testing'),
        backgroundColor: Colors.orange,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadWalletBalance,
            tooltip: 'Refresh Balance',
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Warning Banner
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.orange.shade100,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.orange, width: 2),
              ),
              child: Column(
                children: [
                  const Icon(Icons.warning, color: Colors.orange, size: 40),
                  const SizedBox(height: 8),
                  Text(
                    '⚠️ SANDBOX TESTING MODE',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.orange.shade900,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'This screen is for development testing only.\nREMOVE before production deployment!',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.orange.shade800,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            // Current User Info
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Current User',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text('Email: ${user?.email ?? "Not logged in"}'),
                    Text('User ID: ${user?.uid ?? "N/A"}'),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 16),

            // Wallet Balance Card
            Card(
              color: Colors.blue.shade50,
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.account_balance_wallet, color: Colors.blue),
                        SizedBox(width: 8),
                        Text(
                          'Wallet Balance',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    if (_walletBalance == null)
                      const Center(child: CircularProgressIndicator())
                    else ...[
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Available:'),
                          Text(
                            '${_formatAmount(_walletBalance!['available'] ?? 0)} XAF',
                            style: const TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                              color: Colors.green,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Held:'),
                          Text(
                            '${_formatAmount(_walletBalance!['held'] ?? 0)} XAF',
                            style: const TextStyle(
                              fontSize: 16,
                              color: Colors.orange,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),

            const SizedBox(height: 24),

            // Credit Section
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.add_circle, color: Colors.green),
                        SizedBox(width: 8),
                        Text(
                          'Add Money (Credit)',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _creditAmountController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Amount (XAF)',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.attach_money),
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _isLoading ? null : _sandboxCredit,
                        icon: _isLoading
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.add),
                        label: const Text('Add Money to Wallet'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.all(16),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 16),

            // Debit Section
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.remove_circle, color: Colors.red),
                        SizedBox(width: 8),
                        Text(
                          'Withdraw Money (Debit)',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _debitAmountController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Amount (XAF)',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.money_off),
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _isLoading ? null : _sandboxDebit,
                        icon: _isLoading
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.remove),
                        label: const Text('Withdraw Money from Wallet'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.all(16),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 24),

            // Last Operation Result
            if (_lastOperation != null)
              Card(
                color: _lastOperation!.startsWith('✅')
                    ? Colors.green.shade50
                    : Colors.red.shade50,
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Last Operation',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(_lastOperation!),
                    ],
                  ),
                ),
              ),

            const SizedBox(height: 24),

            // Quick Amounts
            const Text(
              'Quick Amounts:',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                _buildQuickAmountChip(1000),
                _buildQuickAmountChip(5000),
                _buildQuickAmountChip(10000),
                _buildQuickAmountChip(25000),
                _buildQuickAmountChip(50000),
                _buildQuickAmountChip(100000),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildQuickAmountChip(int amount) {
    return ActionChip(
      label: Text('${_formatAmount(amount)} XAF'),
      onPressed: () {
        setState(() {
          _creditAmountController.text = amount.toString();
          _debitAmountController.text = amount.toString();
        });
      },
    );
  }
}
