import 'package:intl/intl.dart';

import '../models/master_data_snapshot.dart';
import 'money_context.dart';

/// MoneyFormatter — canonical presentation of a currency amount.
///
/// Motivation : before this helper, every widget concatenated
/// `'${amount.toStringAsFixed(0)} ${currency}'` locally. This produced
/// `"1250 GHS"` where the correct display is `"GH₵ 1,250.00"` — wrong
/// symbol position, no thousand separator, wrong decimal count. See
/// memory `project-currency-money-context-sprint.md` for the full
/// architecture rationale (2026-07-20 architect review).
///
/// Two entry points :
///   - [formatMajor] : amount is in MAJOR units (e.g. 1250 GHS, 5000 XAF)
///     — the caller has already applied `toLegacyWalletUnits` or knows
///     the unit is major. This is by far the most common case.
///   - [formatMinor] : amount is in MINOR units (e.g. 125000 pesewa,
///     5000 CFA base) — the helper divides by `10^decimals` before
///     formatting.
///
/// Currency metadata (symbol, decimals) is looked up on the passed
/// [MasterDataSnapshot] when available, so a Ghana amount always formats
/// with `GH₵` and 2 decimals — regardless of which screen renders it.
/// When the snapshot doesn't know the currency, the helper falls back to
/// the currency code (e.g. `"GHS 1,250.00"`) rather than throwing.
///
/// Consumption pattern :
///   - New-operation amount → pass `MoneyContext.currencyCode` from the
///     current context.
///   - Historical-transaction amount → pass the currency STORED on that
///     document (`delivery.currency`, `proposal.details.currency`, …).
///     Never overwrite historical currency with the current MoneyContext.
class MoneyFormatter {
  /// Formats a MAJOR-unit amount (e.g. 1250 GHS) into a locale-aware
  /// currency string like `"GH₵ 1,250.00"` or `"1 250 F CFA"`.
  ///
  /// The optional [master] snapshot is used to resolve `symbol` and
  /// `decimals` from `system_config/main.currencies[currencyCode]`. When
  /// omitted, [MoneyFormatter] falls back to the ISO code itself as the
  /// symbol and to 2 decimals.
  ///
  /// [locale] is used for thousand/decimal separators. When omitted,
  /// `en_US` is used (adequate for most African currencies).
  static String formatMajor(
    num amount, {
    required String currencyCode,
    MasterDataSnapshot? master,
    String? locale,
  }) {
    final meta = _lookup(master, currencyCode);
    final decimals = meta?.decimals ?? _defaultDecimalsFor(currencyCode);
    final symbol = (meta?.symbol.isNotEmpty ?? false)
        ? meta!.symbol
        : currencyCode;
    final numberFormat = NumberFormat.currency(
      locale: locale ?? 'en_US',
      symbol: '$symbol ',
      decimalDigits: decimals,
    );
    return numberFormat.format(amount).trim();
  }

  /// Formats a MINOR-unit amount (e.g. 125000 pesewa) by dividing by
  /// `10^decimals` first, then delegating to [formatMajor].
  ///
  /// If [decimals] is null (currency unknown to master data), falls back
  /// to `_defaultDecimalsFor(currencyCode)` to avoid a divide-by-zero
  /// blowup.
  static String formatMinor(
    int minorAmount, {
    required String currencyCode,
    MasterDataSnapshot? master,
    String? locale,
  }) {
    final meta = _lookup(master, currencyCode);
    final decimals = meta?.decimals ?? _defaultDecimalsFor(currencyCode);
    final divisor = decimals <= 0 ? 1 : _pow10(decimals);
    final major = minorAmount / divisor;
    return formatMajor(major, currencyCode: currencyCode, master: master, locale: locale);
  }

  /// Convenience wrapper for the current [MoneyContext] — formats a
  /// MAJOR-unit amount using the caller's operating currency + locale in
  /// one call. Use this on any NEW-operation screen.
  ///
  /// Never use for historical transactions — those must format with the
  /// currency stored on the document, which may differ from the current
  /// context after a country-config change.
  static String formatForContext(
    num amount, {
    required MoneyContext context,
    MasterDataSnapshot? master,
  }) {
    return formatMajor(
      amount,
      currencyCode: context.currencyCode,
      master: master,
      locale: context.locale,
    );
  }

  // -- helpers ---------------------------------------------------------------

  static MasterDataCurrency? _lookup(MasterDataSnapshot? master, String code) {
    if (master == null || code.isEmpty) return null;
    return master.getCurrency(code);
  }

  /// Fallback decimals table used when master data does not know the
  /// currency. Mirrors `functions/src/lib/moneyUnits.ts` FALLBACK_DECIMALS.
  static int _defaultDecimalsFor(String code) {
    switch (code.toUpperCase()) {
      case 'XAF':
      case 'XOF':
      case 'UGX':
      case 'RWF':
      case 'BIF':
      case 'CDF':
      case 'GNF':
      case 'MGA':
      case 'DJF':
      case 'CLP':
      case 'ISK':
      case 'JPY':
      case 'KMF':
      case 'KRW':
      case 'PYG':
      case 'VND':
      case 'VUV':
      case 'XPF':
        return 0;
      default:
        return 2;
    }
  }

  static int _pow10(int n) {
    var r = 1;
    for (var i = 0; i < n; i++) {
      r *= 10;
    }
    return r;
  }
}
