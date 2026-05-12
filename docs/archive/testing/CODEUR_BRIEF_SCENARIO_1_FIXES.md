# 🔧 CODEUR BRIEF - Scenario 1 Critical Fixes

**Date**: 2025-10-21
**From**: Chef de Projet (@Chef)
**To**: Développeur (@Codeur)
**Priority**: 🔴 **CRITICAL - PRODUCTION BLOCKER**
**Applications**: pharmacy_app + courier_app (BOTH)

---

## 🎯 MISSION OBJECTIVE

Implement **3 critical fixes** to resolve Scenario 1 test failures for **BOTH** pharmacy_app and courier_app:

1. ✅ **Fix #1**: Configure real Firebase API keys for Android
2. ✅ **Fix #2**: Add city dropdown after country selection
3. ✅ **Fix #3**: Remove duplicate phone - keep ONLY on second screen

**CRITICAL REQUIREMENT**: Create **unit tests** to verify:
- City dropdown appears AFTER country selection
- Phone number is ONLY on second screen (after country selection)
- Phone value is stored in pharmacy/courier Firestore data

---

## 📋 CONTEXT - TEST FAILURE SUMMARY

**Test**: Scenario 1 - Pharmacy Registration (Android Emulator)
**Status**: ❌ FAILED with 3 critical issues
**Blocker**: Prevents ALL testing on Android

### Issue #1: Invalid API Key - Registration Fails
**Error**: `API key not valid. Please pass a valid API key.`
**File**: `pharmacy_app/lib/firebase_options.dart` line 59
**Impact**: Users cannot sign in after registration (backend creates user, frontend fails)

### Issue #2: No City Selection After Country
**User Feedback**: "when i choose the country, no city was proposed"
**Expected**: Dropdown with cities (Douala, Yaoundé, etc.) after selecting Cameroon
**Actual**: No city dropdown appears
**Impact**: City-based courier grouping won't work

### Issue #3: Duplicate Phone Number Entry
**User Feedback**: "after i have enter the phone number in the first screen i've asked to add it again"
**Current Flow**: Phone asked in Screen 1 (payment) AND Screen 2 (registration)
**Expected**: Phone ONLY in Screen 2, stored in pharmacy/courier data
**Impact**: Poor UX, confusing users

---

## ⚠️ HISTORICAL ERRORS TO AVOID

**BEFORE YOU CODE**: Read these files from `docs/agent_knowledge/`:
- ✅ `common_mistakes.md` - Known errors to avoid
- ✅ `coding_guidelines.md` - PharmApp coding standards
- ✅ `pharmapp_patterns.md` - Validated code patterns

**Specific Warnings for This Task**:
- ⚠️ **Firebase Security**: NEVER commit real API keys to git (use FlutterFire CLI)
- ⚠️ **Model Updates**: When adding city field, update toMap(), fromMap(), AND copyWith()
- ⚠️ **Shared Package**: Changes to `shared/` affect BOTH apps - test both
- ⚠️ **Form Validation**: City dropdown must have validator (required field)
- ⚠️ **Data Flow**: Ensure city and phone stored in Firestore pharmacy/courier documents

---

## 🔧 FIX #1: Configure Firebase API Keys for Android

### Problem:
`firebase_options.dart` has placeholder API keys that don't work on Android emulator.

### Solution: Use FlutterFire CLI (RECOMMENDED)

**Step 1**: Ensure Firebase CLI is logged in
```bash
firebase login
```

**Step 2**: Install FlutterFire CLI
```bash
dart pub global activate flutterfire_cli
```

**Step 3**: Configure pharmacy_app
```bash
cd pharmacy_app
flutterfire configure --project=mediexchange --platforms=android,ios,web
```

**Step 4**: Configure courier_app
```bash
cd ../courier_app
flutterfire configure --project=mediexchange --platforms=android,ios,web
```

**What This Does**:
- Generates `lib/firebase_options.dart` with REAL API keys
- Creates `android/app/google-services.json` for Android
- Creates `ios/Runner/GoogleService-Info.plist` for iOS
- Updates all platform configurations

### Alternative: Manual google-services.json

If FlutterFire CLI fails:
1. Download `google-services.json` from Firebase Console
2. Place in `pharmacy_app/android/app/google-services.json`
3. Repeat for `courier_app/android/app/google-services.json`

