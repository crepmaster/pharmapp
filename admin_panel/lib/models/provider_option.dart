/// A mobile money provider entry in system_config/main → mobileMoneyProviders map.
/// Matches CONTRACT_ADMIN_MASTER_DATA_AND_TREASURY_V1 §6.1.
class ProviderOption {
  final String id; // snake_case stable, e.g. "mtn_cm"
  final String name;
  final String countryCode;
  final String currencyCode;
  final String methodCode; // e.g. "mtn_momo"
  final String kind; // e.g. "mobile_money"
  final bool enabled;
  final bool requiresMsisdn;
  final bool supportsCollections;
  final bool supportsPayouts;
  final int displayOrder;
  final String brandColor; // hex, e.g. "#FFCB05"
  final String logoAsset; // e.g. "assets/images/operators/mtn_logo.png"

  const ProviderOption({
    required this.id,
    required this.name,
    required this.countryCode,
    required this.currencyCode,
    required this.methodCode,
    required this.kind,
    required this.enabled,
    required this.requiresMsisdn,
    required this.supportsCollections,
    required this.supportsPayouts,
    required this.displayOrder,
    required this.brandColor,
    required this.logoAsset,
  });

  factory ProviderOption.fromMap(Map<String, dynamic> map) {
    return ProviderOption(
      id: map['id'] ?? '',
      name: map['name'] ?? '',
      countryCode: map['countryCode'] ?? '',
      currencyCode: map['currencyCode'] ?? '',
      methodCode: map['methodCode'] ?? '',
      kind: map['kind'] ?? 'mobile_money',
      enabled: map['enabled'] ?? false,
      requiresMsisdn: map['requiresMsisdn'] ?? true,
      supportsCollections: map['supportsCollections'] ?? false,
      supportsPayouts: map['supportsPayouts'] ?? false,
      displayOrder: map['displayOrder'] ?? 0,
      brandColor: map['brandColor'] ?? '#000000',
      logoAsset: map['logoAsset'] ?? '',
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'countryCode': countryCode,
      'currencyCode': currencyCode,
      'methodCode': methodCode,
      'kind': kind,
      'enabled': enabled,
      'requiresMsisdn': requiresMsisdn,
      'supportsCollections': supportsCollections,
      'supportsPayouts': supportsPayouts,
      'displayOrder': displayOrder,
      'brandColor': brandColor,
      'logoAsset': logoAsset,
    };
  }

  ProviderOption copyWith({
    String? name,
    String? countryCode,
    String? currencyCode,
    String? methodCode,
    String? kind,
    bool? enabled,
    bool? requiresMsisdn,
    bool? supportsCollections,
    bool? supportsPayouts,
    int? displayOrder,
    String? brandColor,
    String? logoAsset,
  }) {
    return ProviderOption(
      id: id,
      name: name ?? this.name,
      countryCode: countryCode ?? this.countryCode,
      currencyCode: currencyCode ?? this.currencyCode,
      methodCode: methodCode ?? this.methodCode,
      kind: kind ?? this.kind,
      enabled: enabled ?? this.enabled,
      requiresMsisdn: requiresMsisdn ?? this.requiresMsisdn,
      supportsCollections: supportsCollections ?? this.supportsCollections,
      supportsPayouts: supportsPayouts ?? this.supportsPayouts,
      displayOrder: displayOrder ?? this.displayOrder,
      brandColor: brandColor ?? this.brandColor,
      logoAsset: logoAsset ?? this.logoAsset,
    );
  }
}
