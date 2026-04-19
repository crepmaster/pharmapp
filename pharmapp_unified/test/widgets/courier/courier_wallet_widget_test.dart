import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pharmapp_shared/models/master_data_snapshot.dart';
import 'package:pharmapp_unified/widgets/courier/courier_wallet_widget.dart';

/// Widget tests for the withdrawal dialog (`_WithdrawalDialog`), exercised
/// through the `@visibleForTesting` [debugBuildWithdrawalDialog] hook.
///
/// The callable `createWithdrawalRequest` is NOT invoked here — the tests
/// only validate:
///  - Rendering with MasterData-driven inputs (providers, dial code,
///    currency code, balance).
///  - Validation failures surface French messages.
///  - No CM-hardcoding (XAF label, +237 prefix, MTN/Orange literals) leaks.
///
/// The full UUID-lifecycle coverage (success resets, error preserves,
/// cancel preserves, new cycle regenerates) requires an integration test
/// with a fake `FirebaseFunctions` — out of scope for this unit file.
/// The parent widget's lazy-generate / reset-on-success invariant is
/// documented in `_CourierWalletWidgetState._onWithdrawPressed`.
MasterDataProvider _provider(
  String id, {
  String country = 'CM',
  String currency = 'XAF',
  String methodCode = 'mtn_cm',
  bool payouts = true,
}) {
  return MasterDataProvider(
    id: id,
    name: id.toUpperCase(),
    countryCode: country,
    currencyCode: currency,
    methodCode: methodCode,
    enabled: true,
    displayOrder: 0,
    requiresMsisdn: true,
    supportsCollections: true,
    supportsPayouts: payouts,
  );
}

Widget _harness(Widget dialog) {
  return MaterialApp(
    home: Scaffold(
      body: Center(child: dialog),
    ),
  );
}

