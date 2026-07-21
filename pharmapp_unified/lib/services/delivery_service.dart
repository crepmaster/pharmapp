import 'dart:async' show unawaited;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:pharmapp_shared/pharmapp_shared.dart';
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

    return _firestore
        .collection('couriers')
        .doc(currentUser.uid)
        .snapshots()
        .asyncExpand((courierDoc) {
      final courierData = courierDoc.data() ?? {};

      // Prefer canonical cityCode (written by Sprint 2A+ registration).
      // If absent, compute slug from legacy operatingCity/city and write it back
      // lazily — this is the Sprint 2D backfill for pre-migration courier docs.
      String? resolvedCityCode = courierData['cityCode'] as String?;
      final String? legacyCity = courierData['operatingCity'] as String?
          ?? courierData['city'] as String?;

      if (resolvedCityCode == null &&
          legacyCity != null &&
          legacyCity.isNotEmpty) {
        resolvedCityCode = MasterDataService.citySlug(legacyCity);
        unawaited(_firestore
            .collection('couriers')
            .doc(currentUser.uid)
            .update({'cityCode': resolvedCityCode}));
      }

      // The delivery documents still carry the legacy 'city' field (set by the
      // backend exchangeCapture function). Querying on 'city' using the legacy
      // display name ensures no delivery is missed until the backend also writes
      // 'cityCode' on delivery documents (tracked as a backend alignment task).
      final city = legacyCity ?? '';
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
          // `completeExchangeDelivery` is the SINGLE authority for this
          // transition. It settles the wallets, writes the ledger, moves the
          // inventory and sets `status`/`deliveredAt`/`completedAt`/
          // `photoProofUrl`/`deliveryNotes` on the delivery — all in one
          // transaction.
          //
          // We deliberately return here instead of falling through to the
          // shared `.update()` below. The previous code called the callable
          // and THEN wrote `status: delivered` again from the client: when
          // that second write failed, the UI reported "Failed to update
          // delivery status" for a trade whose money had already moved, and
          // no retry could ever fix it (the callable then refused a delivery
          // already `delivered`). Both halves of that trap are now gone —
          // this write no longer happens, and a replay of the callable
          // returns an idempotent success.
          //
          // The full `proofImages` array travels through the callable rather
          // than a client write, so multi-image proof is preserved without
          // reintroducing the second write. `photoProofUrl` stays as the
          // first image for legacy readers. `notes` becomes `deliveryNotes`
          // (the canonical field) — readers still bound to `notes` for a
          // delivered delivery need migrating separately.
          try {
            await _functions
                .httpsCallable('completeExchangeDelivery')
                .call({
              'deliveryId': deliveryId,
              'photoProofUrl': proofImages?.isNotEmpty == true
                  ? proofImages!.first
                  : null,
              'proofImages': proofImages,
              'deliveryNotes': notes,
            });
          } catch (e) {
            throw 'Failed to finalize delivery payment: $e';
          }
          // The StreamBuilder on the delivery document picks up the
          // backend's write; nothing left to do client-side.
          return;

        // Failure and cancellation are financial transitions: they must give
        // the buyer's money back (purchase) or release the reserved stock
        // (exchange). `terminateExchangeDelivery` is the single authority —
        // it compensates, cancels the proposal and writes the delivery status
        // in ONE transaction. We return instead of falling through to the
        // shared `.update()`, exactly as for `delivered`.
        case DeliveryStatus.failed:
          await _terminateDelivery(
            deliveryId,
            'failed',
            failureReason ?? notes ?? 'Delivery failed',
          );
          return;

        case DeliveryStatus.cancelled:
          await _terminateDelivery(
            deliveryId,
            'cancelled',
            notes ?? 'Delivery cancelled',
          );
          return;

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

  /// Terminates a delivery and restores every commitment it holds.
  ///
  /// Replaces `_cancelProposalForDelivery`, which was structurally unable to
  /// do its job: it called `cancelExchangeProposal` (which only ever accepted
  /// `pending` proposals, so after acceptance the call ALWAYS failed), then
  /// fell back to writing the proposal directly — a write the rules deny to a
  /// courier — and swallowed that failure in an outer `catch (_)`. The
  /// delivery ended up `failed` while the proposal stayed `accepted`, the
  /// money stayed in `deducted` and the stock stayed reserved, silently.
  ///
  /// There is deliberately NO fallback and NO swallowed error here: if the
  /// compensation cannot be applied, the caller must see it and the documents
  /// must stay untouched. A visible failure is recoverable; an invisible one
  /// is not.
  static Future<void> _terminateDelivery(
    String deliveryId,
    String outcome,
    String reason,
  ) async {
    try {
      await _functions.httpsCallable('terminateExchangeDelivery').call({
        'deliveryId': deliveryId,
        'outcome': outcome,
        'reason': reason,
      });
    } catch (e) {
      throw 'Failed to terminate delivery and restore funds: $e';
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
            total + (doc.data()['courierFee']?.toDouble() ?? doc.data()['deliveryFee']?.toDouble() ?? 0.0),
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

  /// Create a mock delivery for local dev/QA testing only.
  /// courierFee here is a fixed test stub — in the production flow the fee
  /// is written by the backend (exchangeCapture Firebase Function).
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
      'courierFee': 15.0,
      'totalPrice': 75.0,
      'currency': 'XAF',
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
