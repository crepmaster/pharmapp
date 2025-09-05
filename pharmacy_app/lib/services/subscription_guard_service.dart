import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/pharmacy_user.dart';
import '../models/subscription.dart';

/// 🔒 CRITICAL SECURITY SERVICE
/// Enforces subscription-based access control throughout the app
class SubscriptionGuardService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  static final FirebaseAuth _auth = FirebaseAuth.instance;
  
  static const String _pharmaciesCollection = 'pharmacies';

  /// Check if current user has an active subscription
  static Future<bool> hasActiveSubscription() async {
    final userId = _auth.currentUser?.uid;
    if (userId == null) return false;

    try {
      final pharmacyDoc = await _firestore
          .collection(_pharmaciesCollection)
          .doc(userId)
          .get();

      if (!pharmacyDoc.exists) return false;

      final pharmacy = PharmacyUser.fromMap(pharmacyDoc.data()!, userId);
      return _isSubscriptionActive(pharmacy);
    } catch (e) {
      print('Error checking subscription: $e');
      return false;
    }
  }

  /// Get current user's subscription status
  static Future<SubscriptionStatus> getSubscriptionStatus() async {
    final userId = _auth.currentUser?.uid;
    if (userId == null) return SubscriptionStatus.pendingPayment;

    try {
      final pharmacyDoc = await _firestore
          .collection(_pharmaciesCollection)
          .doc(userId)
          .get();

      if (!pharmacyDoc.exists) return SubscriptionStatus.pendingPayment;

      final pharmacy = PharmacyUser.fromMap(pharmacyDoc.data()!, userId);
      return pharmacy.subscriptionStatus;
    } catch (e) {
      print('Error getting subscription status: $e');
      return SubscriptionStatus.pendingPayment;
    }
  }

  /// Get current user's subscription plan
  static Future<SubscriptionPlan> getSubscriptionPlan() async {
    final userId = _auth.currentUser?.uid;
    if (userId == null) return SubscriptionPlan.basic;

    try {
      final pharmacyDoc = await _firestore
          .collection(_pharmaciesCollection)
          .doc(userId)
          .get();

      if (!pharmacyDoc.exists) return SubscriptionPlan.basic;

      final pharmacy = PharmacyUser.fromMap(pharmacyDoc.data()!, userId);
      return pharmacy.subscriptionPlan;
    } catch (e) {
      print('Error getting subscription plan: $e');
      return SubscriptionPlan.basic;
    }
  }

  /// Check if user can create inventory items (plan-based limits)
  static Future<bool> canCreateInventoryItem() async {
    if (!(await hasActiveSubscription())) return false;

    final plan = await getSubscriptionPlan();
    
    // Basic plan: 100 item limit
    if (plan == SubscriptionPlan.basic) {
      final currentCount = await _getInventoryCount();
      return currentCount < 100;
    }
    
    // Professional and Enterprise: unlimited
    return true;
  }

  /// Check if user can create exchange proposals
  static Future<bool> canCreateProposal() async {
    return await hasActiveSubscription();
  }

  /// Check if user can access analytics features
  static Future<bool> canAccessAnalytics() async {
    if (!(await hasActiveSubscription())) return false;

    final plan = await getSubscriptionPlan();
    return plan == SubscriptionPlan.professional || plan == SubscriptionPlan.enterprise;
  }

  /// Check if user can manage multiple locations
  static Future<bool> canManageMultipleLocations() async {
    if (!(await hasActiveSubscription())) return false;

    final plan = await getSubscriptionPlan();
    return plan == SubscriptionPlan.enterprise;
  }

  /// Check if user can access API features
  static Future<bool> canAccessAPI() async {
    if (!(await hasActiveSubscription())) return false;

    final plan = await getSubscriptionPlan();
    return plan == SubscriptionPlan.enterprise;
  }

  /// Get inventory count for current user
  static Future<int> _getInventoryCount() async {
    final userId = _auth.currentUser?.uid;
    if (userId == null) return 0;

    try {
      final querySnapshot = await _firestore
          .collection('pharmacy_inventory')
          .where('pharmacyId', isEqualTo: userId)
          .get();

      return querySnapshot.docs.length;
    } catch (e) {
      print('Error getting inventory count: $e');
      return 999; // Return high number to block creation on error
    }
  }

  /// Check if subscription is active based on status and dates
  static bool _isSubscriptionActive(PharmacyUser pharmacy) {
    // Active subscription
    if (pharmacy.subscriptionStatus == SubscriptionStatus.active) {
      if (pharmacy.subscriptionEndDate != null) {
        return DateTime.now().isBefore(pharmacy.subscriptionEndDate!);
      }
      return pharmacy.hasActiveSubscription;
    }
    
    // Trial subscription (NEW for African markets)
    if (pharmacy.subscriptionStatus == SubscriptionStatus.trial) {
      if (pharmacy.subscriptionEndDate != null) {
        return DateTime.now().isBefore(pharmacy.subscriptionEndDate!);
      }
      return true; // Trial without end date defaults to active
    }

    return false;
  }

  /// Get user-friendly subscription status message
  static String getSubscriptionStatusMessage(SubscriptionStatus status) {
    switch (status) {
      case SubscriptionStatus.trial:
        return 'Free Trial Active - Enjoying full access';
      case SubscriptionStatus.pendingPayment:
        return 'Payment Required - Please complete your subscription payment';
      case SubscriptionStatus.pendingApproval:
        return 'Pending Approval - Your payment is being verified';
      case SubscriptionStatus.active:
        return 'Active Subscription - Full access enabled';
      case SubscriptionStatus.expired:
        return 'Subscription Expired - Please renew to continue';
      case SubscriptionStatus.suspended:
        return 'Account Suspended - Contact support for assistance';
      case SubscriptionStatus.cancelled:
        return 'Subscription Cancelled - Upgrade to access features';
    }
  }

  /// Get plan-specific feature list
  static List<String> getPlanFeatures(SubscriptionPlan plan) {
    switch (plan) {
      case SubscriptionPlan.basic:
        return [
          'Up to 100 medicine listings',
          'Create and receive exchange proposals',
          'Basic inventory management',
          'Mobile app access',
        ];
      case SubscriptionPlan.professional:
        return [
          'Unlimited medicine listings',
          'Advanced analytics dashboard',
          'Priority customer support',
          'Bulk inventory operations',
          'All Basic features included',
        ];
      case SubscriptionPlan.enterprise:
        return [
          'Multi-location management',
          'API access for integrations',
          'Custom reporting tools',
          'Dedicated account manager',
          'All Professional features included',
        ];
    }
  }

  /// Get plan pricing information
  static double getPlanPrice(SubscriptionPlan plan) {
    switch (plan) {
      case SubscriptionPlan.basic:
        return 10.0;
      case SubscriptionPlan.professional:
        return 25.0;
      case SubscriptionPlan.enterprise:
        return 50.0;
    }
  }

  /// Stream subscription status changes
  static Stream<SubscriptionStatus> subscriptionStatusStream() {
    final userId = _auth.currentUser?.uid;
    if (userId == null) {
      return Stream.value(SubscriptionStatus.pendingPayment);
    }

    return _firestore
        .collection(_pharmaciesCollection)
        .doc(userId)
        .snapshots()
        .map((doc) {
      if (!doc.exists) return SubscriptionStatus.pendingPayment;
      
      final pharmacy = PharmacyUser.fromMap(doc.data()!, userId);
      return pharmacy.subscriptionStatus;
    });
  }
}

/// Exception thrown when subscription access is denied
class SubscriptionAccessDeniedException implements Exception {
  final String message;
  final SubscriptionStatus currentStatus;
  final String requiredAction;

  const SubscriptionAccessDeniedException({
    required this.message,
    required this.currentStatus,
    required this.requiredAction,
  });

  @override
  String toString() => 'SubscriptionAccessDenied: $message';
}