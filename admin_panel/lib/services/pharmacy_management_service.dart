import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/pharmacy_user.dart';
import '../models/subscription.dart';

class PharmacyManagementService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  
  static const String _pharmaciesCollection = 'pharmacies';
  static const String _subscriptionsCollection = 'subscriptions';

  /// Get real-time stream of all pharmacies
  Stream<QuerySnapshot> getPharmaciesStream() {
    return _firestore
        .collection(_pharmaciesCollection)
        .orderBy('createdAt', descending: true)
        .snapshots();
  }

  /// Get all pharmacies (one-time fetch)
  Future<List<PharmacyUser>> getAllPharmacies() async {
    try {
      final querySnapshot = await _firestore
          .collection(_pharmaciesCollection)
          .orderBy('createdAt', descending: true)
          .get();

      return querySnapshot.docs
          .map((doc) {
            final data = doc.data();
            return PharmacyUser.fromMap(data, doc.id);
          })
          .toList();
    } catch (e) {
      throw Exception('Failed to get pharmacies: $e');
    }
  }

  /// Get pharmacy by ID
  Future<PharmacyUser?> getPharmacyById(String pharmacyId) async {
    try {
      final doc = await _firestore
          .collection(_pharmaciesCollection)
          .doc(pharmacyId)
          .get();

      if (doc.exists) {
        final data = doc.data() as Map<String, dynamic>;
        return PharmacyUser.fromMap(data, doc.id);
      }
      return null;
    } catch (e) {
      throw Exception('Failed to get pharmacy: $e');
    }
  }

  /// Search pharmacies by name or email
  Future<List<PharmacyUser>> searchPharmacies(String query) async {
    try {
      final nameResults = await _firestore
          .collection(_pharmaciesCollection)
          .where('pharmacyName', isGreaterThanOrEqualTo: query)
          .where('pharmacyName', isLessThanOrEqualTo: '$query\uf8ff')
          .get();

      final emailResults = await _firestore
          .collection(_pharmaciesCollection)
          .where('email', isGreaterThanOrEqualTo: query)
          .where('email', isLessThanOrEqualTo: '$query\uf8ff')
          .get();

      final Set<String> seenIds = {};
      final List<PharmacyUser> results = [];

      // Add name search results
      for (final doc in nameResults.docs) {
        if (!seenIds.contains(doc.id)) {
          final data = doc.data();
          results.add(PharmacyUser.fromMap(data, doc.id));
          seenIds.add(doc.id);
        }
      }

      // Add email search results (avoiding duplicates)
      for (final doc in emailResults.docs) {
        if (!seenIds.contains(doc.id)) {
          final data = doc.data();
          results.add(PharmacyUser.fromMap(data, doc.id));
          seenIds.add(doc.id);
        }
      }

      return results;
    } catch (e) {
      throw Exception('Failed to search pharmacies: $e');
    }
  }

  /// Update pharmacy basic information
  Future<void> updatePharmacy({
    required String pharmacyId,
    String? pharmacyName,
    String? address,
    String? phoneNumber,
  }) async {
    try {
      final updates = <String, dynamic>{};
      
      if (pharmacyName != null) updates['pharmacyName'] = pharmacyName;
      if (address != null) updates['address'] = address;
      if (phoneNumber != null) updates['phoneNumber'] = phoneNumber;

      if (updates.isNotEmpty) {
        await _firestore
            .collection(_pharmaciesCollection)
            .doc(pharmacyId)
            .update(updates);
      }
    } catch (e) {
      throw Exception('Failed to update pharmacy: $e');
    }
  }

  /// Update pharmacy status (active/inactive)
  Future<void> updatePharmacyStatus(String pharmacyId, bool isActive) async {
    try {
      await _firestore
          .collection(_pharmaciesCollection)
          .doc(pharmacyId)
          .update({
            'isActive': isActive,
            'updatedAt': Timestamp.now(),
          });
    } catch (e) {
      throw Exception('Failed to update pharmacy status: $e');
    }
  }

  /// Get pharmacy statistics
  Future<Map<String, int>> getPharmacyStatistics() async {
    try {
      // Get total pharmacies
      final totalSnapshot = await _firestore
          .collection(_pharmaciesCollection)
          .count()
          .get();

      // Get active pharmacies
      final activeSnapshot = await _firestore
          .collection(_pharmaciesCollection)
          .where('isActive', isEqualTo: true)
          .count()
          .get();

      // Get inactive pharmacies  
      final inactiveSnapshot = await _firestore
          .collection(_pharmaciesCollection)
          .where('isActive', isEqualTo: false)
          .count()
          .get();

      // Get pharmacies created this month
      final now = DateTime.now();
      final startOfMonth = DateTime(now.year, now.month, 1);
      final thisMonthSnapshot = await _firestore
          .collection(_pharmaciesCollection)
          .where('createdAt', isGreaterThanOrEqualTo: Timestamp.fromDate(startOfMonth))
          .count()
          .get();

      return {
        'total': totalSnapshot.count ?? 0,
        'active': activeSnapshot.count ?? 0,
        'inactive': inactiveSnapshot.count ?? 0,
        'thisMonth': thisMonthSnapshot.count ?? 0,
      };
    } catch (e) {
      throw Exception('Failed to get pharmacy statistics: $e');
    }
  }

  /// Get pharmacies by status
  Future<List<PharmacyUser>> getPharmaciesByStatus(bool isActive) async {
    try {
      final querySnapshot = await _firestore
          .collection(_pharmaciesCollection)
          .where('isActive', isEqualTo: isActive)
          .orderBy('createdAt', descending: true)
          .get();

      return querySnapshot.docs
          .map((doc) {
            final data = doc.data();
            return PharmacyUser.fromMap(data, doc.id);
          })
          .toList();
    } catch (e) {
      throw Exception('Failed to get pharmacies by status: $e');
    }
  }

  /// Get pharmacies created in date range
  Future<List<PharmacyUser>> getPharmaciesByDateRange({
    required DateTime startDate,
    required DateTime endDate,
  }) async {
    try {
      final querySnapshot = await _firestore
          .collection(_pharmaciesCollection)
          .where('createdAt', isGreaterThanOrEqualTo: Timestamp.fromDate(startDate))
          .where('createdAt', isLessThanOrEqualTo: Timestamp.fromDate(endDate))
          .orderBy('createdAt', descending: true)
          .get();

      return querySnapshot.docs
          .map((doc) {
            final data = doc.data();
            return PharmacyUser.fromMap(data, doc.id);
          })
          .toList();
    } catch (e) {
      throw Exception('Failed to get pharmacies by date range: $e');
    }
  }

  /// Delete pharmacy (admin operation - use with caution)
  Future<void> deletePharmacy(String pharmacyId) async {
    try {
      // Delete in a transaction to ensure data consistency
      await _firestore.runTransaction((transaction) async {
        // Delete pharmacy document
        transaction.delete(
          _firestore.collection(_pharmaciesCollection).doc(pharmacyId)
        );

        // Delete related subscriptions
        final subscriptionsQuery = await _firestore
            .collection(_subscriptionsCollection)
            .where('pharmacyId', isEqualTo: pharmacyId)
            .get();

        for (final doc in subscriptionsQuery.docs) {
          transaction.delete(doc.reference);
        }
      });
    } catch (e) {
      throw Exception('Failed to delete pharmacy: $e');
    }
  }

  /// Bulk update pharmacy status
  Future<void> bulkUpdatePharmacyStatus({
    required List<String> pharmacyIds,
    required bool isActive,
  }) async {
    try {
      final batch = _firestore.batch();
      
      for (final pharmacyId in pharmacyIds) {
        final docRef = _firestore
            .collection(_pharmaciesCollection)
            .doc(pharmacyId);
        
        batch.update(docRef, {
          'isActive': isActive,
          'updatedAt': Timestamp.now(),
        });
      }

      await batch.commit();
    } catch (e) {
      throw Exception('Failed to bulk update pharmacy status: $e');
    }
  }

  /// Get current subscription for a pharmacy
  Future<Subscription?> getPharmacySubscription(String pharmacyId) async {
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
      throw Exception('Failed to get pharmacy subscription: $e');
    }
  }

  /// Get pharmacy subscription history
  Future<List<Subscription>> getPharmacySubscriptionHistory(String pharmacyId) async {
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
      throw Exception('Failed to get pharmacy subscription history: $e');
    }
  }
}