### Security Note:
- **DO NOT** commit `google-services.json` (already in .gitignore)
- `firebase_options.dart` will be auto-generated (safe to commit with real keys per CLAUDE.md)

### Verification:
```bash
cd pharmacy_app
flutter run -d emulator-5554
# Registration should complete WITHOUT "API key not valid" error
```

---

## 🔧 FIX #2: Add City Dropdown After Country Selection

### Implementation Plan

#### Step 1: Add Cities to CountryConfig

**File**: `shared/lib/models/country_config.dart`

**Add field to CountryConfig class**:
```dart
class CountryConfig {
  final Country country;
  final String name;
  final String countryCode;
  final String currency;
  final String currencySymbol;
  final List<PaymentOperator> availableOperators;
  final Map<PaymentOperator, OperatorConfig> operatorConfigs;
  final List<String> majorCities; // ✅ ADD THIS

  const CountryConfig({
    required this.country,
    required this.name,
    required this.countryCode,
    required this.currency,
    required this.currencySymbol,
    required this.availableOperators,
    required this.operatorConfigs,
    required this.majorCities, // ✅ ADD THIS
  });
}
```

**Update Countries class with city lists**:
```dart
class Countries {
  static const cameroon = CountryConfig(
    country: Country.cameroon,
    name: 'Cameroon',
    countryCode: '237',
    currency: 'XAF',
    currencySymbol: 'FCFA',
    availableOperators: [PaymentOperator.mtnCameroon, PaymentOperator.orangeCameroon],
    operatorConfigs: { /* existing configs */ },
    majorCities: [  // ✅ ADD THIS
      'Douala',
      'Yaoundé',
      'Bafoussam',
      'Bamenda',
      'Garoua',
      'Maroua',
      'Ngaoundéré',
      'Bertoua',
      'Kumba',
      'Limbe',
    ],
  );

  static const kenya = CountryConfig(
    // ... existing fields ...
    majorCities: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret'],
  );

  static const tanzania = CountryConfig(
    // ... existing fields ...
    majorCities: ['Dar es Salaam', 'Dodoma', 'Mwanza', 'Arusha', 'Mbeya'],
  );

  static const uganda = CountryConfig(
    // ... existing fields ...
    majorCities: ['Kampala', 'Gulu', 'Lira', 'Mbarara', 'Jinja'],
  );

  static const nigeria = CountryConfig(
    // ... existing fields ...
    majorCities: ['Lagos', 'Abuja', 'Kano', 'Ibadan', 'Port Harcourt'],
  );
}
```

#### Step 2: Update CountryPaymentSelectionScreen

**File**: `shared/lib/screens/auth/country_payment_selection_screen.dart`

**Add state variable**:
```dart
String? _selectedCity;
```

**Add city dropdown UI** (after country selection card):
```dart
// Add after _buildSelectedCountryCard()
if (_countryConfig != null) ...[
  const SizedBox(height: 24),
  _buildSectionHeader('Select Your City'),
  const SizedBox(height: 16),
  _buildCityDropdown(),
  const SizedBox(height: 24),
],
```

**Add _buildCityDropdown method**:
```dart
Widget _buildCityDropdown() {
  return DropdownButtonFormField<String>(
    value: _selectedCity,
    decoration: InputDecoration(
      labelText: 'City',
      hintText: 'Select your city',
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      filled: true,
      fillColor: Colors.white,
      prefixIcon: Icon(Icons.location_city),
    ),
    items: _countryConfig!.majorCities.map((city) {
      return DropdownMenuItem(
        value: city,
        child: Text(city),
      );
    }).toList(),
    onChanged: (value) {
      setState(() {
        _selectedCity = value;
      });
    },
    validator: (value) {
      if (value == null || value.isEmpty) {
        return 'Please select your city';
      }
      return null;
    },
  );
}
```

**Update _submit() to pass city**:
```dart
// In _submit() method, update the navigation call
Navigator.of(context).pushReplacement(
  MaterialPageRoute(
    builder: (context) => widget.registrationScreenBuilder(
      selectedCountry: _selectedCountry!,
      selectedCity: _selectedCity!, // ✅ ADD THIS
    ),
  ),
);
```

