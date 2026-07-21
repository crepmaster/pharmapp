import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';

// Medicine Purchase Proposal Model
// Simple proposal system: Multiple buyers can propose on same medicine
//
// User Flow:
// 1. Pharmacy A lists: "Amoxicillin, 50 boxes, expires Dec 31" (NO PRICE)
// 2. Pharmacy B proposes: "I'll pay $20/box for 10 boxes"
// 3. Pharmacy C proposes: "I'll pay $18/box for 20 boxes" 
// 4. Pharmacy A sees ALL proposals and accepts best one(s)
// 5. Delivery arranged automatically
//
// Usage Example:
// final proposal = ExchangeProposal.makeOffer(
//   inventoryItemId: 'item_123',
//   buyerPharmacyId: 'buyer_pharmacy',
//   offerPricePerUnit: 20.0,
//   quantity: 5,
// );
class ExchangeProposal extends Equatable {
  static final FirebaseFunctions _functions =
      FirebaseFunctions.instanceFor(region: 'europe-west1');

  final String id;
  final String inventoryItemId; // Reference to PharmacyInventoryItem
  final String fromPharmacyId; // Pharmacy making the proposal
  final String toPharmacyId; // Pharmacy receiving the proposal
  final String? deliveryId; // Linked delivery ID after acceptance
  final ProposalDetails details;
  final ProposalStatus status;
  final String? rejectionReason;
  final DeliveryInfo? deliveryInfo; // Set when accepted
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? expiresAt; // Proposal expires after X hours
  /// V2 Inventory Visibility: snapshot of target inventory at proposal time.
  /// Allows proposals UI to render without live reads on pharmacy_inventory.
  final Map<String, dynamic>? inventorySnapshot;

  const ExchangeProposal({
    required this.id,
    required this.inventoryItemId,
    required this.fromPharmacyId,
    required this.toPharmacyId,
    this.deliveryId,
    required this.details,
    required this.status,
    this.rejectionReason,
    this.deliveryInfo,
    required this.createdAt,
    required this.updatedAt,
    this.expiresAt,
    this.inventorySnapshot,
  });

  @override
  List<Object?> get props => [
        id,
        inventoryItemId,
        fromPharmacyId,
        toPharmacyId,
        deliveryId,
        details,
        status,
        rejectionReason,
        deliveryInfo,
        createdAt,
        updatedAt,
        expiresAt,
        inventorySnapshot,
      ];

  // Round-4 currency sprint phase 3a — the historical
  // `ExchangeProposal.makeOffer` factory was dead code (referenced only
  // in a doc-comment example, no runtime callers). Its `currency = 'USD'`
  // default was one of the silent XAF/USD trap sources the architect
  // review flagged. Removed rather than migrated.

