/// MoneyContext — immutable snapshot of the caller pharmacy's operating
/// money environment, resolved once after authentication.
///
/// Motivation : before this type existed, every screen that displayed money
/// had to individually (1) load the pharmacy doc, (2) load MasterData,
/// (3) resolve the currency, (4) handle loading, (5) pick a local fallback,
/// (6) format itself with ad-hoc `'$amount $currency'` interpolation.
/// The result was ~10 divergent flows and hard-coded per-country maps in
/// several screens (`{'CM':'XAF','GH':'GHS',...}`), plus silent `USD` /
/// `XAF` model defaults that masked missing data.
///
/// See memory `project-currency-money-context-sprint.md` for the full
/// architecture rationale (2026-07-20 architect review).
///
/// Consumption pattern :
///   - Screens that render an amount for a NEW operation (input fields,
///     current balance, current tariffs) read `MoneyContext.currencyCode`
///     and `.symbol`, and format with `MoneyFormatter.formatMajor`.
///   - Screens that render a HISTORICAL amount (past delivery, ledger,
///     completed proposal) format with the currency stored on that doc —
///     never overwritten by the current MoneyContext. See "snapshot vs
///     live" section of the memory.
///
/// The context is safe to hold as a global once resolved because it is
/// immutable ; a new pharmacy login rebuilds a fresh instance.
class MoneyContext {
  /// ISO 3166-1 alpha-2 country code of the current pharmacy.
  final String countryCode;

  /// ISO 4217 currency code, e.g. "XAF" / "GHS" / "USD".
  final String currencyCode;

  /// Display symbol from `system_config/main.currencies[currencyCode].symbol`,
  /// e.g. "FCFA" / "GH₵". Falls back to [currencyCode] when the symbol is
  /// missing so the UI always has something to render.
  final String symbol;

  /// ISO 4217 minor-unit exponent, e.g. 0 for XAF/UGX, 2 for GHS/KES/NGN.
  /// Nullable when master data does not carry it — consumers of
  /// [MoneyFormatter] should treat null as 2 (most common) unless they
  /// know otherwise.
  final int? decimals;

  /// Locale tag, e.g. "en_GH", "fr_CM". Derived from [countryCode] with a
  /// simple `en_{cc}` fallback when the master data does not expose a
  /// locale field. Used by [MoneyFormatter] for thousand/decimal separator
  /// choice via package:intl.
  final String locale;

  const MoneyContext({
    required this.countryCode,
    required this.currencyCode,
    required this.symbol,
    required this.decimals,
    required this.locale,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is MoneyContext &&
          countryCode == other.countryCode &&
          currencyCode == other.currencyCode &&
          symbol == other.symbol &&
          decimals == other.decimals &&
          locale == other.locale;

  @override
  int get hashCode => Object.hash(countryCode, currencyCode, symbol, decimals, locale);

  @override
  String toString() =>
      'MoneyContext(country=$countryCode, currency=$currencyCode, symbol=$symbol, '
      'decimals=$decimals, locale=$locale)';
}
