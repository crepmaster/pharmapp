/// Cities Configuration for PharmApp Multi-Country Support
/// Manages major cities per country for pharmacy/courier geographic grouping
///
/// Features:
/// - City lists per country
/// - Major pharmaceutical market cities
/// - Courier delivery zone configuration
/// - Regional grouping support

import 'country_config.dart';

/// City information
class CityConfig {
  final String name;
  final String country;
  final Country countryEnum;
  final bool isMajorCity;  // Major pharmaceutical market
  final String? region;     // Regional grouping (optional)

  const CityConfig({
    required this.name,
    required this.country,
    required this.countryEnum,
    this.isMajorCity = true,
    this.region,
  });
}

/// Cities database by country
class Cities {
  /// Cameroon Cities (Central Africa CEMAC region)
  static const List<CityConfig> cameroon = [
    CityConfig(
      name: 'Douala',
      country: 'Cameroon',
      countryEnum: Country.cameroon,
      isMajorCity: true,
      region: 'Littoral',
    ),
    CityConfig(
      name: 'Yaoundé',
      country: 'Cameroon',
      countryEnum: Country.cameroon,
      isMajorCity: true,
      region: 'Centre',
    ),
    CityConfig(
      name: 'Bafoussam',
      country: 'Cameroon',
      countryEnum: Country.cameroon,
      isMajorCity: true,
      region: 'West',
    ),
    CityConfig(
      name: 'Bamenda',
      country: 'Cameroon',
      countryEnum: Country.cameroon,
      isMajorCity: true,
      region: 'North-West',
    ),
    CityConfig(
      name: 'Garoua',
      country: 'Cameroon',
      countryEnum: Country.cameroon,
      isMajorCity: true,
      region: 'North',
    ),
    CityConfig(
      name: 'Maroua',
      country: 'Cameroon',
      countryEnum: Country.cameroon,
      isMajorCity: true,
      region: 'Far North',
    ),
    CityConfig(
      name: 'Ngaoundéré',
      country: 'Cameroon',
      countryEnum: Country.cameroon,
      isMajorCity: true,
      region: 'Adamawa',
    ),
    CityConfig(
      name: 'Bertoua',
      country: 'Cameroon',
      countryEnum: Country.cameroon,
      isMajorCity: false,
      region: 'East',
    ),
    CityConfig(
      name: 'Kumba',
      country: 'Cameroon',
      countryEnum: Country.cameroon,
      isMajorCity: false,
      region: 'South-West',
    ),
    CityConfig(
      name: 'Limbe',
      country: 'Cameroon',
      countryEnum: Country.cameroon,
      isMajorCity: false,
      region: 'South-West',
    ),
    CityConfig(
      name: 'Buea',
      country: 'Cameroon',
      countryEnum: Country.cameroon,
      isMajorCity: false,
      region: 'South-West',
    ),
    CityConfig(
      name: 'Kribi',
      country: 'Cameroon',
      countryEnum: Country.cameroon,
      isMajorCity: false,
      region: 'South',
    ),
  ];

  /// Kenya Cities (East Africa)
  static const List<CityConfig> kenya = [
    CityConfig(
      name: 'Nairobi',
      country: 'Kenya',
      countryEnum: Country.kenya,
      isMajorCity: true,
      region: 'Nairobi County',
    ),
    CityConfig(
      name: 'Mombasa',
      country: 'Kenya',
      countryEnum: Country.kenya,
      isMajorCity: true,
      region: 'Mombasa County',
    ),
    CityConfig(
      name: 'Kisumu',
      country: 'Kenya',
      countryEnum: Country.kenya,
      isMajorCity: true,
      region: 'Kisumu County',
    ),
    CityConfig(
      name: 'Nakuru',
      country: 'Kenya',
      countryEnum: Country.kenya,
      isMajorCity: true,
      region: 'Nakuru County',
    ),
    CityConfig(
      name: 'Eldoret',
      country: 'Kenya',
      countryEnum: Country.kenya,
      isMajorCity: true,
      region: 'Uasin Gishu County',
    ),
    CityConfig(
      name: 'Thika',
      country: 'Kenya',
      countryEnum: Country.kenya,
      isMajorCity: false,
      region: 'Kiambu County',
    ),
    CityConfig(
      name: 'Malindi',
      country: 'Kenya',
      countryEnum: Country.kenya,
      isMajorCity: false,
      region: 'Kilifi County',
    ),
  ];

