/// A country entry in system_config/main → countries map.
/// Matches CONTRACT_ADMIN_MASTER_DATA_AND_TREASURY_V1 §6.1.
///
/// Sprint 2B.1 — extended with the 7 license fields (`licenseRequired`,
/// `licenseLabel`, `licenseHelpText`, `licenseVerificationRequired`,
/// `licenseFormatRegex`, `licenseDocumentRequired`,
/// `licenseGracePeriodDays`). These mirror `MasterDataCountry` in the
/// shared package and are written via the backend callable
/// `setCountryLicenseConfig` (NOT via `upsertCountry`, which only
/// touches the base country fields).
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

  // Sprint 2B.1 — license fields. All defaulted so countries that
  // pre-date the rollout keep their historical "no license" behavior.
  final bool licenseRequired;
  final String? licenseLabel;
  final String? licenseHelpText;
  final bool licenseVerificationRequired;
  final String? licenseFormatRegex;
  final bool licenseDocumentRequired;
  final int licenseGracePeriodDays;

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
    this.licenseRequired = false,
    this.licenseLabel,
    this.licenseHelpText,
    this.licenseVerificationRequired = false,
    this.licenseFormatRegex,
    this.licenseDocumentRequired = false,
    this.licenseGracePeriodDays = 30,
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
      licenseRequired: map['licenseRequired'] as bool? ?? false,
      licenseLabel: map['licenseLabel'] as String?,
      licenseHelpText: map['licenseHelpText'] as String?,
      licenseVerificationRequired:
          map['licenseVerificationRequired'] as bool? ?? false,
      licenseFormatRegex: map['licenseFormatRegex'] as String?,
      licenseDocumentRequired:
          map['licenseDocumentRequired'] as bool? ?? false,
      licenseGracePeriodDays:
          (map['licenseGracePeriodDays'] as num?)?.toInt() ?? 30,
    );
  }

  /// `toMap()` keeps emitting only the base country fields. License
  /// fields go through the dedicated callable `setCountryLicenseConfig`,
  /// not through `upsertCountry`, so we deliberately exclude them here
  /// to avoid accidentally clobbering them via the existing direct
  /// Firestore write path.
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
    bool? licenseRequired,
    String? licenseLabel,
    String? licenseHelpText,
    bool? licenseVerificationRequired,
    String? licenseFormatRegex,
    bool? licenseDocumentRequired,
    int? licenseGracePeriodDays,
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
      licenseRequired: licenseRequired ?? this.licenseRequired,
      licenseLabel: licenseLabel ?? this.licenseLabel,
      licenseHelpText: licenseHelpText ?? this.licenseHelpText,
      licenseVerificationRequired:
          licenseVerificationRequired ?? this.licenseVerificationRequired,
      licenseFormatRegex: licenseFormatRegex ?? this.licenseFormatRegex,
      licenseDocumentRequired:
          licenseDocumentRequired ?? this.licenseDocumentRequired,
      licenseGracePeriodDays:
          licenseGracePeriodDays ?? this.licenseGracePeriodDays,
    );
  }
}
