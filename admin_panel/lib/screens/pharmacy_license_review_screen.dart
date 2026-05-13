// Sprint 2B.1 — Pharmacy License Review screen.
//
// Lists pharmacies whose `licenseStatus` is `pending_verification` or
// `correction_needed`, filtered by the admin's `countryScopes` (or all
// countries if `isSuperAdmin == true`). Each card surfaces the
// metadata the architect needs to decide (pharmacy name, country,
// license number, document URL, expiry, status) and exposes three
// actions wired to the existing `adminVerifyPharmacyLicense` callable
// from Sprint 2a :
//
//   - Approve            -> action `verify` (no reason required).
//   - Reject             -> action `reject` (reason mandatory, captured in a
//                          follow-up dialog).
//   - Request correction -> action `correction_needed` (reason mandatory).
//
// No direct Firestore mutation on license fields. The screen reads
// the pharmacies collection (admin already has read access per the
// rules in place since Sprint 2a) and writes only via the callable.
//
// Test seam: the screen accepts an optional `dataSource` parameter so
// widget tests can supply a fake without touching real Firebase. In
// production we always use `_FirebaseLicenseReviewDataSource`.
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// One row to display in the review list.
///
/// Built either from a Firestore `QueryDocumentSnapshot` (production) or
/// from a hand-rolled map (tests). Decouples the screen from the Firebase
/// SDK types so the widget tree never depends on `cloud_firestore` for
/// rendering.
class LicenseReviewRecord {
  final String pharmacyId;
  final String pharmacyName;
  final String countryCode;
  final String licenseNumber;
  final String? licenseDocumentUrl;
  final String licenseStatus;
  final String? licenseRejectionReason;
  final String? licenseExpiryDateIso; // already formatted yyyy-MM-dd

  const LicenseReviewRecord({
    required this.pharmacyId,
    required this.pharmacyName,
    required this.countryCode,
    required this.licenseNumber,
    required this.licenseStatus,
    this.licenseDocumentUrl,
    this.licenseRejectionReason,
    this.licenseExpiryDateIso,
  });

  factory LicenseReviewRecord.fromFirestore(
      QueryDocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data();
    final expiry = data['licenseExpiryDate'];
    return LicenseReviewRecord(
      pharmacyId: doc.id,
      pharmacyName: (data['pharmacyName'] as String?) ?? '(no name)',
      countryCode: (data['countryCode'] as String?) ?? '??',
      licenseNumber:
          (data['licenseNumber'] as String?) ?? '(not provided)',
      licenseDocumentUrl: data['licenseDocumentUrl'] as String?,
      licenseStatus: (data['licenseStatus'] as String?) ?? 'unknown',
      licenseRejectionReason: data['licenseRejectionReason'] as String?,
      licenseExpiryDateIso: expiry is Timestamp
          ? expiry.toDate().toIso8601String().split('T').first
          : null,
    );
  }
}

/// Pure description of the Firestore filter the license-review screen
/// applies to the `pharmacies` collection. Exposed so unit tests can
/// assert the scope rules (super_admin → no country filter ; admin
/// in-scope → only declared scopes ; admin no-scope → sentinel that
/// yields zero docs ; > 10 scopes → capped to 10 per the `whereIn`
/// limit) without standing up a Firestore emulator.
class LicenseReviewQuerySpec {
  /// Always `[pending_verification, correction_needed]`.
  final List<String> statuses;

  /// `null` means "no country filter" (super_admin).
  /// Empty list is not possible — callers either pass `null` or a
  /// non-empty list. A scope-less admin is materialised by the special
  /// sentinel `['__no_scope__']` so the query yields zero docs without
  /// requiring caller branches.
  final List<String>? countryScopes;

  const LicenseReviewQuerySpec({
    required this.statuses,
    required this.countryScopes,
  });
}

/// Pure helper for [_FirebaseLicenseReviewDataSource._buildQuery]. The
/// helper has no Firebase dependency so the scope rules are testable
/// in isolation : the widget test on the screen still proves the
/// end-to-end wiring (params → datasource → cards), but the rules
/// themselves are validated here without any UI noise.
LicenseReviewQuerySpec buildLicenseReviewQuerySpec({
  required bool isSuperAdmin,
  required List<String> countryScopes,
}) {
  const statuses = ['pending_verification', 'correction_needed'];
  if (isSuperAdmin) {
    return const LicenseReviewQuerySpec(
      statuses: statuses,
      countryScopes: null,
    );
  }
  if (countryScopes.isEmpty) {
    return const LicenseReviewQuerySpec(
      statuses: statuses,
      countryScopes: ['__no_scope__'],
    );
  }
  // Firestore `whereIn` caps at 10. Admins with > 10 country scopes
  // are unrealistic for this product ; cap defensively.
  return LicenseReviewQuerySpec(
    statuses: statuses,
    countryScopes: countryScopes.take(10).toList(),
  );
}

