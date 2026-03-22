import 'package:cloud_firestore/cloud_firestore.dart';

/// A platform ledger entry — read-only record of a financial event on a
/// platform treasury (subscription revenue, payout request/complete/fail).
///
/// Source of truth: Firestore `ledger/{autoId}`.
/// Contract: CONTRACT_ADMIN_MASTER_DATA_AND_TREASURY_V1 §6.4.
///
/// Platform-relevant types:
///   - `platform_subscription_revenue`
///   - `platform_payout_requested`
///   - `platform_payout_completed`
///   - `platform_payout_failed`
class PlatformLedgerEntry {
  final String id;
  final String type;
  final String treasuryId;
  final String countryCode;
  final String currency;
  final double amount;
  final String from;
  final String to;

  /// Present on subscription revenue entries.
  final String? sourceType;
  final String? sourceId;

  /// Present on payout entries.
  final String? payoutRequestId;
  final String? adminUserId;
  final String? resolvedByAdminId;
  final String? externalReference;
  final String? failureReason;

  final DateTime? createdAt;

  const PlatformLedgerEntry({
    required this.id,
    required this.type,
    required this.treasuryId,
    required this.countryCode,
    required this.currency,
    required this.amount,
    required this.from,
    required this.to,
    this.sourceType,
    this.sourceId,
    this.payoutRequestId,
    this.adminUserId,
    this.resolvedByAdminId,
    this.externalReference,
    this.failureReason,
    this.createdAt,
  });

  factory PlatformLedgerEntry.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return PlatformLedgerEntry(
      id: doc.id,
      type: data['type'] as String? ?? '',
      treasuryId: data['treasuryId'] as String? ?? '',
      countryCode: data['countryCode'] as String? ?? '',
      currency: data['currency'] as String? ?? '',
      amount: (data['amount'] as num?)?.toDouble() ?? 0.0,
      from: data['from'] as String? ?? '',
      to: data['to'] as String? ?? '',
      sourceType: data['sourceType'] as String?,
      sourceId: data['sourceId'] as String?,
      payoutRequestId: data['payoutRequestId'] as String?,
      adminUserId: data['adminUserId'] as String?,
      resolvedByAdminId: data['resolvedByAdminId'] as String?,
      externalReference: data['externalReference'] as String?,
      failureReason: data['failureReason'] as String?,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
    );
  }

  /// Human-readable label for the entry type.
  String get typeLabel => switch (type) {
        'platform_subscription_revenue' => 'Subscription Revenue',
        'platform_payout_requested' => 'Payout Requested',
        'platform_payout_completed' => 'Payout Completed',
        'platform_payout_failed' => 'Payout Failed',
        _ => type,
      };
}