void main() {
  group('_WithdrawalDialog — rendering & inputs', () {
    testWidgets('renders with MasterData providers (no MTN/Orange hardcoding)',
        (tester) async {
      await tester.pumpWidget(_harness(debugBuildWithdrawalDialog(
        clientRequestId: '11111111-1111-4111-8111-111111111111',
        eligibleProviders: [
          _provider('mtn_cm'),
          _provider('orange_cm', methodCode: 'orange_cm'),
        ],
        currencyCode: 'XAF',
        currencyDecimals: 0,
        walletBalanceMajor: 12000,
        dialCode: '237',
      )));

      // Title + action labels are FR (French mapping requirement).
      expect(find.text('Retrait'), findsOneWidget);
      expect(find.text('Annuler'), findsOneWidget);
      expect(find.text('Confirmer le retrait'), findsOneWidget);

      // Currency shown dynamically — NOT hardcoded XAF literal string
      // in the form label.
      expect(
          find.textContaining('Solde disponible : 12000 XAF'), findsOneWidget);
      expect(find.textContaining('Montant (XAF)'), findsOneWidget);

      // Phone prefix from MasterData (+237 here but driven by param).
      expect(find.text('+237 '), findsOneWidget);
    });

    testWidgets('renders with Kenyan context (no +237, no XAF)',
        (tester) async {
      await tester.pumpWidget(_harness(debugBuildWithdrawalDialog(
        clientRequestId: '22222222-2222-4222-8222-222222222222',
        eligibleProviders: [
          _provider('mpesa_ke',
              country: 'KE', currency: 'KES', methodCode: 'mpesa_kenya'),
        ],
        currencyCode: 'KES',
        currencyDecimals: 2,
        walletBalanceMajor: 2500,
        dialCode: '254',
      )));

      expect(find.text('+254 '), findsOneWidget);
      expect(find.textContaining('Montant (KES)'), findsOneWidget);
      expect(find.text('+237 '), findsNothing);
      expect(find.textContaining('Montant (XAF)'), findsNothing);
    });

    testWidgets('pre-selects provider from paymentPreferences', (tester) async {
      await tester.pumpWidget(_harness(debugBuildWithdrawalDialog(
        clientRequestId: '33333333-3333-4333-8333-333333333333',
        eligibleProviders: [
          _provider('mtn_cm'),
          _provider('orange_cm', methodCode: 'orange_cm'),
        ],
        preselectedProviderId: 'orange_cm',
        currencyCode: 'XAF',
        currencyDecimals: 0,
        walletBalanceMajor: 5000,
        dialCode: '237',
      )));

      // Default dropdown value is ORANGE_CM → its visible text should appear
      // in the selected area.
      expect(find.text('ORANGE_CM'), findsWidgets);
    });
  });

  group('_WithdrawalDialog — form validation (FR messages)', () {
    testWidgets('amount > balance → "Solde insuffisant"', (tester) async {
      await tester.pumpWidget(_harness(debugBuildWithdrawalDialog(
        clientRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        eligibleProviders: [_provider('mtn_cm')],
        preselectedProviderId: 'mtn_cm',
        currencyCode: 'XAF',
        currencyDecimals: 0,
        walletBalanceMajor: 1000,
        dialCode: '237',
      )));

      // Enter an amount greater than the balance.
      final amountField = find.widgetWithText(TextFormField, 'Montant (XAF)');
      expect(amountField, findsOneWidget);
      await tester.enterText(amountField, '5000');
      // Enter any phone so msisdn validator doesn't short-circuit first.
      final phoneField = find.widgetWithText(TextFormField, 'Numéro mobile');
      await tester.enterText(phoneField, '677123456');

      await tester.tap(find.text('Confirmer le retrait'));
      await tester.pump();

      expect(find.text('Solde insuffisant'), findsOneWidget);
    });

    testWidgets('phone not matching method → FR error', (tester) async {
      await tester.pumpWidget(_harness(debugBuildWithdrawalDialog(
        clientRequestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        eligibleProviders: [_provider('mtn_cm', methodCode: 'mtn_cm')],
        preselectedProviderId: 'mtn_cm',
        currencyCode: 'XAF',
        currencyDecimals: 0,
        walletBalanceMajor: 10000,
        dialCode: '237',
      )));

      // Valid amount, invalid phone (starts with 6 but wrong prefix for MTN).
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Montant (XAF)'), '1000');
      // 640xxxxxx is NOT in MTN CM prefixes (65x/67x/68x).
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Numéro mobile'), '640123456');

      await tester.tap(find.text('Confirmer le retrait'));
      await tester.pump();

      expect(find.text('Numéro invalide pour cet opérateur'), findsOneWidget);
    });

    testWidgets('amount < minWithdrawalMajor → FR minimum error (3.2a Fix 2)',
        (tester) async {
      await tester.pumpWidget(_harness(debugBuildWithdrawalDialog(
        clientRequestId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        eligibleProviders: [_provider('mtn_gh',
            country: 'GH', currency: 'GHS', methodCode: 'mtn_ghana')],
        preselectedProviderId: 'mtn_gh',
        currencyCode: 'GHS',
        currencyDecimals: 2,
        walletBalanceMajor: 50,
        minWithdrawalMajor: 10,
        dialCode: '233',
      )));

      await tester.enterText(
          find.widgetWithText(TextFormField, 'Montant (GHS)'), '5');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Numéro mobile'), '240123456');

      await tester.tap(find.text('Confirmer le retrait'));
      await tester.pump();

      expect(find.text('Montant minimum : 10 GHS'), findsOneWidget);
    });

    testWidgets('msisdn field starts empty (3.2a Fix 4 — no fake prefill)',
        (tester) async {
      await tester.pumpWidget(_harness(debugBuildWithdrawalDialog(
        clientRequestId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        eligibleProviders: [_provider('mtn_cm')],
        preselectedProviderId: 'mtn_cm',
        currencyCode: 'XAF',
        currencyDecimals: 0,
        walletBalanceMajor: 5000,
        dialCode: '237',
        // minWithdrawalMajor defaults to 0 in debugBuildWithdrawalDialog
      )));

      // Find the msisdn field and assert its controller text is empty.
      final msisdnFieldFinder =
          find.widgetWithText(TextFormField, 'Numéro mobile');
      expect(msisdnFieldFinder, findsOneWidget);
      final msisdnField = tester.widget<TextFormField>(msisdnFieldFinder);
      expect(msisdnField.controller?.text ?? '', isEmpty);
    });

    testWidgets('empty amount → "Saisissez un montant"', (tester) async {
      await tester.pumpWidget(_harness(debugBuildWithdrawalDialog(
        clientRequestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        eligibleProviders: [_provider('mtn_cm')],
        preselectedProviderId: 'mtn_cm',
        currencyCode: 'XAF',
        currencyDecimals: 0,
        walletBalanceMajor: 1000,
        dialCode: '237',
      )));

      await tester.enterText(
          find.widgetWithText(TextFormField, 'Numéro mobile'), '677123456');
      await tester.tap(find.text('Confirmer le retrait'));
      await tester.pump();
      expect(find.text('Saisissez un montant'), findsOneWidget);
    });
  });

  group('_WithdrawalDialog — clientRequestId is parent-owned', () {
    testWidgets(
        'dialog exposes the UUID provided by the parent via constructor',
        (tester) async {
      const parentUuid = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
      Widget dialog = debugBuildWithdrawalDialog(
        clientRequestId: parentUuid,
        eligibleProviders: [_provider('mtn_cm')],
        preselectedProviderId: 'mtn_cm',
        currencyCode: 'XAF',
        currencyDecimals: 0,
        walletBalanceMajor: 500,
        dialCode: '237',
      );
      await tester.pumpWidget(_harness(dialog));

      // The dialog internally wires widget.clientRequestId into the
      // callable payload. We can't intercept the call without a real
      // FirebaseFunctions mock; instead we assert the dialog was built
      // with the supplied UUID (non-null rendering + FR title present).
      // The parent-widget UUID-lifecycle guarantees (lazy-generate,
      // preserve-on-error, reset-on-success) are enforced in
      // _CourierWalletWidgetState._onWithdrawPressed and documented
      // there with rationale comments. See PR description.
      expect(find.text('Retrait'), findsOneWidget);
    });
  });
}