  factory ExchangeProposal.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    
    return ExchangeProposal(
      id: doc.id,
      inventoryItemId: data['inventoryItemId'] ?? '',
      fromPharmacyId: data['fromPharmacyId'] ?? '',
      toPharmacyId: data['toPharmacyId'] ?? '',
      deliveryId: data['deliveryId'] as String?,
      details: ProposalDetails.fromMap(data['details'] ?? {}),
      status: ProposalStatus.values.firstWhere(
        (e) => e.toString().split('.').last == data['status'],
        orElse: () => ProposalStatus.pending,
      ),
      rejectionReason: data['rejectionReason'],
      deliveryInfo: data['deliveryInfo'] != null 
          ? DeliveryInfo.fromMap(data['deliveryInfo']) 
          : null,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedAt: (data['updatedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      expiresAt: (data['expiresAt'] as Timestamp?)?.toDate(),
      inventorySnapshot: data['inventorySnapshot'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'inventoryItemId': inventoryItemId,
      'fromPharmacyId': fromPharmacyId,
      'toPharmacyId': toPharmacyId,
      if (deliveryId != null) 'deliveryId': deliveryId,
      'details': details.toMap(),
      'status': status.toString().split('.').last,
      if (rejectionReason != null) 'rejectionReason': rejectionReason,
      if (deliveryInfo != null) 'deliveryInfo': deliveryInfo!.toMap(),
      'createdAt': Timestamp.fromDate(createdAt),
      'updatedAt': Timestamp.fromDate(updatedAt),
      if (expiresAt != null) 'expiresAt': Timestamp.fromDate(expiresAt!),
    };
  }

  ExchangeProposal copyWith({
    String? id,
    String? inventoryItemId,
    String? fromPharmacyId,
    String? toPharmacyId,
    String? deliveryId,
    ProposalDetails? details,
    ProposalStatus? status,
    String? rejectionReason,
    DeliveryInfo? deliveryInfo,
    DateTime? createdAt,
    DateTime? updatedAt,
    DateTime? expiresAt,
  }) {
    return ExchangeProposal(
      id: id ?? this.id,
      inventoryItemId: inventoryItemId ?? this.inventoryItemId,
      fromPharmacyId: fromPharmacyId ?? this.fromPharmacyId,
      toPharmacyId: toPharmacyId ?? this.toPharmacyId,
      deliveryId: deliveryId ?? this.deliveryId,
      details: details ?? this.details,
      status: status ?? this.status,
      rejectionReason: rejectionReason ?? this.rejectionReason,
      deliveryInfo: deliveryInfo ?? this.deliveryInfo,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      expiresAt: expiresAt ?? this.expiresAt,
    );
  }

  // Helper getters
  bool get isExpired => expiresAt != null && expiresAt!.isBefore(DateTime.now());
  bool get isPending => status == ProposalStatus.pending && !isExpired;
  bool get canBeAccepted => isPending;
  bool get canBeRejected => isPending;

  // Backend integration methods
  Future<String> acceptProposal({String? notes}) async {
    if (!canBeAccepted) {
      throw Exception('Proposal cannot be accepted in current state');
    }

    final result = await _functions.httpsCallable('acceptExchangeProposal').call({
      'proposalId': id,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
    });

    final data = Map<String, dynamic>.from(result.data as Map);
    final linkedDeliveryId = data['deliveryId'] as String?;
    if (linkedDeliveryId == null || linkedDeliveryId.isEmpty) {
      throw Exception('acceptExchangeProposal returned no deliveryId');
    }
    return linkedDeliveryId;
  }

  Future<void> rejectProposal(String reason) async {
    if (!canBeRejected) {
      throw Exception('Proposal cannot be rejected in current state');
    }

    await _functions.httpsCallable('cancelExchangeProposal').call({
      'proposalId': id,
      'reason': reason,
      'action': 'reject',
    });
  }

  Future<void> completeDelivery({
    required String deliveryId,
    String? deliveryNotes,
    String? photoProofUrl,
  }) async {
    await _functions.httpsCallable('completeExchangeDelivery').call({
      'deliveryId': deliveryId,
      if (deliveryNotes != null && deliveryNotes.isNotEmpty)
        'deliveryNotes': deliveryNotes,
      if (photoProofUrl != null && photoProofUrl.isNotEmpty)
        'photoProofUrl': photoProofUrl,
    });
  }

  Future<void> cancelProposal(String reason) async {
    await _functions.httpsCallable('cancelExchangeProposal').call({
      'proposalId': id,
      'reason': reason,
      'action': 'cancel',
    });
  }
}

// Proposal offer details
class ProposalDetails extends Equatable {
  final double offeredPrice; // Buyer's offer price per unit (0 for exchange)
  final int requestedQuantity;
  final String currency;
  final ProposalType proposalType;

  /// Total as written by the backend (`totalPrice`), when present.
  ///
  /// The backend is the source of truth for the amount actually reserved and
  /// settled, so we display ITS total rather than recomputing one. Null on
  /// legacy documents (and on exchange proposals, where no money moves), in
  /// which case [totalOfferAmount] falls back to unit × quantity.
  final double? totalPrice;

  // EXCHANGE-SPECIFIC FIELDS
  final String? exchangeMedicineId; // Medicine ID being offered in exchange
  final String? exchangeInventoryItemId; // Inventory item ID being offered
  final int? exchangeQuantity; // Quantity of exchange medicine offered
  // Sprint 4 exchangeInventorySnapshot — rich metadata captured at create
  // time by `reserveExchangeInventory` (functions/src/lib/exchangePipeline.ts).
  // Needed so the receiving pharmacy can see what medicine is being offered
  // in barter WITHOUT looking up the requester's inventory doc separately.
  final ExchangeInventorySnapshot? exchangeInventorySnapshot;

  const ProposalDetails({
    required this.offeredPrice,
    required this.requestedQuantity,
    this.totalPrice,
    // Round-4 currency sprint phase 3a — mandatory at boundary. Callers
    // must resolve currency from the pharmacy country (MoneyContext) or
    // pass it explicitly. The previous `= 'USD'` default was the root of
    // "Offered Price: 0 USD" appearing on Ghana exchange proposals.
    required this.currency,
    required this.proposalType,
    this.exchangeMedicineId,
    this.exchangeInventoryItemId,
    this.exchangeQuantity,
    this.exchangeInventorySnapshot,
  });

  @override
  List<Object?> get props => [
        offeredPrice,
        requestedQuantity,
        totalPrice,
        currency,
        proposalType,
        exchangeMedicineId,
        exchangeInventoryItemId,
        exchangeQuantity,
        exchangeInventorySnapshot,
      ];

  factory ProposalDetails.fromMap(Map<String, dynamic> map) {
    final rawType = (map['type'] ?? map['proposalType'] ?? 'purchase').toString();
    final snapshotRaw = map['exchangeInventorySnapshot'];

    return ProposalDetails(
      // `unitPrice` FIRST — that is the canonical field the backend writes
      // (createExchangeProposal builds CanonicalPurchaseDetails with
      // `unitPrice`/`totalPrice`). Reading only `pricePerUnit`/`offeredPrice`
      // meant every receiver saw "0" for a purchase they were asked to
      // accept: the price was in Firestore, just under another name.
      // The two legacy names stay as fallbacks for older documents.
      offeredPrice:
          (map['unitPrice'] ?? map['pricePerUnit'] ?? map['offeredPrice'] ?? 0)
              .toDouble(),
      totalPrice: (map['totalPrice'] as num?)?.toDouble(),
      requestedQuantity: map['quantity']?.toInt() ?? map['requestedQuantity']?.toInt() ?? 0,
      // Legacy fallback with telemetry — new writers pass currency
      // explicitly (constructor is `required`) ; only legacy Firestore
      // docs land here without a currency, and we surface each hit so
      // ops can measure backfill scope.
      currency: _readCurrencyOrWarn(map, 'ProposalDetails'),
      proposalType: ProposalType.values.firstWhere(
        (e) => e.toString().split('.').last == rawType,
        orElse: () => ProposalType.purchase,
      ),
      exchangeMedicineId: map['exchangeMedicineId'],
      exchangeInventoryItemId: map['exchangeInventoryItemId'],
      exchangeQuantity: map['exchangeQuantity']?.toInt(),
      exchangeInventorySnapshot: snapshotRaw is Map
          ? ExchangeInventorySnapshot.fromMap(
              Map<String, dynamic>.from(snapshotRaw))
          : null,
    );
  }

  /// Legacy Firestore documents may lack a `currency` field for exchange
  /// proposals (no money on the medicine leg). We return an empty string
  /// so the UI can render "no currency" instead of a lying "USD" — the
  /// exchange-branch of every consumer already hides monetary rows.
  static String _readCurrencyOrWarn(Map<String, dynamic> map, String tag) {
    final raw = map['currency'] as String?;
    if (raw != null && raw.isNotEmpty) return raw;
    debugPrint(
      '$tag.fromMap: missing `currency` — returning empty. This is expected '
      'for exchange-type documents (no money on the medicine leg). '
      'Purchase-type documents without currency are a data-quality bug.',
    );
    return '';
  }

  Map<String, dynamic> toMap() {
    return {
      'type': proposalType.toString().split('.').last,
      'quantity': requestedQuantity,
      'pricePerUnit': offeredPrice,
      'totalPrice': totalOfferAmount,
      'currency': currency,
      if (exchangeMedicineId != null) 'exchangeMedicineId': exchangeMedicineId,
      if (exchangeInventoryItemId != null) 'exchangeInventoryItemId': exchangeInventoryItemId,
      if (exchangeQuantity != null) 'exchangeQuantity': exchangeQuantity,
    };
  }

  // Helper getter
  /// Prefer the backend-written `totalPrice` (the amount actually reserved
  /// and settled) over a client-side recomputation, so the receiver never
  /// sees a total that disagrees with what will be debited.
  double get totalOfferAmount => totalPrice ?? (offeredPrice * requestedQuantity);
}

/// Rich metadata about the medicine being offered in barter, captured by
/// the backend at proposal-create time. Mirrors CanonicalExchangeInventorySnapshot
/// in functions/src/lib/exchangePipeline.ts.
class ExchangeInventorySnapshot extends Equatable {
  final String medicineId;
  final String medicineName;
  final String dosage;
  final String form;
  final String? packaging;
  final String? lotNumber;
  final int quantityAtAcceptance;

  const ExchangeInventorySnapshot({
    required this.medicineId,
    required this.medicineName,
    required this.dosage,
    required this.form,
    this.packaging,
    this.lotNumber,
    required this.quantityAtAcceptance,
  });

  @override
  List<Object?> get props => [
        medicineId,
        medicineName,
        dosage,
        form,
        packaging,
        lotNumber,
        quantityAtAcceptance,
      ];

  factory ExchangeInventorySnapshot.fromMap(Map<String, dynamic> map) {
    return ExchangeInventorySnapshot(
      medicineId: (map['medicineId'] ?? '') as String,
      medicineName: (map['medicineName'] ?? '') as String,
      dosage: (map['dosage'] ?? '') as String,
      form: (map['form'] ?? '') as String,
      packaging: map['packaging'] as String?,
      lotNumber: map['lotNumber'] as String?,
      quantityAtAcceptance: (map['quantityAtAcceptance'] ?? 0) as int,
    );
  }
}

// Delivery information when proposal is accepted
// Different flows for Purchase vs Exchange
class DeliveryInfo extends Equatable {
  final String? courierId; // Assigned courier
  final DeliveryType deliveryType; // Purchase or Exchange
  final List<DeliveryStop> stops; // One stop for purchase, two for exchange
  final DateTime? estimatedDelivery;
  final double? deliveryFee;
  final DeliveryStatus deliveryStatus;

  const DeliveryInfo({
    this.courierId,
    required this.deliveryType,
    required this.stops,
    this.estimatedDelivery,
    this.deliveryFee,
    this.deliveryStatus = DeliveryStatus.pending,
  });

  @override
  List<Object?> get props => [
        courierId,
        deliveryType,
        stops,
        estimatedDelivery,
        deliveryFee,
        deliveryStatus,
      ];

  // Create purchase delivery (simple: pickup → deliver)
  factory DeliveryInfo.purchase({
    required String sellerPharmacyId,
    required String buyerPharmacyId,
    required String medicineId,
    required int quantity,
    double? deliveryFee,
  }) {
    return DeliveryInfo(
      deliveryType: DeliveryType.purchase,
      stops: [
        DeliveryStop.pickup(
          pharmacyId: sellerPharmacyId,
          medicineId: medicineId,
          quantity: quantity,
        ),
        DeliveryStop.delivery(
          pharmacyId: buyerPharmacyId,
          medicineId: medicineId,
          quantity: quantity,
        ),
      ],
      deliveryFee: deliveryFee,
    );
  }

  // Create exchange delivery (complex: pickup A → pickup B → deliver A to B → deliver B to A)
  factory DeliveryInfo.exchange({
    required String pharmacy1Id,
    required String medicine1Id,
    required int quantity1,
    required String pharmacy2Id,
    required String medicine2Id,
    required int quantity2,
    double? deliveryFee,
  }) {
    return DeliveryInfo(
      deliveryType: DeliveryType.exchange,
      stops: [
        DeliveryStop.pickup(
          pharmacyId: pharmacy1Id,
          medicineId: medicine1Id,
          quantity: quantity1,
        ),
        DeliveryStop.pickup(
          pharmacyId: pharmacy2Id,
          medicineId: medicine2Id,
          quantity: quantity2,
        ),
        DeliveryStop.delivery(
          pharmacyId: pharmacy2Id,
          medicineId: medicine1Id,
          quantity: quantity1,
        ),
        DeliveryStop.delivery(
          pharmacyId: pharmacy1Id,
          medicineId: medicine2Id,
          quantity: quantity2,
        ),
      ],
      deliveryFee: deliveryFee,
    );
  }

  factory DeliveryInfo.fromMap(Map<String, dynamic> map) {
    return DeliveryInfo(
      courierId: map['courierId'],
      deliveryType: DeliveryType.values.firstWhere(
        (e) => e.toString().split('.').last == map['deliveryType'],
        orElse: () => DeliveryType.purchase,
      ),
      stops: (map['stops'] as List?)
          ?.map((s) => DeliveryStop.fromMap(s))
          .toList() ?? [],
      estimatedDelivery: (map['estimatedDelivery'] as Timestamp?)?.toDate(),
      deliveryFee: map['deliveryFee']?.toDouble(),
      deliveryStatus: DeliveryStatus.values.firstWhere(
        (e) => e.toString().split('.').last == map['deliveryStatus'],
        orElse: () => DeliveryStatus.pending,
      ),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      if (courierId != null) 'courierId': courierId,
      'deliveryType': deliveryType.toString().split('.').last,
      'stops': stops.map((s) => s.toMap()).toList(),
      if (estimatedDelivery != null) 'estimatedDelivery': Timestamp.fromDate(estimatedDelivery!),
      if (deliveryFee != null) 'deliveryFee': deliveryFee,
      'deliveryStatus': deliveryStatus.toString().split('.').last,
    };
  }
}

// Delivery stop model
class DeliveryStop extends Equatable {
  final String pharmacyId;
  final String medicineId;
  final int quantity;
  final DeliveryAction action; // pickup or delivery
  final bool isCompleted;
  final DateTime? completedAt;

  const DeliveryStop({
    required this.pharmacyId,
    required this.medicineId,
    required this.quantity,
    required this.action,
    this.isCompleted = false,
    this.completedAt,
  });

  @override
  List<Object?> get props => [
        pharmacyId,
        medicineId,
        quantity,
        action,
        isCompleted,
        completedAt,
      ];

  factory DeliveryStop.pickup({
    required String pharmacyId,
    required String medicineId,
    required int quantity,
  }) {
    return DeliveryStop(
      pharmacyId: pharmacyId,
      medicineId: medicineId,
      quantity: quantity,
      action: DeliveryAction.pickup,
    );
  }

  factory DeliveryStop.delivery({
    required String pharmacyId,
    required String medicineId,
    required int quantity,
  }) {
    return DeliveryStop(
      pharmacyId: pharmacyId,
      medicineId: medicineId,
      quantity: quantity,
      action: DeliveryAction.delivery,
    );
  }

  factory DeliveryStop.fromMap(Map<String, dynamic> map) {
    return DeliveryStop(
      pharmacyId: map['pharmacyId'] ?? '',
      medicineId: map['medicineId'] ?? '',
      quantity: map['quantity']?.toInt() ?? 0,
      action: DeliveryAction.values.firstWhere(
        (e) => e.toString().split('.').last == map['action'],
        orElse: () => DeliveryAction.pickup,
      ),
      isCompleted: map['isCompleted'] ?? false,
      completedAt: (map['completedAt'] as Timestamp?)?.toDate(),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'pharmacyId': pharmacyId,
      'medicineId': medicineId,
      'quantity': quantity,
      'action': action.toString().split('.').last,
      'isCompleted': isCompleted,
      if (completedAt != null) 'completedAt': Timestamp.fromDate(completedAt!),
    };
  }

  DeliveryStop copyWith({
    String? pharmacyId,
    String? medicineId,
    int? quantity,
    DeliveryAction? action,
    bool? isCompleted,
    DateTime? completedAt,
  }) {
    return DeliveryStop(
      pharmacyId: pharmacyId ?? this.pharmacyId,
      medicineId: medicineId ?? this.medicineId,
      quantity: quantity ?? this.quantity,
      action: action ?? this.action,
      isCompleted: isCompleted ?? this.isCompleted,
      completedAt: completedAt ?? this.completedAt,
    );
  }
}

// Enums
enum ProposalStatus {
  pending,
  accepted,
  rejected,
  expired,
  completed,
  cancelled,
}

enum ProposalType {
  purchase, // Buying with money
  exchange, // Trading for other medicine
}

enum DeliveryType {
  purchase, // Simple: pickup → deliver
  exchange, // Complex: pickup A → pickup B → deliver A to B → deliver B to A
}

enum DeliveryAction {
  pickup,
  delivery,
}

enum DeliveryStatus {
  pending,
  assigned,
  inProgress,
  completed,
  cancelled,
}

// Extension for display names
extension ProposalStatusExtension on ProposalStatus {
  String get displayName {
    switch (this) {
      case ProposalStatus.pending:
        return 'Pending';
      case ProposalStatus.accepted:
        return 'Accepted';
      case ProposalStatus.rejected:
        return 'Rejected';
      case ProposalStatus.expired:
        return 'Expired';
      case ProposalStatus.completed:
        return 'Completed';
      case ProposalStatus.cancelled:
        return 'Cancelled';
    }
  }

  String get icon {
    switch (this) {
      case ProposalStatus.pending:
        return '⏳';
      case ProposalStatus.accepted:
        return '✅';
      case ProposalStatus.rejected:
        return '❌';
      case ProposalStatus.expired:
        return '⏰';
      case ProposalStatus.completed:
        return '🎉';
      case ProposalStatus.cancelled:
        return '🚫';
    }
  }
}
