/// A city entry in system_config/main → citiesByCountry[countryCode] map.
/// Matches CONTRACT_ADMIN_MASTER_DATA_AND_TREASURY_V1 §6.1.
class CityOption {
  final String code; // slug lowercase, e.g. "douala"
  final String name;
  final String region;
  final bool enabled;
  final bool isMajorCity;
  final double deliveryFee; // in local currency
  final String currencyCode;
  final double latitude;
  final double longitude;
  final double validationRadiusKm;
  final int sortOrder;

  const CityOption({
    required this.code,
    required this.name,
    required this.region,
    required this.enabled,
    required this.isMajorCity,
    required this.deliveryFee,
    required this.currencyCode,
    required this.latitude,
    required this.longitude,
    required this.validationRadiusKm,
    required this.sortOrder,
  });

  factory CityOption.fromMap(Map<String, dynamic> map) {
    return CityOption(
      code: map['code'] ?? '',
      name: map['name'] ?? '',
      region: map['region'] ?? '',
      enabled: map['enabled'] ?? false,
      isMajorCity: map['isMajorCity'] ?? false,
      deliveryFee: (map['deliveryFee'] ?? 0).toDouble(),
      currencyCode: map['currencyCode'] ?? '',
      latitude: (map['latitude'] ?? 0).toDouble(),
      longitude: (map['longitude'] ?? 0).toDouble(),
      validationRadiusKm: (map['validationRadiusKm'] ?? 0).toDouble(),
      sortOrder: map['sortOrder'] ?? 0,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'code': code,
      'name': name,
      'region': region,
      'enabled': enabled,
      'isMajorCity': isMajorCity,
      'deliveryFee': deliveryFee,
      'currencyCode': currencyCode,
      'latitude': latitude,
      'longitude': longitude,
      'validationRadiusKm': validationRadiusKm,
      'sortOrder': sortOrder,
    };
  }

  CityOption copyWith({
    String? name,
    String? region,
    bool? enabled,
    bool? isMajorCity,
    double? deliveryFee,
    String? currencyCode,
    double? latitude,
    double? longitude,
    double? validationRadiusKm,
    int? sortOrder,
  }) {
    return CityOption(
      code: code,
      name: name ?? this.name,
      region: region ?? this.region,
      enabled: enabled ?? this.enabled,
      isMajorCity: isMajorCity ?? this.isMajorCity,
      deliveryFee: deliveryFee ?? this.deliveryFee,
      currencyCode: currencyCode ?? this.currencyCode,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      validationRadiusKm: validationRadiusKm ?? this.validationRadiusKm,
      sortOrder: sortOrder ?? this.sortOrder,
    );
  }
}
