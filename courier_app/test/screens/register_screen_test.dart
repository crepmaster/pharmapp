import 'package:flutter_test/flutter_test.dart';
import 'package:courier_app/screens/auth/register_screen.dart';
import 'package:pharmapp_shared/models/country_config.dart';

void main() {
  group('Phone Storage Tests - Courier App', () {
    test('RegisterScreen accepts country and city parameters', () {
      // Verify the widget accepts the required parameters
      const screen = RegisterScreen(
        selectedCountry: Country.cameroon,
        selectedCity: 'Douala',
      );

      expect(screen.selectedCountry, Country.cameroon);
      expect(screen.selectedCity, 'Douala');
    });

    test('RegisterScreen can be created with null city', () {
      // Verify optional parameters work
      const screen = RegisterScreen(
        selectedCountry: Country.cameroon,
        selectedCity: null,
      );

      expect(screen.selectedCountry, Country.cameroon);
      expect(screen.selectedCity, isNull);
    });

    test('RegisterScreen can be created with no parameters', () {
      // Verify all parameters are optional
      const screen = RegisterScreen();

      expect(screen.selectedCountry, isNull);
      expect(screen.selectedCity, isNull);
    });
  });

  group('City and Operator Data Flow Tests', () {
    test('Multiple cities available in Cameroon', () {
      expect(Countries.cameroon.majorCities.length, greaterThan(5));
      expect(Countries.cameroon.majorCities, contains('Douala'));
      expect(Countries.cameroon.majorCities, contains('Yaoundé'));
    });

    test('Cameroon has MTN and Orange operators', () {
      expect(Countries.cameroon.availableOperators,
          contains(PaymentOperator.mtnCameroon));
      expect(Countries.cameroon.availableOperators,
          contains(PaymentOperator.orangeCameroon));
    });

    test('All countries configured have cities', () {
      for (final country in Countries.all) {
        expect(country.majorCities, isNotEmpty,
            reason: 'Country ${country.name} should have cities for courier operations');
      }
    });
  });
}
