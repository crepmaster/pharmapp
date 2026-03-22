import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../models/medicine_request.dart';
import '../models/medicine_request_offer.dart';

/// Service for medicine request domain (Sprint 2A).
/// Provides callable wrappers and Firestore streams for Sprint 2B UI.
class MedicineRequestService {
  static final FirebaseFirestore _db = FirebaseFirestore.instance;
  static final FirebaseFunctions _functions =
      FirebaseFunctions.instanceFor(region: 'europe-west1');

  // ---------------------------------------------------------------------------
  // CALLABLES
  // ---------------------------------------------------------------------------

  /// Create a medicine request.
  static Future<String> createRequest({
    required String medicineId,
    required Map<String, dynamic> medicineSnapshot,
    required int requestedQuantity,
    required String currencyCode,
    String notes = '',
  }) async {
    final callable = _functions.httpsCallable('createMedicineRequest');
    final result = await callable.call<Map<String, dynamic>>({
      'medicineId': medicineId,
      'medicineSnapshot': medicineSnapshot,
      'requestedQuantity': requestedQuantity,
      'requestMode': 'purchase',
      'currencyCode': currencyCode,
      'notes': notes,
    });
    return result.data['requestId'] as String;
  }

  /// Cancel an open request.
  static Future<void> cancelRequest(String requestId) async {
    final callable = _functions.httpsCallable('cancelMedicineRequest');
    await callable.call<Map<String, dynamic>>({'requestId': requestId});
  }

  /// Submit an offer on an open request.
  static Future<String> submitOffer({
    required String requestId,
    required String inventoryItemId,
    required int offeredQuantity,
    required double unitPrice,
    String notes = '',
  }) async {
    final callable = _functions.httpsCallable('submitMedicineRequestOffer');
    final result = await callable.call<Map<String, dynamic>>({
      'requestId': requestId,
      'inventoryItemId': inventoryItemId,
      'offeredQuantity': offeredQuantity,
      'unitPrice': unitPrice,
      'offerType': 'purchase',
      'notes': notes,
    });
    return result.data['offerId'] as String;
  }

  /// Withdraw a pending offer.
  static Future<void> withdrawOffer(String offerId) async {
    final callable = _functions.httpsCallable('withdrawMedicineRequestOffer');
    await callable.call<Map<String, dynamic>>({'offerId': offerId});
  }

  /// Accept an offer — bridges into canonical proposal + delivery.
  static Future<Map<String, dynamic>> acceptOffer({
    required String requestId,
    required String offerId,
  }) async {
    final callable = _functions.httpsCallable('acceptMedicineRequestOffer');
    final result = await callable.call<Map<String, dynamic>>({
      'requestId': requestId,
      'offerId': offerId,
    });
    return result.data;
  }

  // ---------------------------------------------------------------------------
  // STREAMS — for Sprint 2B UI
  // ---------------------------------------------------------------------------

  /// Open requests in the same city, ordered by createdAt desc.
  static Stream<List<MedicineRequest>> getOpenRequestsInCity({
    required String countryCode,
    required String cityCode,
  }) {
    return _db
        .collection('medicine_requests')
        .where('countryCode', isEqualTo: countryCode)
        .where('cityCode', isEqualTo: cityCode)
        .where('status', isEqualTo: 'open')
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snap) => snap.docs
            .map((doc) => MedicineRequest.fromFirestore(doc))
            .toList());
  }

  /// My requests (all statuses), ordered by createdAt desc.
  static Stream<List<MedicineRequest>> getMyRequests(String pharmacyId) {
    return _db
        .collection('medicine_requests')
        .where('requesterPharmacyId', isEqualTo: pharmacyId)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snap) => snap.docs
            .map((doc) => MedicineRequest.fromFirestore(doc))
            .toList());
  }

  /// Offers on a specific request, ordered by createdAt asc.
  static Stream<List<MedicineRequestOffer>> getOffersForRequest(
      String requestId) {
    return _db
        .collection('medicine_request_offers')
        .where('requestId', isEqualTo: requestId)
        .orderBy('createdAt')
        .snapshots()
        .map((snap) => snap.docs
            .map((doc) => MedicineRequestOffer.fromFirestore(doc))
            .toList());
  }

  /// My submitted offers (all statuses), ordered by createdAt desc.
  static Stream<List<MedicineRequestOffer>> getMyOffers(String pharmacyId) {
    return _db
        .collection('medicine_request_offers')
        .where('sellerPharmacyId', isEqualTo: pharmacyId)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snap) => snap.docs
            .map((doc) => MedicineRequestOffer.fromFirestore(doc))
            .toList());
  }
}
