// Sprint 2B.1 — Widget tests for `PharmacyLicenseReviewScreen`.
//
// The screen accepts an optional `LicenseReviewDataSource` so we can
// inject a stub that emits a controlled list of records and captures
// the action callable invocations. This avoids touching real Firebase
// while still exercising the production widget tree (cards, dialogs,
// reason validation).
import 'dart:async';

import 'package:admin_panel/screens/pharmacy_license_review_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class _MockAction extends Mock {
  Future<void> call({
    required String pharmacyId,
    required String action,
    String? reason,
  });
}

class _FakeDataSource implements LicenseReviewDataSource {
  final StreamController<List<LicenseReviewRecord>> _ctrl =
      StreamController.broadcast();
  final _MockAction action;

  _FakeDataSource(this.action);

  void emit(List<LicenseReviewRecord> records) => _ctrl.add(records);

  @override
  Stream<List<LicenseReviewRecord>> watch({
    required bool isSuperAdmin,
    required List<String> countryScopes,
  }) =>
      _ctrl.stream;

  @override
  Future<void> performAction({
    required String pharmacyId,
    required String action,
    String? reason,
  }) =>
      this.action.call(
            pharmacyId: pharmacyId,
            action: action,
            reason: reason,
          );
}

Future<void> _pumpScreen(
  WidgetTester tester, {
  required _FakeDataSource ds,
  bool isSuperAdmin = false,
  List<String> countryScopes = const ['CM'],
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: PharmacyLicenseReviewScreen(
        countryScopes: countryScopes,
        isSuperAdmin: isSuperAdmin,
        dataSource: ds,
      ),
    ),
  );
  // First frame shows the loading spinner ; stream emit happens in tests.
}

