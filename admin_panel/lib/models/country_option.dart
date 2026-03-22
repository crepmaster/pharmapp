/// A country entry in system_config/main → countries map.
/// Matches CONTRACT_ADMIN_MASTER_DATA_AND_TREASURY_V1 §6.1.
class CountryOption {
  final String code; // ISO 3166-1 alpha-2, e.g. "CM"
  final String name;
  final String dialCode; // e.g. "237"
  final String defaultCurrencyCode; // ISO 4217, e.g. "XAF"
  final String timezone; // e.g. "Africa/Douala"
  final bool enabled;
  final String defaultCityCode; // slug, e.g. "douala"
  final List<String> providerIds; // references into mobileMoneyProviders
  final int sortOrder;

  const CountryOption({
    required this.code,
    required this.name,
    required this.dialCode,
    required this.defaultCurrencyCode,
    required this.timezone,
    required this.enabled,
    required this.defaultCityCode,
    required this.providerIds,
    required this.sortOrder,
  });

  factory CountryOption.fromMap(Map<String, dynamic> map) {
    return CountryOption(
      code: map['code'] ?? '',
      name: map['name'] ?? '',
      dialCode: map['dialCode'] ?? '',
      defaultCurrencyCode: map['defaultCurrencyCode'] ?? '',
      timezone: map['timezone'] ?? '',
      enabled: map['enabled'] ?? false,
      defaultCityCode: map['defaultCityCode'] ?? '',
      providerIds: List<String>.from(map['providerIds'] ?? []),
      sortOrder: map['sortOrder'] ?? 0,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'code': code,
      'name': name,
      'dialCode': dialCode,
      'defaultCurrencyCode': defaultCurrencyCode,
      'timezone': timezone,
      'enabled': enabled,
      'defaultCityCode': defaultCityCode,
      'providerIds': providerIds,
      'sortOrder': sortOrder,
    };
  }

  CountryOption copyWith({
    String? name,
    String? dialCode,
    String? defaultCurrencyCode,
    String? timezone,
    bool? enabled,
    String? defaultCityCode,
    List<String>? providerIds,
    int? sortOrder,
  }) {
    return CountryOption(
      code: code,
      name: name ?? this.name,
      dialCode: dialCode ?? this.dialCode,
      defaultCurrencyCode: defaultCurrencyCode ?? this.defaultCurrencyCode,
      timezone: timezone ?? this.timezone,
      enabled: enabled ?? this.enabled,
      defaultCityCode: defaultCityCode ?? this.defaultCityCode,
      providerIds: providerIds ?? this.providerIds,
      sortOrder: sortOrder ?? this.sortOrder,
    );
  }
}
