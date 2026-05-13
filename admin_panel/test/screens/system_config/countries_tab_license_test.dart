// Sprint 2B.1 — Widget tests for the License configuration dialog body
// (`LicenseConfigDialog`). The dialog itself is wired into
// `countries_tab.dart` via `_showLicenseConfigDialog`, which passes
// `SystemConfigService.setCountryLicenseConfigViaCallable` as the
// Save callback in production. Tests inject a stub callback so we
// never touch Firebase.
import 'package:admin_panel/models/country_option.dart';
import 'package:admin_panel/screens/system_config/license_config_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class _MockSubmit extends Mock {
  Future<String?> call({
    required String countryCode,
    bool? licenseRequired,
    String? licenseLabel,
    String? licenseHelpText,
    bool? licenseVerificationRequired,
    String? licenseFormatRegex,
    bool? licenseDocumentRequired,
    int? licenseGracePeriodDays,
  });
}

const _baseCountry = CountryOption(
  code: 'CM',
  name: 'Cameroon',
  dialCode: '237',
  defaultCurrencyCode: 'XAF',
  timezone: 'Africa/Douala',
  enabled: true,
  defaultCityCode: 'douala',
  providerIds: [],
  sortOrder: 10,
  // Defaults : licenseRequired false, gracePeriodDays 30, etc.
);

Future<void> _pumpDialog(
  WidgetTester tester, {
  required CountryOption country,
  required LicenseConfigSubmit onSubmit,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (ctx) => Center(
            child: ElevatedButton(
              key: const Key('open_dialog'),
              onPressed: () => showDialog(
                context: ctx,
                builder: (_) => LicenseConfigDialog(
                  country: country,
                  onSubmit: onSubmit,
                ),
              ),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.byKey(const Key('open_dialog')));
  await tester.pumpAndSettle();
}

void main() {
  group('LicenseConfigDialog', () {
    testWidgets(
        'flipping licenseRequired ON and saving calls onSubmit with all 7 fields',
        (tester) async {
      final submit = _MockSubmit();
      when(() => submit.call(
            countryCode: any(named: 'countryCode'),
            licenseRequired: any(named: 'licenseRequired'),
            licenseLabel: any(named: 'licenseLabel'),
            licenseHelpText: any(named: 'licenseHelpText'),
            licenseVerificationRequired:
                any(named: 'licenseVerificationRequired'),
            licenseFormatRegex: any(named: 'licenseFormatRegex'),
            licenseDocumentRequired: any(named: 'licenseDocumentRequired'),
            licenseGracePeriodDays: any(named: 'licenseGracePeriodDays'),
          )).thenAnswer((_) async => null);

      await _pumpDialog(
        tester,
        country: _baseCountry,
        onSubmit: submit.call,
      );

      // licenseRequired is OFF by default → flip ON.
      await tester.tap(find.byKey(const Key('license_required_switch')));
      await tester.pumpAndSettle();

      // Type a label, regex, custom grace.
      await tester.enterText(
          find.byKey(const Key('license_label_field')), 'PSI Number');
      await tester.enterText(
          find.byKey(const Key('license_regex_field')), r'^[A-Z]{2}-\d{4}$');
      await tester.enterText(
          find.byKey(const Key('license_grace_field')), '45');
      await tester.pumpAndSettle();

      // Save is enabled (regex valid + grace valid).
      final saveBtn = tester.widget<ElevatedButton>(
          find.byKey(const Key('license_save')));
      expect(saveBtn.onPressed, isNotNull,
          reason: 'Save button should be enabled when inputs are valid');

      await tester.tap(find.byKey(const Key('license_save')));
      await tester.pumpAndSettle();

      verify(() => submit.call(
            countryCode: 'CM',
            licenseRequired: true,
            licenseLabel: 'PSI Number',
            licenseHelpText: '',
            licenseVerificationRequired: false,
            licenseFormatRegex: r'^[A-Z]{2}-\d{4}$',
            licenseDocumentRequired: false,
            licenseGracePeriodDays: 45,
          )).called(1);
    });

    testWidgets(
        'invalid regex disables Save and never invokes the callback',
        (tester) async {
      final submit = _MockSubmit();
      await _pumpDialog(
        tester,
        country: _baseCountry,
        onSubmit: submit.call,
      );

      // Unparseable regex.
      await tester.enterText(
          find.byKey(const Key('license_regex_field')), r'[unclosed');
      await tester.pumpAndSettle();

      final saveBtn = tester.widget<ElevatedButton>(
          find.byKey(const Key('license_save')));
      expect(saveBtn.onPressed, isNull,
          reason: 'Save button must be disabled while the regex is invalid');

      // Even attempting a tap is a no-op since the button is disabled,
      // but assert no submission happened either way.
      verifyNever(() => submit.call(
            countryCode: any(named: 'countryCode'),
            licenseRequired: any(named: 'licenseRequired'),
            licenseLabel: any(named: 'licenseLabel'),
            licenseHelpText: any(named: 'licenseHelpText'),
            licenseVerificationRequired:
                any(named: 'licenseVerificationRequired'),
            licenseFormatRegex: any(named: 'licenseFormatRegex'),
            licenseDocumentRequired: any(named: 'licenseDocumentRequired'),
            licenseGracePeriodDays: any(named: 'licenseGracePeriodDays'),
          ));
    });

    testWidgets('grace period out of range disables Save', (tester) async {
      final submit = _MockSubmit();
      await _pumpDialog(
        tester,
        country: _baseCountry,
        onSubmit: submit.call,
      );

      // 0 is below the minimum of 1.
      await tester.enterText(
          find.byKey(const Key('license_grace_field')), '0');
      await tester.pumpAndSettle();

      final saveBtn = tester.widget<ElevatedButton>(
          find.byKey(const Key('license_save')));
      expect(saveBtn.onPressed, isNull,
          reason:
              'Save must be disabled when grace period is out of [1, 365]');
    });

    testWidgets('backend error message is shown when onSubmit returns text',
        (tester) async {
      final submit = _MockSubmit();
      when(() => submit.call(
            countryCode: any(named: 'countryCode'),
            licenseRequired: any(named: 'licenseRequired'),
            licenseLabel: any(named: 'licenseLabel'),
            licenseHelpText: any(named: 'licenseHelpText'),
            licenseVerificationRequired:
                any(named: 'licenseVerificationRequired'),
            licenseFormatRegex: any(named: 'licenseFormatRegex'),
            licenseDocumentRequired: any(named: 'licenseDocumentRequired'),
            licenseGracePeriodDays: any(named: 'licenseGracePeriodDays'),
          )).thenAnswer((_) async => 'permission-denied: not in country scope');

      await _pumpDialog(
        tester,
        country: _baseCountry,
        onSubmit: submit.call,
      );

      await tester.tap(find.byKey(const Key('license_save')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('license_backend_error')), findsOneWidget);
      expect(
        find.text('permission-denied: not in country scope'),
        findsOneWidget,
      );
    });
  });
}
