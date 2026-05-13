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

  /// Recorded values for the most recent `watch(...)` call. Lets a
  /// test prove the screen forwards its `isSuperAdmin` / `countryScopes`
  /// to the data source (Sprint 2B.1 architect follow-up).
  bool? lastIsSuperAdmin;
  List<String>? lastCountryScopes;

  _FakeDataSource(this.action);

  void emit(List<LicenseReviewRecord> records) => _ctrl.add(records);

  @override
  Stream<List<LicenseReviewRecord>> watch({
    required bool isSuperAdmin,
    required List<String> countryScopes,
  }) {
    lastIsSuperAdmin = isSuperAdmin;
    lastCountryScopes = List<String>.from(countryScopes);
    return _ctrl.stream;
  }

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

/// Data source that actually applies the production scope/status
/// filter to a fixed universe of records. Used for the architect
/// follow-up test that proves CM-scoped admin sees CM pending +
/// CM correction_needed, but NOT GH records nor CM rejected.
class _FilteringFakeDataSource implements LicenseReviewDataSource {
  final List<LicenseReviewRecord> universe;
  final _MockAction action;

  _FilteringFakeDataSource(this.universe, this.action);

  @override
  Stream<List<LicenseReviewRecord>> watch({
    required bool isSuperAdmin,
    required List<String> countryScopes,
  }) {
    final spec = buildLicenseReviewQuerySpec(
      isSuperAdmin: isSuperAdmin,
      countryScopes: countryScopes,
    );
    final filtered = universe.where((r) {
      if (!spec.statuses.contains(r.licenseStatus)) return false;
      if (spec.countryScopes != null &&
          !spec.countryScopes!.contains(r.countryCode)) {
        return false;
      }
      return true;
    }).toList();
    return Stream<List<LicenseReviewRecord>>.value(filtered);
  }

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

      // The screen MUST forward the scope params to the data source.
      // Without this assertion the scope-rule tests below could pass
      // even if the screen quietly ignored the props.
      expect(ds.lastIsSuperAdmin, isTrue);
      expect(ds.lastCountryScopes, equals(<String>[]));
    });

    testWidgets(
        'CM-scoped admin sees only CM pending/correction; GH + CM rejected are excluded',
        (tester) async {
      final action = _MockAction();
      final ds = _FilteringFakeDataSource(
        const [
          // In-scope, in-status — must show.
          LicenseReviewRecord(
            pharmacyId: 'cm_pending',
            pharmacyName: 'CM Pending Pharma',
            countryCode: 'CM',
            licenseNumber: 'CM-001',
            licenseStatus: 'pending_verification',
          ),
          LicenseReviewRecord(
            pharmacyId: 'cm_correction',
            pharmacyName: 'CM Correction Pharma',
            countryCode: 'CM',
            licenseNumber: 'CM-002',
            licenseStatus: 'correction_needed',
          ),
          // In-scope, out-of-status — must be excluded.
          LicenseReviewRecord(
            pharmacyId: 'cm_rejected',
            pharmacyName: 'CM Rejected Pharma',
            countryCode: 'CM',
            licenseNumber: 'CM-003',
            licenseStatus: 'rejected',
          ),
          // Out-of-scope, in-status — must be excluded.
          LicenseReviewRecord(
            pharmacyId: 'gh_pending',
            pharmacyName: 'GH Pending Pharma',
            countryCode: 'GH',
            licenseNumber: 'GH-001',
            licenseStatus: 'pending_verification',
          ),
        ],
        action,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: PharmacyLicenseReviewScreen(
            countryScopes: const ['CM'],
            isSuperAdmin: false,
            dataSource: ds,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('pharmacy_card_cm_pending')), findsOneWidget);
      expect(
          find.byKey(const Key('pharmacy_card_cm_correction')), findsOneWidget);
      expect(find.byKey(const Key('pharmacy_card_cm_rejected')), findsNothing);
      expect(find.byKey(const Key('pharmacy_card_gh_pending')), findsNothing);
    });

    testWidgets(
        'super_admin sees every pending/correction across countries',
        (tester) async {
      final action = _MockAction();
      final ds = _FilteringFakeDataSource(
        const [
          LicenseReviewRecord(
            pharmacyId: 'cm_pending',
            pharmacyName: 'CM',
            countryCode: 'CM',
            licenseNumber: 'CM-001',
            licenseStatus: 'pending_verification',
          ),
          LicenseReviewRecord(
            pharmacyId: 'gh_correction',
            pharmacyName: 'GH',
            countryCode: 'GH',
            licenseNumber: 'GH-001',
            licenseStatus: 'correction_needed',
          ),
          LicenseReviewRecord(
            pharmacyId: 'ng_rejected',
            pharmacyName: 'NG',
            countryCode: 'NG',
            licenseNumber: 'NG-001',
            licenseStatus: 'rejected',
          ),
        ],
        action,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: PharmacyLicenseReviewScreen(
            isSuperAdmin: true,
            countryScopes: const [],
            dataSource: ds,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('pharmacy_card_cm_pending')), findsOneWidget);
      expect(
          find.byKey(const Key('pharmacy_card_gh_correction')), findsOneWidget);
      // Out-of-status still excluded even for super_admin.
      expect(find.byKey(const Key('pharmacy_card_ng_rejected')), findsNothing);
    });

    testWidgets(
        'admin with empty countryScopes sees nothing (defensive sentinel)',
        (tester) async {
      final action = _MockAction();
      final ds = _FilteringFakeDataSource(
        const [
          LicenseReviewRecord(
            pharmacyId: 'cm_pending',
            pharmacyName: 'CM',
            countryCode: 'CM',
            licenseNumber: 'CM-001',
            licenseStatus: 'pending_verification',
          ),
        ],
        action,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: PharmacyLicenseReviewScreen(
            isSuperAdmin: false,
            countryScopes: const [],
            dataSource: ds,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('No licenses awaiting review.'), findsOneWidget);
    });
  });

  group('buildLicenseReviewQuerySpec (pure helper)', () {
    test('super_admin yields no country filter', () {
      final spec = buildLicenseReviewQuerySpec(
        isSuperAdmin: true,
        countryScopes: const [],
      );
      expect(spec.statuses,
          equals(['pending_verification', 'correction_needed']));
      expect(spec.countryScopes, isNull);
    });

    test('admin with one scope filters to that single country', () {
      final spec = buildLicenseReviewQuerySpec(
        isSuperAdmin: false,
        countryScopes: const ['CM'],
      );
      expect(spec.countryScopes, equals(['CM']));
    });

    test('admin with no scope falls back to the sentinel __no_scope__', () {
      final spec = buildLicenseReviewQuerySpec(
        isSuperAdmin: false,
        countryScopes: const [],
      );
      expect(spec.countryScopes, equals(['__no_scope__']));
    });

    test('admin with > 10 scopes is capped to 10 (Firestore whereIn limit)',
        () {
      final tooMany = List<String>.generate(15, (i) => 'C${i.toString().padLeft(2, '0')}');
      final spec = buildLicenseReviewQuerySpec(
        isSuperAdmin: false,
        countryScopes: tooMany,
      );
      expect(spec.countryScopes, hasLength(10));
      expect(spec.countryScopes, equals(tooMany.take(10).toList()));
    });
  });
}
