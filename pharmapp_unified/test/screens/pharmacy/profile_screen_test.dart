// Sprint 2B.2a — widget tests for the pharmacy license status section
// and the license correction dialog. These two widgets are extracted
// from `profile_screen.dart` so the badge / correction flow can be
// exercised without spinning up Firebase Auth + Firestore in the test
// environment. The integration into `ProfileScreen` itself is wired
// in production (see `lib/screens/pharmacy/profile/profile_screen.dart`)
// and not exercised here because the surrounding screen depends on
// Firebase Auth at `initState`.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pharmapp_unified/screens/pharmacy/profile/license_correction_dialog.dart';
import 'package:pharmapp_unified/screens/pharmacy/profile/license_status_section.dart';

class _MockSubmit extends Mock {
  Future<String?> call({
    required String licenseNumber,
    String? licenseDocumentUrl,
    DateTime? licenseExpiryDate,
  });
}

class _FakeDateTime extends Fake implements DateTime {}

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  setUpAll(() {
    registerFallbackValue(_FakeDateTime());
  });

  group('PharmacyLicenseStatusSection — badge mapping', () {
    Future<String?> shouldNotBeCalled({
      required String licenseNumber,
      String? licenseDocumentUrl,
      DateTime? licenseExpiryDate,
    }) async {
      fail('onSubmitCorrection must not be invoked when no button is tapped.');
    }

    testWidgets('verified status → "Verified" badge', (tester) async {
      await tester.pumpWidget(_wrap(PharmacyLicenseStatusSection(
        pharmacyData: const {'licenseStatus': 'verified'},
        onSubmitCorrection: shouldNotBeCalled,
      )));
      expect(find.text('Verified'), findsOneWidget);
      expect(find.byKey(const Key('license_correct_button')), findsNothing);
    });

    testWidgets('pending_verification status → "Pending verification" badge',
        (tester) async {
      await tester.pumpWidget(_wrap(PharmacyLicenseStatusSection(
        pharmacyData: const {'licenseStatus': 'pending_verification'},
        onSubmitCorrection: shouldNotBeCalled,
      )));
      expect(find.text('Pending verification'), findsOneWidget);
      expect(find.byKey(const Key('license_correct_button')), findsNothing);
    });

    testWidgets('not_required status → "Not required" badge', (tester) async {
      await tester.pumpWidget(_wrap(PharmacyLicenseStatusSection(
        pharmacyData: const {'licenseStatus': 'not_required'},
        onSubmitCorrection: shouldNotBeCalled,
      )));
      expect(find.text('Not required'), findsOneWidget);
    });

    testWidgets('grace_period status → "Grace period" badge', (tester) async {
      await tester.pumpWidget(_wrap(PharmacyLicenseStatusSection(
        pharmacyData: const {'licenseStatus': 'grace_period'},
        onSubmitCorrection: shouldNotBeCalled,
      )));
      expect(find.text('Grace period'), findsOneWidget);
      expect(find.byKey(const Key('license_correct_button')), findsNothing);
    });

    testWidgets('expired status → "Expired" badge, no correction button',
        (tester) async {
      await tester.pumpWidget(_wrap(PharmacyLicenseStatusSection(
        pharmacyData: const {'licenseStatus': 'expired'},
        onSubmitCorrection: shouldNotBeCalled,
      )));
      expect(find.text('Expired'), findsOneWidget);
      expect(find.byKey(const Key('license_correct_button')), findsNothing);
    });

    testWidgets('unknown status → falls back to "Pending"', (tester) async {
      await tester.pumpWidget(_wrap(PharmacyLicenseStatusSection(
        pharmacyData: const {'licenseStatus': 'totally_made_up'},
        onSubmitCorrection: shouldNotBeCalled,
      )));
      expect(find.text('Pending'), findsOneWidget);
    });

    testWidgets('null pharmacyData → falls back to "Pending"', (tester) async {
      await tester.pumpWidget(_wrap(PharmacyLicenseStatusSection(
        pharmacyData: null,
        onSubmitCorrection: shouldNotBeCalled,
      )));
      expect(find.text('Pending'), findsOneWidget);
    });
  });

  group(
      'PharmacyLicenseStatusSection — rejected / correction_needed expose correction button',
      () {
    Future<String?> okSubmit({
      required String licenseNumber,
      String? licenseDocumentUrl,
      DateTime? licenseExpiryDate,
    }) async {
      return null;
    }

    testWidgets(
        'rejected status → rejection reason visible + Correct license button visible',
        (tester) async {
      await tester.pumpWidget(_wrap(PharmacyLicenseStatusSection(
        pharmacyData: const {
          'licenseStatus': 'rejected',
          'licenseRejectionReason': 'Number does not match registry.',
        },
        onSubmitCorrection: okSubmit,
      )));
      expect(find.text('Rejected'), findsOneWidget);
      expect(find.text('Number does not match registry.'), findsOneWidget);
      expect(find.byKey(const Key('license_correct_button')), findsOneWidget);
    });

    testWidgets(
        'correction_needed status → "Correction needed" badge + button visible',
        (tester) async {
      await tester.pumpWidget(_wrap(PharmacyLicenseStatusSection(
        pharmacyData: const {
          'licenseStatus': 'correction_needed',
          'licenseRejectionReason': 'Please re-upload a clearer scan.',
        },
        onSubmitCorrection: okSubmit,
      )));
      expect(find.text('Correction needed'), findsOneWidget);
      expect(find.text('Please re-upload a clearer scan.'), findsOneWidget);
      expect(find.byKey(const Key('license_correct_button')), findsOneWidget);
    });

    testWidgets(
        'tapping "Correct license" opens the correction dialog with the existing number prefilled',
        (tester) async {
      await tester.pumpWidget(_wrap(PharmacyLicenseStatusSection(
        pharmacyData: const {
          'licenseStatus': 'rejected',
          'licenseRejectionReason': 'Number does not match.',
          'licenseNumber': 'OLD-1234',
        },
        onSubmitCorrection: okSubmit,
      )));
      await tester.tap(find.byKey(const Key('license_correct_button')));
      await tester.pumpAndSettle();

      expect(
          find.byKey(const Key('license_correction_number_field')), findsOneWidget);
      expect(find.text('OLD-1234'), findsOneWidget);
    });
  });

  group('LicenseCorrectionDialog — validation + submission', () {
    Future<void> pumpDialog(
      WidgetTester tester, {
      required SubmitLicenseCorrection onSubmit,
      String? initial,
    }) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (ctx) => Center(
              child: ElevatedButton(
                key: const Key('open_dialog'),
                onPressed: () => showDialog<void>(
                  context: ctx,
                  builder: (_) => LicenseCorrectionDialog(
                    onSubmit: onSubmit,
                    initialLicenseNumber: initial,
                  ),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ));
      await tester.tap(find.byKey(const Key('open_dialog')));
      await tester.pumpAndSettle();
    }

    testWidgets('blank license number → submit blocked, callback NOT invoked',
        (tester) async {
      final submit = _MockSubmit();
      await pumpDialog(tester, onSubmit: submit.call);

      await tester.tap(find.byKey(const Key('license_correction_submit')));
      await tester.pumpAndSettle();

      expect(find.text('License number is required.'), findsOneWidget);
      verifyNever(() => submit.call(
            licenseNumber: any(named: 'licenseNumber'),
            licenseDocumentUrl: any(named: 'licenseDocumentUrl'),
            licenseExpiryDate: any(named: 'licenseExpiryDate'),
          ));
    });

    testWidgets('invalid expiry date format → blocked, callback NOT invoked',
        (tester) async {
      final submit = _MockSubmit();
      await pumpDialog(tester, onSubmit: submit.call);

      await tester.enterText(
          find.byKey(const Key('license_correction_number_field')), 'GH-0042');
      await tester.enterText(
          find.byKey(const Key('license_correction_expiry_field')),
          'not-a-date');
      await tester.tap(find.byKey(const Key('license_correction_submit')));
      await tester.pumpAndSettle();

      expect(find.textContaining('Use the format yyyy-MM-dd'), findsOneWidget);
      verifyNever(() => submit.call(
            licenseNumber: any(named: 'licenseNumber'),
            licenseDocumentUrl: any(named: 'licenseDocumentUrl'),
            licenseExpiryDate: any(named: 'licenseExpiryDate'),
          ));
    });

    testWidgets(
        'valid input → callback invoked with parsed expiry, dialog closes on success',
        (tester) async {
      final submit = _MockSubmit();
      when(() => submit.call(
            licenseNumber: any(named: 'licenseNumber'),
            licenseDocumentUrl: any(named: 'licenseDocumentUrl'),
            licenseExpiryDate: any(named: 'licenseExpiryDate'),
          )).thenAnswer((_) async => null);

      await pumpDialog(tester, onSubmit: submit.call);

      await tester.enterText(
          find.byKey(const Key('license_correction_number_field')), 'GH-0042');
      await tester.enterText(
          find.byKey(const Key('license_correction_doc_url_field')),
          'https://example.com/license.pdf');
      await tester.enterText(
          find.byKey(const Key('license_correction_expiry_field')),
          '2027-01-15');
      await tester.tap(find.byKey(const Key('license_correction_submit')));
      await tester.pumpAndSettle();

      verify(() => submit.call(
            licenseNumber: 'GH-0042',
            licenseDocumentUrl: 'https://example.com/license.pdf',
            licenseExpiryDate: DateTime.parse('2027-01-15'),
          )).called(1);
      // Dialog closed.
      expect(find.byKey(const Key('license_correction_number_field')),
          findsNothing);
    });

    testWidgets(
        'backend error → message visible, dialog stays open for retry',
        (tester) async {
      final submit = _MockSubmit();
      when(() => submit.call(
            licenseNumber: any(named: 'licenseNumber'),
            licenseDocumentUrl: any(named: 'licenseDocumentUrl'),
            licenseExpiryDate: any(named: 'licenseExpiryDate'),
          )).thenAnswer((_) async => 'invalid-license-format');

      await pumpDialog(tester, onSubmit: submit.call);

      await tester.enterText(
          find.byKey(const Key('license_correction_number_field')), 'BAD');
      await tester.tap(find.byKey(const Key('license_correction_submit')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('license_correction_backend_error')),
          findsOneWidget);
      expect(find.text('invalid-license-format'), findsOneWidget);
      // Dialog stays open.
      expect(find.byKey(const Key('license_correction_number_field')),
          findsOneWidget);
    });
  });
}
