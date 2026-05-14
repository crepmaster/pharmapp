import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../models/medicine_request.dart';
import '../models/medicine_request_offer.dart';

/// Service for medicine request domain.
/// Sprint 2A introduced the callable wrappers and Firestore streams.
/// Sprint 4 (F-BLOC2-P2) adds support for `exchange` mode:
///   - `createRequest` accepts `requestMode`.
///   - `submitOffer` accepts `offerType` + optional `exchangeItem`.
///   - `acceptOffer` accepts optional `exchangeInventoryItemId` (required
///     when the underlying offer is an exchange offer).
class MedicineRequestService {
  static final FirebaseFirestore _db = FirebaseFirestore.instance;
  static final FirebaseFunctions _functions =
      FirebaseFunctions.instanceFor(region: 'europe-west1');

  // ---------------------------------------------------------------------------
  // CALLABLES
  // ---------------------------------------------------------------------------

  /// Create a medicine request. `requestMode` is mandatory (Sprint 4).
  static Future<String> createRequest({
    required String medicineId,
    required Map<String, dynamic> medicineSnapshot,
    required int requestedQuantity,
    required RequestMode requestMode,
    required String currencyCode,
    String notes = '',
  }) async {
    final callable = _functions.httpsCallable('createMedicineRequest');
    final result = await callable.call<Map<String, dynamic>>({
      'medicineId': medicineId,
      'medicineSnapshot': medicineSnapshot,
      'requestedQuantity': requestedQuantity,
      'requestMode': requestMode.wire,
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

  /// Submit a `purchase` offer on a purchase request.
  static Future<String> submitPurchaseOffer({
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
      'offerType': OfferType.purchase.wire,
      'notes': notes,
    });
    return result.data['offerId'] as String;
  }

  /// Submit an `exchange` offer on an exchange request (Sprint 4, barter).
  /// `exchangeItem` describes the medicine the seller wants in return.
  static Future<String> submitExchangeOffer({
    required String requestId,
    required String inventoryItemId,
    required int offeredQuantity,
    required ExchangeItem exchangeItem,
    String notes = '',
  }) async {
    final callable = _functions.httpsCallable('submitMedicineRequestOffer');
    final result = await callable.call<Map<String, dynamic>>({
      'requestId': requestId,
      'inventoryItemId': inventoryItemId,
      'offeredQuantity': offeredQuantity,
      'offerType': OfferType.exchange.wire,
      'exchangeItem': exchangeItem.toMap(),
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
  /// For `exchange` offers, `exchangeInventoryItemId` is REQUIRED and
  /// must point to one of the requester's own inventory items matching
  /// the offer's `exchangeItem` (medicine + dosage + form + quantity).
  static Future<Map<String, dynamic>> acceptOffer({
    required String requestId,
    required String offerId,
    String? exchangeInventoryItemId,
  }) async {
    final callable = _functions.httpsCallable('acceptMedicineRequestOffer');
    final payload = <String, dynamic>{
      'requestId': requestId,
      'offerId': offerId,
    };
    if (exchangeInventoryItemId != null) {
      payload['exchangeInventoryItemId'] = exchangeInventoryItemId;
    }
    final result = await callable.call<Map<String, dynamic>>(payload);
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