  /// Tanzania Cities (East Africa)
  static const List<CityConfig> tanzania = [
    CityConfig(
      name: 'Dar es Salaam',
      country: 'Tanzania',
      countryEnum: Country.tanzania,
      isMajorCity: true,
      region: 'Dar es Salaam',
    ),
    CityConfig(
      name: 'Mwanza',
      country: 'Tanzania',
      countryEnum: Country.tanzania,
      isMajorCity: true,
      region: 'Mwanza',
    ),
    CityConfig(
      name: 'Arusha',
      country: 'Tanzania',
      countryEnum: Country.tanzania,
      isMajorCity: true,
      region: 'Arusha',
    ),
    CityConfig(
      name: 'Dodoma',
      country: 'Tanzania',
      countryEnum: Country.tanzania,
      isMajorCity: true,
      region: 'Dodoma',
    ),
    CityConfig(
      name: 'Mbeya',
      country: 'Tanzania',
      countryEnum: Country.tanzania,
      isMajorCity: false,
      region: 'Mbeya',
    ),
    CityConfig(
      name: 'Morogoro',
      country: 'Tanzania',
      countryEnum: Country.tanzania,
      isMajorCity: false,
      region: 'Morogoro',
    ),
    CityConfig(
      name: 'Tanga',
      country: 'Tanzania',
      countryEnum: Country.tanzania,
      isMajorCity: false,
      region: 'Tanga',
    ),
    CityConfig(
      name: 'Zanzibar City',
      country: 'Tanzania',
      countryEnum: Country.tanzania,
      isMajorCity: false,
      region: 'Unguja',
    ),
  ];

  /// Uganda Cities (East Africa)
  static const List<CityConfig> uganda = [
    CityConfig(
      name: 'Kampala',
      country: 'Uganda',
      countryEnum: Country.uganda,
      isMajorCity: true,
      region: 'Central',
    ),
    CityConfig(
      name: 'Entebbe',
      country: 'Uganda',
      countryEnum: Country.uganda,
      isMajorCity: true,
      region: 'Central',
    ),
    CityConfig(
      name: 'Gulu',
      country: 'Uganda',
      countryEnum: Country.uganda,
      isMajorCity: true,
      region: 'Northern',
    ),
    CityConfig(
      name: 'Mbarara',
      country: 'Uganda',
      countryEnum: Country.uganda,
      isMajorCity: true,
      region: 'Western',
    ),
    CityConfig(
      name: 'Jinja',
      country: 'Uganda',
      countryEnum: Country.uganda,
      isMajorCity: false,
      region: 'Eastern',
    ),
    CityConfig(
      name: 'Mbale',
      country: 'Uganda',
      countryEnum: Country.uganda,
      isMajorCity: false,
      region: 'Eastern',
    ),
  ];

