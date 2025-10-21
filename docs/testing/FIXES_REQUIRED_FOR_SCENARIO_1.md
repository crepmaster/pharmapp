# 🔧 REQUIRED FIXES FOR SCENARIO 1 - Registration Flow

**Created**: 2025-10-21
**Priority**: 🔴 **CRITICAL - BLOCKS ALL TESTING**
**Status**: ⏳ Awaiting Implementation

---

## 🚨 SUMMARY OF ISSUES

Three critical issues identified during Scenario 1 testing:

1. **❌ CRITICAL**: Invalid API key - Registration fails at sign-in step
2. **⚠️ MEDIUM**: No city selection proposed after choosing country
3. **⚠️ MEDIUM**: Duplicate phone number entry (asked twice)

---

## 🔧 FIX #1: Invalid API Key (CRITICAL - PRODUCTION BLOCKER)

### Problem:
Firebase authentication fails with "API key not valid" error during registration.

**Error from logcat**:
```
❌ Custom token sign in failed: [firebase_auth/unknown] An internal error has occurred.
[ API key not valid. Please pass a valid API key.
```

### Root Cause:
File: `pharmacy_app/lib/firebase_options.dart` (line 59)
```dart
apiKey: String.fromEnvironment(
  'FIREBASE_ANDROID_API_KEY',
  defaultValue: 'AIzaSyC-PLACEHOLDER-REPLACE-WITH-REAL-KEY',  // ❌ INVALID
),
```

### Solution A - FlutterFire CLI (RECOMMENDED):

```bash
# Step 1: Ensure Firebase CLI is logged in (USER MUST DO THIS MANUALLY)
firebase login

# Step 2: Install FlutterFire CLI
dart pub global activate flutterfire_cli

# Step 3: Configure Firebase for pharmacy_app
cd pharmacy_app
flutterfire configure --project=mediexchange --platforms=android,ios,web

# This generates lib/firebase_options.dart with REAL API keys
```

**Benefits**:
- Official Firebase tool
- Generates all platforms automatically
- Creates google-services.json for Android
- Creates GoogleService-Info.plist for iOS
- Updates configurations correctly

### Solution B - Manual google-services.json (FALLBACK):

1. Open Firebase Console: https://console.firebase.google.com/project/mediexchange
2. Navigate to: Project Settings → General → Your apps
3. Find Android app: package `com.pharmapp.pharmacy`
4. Download `google-services.json`
5. Place in: `pharmacy_app/android/app/google-services.json`

Then Flutter will automatically use credentials from this file.

### Solution C - Environment Variables (CI/CD):

Add to build command:
```bash
flutter run -d emulator-5554 \
  --dart-define=FIREBASE_ANDROID_API_KEY=AIzaSyDrM96tzLwGkVaCvqEP9cWAXZYqvOEGyAs \
  --dart-define=FIREBASE_ANDROID_APP_ID=1:850077575356:android:67c7130629f17dd57708b9
```

### Verification:
After fix, registration should complete without "API key" error.

---

## 🔧 FIX #2: Add City Selection to Registration Flow

### Problem:
User reported: "when i choose the country, no city was proposed"

**Current flow**:
1. User selects Country (Cameroon) ✅
2. User selects Payment Method (MTN/Orange) ✅
3. User enters payment phone ✅
4. **MISSING**: No city dropdown appears
5. Registration form only has text field for "address"

### Expected Behavior:
After selecting Cameroon, show dropdown with cities:
- Douala
- Yaoundé
- Bafoussam
- Bamenda
- Garoua
- Maroua
- Ngaoundéré
- Bertoua
- Kumba
- Limbe

### Implementation Plan:

#### Step 1: Add Cities to CountryConfig

Edit `shared/lib/models/country_config.dart`:

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

#### Step 2: Update Countries Class with City Lists

