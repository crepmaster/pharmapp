import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:pharmapp_unified/screens/auth/unified_registration_screen.dart';
import 'package:pharmapp_unified/blocs/unified_auth_bloc.dart';
import 'package:pharmapp_shared/services/unified_auth_service.dart';
import 'package:pharmapp_shared/models/country_config.dart';

void main() {
  Widget createTestWidget(UserType userType) {
    return MaterialApp(
      home: BlocProvider<UnifiedAuthBloc>(
        create: (context) => UnifiedAuthBloc(),
        child: UnifiedRegistrationScreen(
          userType: userType,
          selectedCountry: Country.cameroon,
          selectedCity: 'Douala',
        ),
      ),
    );
  }

  group('UnifiedRegistrationScreen - Common Fields', () {
    testWidgets('renders all common fields for pharmacy', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.pharmacy));

      // Check common fields
      expect(find.text('Email'), findsOneWidget);
      expect(find.text('Password'), findsOneWidget);
      expect(find.text('Confirm Password'), findsOneWidget);
      expect(find.text('Phone Number'), findsOneWidget);
    });

    testWidgets('renders all common fields for courier', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.courier));

      // Check common fields
      expect(find.text('Email'), findsOneWidget);
      expect(find.text('Password'), findsOneWidget);
      expect(find.text('Confirm Password'), findsOneWidget);
      expect(find.text('Phone Number'), findsOneWidget);
    });

    testWidgets('renders all common fields for admin', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.admin));

      // Check common fields
      expect(find.text('Email'), findsOneWidget);
      expect(find.text('Password'), findsOneWidget);
      expect(find.text('Confirm Password'), findsOneWidget);
      expect(find.text('Phone Number'), findsOneWidget);
    });

    testWidgets('shows step indicator with correct location', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.pharmacy));

      expect(find.text('Step 2 of 2: Complete Registration'), findsOneWidget);
      expect(find.text('Location: Douala, Cameroon'), findsOneWidget);
    });
  });

  group('UnifiedRegistrationScreen - Pharmacy Fields', () {
    testWidgets('renders pharmacy-specific fields', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.pharmacy));

      // Check section header
      expect(find.text('Pharmacy Details'), findsOneWidget);

      // Check pharmacy fields
      expect(find.text('Pharmacy Name'), findsOneWidget);
      expect(find.text('Address'), findsOneWidget);

      // Should NOT have courier or admin fields
      expect(find.text('Full Name'), findsNothing);
      expect(find.text('Vehicle Type'), findsNothing);
      expect(find.text('Admin Name'), findsNothing);
    });

    testWidgets('shows correct screen title for pharmacy', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.pharmacy));

      expect(find.text('Pharmacy Registration'), findsOneWidget);
    });

    testWidgets('shows correct submit button text for pharmacy',
        (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.pharmacy));

      expect(find.text('Create Pharmacy Account'), findsOneWidget);
    });
  });

  group('UnifiedRegistrationScreen - Courier Fields', () {
    testWidgets('renders courier-specific fields', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.courier));

      // Check section header
      expect(find.text('Courier Details'), findsOneWidget);

      // Check courier fields
      expect(find.text('Full Name'), findsOneWidget);
      expect(find.text('Vehicle Type'), findsOneWidget);
      expect(find.text('License Plate'), findsOneWidget);

      // Should NOT have pharmacy or admin fields
      expect(find.text('Pharmacy Name'), findsNothing);
      expect(find.text('Admin Name'), findsNothing);
    });

    testWidgets('shows correct screen title for courier', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.courier));

      expect(find.text('Courier Registration'), findsOneWidget);
    });

    testWidgets('shows correct submit button text for courier', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.courier));

      expect(find.text('Create Courier Account'), findsOneWidget);
    });

    testWidgets('vehicle type dropdown has correct options', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.courier));

      // Find and tap vehicle type dropdown
      final dropdown = find.byType(DropdownButtonFormField<String>).first;
      await tester.tap(dropdown);
      await tester.pumpAndSettle();

      // Check vehicle options
      expect(find.text('Motorcycle').hitTestable(), findsOneWidget);
      expect(find.text('Bicycle').hitTestable(), findsOneWidget);
      expect(find.text('Car').hitTestable(), findsOneWidget);
      expect(find.text('Scooter').hitTestable(), findsOneWidget);
      expect(find.text('Van').hitTestable(), findsOneWidget);
      expect(find.text('Other').hitTestable(), findsOneWidget);
    });
  });

  group('UnifiedRegistrationScreen - Admin Fields', () {
    testWidgets('renders admin-specific fields', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.admin));

      // Check section header
      expect(find.text('Admin Details'), findsOneWidget);

      // Check admin fields
      expect(find.text('Admin Name'), findsOneWidget);
      expect(find.text('Department'), findsOneWidget);

      // Should NOT have pharmacy or courier fields
      expect(find.text('Pharmacy Name'), findsNothing);
      expect(find.text('Full Name'), findsNothing);
      expect(find.text('Vehicle Type'), findsNothing);
    });

    testWidgets('shows correct screen title for admin', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.admin));

      expect(find.text('Admin Registration'), findsOneWidget);
    });

    testWidgets('shows correct submit button text for admin', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.admin));

      expect(find.text('Create Admin Account'), findsOneWidget);
    });
  });

  group('UnifiedRegistrationScreen - Payment Section', () {
    testWidgets('renders payment section', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.pharmacy));

      // Check section header
      expect(find.text('Payment Information'), findsOneWidget);

      // Check payment fields
      expect(find.text('Payment Method'), findsOneWidget);
      expect(
          find.text('Your phone number above will be used for payments'),
          findsOneWidget);
      expect(find.text('Use a different phone number for payments'),
          findsOneWidget);
    });

    testWidgets('shows payment description for pharmacy', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.pharmacy));

      expect(find.text('Select how you want to receive payments from customers'),
          findsOneWidget);
    });

    testWidgets('shows payment description for courier', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.courier));

      expect(find.text('Select how you want to receive your delivery earnings'),
          findsOneWidget);
    });

    testWidgets('shows payment description for admin', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.admin));

      expect(find.text('Select your payment method'), findsOneWidget);
    });

    testWidgets('payment phone checkbox toggles additional field',
        (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.pharmacy));

      // Initially, payment phone field should not be visible
      expect(find.text('Payment Phone Number'), findsNothing);

      // Find and tap checkbox
      final checkbox =
          find.byType(CheckboxListTile).first;
      await tester.tap(checkbox);
      await tester.pumpAndSettle();

      // Now payment phone field should be visible
      expect(find.text('Payment Phone Number'), findsOneWidget);
    });
  });

  group('UnifiedRegistrationScreen - Form Validation', () {
    testWidgets('validates email field', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.pharmacy));

      // Fill required fields except email
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Password'), 'password123');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Confirm Password'),
          'password123');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Phone Number'), '677123456');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Pharmacy Name'), 'Test Pharmacy');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Address'), '123 Main St');

      // Tap submit button
      await tester.tap(find.text('Create Pharmacy Account'));
      await tester.pumpAndSettle();

      // Should show validation error
      expect(find.text('Please enter your email'), findsOneWidget);
    });

    testWidgets('validates email format', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.pharmacy));

      // Enter invalid email
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Email'), 'invalid-email');

      // Fill other required fields
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Password'), 'password123');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Confirm Password'),
          'password123');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Phone Number'), '677123456');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Pharmacy Name'), 'Test Pharmacy');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Address'), '123 Main St');

      // Tap submit button
      await tester.tap(find.text('Create Pharmacy Account'));
      await tester.pumpAndSettle();

      // Should show validation error
      expect(find.text('Please enter a valid email'), findsOneWidget);
    });

    testWidgets('validates password length', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.pharmacy));

      // Enter short password
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Email'), 'test@test.com');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Password'), 'pass');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Confirm Password'), 'pass');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Phone Number'), '677123456');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Pharmacy Name'), 'Test Pharmacy');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Address'), '123 Main St');

      // Tap submit button
      await tester.tap(find.text('Create Pharmacy Account'));
      await tester.pumpAndSettle();

      // Should show validation error
      expect(find.text('Password must be at least 8 characters'),
          findsOneWidget);
    });

    testWidgets('validates password confirmation', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.pharmacy));

      // Enter mismatched passwords
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Email'), 'test@test.com');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Password'), 'password123');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Confirm Password'),
          'different123');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Phone Number'), '677123456');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Pharmacy Name'), 'Test Pharmacy');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Address'), '123 Main St');

      // Tap submit button
      await tester.tap(find.text('Create Pharmacy Account'));
      await tester.pumpAndSettle();

      // Should show validation error
      expect(find.text('Passwords do not match'), findsOneWidget);
    });

    testWidgets('validates phone number field', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.pharmacy));

      // Fill required fields except phone
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Email'), 'test@test.com');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Password'), 'password123');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Confirm Password'),
          'password123');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Pharmacy Name'), 'Test Pharmacy');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Address'), '123 Main St');

      // Tap submit button
      await tester.tap(find.text('Create Pharmacy Account'));
      await tester.pumpAndSettle();

      // Should show validation error
      expect(find.text('Please enter your phone number'), findsOneWidget);
    });

    testWidgets('validates pharmacy name field', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.pharmacy));

      // Fill required fields except pharmacy name
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Email'), 'test@test.com');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Password'), 'password123');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Confirm Password'),
          'password123');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Phone Number'), '677123456');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Address'), '123 Main St');

      // Tap submit button
      await tester.tap(find.text('Create Pharmacy Account'));
      await tester.pumpAndSettle();

      // Should show validation error
      expect(find.text('Please enter pharmacy name'), findsOneWidget);
    });

    testWidgets('validates courier full name field', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.courier));

      // Fill required fields except full name
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Email'), 'test@test.com');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Password'), 'password123');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Confirm Password'),
          'password123');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Phone Number'), '677123456');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'License Plate'), 'ABC-123');

      // Tap submit button
      await tester.tap(find.text('Create Courier Account'));
      await tester.pumpAndSettle();

      // Should show validation error
      expect(find.text('Please enter your full name'), findsOneWidget);
    });
  });

  group('UnifiedRegistrationScreen - Password Visibility Toggle', () {
    testWidgets('has password visibility toggle button', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.pharmacy));

      // Find password field
      final passwordField =
          find.widgetWithText(TextFormField, 'Password').first;

      // Find visibility toggle button
      final visibilityIcon = find.descendant(
        of: passwordField,
        matching: find.byType(IconButton),
      );

      expect(visibilityIcon, findsOneWidget);
    });

    testWidgets('has confirm password visibility toggle button', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.pharmacy));

      // Find confirm password field
      final confirmPasswordField =
          find.widgetWithText(TextFormField, 'Confirm Password');

      // Find visibility toggle button
      final visibilityIcon = find.descendant(
        of: confirmPasswordField,
        matching: find.byType(IconButton),
      );

      expect(visibilityIcon, findsOneWidget);
    });
  });

  group('UnifiedRegistrationScreen - Login Link', () {
    testWidgets('shows login link', (tester) async {
      await tester.pumpWidget(createTestWidget(UserType.pharmacy));

      expect(find.text('Already have an account?'), findsOneWidget);
      expect(find.text('Sign In'), findsOneWidget);
    });

    testWidgets('login link navigates back', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => BlocProvider<UnifiedAuthBloc>(
                      create: (context) => UnifiedAuthBloc(),
                      child: const UnifiedRegistrationScreen(
                        userType: UserType.pharmacy,
                        selectedCountry: Country.cameroon,
                        selectedCity: 'Douala',
                      ),
                    ),
                  ),
                );
              },
              child: const Text('Go to Registration'),
            ),
          ),
        ),
      ));

      // Navigate to registration
      await tester.tap(find.text('Go to Registration'));
      await tester.pumpAndSettle();

      // Tap Sign In link
      await tester.tap(find.text('Sign In'));
      await tester.pumpAndSettle();

      // Should navigate back
      expect(find.text('Go to Registration'), findsOneWidget);
    });
  });
}
