import 'package:flutter_test/flutter_test.dart';
import 'package:pharmapp_shared/models/country_config.dart';

void main() {
  group('CountryConfig Cities Tests', () {
    test('Cameroon has 10 major cities', () {
      expect(Countries.cameroon.majorCities.length, 10);
      expect(Countries.cameroon.majorCities, contains('Douala'));
      expect(Countries.cameroon.majorCities, contains('Yaoundé'));
      expect(Countries.cameroon.majorCities, contains('Bafoussam'));
      expect(Countries.cameroon.majorCities, contains('Garoua'));
    });

    test('Kenya has 5 major cities', () {
      expect(Countries.kenya.majorCities.length, 5);
      expect(Countries.kenya.majorCities, contains('Nairobi'));
      expect(Countries.kenya.majorCities, contains('Mombasa'));
      expect(Countries.kenya.majorCities, contains('Kisumu'));
    });

    test('Nigeria has 5 major cities', () {
      expect(Countries.nigeria.majorCities.length, 5);
      expect(Countries.nigeria.majorCities, contains('Lagos'));
      expect(Countries.nigeria.majorCities, contains('Abuja'));
      expect(Countries.nigeria.majorCities, contains('Kano'));
    });

    test('Tanzania has 5 major cities', () {
      expect(Countries.tanzania.majorCities.length, 5);
      expect(Countries.tanzania.majorCities, contains('Dar es Salaam'));
    });

    test('All countries have city lists', () {
      for (final country in Countries.all) {
        expect(country.majorCities.isNotEmpty, true,
            reason: '${country.name} should have cities');
        expect(country.majorCities.length, greaterThanOrEqualTo(5),
            reason: '${country.name} should have at least 5 cities');
      }
    });

    test('Cities are unique per country', () {
      for (final country in Countries.all) {
        final citySet = country.majorCities.toSet();
        expect(citySet.length, equals(country.majorCities.length),
            reason: '${country.name} should not have duplicate cities');
      }
    });

    test('Cameroon cities are in logical order', () {
      final cities = Countries.cameroon.majorCities;
      // Major cities should come first
      expect(cities.indexOf('Douala'), lessThan(5),
          reason: 'Douala (largest city) should be in top 5');
      expect(cities.indexOf('Yaoundé'), lessThan(5),
          reason: 'Yaoundé (capital) should be in top 5');
    });
  });
}
