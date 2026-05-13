// Sprint 2B.2a — Pharmacy License Status section.
//
// Renders a status badge derived from `pharmacies/{uid}.licenseStatus`
// and exposes a "Correct license" button when the status is `rejected`
// or `correction_needed`. The button opens [LicenseCorrectionDialog]
// which routes the submission through `submitPharmacyLicense`
// (Sprint 2a) in production, or a stub callback in tests.
//
// This widget owns no Firebase dependency : it consumes the raw
// pharmacy data map that the parent already loads, and forwards the
// submission to a callback. That keeps it directly testable from
// widget tests.
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import 'license_correction_dialog.dart';

/// Known canonical license statuses (Sprint 2a / 2A.1). Anything else
/// (including `null`) renders as "pending" with a logged warning.
const knownLicenseStatuses = <String>{
  'not_required',
  'pending_verification',
  'verified',
  'rejected',
  'correction_needed',
  'grace_period',
  'expired',
};

class PharmacyLicenseStatusSection extends StatelessWidget {
  /// Raw `pharmacies/{uid}` data. Only the license fields are read.
  final Map<String, dynamic>? pharmacyData;

  /// Submitter for the correction dialog. Production : a closure that
  /// invokes the `submitPharmacyLicense` callable. Tests : a stub.
  final SubmitLicenseCorrection onSubmitCorrection;

  const PharmacyLicenseStatusSection({
    super.key,
    required this.pharmacyData,
    required this.onSubmitCorrection,
  });

  String get _rawStatus {
    final raw = pharmacyData?['licenseStatus'];
    return raw is String ? raw : '';
  }

  String get _normalizedStatus {
    final raw = _rawStatus;
    if (knownLicenseStatuses.contains(raw)) return raw;
    if (raw.isNotEmpty) {
      debugPrint(
        '[PharmacyLicenseStatusSection] Unknown licenseStatus '
        '"$raw" — falling back to pending.',
      );
    }
    return 'pending';
  }

  String? get _rejectionReason {
    final raw = pharmacyData?['licenseRejectionReason'];
    if (raw is String && raw.trim().isNotEmpty) return raw;
    return null;
  }

  String? get _existingLicenseNumber {
    final raw = pharmacyData?['licenseNumber'];
    if (raw is String && raw.trim().isNotEmpty) return raw;
    return null;
  }

  bool get _canCorrect {
    final s = _normalizedStatus;
    return s == 'rejected' || s == 'correction_needed';
  }

  ({Color background, Color foreground, String label}) _badgeStyle(
      String status) {
    switch (status) {
      case 'verified':
        return (
          background: Colors.green.shade100,
          foreground: Colors.green.shade900,
          label: 'Verified',
        );
      case 'not_required':
        return (
          background: Colors.grey.shade200,
          foreground: Colors.grey.shade800,
          label: 'Not required',
        );
      case 'pending_verification':
        return (
          background: Colors.yellow.shade100,
          foreground: Colors.yellow.shade900,
          label: 'Pending verification',
        );
      case 'rejected':
        return (
          background: Colors.red.shade100,
          foreground: Colors.red.shade900,
          label: 'Rejected',
        );
      case 'correction_needed':
        return (
          background: Colors.orange.shade100,
          foreground: Colors.orange.shade900,
          label: 'Correction needed',
        );
      case 'grace_period':
        return (
          background: Colors.blue.shade100,
          foreground: Colors.blue.shade900,
          label: 'Grace period',
        );
      case 'expired':
        return (
          background: Colors.red.shade100,
          foreground: Colors.red.shade900,
          label: 'Expired',
        );
      default:
        return (
          background: Colors.grey.shade200,
          foreground: Colors.grey.shade800,
          label: 'Pending',
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = _normalizedStatus;
    final style = _badgeStyle(status);
    final reason = _rejectionReason;

    return Container(
      key: const Key('license_status_section'),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'License Status',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Container(
                key: const Key('license_status_badge'),
                padding: const EdgeInsets.symmetric(
                    horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: style.background,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  style.label,
                  style: TextStyle(
                    color: style.foreground,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          if (reason != null) ...[
            const SizedBox(height: 12),
            Container(
              key: const Key('license_rejection_reason'),
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(4),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline,
                      size: 16, color: Colors.red.shade900),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      reason,
                      style: TextStyle(color: Colors.red.shade900),
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (_canCorrect) ...[
            const SizedBox(height: 12),
            ElevatedButton.icon(
              key: const Key('license_correct_button'),
              icon: const Icon(Icons.edit_note, size: 18),
              label: const Text('Correct license'),
              onPressed: () => _openCorrectionDialog(context),
            ),
          ],
        ],
      ),
    );
  }

  void _openCorrectionDialog(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (_) => LicenseCorrectionDialog(
        onSubmit: onSubmitCorrection,
        initialLicenseNumber: _existingLicenseNumber,
      ),
    );
  }
}

/// Production helper : a [SubmitLicenseCorrection] that calls the
/// `submitPharmacyLicense` callable (Sprint 2a). Lives here to keep
/// the dialog reusable with any submitter (e.g. a different callable
/// in a future sprint).
SubmitLicenseCorrection createSubmitPharmacyLicenseHandler(
  Future<dynamic> Function({
    required String licenseNumber,
    String? licenseDocumentUrl,
    Timestamp? licenseExpiryDate,
  }) callable,
) {
  return ({
    required String licenseNumber,
    String? licenseDocumentUrl,
    DateTime? licenseExpiryDate,
  }) async {
    try {
      await callable(
        licenseNumber: licenseNumber,
        licenseDocumentUrl: licenseDocumentUrl,
        licenseExpiryDate: licenseExpiryDate == null
            ? null
            : Timestamp.fromDate(licenseExpiryDate),
      );
      return null;
    } catch (e) {
      return e.toString();
    }
  };
}
