import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:equatable/equatable.dart';

enum OfferStatus { pending, accepted, declined, withdrawn, expired, converted }

/// Sprint 4 (F-BLOC2-P2): wire enum strict `purchase | exchange`.
enum OfferType { purchase, exchange }

extension OfferTypeX on OfferType {
  String get wire {
    switch (this) {
      case OfferType.purchase:
        return 'purchase';
      case OfferType.exchange:
        return 'exchange';
    }
  }
}

/// Sprint 4: describes the medicine the seller wants in return for an
/// exchange offer. Lives on `medicine_request_offers/{id}.exchangeItem`
/// when `offerType === 'exchange'`. Backend enforces presence/absence
/// based on `offerType`.
class ExchangeItem extends Equatable {
  final String medicineId;
  final String medicineName;
  final String dosage;
  final String form;
  final int quantity;
  final String? expiryDate;
  final String? lotNumber;

  const ExchangeItem({
    required this.medicineId,
    required this.medicineName,
    required this.dosage,
    required this.form,
    required this.quantity,
    this.expiryDate,
    this.lotNumber,
  });

  factory ExchangeItem.fromMap(Map<String, dynamic> data) {
    return ExchangeItem(
      medicineId: (data['medicineId'] as String?) ?? '',
      medicineName: (data['medicineName'] as String?) ?? '',
      dosage: (data['dosage'] as String?) ?? '',
      form: (data['form'] as String?) ?? '',
      quantity: (data['quantity'] as num?)?.toInt() ?? 0,
      expiryDate: data['expiryDate'] as String?,
      lotNumber: data['lotNumber'] as String?,
    );
  }

  Map<String, dynamic> toMap() => {
        'medicineId': medicineId,
        'medicineName': medicineName,
        'dosage': dosage,
        'form': form,
        'quantity': quantity,
        if (expiryDate != null) 'expiryDate': expiryDate,
        if (lotNumber != null) 'lotNumber': lotNumber,
      };

  @override
  List<Object?> get props =>
      [medicineId, medicineName, dosage, form, quantity, expiryDate, lotNumber];
}

class MedicineRequestOffer extends Equatable {
  final String id;
  final String requestId;
  final String requesterPharmacyId;
  final String sellerPharmacyId;
  final Map<String, dynamic> sellerSnapshot;
  final String inventoryItemId;
  final Map<String, dynamic> inventorySnapshot;
  final int offeredQuantity;
  final double unitPrice;
  final double totalPrice;
  final String currencyCode;
  final OfferType offerType;
  final ExchangeItem? exchangeItem;
  final String notes;
  final OfferStatus status;
  final String? linkedProposalId;
  final DateTime createdAt;
  final DateTime updatedAt;

  const MedicineRequestOffer({
    required this.id,
    required this.requestId,
    required this.requesterPharmacyId,
    required this.sellerPharmacyId,
    required this.sellerSnapshot,
    required this.inventoryItemId,
    required this.inventorySnapshot,
    required this.offeredQuantity,
    required this.unitPrice,
    required this.totalPrice,
    required this.currencyCode,
    required this.offerType,
    this.exchangeItem,
    required this.notes,
    required this.status,
    this.linkedProposalId,
    required this.createdAt,
    required this.updatedAt,
  });

  factory MedicineRequestOffer.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    final exchangeItemRaw = data['exchangeItem'];
    return MedicineRequestOffer(
      id: doc.id,
      requestId: data['requestId'] ?? '',
      requesterPharmacyId: data['requesterPharmacyId'] ?? '',
      sellerPharmacyId: data['sellerPharmacyId'] ?? '',
      sellerSnapshot:
          Map<String, dynamic>.from(data['sellerSnapshot'] ?? {}),
      inventoryItemId: data['inventoryItemId'] ?? '',
      inventorySnapshot:
          Map<String, dynamic>.from(data['inventorySnapshot'] ?? {}),
      offeredQuantity: (data['offeredQuantity'] as num?)?.toInt() ?? 0,
      unitPrice: (data['unitPrice'] as num?)?.toDouble() ?? 0,
      totalPrice: (data['totalPrice'] as num?)?.toDouble() ?? 0,
      currencyCode: data['currencyCode'] ?? 'XAF',
      offerType: _parseOfferType(data['offerType'] as String?),
      exchangeItem: exchangeItemRaw is Map
          ? ExchangeItem.fromMap(Map<String, dynamic>.from(exchangeItemRaw))
          : null,
      notes: data['notes'] ?? '',
      status: _parseStatus(data['status'] as String?),
      linkedProposalId: data['linkedProposalId'] as String?,
      createdAt:
          (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedAt:
          (data['updatedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }

  String get sellerName =>
      sellerSnapshot['pharmacyName'] as String? ?? 'Unknown';

  String get medicineName =>
      inventorySnapshot['medicineName'] as String? ?? 'Unknown Medicine';

  bool get isExchange => offerType == OfferType.exchange;

  @override
  List<Object?> get props => [
        id, requestId, sellerPharmacyId, inventoryItemId,
        offeredQuantity, unitPrice, totalPrice, offerType, exchangeItem,
        status, linkedProposalId, createdAt, updatedAt,
      ];

  static OfferType _parseOfferType(String? value) {
    switch (value) {
      case 'exchange':
        return OfferType.exchange;
      case 'purchase':
        return OfferType.purchase;
      default:
        // Defensive: legacy docs without offerType default to purchase.
        return OfferType.purchase;
    }
  }

  static OfferStatus _parseStatus(String? value) {
    switch (value) {
      case 'accepted':
        return OfferStatus.accepted;
      case 'declined':
        return OfferStatus.declined;
      case 'withdrawn':
        return OfferStatus.withdrawn;
      case 'expired':
        return OfferStatus.expired;
      case 'converted':
        return OfferStatus.converted;
      default:
        return OfferStatus.pending;
    }
  }
}
