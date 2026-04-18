import 'dart:async';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:pharmapp_shared/pharmapp_shared.dart';
import '../../blocs/unified_auth_bloc.dart';
import '../../navigation/role_router.dart';
import 'sandbox_testing_screen.dart';
import 'inventory/inventory_browser_screen.dart';
import 'exchanges/proposals_screen.dart';
import 'profile/profile_screen.dart';
import '../../widgets/pharmacy/subscription_status_widget.dart';

class PharmacyMainScreen extends StatefulWidget {
  final Map<String, dynamic> userData;

  const PharmacyMainScreen({
    super.key,
    required this.userData,
  });

  @override
  State<PharmacyMainScreen> createState() => _PharmacyMainScreenState();
}

class _PharmacyMainScreenState extends State<PharmacyMainScreen> {
  int _selectedIndex = 0;

  // Wallet polling state (for Home tab)
  int _walletRefreshKey = 0;
  Timer? _walletPollingTimer;
  int _pollingAttempts = 0;
  bool _isPolling = false;
  bool _isWaitingForPayment = false;
  static const int _maxPollingAttempts = 20; // Poll for ~60 seconds

  // Currency resolution from pharmacy country (runtime source of truth).
  static const Map<String, String> _countryCurrency = {
    'CM': 'XAF',
    'GH': 'GHS',
    'KE': 'KES',
    'NG': 'NGN',
    'TZ': 'TZS',
    'UG': 'UGX',
  };

  String _resolvedCurrency = 'XAF';

  String get _walletCurrency => _resolvedCurrency;

  @override
  void initState() {
    super.initState();
    _loadCurrency();
  }

  Future<void> _loadCurrency() async {
    // Try userData first (fast path)
    final ccFromUser = widget.userData['countryCode'] as String?;
    if (ccFromUser != null && _countryCurrency.containsKey(ccFromUser)) {
      setState(() => _resolvedCurrency = _countryCurrency[ccFromUser]!);
      return;
    }
    // Fallback: read pharmacy doc from Firestore
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;
    try {
      final doc = await FirebaseFirestore.instance
          .collection('pharmacies').doc(uid).get();
      if (!doc.exists || !mounted) return;
      final cc = doc.data()?['countryCode'] as String?;
      if (cc != null && _countryCurrency.containsKey(cc)) {
        setState(() => _resolvedCurrency = _countryCurrency[cc]!);
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    // Clean up timer
    _walletPollingTimer?.cancel();
    _walletPollingTimer = null;
    _isPolling = false;
    super.dispose();
  }

  void _refreshWalletBalance() {
    if (mounted) {
      setState(() {
        _walletRefreshKey++;
      });
    }
  }

  void _startWalletPolling() {
    // Cancel any existing polling
    _walletPollingTimer?.cancel();
    _walletPollingTimer = null;
    _pollingAttempts = 0;

    // Set waiting status for UI feedback
    if (mounted) {
      setState(() => _isWaitingForPayment = true);
    }

    // Start polling every 3 seconds
    _walletPollingTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      _pollingAttempts++;

      // Prevent race conditions
      if (!mounted || _isPolling) {
        if (!mounted) {
          timer.cancel();
          _walletPollingTimer = null;
        }
        return;
      }

      _isPolling = true;

      try {
        _refreshWalletBalance();
      } finally {
        _isPolling = false;
      }

      // Stop polling after max attempts
      if (_pollingAttempts >= _maxPollingAttempts) {
        timer.cancel();
        _walletPollingTimer = null;
        if (mounted) {
          setState(() => _isWaitingForPayment = false);
        }
      }
    });

    // Also do an immediate refresh
    _refreshWalletBalance();
  }

