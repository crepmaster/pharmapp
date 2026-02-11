import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../models/subscription.dart';
import '../../services/subscription_service.dart';
import '../../screens/pharmacy/subscription_screen.dart';

/// Widget to display subscription status on pharmacy dashboard
class SubscriptionStatusWidget extends StatelessWidget {
  const SubscriptionStatusWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return const SizedBox.shrink();

    return StreamBuilder<Subscription?>(
      stream: SubscriptionService.subscriptionStream(user.uid),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Card(
            margin: EdgeInsets.all(16),
            child: Padding(
              padding: EdgeInsets.all(16.0),
              child: Row(
                children: [
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  SizedBox(width: 12),
                  Text('Loading subscription...'),
                ],
              ),
            ),
          );
        }

        final subscription = snapshot.data;

        // No subscription found
        if (subscription == null) {
          return Card(
            margin: const EdgeInsets.all(16),
            color: Colors.red.shade50,
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                children: [
                  const Icon(Icons.warning, color: Colors.red),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'No Subscription',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.red.shade900,
                          ),
                        ),
                        const Text(
                          'Subscribe to access all features',
                          style: TextStyle(fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  ElevatedButton(
                    onPressed: () => _navigateToSubscriptionScreen(context),
                    child: const Text('Subscribe'),
                  ),
                ],
              ),
            ),
          );
        }

        // Trial subscription
        if (subscription.isInTrial) {
          return Card(
            margin: const EdgeInsets.all(16),
            color: Colors.blue.shade50,
            child: InkWell(
              onTap: () => _navigateToSubscriptionScreen(context),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Row(
                  children: [
                    const Icon(Icons.stars, color: Colors.blue),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Free Trial Active',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.blue.shade900,
                            ),
                          ),
                          Text(
                            '${subscription.trialDaysRemaining} days remaining',
                            style: const TextStyle(fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right, color: Colors.blue),
                  ],
                ),
              ),
            ),
          );
        }

        // Active paid subscription
        if (subscription.isActive) {
          return Card(
            margin: const EdgeInsets.all(16),
            color: Colors.green.shade50,
            child: InkWell(
              onTap: () => _navigateToSubscriptionScreen(context),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Row(
                  children: [
                    const Icon(Icons.check_circle, color: Colors.green),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${subscription.planDisplayName} Plan Active',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.green.shade900,
                            ),
                          ),
                          Text(
                            '${subscription.daysRemaining} days remaining',
                            style: const TextStyle(fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right, color: Colors.green),
                  ],
                ),
              ),
            ),
          );
        }

        // Expired or needs payment
        return Card(
          margin: const EdgeInsets.all(16),
          color: Colors.orange.shade50,
          child: InkWell(
            onTap: () => _navigateToSubscriptionScreen(context),
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                children: [
                  const Icon(Icons.error_outline, color: Colors.orange),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          subscription.isExpired ? 'Subscription Expired' : 'Payment Required',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.orange.shade900,
                          ),
                        ),
                        const Text(
                          'Tap to renew your subscription',
                          style: TextStyle(fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  ElevatedButton(
                    onPressed: () => _navigateToSubscriptionScreen(context),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.orange,
                    ),
                    child: const Text('Renew'),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  void _navigateToSubscriptionScreen(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => const SubscriptionScreen(),
      ),
    );
  }
}
