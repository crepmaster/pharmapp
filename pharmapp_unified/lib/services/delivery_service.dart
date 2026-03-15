import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../models/delivery.dart';

class DeliveryService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  static final FirebaseAuth _auth = FirebaseAuth.instance;
  static final FirebaseFunctions _functions =
      FirebaseFunctions.instanceFor(region: 'europe-west1');

  /// Get all available deliveries filtered by courier's operating city
  static Stream<List<Delivery>> getAvailableDeliveries() {
    final currentUser = _auth.currentUser;
    if (currentUser == null) return Stream.value([]);

    // Read courier's operating city from couriers/ collection (set at registration)
    return _firestore
        .collection('couriers')
        .doc(currentUser.uid)
        .snapshots()
        .asyncExpand((courierDoc) {
      final city = courierDoc.data()?['operatingCity'] as String?
          ?? courierDoc.data()?['city'] as String?
          ?? '';
      if (city.isEmpty) {
        return Stream.value(<Delivery>[]);
      }
      return _firestore
          .collection('deliveries')
          .where('status', isEqualTo: 'pending')
          .where('city', isEqualTo: city)
          .snapshots()
          .map((snapshot) {
        final deliveries =
            snapshot.docs.map((doc) => Delivery.fromFirestore(doc)).toList();
        deliveries.sort((a, b) => b.createdAt.compareTo(a.createdAt));
        return deliveries;
      });
    });
  }

  /// Get deliveries assigned to current courier
  static Stream<List<Delivery>> getCourierDeliveries() {
    final currentUser = _auth.currentUser;
    if (currentUser == null) return Stream.value([]);

    return _firestore
        .collection('deliveries')
        .where('courierId', isEqualTo: currentUser.uid)
        .snapshots()
        .map((snapshot) {
      final deliveries =
          snapshot.docs.map((doc) => Delivery.fromFirestore(doc)).toList();
      deliveries.sort((a, b) => b.createdAt.compareTo(a.createdAt));
      return deliveries;
    });
  }

  /// Get active delivery for current courier (if any)
  static Stream<Delivery?> getActiveDelivery() {
    final currentUser = _auth.currentUser;
    if (currentUser == null) return Stream.value(null);

    // Query using backend-compatible status values
    return _firestore
        .collection('deliveries')
        .where('courierId', isEqualTo: currentUser.uid)
        .where('status', whereIn: ['accepted', 'in_transit', 'picked_up'])
        .limit(1)
        .snapshots()
        .map((snapshot) {
      if (snapshot.docs.isEmpty) return null;
      return Delivery.fromFirestore(snapshot.docs.first);
    });
  }

  /// Accept a delivery.
  /// Updates the delivery document to assign the current courier.
  /// Exchange hold is managed by the proposal system, not the courier.
  static Future<void> acceptDelivery(String deliveryId) async {
    final currentUser = _auth.currentUser;
    if (currentUser == null) throw 'No authenticated user';

    try {
      await _firestore.collection('deliveries').doc(deliveryId).update({
        'courierId': currentUser.uid,
        'courierName': currentUser.displayName,
        'status': 'accepted',
        'assignedAt': FieldValue.serverTimestamp(),
        'acceptedAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } catch (e) {
      throw 'Failed to accept delivery: $e';
    }
  }

  /// Update delivery status.
  /// Uses backend-compatible status strings and calls the correct Cloud
  /// Functions for financial operations.
  static Future<void> updateDeliveryStatus(
    String deliveryId,
    DeliveryStatus status, {
    String? notes,
    String? failureReason,
    List<String>? proofImages,
  }) async {
    try {
      final updateData = <String, dynamic>{
        'status': Delivery.statusToBackend(status),
        'updatedAt': FieldValue.serverTimestamp(),
      };

      switch (status) {
        case DeliveryStatus.enRoute:
          // No extra fields needed
          break;

        case DeliveryStatus.pickedUp:
          updateData['pickedUpAt'] = FieldValue.serverTimestamp();
          break;

        case DeliveryStatus.delivered:
          // Call completeExchangeDelivery first.
          // If this fails, do not mark delivery as delivered in Firestore.
          try {
            await _functions
                .httpsCallable('completeExchangeDelivery')
                .call({
              'deliveryId': deliveryId,
              'photoProofUrl': proofImages?.isNotEmpty == true
                  ? proofImages!.first
                  : null,
              'deliveryNotes': notes,
            });
          } catch (e) {
            throw 'Failed to finalize delivery payment: $e';
          }
          updateData['deliveredAt'] = FieldValue.serverTimestamp();
          break;

        case DeliveryStatus.failed:
          updateData['failureReason'] = failureReason;
          await _cancelProposalForDelivery(
            deliveryId,
            failureReason ?? 'Delivery failed',
          );
          break;

        case DeliveryStatus.cancelled:
          await _cancelProposalForDelivery(
            deliveryId,
            notes ?? 'Delivery cancelled',
          );
          break;

        default:
          break;
      }

      if (notes != null) updateData['notes'] = notes;
      if (proofImages != null) updateData['proofImages'] = proofImages;

      await _firestore
          .collection('deliveries')
          .doc(deliveryId)
          .update(updateData);
    } catch (e) {
      throw 'Failed to update delivery status: $e';
    }
  }

  /// Cancels the linked proposal when a delivery fails or is cancelled.
  static Future<void> _cancelProposalForDelivery(
    String deliveryId,
    String reason,
  ) async {
    try {
      final deliveryDoc =
          await _firestore.collection('deliveries').doc(deliveryId).get();
      final proposalId = deliveryDoc.data()?['proposalId'] as String?;

      if (proposalId != null && proposalId.isNotEmpty) {
        // Try the cancelExchangeProposal callable first (handles refunds)
        try {
          await _functions.httpsCallable('cancelExchangeProposal').call({
            'proposalId': proposalId,
            'reason': reason,
            'action': 'cancel',
          });
        } catch (_) {
          // Fallback: update proposal status directly in Firestore
          await _firestore
              .collection('exchange_proposals')
              .doc(proposalId)
              .update({
            'status': 'cancelled',
            'cancelledAt': FieldValue.serverTimestamp(),
            'cancelReason': reason,
          });
        }
      }
    } catch (_) {
      // Non-blocking – admin can reconcile manually
    }
  }

  /// Get delivery statistics for courier
  static Future<Map<String, dynamic>> getCourierStats() async {
    final currentUser = _auth.currentUser;
    if (currentUser == null) {
      return {
        'totalDeliveries': 0,
        'completedDeliveries': 0,
        'totalEarnings': 0.0,
        'averageRating': 0.0,
        'successRate': 0.0,
      };
    }

    try {
      final deliveries = await _firestore
          .collection('deliveries')
          .where('courierId', isEqualTo: currentUser.uid)
          .get();

      final totalDeliveries = deliveries.docs.length;
      final completedDeliveries = deliveries.docs
          .where((doc) => doc.data()['status'] == 'delivered')
          .length;
      final totalEarnings = deliveries.docs.fold<double>(
        0.0,
        (total, doc) =>
            total + (doc.data()['deliveryFee']?.toDouble() ?? 0.0),
      );

      final successRate = totalDeliveries > 0
          ? (completedDeliveries / totalDeliveries) * 100
          : 0.0;

      final courierDoc = await _firestore
          .collection('couriers')
          .doc(currentUser.uid)
          .get();
      final courierData = courierDoc.data() ?? {};
      final averageRating = courierData['rating']?.toDouble() ?? 0.0;

      return {
        'totalDeliveries': totalDeliveries,
        'completedDeliveries': completedDeliveries,
        'totalEarnings': totalEarnings,
        'averageRating': averageRating,
        'successRate': successRate,
      };
    } catch (_) {
      return {
        'totalDeliveries': 0,
        'completedDeliveries': 0,
        'totalEarnings': 0.0,
        'averageRating': 0.0,
        'successRate': 0.0,
      };
    }
  }

  /// Update courier location during active delivery
  static Future<void> updateCourierLocation(
      double latitude, double longitude) async {
    final currentUser = _auth.currentUser;
    if (currentUser == null) return;

    try {
      await _firestore.collection('couriers').doc(currentUser.uid).update({
        'currentLocation': {
          'latitude': latitude,
          'longitude': longitude,
          'updatedAt': FieldValue.serverTimestamp(),
        },
      });
    } catch (_) {
      // Non-critical – next update will succeed
    }
  }

  /// Create a mock delivery for testing purposes
  static Future<void> createMockDelivery() async {
    final mockDelivery = {
      'exchangeId':
          'mock_exchange_${DateTime.now().millisecondsSinceEpoch}',
      'courierId': '',
      'pickup': {
        'pharmacyId': 'mock_pharmacy_1',
        'pharmacyName': 'Central Pharmacy',
        'address': '123 Main Street, Downtown',
        'latitude': 37.7749,
        'longitude': -122.4194,
        'phoneNumber': '+1234567890',
        'contactPerson': 'Dr. Smith',
      },
      'delivery': {
        'pharmacyId': 'mock_pharmacy_2',
        'pharmacyName': 'HealthCare Plus',
        'address': '456 Oak Avenue, Midtown',
        'latitude': 37.7849,
        'longitude': -122.4094,
        'phoneNumber': '+1234567891',
        'contactPerson': 'Nurse Johnson',
      },
      'items': [
        {
          'medicineId': 'med_001',
          'medicineName': 'Amoxicillin 500mg',
          'quantity': 20,
          'unit': 'tablets',
          'pricePerUnit': 2.5,
          'expirationDate': DateTime.now()
              .add(const Duration(days: 365))
              .toIso8601String(),
        },
      ],
      'status': 'pending',
      'deliveryFee': 15.0,
      'totalValue': 75.0,
      'createdAt': DateTime.now().toIso8601String(),
      'proofImages': [],
    };

    await _firestore.collection('deliveries').add(mockDelivery);
  }

  /// Report an issue with a delivery
  static Future<void> reportDeliveryIssue(
    String deliveryId,
    String issueType,
  ) async {
    final currentUser = _auth.currentUser;
    if (currentUser == null) throw 'No authenticated user';

    await _firestore.collection('delivery_issues').add({
      'deliveryId': deliveryId,
      'courierId': currentUser.uid,
      'issueType': issueType,
      'reportedAt': FieldValue.serverTimestamp(),
      'status': 'open',
    });

    await _firestore.collection('deliveries').doc(deliveryId).update({
      'hasIssue': true,
      'lastIssueReportedAt': FieldValue.serverTimestamp(),
    });
  }
}
