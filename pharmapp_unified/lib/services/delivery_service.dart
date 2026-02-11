import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../models/delivery.dart';

class DeliveryService {
  static final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  static final FirebaseAuth _auth = FirebaseAuth.instance;
  static final FirebaseFunctions _functions = FirebaseFunctions.instance;

  /// Get all available deliveries (not yet assigned to any courier)
  static Stream<List<Delivery>> getAvailableDeliveries() {
    // Debug statement removed for production security
    
    return _firestore
        .collection('deliveries')
        .where('status', isEqualTo: 'pending')
        .snapshots()
        .map((snapshot) {
      final deliveries = snapshot.docs.map((doc) => Delivery.fromFirestore(doc)).toList();
      // Sort by creation time on client-side (newest first)
      deliveries.sort((a, b) => b.createdAt.compareTo(a.createdAt));
      // Debug statement removed for production security
      return deliveries;
    });
  }

  /// Get deliveries assigned to current courier
  static Stream<List<Delivery>> getCourierDeliveries() {
    final currentUser = _auth.currentUser;
    if (currentUser == null) {
      // No authenticated user for delivery service
      return Stream.value([]);
    }

    // Debug statement removed for production security
    
    return _firestore
        .collection('deliveries')
        .where('courierId', isEqualTo: currentUser.uid)
        .snapshots()
        .map((snapshot) {
      final deliveries = snapshot.docs.map((doc) => Delivery.fromFirestore(doc)).toList();
      // Sort by creation time on client-side (newest first)
      deliveries.sort((a, b) => b.createdAt.compareTo(a.createdAt));
      // Debug statement removed for production security
      return deliveries;
    });
  }

  /// Get active delivery for current courier (if any)
  static Stream<Delivery?> getActiveDelivery() {
    final currentUser = _auth.currentUser;
    if (currentUser == null) {
      return Stream.value(null);
    }

    return _firestore
        .collection('deliveries')
        .where('courierId', isEqualTo: currentUser.uid)
        .where('status', whereIn: ['accepted', 'enRoute', 'pickedUp'])
        .limit(1)
        .snapshots()
        .map((snapshot) {
      if (snapshot.docs.isEmpty) {
        return null;
      }
      final delivery = Delivery.fromFirestore(snapshot.docs.first);
      // Debug statement removed for production security
      return delivery;
    });
  }

  /// Accept a delivery
  static Future<void> acceptDelivery(String deliveryId) async {
    final currentUser = _auth.currentUser;
    if (currentUser == null) {
      throw 'No authenticated user';
    }

    try {
      // Debug statement removed for production security

      // Get delivery details to retrieve exchangeId
      final deliveryDoc = await _firestore.collection('deliveries').doc(deliveryId).get();
      final deliveryData = deliveryDoc.data();
      final exchangeId = deliveryData?['exchangeId'];

      if (exchangeId == null) {
        throw 'Delivery has no associated exchange';
      }

      // Call Firebase Function to create exchange hold (locks courier fee in escrow)
      try {
        final result = await _functions.httpsCallable('createExchangeHold').call({
          'exchangeId': exchangeId,
          'courierId': currentUser.uid,
        });

        if (result.data['success'] != true) {
          throw result.data['error'] ?? 'Failed to create exchange hold';
        }
      } catch (e) {
        throw 'Payment hold failed: $e';
      }

      // Update delivery status after successful hold
      await _firestore.collection('deliveries').doc(deliveryId).update({
        'courierId': currentUser.uid,
        'status': 'accepted',
        'acceptedAt': FieldValue.serverTimestamp(),
      });

      // Debug statement removed for production security
    } catch (e) {
      // Debug statement removed for production security
      throw 'Failed to accept delivery: $e';
    }
  }

