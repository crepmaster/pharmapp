import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:pharmapp_shared/pharmapp_shared.dart';
import '../../models/subscription.dart';
import '../../services/subscription_service.dart';

/// Subscription management screen showing plans and payment options
class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  Subscription? _currentSubscription;
  bool _isLoading = true;
  SubscriptionPlan _selectedPlan = SubscriptionPlan.basic;
  String _currencySymbol = 'FCFA'; // Default to XAF

  /// Maps ISO 3166-1 alpha-2 country codes to currency display symbols.
  /// Used when the pharmacy document has the canonical `countryCode` field
  /// (Sprint 2A+), avoiding an async MasterDataService call in this screen.
  static const _isoToCurrencySymbol = {
    'CM': 'FCFA',
    'KE': 'KSh',
    'TZ': 'TSh',
    'UG': 'USh',
    'NG': '₦',
  };

  @override
  void initState() {
    super.initState();
    _loadSubscription();
  }

  Future<void> _loadSubscription() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    // Load pharmacy profile to get country
    final pharmacyDoc = await FirebaseFirestore.instance
        .collection('pharmacies')
        .doc(user.uid)
        .get();

    if (pharmacyDoc.exists) {
      final data = pharmacyDoc.data();
      if (data != null) {
        // Prefer the canonical countryCode field (written by Sprint 2A+ flow).
        // Fall back to the legacy country enum-name string for older profiles.
        final isoCode = data['countryCode'] as String?;
        if (isoCode != null && isoCode.isNotEmpty) {
          _currencySymbol = _isoToCurrencySymbol[isoCode] ?? 'FCFA';
        } else if (data.containsKey('country')) {
          final countryStr = data['country'] as String;
          final country = Country.values.firstWhere(
            (c) => c.toString().split('.').last == countryStr,
            orElse: () => Country.cameroon,
          );
          final countryConfig = Countries.getByCountry(country);
          if (countryConfig != null) {
            _currencySymbol = countryConfig.currencySymbol;
          }
        }
      }
    }

    final subscription = await SubscriptionService.getCurrentSubscription(user.uid);
    setState(() {
      _currentSubscription = subscription;
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Subscription'),
        elevation: 0,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildCurrentStatusCard(),
                  const SizedBox(height: 24),
                  Text(
                    'Choose Your Plan',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                  const SizedBox(height: 16),
                  _buildPlanCard(SubscriptionPlan.basic),
                  _buildPlanCard(SubscriptionPlan.professional),
                  _buildPlanCard(SubscriptionPlan.enterprise),
                  const SizedBox(height: 24),
                  if (_currentSubscription == null ||
                      _currentSubscription!.isInTrial ||
                      _currentSubscription!.isExpired)
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _handleUpgrade,
                        style: ElevatedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          backgroundColor: Colors.blue,
                        ),
                        child: Text(
                          _currentSubscription?.isInTrial == true
                              ? 'Upgrade from Trial'
                              : 'Subscribe Now',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
    );
  }

  Widget _buildCurrentStatusCard() {
    if (_currentSubscription == null) {
      return Card(
        color: Colors.red.shade50,
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.warning, color: Colors.red),
                  const SizedBox(width: 8),
                  Text(
                    'No Active Subscription',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.red.shade900,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              const Text('Subscribe to access all features of PharmApp'),
            ],
          ),
        ),
      );
    }

    if (_currentSubscription!.isInTrial) {
      return Card(
        color: Colors.blue.shade50,
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.stars, color: Colors.blue),
                  const SizedBox(width: 8),
                  Text(
                    'Free Trial Active',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.blue.shade900,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                '${_currentSubscription!.trialDaysRemaining} days remaining in your trial',
                style: const TextStyle(fontSize: 16),
              ),
              const SizedBox(height: 4),
              Text(
                'Trial ends: ${_formatDate(_currentSubscription!.trialEndDate!)}',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
              ),
            ],
          ),
        ),
      );
    }

    if (_currentSubscription!.isActive) {
      return Card(
        color: Colors.green.shade50,
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.check_circle, color: Colors.green),
                  const SizedBox(width: 8),
                  Text(
                    '${_currentSubscription!.planDisplayName} Plan Active',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.green.shade900,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                '${_currentSubscription!.daysRemaining} days remaining',
                style: const TextStyle(fontSize: 16),
              ),
              const SizedBox(height: 4),
              Text(
                'Renews: ${_formatDate(_currentSubscription!.endDate)}',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
              ),
            ],
          ),
        ),
      );
    }

    return Card(
      color: Colors.orange.shade50,
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.error_outline, color: Colors.orange),
                const SizedBox(width: 8),
                Text(
                  'Subscription Expired',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.orange.shade900,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Text('Renew your subscription to continue using PharmApp'),
          ],
        ),
      ),
    );
  }

  Widget _buildPlanCard(SubscriptionPlan plan) {
    final isSelected = _selectedPlan == plan;
    final price = Subscription.getPlanPrice(plan);
    final features = Subscription.getPlanFeatures(plan);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: isSelected ? 4 : 1,
      color: isSelected ? Colors.blue.shade50 : null,
      child: InkWell(
        onTap: () {
          setState(() {
            _selectedPlan = plan;
          });
        },
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Radio<SubscriptionPlan>(
                    value: plan,
                    groupValue: _selectedPlan,
                    onChanged: (value) {
                      if (value != null) {
                        setState(() {
                          _selectedPlan = value;
                        });
                      }
                    },
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _getPlanDisplayName(plan),
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          '$_currencySymbol ${price.toStringAsFixed(0)}/month',
                          style: const TextStyle(
                            fontSize: 16,
                            color: Colors.blue,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (_currentSubscription?.plan == plan)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.green,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Text(
                        'Current',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              ..._buildFeatureList(features),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _buildFeatureList(Map<String, dynamic> features) {
    return [
      _buildFeature(
        'Medicines',
        features['maxMedicines'] == -1
            ? 'Unlimited'
            : '${features['maxMedicines']} medicines',
      ),
      _buildFeature(
        'Analytics',
        features['analytics'] == true ? 'Yes' : 'No',
      ),
      _buildFeature(
        'Multi-location',
        features['multiLocation'] == true ? 'Yes' : 'No',
      ),
      _buildFeature(
        'API Access',
        features['apiAccess'] == true ? 'Yes' : 'No',
      ),
      _buildFeature(
        'Support',
        features['prioritySupport'] == true ? 'Priority' : 'Standard',
      ),
    ];
  }

  Widget _buildFeature(String title, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          const Icon(Icons.check_circle, size: 16, color: Colors.green),
          const SizedBox(width: 8),
          Text('$title: '),
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }

  String _getPlanDisplayName(SubscriptionPlan plan) {
    switch (plan) {
      case SubscriptionPlan.basic:
        return 'Basic Plan';
      case SubscriptionPlan.professional:
        return 'Professional Plan';
      case SubscriptionPlan.enterprise:
        return 'Enterprise Plan';
    }
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }

  Future<void> _handleUpgrade() async {
    // Show sandbox payment dialog for testing
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sandbox Payment'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Selected Plan: ${_getPlanDisplayName(_selectedPlan)}'),
            const SizedBox(height: 8),
            Text('Amount: \$${Subscription.getPlanPrice(_selectedPlan).toStringAsFixed(2)}/month'),
            const SizedBox(height: 16),
            const Text(
              'This is a sandbox environment. Payment will be simulated.',
              style: TextStyle(
                color: Colors.orange,
                fontSize: 12,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              _simulatePayment();
            },
            child: const Text('Pay Now (Sandbox)'),
          ),
        ],
      ),
    );
  }

  /// Calls the backend [sandboxSubscriptionSuccess] callable function.
  ///
  /// SANDBOX ONLY — replaces the old direct Firestore write.
  /// The backend atomically:
  ///   - Credits platform_treasuries/{country}_{currency}
  ///   - Writes a ledger entry (platform_subscription_revenue)
  ///   - Activates the subscription on pharmacies/{uid} (flat fields)
  ///   - Writes an audit record to subscription_payments/
  Future<void> _simulatePayment() async {
    // Show loading dialog.
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(
        child: Card(
          child: Padding(
            padding: EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text('Processing payment...'),
              ],
            ),
          ),
        ),
      ),
    );

    try {
      // 🔒 SANDBOX: call backend callable — no direct Firestore write from client.
      final callable = FirebaseFunctions.instanceFor(region: 'europe-west1')
          .httpsCallable('sandboxSubscriptionSuccess');

      await callable.call<Map<String, dynamic>>({
        'planName': _selectedPlan.toString().split('.').last,
      });

      if (!mounted) return;
      Navigator.pop(context); // Close loading dialog.

      // Show success.
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Row(
            children: [
              Icon(Icons.check_circle, color: Colors.green),
              SizedBox(width: 8),
              Text('Success!'),
            ],
          ),
          content: Text(
            '[SANDBOX] ${_getPlanDisplayName(_selectedPlan)} subscription activated for 30 days.',
          ),
          actions: [
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
                _loadSubscription(); // Reload from pharmacies/{uid} flat fields.
              },
              child: const Text('OK'),
            ),
          ],
        ),
      );
    } catch (e) {
      if (!mounted) return;
      Navigator.pop(context); // Close loading dialog.
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Payment failed: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }
}
