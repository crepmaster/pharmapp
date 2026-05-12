# 🧪 Scenario 1 Testing Guide - Ready to Test!

**Date**: 2025-10-21
**Status**: ✅ ALL FIXES COMPLETE - READY FOR TESTING
**Apps**: pharmacy_app + courier_app (both apps)

---

## ✅ **PRE-TEST VERIFICATION COMPLETE**

### Build Status
- ✅ pharmacy_app: Builds successfully
- ✅ courier_app: Builds successfully (CRITICAL fix applied)
- ✅ All unit tests: 19/19 PASSING
- ✅ Flutter analyze: 0 critical errors
- ✅ Code review issues: ALL RESOLVED

### Fixes Implemented
1. ✅ **Fix #1**: Firebase API keys configured for Android (both apps)
2. ✅ **Fix #2**: City dropdown after country selection (both apps)
3. ✅ **Fix #3**: Phone only on second screen (both apps)

---

## 🚀 **HOW TO START TESTING**

### Step 0: Start Android Emulator

**Option A - Flutter Command (Easiest)**:
```bash
# Flutter will start emulator automatically
cd pharmacy_app
flutter run
```

**Option B - Manual Start**:
```bash
# Start emulator first
flutter emulators --launch Pixel_9a

# Wait 1-2 minutes for boot

# Verify emulator is ready
adb devices
# Should show: emulator-5554   device

# Then launch app
cd pharmacy_app
flutter run -d emulator-5554
```

**Option C - VS Code**:
1. Open VS Code
2. Bottom-right corner: Click device selector
3. Select "Pixel 9a (mobile)"
4. Press F5 or Run > Start Debugging

---

## 📋 **SCENARIO 1: Pharmacy Registration**

### Test Objective
Register a new pharmacy with complete profile including payment preferences.

### Test Steps

#### Step 1: Launch pharmacy_app
```bash
cd pharmacy_app
flutter run
```

**Expected**: App launches, shows login/registration screen

---

#### Step 2: Navigate to Registration
- Tap "Create Account" or "Register" button

**Expected**: Country/Payment selection screen appears

---

#### Step 3: Select Country (Cameroon)
- Tap "Select Country" dropdown or button
- Select "Cameroon"

**Expected Result**:
- ✅ Country selected: Cameroon
- ✅ Currency displayed: XAF (FCFA)
- ✅ **NEW**: City dropdown appears IMMEDIATELY after country selection

---

#### Step 4: Verify City Dropdown Appears ⭐ **NEW TEST**
**This is the Fix #2 verification**

**Expected**:
- ✅ City dropdown/selector appears below country
- ✅ Label shows: "Select Your City" or "City"
- ✅ Dropdown contains Cameroon cities:
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

**Test Action**:
- Tap city dropdown
- Verify cities appear
- Select "Douala"

**Screenshot**: Capture this screen (city dropdown visible)

---

#### Step 5: Select Payment Operator
- Select "MTN Mobile Money"

**Expected**:
- ✅ MTN operator selected
- ✅ Phone number prefix shown: +237 (Cameroon code)

---

#### Step 6: Verify NO Phone Entry on Screen 1 ⭐ **NEW TEST**
**This is the Fix #3 verification**

**Expected**:
- ❌ NO phone number field on this screen
- ✅ Only: Country, City, Payment Operator
- ✅ "Continue" or "Next" button appears

**If you see a phone field**: ❌ FAIL - Report bug

**Test Action**:
- Tap "Continue" or "Next"

---

#### Step 7: Registration Form (Screen 2)
**Expected fields**:
- Pharmacy Name
- Email
- Password
- **Phone Number** ⭐ (This is the ONLY screen where phone appears)
- Address
- License Number (optional)

**Verify**:
- ✅ Phone number field EXISTS on this screen
- ✅ Phone number field is EMPTY (not pre-filled)
- ✅ Selected city from Step 4 may be shown (read-only or editable)

---

#### Step 8: Fill Registration Form

**Test Data**:
```
Pharmacy Name: Test Pharmacy October 2025
Email: testpharmacy2025@promoshake.net
Password: TestPassword123!
Phone Number: +237677123456
Address: 123 Test Street, Douala
License Number: (leave empty or enter CAM-2025-001)
```

**Important**: Remember the email and password for login after!

---

#### Step 9: Submit Registration
- Tap "Register" or "Create Account"

