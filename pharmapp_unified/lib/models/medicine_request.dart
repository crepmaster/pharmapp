import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:equatable/equatable.dart';

/// Sprint 4 (F-BLOC2-P2): `either` est retiré. Le contrat est strictement
/// `purchase | exchange`. Toute écriture/lecture qui rencontre `either`
/// doit échouer côté backend (`invalid-argument`).
enum RequestMode { purchase, exchange }

enum RequestStatus { open, matched, fulfilled, cancelled, expired }

extension RequestModeX on RequestMode {
  String get wire {
    switch (this) {
      case RequestMode.purchase:
        return 'purchase';
      case RequestMode.exchange:
        return 'exchange';
    }
  }
}

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

  bool get isExchange => requestMode == RequestMode.exchange;

  bool get isExpired =>
      expiresAt != null && expiresAt!.isBefore(DateTime.now());

  @override
  List<Object?> get props => [
        id, requesterPharmacyId, countryCode, cityCode, medicineId,
        requestedQuantity, requestMode, status, selectedOfferId,
        createdAt, updatedAt, expiresAt,
      ];

  /// Defensive parser: any unknown wire value (including legacy `either`
  /// from pre-Sprint-4 docs that should NOT have been persisted) falls
  /// back to `purchase` so we don't crash the UI list. Backend write
  /// path enforces strict `purchase | exchange`.
  static RequestMode _parseRequestMode(String? value) {
    switch (value) {
      case 'exchange':
        return RequestMode.exchange;
      case 'purchase':
        return RequestMode.purchase;
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