/// Abstract data source for license reviews.
///
/// Production: [_FirebaseLicenseReviewDataSource] (stream from Firestore +
/// invoke `adminVerifyPharmacyLicense`).
/// Tests: any stub that exposes a controlled stream and records action
/// invocations.
abstract class LicenseReviewDataSource {
  Stream<List<LicenseReviewRecord>> watch({
    required bool isSuperAdmin,
    required List<String> countryScopes,
  });

  /// Throws `FirebaseFunctionsException` on backend failure so the screen
  /// can surface a SnackBar with the message.
  Future<void> performAction({
    required String pharmacyId,
    required String action, // 'verify' | 'reject' | 'correction_needed'
    String? reason,
  });
}

class _FirebaseLicenseReviewDataSource implements LicenseReviewDataSource {
  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  _FirebaseLicenseReviewDataSource()
      : _firestore = FirebaseFirestore.instance,
        _functions = FirebaseFunctions.instanceFor(region: 'europe-west1');

  Query<Map<String, dynamic>> _buildQuery({
    required bool isSuperAdmin,
    required List<String> countryScopes,
  }) {
    final spec = buildLicenseReviewQuerySpec(
      isSuperAdmin: isSuperAdmin,
      countryScopes: countryScopes,
    );
    Query<Map<String, dynamic>> q = _firestore
        .collection('pharmacies')
        .where('licenseStatus', whereIn: spec.statuses);
    if (spec.countryScopes != null) {
      q = q.where('countryCode', whereIn: spec.countryScopes);
    }
    return q;
  }

  @override
  Stream<List<LicenseReviewRecord>> watch({
    required bool isSuperAdmin,
    required List<String> countryScopes,
  }) {
    return _buildQuery(
      isSuperAdmin: isSuperAdmin,
      countryScopes: countryScopes,
    ).snapshots().map(
          (s) => s.docs.map(LicenseReviewRecord.fromFirestore).toList(),
        );
  }

  @override
  Future<void> performAction({
    required String pharmacyId,
    required String action,
    String? reason,
  }) async {
    await _functions.httpsCallable('adminVerifyPharmacyLicense').call({
      'pharmacyId': pharmacyId,
      'action': action,
      if (reason != null) 'reason': reason,
    });
  }
}

class PharmacyLicenseReviewScreen extends StatefulWidget {
  final List<String> countryScopes;
  final bool isSuperAdmin;

  /// Test seam. Production callers never pass this.
  final LicenseReviewDataSource? dataSource;

  const PharmacyLicenseReviewScreen({
    super.key,
    this.countryScopes = const [],
    this.isSuperAdmin = false,
    this.dataSource,
  });

  @override
  State<PharmacyLicenseReviewScreen> createState() =>
      _PharmacyLicenseReviewScreenState();
}

