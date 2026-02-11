import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/subscription.dart';

/// Service for managing pharmacy subscriptions
class SubscriptionService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Get current subscription for a pharmacy
  static Future<Subscription?> getCurrentSubscription(String pharmacyId) async {
    try {
      final snapshot = await _firestore
          .collection('subscriptions')
          .where('pharmacyId', isEqualTo: pharmacyId)
          .orderBy('createdAt', descending: true)
          .limit(1)
          .get();

      if (snapshot.docs.isEmpty) {
        return null;
      }

      return Subscription.fromFirestore(snapshot.docs.first);
    } catch (e) {
      debugPrint('Error fetching subscription: $e');
      return null;
    }
  }

  /// Stream current subscription for real-time updates
  static Stream<Subscription?> subscriptionStream(String pharmacyId) {
    return _firestore
        .collection('subscriptions')
        .where('pharmacyId', isEqualTo: pharmacyId)
        .orderBy('createdAt', descending: true)
        .limit(1)
        .snapshots()
        .map((snapshot) {
      if (snapshot.docs.isEmpty) return null;
      return Subscription.fromFirestore(snapshot.docs.first);
    });
  }

  /// Check if pharmacy has an active subscription (including trial)
  static Future<bool> hasActiveSubscription(String pharmacyId) async {
    final subscription = await getCurrentSubscription(pharmacyId);
    if (subscription == null) return false;

    return subscription.isActive || subscription.isInTrial;
  }
}
