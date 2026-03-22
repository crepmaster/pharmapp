import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:equatable/equatable.dart';

enum OfferStatus { pending, accepted, declined, withdrawn, expired, converted }

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
  final String offerType;
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
    required this.notes,
    required this.status,
    this.linkedProposalId,
    required this.createdAt,
    required this.updatedAt,
  });

  factory MedicineRequestOffer.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
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
      offerType: data['offerType'] ?? 'purchase',
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

  @override
  List<Object?> get props => [
        id, requestId, sellerPharmacyId, inventoryItemId,
        offeredQuantity, unitPrice, totalPrice, status,
        linkedProposalId, createdAt, updatedAt,
      ];

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