**Expected Results**:
- ✅ Loading indicator appears
- ✅ Firebase backend creates user
- ✅ NO "API key not valid" error (Fix #1 verification)
- ✅ Registration completes successfully
- ✅ App navigates to pharmacy dashboard

**If you see "API key error"**: ❌ FAIL - Fix #1 didn't work

---

#### Step 10: Verify Firestore Data

**Open Firebase Console**:
1. Go to: https://console.firebase.google.com/project/mediexchange/firestore
2. Navigate to `pharmacies` collection
3. Find your user document (by email)

**Expected Data** (verify these fields exist):
```json
{
  "name": "Test Pharmacy October 2025",
  "email": "testpharmacy2025@promoshake.net",
  "phone": "+237677123456",  // ⭐ Phone stored
  "city": "Douala",           // ⭐ City stored (Fix #2)
  "address": "123 Test Street, Douala",
  "country": "cameroon",
  "paymentPreferences": {
    "method": "mtnCameroon",
    "encryptedPhone": "...",  // Encrypted
    "phoneHash": "...",       // Hash
    "maskedPhone": "677****56", // Masked
    "city": "Douala",         // ⭐ City in payment prefs too
    "operator": "mtnCameroon"
  },
  "subscription": { ... },
  "createdAt": "...",
  "userId": "..."
}
```

**Verify**:
- ✅ `phone` field exists and equals `+237677123456`
- ✅ `city` field exists and equals `Douala`
- ✅ `paymentPreferences.city` exists
- ✅ `paymentPreferences.encryptedPhone` exists (not plaintext)

**Screenshot**: Capture Firestore document

---

#### Step 11: Sign Out & Sign In Again

**Test persistence**:
1. In pharmacy app, sign out
2. Sign in with same credentials:
   - Email: `testpharmacy2025@promoshake.net`
   - Password: `TestPassword123!`

**Expected**:
- ✅ Login succeeds
- ✅ Dashboard loads with pharmacy data
- ✅ No errors

---

## ✅ **SUCCESS CRITERIA - Scenario 1**

All these must be TRUE for PASS:

- [ ] ✅ City dropdown appeared after country selection (Fix #2)
- [ ] ✅ City dropdown contained Cameroon cities (10 cities)
- [ ] ✅ Phone field NOT on Screen 1 (country/payment screen)
- [ ] ✅ Phone field EXISTS on Screen 2 (registration form)
- [ ] ✅ Registration completed without "API key" error (Fix #1)
- [ ] ✅ App navigated to dashboard after registration
- [ ] ✅ Firestore `pharmacies` document contains `city` field
- [ ] ✅ Firestore `pharmacies` document contains `phone` field
- [ ] ✅ Payment preferences encrypted (not plaintext)
- [ ] ✅ Sign in works after registration

**PASS/FAIL**: ___________

---

## 📸 **SCREENSHOTS TO CAPTURE**

Please capture these screenshots during testing:

1. **01_country_selection.png** - Country dropdown open
2. **02_city_dropdown_visible.png** - ⭐ City dropdown after country (Fix #2)
3. **03_payment_operator.png** - Payment operator selected
4. **04_screen1_no_phone.png** - ⭐ Screen 1 with NO phone field (Fix #3)
5. **05_registration_form.png** - Screen 2 with phone field
6. **06_registration_filled.png** - Form filled out
7. **07_dashboard.png** - Pharmacy dashboard after registration
8. **08_firestore_pharmacy.png** - Firestore pharmacy document
9. **09_firestore_payment_prefs.png** - Payment preferences (encrypted)

---

## 🔧 **IF TESTS FAIL**

### Issue: City dropdown NOT visible after country selection

**Diagnosis**:
```bash
# Check if Fix #2 was applied
cd shared
grep -n "majorCities" lib/models/country_config.dart
# Should show line with majorCities field

# Check if dropdown UI added
grep -n "buildCityDropdown" lib/screens/auth/country_payment_selection_screen.dart
# Should show method exists
```

**Fix**: Re-apply Fix #2 (city dropdown)

---

### Issue: Phone field appears on Screen 1

**Diagnosis**:
```bash
# Check if phone removed from Screen 1
cd shared
grep -n "phoneController\|Phone Number" lib/screens/auth/country_payment_selection_screen.dart
# Should NOT show phone field
```

**Fix**: Re-apply Fix #3 (remove phone from Screen 1)

---

### Issue: "API key not valid" error

**Diagnosis**:
```bash
# Check if FlutterFire configured
cd pharmacy_app
cat lib/firebase_options.dart | grep "AIzaSy"
# Should show real API key (not PLACEHOLDER)

# Check google-services.json exists
ls android/app/google-services.json
# Should exist
```

**Fix**: Re-run `flutterfire configure --project=mediexchange`

---

## 📊 **TEST REPORT TEMPLATE**

After testing, create: `docs/testing/SCENARIO_1_TEST_RESULTS.md`

```markdown
# Scenario 1 Test Results - 2025-10-21

## Summary
- **Status**: PASS / FAIL
- **Tester**: [Your Name]
- **Date**: 2025-10-21
- **App**: pharmacy_app
- **Emulator**: Pixel 9a

## Test Results

### Fix #1 - Firebase API Keys
- [ ] PASS / FAIL
- Notes: ___________

### Fix #2 - City Dropdown
- [ ] PASS / FAIL
- Cities shown: ___________
- Notes: ___________

### Fix #3 - Phone Only on Screen 2
- [ ] PASS / FAIL
- Notes: ___________

### Firestore Verification
- [ ] City stored: PASS / FAIL
- [ ] Phone stored: PASS / FAIL
- [ ] Payment encrypted: PASS / FAIL

## Issues Found
[List any bugs or problems]

## Screenshots
[Attach all 9 screenshots]

## Overall Verdict
PASS / FAIL

## Next Steps
[Scenario 2 or fix bugs]
```

---

## 🚀 **NEXT: Scenario 2 - Courier Registration**

After Scenario 1 PASSES, repeat similar test for `courier_app`:
- Same 3 fixes (city dropdown, phone location, API keys)
- Different test data (courier instead of pharmacy)
- See: `docs/testing/NEXT_SESSION_TEST_PLAN.md` Scenario 2

---

**STATUS**: ✅ READY TO TEST
**Estimated Time**: 15-20 minutes for full test
**Prerequisites**: Android emulator running

**GOOD LUCK WITH TESTING!** 🧪