#### Step 3: Update Registration Screens to Accept City

**Files**:
- `pharmacy_app/lib/screens/auth/register_screen.dart`
- `courier_app/lib/screens/auth/register_screen.dart`

**Update constructor**:
```dart
class RegisterScreen extends StatefulWidget {
  final Country? selectedCountry;
  final String? selectedCity; // ✅ ADD THIS

  const RegisterScreen({
    Key? key,
    this.selectedCountry,
    this.selectedCity, // ✅ ADD THIS
  }) : super(key: key);
}
```

**Store city in registration data**:
```dart
// In _handleRegistration() or equivalent
final pharmacyData = {
  'name': _nameController.text.trim(),
  'email': _emailController.text.trim(),
  'phone': _phoneController.text.trim(),
  'address': _addressController.text.trim(),
  'city': widget.selectedCity, // ✅ ADD THIS
  'country': widget.selectedCountry?.toString().split('.').last,
  // ... other fields
};
```

#### Step 4: Create Unit Test for City Dropdown

**File**: `shared/test/screens/country_payment_selection_screen_test.dart` (create if not exists)

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared/screens/auth/country_payment_selection_screen.dart';
import 'package:shared/models/country_config.dart';

void main() {
  group('City Dropdown Tests', () {
    testWidgets('City dropdown appears after selecting country', (WidgetTester tester) async {
      // Arrange
      await tester.pumpWidget(
        MaterialApp(
          home: CountryPaymentSelectionScreen(
            title: 'Test',
            subtitle: 'Test',
            onPaymentMethodSelected: (_) {},
            registrationScreenBuilder: (_, __) => Container(),
          ),
        ),
      );

      // Act - Select Cameroon
      await tester.tap(find.text('Cameroon'));
      await tester.pumpAndSettle();

      // Assert - City dropdown should appear
      expect(find.byType(DropdownButtonFormField<String>), findsOneWidget);
      expect(find.text('Select your city'), findsOneWidget);

      // Assert - Cameroon cities should be available
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      expect(find.text('Douala'), findsOneWidget);
      expect(find.text('Yaoundé'), findsOneWidget);
    });

    testWidgets('City selection is required', (WidgetTester tester) async {
      // Test that validation fails if no city selected
      // ... validation test implementation
    });
  });
}
```

### Verification Checklist:
- [ ] City dropdown appears ONLY after country selection
- [ ] Cameroon shows 10 cities (Douala, Yaoundé, etc.)
- [ ] Kenya shows 5 cities (Nairobi, Mombasa, etc.)
- [ ] City selection is required (validator works)
- [ ] Selected city passed to registration screen
- [ ] City stored in Firestore pharmacy/courier document
- [ ] Unit test passes

---

## 🔧 FIX #3: Remove Duplicate Phone - ONLY on Second Screen

### Current Problem:
User enters phone number TWICE:
1. Screen 1 (CountryPaymentSelectionScreen) - for payment preferences
2. Screen 2 (RegisterScreen) - for registration

### User Requirement:
**Phone number ONLY in the second screen** (after country selection)
**Value stored in pharmacy/courier Firestore data**

### Implementation Plan

#### Step 1: Remove Phone from CountryPaymentSelectionScreen

**File**: `shared/lib/screens/auth/country_payment_selection_screen.dart`

**REMOVE** the phone number input field from this screen entirely.

**What to keep**:
- ✅ Country selection
- ✅ City selection (from Fix #2)
- ✅ Payment operator selection (MTN/Orange)

**What to REMOVE**:
- ❌ Phone number TextField
- ❌ Phone validation logic
- ❌ Phone controller

**Update _submit() method**:
```dart
// OLD: Created PaymentPreferences with phone
// NEW: Pass country, city, operator to registration screen

Navigator.of(context).pushReplacement(
  MaterialPageRoute(
    builder: (context) => widget.registrationScreenBuilder(
      selectedCountry: _selectedCountry!,
      selectedCity: _selectedCity!,
      selectedOperator: _selectedOperator!, // ✅ ADD THIS
    ),
  ),
);
```

#### Step 2: Add Phone to Registration Screen

**Files**:
- `pharmacy_app/lib/screens/auth/register_screen.dart`
- `courier_app/lib/screens/auth/register_screen.dart`

**Update constructor**:
```dart
class RegisterScreen extends StatefulWidget {
  final Country? selectedCountry;
  final String? selectedCity;
  final PaymentOperator? selectedOperator; // ✅ ADD THIS

