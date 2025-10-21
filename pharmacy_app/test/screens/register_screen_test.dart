import 'package:flutter_test/flutter_test.dart';
import 'package:pharmacy_app/screens/auth/register_screen.dart';
import 'package:pharmapp_shared/models/country_config.dart';

void main() {
  group('Phone Storage Tests - Pharmacy App', () {
    test('RegisterScreen accepts city parameter', () {
      // Verify the widget accepts the required parameters
      final screen = RegisterScreen(
        selectedCountry: Country.cameroon,
        selectedCity: 'Douala',
        selectedOperator: PaymentOperator.mtnCameroon,
      );

      expect(screen.selectedCountry, Country.cameroon);
      expect(screen.selectedCity, 'Douala');
      expect(screen.selectedOperator, PaymentOperator.mtnCameroon);
    });

    test('RegisterScreen can be created with null city', () {
      // Verify optional parameters work
      final screen = RegisterScreen(
        selectedCountry: Country.cameroon,
        selectedCity: null,
        selectedOperator: null,
      );

      expect(screen.selectedCountry, Country.cameroon);
      expect(screen.selectedCity, isNull);
      expect(screen.selectedOperator, isNull);
    });

    test('RegisterScreen can be created with no parameters', () {
      // Verify all parameters are optional
      const screen = RegisterScreen();

      expect(screen.selectedCountry, isNull);
      expect(screen.selectedCity, isNull);
      expect(screen.selectedOperator, isNull);
    });
  });

  group('Country and City Integration Tests', () {
    test('Cameroon country has Douala city', () {
      expect(Countries.cameroon.majorCities, contains('Douala'));
    });

    test('Kenya country has Nairobi city', () {
      expect(Countries.kenya.majorCities, contains('Nairobi'));
    });

    test('All countries have payment operators', () {
      for (final country in Countries.all) {
        expect(country.availableOperators, isNotEmpty,
            reason: 'Country ${country.name} should have payment operators');
      }
    });
  });
}
