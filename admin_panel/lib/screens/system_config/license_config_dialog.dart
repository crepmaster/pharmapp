// Sprint 2B.1 — License configuration dialog body.
//
// Extracted from `countries_tab.dart` so widget tests can drive the
// validation rules (regex, grace period) and Save callback without
// depending on Firebase or the static `SystemConfigService`. The
// dialog body accepts an `onSubmit` callback that receives the seven
// license fields and returns `null` on success or a user-facing error
// string on failure.
//
// `countries_tab.dart` wraps this body in an `AlertDialog` and passes
// `SystemConfigService.setCountryLicenseConfigViaCallable` as the
// callback so the production path keeps going through the backend
// callable (no direct Firestore write on license fields).
import 'package:flutter/material.dart';

import '../../models/country_option.dart';

typedef LicenseConfigSubmit = Future<String?> Function({
  required String countryCode,
  bool? licenseRequired,
  String? licenseLabel,
  String? licenseHelpText,
  bool? licenseVerificationRequired,
  String? licenseFormatRegex,
  bool? licenseDocumentRequired,
  int? licenseGracePeriodDays,
});

/// Dialog body shown when an admin taps the license button on a country
/// tile. Validates regex + grace period locally and routes Save through
/// [onSubmit] (which is the backend callable in production, a stub in
/// tests).
class LicenseConfigDialog extends StatefulWidget {
  final CountryOption country;
  final LicenseConfigSubmit onSubmit;
  final VoidCallback? onSaved;

  const LicenseConfigDialog({
    super.key,
    required this.country,
    required this.onSubmit,
    this.onSaved,
  });

  @override
  State<LicenseConfigDialog> createState() => _LicenseConfigDialogState();
}

class _LicenseConfigDialogState extends State<LicenseConfigDialog> {
  late final TextEditingController _labelCtl;
  late final TextEditingController _helpCtl;
  late final TextEditingController _regexCtl;
  late final TextEditingController _graceCtl;

  late bool _licenseRequired;
  late bool _verificationRequired;
  late bool _documentRequired;

  String? _regexError;
  String? _graceError;
  bool _saving = false;
  String? _backendError;

  @override
  void initState() {
    super.initState();
    _labelCtl = TextEditingController(text: widget.country.licenseLabel ?? '');
    _helpCtl =
        TextEditingController(text: widget.country.licenseHelpText ?? '');
    _regexCtl =
        TextEditingController(text: widget.country.licenseFormatRegex ?? '');
    _graceCtl = TextEditingController(
        text: widget.country.licenseGracePeriodDays.toString());
    _licenseRequired = widget.country.licenseRequired;
    _verificationRequired = widget.country.licenseVerificationRequired;
    _documentRequired = widget.country.licenseDocumentRequired;
    _revalidate();
  }

  @override
  void dispose() {
    _labelCtl.dispose();
    _helpCtl.dispose();
    _regexCtl.dispose();
    _graceCtl.dispose();
    super.dispose();
  }

  void _revalidate() {
    final raw = _regexCtl.text;
    if (raw.isEmpty) {
      _regexError = null;
    } else {
      try {
        RegExp(raw);
        _regexError = null;
      } catch (_) {
        _regexError = 'Not a valid regular expression';
      }
    }
    final parsed = int.tryParse(_graceCtl.text.trim());
    if (parsed == null || parsed < 1 || parsed > 365) {
      _graceError = 'Must be an integer between 1 and 365';
    } else {
      _graceError = null;
    }
  }

  bool get _canSave =>
      _regexError == null && _graceError == null && !_saving;

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _backendError = null;
    });
    final err = await widget.onSubmit(
      countryCode: widget.country.code,
      licenseRequired: _licenseRequired,
      licenseLabel: _labelCtl.text.trim(),
      licenseHelpText: _helpCtl.text.trim(),
      licenseVerificationRequired: _verificationRequired,
      licenseFormatRegex: _regexCtl.text.trim(),
      licenseDocumentRequired: _documentRequired,
      licenseGracePeriodDays: int.parse(_graceCtl.text.trim()),
    );
    if (!mounted) return;
    if (err == null) {
      if (widget.onSaved != null) widget.onSaved!();
      Navigator.of(context).pop();
    } else {
      setState(() {
        _saving = false;
        _backendError = err;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('License Config — ${widget.country.code}'),
      content: SizedBox(
        width: 480,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SwitchListTile(
                key: const Key('license_required_switch'),
                title: const Text('License required for this country'),
                subtitle: const Text(
                    'When ON, pharmacies registering for this country '
                    'must provide a license number; the backend gate '
                    'fails closed otherwise.'),
                value: _licenseRequired,
                onChanged: (v) => setState(() => _licenseRequired = v),
              ),
              const Divider(),
              TextField(
                key: const Key('license_label_field'),
                controller: _labelCtl,
                decoration: const InputDecoration(
                  labelText: 'License field label (UI text)',
                  helperText: 'e.g. "Pharmacy License Number"',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('license_help_field'),
                controller: _helpCtl,
                decoration: const InputDecoration(
                  labelText: 'License help text (UI hint)',
                  helperText: 'Shown below the field at registration',
                  border: OutlineInputBorder(),
                ),
                minLines: 2,
                maxLines: 4,
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('license_regex_field'),
                controller: _regexCtl,
                decoration: InputDecoration(
                  labelText: 'License format regex (optional)',
                  helperText: 'Empty = accept any non-empty value',
                  errorText: _regexError,
                  border: const OutlineInputBorder(),
                ),
                onChanged: (_) => setState(_revalidate),
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('license_grace_field'),
                controller: _graceCtl,
                decoration: InputDecoration(
                  labelText: 'Grace period (days)',
                  helperText:
                      'When licenseRequired flips ON, existing pharmacies '
                      'get this window to submit a license before being '
                      'blocked from the marketplace.',
                  errorText: _graceError,
                  border: const OutlineInputBorder(),
                ),
                keyboardType: TextInputType.number,
                onChanged: (_) => setState(_revalidate),
              ),
              const SizedBox(height: 12),
              SwitchListTile(
                key: const Key('verification_required_switch'),
                title: const Text('Verification required'),
                subtitle: const Text(
                    'When ON, a license needs admin verify before the '
                    'pharmacy can act on the marketplace.'),
                value: _verificationRequired,
                onChanged: (v) =>
                    setState(() => _verificationRequired = v),
              ),
              SwitchListTile(
                key: const Key('document_required_switch'),
                title: const Text('Document required'),
                subtitle: const Text(
                    'When ON, a license document URL must be supplied '
                    'at registration (Sprint 2B.2 wires this UI).'),
                value: _documentRequired,
                onChanged: (v) => setState(() => _documentRequired = v),
              ),
              if (_backendError != null) ...[
                const SizedBox(height: 12),
                Container(
                  key: const Key('license_backend_error'),
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
          key: const Key('license_cancel'),
          onPressed: _saving ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          key: const Key('license_save'),
          onPressed: _canSave ? _save : null,
          child: Text(_saving ? 'Saving…' : 'Save license config'),
        ),
      ],
    );
  }
}
