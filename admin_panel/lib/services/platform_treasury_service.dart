import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../models/admin_payout_account.dart';
import '../models/payout_request.dart';
import '../models/platform_ledger_entry.dart';
import '../models/platform_treasury.dart';
import '../models/provider_option.dart';

/// Service for `platform_treasuries` read and `admin_payout_accounts` CRUD.
///
/// Contract: CONTRACT_ADMIN_MASTER_DATA_AND_TREASURY_V1 §6.2–6.3.
///
/// Read access policy (enforced by Firestore rules — not here):
///   - `platform_treasuries`: super_admin + finance admins only.
///   - `admin_payout_accounts`: owning admin or super_admin only.
///
/// Write policy:
///   - `platform_treasuries`: backend-only (Cloud Functions / Admin SDK).
///     This service never writes to that collection.
///   - `admin_payout_accounts`: client writes allowed for own documents.
///
/// Follows the static-class pattern used by [SystemConfigService].
class PlatformTreasuryService {
  static final FirebaseFirestore _db = FirebaseFirestore.instance;

  static const String _treasuriesCollection = 'platform_treasuries';
  static const String _payoutAccountsCollection = 'admin_payout_accounts';
  static const String _configCollection = 'system_config';
  static const String _configDocId = 'main';

  // ---------------------------------------------------------------------------
  // PLATFORM TREASURIES (read-only from client)
  // ---------------------------------------------------------------------------

