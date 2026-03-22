import 'package:cloud_firestore/cloud_firestore.dart';

/// Admin payout account — a mobile money account an admin uses to receive payouts.
///
/// Source of truth: Firestore `admin_payout_accounts/{autoId}`.
/// Contract: CONTRACT_ADMIN_MASTER_DATA_AND_TREASURY_V1 §6.3.
///
/// Rules:
///   - One account can be `isDefault` per (adminUserId, countryCode, currencyCode).
///   - `verificationStatus` starts as "unverified". Promotion to "verified" is
///     out of scope for Lot 3 (no verify flow in Sprint 3B).
///   - No secrets (tokens, PINs, provider credentials) stored here.
///   - `adminUserId` and `createdAt` are immutable after creation.
class AdminPayoutAccount {
  final String id;

  /// UID of the admin who owns this account. Immutable after creation.
  final String adminUserId;

  /// Human-readable label (e.g. "MTN Cameroun principal").
  final String label;

  /// ISO 3166-1 alpha-2 (e.g. "CM").
  final String countryCode;

  /// ISO 4217 (e.g. "XAF").
  final String currencyCode;

  /// Stable provider key from system_config (e.g. "mtn_cm").
  final String providerId;

  /// Always "mobile_money" for V1.
  final String accountType;

  /// MSISDN in international format (e.g. "2376XXXXXXXX").
  /// Not a secret — it is the destination number for payouts.
  final String msisdn;

  /// Account holder name for reconciliation.
  final String accountName;

  /// True if this is the default account for this
  /// (adminUserId, countryCode, currencyCode) tuple.
  final bool isDefault;

  /// Whether this account is enabled for payout operations.
  final bool isActive;

  /// "unverified" | "verified" | "rejected".
  /// Sprint 3B only creates "unverified" accounts — promotion is out of scope.
  final String verificationStatus;

  final DateTime? lastUsedAt;

  /// Immutable after creation.
  final DateTime createdAt;

  final DateTime updatedAt;

  const AdminPayoutAccount({
    required this.id,
    required this.adminUserId,
    required this.label,
    required this.countryCode,
    required this.currencyCode,
    required this.providerId,
    this.accountType = 'mobile_money',
    required this.msisdn,
    required this.accountName,
    this.isDefault = false,
    this.isActive = true,
    this.verificationStatus = 'unverified',
    this.lastUsedAt,
    required this.createdAt,
    required this.updatedAt,
  });

  factory AdminPayoutAccount.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return AdminPayoutAccount.fromMap(data, doc.id);
  }

  factory AdminPayoutAccount.fromMap(Map<String, dynamic> map, String id) {
    return AdminPayoutAccount(
      id: id,
      adminUserId: map['adminUserId'] as String? ?? '',
      label: map['label'] as String? ?? '',
      countryCode: map['countryCode'] as String? ?? '',
      currencyCode: map['currencyCode'] as String? ?? '',
      providerId: map['providerId'] as String? ?? '',
      accountType: map['accountType'] as String? ?? 'mobile_money',
      msisdn: map['msisdn'] as String? ?? '',
      accountName: map['accountName'] as String? ?? '',
      isDefault: map['isDefault'] as bool? ?? false,
      isActive: map['isActive'] as bool? ?? true,
      verificationStatus:
          map['verificationStatus'] as String? ?? 'unverified',
      lastUsedAt: (map['lastUsedAt'] as Timestamp?)?.toDate(),
      createdAt:
          (map['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      updatedAt:
          (map['updatedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'adminUserId': adminUserId,
      'label': label,
      'countryCode': countryCode,
      'currencyCode': currencyCode,
      'providerId': providerId,
      'accountType': accountType,
      'msisdn': msisdn,
      'accountName': accountName,
      'isDefault': isDefault,
      'isActive': isActive,
      'verificationStatus': verificationStatus,
      'lastUsedAt':
          lastUsedAt != null ? Timestamp.fromDate(lastUsedAt!) : null,
      'createdAt': Timestamp.fromDate(createdAt),
      'updatedAt': Timestamp.fromDate(updatedAt),
    };
  }

  AdminPayoutAccount copyWith({
    String? label,
    String? msisdn,
    String? accountName,
    bool? isDefault,
    bool? isActive,
    DateTime? lastUsedAt,
    DateTime? updatedAt,
  }) {
    return AdminPayoutAccount(
      id: id,
      adminUserId: adminUserId, // immutable
      label: label ?? this.label,
      countryCode: countryCode,
      currencyCode: currencyCode,
      providerId: providerId,
      accountType: accountType,
      msisdn: msisdn ?? this.msisdn,
      accountName: accountName ?? this.accountName,
      isDefault: isDefault ?? this.isDefault,
      isActive: isActive ?? this.isActive,
      verificationStatus: verificationStatus, // not promoted in Sprint 3B
      lastUsedAt: lastUsedAt ?? this.lastUsedAt,
      createdAt: createdAt, // immutable
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