class _PharmacyLicenseReviewScreenState
    extends State<PharmacyLicenseReviewScreen> {
  late final LicenseReviewDataSource _ds;

  @override
  void initState() {
    super.initState();
    _ds = widget.dataSource ?? _FirebaseLicenseReviewDataSource();
  }

  Future<void> _act({
    required String pharmacyId,
    required String action,
    String? reason,
  }) async {
    try {
      await _ds.performAction(
        pharmacyId: pharmacyId,
        action: action,
        reason: reason,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('License $action applied.')),
      );
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: Colors.red.shade700,
          content: Text(e.message ?? 'Operation failed.'),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: Colors.red.shade700,
          content: Text('Unexpected error : $e'),
        ),
      );
    }
  }

  Future<String?> _promptForReason(
      BuildContext context, String headline) async {
    final reasonCtl = TextEditingController();
    String? validationError;
    return showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          title: Text(headline),
          content: SizedBox(
            width: 400,
            child: TextField(
              key: const Key('reason_field'),
              controller: reasonCtl,
              autofocus: true,
              minLines: 2,
              maxLines: 5,
              decoration: InputDecoration(
                labelText: 'Reason (required)',
                helperText: 'Will be visible to the pharmacy in their profile.',
                errorText: validationError,
                border: const OutlineInputBorder(),
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, null),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              key: const Key('reason_submit'),
              onPressed: () {
                final r = reasonCtl.text.trim();
                if (r.isEmpty) {
                  setSt(() => validationError = 'Reason cannot be empty.');
                  return;
                }
                Navigator.pop(ctx, r);
              },
              child: const Text('Submit'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Pharmacy License Reviews',
          style: GoogleFonts.inter(fontWeight: FontWeight.bold),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _scopeHeader(),
            const SizedBox(height: 12),
            Expanded(
              child: StreamBuilder<List<LicenseReviewRecord>>(
                stream: _ds.watch(
                  isSuperAdmin: widget.isSuperAdmin,
                  countryScopes: widget.countryScopes,
                ),
                builder: (ctx, snap) {
                  if (snap.hasError) {
                    return Center(
                      child: Text(
                        'Error loading pharmacies : ${snap.error}',
                        style: TextStyle(color: Colors.red.shade700),
                      ),
                    );
                  }
                  if (!snap.hasData) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  final records = snap.data!;
                  if (records.isEmpty) {
                    return Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.verified, size: 64, color: Colors.green.shade300),
                          const SizedBox(height: 12),
                          Text(
                            'No licenses awaiting review.',
                            style: GoogleFonts.inter(
                              fontSize: 16,
                              color: Colors.grey.shade700,
                            ),
                          ),
                        ],
                      ),
                    );
                  }
                  return ListView.separated(
                    itemCount: records.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) => _buildPharmacyCard(records[i]),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _scopeHeader() {
    final label = widget.isSuperAdmin
        ? 'All countries (super_admin)'
        : widget.countryScopes.isEmpty
            ? 'No country scope assigned'
            : 'Scope : ${widget.countryScopes.join(", ")}';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.blueGrey.shade50,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        children: [
          const Icon(Icons.filter_alt, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              label,
              style: GoogleFonts.inter(fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPharmacyCard(LicenseReviewRecord r) {
    return Card(
      key: Key('pharmacy_card_${r.pharmacyId}'),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    r.pharmacyName,
                    style: GoogleFonts.inter(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                Chip(
                  label: Text(r.licenseStatus),
                  backgroundColor: r.licenseStatus == 'correction_needed'
                      ? Colors.orange.shade100
                      : Colors.yellow.shade100,
                ),
              ],
            ),
            const SizedBox(height: 8),
            _kv('Country', r.countryCode),
            _kv('License number', r.licenseNumber),
            if (r.licenseDocumentUrl != null && r.licenseDocumentUrl!.isNotEmpty)
              _kv('Document URL', r.licenseDocumentUrl!),
            if (r.licenseExpiryDateIso != null)
              _kv('Expiry', r.licenseExpiryDateIso!),
            if (r.licenseRejectionReason != null &&
                r.licenseRejectionReason!.isNotEmpty)
              _kv('Previous rejection', r.licenseRejectionReason!),
            const SizedBox(height: 12),
            Row(
              children: [
                ElevatedButton.icon(
                  key: Key('approve_${r.pharmacyId}'),
                  onPressed: () =>
                      _act(pharmacyId: r.pharmacyId, action: 'verify'),
                  icon: const Icon(Icons.verified_user, size: 16),
                  label: const Text('Approve'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green.shade600,
                    foregroundColor: Colors.white,
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton.icon(
                  key: Key('reject_${r.pharmacyId}'),
                  onPressed: () async {
                    final reason = await _promptForReason(
                      context,
                      'Reject license — ${r.pharmacyName}',
                    );
                    if (reason == null) return;
                    await _act(
                      pharmacyId: r.pharmacyId,
                      action: 'reject',
                      reason: reason,
                    );
                  },
                  icon: const Icon(Icons.cancel, size: 16, color: Colors.red),
                  label: const Text('Reject', style: TextStyle(color: Colors.red)),
                ),
                const SizedBox(width: 8),
                OutlinedButton.icon(
                  key: Key('correction_${r.pharmacyId}'),
                  onPressed: () async {
                    final reason = await _promptForReason(
                      context,
                      'Request correction — ${r.pharmacyName}',
                    );
                    if (reason == null) return;
                    await _act(
                      pharmacyId: r.pharmacyId,
                      action: 'correction_needed',
                      reason: reason,
                    );
                  },
                  icon: const Icon(Icons.edit, size: 16),
                  label: const Text('Request correction'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _kv(String k, String v) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 140,
              child: Text(
                k,
                style: GoogleFonts.inter(
                  fontSize: 12,
                  color: Colors.grey.shade700,
                ),
              ),
            ),
            Expanded(
              child: SelectableText(
                v,
                style: GoogleFonts.inter(fontSize: 13),
              ),
            ),
          ],
        ),
      );
}
