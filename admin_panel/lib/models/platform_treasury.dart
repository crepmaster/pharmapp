import 'package:cloud_firestore/cloud_firestore.dart';

/// Platform treasury — accumulates platform revenue per (countryCode, currencyCode).
///
/// Source of truth: Firestore `platform_treasuries/{countryCode}_{currencyCode}`.
/// Contract: CONTRACT_ADMIN_MASTER_DATA_AND_TREASURY_V1 §6.2.
///
/// Written exclusively by Cloud Functions (Admin SDK).
/// Readable by finance admins and super_admin only (§11.1).
class PlatformTreasury {
  /// Document ID — composite key: `{countryCode}_{currencyCode}` (e.g. "CM_XAF").
  final String id;

  /// ISO 3166-1 alpha-2 (e.g. "CM").
  final String countryCode;

  /// ISO 4217 (e.g. "XAF").
  final String currencyCode;

  /// "active" | "suspended".
  final String status;

  /// Balance available for payout (in local currency units, no decimals for XAF).
  final double availableBalance;

  /// Reserved for future settlement flows — not yet in use V1.
  final double pendingBalance;

  /// Cumulative revenue collected since treasury creation.
  final double totalCollected;

  /// Cumulative amount paid out since treasury creation.
  final double totalWithdrawn;

  /// Timestamp of last payout. Null if no payout has been made.
  final DateTime? lastPayoutAt;

  final DateTime? updatedAt;

  /// UID of the admin who last modified the treasury, or null (backend write).
  final String? updatedByAdminId;

  const PlatformTreasury({
    required this.id,
    required this.countryCode,
    required this.currencyCode,
    required this.status,
    required this.availableBalance,
    required this.pendingBalance,
    required this.totalCollected,
    required this.totalWithdrawn,
    this.lastPayoutAt,
    this.updatedAt,
    this.updatedByAdminId,
  });

  factory PlatformTreasury.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return PlatformTreasury.fromMap(data, doc.id);
  }

  factory PlatformTreasury.fromMap(Map<String, dynamic> map, String id) {
    return PlatformTreasury(
      id: id,
      countryCode: map['countryCode'] as String? ?? '',
      currencyCode: map['currencyCode'] as String? ?? '',
      status: map['status'] as String? ?? 'active',
      availableBalance: (map['availableBalance'] as num?)?.toDouble() ?? 0.0,
      pendingBalance: (map['pendingBalance'] as num?)?.toDouble() ?? 0.0,
      totalCollected: (map['totalCollected'] as num?)?.toDouble() ?? 0.0,
      totalWithdrawn: (map['totalWithdrawn'] as num?)?.toDouble() ?? 0.0,
      lastPayoutAt: (map['lastPayoutAt'] as Timestamp?)?.toDate(),
      updatedAt: (map['updatedAt'] as Timestamp?)?.toDate(),
      updatedByAdminId: map['updatedByAdminId'] as String?,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'countryCode': countryCode,
      'currencyCode': currencyCode,
      'status': status,
      'availableBalance': availableBalance,
      'pendingBalance': pendingBalance,
      'totalCollected': totalCollected,
      'totalWithdrawn': totalWithdrawn,
      'lastPayoutAt':
          lastPayoutAt != null ? Timestamp.fromDate(lastPayoutAt!) : null,
      'updatedAt': updatedAt != null ? Timestamp.fromDate(updatedAt!) : null,
      'updatedByAdminId': updatedByAdminId,
    };
  }

  bool get isActive => status == 'active';
}