  const RegisterScreen({
    Key? key,
    this.selectedCountry,
    this.selectedCity,
    this.selectedOperator, // ✅ ADD THIS
  }) : super(key: key);
}
```

**Ensure phone TextField exists in form**:
```dart
// Phone number field (should already exist, just verify)
TextFormField(
  controller: _phoneController,
  decoration: InputDecoration(
    labelText: 'Phone Number',
    hintText: 'Enter your phone number',
    prefixIcon: Icon(Icons.phone),
  ),
  keyboardType: TextInputType.phone,
  validator: (value) {
    if (value == null || value.isEmpty) {
      return 'Please enter your phone number';
    }
    // Add phone format validation based on widget.selectedCountry
    return null;
  },
),
```

**Create PaymentPreferences in _handleRegistration()**:
```dart
// In _handleRegistration() method
final phoneNumber = _phoneController.text.trim();

// Create payment preferences with phone from registration form
final paymentPreferences = PaymentPreferences.createSecure(
  method: widget.selectedOperator!.toString().split('.').last,
  phoneNumber: phoneNumber, // ✅ From registration form
  country: widget.selectedCountry,
  operator: widget.selectedOperator,
  city: widget.selectedCity,
  isSetupComplete: true,
);

// Store pharmacy/courier data with phone
final pharmacyData = {
  'name': _nameController.text.trim(),
  'email': _emailController.text.trim(),
  'phone': phoneNumber, // ✅ Store in pharmacy data
  'address': _addressController.text.trim(),
  'city': widget.selectedCity,
  'country': widget.selectedCountry?.toString().split('.').last,
  'paymentPreferences': paymentPreferences.toMap(),
  // ... other fields
};
```

#### Step 3: Create Unit Test for Phone Storage

**File**: `pharmacy_app/test/screens/register_screen_test.dart`

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:pharmacy_app/screens/auth/register_screen.dart';

void main() {
  group('Phone Number Storage Tests', () {
    testWidgets('Phone number only appears on second screen', (WidgetTester tester) async {
      // Test that phone field exists in RegisterScreen
      // Test that phone field does NOT exist in CountryPaymentSelectionScreen
    });

    test('Phone number stored in pharmacy Firestore data', () async {
      // Mock Firestore
      // Simulate registration
      // Verify pharmacy document contains 'phone' field
      // Verify phone value matches input
    });
  });
}
```

**File**: `courier_app/test/screens/register_screen_test.dart`

```dart
// Similar test for courier app
test('Phone number stored in courier Firestore data', () async {
  // Mock Firestore
  // Simulate registration
  // Verify courier document contains 'phone' field
  // Verify phone value matches input
});
```

### Verification Checklist:
- [ ] Phone field REMOVED from CountryPaymentSelectionScreen
- [ ] Phone field EXISTS in RegisterScreen (both apps)
- [ ] Phone number stored in pharmacy Firestore document
- [ ] Phone number stored in courier Firestore document
- [ ] PaymentPreferences created with phone from registration
- [ ] Unit tests pass for phone storage
- [ ] No duplicate phone entry in user flow

---

## 🧪 UNIT TESTS REQUIREMENTS

**CRITICAL**: Create unit tests for all 3 fixes before submitting to @Reviewer.

### Test File Structure:
```
shared/test/
  screens/
    country_payment_selection_screen_test.dart  # City dropdown test
  models/
    country_config_test.dart                    # City lists test

pharmacy_app/test/
  screens/
    register_screen_test.dart                   # Phone storage test (pharmacy)

courier_app/test/
  screens/
    register_screen_test.dart                   # Phone storage test (courier)
```

### Required Tests:

#### Test 1: City Dropdown Appears After Country Selection
```dart
testWidgets('City dropdown appears after selecting country', (tester) async {
  // 1. Render CountryPaymentSelectionScreen
  // 2. Verify dropdown is NOT visible initially
  // 3. Select country (Cameroon)
  // 4. Verify city dropdown IS visible
  // 5. Verify dropdown contains expected cities
});
```

