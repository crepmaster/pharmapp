import 'package:cloud_firestore/cloud_firestore.dart';

/// Platform payout request — tracks a payout from platform treasury to admin account.
///
/// Source of truth: Firestore `platform_payout_requests/{autoId}`.
/// Contract: CONTRACT_ADMIN_MASTER_DATA_AND_TREASURY_V1 §6 (Sprint 4B).
///
/// Status flow: requested → completed | failed.
/// Written exclusively by Cloud Functions (requestPlatformPayout, resolvePlatformPayout).
/// Readable by the owning admin and finance/super_admin.
class PayoutRequest {
  final String id;
  final String adminUserId;
  final String treasuryId;
  final String countryCode;
  final String currencyCode;
  final double amount;
  final String payoutAccountId;
  final String providerId;
  final String msisdn;
  final String accountName;
  final String accountLabel;

  /// "requested" | "completed" | "failed".
  final String status;

  final String note;
  final String? externalReference;
  final String? failureReason;
  final String requestedByAdminId;
  final String? resolvedByAdminId;
  final DateTime? requestedAt;
  final DateTime? resolvedAt;
  final DateTime? updatedAt;

  const PayoutRequest({
    required this.id,
    required this.adminUserId,
    required this.treasuryId,
    required this.countryCode,
    required this.currencyCode,
    required this.amount,
    required this.payoutAccountId,
    required this.providerId,
    required this.msisdn,
    required this.accountName,
    required this.accountLabel,
    required this.status,
    this.note = '',
    this.externalReference,
    this.failureReason,
    required this.requestedByAdminId,
    this.resolvedByAdminId,
    this.requestedAt,
    this.resolvedAt,
    this.updatedAt,
  });

  factory PayoutRequest.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return PayoutRequest(
      id: doc.id,
      adminUserId: data['adminUserId'] as String? ?? '',
      treasuryId: data['treasuryId'] as String? ?? '',
      countryCode: data['countryCode'] as String? ?? '',
      currencyCode: data['currencyCode'] as String? ?? '',
      amount: (data['amount'] as num?)?.toDouble() ?? 0.0,
      payoutAccountId: data['payoutAccountId'] as String? ?? '',
      providerId: data['providerId'] as String? ?? '',
      msisdn: data['msisdn'] as String? ?? '',
      accountName: data['accountName'] as String? ?? '',
      accountLabel: data['accountLabel'] as String? ?? '',
      status: data['status'] as String? ?? 'requested',
      note: data['note'] as String? ?? '',
      externalReference: data['externalReference'] as String?,
      failureReason: data['failureReason'] as String?,
      requestedByAdminId: data['requestedByAdminId'] as String? ?? '',
      resolvedByAdminId: data['resolvedByAdminId'] as String?,
      requestedAt: (data['requestedAt'] as Timestamp?)?.toDate(),
      resolvedAt: (data['resolvedAt'] as Timestamp?)?.toDate(),
      updatedAt: (data['updatedAt'] as Timestamp?)?.toDate(),
    );
  }

  bool get isRequested => status == 'requested';
  bool get isCompleted => status == 'completed';
  bool get isFailed => status == 'failed';
}