Add to `shared/lib/models/country_config.dart`:

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

  // Repeat for kenya, tanzania, uganda, nigeria with their cities
}
```

#### Step 3: Add City Dropdown to CountryPaymentSelectionScreen

Edit `shared/lib/screens/auth/country_payment_selection_screen.dart`:

Add state variable:
```dart
String? _selectedCity;
```

Add UI section after country selection card:
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

Add method:
```dart
Widget _buildCityDropdown() {
  return DropdownButtonFormField<String>(
    value: _selectedCity,
    decoration: InputDecoration(
      labelText: 'City',
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      filled: true,
      fillColor: Colors.white,
    ),
    items: _countryConfig!.majorCities.map((city) {
      return DropdownMenuItem(value: city, child: Text(city));
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

#### Step 4: Pass City to PaymentPreferences

Update `_submit()` method:
```dart
final preferences = PaymentPreferences.createSecure(
  method: _selectedOperator!.toString().split('.').last,
  phoneNumber: phoneNumber,
  country: _selectedCountry,
  operator: _selectedOperator,
  city: _selectedCity,  // ✅ ADD THIS
  isSetupComplete: true,
);
```

#### Step 5: Update PaymentPreferences Model

Edit `shared/lib/models/payment_preferences.dart`:

Add field:
```dart
final String? city;
```

Update `createSecure` factory:
```dart
factory PaymentPreferences.createSecure({
  required String method,
  required String phoneNumber,
  Country? country,
  PaymentOperator? operator,
  String? city,  // ✅ ADD THIS
  bool autoPayFromWallet = false,
  bool isSetupComplete = false,
}) {
  // ... existing encryption logic ...
  return PaymentPreferences(
    method: method,
    encryptedPhone: encrypted,
    phoneHash: hash,
    maskedPhone: masked,
    autoPayFromWallet: autoPayFromWallet,
    isSetupComplete: isSetupComplete,
    country: country,
    operator: operator,
    city: city,  // ✅ ADD THIS
  );
}
```

Update `toMap()`:
```dart
Map<String, dynamic> toMap() {
  return {
    'method': method,
    'encryptedPhone': encryptedPhone,
    'phoneHash': phoneHash,
    'maskedPhone': maskedPhone,
    'autoPayFromWallet': autoPayFromWallet,
    'isSetupComplete': isSetupComplete,
    'country': country?.toString().split('.').last,
    'operator': operator?.toString().split('.').last,
    'city': city,  // ✅ ADD THIS
  };
}
```

### Verification:
After fix, city dropdown should appear and selected city should be saved to Firestore.

---

## 🔧 FIX #3: Remove Duplicate Phone Number Entry

### Problem:
User enters phone number TWICE:
1. **Screen 1** (Payment Selection): Enters payment phone (677123456)
2. **Screen 2** (Registration Form): Asked to enter phone again

### Solution A - Auto-populate Phone (RECOMMENDED):

#### Step 1: Pass Phone from Screen 1 to Screen 2

Edit `pharmacy_app/lib/screens/auth/register_screen.dart`:

Update `_showCountrySelection()` method:
```dart
void _showCountrySelection() async {
  final result = await Navigator.of(context).push<PaymentPreferences>(
    MaterialPageRoute(
      builder: (context) => CountryPaymentSelectionScreen(
        title: 'Step 1: Select Your Country & Payment',
        subtitle: 'This determines your currency, phone format, and payment operators',
        allowSkip: false,
        onPaymentMethodSelected: (preferences) {
          _paymentPreferences = preferences;
          Navigator.of(context).pop(preferences);
        },
      ),
    ),
  );

  if (result != null) {
    setState(() {
      _paymentPreferences = result;
      _currentStep = 1; // Move to pharmacy details form

      // ✅ AUTO-POPULATE PHONE from payment preferences
      if (result.encryptedPhone != null && result.encryptedPhone!.isNotEmpty) {
        // Get the original phone from maskedPhone or decrypt
        // For now, use maskedPhone or ask user to re-enter (but pre-fill if possible)
        _phoneController.text = ''; // Will be filled by user or from memory
      }
    });
  }
}
```

**Issue with this approach**: Payment phone is encrypted, we can't decrypt it for display.

#### Step 2: Store Original Phone Temporarily

Better approach - pass original phone before encryption:

Edit `CountryPaymentSelectionScreen._submit()`:
```dart
Future<void> _submit() async {
  // ... existing validation ...

  final phoneNumber = _phoneController.text.trim().replaceAll(RegExp(r'[^\d+]'), '');

  // Create secure payment preferences
  final preferences = PaymentPreferences.createSecure(
    method: _selectedOperator!.toString().split('.').last,
    phoneNumber: phoneNumber,  // Store original for form pre-fill
    country: _selectedCountry,
    operator: _selectedOperator,
    city: _selectedCity,
    isSetupComplete: true,
  );

  // ✅ ADD: Store unencrypted phone temporarily for form pre-fill
  preferences.temporaryPhone = phoneNumber; // For UI use only

  widget.onPaymentMethodSelected(preferences);
}
```

Then in `register_screen.dart`:
```dart
if (result != null && result.temporaryPhone != null) {
  _phoneController.text = result.temporaryPhone!;
}
```

### Solution B - Remove Phone from Screen 1 (SIMPLER):

**Pros**: Cleaner UX, no duplication
**Cons**: Payment phone and registration phone MUST be the same

Remove phone number input from `CountryPaymentSelectionScreen` entirely.
Ask for phone only in registration form.
Then use that phone for both registration AND payment preferences.

### Recommendation:
Implement **Solution A** (auto-populate) because:
- Payment phone and registration phone may be different
- User can edit if needed
- Better for business use case (pharmacy owner vs payment account)

### Verification:
After fix, phone from Screen 1 should appear in Screen 2, but be editable.

---

## 📋 TESTING CHECKLIST AFTER FIXES

### Fix #1 - API Key:
- [ ] App builds without errors
- [ ] Registration completes successfully
- [ ] NO "API key not valid" error
- [ ] User navigates to dashboard after registration
- [ ] Firebase Authentication creates user
- [ ] Firestore pharmacy document created

### Fix #2 - City Selection:
- [ ] City dropdown appears after selecting country
- [ ] Cameroon shows 10+ cities (Douala, Yaoundé, etc.)
- [ ] City selection is required (validation works)
- [ ] Selected city saved to `PaymentPreferences`
- [ ] City stored in Firestore pharmacy document

### Fix #3 - Phone Auto-populate:
- [ ] Payment phone entered in Screen 1
- [ ] Phone auto-populated in Screen 2
- [ ] Phone is editable in Screen 2
- [ ] Both phones stored correctly:
  - Payment phone: encrypted
  - Registration phone: as entered

---

## 🚀 IMPLEMENTATION ORDER

**Priority 1 - FIX IMMEDIATELY**:
1. ✅ Fix API key (Option A: FlutterFire CLI or Option B: google-services.json)
2. ✅ Rebuild app and verify registration works

**Priority 2 - FIX BEFORE RE-TEST**:
3. ✅ Add city configuration to CountryConfig
4. ✅ Add city dropdown to CountryPaymentSelectionScreen
5. ✅ Update PaymentPreferences model to store city
6. ✅ Auto-populate phone from Screen 1 to Screen 2

**Priority 3 - VERIFICATION**:
7. ✅ Re-run Scenario 1 test end-to-end
8. ✅ Verify all 3 issues are resolved
9. ✅ Capture screenshots for evidence
10. ✅ Update test reports with PASS status

---

## 🧑‍💻 DEVELOPER ASSIGNMENT

**@Codeur (Developer)**:
- [ ] Implement Fix #1 (API key) - **URGENT**
- [ ] Implement Fix #2 (City selection)
- [ ] Implement Fix #3 (Phone auto-populate)
- [ ] Test all fixes on Android emulator
- [ ] Create git commit with fixes
- [ ] Submit to code reviewer

**@Reviewer (Code Reviewer)**:
- [ ] Review API key configuration approach
- [ ] Review city selection implementation
- [ ] Review phone auto-populate logic
- [ ] Verify security: payment phone still encrypted
- [ ] Approve or request changes

**@Testeur (Tester)**:
- [ ] WAIT for fixes to be deployed
- [ ] Re-run Scenario 1 with fresh test data
- [ ] Verify all 3 issues resolved
- [ ] Capture all required screenshots
- [ ] Update test reports

**@Chef (Program Manager)**:
- [ ] Prioritize these fixes (CRITICAL)
- [ ] Ensure fixes deployed today
- [ ] Schedule re-test after deployment

---

**Document Status**: ✅ Ready for Implementation
**Urgency**: 🔴 **CRITICAL - FIX TODAY**
**Estimated Time**: 2-4 hours (all fixes)
**Blocks**: All Android testing for pharmacy_app

---

**Related Documents**:
- [SCENARIO_1_TEST_FAILURE_REPORT.md](SCENARIO_1_TEST_FAILURE_REPORT.md) - Detailed test failure analysis
- [SETUP_FIREBASE_ANDROID.md](../../SETUP_FIREBASE_ANDROID.md) - Firebase setup guide
- [NEXT_SESSION_TEST_PLAN.md](NEXT_SESSION_TEST_PLAN.md) - Master test plan