#### Test 2: Phone Only on Second Screen
```dart
testWidgets('Phone field only on registration screen', (tester) async {
  // 1. Verify CountryPaymentSelectionScreen has NO phone field
  // 2. Verify RegisterScreen HAS phone field
});
```

#### Test 3: Phone Stored in Firestore
```dart
test('Phone stored in pharmacy/courier data', () async {
  // 1. Mock Firestore
  // 2. Simulate registration with phone '677123456'
  // 3. Verify Firestore write called
  // 4. Verify document contains 'phone': '677123456'
});
```

### Run Tests:
```bash
cd shared && flutter test
cd pharmacy_app && flutter test
cd courier_app && flutter test
```

**All tests MUST pass** before submitting to @Reviewer.

---

## 📝 DELIVERABLES

### Code Files to Modify:

**Shared Package** (`shared/`):
- ✅ `lib/models/country_config.dart` - Add majorCities field + city lists
- ✅ `lib/screens/auth/country_payment_selection_screen.dart` - Add city dropdown, remove phone
- ✅ `test/screens/country_payment_selection_screen_test.dart` - City dropdown tests

**Pharmacy App** (`pharmacy_app/`):
- ✅ `lib/firebase_options.dart` - Generated by FlutterFire CLI
- ✅ `android/app/google-services.json` - Generated by FlutterFire CLI
- ✅ `lib/screens/auth/register_screen.dart` - Accept city, store phone
- ✅ `test/screens/register_screen_test.dart` - Phone storage tests

**Courier App** (`courier_app/`):
- ✅ `lib/firebase_options.dart` - Generated by FlutterFire CLI
- ✅ `android/app/google-services.json` - Generated by FlutterFire CLI
- ✅ `lib/screens/auth/register_screen.dart` - Accept city, store phone
- ✅ `test/screens/register_screen_test.dart` - Phone storage tests

### Documentation to Create:

**Required**: `docs/testing/code_explanation.md`

Template:
```markdown
# Code Explanation - Scenario 1 Fixes - 2025-10-21

## Résumé
Fixed 3 critical issues blocking Scenario 1 testing for both pharmacy_app and courier_app.

## Fichiers Modifiés
[List all modified files with line numbers]

## Décisions Importantes

### 1. Firebase API Keys - FlutterFire CLI
**Décision**: Used `flutterfire configure` instead of manual keys
**Justification**: Official Firebase tool, generates all platforms automatically
**Security**: google-services.json in .gitignore, safe API keys in firebase_options.dart

### 2. City Dropdown After Country Selection
**Décision**: Added majorCities to CountryConfig
**Justification**: City-based courier grouping requirement
**Pattern**: Dropdown validation similar to payment operator selection

### 3. Phone Only on Second Screen
**Décision**: Removed phone from CountryPaymentSelectionScreen
**Justification**: User feedback - avoid duplicate entry
**Implementation**: Phone input only in RegisterScreen, stored in pharmacy/courier data

## Code Clé
[Code snippets for critical parts]

## Tests Created
1. City dropdown appearance test - PASSED
2. Phone field location test - PASSED
3. Phone storage in Firestore test - PASSED

## Erreurs Évitées
- ✅ Real API keys committed to git (used FlutterFire CLI)
- ✅ Missing city field in Firestore (added to data model)
- ✅ Missing form validation (validators added)
- ✅ Incomplete tests (all 3 test requirements covered)

## Tests Suggérés pour @Testeur
1. Re-run Scenario 1 on Android emulator
2. Verify registration completes without API key error
3. Verify city dropdown appears after country selection
4. Verify phone only asked once (on second screen)
5. Verify city and phone stored in Firestore
```

---

## ✅ AUTO-REVIEW CHECKLIST

Before submitting to @Reviewer:

### Fix #1 - Firebase API Keys:
- [ ] FlutterFire CLI installed and working
- [ ] Both apps configured (pharmacy_app + courier_app)
- [ ] firebase_options.dart generated with real keys
- [ ] google-services.json created for Android
- [ ] google-services.json in .gitignore (verify!)
- [ ] Apps build without errors
- [ ] Test registration on emulator - no API key error

