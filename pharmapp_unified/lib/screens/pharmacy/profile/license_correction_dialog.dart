// Sprint 2B.2a — License correction dialog.
//
// Triggered from the pharmacy profile when `licenseStatus` is `rejected`
// or `correction_needed`. Collects a new `licenseNumber` (mandatory),
// plus an optional `licenseDocumentUrl` and `licenseExpiryDate`, then
// routes them through the [onSubmit] callback. Production wires
// [onSubmit] to the `submitPharmacyLicense` callable (Sprint 2a) ; tests
// wire it to a stub so the form logic can be exercised without
// touching Firebase.
import 'package:flutter/material.dart';

/// Callback signature used by [LicenseCorrectionDialog]. Returns `null`
/// on success, or a user-facing error string on failure. The dialog
/// stays open on error so the user can retry without losing input.
typedef SubmitLicenseCorrection = Future<String?> Function({
  required String licenseNumber,
  String? licenseDocumentUrl,
  DateTime? licenseExpiryDate,
});

class LicenseCorrectionDialog extends StatefulWidget {
  final SubmitLicenseCorrection onSubmit;

  /// Optional initial value for the license number — used to pre-fill
  /// the field with the previously rejected value so the user can edit
  /// rather than retype.
  final String? initialLicenseNumber;

  const LicenseCorrectionDialog({
    super.key,
    required this.onSubmit,
    this.initialLicenseNumber,
  });

  @override
  State<LicenseCorrectionDialog> createState() =>
      _LicenseCorrectionDialogState();
}

class _LicenseCorrectionDialogState extends State<LicenseCorrectionDialog> {
  late final TextEditingController _numberCtl;
  final _docUrlCtl = TextEditingController();
  final _expiryCtl = TextEditingController();

  bool _submitting = false;
  String? _numberError;
  String? _expiryError;
  String? _backendError;

  @override
  void initState() {
    super.initState();
    _numberCtl =
        TextEditingController(text: widget.initialLicenseNumber ?? '');
  }

  @override
  void dispose() {
    _numberCtl.dispose();
    _docUrlCtl.dispose();
    _expiryCtl.dispose();
    super.dispose();
  }

  DateTime? _parseExpiry(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return null;
    // Accept yyyy-MM-dd. Anything else surfaces as a validation error.
    try {
      return DateTime.parse(trimmed);
    } catch (_) {
      return null;
    }
  }

  Future<void> _handleSubmit() async {
    setState(() {
      _numberError = null;
      _expiryError = null;
      _backendError = null;
    });
    final number = _numberCtl.text.trim();
    if (number.isEmpty) {
      setState(() => _numberError = 'License number is required.');
      return;
    }

    DateTime? expiry;
    if (_expiryCtl.text.trim().isNotEmpty) {
      expiry = _parseExpiry(_expiryCtl.text);
      if (expiry == null) {
        setState(() => _expiryError = 'Use the format yyyy-MM-dd.');
        return;
      }
    }

    final docUrl = _docUrlCtl.text.trim();

    setState(() => _submitting = true);
    final err = await widget.onSubmit(
      licenseNumber: number,
      licenseDocumentUrl: docUrl.isEmpty ? null : docUrl,
      licenseExpiryDate: expiry,
    );
    if (!mounted) return;
    if (err == null) {
      Navigator.of(context).pop();
    } else {
      setState(() {
        _submitting = false;
        _backendError = err;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Correct License'),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                key: const Key('license_correction_number_field'),
                controller: _numberCtl,
                autofocus: true,
                decoration: InputDecoration(
                  labelText: 'License number',
                  errorText: _numberError,
                  border: const OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('license_correction_doc_url_field'),
                controller: _docUrlCtl,
                decoration: const InputDecoration(
                  labelText: 'Document URL (optional)',
                  helperText:
                      'Paste a link to a PDF or image of your license.',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('license_correction_expiry_field'),
                controller: _expiryCtl,
                decoration: InputDecoration(
                  labelText: 'Expiry date (optional, yyyy-MM-dd)',
                  errorText: _expiryError,
                  border: const OutlineInputBorder(),
                ),
              ),
              if (_backendError != null) ...[
                const SizedBox(height: 12),
                Container(
                  key: const Key('license_correction_backend_error'),
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    _backendError!,
                    style: TextStyle(color: Colors.red.shade900),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          key: const Key('license_correction_cancel'),
          onPressed: _submitting ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          key: const Key('license_correction_submit'),
          onPressed: _submitting ? null : _handleSubmit,
          child: Text(_submitting ? 'Submitting…' : 'Submit'),
        ),
      ],
    );
  }
}
