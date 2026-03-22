import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:equatable/equatable.dart';

enum RequestMode { purchase, exchange, either }

enum RequestStatus { open, matched, fulfilled, cancelled, expired }

class MedicineRequest extends Equatable {
  final String id;
  final String requesterPharmacyId;
  final Map<String, dynamic> requesterSnapshot;
  final String countryCode;
  final String cityCode;
  final String medicineId;
  final Map<String, dynamic> medicineSnapshot;
  final int requestedQuantity;
  final RequestMode requestMode;
  final String currencyCode;
  final String notes;
  final RequestStatus status;
  final String? selectedOfferId;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? expiresAt;

  const MedicineRequest({
    required this.id,
    required this.requesterPharmacyId,
    required this.requesterSnapshot,
    required this.countryCode,
    required this.cityCode,
    required this.medicineId,
    required this.medicineSnapshot,
    required this.requestedQuantity,
    required this.requestMode,
    required this.currencyCode,
    required this.notes,
    required this.status,
    this.selectedOfferId,
    required this.createdAt,
    required this.updatedAt,
    this.expiresAt,
  });

  factory MedicineRequest.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return MedicineRequest(
      id: doc.id,
      requesterPharmacyId: data['requesterPharmacyId'] ?? '',
      requesterSnapshot:
          Map<String, dynamic>.from(data['requesterSnapshot'] ?? {}),
      countryCode: data['countryCode'] ?? '',
      cityCode: data['cityCode'] ?? '',
      medicineId: data['medicineId'] ?? '',
      medicineSnapshot:
          Map<String, dynamic>.from(data['medicineSnapshot'] ?? {}),
      requestedQuantity: (data['requestedQuantity'] as num?)?.toInt() ?? 0,
      requestMode: _parseRequestMode(data['requestMode'] as String?),
      currencyCode: data['currencyCode'] ?? 'XAF',
      notes: data['notes'] ?? '',
      status: _parseStatus(data['status'] as String?),
      selectedOfferId: data['selectedOfferId'] as String?,
      createdAt:
          (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedAt:
          (data['updatedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      expiresAt: (data['expiresAt'] as Timestamp?)?.toDate(),
    );
  }

  String get requesterName =>
      requesterSnapshot['pharmacyName'] as String? ?? 'Unknown';

  String get medicineName =>
      medicineSnapshot['name'] as String? ??
      medicineSnapshot['medicineName'] as String? ??
      'Unknown Medicine';

  bool get isOpen => status == RequestStatus.open;

  bool get isExpired =>
      expiresAt != null && expiresAt!.isBefore(DateTime.now());

  @override
  List<Object?> get props => [
        id, requesterPharmacyId, countryCode, cityCode, medicineId,
        requestedQuantity, requestMode, status, selectedOfferId,
        createdAt, updatedAt, expiresAt,
      ];

  static RequestMode _parseRequestMode(String? value) {
    switch (value) {
      case 'exchange':
        return RequestMode.exchange;
      case 'either':
        return RequestMode.either;
      default:
        return RequestMode.purchase;
    }
  }

  static RequestStatus _parseStatus(String? value) {
    switch (value) {
      case 'matched':
        return RequestStatus.matched;
      case 'fulfilled':
        return RequestStatus.fulfilled;
      case 'cancelled':
        return RequestStatus.cancelled;
      case 'expired':
        return RequestStatus.expired;
      default:
        return RequestStatus.open;
    }
  }
}
