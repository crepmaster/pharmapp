/// A currency entry in system_config/main → currencies map.
/// Matches CONTRACT_ADMIN_MASTER_DATA_AND_TREASURY_V1 §6.1.
class CurrencyOption {
  final String code; // ISO 4217, e.g. "XAF"
  final String name;
  final String symbol; // e.g. "FCFA"
  final int decimals; // 0 for XAF, 2 for USD
  final bool enabled;
  final String displayPattern; // e.g. "#,##0 XAF"
  final double fxBaseRate; // rate to USD
  final int sortOrder;

  const CurrencyOption({
    required this.code,
    required this.name,
    required this.symbol,
    required this.decimals,
    required this.enabled,
    required this.displayPattern,
    required this.fxBaseRate,
    required this.sortOrder,
  });

  factory CurrencyOption.fromMap(Map<String, dynamic> map) {
    return CurrencyOption(
      code: map['code'] ?? '',
      name: map['name'] ?? '',
      symbol: map['symbol'] ?? '',
      decimals: map['decimals'] ?? 0,
      enabled: map['enabled'] ?? false,
      displayPattern: map['displayPattern'] ?? '',
      fxBaseRate: (map['fxBaseRate'] ?? 0).toDouble(),
      sortOrder: map['sortOrder'] ?? 0,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'code': code,
      'name': name,
      'symbol': symbol,
      'decimals': decimals,
      'enabled': enabled,
      'displayPattern': displayPattern,
      'fxBaseRate': fxBaseRate,
      'sortOrder': sortOrder,
    };
  }

  CurrencyOption copyWith({
    String? name,
    String? symbol,
    int? decimals,
    bool? enabled,
    String? displayPattern,
    double? fxBaseRate,
    int? sortOrder,
  }) {
    return CurrencyOption(
      code: code,
      name: name ?? this.name,
      symbol: symbol ?? this.symbol,
      decimals: decimals ?? this.decimals,
      enabled: enabled ?? this.enabled,
      displayPattern: displayPattern ?? this.displayPattern,
      fxBaseRate: fxBaseRate ?? this.fxBaseRate,
      sortOrder: sortOrder ?? this.sortOrder,
    );
  }
}
