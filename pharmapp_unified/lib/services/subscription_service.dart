import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/subscription.dart';

/// Service for managing pharmacy subscriptions
///
/// Source of truth: `pharmacies/{uid}` flat fields (v1).
/// The `subscriptions/` collection is NOT read by any client code.
/// All subscription state is carried on the pharmacy document:
///   - hasActiveSubscription (bool)
///   - subscriptionStatus (string: trial | active | expired | ...)
///   - subscriptionPlan (string: basic | professional | enterprise)
///   - subscriptionEndDate (Timestamp)
class SubscriptionService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Get current subscription for a pharmacy.
  /// Reads from `pharmacies/{pharmacyId}`.
  static Future<Subscription?> getCurrentSubscription(String pharmacyId) async {
    try {
      final doc = await _firestore
          .collection('pharmacies')
          .doc(pharmacyId)
          .get();

      if (!doc.exists) return null;
      return _fromPharmacyDoc(pharmacyId, doc.data());
    } catch (e) {
      debugPrint('Error fetching subscription: $e');
      return null;
    }
  }

  /// Stream current subscription for real-time updates.
  /// Streams from `pharmacies/{pharmacyId}`.
  static Stream<Subscription?> subscriptionStream(String pharmacyId) {
    return _firestore
        .collection('pharmacies')
        .doc(pharmacyId)
        .snapshots()
        .map((doc) {
      if (!doc.exists) return null;
      return _fromPharmacyDoc(pharmacyId, doc.data());
    });
  }

  /// Check if pharmacy has an active subscription (including trial)
  static Future<bool> hasActiveSubscription(String pharmacyId) async {
    final subscription = await getCurrentSubscription(pharmacyId);
    if (subscription == null) return false;

    return subscription.isActive || subscription.isInTrial;
  }

  /// Build a Subscription from the flat fields on pharmacies/{uid}.
  /// Returns null if the pharmacy has no subscription fields.
  static Subscription? _fromPharmacyDoc(String pharmacyId, Map<String, dynamic>? data) {
    if (data == null) return null;
    if (data['hasActiveSubscription'] != true) return null;

    final statusStr = data['subscriptionStatus'] as String? ?? '';
    final planStr = data['subscriptionPlan'] as String? ?? 'basic';

    // Explicit rule: if subscriptionEndDate is absent, treat as expired
    final Timestamp? endTimestamp = data['subscriptionEndDate'] as Timestamp?;
    if (endTimestamp == null) {
      debugPrint('SubscriptionService: subscriptionEndDate absent for $pharmacyId — treating as expired');
      return null;
    }

    final endDate = endTimestamp.toDate();
    final now = DateTime.now();

    final SubscriptionStatus status;
    switch (statusStr) {
      case 'trial':
        status = SubscriptionStatus.trial;
        break;
      case 'active':
        status = SubscriptionStatus.active;
        break;
      case 'expired':
        status = SubscriptionStatus.expired;
        break;
      case 'suspended':
        status = SubscriptionStatus.suspended;
        break;
      case 'cancelled':
        status = SubscriptionStatus.cancelled;
        break;
      default:
        status = SubscriptionStatus.pendingPayment;
    }

    return Subscription(
      id: pharmacyId,
      pharmacyId: pharmacyId,
      plan: Subscription.parsePlanPublic(planStr),
      status: status,
      amount: 0, // Not stored on pharmacy doc — display-only default
      currency: 'XAF',
      startDate: now, // Not stored on pharmacy doc — not displayed in current UI
      endDate: endDate,
      trialEndDate: status == SubscriptionStatus.trial ? endDate : null,
      isYearly: false,
      createdAt: now,
    );
  }
}
