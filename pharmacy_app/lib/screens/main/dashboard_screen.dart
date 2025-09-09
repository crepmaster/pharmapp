import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../blocs/auth_bloc.dart';
import '../../services/payment_service.dart';
import '../../widgets/subscription_status_widget.dart';
import '../inventory/inventory_browser_screen.dart';
import '../exchanges/proposals_screen.dart';
import '../profile/profile_screen.dart';
import 'package:pharmapp_shared/pharmapp_shared.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pharmacy Dashboard'),
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
        actions: [
          PopupMenuButton(
            icon: const Icon(Icons.more_vert),
            onSelected: (value) {
              if (value == 'profile') {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (context) => const ProfileScreen(),
                  ),
                );
              } else if (value == 'logout') {
                context.read<AuthBloc>().add(AuthSignOutRequested());
              }
            },
            itemBuilder: (context) => <PopupMenuEntry>[
              const PopupMenuItem(
                value: 'profile',
                child: ListTile(
                  leading: Icon(Icons.person),
                  title: Text('Profile'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              const PopupMenuItem(
                value: 'settings',
                child: ListTile(
                  leading: Icon(Icons.settings),
                  title: Text('Settings'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem(
                value: 'logout',
                child: ListTile(
                  leading: Icon(Icons.logout, color: Colors.red),
                  title: Text('Sign Out', style: TextStyle(color: Colors.red)),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ],
          ),
        ],
      ),
      body: BlocBuilder<AuthBloc, AuthState>(
        builder: (context, state) {
          if (state is AuthAuthenticated) {
            return SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Welcome Card with Wallet
                  Card(
                    elevation: 2,
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(
                                Icons.local_pharmacy,
                                size: 40,
                                color: Color(0xFF1976D2),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Welcome back!',
                                      style: TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.bold,
                                        color: Colors.grey[800],
                                      ),
                                    ),
                                    Text(
                                      state.user.pharmacyName,
                                      style: const TextStyle(
                                        fontSize: 16,
                                        color: Color(0xFF1976D2),
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          
                          // Wallet Balance Section
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.grey[50],
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: Colors.grey[200]!),
                            ),
                            child: FutureBuilder<Map<String, dynamic>>(
                              future: PaymentService.getWalletBalance(
                                userId: FirebaseAuth.instance.currentUser!.uid,
                              ),
                              builder: (context, snapshot) {
                                if (snapshot.connectionState == ConnectionState.waiting) {
                                  return const Row(
                                    children: [
                                      Icon(Icons.account_balance_wallet, color: Colors.grey),
                                      SizedBox(width: 8),
                                      Text('Loading wallet...'),
                                    ],
                                  );
                                }
                                
                                if (snapshot.hasError) {
                                  // Debug statement removed for production security
                                  return Container(
                                    padding: const EdgeInsets.all(8),
                                    decoration: BoxDecoration(
                                      color: Colors.orange.shade50,
                                      borderRadius: BorderRadius.circular(6),
                                      border: Border.all(color: Colors.orange.shade200),
                                    ),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Icon(Icons.warning_amber_rounded, 
                                                 color: Colors.orange.shade700, size: 18),
                                            const SizedBox(width: 8),
                                            Text('Wallet Service Unavailable',
                                                 style: TextStyle(
                                                   color: Colors.orange.shade700,
                                                   fontWeight: FontWeight.w600,
                                                 )),
                                          ],
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          'Backend functions not deployed yet. Wallet will be available once cloud functions are set up.',
                                          style: TextStyle(
                                            fontSize: 12,
                                            color: Colors.orange.shade600,
                                          ),
                                        ),
                                        const SizedBox(height: 8),
                                        Row(
                                          children: [
                                            const Icon(Icons.account_balance_wallet, 
                                                     color: Colors.grey, size: 16),
                                            const SizedBox(width: 4),
                                            Text('Balance: Not available',
                                                 style: TextStyle(
                                                   fontSize: 12,
                                                   color: Colors.grey.shade600,
                                                 )),
                                          ],
                                        ),
                                      ],
                                    ),
                                  );
                                }
                                
                                final wallet = snapshot.data ?? {};
                                final available = wallet['available'] ?? 0;
                                final held = wallet['held'] ?? 0;
                                
                                return Column(
                                  children: [
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        const Row(
                                          children: [
                                            Icon(Icons.account_balance_wallet, 
                                                     color: Color(0xFF1976D2)),
                                            SizedBox(width: 8),
                                            Text('Wallet Balance',
                                                 style: TextStyle(fontWeight: FontWeight.w600)),
                                          ],
                                        ),
                                        TextButton.icon(
                                          onPressed: () => _showTopUpDialog(context),
                                          icon: const Icon(Icons.add),
                                          label: const Text('Top Up'),
                                          style: TextButton.styleFrom(
                                            foregroundColor: const Color(0xFF1976D2),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 8),
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text('Available', 
                                                 style: TextStyle(color: Colors.grey[600], fontSize: 12)),
                                            Text('${(available / 100).toStringAsFixed(0)} XAF',
                                                 style: const TextStyle(fontWeight: FontWeight.bold)),
                                          ],
                                        ),
                                        Column(
                                          crossAxisAlignment: CrossAxisAlignment.end,
                                          children: [
                                            Text('Held', 
                                                 style: TextStyle(color: Colors.grey[600], fontSize: 12)),
                                            Text('${(held / 100).toStringAsFixed(0)} XAF',
                                                 style: TextStyle(color: Colors.orange[700], 
                                                                  fontWeight: FontWeight.bold)),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ],
                                );
                              },
                            ),
                          ),
                          
                          const SizedBox(height: 8),
                          Text(
                            'Ready to manage your pharmacy inventory and exchanges',
                            style: TextStyle(
                              color: Colors.grey[600],
                              fontSize: 14,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  
                  const SizedBox(height: 16),
                  
                  // 🔒 SUBSCRIPTION STATUS (CRITICAL FOR REVENUE)
                  const SubscriptionStatusWidget(),
                  
                  const SizedBox(height: 24),
                  
                  // Quick Actions
                  Text(
                    'Quick Actions',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: Colors.grey[800],
                    ),
                  ),
                  
                  const SizedBox(height: 16),
                  
                  GridView.count(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisCount: 4,
                    crossAxisSpacing: 8,
                    mainAxisSpacing: 8,
                    childAspectRatio: 1.2,
                    children: [
                      _buildActionCard(
                        'Inventory',
                        Icons.inventory_2,
                        Colors.blue,
                        () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => const InventoryBrowserScreen(),
                            ),
                          );
                        },
                      ),
                      _buildActionCard(
                        'Browse Medicines',
                        Icons.search,
                        Colors.green,
                        () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => const InventoryBrowserScreen(),
                            ),
                          );
                        },
                      ),
                      _buildActionCard(
                        'Proposals',
                        Icons.assignment,
                        Colors.orange,
                        () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => const ProposalsScreen(),
                            ),
                          );
                        },
                      ),
                      _buildActionCard(
                        'Analytics',
                        Icons.analytics,
                        Colors.purple,
                        () {
                          // TODO: Navigate to analytics
                        },
                      ),
                    ],
                  ),
                  
                  const SizedBox(height: 32),
                  
                  // Recent Activity
                  Text(
                    'Recent Activity',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: Colors.grey[800],
                    ),
                  ),
                  
                  const SizedBox(height: 16),
                  
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        children: [
                          const Icon(
                            Icons.timeline,
                            size: 48,
                            color: Colors.grey,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'No recent activity',
                            style: TextStyle(
                              fontSize: 16,
                              color: Colors.grey[600],
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Start creating medicine exchanges to see activity here',
                            style: TextStyle(
                              fontSize: 14,
                              color: Colors.grey[500],
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            );
          }
          return const Center(child: CircularProgressIndicator());
        },
      ),
    );
  }

  Widget _buildActionCard(
    String title,
    IconData icon,
    Color color,
    VoidCallback onTap,
  ) {
    return Card(
      elevation: 2,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(8.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 20,
                color: color,
              ),
              const SizedBox(height: 4),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showTopUpDialog(BuildContext context) async {
    showDialog(
      context: context,
      builder: (BuildContext context) => const _TopUpWalletDialog(),
    );
  }
}

/// Enhanced Top-Up Dialog with Payment Preferences Integration
class _TopUpWalletDialog extends StatefulWidget {
  const _TopUpWalletDialog();

  @override
  State<_TopUpWalletDialog> createState() => _TopUpWalletDialogState();
}

class _TopUpWalletDialogState extends State<_TopUpWalletDialog> {
  final _formKey = GlobalKey<FormState>();
  final _amountController = TextEditingController();
  final _phoneController = TextEditingController();
  
  String _selectedMethod = 'mtn';
  bool _isLoading = false;
  PaymentPreferences? _savedPreferences;
  
  // Quick amount buttons
  final List<int> _quickAmounts = [500, 1000, 2500, 5000, 10000, 25000];

  @override
  void initState() {
    super.initState();
    _loadSavedPaymentPreferences();
  }

  @override
  void dispose() {
    _amountController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  /// Load saved payment preferences for auto-fill
  Future<void> _loadSavedPaymentPreferences() async {
    if (!mounted) return;
    
    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) return;

      final doc = await FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .get();

      if (doc.exists) {
        final data = doc.data() as Map<String, dynamic>;
        if (data.containsKey('paymentPreferences')) {
          final prefData = data['paymentPreferences'] as Map<String, dynamic>;
          final preferences = PaymentPreferences.fromMap(prefData);
          
          if (mounted) {
            setState(() {
              _savedPreferences = preferences;
              _selectedMethod = preferences.defaultMethod;
              // Don't auto-fill phone for security - user must enter
            });
          }
        }
      }
    } catch (e) {
      // Silently handle - user can enter manually
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Row(
        children: [
          const Icon(Icons.account_balance_wallet, color: Color(0xFF1976D2)),
          const SizedBox(width: 8),
          const Text('Top Up Wallet'),
        ],
      ),
      content: Form(
        key: _formKey,
        child: SizedBox(
          width: MediaQuery.of(context).size.width * 0.9,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Saved preferences info
              if (_savedPreferences != null) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.blue.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.blue.shade200),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.info_outline, color: Colors.blue.shade600, size: 16),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Using saved payment method: ${_savedPreferences!.methodDisplayName}',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.blue.shade700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ],

              // Quick amount selection
              Text(
                'Quick Amount Selection',
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: Colors.grey[700],
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _quickAmounts.map((amount) => 
                  _buildQuickAmountChip(amount)
                ).toList(),
              ),
              const SizedBox(height: 16),

              // Custom amount input
              TextFormField(
                controller: _amountController,
                decoration: const InputDecoration(
                  labelText: 'Amount (XAF)',
                  hintText: 'Enter amount or select above',
                  prefixIcon: Icon(Icons.attach_money),
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.number,
                validator: (value) {
                  if (value?.isEmpty ?? true) {
                    return 'Please enter an amount';
                  }
                  final amount = int.tryParse(value!);
                  if (amount == null || amount < 100) {
                    return 'Minimum amount is 100 XAF';
                  }
                  if (amount > 500000) {
                    return 'Maximum amount is 500,000 XAF';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),

              // Payment method selection
              DropdownButtonFormField<String>(
                value: _selectedMethod,
                decoration: const InputDecoration(
                  labelText: 'Payment Method',
                  prefixIcon: Icon(Icons.payment),
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'mtn', child: Text('MTN Mobile Money')),
                  DropdownMenuItem(value: 'orange', child: Text('Orange Money')),
                ],
                onChanged: (value) {
                  setState(() {
                    _selectedMethod = value!;
                    // Clear phone if method changes for security
                    if (_phoneController.text.isNotEmpty) {
                      _phoneController.clear();
                    }
                  });
                },
                validator: (value) => value == null ? 'Select payment method' : null,
              ),
              const SizedBox(height: 16),

              // Phone number input with validation
              TextFormField(
                controller: _phoneController,
                decoration: InputDecoration(
                  labelText: 'Phone Number',
                  hintText: _getPhoneHint(),
                  prefixIcon: const Icon(Icons.phone),
                  border: const OutlineInputBorder(),
                  helperText: _getMethodValidationText(),
                ),
                keyboardType: TextInputType.phone,
                validator: (value) {
                  if (value?.isEmpty ?? true) {
                    return 'Phone number is required';
                  }
                  
                  if (!EncryptionService.isValidCameroonPhone(value!)) {
                    return 'Please enter a valid Cameroon phone number';
                  }

                  if (!EncryptionService.validatePhoneWithMethod(value, _selectedMethod)) {
                    return _getMethodValidationError();
                  }
                  
                  return null;
                },
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: _isLoading ? null : _processTopUp,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF1976D2),
            foregroundColor: Colors.white,
          ),
          child: _isLoading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                )
              : const Text('Top Up'),
        ),
      ],
    );
  }

  Widget _buildQuickAmountChip(int amount) {
    final isSelected = _amountController.text == amount.toString();
    
    return FilterChip(
      label: Text('${amount.toString().replaceAllMapped(
        RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), 
        (Match m) => '${m[1]},',
      )} XAF'),
      selected: isSelected,
      onSelected: (selected) {
        setState(() {
          _amountController.text = selected ? amount.toString() : '';
        });
      },
      selectedColor: const Color(0xFF1976D2).withOpacity(0.2),
      checkmarkColor: const Color(0xFF1976D2),
    );
  }

  String _getPhoneHint() {
    switch (_selectedMethod) {
      case 'mtn':
        return '677 XX XX XX (MTN)';
      case 'orange':
        return '694 XX XX XX (Orange)';
      default:
        return '+237 6XX XXX XXX';
    }
  }

  String _getMethodValidationText() {
    switch (_selectedMethod) {
      case 'mtn':
        return 'MTN numbers: 650-659, 670-679, 680-689';
      case 'orange':
        return 'Orange numbers: 690-699';
      default:
        return '';
    }
  }

  String _getMethodValidationError() {
    switch (_selectedMethod) {
      case 'mtn':
        return 'This number is not a valid MTN Mobile Money number';
      case 'orange':
        return 'This number is not a valid Orange Money number';
      default:
        return 'Invalid phone number for selected method';
    }
  }

  Future<void> _processTopUp() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    try {
      final amount = int.parse(_amountController.text);
      final phone = _phoneController.text;
      final user = FirebaseAuth.instance.currentUser!;

      // Show processing message
      if (mounted) {
        Navigator.pop(context); // Close dialog first
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Row(
              children: [
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                ),
                SizedBox(width: 12),
                Text('Processing payment request...'),
              ],
            ),
            backgroundColor: Colors.orange,
            duration: Duration(seconds: 3),
          ),
        );
      }

      // Create top-up through unified wallet service
      final result = await UnifiedWalletService.createTopup(
        userId: user.uid,
        amountXAF: amount,
        method: _selectedMethod,
        phoneNumber: phone,
        description: 'Pharmacy wallet top-up',
      );

      if (mounted) {
        final success = result['status'] == 'success' || 
                       result['status'] == 'pending' || 
                       result.containsKey('payment_url');

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                Icon(
                  success ? Icons.check_circle : Icons.error,
                  color: Colors.white,
                  size: 20,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    success 
                        ? 'Top-up request sent! Check your phone for payment prompt.'
                        : 'Payment request failed: ${result['message'] ?? 'Unknown error'}',
                  ),
                ),
              ],
            ),
            backgroundColor: success ? Colors.green : Colors.red,
            duration: const Duration(seconds: 5),
          ),
        );

        // Save payment preferences if successful
        if (success) {
          await _savePaymentPreferences();
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.error, color: Colors.white, size: 20),
                const SizedBox(width: 12),
                Expanded(
                  child: Text('Network error: ${e.toString()}'),
                ),
              ],
            ),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  /// Save payment preferences for future use (encrypted)
  Future<void> _savePaymentPreferences() async {
    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) return;

      final preferences = PaymentPreferences.createSecure(
        method: _selectedMethod,
        phoneNumber: _phoneController.text,
        isSetupComplete: true,
      );

      await FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .update({
        'paymentPreferences': preferences.toMap(),
        'paymentPreferencesUpdated': FieldValue.serverTimestamp(),
      });
    } catch (e) {
      // Silently handle - not critical for top-up success
    }
  }
}