  /// Update delivery status
  static Future<void> updateDeliveryStatus(
    String deliveryId,
    DeliveryStatus status, {
    String? notes,
    String? failureReason,
    List<String>? proofImages,
  }) async {
    try {
      // Debug statement removed for production security

      final updateData = <String, dynamic>{
        'status': status.toString().split('.').last,
      };

      // Add timestamp fields based on status
      switch (status) {
        case DeliveryStatus.enRoute:
          // No additional timestamp needed
          break;
        case DeliveryStatus.pickedUp:
          updateData['pickedUpAt'] = FieldValue.serverTimestamp();
          break;
        case DeliveryStatus.delivered:
          updateData['deliveredAt'] = FieldValue.serverTimestamp();

          // Call Firebase Function to capture payment (release courier fee from escrow)
          final deliveryDoc = await _firestore.collection('deliveries').doc(deliveryId).get();
          final deliveryData = deliveryDoc.data();
          final exchangeId = deliveryData?['exchangeId'];

          if (exchangeId != null) {
            try {
              final result = await _functions.httpsCallable('exchangeCapture').call({
                'exchangeId': exchangeId,
                'deliveryId': deliveryId,
                'proofImages': proofImages ?? [],
              });

              if (result.data['success'] != true) {
                // Log error but don't block status update
                // Payment capture can be retried manually if needed
              }
            } catch (e) {
              // Log error but don't block delivery completion
              // Debug statement removed for production security
            }
          }
          break;
        case DeliveryStatus.failed:
          updateData['failureReason'] = failureReason;

          // Call Firebase Function to cancel exchange (refund held amounts)
          final deliveryDoc = await _firestore.collection('deliveries').doc(deliveryId).get();
          final deliveryData = deliveryDoc.data();
          final exchangeId = deliveryData?['exchangeId'];

          if (exchangeId != null) {
            try {
              await _functions.httpsCallable('exchangeCancel').call({
                'exchangeId': exchangeId,
                'reason': failureReason ?? 'Delivery failed',
              });
            } catch (e) {
              // Log error but don't block status update
              // Debug statement removed for production security
            }
          }
          break;
        case DeliveryStatus.cancelled:
          // Call Firebase Function to cancel exchange (refund held amounts)
          final deliveryDoc = await _firestore.collection('deliveries').doc(deliveryId).get();
          final deliveryData = deliveryDoc.data();
          final exchangeId = deliveryData?['exchangeId'];

          if (exchangeId != null) {
            try {
              await _functions.httpsCallable('exchangeCancel').call({
                'exchangeId': exchangeId,
                'reason': notes ?? 'Delivery cancelled',
              });
            } catch (e) {
              // Log error but don't block status update
              // Debug statement removed for production security
            }
          }
          break;
        default:
          break;
      }

      if (notes != null) {
        updateData['notes'] = notes;
      }

      if (proofImages != null) {
        updateData['proofImages'] = proofImages;
      }

      await _firestore.collection('deliveries').doc(deliveryId).update(updateData);
      // Debug statement removed for production security
    } catch (e) {
      // Debug statement removed for production security
      throw 'Failed to update delivery status: $e';
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
      // Debug statement removed for production security
      
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
        (total, doc) => total + (doc.data()['deliveryFee']?.toDouble() ?? 0.0),
      );

      final successRate = totalDeliveries > 0 ? (completedDeliveries / totalDeliveries) * 100 : 0.0;

      // Get courier profile for rating
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
    } catch (e) {
      // Debug statement removed for production security
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
  static Future<void> updateCourierLocation(double latitude, double longitude) async {
    final currentUser = _auth.currentUser;
    if (currentUser == null) return;

    try {
      // Update courier's current location in their profile
      await _firestore.collection('couriers').doc(currentUser.uid).update({
        'currentLocation': {
          'latitude': latitude,
          'longitude': longitude,
          'updatedAt': FieldValue.serverTimestamp(),
        },
      });

      // Debug statement removed for production security
    } catch (e) {
      // Debug statement removed for production security
    }
  }

  /// Create a mock delivery for testing purposes
  static Future<void> createMockDelivery() async {
    try {
      // Debug statement removed for production security
      
      final mockDelivery = {
        'exchangeId': 'mock_exchange_${DateTime.now().millisecondsSinceEpoch}',
        'courierId': '', // Empty - available for pickup
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
            'expirationDate': DateTime.now().add(const Duration(days: 365)).toIso8601String(),
          },
          {
            'medicineId': 'med_002',
            'medicineName': 'Paracetamol 500mg',
            'quantity': 50,
            'unit': 'tablets',
            'pricePerUnit': 0.5,
            'expirationDate': DateTime.now().add(const Duration(days: 300)).toIso8601String(),
          },
        ],
        'status': 'pending',
        'deliveryFee': 15.0,
        'totalValue': 75.0,
        'createdAt': DateTime.now().toIso8601String(),
        'proofImages': [],
      };

      await _firestore.collection('deliveries').add(mockDelivery);
      // Debug statement removed for production security
    } catch (e) {
      // Debug statement removed for production security
      throw 'Failed to create mock delivery: $e';
    }
  }

  /// Report an issue with a delivery
  static Future<void> reportDeliveryIssue(
    String deliveryId,
    String issueType,
  ) async {
    final currentUser = _auth.currentUser;
    if (currentUser == null) {
      throw 'No authenticated user';
    }

    try {
      // Create an issue report in Firestore
      await _firestore.collection('delivery_issues').add({
        'deliveryId': deliveryId,
        'courierId': currentUser.uid,
        'issueType': issueType,
        'reportedAt': FieldValue.serverTimestamp(),
        'status': 'open',
      });

      // Also update the delivery document with issue flag
      await _firestore.collection('deliveries').doc(deliveryId).update({
        'hasIssue': true,
        'lastIssueReportedAt': FieldValue.serverTimestamp(),
      });
    } catch (e) {
      throw 'Failed to report issue: $e';
    }
  }
}