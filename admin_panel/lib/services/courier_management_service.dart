import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

/// Admin-side service for managing couriers. Mirrors PharmacyManagementService.
class CourierManagementService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  static final FirebaseFunctions _functions =
      FirebaseFunctions.instanceFor(region: 'europe-west1');

  static const String _couriersCollection = 'couriers';

  /// Get real-time stream of all couriers (global — for super_admin).
  Stream<QuerySnapshot> getCouriersStream() {
    return _firestore
        .collection(_couriersCollection)
        .orderBy('createdAt', descending: true)
        .snapshots();
  }

  /// Get real-time stream of couriers scoped to [countryScopes].
  ///
  /// - `super_admin` has `countryScopes: []` → global (returns all).
  /// - `admin` should always have non-empty scopes. If empty (misconfigured),
  ///   this method returns an empty stream to prevent accidental global access.
  ///
  /// The [isSuperAdmin] flag disambiguates empty-global vs empty-misconfigured.
  Stream<QuerySnapshot> getScopedCouriersStream(
      List<String> countryScopes, {bool isSuperAdmin = false}) {
    if (countryScopes.isEmpty) {
      if (isSuperAdmin) return getCouriersStream();
      return const Stream.empty();
    }
    return _firestore
        .collection(_couriersCollection)
        .where('countryCode', whereIn: countryScopes)
        .orderBy('createdAt', descending: true)
        .snapshots();
  }

  /// Update courier status via backend callable.
  ///
  /// The callable validates admin permissions and country scope server-side.
  Future<void> updateCourierStatus(String courierId, bool isActive) async {
    final callable = _functions.httpsCallable('setCourierActive');
    await callable.call<Map<String, dynamic>>({
      'courierId': courierId,
      'isActive': isActive,
    });
  }
}
