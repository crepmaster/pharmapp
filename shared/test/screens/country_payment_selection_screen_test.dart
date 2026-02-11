import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pharmapp_shared/screens/auth/country_payment_selection_screen.dart';
import 'package:pharmapp_shared/models/country_config.dart';

void main() {
  group('City Dropdown Tests', () {
    testWidgets('City dropdown widget type exists', (WidgetTester tester) async {
      // Arrange - Build the screen
      await tester.pumpWidget(
        MaterialApp(
          home: CountryPaymentSelectionScreen(
            title: 'Test Registration',
            subtitle: 'Select your country',
            registrationScreenBuilder: (country, city, operator) {
              return const Scaffold(body: Text('Registration'));
            },
          ),
        ),
      );

      // Act - Wait for initial build
      await tester.pumpAndSettle();

      // Assert - Since Cameroon is default, city dropdown should appear
      // Look for dropdown button form fields (city dropdown should be present)
      final dropdowns = find.byType(DropdownButtonFormField<String>);
      expect(dropdowns, findsWidgets); // Should find at least one dropdown
    });

    testWidgets('City field label exists when country selected', (WidgetTester tester) async {
      // Arrange
      await tester.pumpWidget(
        MaterialApp(
          home: CountryPaymentSelectionScreen(
            title: 'Test',
            subtitle: 'Test',
            registrationScreenBuilder: (c, ci, o) => const Scaffold(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Assert - Look for city-related text
      expect(find.text('City'), findsOneWidget);
    });
  });

  group('Country Config Integration Tests', () {
    test('Cameroon has cities configured', () {
      expect(Countries.cameroon.majorCities, isNotEmpty);
      expect(Countries.cameroon.majorCities.length, greaterThan(5));
    });

    test('All countries in Countries.all have cities', () {
      for (final country in Countries.all) {
        expect(country.majorCities, isNotEmpty,
            reason: 'Country ${country.name} should have cities configured');
      }
    });

    test('City list contains expected major cities', () {
      // Cameroon
      expect(Countries.cameroon.majorCities, contains('Douala'));
      expect(Countries.cameroon.majorCities, contains('Yaoundé'));

      // Kenya
      expect(Countries.kenya.majorCities, contains('Nairobi'));
      expect(Countries.kenya.majorCities, contains('Mombasa'));

      // Nigeria
      expect(Countries.nigeria.majorCities, contains('Lagos'));
      expect(Countries.nigeria.majorCities, contains('Abuja'));
    });
  });

  group('Payment Operator Tests', () {
    test('Cameroon has MTN and Orange operators', () {
      final cameroonOperators = Countries.cameroon.availableOperators;
      expect(cameroonOperators, contains(PaymentOperator.mtnCameroon));
      expect(cameroonOperators, contains(PaymentOperator.orangeCameroon));
    });

    test('All countries have at least one operator', () {
      for (final country in Countries.all) {
        expect(country.availableOperators, isNotEmpty,
            reason: 'Country ${country.name} should have payment operators');
      }
    });
  });
}
