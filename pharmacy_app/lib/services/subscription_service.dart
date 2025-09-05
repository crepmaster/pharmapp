import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../models/subscription.dart';

class SubscriptionService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  static final FirebaseAuth _auth = FirebaseAuth.instance;

  // Collections
  static const String _subscriptionsCollection = 'subscriptions';
  static const String _paymentsCollection = 'subscription_payments';
  static const String _pharmaciesCollection = 'pharmacies';

  /// Create a new subscription for pharmacy
  static Future<String> createSubscription({
    required String pharmacyId,
    required SubscriptionPlan plan,
    required double amount,
    required int durationMonths,
  }) async {
    final now = DateTime.now();
    final endDate = DateTime(now.year, now.month + durationMonths, now.day);

    final subscription = Subscription(
      id: '', // Will be set by Firestore
      pharmacyId: pharmacyId,
      plan: plan,
      status: SubscriptionStatus.pendingPayment,
      amount: amount,
      startDate: now,
      endDate: endDate,
      createdAt: now,
      features: Subscription.getPlanFeatures(plan),
    );

    try {
      final docRef = await _firestore
          .collection(_subscriptionsCollection)
          .add(subscription.toMap());
      
      return docRef.id;
    } catch (e) {
      throw Exception('Failed to create subscription: $e');
    }
  }

  /// Get current subscription for pharmacy
  static Future<Subscription?> getCurrentSubscription(String pharmacyId) async {
    try {
      final querySnapshot = await _firestore
          .collection(_subscriptionsCollection)
          .where('pharmacyId', isEqualTo: pharmacyId)
          .orderBy('createdAt', descending: true)
          .limit(1)
          .get();

      if (querySnapshot.docs.isNotEmpty) {
        return Subscription.fromFirestore(querySnapshot.docs.first);
      }
      return null;
    } catch (e) {
      throw Exception('Failed to get current subscription: $e');
    }
  }

  /// Get all subscriptions for pharmacy (history)
  static Future<List<Subscription>> getPharmacySubscriptions(String pharmacyId) async {
    try {
      final querySnapshot = await _firestore
          .collection(_subscriptionsCollection)
          .where('pharmacyId', isEqualTo: pharmacyId)
          .orderBy('createdAt', descending: true)
          .get();

      return querySnapshot.docs
          .map((doc) => Subscription.fromFirestore(doc))
          .toList();
    } catch (e) {
      throw Exception('Failed to get pharmacy subscriptions: $e');
    }
  }

  /// Update subscription status (admin operation)
  static Future<void> updateSubscriptionStatus(
    String subscriptionId,
    SubscriptionStatus newStatus, {
    String? adminUserId,
    String? adminNotes,
    DateTime? activatedAt,
    DateTime? suspendedAt,
  }) async {
    try {
      final updates = <String, dynamic>{
        'status': newStatus.toString().split('.').last,
      };

      if (adminUserId != null) updates['adminUserId'] = adminUserId;
      if (adminNotes != null) updates['adminNotes'] = adminNotes;
      if (activatedAt != null) updates['activatedAt'] = Timestamp.fromDate(activatedAt);
      if (suspendedAt != null) updates['suspendedAt'] = Timestamp.fromDate(suspendedAt);

      await _firestore
          .collection(_subscriptionsCollection)
          .doc(subscriptionId)
          .update(updates);

      // Also update pharmacy user subscription fields
      final subscription = await getSubscriptionById(subscriptionId);
      if (subscription != null) {
        await _updatePharmacySubscriptionFields(subscription);
      }
    } catch (e) {
      throw Exception('Failed to update subscription status: $e');
    }
  }

  /// Get subscription by ID
  static Future<Subscription?> getSubscriptionById(String subscriptionId) async {
    try {
      final doc = await _firestore
          .collection(_subscriptionsCollection)
          .doc(subscriptionId)
          .get();

      if (doc.exists) {
        return Subscription.fromFirestore(doc);
      }
      return null;
    } catch (e) {
      throw Exception('Failed to get subscription: $e');
    }
  }

  /// Create subscription payment record
  static Future<String> createSubscriptionPayment({
    required String pharmacyId,
    required String subscriptionId,
    required double amount,
    required String paymentMethod,
    String? transactionReference,
    String? notes,
  }) async {
    final payment = SubscriptionPayment(
      id: '', // Will be set by Firestore
      pharmacyId: pharmacyId,
      subscriptionId: subscriptionId,
      amount: amount,
      paymentMethod: paymentMethod,
      status: 'pending',
      transactionReference: transactionReference,
      createdAt: DateTime.now(),
      notes: notes,
    );

    try {
      final docRef = await _firestore
          .collection(_paymentsCollection)
          .add(payment.toMap());
      
      return docRef.id;
    } catch (e) {
      throw Exception('Failed to create subscription payment: $e');
    }
  }

  /// Verify payment and activate subscription (webhook/admin operation)
  static Future<void> verifyPaymentAndActivate({
    required String paymentId,
    required String adminUserId,
    String? transactionReference,
    String? notes,
  }) async {
    try {
      // Update payment status to completed and verified
      await _firestore.collection(_paymentsCollection).doc(paymentId).update({
        'status': 'completed',
        'adminVerified': true,
        'adminUserId': adminUserId,
        'verifiedAt': Timestamp.fromDate(DateTime.now()),
        'completedAt': Timestamp.fromDate(DateTime.now()),
        if (transactionReference != null) 'transactionReference': transactionReference,
        if (notes != null) 'notes': notes,
      });

      // Get payment details to find subscription
      final paymentDoc = await _firestore.collection(_paymentsCollection).doc(paymentId).get();
      if (!paymentDoc.exists) return;

      final paymentData = paymentDoc.data() as Map<String, dynamic>;
      final subscriptionId = paymentData['subscriptionId'] as String;

      // Update subscription status to pending approval
      await updateSubscriptionStatus(
        subscriptionId,
        SubscriptionStatus.pendingApproval,
        adminUserId: adminUserId,
        adminNotes: 'Payment verified - awaiting final approval',
      );
    } catch (e) {
      throw Exception('Failed to verify payment and update subscription: $e');
    }
  }

  /// Approve subscription (admin operation)
  static Future<void> approveSubscription({
    required String subscriptionId,
    required String adminUserId,
    String? adminNotes,
  }) async {
    await updateSubscriptionStatus(
      subscriptionId,
      SubscriptionStatus.active,
      adminUserId: adminUserId,
      adminNotes: adminNotes ?? 'Subscription approved and activated',
      activatedAt: DateTime.now(),
    );
  }

  /// Suspend subscription (admin operation)
  static Future<void> suspendSubscription({
    required String subscriptionId,
    required String adminUserId,
    required String reason,
  }) async {
    await updateSubscriptionStatus(
      subscriptionId,
      SubscriptionStatus.suspended,
      adminUserId: adminUserId,
      adminNotes: 'Suspended: $reason',
      suspendedAt: DateTime.now(),
    );
  }

  /// Check if pharmacy has active subscription
  static Future<bool> hasActiveSubscription(String pharmacyId) async {
    try {
      final subscription = await getCurrentSubscription(pharmacyId);
      return subscription?.isActive ?? false;
    } catch (e) {
      return false;
    }
  }

  /// Get subscription status for pharmacy
  static Future<SubscriptionStatus> getSubscriptionStatus(String pharmacyId) async {
    try {
      final subscription = await getCurrentSubscription(pharmacyId);
      return subscription?.status ?? SubscriptionStatus.pendingPayment;
    } catch (e) {
      return SubscriptionStatus.pendingPayment;
    }
  }

  /// Check feature access based on subscription
  static Future<bool> hasFeatureAccess(String pharmacyId, String featureName) async {
    try {
      final subscription = await getCurrentSubscription(pharmacyId);
      if (subscription == null || !subscription.isActive) {
        return false;
      }

      final features = subscription.features ?? Subscription.getPlanFeatures(subscription.plan);
      
      switch (featureName) {
        case 'unlimited_medicines':
          return features['maxMedicines'] == -1;
        case 'analytics':
          return features['analytics'] ?? false;
        case 'multi_location':
          return features['multiLocation'] ?? false;
        case 'api_access':
          return features['apiAccess'] ?? false;
        case 'priority_support':
          return features['prioritySupport'] ?? false;
        default:
          return false;
      }
    } catch (e) {
      return false;
    }
  }

  /// Get medicine limit for pharmacy based on subscription
  static Future<int> getMedicineLimit(String pharmacyId) async {
    try {
      final subscription = await getCurrentSubscription(pharmacyId);
      if (subscription == null || !subscription.isActive) {
        return 0; // No access without active subscription
      }

      final features = subscription.features ?? Subscription.getPlanFeatures(subscription.plan);
      final limit = features['maxMedicines'] as int;
      return limit == -1 ? 999999 : limit; // -1 means unlimited
    } catch (e) {
      return 0;
    }
  }

  /// Stream subscription changes for real-time updates
  static Stream<Subscription?> subscriptionStream(String pharmacyId) {
    return _firestore
        .collection(_subscriptionsCollection)
        .where('pharmacyId', isEqualTo: pharmacyId)
        .orderBy('createdAt', descending: true)
        .limit(1)
        .snapshots()
        .map((snapshot) {
      if (snapshot.docs.isNotEmpty) {
        return Subscription.fromFirestore(snapshot.docs.first);
      }
      return null;
    });
  }

  /// Update pharmacy user subscription fields when subscription changes
  static Future<void> _updatePharmacySubscriptionFields(Subscription subscription) async {
    try {
      await _firestore.collection(_pharmaciesCollection).doc(subscription.pharmacyId).update({
        'subscriptionStatus': subscription.status.toString().split('.').last,
        'subscriptionPlan': subscription.plan.toString().split('.').last,
        'subscriptionEndDate': subscription.endDate,
        'hasActiveSubscription': subscription.isActive,
      });
    } catch (e) {
      // Debug statement removed for production security
    }
  }

  /// Get all pending subscriptions for admin
  static Future<List<Subscription>> getPendingSubscriptions() async {
    try {
      final querySnapshot = await _firestore
          .collection(_subscriptionsCollection)
          .where('status', isEqualTo: 'pendingApproval')
          .orderBy('createdAt', descending: true)
          .get();

      return querySnapshot.docs
          .map((doc) => Subscription.fromFirestore(doc))
          .toList();
    } catch (e) {
      throw Exception('Failed to get pending subscriptions: $e');
    }
  }

  /// Get all active subscriptions for admin
  static Future<List<Subscription>> getActiveSubscriptions() async {
    try {
      final querySnapshot = await _firestore
          .collection(_subscriptionsCollection)
          .where('status', isEqualTo: 'active')
          .orderBy('createdAt', descending: true)
          .get();

      return querySnapshot.docs
          .map((doc) => Subscription.fromFirestore(doc))
          .toList();
    } catch (e) {
      throw Exception('Failed to get active subscriptions: $e');
    }
  }

  /// Get subscription statistics for admin dashboard
  static Future<Map<String, dynamic>> getSubscriptionStatistics() async {
    try {
      final allSubscriptions = await _firestore
          .collection(_subscriptionsCollection)
          .get();

      int totalSubscriptions = allSubscriptions.docs.length;
      int activeCount = 0;
      int pendingCount = 0;
      int expiredCount = 0;
      int suspendedCount = 0;
      double totalRevenue = 0.0;

      for (final doc in allSubscriptions.docs) {
        final subscription = Subscription.fromFirestore(doc);
        totalRevenue += subscription.amount;

        switch (subscription.status) {
          case SubscriptionStatus.active:
            activeCount++;
            break;
          case SubscriptionStatus.pendingPayment:
          case SubscriptionStatus.pendingApproval:
            pendingCount++;
            break;
          case SubscriptionStatus.expired:
            expiredCount++;
            break;
          case SubscriptionStatus.suspended:
            suspendedCount++;
            break;
          default:
            break;
        }
      }

      return {
        'totalSubscriptions': totalSubscriptions,
        'activeSubscriptions': activeCount,
        'pendingSubscriptions': pendingCount,
        'expiredSubscriptions': expiredCount,
        'suspendedSubscriptions': suspendedCount,
        'totalRevenue': totalRevenue,
        'averageRevenue': totalSubscriptions > 0 ? totalRevenue / totalSubscriptions : 0.0,
      };
    } catch (e) {
      throw Exception('Failed to get subscription statistics: $e');
    }
  }
}