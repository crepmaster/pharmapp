import 'package:flutter_test/flutter_test.dart';
import 'package:pharmapp_unified/services/withdrawal_service.dart';

/// Tests for [WithdrawalService] focus on two invariants the callable wrapper
/// must uphold without hitting Firebase:
///  1. Result parsing — shape + types returned by the backend.
///  2. French error mapping — every HttpsError code surfaces a FR message.
///
/// The actual `FirebaseFunctions.instanceFor(...).httpsCallable(...).call(...)`
/// call is not tested here (it would require either an emulator or a mocking
/// layer we don't want to introduce). Payload shape is asserted indirectly
/// via dialog tests in `courier_wallet_widget_test.dart`.
///
/// French mapping is driven via
/// [WithdrawalException.translateFr] — a `@visibleForTesting` forwarder to
/// the private `_translateFr` that bypasses the `@protected`
/// [FirebaseFunctionsException] ctor.
void main() {
  group('WithdrawalResult.fromMap', () {
    test('parses a minimal sandbox response', () {
      final r = WithdrawalResult.fromMap({
        'requestId': 'req_123',
        'status': 'pending',
        'providerRef': 'psp_abc',
        'amountMinor': 5000,
        'walletUnitsDebited': 5000,
        'currencyCode': 'XAF',
        'providerId': 'mtn_cm',
        'clientRequestId': '11111111-1111-4111-8111-111111111111',
      });

      expect(r.requestId, 'req_123');
      expect(r.status, 'pending');
      expect(r.amountMinor, 5000);
      expect(r.walletUnitsDebited, 5000);
      expect(r.currencyCode, 'XAF');
      expect(r.providerId, 'mtn_cm');
      expect(r.clientRequestId, '11111111-1111-4111-8111-111111111111');
    });

    test('accepts a double-typed amountMinor (JSON num) and coerces to int',
        () {
      final r = WithdrawalResult.fromMap({
        'requestId': 'req',
        'status': 'pending',
        'providerRef': 'ref',
        'amountMinor': 1000.0,
        'walletUnitsDebited': 100000.0,
        'currencyCode': 'XAF',
        'providerId': 'mtn_cm',
        'clientRequestId': 'uuid',
      });
      expect(r.amountMinor, 1000);
      expect(r.amountMinor, isA<int>());
      expect(r.walletUnitsDebited, 100000.0);
    });
  });

  group('WithdrawalException — FR mapping', () {
    String map(String code, [String msg = '']) =>
        WithdrawalException.translateFr(code, msg);

    test('unauthenticated', () {
      expect(map('unauthenticated', 'Authentication required.'),
          'Session expirée. Veuillez vous reconnecter.');
    });

    test('permission-denied', () {
      expect(
          map('permission-denied',
              "Withdrawal unavailable for this courier account."),
          'Retrait indisponible pour ce compte.');
    });

    test('invalid-argument — msisdn invalid', () {
      expect(map('invalid-argument', 'msisdn is invalid.'),
          'Numéro de téléphone invalide.');
    });

    test('invalid-argument — msisdn required', () {
      expect(map('invalid-argument', 'msisdn is required.'),
          'Numéro de téléphone invalide.');
    });

    test('invalid-argument — amountMinor', () {
      expect(map('invalid-argument', 'amountMinor must be a positive integer.'),
          'Montant invalide.');
    });

    test('invalid-argument — currencyCode', () {
      expect(map('invalid-argument', "currencyCode 'ZZZ' is not supported."),
          'Devise non supportée.');
    });

    test('invalid-argument — clientRequestId', () {
      expect(map('invalid-argument', 'clientRequestId must be a UUID v4.'),
          'Erreur technique — veuillez réessayer.');
    });

    test('invalid-argument — providerId', () {
      expect(map('invalid-argument', "Unknown providerId 'x'."),
          'Opérateur invalide.');
    });

    test('invalid-argument — ownerType', () {
      expect(
          map('invalid-argument', "ownerType must be 'pharmacy' or 'courier'."),
          'Type de compte invalide.');
    });

    test('invalid-argument — generic', () {
      expect(map('invalid-argument', 'something else'), 'Requête invalide.');
    });

    test('failed-precondition — insufficient balance', () {
      expect(map('failed-precondition', 'Insufficient balance: 100 < 5000'),
          'Solde insuffisant.');
    });

    test('failed-precondition — provider not eligible', () {
      expect(
          map('failed-precondition',
              "Provider 'x' is not eligible for payouts."),
          'Cet opérateur ne supporte pas les retraits.');
    });

    test('failed-precondition — provider country mismatch', () {
      expect(
          map('failed-precondition',
              'Provider country does not match owner country.'),
          'Opérateur non disponible dans votre pays.');
    });

    test('failed-precondition — provider currency mismatch', () {
      expect(
          map('failed-precondition',
              'Provider currency does not match request currency.'),
          'Devise opérateur incompatible.');
    });

    test('failed-precondition — wallet currency mismatch', () {
      expect(
          map('failed-precondition',
              'Wallet currency does not match request currency.'),
          'Devise du portefeuille incompatible.');
    });

    test('failed-precondition — wallet missing', () {
      expect(map('failed-precondition', 'Wallet does not exist.'),
          'Portefeuille introuvable — contactez le support.');
    });

    test('failed-precondition — wallet disappeared', () {
      expect(map('failed-precondition', 'Wallet disappeared mid-request.'),
          'Erreur technique — veuillez réessayer.');
    });

    test('failed-precondition — generic', () {
      expect(map('failed-precondition', 'something else'),
          'Opération impossible dans l\'état actuel.');
    });

    test('unknown code — generic fallback', () {
      expect(map('internal', 'boom'),
          'Une erreur est survenue. Veuillez réessayer.');
    });
  });

  group('WithdrawalException carries both codes and original message', () {
    test('code + serverMessage round-trip', () {
      const code = 'failed-precondition';
      const serverMessage = 'Insufficient balance: 100 < 5000';
      final userMessage = WithdrawalException.translateFr(code, serverMessage);
      final e = WithdrawalException(
        code: code,
        serverMessage: serverMessage,
        userMessage: userMessage,
      );
      expect(e.code, 'failed-precondition');
      expect(e.serverMessage, 'Insufficient balance: 100 < 5000');
      expect(e.userMessage, 'Solde insuffisant.');
    });
  });
}