  /// Nigeria Cities (West Africa)
  static const List<CityConfig> nigeria = [
    CityConfig(
      name: 'Lagos',
      country: 'Nigeria',
      countryEnum: Country.nigeria,
      isMajorCity: true,
      region: 'Lagos State',
    ),
    CityConfig(
      name: 'Abuja',
      country: 'Nigeria',
      countryEnum: Country.nigeria,
      isMajorCity: true,
      region: 'FCT',
    ),
    CityConfig(
      name: 'Kano',
      country: 'Nigeria',
      countryEnum: Country.nigeria,
      isMajorCity: true,
      region: 'Kano State',
    ),
    CityConfig(
      name: 'Ibadan',
      country: 'Nigeria',
      countryEnum: Country.nigeria,
      isMajorCity: true,
      region: 'Oyo State',
    ),
    CityConfig(
      name: 'Port Harcourt',
      country: 'Nigeria',
      countryEnum: Country.nigeria,
      isMajorCity: true,
      region: 'Rivers State',
    ),
    CityConfig(
      name: 'Benin City',
      country: 'Nigeria',
      countryEnum: Country.nigeria,
      isMajorCity: true,
      region: 'Edo State',
    ),
    CityConfig(
      name: 'Kaduna',
      country: 'Nigeria',
      countryEnum: Country.nigeria,
      isMajorCity: true,
      region: 'Kaduna State',
    ),
    CityConfig(
      name: 'Enugu',
      country: 'Nigeria',
      countryEnum: Country.nigeria,
      isMajorCity: false,
      region: 'Enugu State',
    ),
    CityConfig(
      name: 'Jos',
      country: 'Nigeria',
      countryEnum: Country.nigeria,
      isMajorCity: false,
      region: 'Plateau State',
    ),
    CityConfig(
      name: 'Ilorin',
      country: 'Nigeria',
      countryEnum: Country.nigeria,
      isMajorCity: false,
      region: 'Kwara State',
    ),
  ];

  /// Get cities by country enum
  static List<CityConfig> getByCountry(Country country) {
    switch (country) {
      case Country.cameroon:
        return cameroon;
      case Country.kenya:
        return kenya;
      case Country.tanzania:
        return tanzania;
      case Country.uganda:
        return uganda;
      case Country.nigeria:
        return nigeria;
    }
  }

  /// Get city names only (for dropdown)
  static List<String> getCityNames(Country country) {
    return getByCountry(country).map((city) => city.name).toList();
  }

  /// Get only major cities (for prioritized display)
  static List<CityConfig> getMajorCities(Country country) {
    return getByCountry(country).where((city) => city.isMajorCity).toList();
  }

  /// Get major city names only
  static List<String> getMajorCityNames(Country country) {
    return getMajorCities(country).map((city) => city.name).toList();
  }

  /// All cities across all countries
  static List<CityConfig> get all {
    return [
      ...cameroon,
      ...kenya,
      ...tanzania,
      ...uganda,
      ...nigeria,
    ];
  }

  /// Total count of cities
  static int get totalCities => all.length;

  /// Count cities per country
  static Map<Country, int> get citiesPerCountry {
    return {
      Country.cameroon: cameroon.length,
      Country.kenya: kenya.length,
      Country.tanzania: tanzania.length,
      Country.uganda: uganda.length,
      Country.nigeria: nigeria.length,
    };
  }

  /// Find city by name (case-insensitive)
  static CityConfig? findCityByName(String name) {
    try {
      return all.firstWhere(
        (city) => city.name.toLowerCase() == name.toLowerCase(),
      );
    } catch (e) {
      return null;
    }
  }

  /// Validate if city exists in country
  static bool isValidCity(String cityName, Country country) {
    final cities = getCityNames(country);
    return cities.any((city) => city.toLowerCase() == cityName.toLowerCase());
  }
}

/// Summary Statistics
class CitiesStats {
  static String summary() {
    final stats = Cities.citiesPerCountry;
    return '''
PharmApp Cities Configuration:
- Cameroon: ${stats[Country.cameroon]} cities (7 major)
- Kenya: ${stats[Country.kenya]} cities (5 major)
- Tanzania: ${stats[Country.tanzania]} cities (4 major)
- Uganda: ${stats[Country.uganda]} cities (4 major)
- Nigeria: ${stats[Country.nigeria]} cities (7 major)
Total: ${Cities.totalCities} cities across 5 countries
    ''';
  }
}