### Fix #2 - City Dropdown:
- [ ] majorCities added to CountryConfig
- [ ] All 5 countries have city lists (Cameroon, Kenya, Tanzania, Uganda, Nigeria)
- [ ] City dropdown UI added to CountryPaymentSelectionScreen
- [ ] City dropdown has validator (required field)
- [ ] City dropdown appears ONLY after country selection
- [ ] Selected city passed to RegisterScreen
- [ ] City stored in pharmacy/courier Firestore data
- [ ] Unit test created and PASSED

### Fix #3 - Phone Only on Second Screen:
- [ ] Phone field REMOVED from CountryPaymentSelectionScreen
- [ ] Phone field EXISTS in RegisterScreen
- [ ] Phone stored in pharmacy Firestore document
- [ ] Phone stored in courier Firestore document
- [ ] PaymentPreferences created with phone
- [ ] Unit tests created and PASSED
- [ ] No duplicate phone entry in user flow

### Code Quality:
- [ ] All Flutter code formatted: `dart format .`
- [ ] No analyzer warnings: `flutter analyze`
- [ ] All unit tests pass: `flutter test`
- [ ] Git commits logical and well-described
- [ ] code_explanation.md created

### Testing:
- [ ] Built pharmacy_app on Android emulator
- [ ] Built courier_app on Android emulator
- [ ] Manual smoke test: registration flow works end-to-end
- [ ] All 3 fixes verified manually

---

## 🚀 SUBMISSION TO @REVIEWER

Once all checklist items complete:

1. Create git commits (logical grouping):
   ```bash
   git add shared/lib/models/country_config.dart
   git commit -m "feat(shared): Add city lists to CountryConfig for all 5 countries"

   git add shared/lib/screens/auth/country_payment_selection_screen.dart
   git commit -m "feat(shared): Add city dropdown and remove phone field from country selection"

   git add pharmacy_app/lib/firebase_options.dart pharmacy_app/android/app/google-services.json
   git commit -m "fix(pharmacy): Configure Firebase API keys via FlutterFire CLI"

   git add courier_app/lib/firebase_options.dart courier_app/android/app/google-services.json
   git commit -m "fix(courier): Configure Firebase API keys via FlutterFire CLI"

   git add */test/*
   git commit -m "test: Add unit tests for city dropdown and phone storage"
   ```

2. Create `docs/testing/code_explanation.md` (see template above)

3. Notify @Chef:
   ```
   @Chef: Scenario 1 fixes completed and tested.
   - ✅ Fix #1: Firebase API keys configured (both apps)
   - ✅ Fix #2: City dropdown implemented with unit tests
   - ✅ Fix #3: Phone removed from Screen 1, stored in Screen 2
   - ✅ All unit tests passing
   - ✅ Manual smoke tests completed on Android emulator
   - 📝 code_explanation.md created

   Ready for @Reviewer code review.
   ```

---

## 📊 MÉTRIQUES ATTENDUES

**Taux première approbation cible**: >80%

**Erreurs à zéro**:
- ❌ Real API keys in git (use FlutterFire CLI)
- ❌ Missing validators on form fields
- ❌ Incomplete model updates (toMap/fromMap)
- ❌ Missing unit tests

**Documentation complète**: 100%
- ✅ code_explanation.md with all decisions explained
- ✅ Unit tests with clear descriptions
- ✅ Git commit messages descriptive

---

## 🆘 ASSISTANCE

If you encounter issues:

**FlutterFire CLI fails**:
- Verify Firebase CLI logged in: `firebase login`
- Check project access: `firebase projects:list`
- Alternative: Manual google-services.json download

**Unit tests fail**:
- Check Flutter SDK: `flutter doctor`
- Run single test: `flutter test test/path/to/test_file.dart`
- Add print statements for debugging

**Build errors**:
- Clean build: `flutter clean && flutter pub get`
- Check dependencies: `flutter pub outdated`
- Verify Android SDK: `flutter doctor -v`

**Questions about patterns**:
- Check `docs/agent_knowledge/pharmapp_patterns.md`
- Check `docs/agent_knowledge/coding_guidelines.md`
- Ask @Chef for clarification

---

**BON COURAGE @Codeur!** 🚀

This is a critical fix that unblocks all Android testing. Take your time, follow the patterns, and ensure all tests pass before submitting.

**Remember**: Quality on first submission is the goal. Read `common_mistakes.md` before coding!