void main() {
  setUpAll(() {
    registerFallbackValue('');
  });

  group('PharmacyLicenseReviewScreen', () {
    testWidgets(
        'renders one card per pending / correction_needed record',
        (tester) async {
      final action = _MockAction();
      final ds = _FakeDataSource(action);

      await _pumpScreen(tester, ds: ds);

      ds.emit(const [
        LicenseReviewRecord(
          pharmacyId: 'pharm1',
          pharmacyName: 'Pharmacie Alpha',
          countryCode: 'CM',
          licenseNumber: 'AL-1234',
          licenseStatus: 'pending_verification',
        ),
        LicenseReviewRecord(
          pharmacyId: 'pharm2',
          pharmacyName: 'Pharmacie Beta',
          countryCode: 'CM',
          licenseNumber: 'BE-5678',
          licenseStatus: 'correction_needed',
          licenseRejectionReason: 'Document illisible',
        ),
      ]);
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('pharmacy_card_pharm1')), findsOneWidget);
      expect(find.byKey(const Key('pharmacy_card_pharm2')), findsOneWidget);
      expect(find.text('Pharmacie Alpha'), findsOneWidget);
      expect(find.text('Pharmacie Beta'), findsOneWidget);
      expect(find.text('Document illisible'), findsOneWidget);
    });

    testWidgets('empty state when no records', (tester) async {
      final action = _MockAction();
      final ds = _FakeDataSource(action);

      await _pumpScreen(tester, ds: ds);
      ds.emit(const []);
      await tester.pumpAndSettle();

      expect(find.text('No licenses awaiting review.'), findsOneWidget);
    });

    testWidgets('Approve tap calls performAction with action verify',
        (tester) async {
      final action = _MockAction();
      when(() => action.call(
            pharmacyId: any(named: 'pharmacyId'),
            action: any(named: 'action'),
            reason: any(named: 'reason'),
          )).thenAnswer((_) async {});
      final ds = _FakeDataSource(action);

      await _pumpScreen(tester, ds: ds);
      ds.emit(const [
        LicenseReviewRecord(
          pharmacyId: 'pharm1',
          pharmacyName: 'Pharmacie Alpha',
          countryCode: 'CM',
          licenseNumber: 'AL-1234',
          licenseStatus: 'pending_verification',
        ),
      ]);
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('approve_pharm1')));
      await tester.pumpAndSettle();

      verify(() => action.call(
            pharmacyId: 'pharm1',
            action: 'verify',
            reason: null,
          )).called(1);
    });

    testWidgets(
        'Reject with empty reason shows validation error and does NOT call action',
        (tester) async {
      final action = _MockAction();
      final ds = _FakeDataSource(action);

      await _pumpScreen(tester, ds: ds);
      ds.emit(const [
        LicenseReviewRecord(
          pharmacyId: 'pharm1',
          pharmacyName: 'Pharmacie Alpha',
          countryCode: 'CM',
          licenseNumber: 'AL-1234',
          licenseStatus: 'pending_verification',
        ),
      ]);
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('reject_pharm1')));
      await tester.pumpAndSettle();

      // Submit without typing a reason.
      await tester.tap(find.byKey(const Key('reason_submit')));
      await tester.pumpAndSettle();

      expect(find.text('Reason cannot be empty.'), findsOneWidget);

      verifyNever(() => action.call(
            pharmacyId: any(named: 'pharmacyId'),
            action: any(named: 'action'),
            reason: any(named: 'reason'),
          ));
    });

    testWidgets(
        'Reject with non-empty reason calls performAction with action reject + reason',
        (tester) async {
      final action = _MockAction();
      when(() => action.call(
            pharmacyId: any(named: 'pharmacyId'),
            action: any(named: 'action'),
            reason: any(named: 'reason'),
          )).thenAnswer((_) async {});
      final ds = _FakeDataSource(action);

      await _pumpScreen(tester, ds: ds);
      ds.emit(const [
        LicenseReviewRecord(
          pharmacyId: 'pharm1',
          pharmacyName: 'Pharmacie Alpha',
          countryCode: 'CM',
          licenseNumber: 'AL-1234',
          licenseStatus: 'pending_verification',
        ),
      ]);
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('reject_pharm1')));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('reason_field')),
        'License number unreadable',
      );
      await tester.tap(find.byKey(const Key('reason_submit')));
      await tester.pumpAndSettle();

      verify(() => action.call(
            pharmacyId: 'pharm1',
            action: 'reject',
            reason: 'License number unreadable',
          )).called(1);
    });

    testWidgets(
        'Request correction with reason calls performAction with action correction_needed',
        (tester) async {
      final action = _MockAction();
      when(() => action.call(
            pharmacyId: any(named: 'pharmacyId'),
            action: any(named: 'action'),
            reason: any(named: 'reason'),
          )).thenAnswer((_) async {});
      final ds = _FakeDataSource(action);

      await _pumpScreen(tester, ds: ds);
      ds.emit(const [
        LicenseReviewRecord(
          pharmacyId: 'pharm1',
          pharmacyName: 'Pharmacie Alpha',
          countryCode: 'CM',
          licenseNumber: 'AL-1234',
          licenseStatus: 'pending_verification',
        ),
      ]);
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('correction_pharm1')));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('reason_field')),
        'Please re-upload a clearer scan',
      );
      await tester.tap(find.byKey(const Key('reason_submit')));
      await tester.pumpAndSettle();

      verify(() => action.call(
            pharmacyId: 'pharm1',
            action: 'correction_needed',
            reason: 'Please re-upload a clearer scan',
          )).called(1);
    });

    testWidgets('scope header reflects super_admin vs country-scoped admin',
        (tester) async {
      final action = _MockAction();
      final ds = _FakeDataSource(action);

      await _pumpScreen(
        tester,
        ds: ds,
        isSuperAdmin: true,
        countryScopes: const [],
      );
      ds.emit(const []);
      await tester.pumpAndSettle();
      expect(find.text('All countries (super_admin)'), findsOneWidget);
    });
  });
}