  /// Real-time stream of all platform treasury documents, ordered by id.
  ///
  /// Restricted to finance/super_admin by Firestore rules — a permission error
  /// surfaces as a stream error if the caller lacks access.
  static Stream<List<PlatformTreasury>> getTreasuries() {
    return _db
        .collection(_treasuriesCollection)
        .orderBy(FieldPath.documentId)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => PlatformTreasury.fromFirestore(doc))
            .toList());
  }

  // ---------------------------------------------------------------------------
  // PLATFORM LEDGER (read-only — Sprint 4C)
  // ---------------------------------------------------------------------------

  /// Platform-relevant ledger entry types.
  static const List<String> _platformLedgerTypes = [
    'platform_subscription_revenue',
    'platform_payout_requested',
    'platform_payout_completed',
    'platform_payout_failed',
  ];

  /// Stream of the most recent platform ledger entries (max [limit]),
  /// ordered by [createdAt] descending.
  ///
  /// Uses `whereIn` on `type` to select only platform-relevant entries.
  /// Requires composite index: `type ASC, createdAt DESC`.
  ///
  /// Treasury filtering is done client-side to avoid a second composite index.
  static Stream<List<PlatformLedgerEntry>> getPlatformLedger({
    int limit = 100,
  }) {
    return _db
        .collection('ledger')
        .where('type', whereIn: _platformLedgerTypes)
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => PlatformLedgerEntry.fromFirestore(doc))
            .toList());
  }

  // ---------------------------------------------------------------------------
  // ADMIN PAYOUT ACCOUNTS
  // ---------------------------------------------------------------------------

  /// Real-time stream of payout accounts owned by [adminUserId],
  /// sorted by [countryCode], then [currencyCode], then [label].
  static Stream<List<AdminPayoutAccount>> getAdminPayoutAccounts(
      String adminUserId) {
    return _db
        .collection(_payoutAccountsCollection)
        .where('adminUserId', isEqualTo: adminUserId)
        .orderBy('countryCode')
        .orderBy('currencyCode')
        .orderBy('label')
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => AdminPayoutAccount.fromFirestore(doc))
            .toList());
  }

  /// Returns providers from `system_config/main → mobileMoneyProviders` that
  /// match [countryCode] + [currencyCode] and have `supportsPayouts: true` and
  /// `enabled: true`, sorted by [displayOrder].
  ///
  /// Returns an empty list on any error or if the config document is absent.
  static Future<List<ProviderOption>> getEligiblePayoutProviders(
      String countryCode, String currencyCode) async {
    try {
      final doc = await _db
          .collection(_configCollection)
          .doc(_configDocId)
          .get();
      if (!doc.exists) return [];

      final data = doc.data()!;
      final providersMap =
          (data['mobileMoneyProviders'] as Map<String, dynamic>?) ?? {};

      final eligible = providersMap.values
          .whereType<Map<String, dynamic>>()
          .map(ProviderOption.fromMap)
          .where((p) =>
              p.countryCode == countryCode &&
              p.currencyCode == currencyCode &&
              p.supportsPayouts &&
              p.enabled)
          .toList()
        ..sort((a, b) => a.displayOrder.compareTo(b.displayOrder));

      return eligible;
    } catch (_) {
      return [];
    }
  }

  /// Creates a new payout account document.
  ///
  /// Returns the new document ID on success, or `null` on error.
  ///
  /// When [isDefault] is `true`, clears sibling defaults and sets this
  /// document atomically in a single Firestore batch write.
  ///
  /// `verificationStatus` is always set to `'unverified'` (Sprint 3B —
  /// promotion is out of scope).
  static Future<String?> createPayoutAccount({
    required String adminUserId,
    required String label,
    required String countryCode,
    required String currencyCode,
    required String providerId,
    required String msisdn,
    required String accountName,
    bool isDefault = false,
  }) async {
    try {
      final newRef = _db.collection(_payoutAccountsCollection).doc();
      // Build the map from the model, then override timestamps with server values.
      // The model constructor requires non-null DateTime — use a sentinel; it is
      // immediately overridden before any Firestore write.
      final sentinel = DateTime.fromMillisecondsSinceEpoch(0);
      final data = AdminPayoutAccount(
        id: newRef.id,
        adminUserId: adminUserId,
        label: label,
        countryCode: countryCode,
        currencyCode: currencyCode,
        providerId: providerId,
        accountType: 'mobile_money',
        msisdn: msisdn,
        accountName: accountName,
        isDefault: isDefault,
        isActive: true,
        verificationStatus: 'unverified',
        createdAt: sentinel,
        updatedAt: sentinel,
      ).toMap()
        ..['createdAt'] = FieldValue.serverTimestamp()
        ..['updatedAt'] = FieldValue.serverTimestamp();

      if (isDefault) {
        // Query existing defaults before opening the batch.
        final siblings = await _queryDefaultSiblings(
            adminUserId, countryCode, currencyCode);
        final batch = _db.batch();
        for (final doc in siblings.docs) {
          batch.update(doc.reference, {
            'isDefault': false,
            'updatedAt': FieldValue.serverTimestamp(),
          });
        }
        batch.set(newRef, data);
        await batch.commit();
      } else {
        await newRef.set(data);
      }

      return newRef.id;
    } catch (_) {
      return null;
    }
  }

  /// Updates mutable fields (`label`, `msisdn`, `accountName`) of an existing
  /// payout account.
  ///
  /// Immutable fields (`adminUserId`, `countryCode`, `currencyCode`,
  /// `providerId`, `accountType`, `createdAt`) are never touched.
  /// Returns `true` on success.
  static Future<bool> updatePayoutAccount({
    required String accountId,
    String? label,
    String? msisdn,
    String? accountName,
  }) async {
    try {
      final updates = <String, dynamic>{
        'updatedAt': FieldValue.serverTimestamp(),
      };
      if (label != null) updates['label'] = label;
      if (msisdn != null) updates['msisdn'] = msisdn;
      if (accountName != null) updates['accountName'] = accountName;

      await _db
          .collection(_payoutAccountsCollection)
          .doc(accountId)
          .update(updates);
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Enables or disables a payout account.
  ///
  /// Only the owning admin's accounts should be passed here; Firestore rules
  /// enforce ownership. Returns `true` on success.
  static Future<bool> setPayoutAccountActive(
      String accountId, bool isActive) async {
    try {
      await _db.collection(_payoutAccountsCollection).doc(accountId).update({
        'isActive': isActive,
        'updatedAt': FieldValue.serverTimestamp(),
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Sets [accountId] as the default for the
  /// ([adminUserId], [countryCode], [currencyCode]) tuple.
  ///
  /// Atomically — in a single Firestore batch:
  ///   1. Unsets `isDefault` on all current defaults for the same tuple
  ///      (excluding [accountId] itself).
  ///   2. Sets `isDefault: true` on [accountId].
  ///
  /// Returns `true` on success.
  static Future<bool> setDefaultPayoutAccount({
    required String accountId,
    required String adminUserId,
    required String countryCode,
    required String currencyCode,
  }) async {
    try {
      final siblings = await _queryDefaultSiblings(
          adminUserId, countryCode, currencyCode);
      final batch = _db.batch();

      for (final doc in siblings.docs) {
        if (doc.id == accountId) continue;
        batch.update(doc.reference, {
          'isDefault': false,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      }
      batch.update(
        _db.collection(_payoutAccountsCollection).doc(accountId),
        {'isDefault': true, 'updatedAt': FieldValue.serverTimestamp()},
      );

      await batch.commit();
      return true;
    } catch (_) {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // PAYOUT REQUESTS (Sprint 4B — backend callables + read stream)
  // ---------------------------------------------------------------------------

  static final FirebaseFunctions _functions =
      FirebaseFunctions.instanceFor(region: 'europe-west1');

  static const String _payoutRequestsCollection = 'platform_payout_requests';

  /// Real-time stream of payout requests owned by [adminUserId],
  /// ordered by [requestedAt] descending (most recent first).
  static Stream<List<PayoutRequest>> getPayoutRequests(String adminUserId) {
    return _db
        .collection(_payoutRequestsCollection)
        .where('adminUserId', isEqualTo: adminUserId)
        .orderBy('requestedAt', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => PayoutRequest.fromFirestore(doc))
            .toList());
  }

  /// Calls the `requestPlatformPayout` backend callable.
  ///
  /// Returns the new request ID on success, or throws an exception with
  /// the backend error message on failure.
  static Future<String> requestPayout({
    required String treasuryId,
    required String payoutAccountId,
    required double amount,
    String note = '',
  }) async {
    final callable = _functions.httpsCallable('requestPlatformPayout');
    final result = await callable.call<Map<String, dynamic>>({
      'treasuryId': treasuryId,
      'payoutAccountId': payoutAccountId,
      'amount': amount,
      'note': note,
    });
    return result.data['requestId'] as String;
  }

  /// Calls the `resolvePlatformPayout` backend callable.
  ///
  /// [resolution] must be `'completed'` or `'failed'`.
  /// [failureReason] is required when resolution is `'failed'`.
  /// [externalReference] is optional (e.g. mobile money transaction ID).
  static Future<void> resolvePayout({
    required String requestId,
    required String resolution,
    String? externalReference,
    String? failureReason,
  }) async {
    final callable = _functions.httpsCallable('resolvePlatformPayout');
    await callable.call<Map<String, dynamic>>({
      'requestId': requestId,
      'resolution': resolution,
      if (externalReference != null) 'externalReference': externalReference,
      if (failureReason != null) 'failureReason': failureReason,
    });
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  /// Queries all payout accounts for the given tuple that currently have
  /// `isDefault == true`. Used to build atomic batch writes.
  static Future<QuerySnapshot<Map<String, dynamic>>> _queryDefaultSiblings(
    String adminUserId,
    String countryCode,
    String currencyCode,
  ) {
    return _db
        .collection(_payoutAccountsCollection)
        .where('adminUserId', isEqualTo: adminUserId)
        .where('countryCode', isEqualTo: countryCode)
        .where('currencyCode', isEqualTo: currencyCode)
        .where('isDefault', isEqualTo: true)
        .get();
  }
}
