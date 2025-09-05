import 'package:flutter/material.dart';
import '../models/subscription.dart';
import '../services/subscription_guard_service.dart';

/// 🔒 Subscription status display widget
/// Shows current subscription status, plan, and upgrade options
class SubscriptionStatusWidget extends StatefulWidget {
  final bool showUpgradeButton;
  final VoidCallback? onUpgradePressed;

  const SubscriptionStatusWidget({
    super.key,
    this.showUpgradeButton = true,
    this.onUpgradePressed,
  });

  @override
  State<SubscriptionStatusWidget> createState() => _SubscriptionStatusWidgetState();
}

class _SubscriptionStatusWidgetState extends State<SubscriptionStatusWidget> {
  SubscriptionStatus? _status;
  SubscriptionPlan? _plan;
  bool _hasActiveSubscription = false;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadSubscriptionStatus();
  }

  Future<void> _loadSubscriptionStatus() async {
    try {
      final status = await SubscriptionGuardService.getSubscriptionStatus();
      final plan = await SubscriptionGuardService.getSubscriptionPlan();
      final hasActive = await SubscriptionGuardService.hasActiveSubscription();

      if (mounted) {
        setState(() {
          _status = status;
          _plan = plan;
          _hasActiveSubscription = hasActive;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Row(
            children: [
              SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              SizedBox(width: 16),
              Text('Loading subscription status...'),
            ],
          ),
        ),
      );
    }

    return Card(
      elevation: 2,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          gradient: LinearGradient(
            colors: [
              _getStatusColor().withValues(alpha: 0.1),
              _getStatusColor().withValues(alpha: 0.05),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Status header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Icon(
                        _getStatusIcon(),
                        color: _getStatusColor(),
                        size: 24,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Subscription Status',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: _getStatusColor(),
                        ),
                      ),
                    ],
                  ),
                  if (widget.showUpgradeButton && !_hasActiveSubscription)
                    ElevatedButton.icon(
                      onPressed: widget.onUpgradePressed ?? _showUpgradeDialog,
                      icon: const Icon(Icons.arrow_upward, size: 16),
                      label: const Text('Upgrade'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.blue,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        textStyle: const TextStyle(fontSize: 12),
                      ),
                    ),
                ],
              ),
              
              const SizedBox(height: 12),
              
              // Status details
              _buildStatusRow('Status', _getStatusText()),
              const SizedBox(height: 8),
              _buildStatusRow('Plan', _getPlanText()),
              
              if (_hasActiveSubscription) ...[
                const SizedBox(height: 8),
                _buildStatusRow('Features', _getFeaturesSummary()),
              ],
              
              // Status message
              if (_status != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: _getStatusColor().withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: _getStatusColor().withValues(alpha: 0.3),
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.info_outline,
                        color: _getStatusColor(),
                        size: 16,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          SubscriptionGuardService.getSubscriptionStatusMessage(_status!),
                          style: TextStyle(
                            color: _getStatusColor(),
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatusRow(String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 80,
          child: Text(
            '$label:',
            style: const TextStyle(
              fontWeight: FontWeight.w500,
              color: Colors.grey,
              fontSize: 14,
            ),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }

  Color _getStatusColor() {
    if (_hasActiveSubscription) return Colors.green;
    
    switch (_status) {
      case SubscriptionStatus.trial:
        return Colors.teal; // NEW for African markets
      case SubscriptionStatus.pendingPayment:
        return Colors.orange;
      case SubscriptionStatus.pendingApproval:
        return Colors.blue;
      case SubscriptionStatus.active:
        return Colors.green;
      case SubscriptionStatus.expired:
        return Colors.red;
      case SubscriptionStatus.suspended:
        return Colors.red;
      case SubscriptionStatus.cancelled:
        return Colors.grey;
      case null:
        return Colors.orange;
    }
  }

  IconData _getStatusIcon() {
    if (_hasActiveSubscription) return Icons.verified;
    
    switch (_status) {
      case SubscriptionStatus.trial:
        return Icons.free_breakfast; // NEW for African markets
      case SubscriptionStatus.pendingPayment:
        return Icons.payment;
      case SubscriptionStatus.pendingApproval:
        return Icons.schedule;
      case SubscriptionStatus.active:
        return Icons.verified;
      case SubscriptionStatus.expired:
        return Icons.access_time;
      case SubscriptionStatus.suspended:
        return Icons.block;
      case SubscriptionStatus.cancelled:
        return Icons.cancel;
      case null:
        return Icons.warning;
    }
  }

  String _getStatusText() {
    if (_status == null) return 'Unknown';
    
    switch (_status!) {
      case SubscriptionStatus.trial:
        return 'Free Trial'; // NEW for African markets
      case SubscriptionStatus.pendingPayment:
        return 'Payment Required';
      case SubscriptionStatus.pendingApproval:
        return 'Pending Approval';
      case SubscriptionStatus.active:
        return 'Active';
      case SubscriptionStatus.expired:
        return 'Expired';
      case SubscriptionStatus.suspended:
        return 'Suspended';
      case SubscriptionStatus.cancelled:
        return 'Cancelled';
    }
  }

  String _getPlanText() {
    if (_plan == null) return 'Basic';
    
    // 🌍 African market pricing (XAF currency)
    switch (_plan!) {
      case SubscriptionPlan.basic:
        return 'Essential (6,000 XAF/month)';
      case SubscriptionPlan.professional:
        return 'Professionnel (15,000 XAF/month)';
      case SubscriptionPlan.enterprise:
        return 'Entreprise (30,000 XAF/month)';
    }
  }

  String _getFeaturesSummary() {
    if (_plan == null) return 'Limited access';
    
    switch (_plan!) {
      case SubscriptionPlan.basic:
        return '100 medicines, basic features';
      case SubscriptionPlan.professional:
        return 'Unlimited medicines, analytics';
      case SubscriptionPlan.enterprise:
        return 'Multi-location, API access';
    }
  }

  void _showUpgradeDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('🚀 Upgrade Your Subscription'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Choose the plan that fits your pharmacy needs:'),
            const SizedBox(height: 16),
            
            ...SubscriptionPlan.values.map((plan) => Card(
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: plan == _plan ? Colors.blue : Colors.grey,
                  child: Text('${_getXAFPrice(plan).toInt()}k', style: const TextStyle(fontSize: 10)),
                ),
                title: Text(_getPlanNameForDialog(plan)),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: SubscriptionGuardService.getPlanFeatures(plan)
                      .take(2)
                      .map((feature) => Text('• $feature', style: const TextStyle(fontSize: 12)))
                      .toList(),
                ),
                trailing: plan == _plan 
                    ? const Icon(Icons.check_circle, color: Colors.green)
                    : null,
              ),
            )),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(context).pop();
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Subscription payment coming soon!'),
                  backgroundColor: Colors.blue,
                ),
              );
            },
            child: const Text('Choose Plan'),
          ),
        ],
      ),
    );
  }

  String _getPlanName(SubscriptionPlan plan) {
    switch (plan) {
      case SubscriptionPlan.basic:
        return 'Basic';
      case SubscriptionPlan.professional:
        return 'Professional';
      case SubscriptionPlan.enterprise:
        return 'Enterprise';
    }
  }

  // 🌍 African market plan names (French localization)
  String _getPlanNameForDialog(SubscriptionPlan plan) {
    switch (plan) {
      case SubscriptionPlan.basic:
        return 'Essential (6,000 XAF/mois)';
      case SubscriptionPlan.professional:
        return 'Professionnel (15,000 XAF/mois)';
      case SubscriptionPlan.enterprise:
        return 'Entreprise (30,000 XAF/mois)';
    }
  }

  // Get XAF pricing for African markets
  double _getXAFPrice(SubscriptionPlan plan) {
    switch (plan) {
      case SubscriptionPlan.basic:
        return 6.0; // 6k XAF
      case SubscriptionPlan.professional:
        return 15.0; // 15k XAF
      case SubscriptionPlan.enterprise:
        return 30.0; // 30k XAF
    }
  }
}