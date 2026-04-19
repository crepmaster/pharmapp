import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';

/// Withdrawal service — thin callable wrapper around
/// `createWithdrawalRequest` (europe-west1).
///
/// Money convention: caller MUST pass `amountMinor` (integer in smallest
/// currency unit). Conversion from major units is the UI's responsibility,
/// using the decimals of the selected currency.
///
/// Idempotency: caller owns the `clientRequestId` lifecycle (UUID v4).
/// Do NOT generate it inside this service.
class WithdrawalResult {
  final String requestId;
  final String status;
  final String providerRef;
  final int amountMinor;
  final num walletUnitsDebited;
  final String currencyCode;
  final String providerId;
  final String clientRequestId;

  const WithdrawalResult({
    required this.requestId,
    required this.status,
    required this.providerRef,
    required this.amountMinor,
    required this.walletUnitsDebited,
    required this.currencyCode,
    required this.providerId,
    required this.clientRequestId,
  });

  factory WithdrawalResult.fromMap(Map<String, dynamic> data) {
    return WithdrawalResult(
      requestId: data['requestId'] as String,
      status: data['status'] as String,
      providerRef: data['providerRef'] as String,
      // amountMinor may deserialize as double from the callable bridge.
      amountMinor: (data['amountMinor'] as num).toInt(),
      // walletUnitsDebited is num: int for XAF (decimals=0) because the
      // legacy courier wallet stores raw major; can be double for
      // currencies with decimals>0 on courier wallets.
      walletUnitsDebited: data['walletUnitsDebited'] as num,
      currencyCode: data['currencyCode'] as String,
      providerId: data['providerId'] as String,
      clientRequestId: data['clientRequestId'] as String,
    );
  }
}

/// Typed exception that carries both the Firebase error code and a
/// French user-facing message ready to display in the UI.
class WithdrawalException implements Exception {
  final String code;
  final String serverMessage;
  final String userMessage;

  const WithdrawalException({
    required this.code,
    required this.serverMessage,
    required this.userMessage,
  });

  factory WithdrawalException.fromFirebase(FirebaseFunctionsException e) {
    final msg = e.message ?? '';
    return WithdrawalException(
      code: e.code,
      serverMessage: msg,
      userMessage: _translateFr(e.code, msg),
    );
  }

  /// Test-only forwarder to [_translateFr]. Allows tests to assert the
  /// French user message mapping for a given (code, serverMessage) pair
  /// without constructing a [FirebaseFunctionsException] (whose ctor is
  /// `@protected`).
  @visibleForTesting
  static String translateFr(String code, String serverMessage) =>
      _translateFr(code, serverMessage);

  /// French translation of every HttpsError thrown by
  /// `createWithdrawalRequest`. Mapping is driven by (code, substring) pairs
  /// because the backend uses `invalid-argument` and `failed-precondition`
  /// generically across many distinct failures.
  static String _translateFr(String code, String serverMsg) {
    switch (code) {
      case 'unauthenticated':
        return 'Session expirée. Veuillez vous reconnecter.';
      case 'permission-denied':
        return 'Retrait indisponible pour ce compte.';
      case 'invalid-argument':
        if (serverMsg.contains('msisdn')) {
          return 'Numéro de téléphone invalide.';
        }
        if (serverMsg.contains('amountMinor')) return 'Montant invalide.';
        if (serverMsg.contains('currencyCode')) return 'Devise non supportée.';
        if (serverMsg.contains('clientRequestId')) {
          return 'Erreur technique — veuillez réessayer.';
        }
        if (serverMsg.contains('providerId')) return 'Opérateur invalide.';
        if (serverMsg.contains('ownerType')) return 'Type de compte invalide.';
        return 'Requête invalide.';
      case 'failed-precondition':
        if (serverMsg.contains('Insufficient balance')) {
          return 'Solde insuffisant.';
        }
        if (serverMsg.contains('not eligible for payouts')) {
          return 'Cet opérateur ne supporte pas les retraits.';
        }
        if (serverMsg.contains('country')) {
          return 'Opérateur non disponible dans votre pays.';
        }
        if (serverMsg.contains('Provider currency')) {
          return 'Devise opérateur incompatible.';
        }
        if (serverMsg.contains('Wallet currency')) {
          return 'Devise du portefeuille incompatible.';
        }
        if (serverMsg.contains('Wallet does not exist')) {
          return 'Portefeuille introuvable — contactez le support.';
        }
        if (serverMsg.contains('Wallet disappeared')) {
          return 'Erreur technique — veuillez réessayer.';
        }
        return 'Opération impossible dans l\'état actuel.';
      default:
        return 'Une erreur est survenue. Veuillez réessayer.';
    }
  }
}

class WithdrawalService {
  static final FirebaseFunctions _functions =
      FirebaseFunctions.instanceFor(region: 'europe-west1');

  /// Calls `createWithdrawalRequest`.
  ///
  /// CRITICAL: the payload does NOT include `ownerId` — the backend derives
  /// it from `auth.uid`. Any client-supplied value is ignored server-side.
  static Future<WithdrawalResult> createWithdrawal({
    required int amountMinor,
    required String currencyCode,
    required String providerId,
    required String msisdn,
    required String clientRequestId,
    required String ownerType,
  }) async {
    try {
      final callable = _functions.httpsCallable('createWithdrawalRequest');
      final response = await callable.call(<String, dynamic>{
        'amountMinor': amountMinor,
        'currencyCode': currencyCode,
        'providerId': providerId,
        'msisdn': msisdn,
        'ownerType': ownerType,
        'clientRequestId': clientRequestId,
      });
      return WithdrawalResult.fromMap(
        Map<String, dynamic>.from(response.data as Map),
      );
    } on FirebaseFunctionsException catch (e) {
      throw WithdrawalException.fromFirebase(e);
    }
  }
}