  @override
  Widget build(BuildContext context) {
    final List<Widget> screens = [
      _buildHomeTab(),
      const InventoryBrowserScreen(),
      const ProposalsScreen(),
      const ProfileScreen(),
    ];

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) {
          showDialog(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('Exit App?'),
              content: const Text('Do you want to exit the application?'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Cancel'),
                ),
                TextButton(
                  onPressed: () {
                    context.read<UnifiedAuthBloc>().add(SignOutRequested());
                  },
                  child: const Text('Exit'),
                ),
              ],
            ),
          );
        }
      },
      child: Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const Icon(Icons.local_pharmacy, color: Colors.white),
            const SizedBox(width: 8),
            Text(
              widget.userData['pharmacyName'] ?? 'Pharmacy Dashboard',
              style: const TextStyle(color: Colors.white),
            ),
          ],
        ),
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
        actions: [
          BlocBuilder<UnifiedAuthBloc, UnifiedAuthState>(
            builder: (context, state) {
              if (state is Authenticated && state.availableRoles.length > 1) {
                return RoleSwitcher(
                  availableRoles: state.availableRoles,
                  currentRole: state.userType,
                  onRoleSelected: (newRole) {
                    context.read<UnifiedAuthBloc>().add(SwitchRole(newRole));
                  },
                );
              }
              return const SizedBox.shrink();
            },
          ),
          PopupMenuButton(
            icon: const Icon(Icons.more_vert),
            onSelected: (value) {
              if (value == 'logout') {
                context.read<UnifiedAuthBloc>().add(SignOutRequested());
              }
            },
            itemBuilder: (context) => [
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
      body: IndexedStack(
        index: _selectedIndex,
        children: screens,
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _selectedIndex,
        onTap: (index) {
          setState(() => _selectedIndex = index);
        },
        type: BottomNavigationBarType.fixed,
        selectedItemColor: const Color(0xFF1976D2),
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.home),
            label: 'Home',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.inventory),
            label: 'Inventory',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.swap_horiz),
            label: 'Exchanges',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
    ),
    ); // Close PopScope
  }

  // FULL DASHBOARD CONTENT (from standalone app)
  Widget _buildHomeTab() {
    return BlocBuilder<UnifiedAuthBloc, UnifiedAuthState>(
      builder: (context, state) {
        if (state is Authenticated) {
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
                                    state.userData['pharmacyName'] ?? 'Pharmacy',
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
                            border: Border.all(color: Colors.grey.shade200),
                          ),
                          child: FutureBuilder<Map<String, dynamic>>(
                            key: ValueKey(_walletRefreshKey),
                            future: UnifiedWalletService.getWalletBalance(
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
                                return Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: Colors.orange.shade50,
                                    borderRadius: BorderRadius.circular(6),
                                    border: Border.all(color: Colors.orange.shade200),
                                  ),
                                  child: Row(
                                    children: [
                                      Icon(Icons.warning_amber_rounded,
                                           color: Colors.orange.shade700, size: 18),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(
                                          'Unable to load wallet. Tap to retry.',
                                          style: TextStyle(
                                            fontSize: 12,
                                            color: Colors.orange.shade700,
                                          ),
                                        ),
                                      ),
                                      IconButton(
                                        icon: Icon(Icons.refresh, color: Colors.orange.shade700, size: 20),
                                        onPressed: _refreshWalletBalance,
                                        padding: EdgeInsets.zero,
                                        constraints: const BoxConstraints(),
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
                                  // Polling status feedback
                                  if (_isWaitingForPayment) ...[
                                    Container(
                                      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                                      decoration: BoxDecoration(
                                        color: Colors.blue.shade50,
                                        borderRadius: BorderRadius.circular(6),
                                        border: Border.all(color: Colors.blue.shade200),
                                      ),
                                      child: Row(
                                        children: [
                                          SizedBox(
                                            width: 14,
                                            height: 14,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                              valueColor: AlwaysStoppedAnimation<Color>(Colors.blue.shade700),
                                            ),
                                          ),
                                          const SizedBox(width: 10),
                                          Expanded(
                                            child: Text(
                                              'Waiting for payment confirmation... (up to 60s)',
                                              style: TextStyle(
                                                fontSize: 12,
                                                color: Colors.blue.shade700,
                                                fontWeight: FontWeight.w500,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                  ],
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
                                          Text('${(available / 100).toStringAsFixed(0)} $_walletCurrency',
                                               style: const TextStyle(fontWeight: FontWeight.bold)),
                                        ],
                                      ),
                                      Column(
                                        crossAxisAlignment: CrossAxisAlignment.end,
                                        children: [
                                          Text('Held',
                                               style: TextStyle(color: Colors.grey[600], fontSize: 12)),
                                          Text('${(held / 100).toStringAsFixed(0)} $_walletCurrency',
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

                // Subscription Status
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
                        setState(() => _selectedIndex = 1); // Switch to Inventory tab
                      },
                    ),
                    _buildActionCard(
                      'Browse Medicines',
                      Icons.search,
                      Colors.green,
                      () {
                        setState(() => _selectedIndex = 1); // Switch to Inventory tab
                      },
                    ),
                    _buildActionCard(
                      'Proposals',
                      Icons.assignment,
                      Colors.orange,
                      () {
                        setState(() => _selectedIndex = 2); // Switch to Exchanges tab
                      },
                    ),
                    // Dev-only sandbox testing screen: hidden in release builds
                    // so it does not appear in production demos. It remains a
                    // fast path for local debugging of wallet/ledger flows.
                    if (kDebugMode)
                      _buildActionCard(
                        'Sandbox Testing',
                        Icons.science,
                        Colors.orange,
                        () {
                          Navigator.push(context, MaterialPageRoute(builder: (context) => const SandboxTestingScreen()));
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
      builder: (BuildContext context) => _TopUpWalletDialog(
        onTopUpSuccess: _startWalletPolling,
        currencyCode: _walletCurrency,
      ),
    );
  }
}

/// Enhanced Top-Up Dialog with Payment Preferences Integration
class _TopUpWalletDialog extends StatefulWidget {
  final VoidCallback? onTopUpSuccess;
  final String currencyCode;

  const _TopUpWalletDialog({this.onTopUpSuccess, this.currencyCode = 'XAF'});

  @override
  State<_TopUpWalletDialog> createState() => _TopUpWalletDialogState();
}

class _TopUpWalletDialogState extends State<_TopUpWalletDialog> {
  String get _walletCurrency => widget.currencyCode;
  final _formKey = GlobalKey<FormState>();
  final _amountController = TextEditingController();
  final _phoneController = TextEditingController();

  String _selectedMethod = 'mtn';
  bool _isLoading = false;
  PaymentPreferences? _savedPreferences;

  // Quick amount buttons
  static const Map<String, List<int>> _quickAmountsByCurrency = {
    'XAF': [500, 1000, 2500, 5000, 10000, 25000],
    'GHS': [5, 10, 25, 50, 100, 250],
    'KES': [50, 100, 250, 500, 1000, 2500],
    'NGN': [500, 1000, 2500, 5000, 10000, 25000],
    'TZS': [1000, 2500, 5000, 10000, 25000, 50000],
    'UGX': [1000, 2500, 5000, 10000, 25000, 50000],
  };

  List<int> get _quickAmounts =>
      _quickAmountsByCurrency[_walletCurrency] ??
      _quickAmountsByCurrency['XAF']!;

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

        // Get phone from user data
        String? userPhone;
        if (data.containsKey('phoneNumber')) {
          userPhone = data['phoneNumber'] as String?;
        } else if (data.containsKey('roleData') && data['roleData'] is Map) {
          final roleData = data['roleData'] as Map<String, dynamic>;
          userPhone = roleData['phoneNumber'] as String?;
        }

        // Get payment preferences
        Map<String, dynamic>? prefData;
        if (data.containsKey('roleData') && data['roleData'] is Map) {
          final roleData = data['roleData'] as Map<String, dynamic>;
          if (roleData.containsKey('paymentPreferences')) {
            prefData = roleData['paymentPreferences'] as Map<String, dynamic>;
          }
        } else if (data.containsKey('paymentPreferences')) {
          prefData = data['paymentPreferences'] as Map<String, dynamic>;
        }

        if (prefData != null) {
          final preferences = PaymentPreferences.fromMap(prefData);

          if (mounted) {
            setState(() {
              _savedPreferences = preferences;
              final method = preferences.defaultMethod.toLowerCase();
              if (method.contains('mtn')) {
                _selectedMethod = 'mtn';
              } else if (method.contains('orange')) {
                _selectedMethod = 'orange';
              } else {
                _selectedMethod = 'mtn';
              }

              if (userPhone != null && userPhone.isNotEmpty) {
                _phoneController.text = userPhone;
              }
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
      title: const Row(
        children: [
          Icon(Icons.account_balance_wallet, color: Color(0xFF1976D2)),
          SizedBox(width: 8),
          Text('Top Up Wallet'),
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
                decoration: InputDecoration(
                  labelText: 'Amount ($_walletCurrency)',
                  hintText: 'Enter amount or select above',
                  prefixIcon: const Icon(Icons.attach_money),
                  border: const OutlineInputBorder(),
                ),
                keyboardType: TextInputType.number,
                validator: (value) {
                  if (value?.isEmpty ?? true) {
                    return 'Please enter an amount';
                  }
                  final amount = int.tryParse(value!);
                  if (amount == null || amount <= 0) {
                    return 'Please enter a valid amount';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),

              // Payment method selection
              DropdownButtonFormField<String>(
                initialValue: _selectedMethod,
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
                    if (_phoneController.text.isNotEmpty) {
                      _phoneController.clear();
                    }
                  });
                },
                validator: (value) => value == null ? 'Select payment method' : null,
              ),
              const SizedBox(height: 16),

              // Phone number input — validation relaxed for non-CM countries.
              TextFormField(
                controller: _phoneController,
                decoration: InputDecoration(
                  labelText: 'Phone Number',
                  hintText: _walletCurrency == 'XAF'
                      ? _getPhoneHint()
                      : 'Enter your mobile money number',
                  prefixIcon: const Icon(Icons.phone),
                  border: const OutlineInputBorder(),
                  helperText: _walletCurrency == 'XAF'
                      ? _getMethodValidationText()
                      : null,
                ),
                keyboardType: TextInputType.phone,
                validator: (value) {
                  if (value?.isEmpty ?? true) {
                    return 'Phone number is required';
                  }
                  // Cameroon-specific validation only when currency is XAF.
                  // Multi-country top-up provider integration is a future sprint.
                  if (_walletCurrency == 'XAF') {
                    if (!EncryptionService.isValidCameroonPhone(value!)) {
                      return 'Please enter a valid Cameroon phone number';
                    }
                    if (!EncryptionService.validatePhoneWithMethod(value, _selectedMethod)) {
                      return _getMethodValidationError();
                    }
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
      )} $_walletCurrency'),
      selected: isSelected,
      onSelected: (selected) {
        setState(() {
          _amountController.text = selected ? amount.toString() : '';
        });
      },
      selectedColor: const Color(0xFF1976D2).withValues(alpha: 0.2),
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

    final amount = int.parse(_amountController.text);
    final phone = _phoneController.text;

    // Capture navigator and messenger from a root context BEFORE popping.
    // The dialog's state gets disposed on pop, so we can't rely on `mounted`
    // or the dialog's own `context` after this point.
    final navigator = Navigator.of(context, rootNavigator: true);
    final messenger = ScaffoldMessenger.of(context);
    final onSuccess = widget.onTopUpSuccess;

    // Close the form dialog.
    navigator.pop();

    // Show a progress dialog using the root navigator's overlay context.
    navigator.push(
      DialogRoute<void>(
        context: navigator.context,
        barrierDismissible: false,
        builder: (ctx) => const AlertDialog(
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('Waiting for MoMo approval...'),
              SizedBox(height: 8),
              Text(
                'Check your phone for the payment prompt.',
                style: TextStyle(fontSize: 12, color: Colors.grey),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );

    try {
      // Step 1: Initiate MTN MoMo request.
      final callable = FirebaseFunctions.instanceFor(region: 'europe-west1')
          .httpsCallable('mtnMomoTopupIntent');
      final initResult = await callable.call<Map<String, dynamic>>({
        'amount': amount,
        'phoneNumber': phone,
        'currency': _walletCurrency,
      });
      final referenceId = initResult.data['referenceId'] as String?;
      if (referenceId == null) {
        throw 'No reference ID returned';
      }

      // Step 2: Poll status every 3s for up to 60s.
      final checkCallable = FirebaseFunctions.instanceFor(region: 'europe-west1')
          .httpsCallable('mtnMomoCheckStatus');
      String status = 'pending';
      String? reason;
      for (var i = 0; i < 20; i++) {
        await Future.delayed(const Duration(seconds: 3));
        final check = await checkCallable.call<Map<String, dynamic>>({
          'referenceId': referenceId,
        });
        status = (check.data['status'] as String?) ?? 'pending';
        reason = check.data['reason'] as String?;
        if (status != 'pending') break;
      }

      // Close progress dialog — does not need `mounted` check since we use
      // captured navigator reference from before the state dispose.
      navigator.pop();

      if (status == 'successful') {
        messenger.showSnackBar(
          const SnackBar(
            content: Text('Top-up successful! Wallet credited.'),
            backgroundColor: Colors.green,
          ),
        );
        onSuccess?.call();
      } else if (status == 'failed') {
        messenger.showSnackBar(
          SnackBar(
            content: Text('Top-up failed: ${reason ?? "payment not approved"}'),
            backgroundColor: Colors.red,
          ),
        );
      } else {
        messenger.showSnackBar(
          const SnackBar(
            content: Text('Top-up is still pending. Check your wallet shortly.'),
            backgroundColor: Colors.orange,
          ),
        );
      }
    } on FirebaseFunctionsException catch (e) {
      navigator.pop();
      messenger.showSnackBar(
        SnackBar(
          content: Text('Top-up error: ${e.message ?? e.code}'),
          backgroundColor: Colors.red,
        ),
      );
    } catch (e) {
      navigator.pop();
      messenger.showSnackBar(
        SnackBar(
          content: Text('Top-up failed: $e'),
          backgroundColor: Colors.red,
        ),
      );
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
