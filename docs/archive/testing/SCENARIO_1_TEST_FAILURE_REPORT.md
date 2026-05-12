# 🚨 SCENARIO 1 TEST FAILURE REPORT

**Test Date**: 2025-10-21
**Tester**: User
**App**: pharmacy_app
**Emulator**: Pixel 9a (emulator-5554)
**Test Status**: ❌ **FAILED** (3 critical issues)

---

## 📋 ISSUES IDENTIFIED

### ❌ CRITICAL ISSUE #1: Invalid API Key - Registration Fails at Sign-In

**Severity**: 🔴 **CRITICAL - PRODUCTION BLOCKER**

**Error Message**:
```
❌ Custom token sign in failed: [firebase_auth/unknown] An internal error has occurred.
[ API key not valid. Please pass a valid API key.
❌ AUTH: Registration failed with error: Exception: Registration failed. Please try again.
```

**What Happened**:
1. ✅ User filled registration form successfully
2. ✅ Backend Firebase Function created user (UID: `5alQ85VL1pb3GXxPNeIUcO0ZFrJ3`)
3. ✅ Backend returned custom token
4. ❌ **Frontend sign-in FAILED** due to invalid API key
5. ❌ User sees error message on screen
6. ✅ Pharmacy exists in Firebase BUT user cannot log in

**Root Cause**:
- File: `pharmacy_app/lib/firebase_options.dart`
- Line 59: `defaultValue: 'AIzaSyC-PLACEHOLDER-REPLACE-WITH-REAL-KEY'`
- Android API key is still a PLACEHOLDER
- This was intentional for security (see CLAUDE.md testing procedures)
- However, it blocks actual testing on Android emulator

**Impact**:
- **Registration appears to fail** (user perspective)
- User cannot access the app after registration
- Pharmacy data IS created in Firebase (backend works)
- User sees error message instead of dashboard

**Evidence** (from logcat):
```
10-21 03:27:56.297  4641  4641 I flutter : 🔍 AuthBloc: Registration with payment preferences requested for pharmacyngousso@promoshake.net
10-21 03:28:00.143  4641  4641 I flutter : ✅ Firebase Function success, now signing in with custom token...
10-21 03:28:00.470  4641  4641 I flutter : ❌ Custom token sign in failed: API key not valid
```

---

### ⚠️ ISSUE #2: No City Proposed After Country Selection

**Severity**: 🟡 **MEDIUM - UX/FUNCTIONALITY ISSUE**

**User Feedback**:
> "when i choose the country, the no city where proposed"

**Expected Behavior**:
- After selecting country (Cameroon), user should see city dropdown/selection
- Cities like: Douala, Yaoundé, Bafoussam, Bamenda, etc.

**Actual Behavior**:
- No city selection appears
- Registration form only shows text input for "address"

**Root Cause** (suspected):
- Registration form doesn't have dedicated city selection field
- Country selection may not trigger city list population
- Needs investigation of country/city integration

**Impact**:
- City-based courier grouping won't work correctly
- Manual text entry for city instead of dropdown
- Inconsistent city names across pharmacies

---

### ⚠️ ISSUE #3: Duplicate Phone Number Entry

**Severity**: 🟡 **MEDIUM - UX ISSUE**

**User Feedback**:
> "after i have enter the phone number in the first screen i've asked to add it again. the value should come from the first screen or we can decide not to put the phone in the first screen"

**What Happened**:
- **Screen 1** (Country/Payment Selection): User enters payment phone (677123456)
- **Screen 2** (Registration Form): User asked to enter phone number AGAIN

**Expected Behavior** (two valid options):

**Option A**: Carry phone from Screen 1 to Screen 2
- Payment phone entered in Screen 1
- Auto-populate registration phone in Screen 2
- Allow editing if needed

**Option B**: Remove phone from Screen 1
- Only ask for payment phone in Screen 2
- Simpler flow, single entry point
- Less confusing for users

**Current Behavior**:
- Asks for phone TWICE
- No data transfer between screens
- Confusing and redundant for users

**Impact**:
- Poor user experience
- Extra typing for users
- Potential data inconsistency (different phones)

---

## 🧪 PARTIAL SUCCESS

Despite failures, some things WORKED:

✅ **Backend Firebase Function**: Created user successfully
✅ **User UID Generated**: `5alQ85VL1pb3GXxPNeIUcO0ZFrJ3`
✅ **Custom Token Returned**: Backend authentication working
✅ **Pharmacy Data**: Stored in Firebase (confirmed by user)
✅ **Registration Form UI**: All fields accessible and functional
✅ **Payment Selection UI**: Country and payment method selection works
✅ **Scrolling Discovery**: Continue button appears after scrolling (not a bug)

---

## 🛠️ REQUIRED FIXES

### Fix Priority #1: API Key Configuration

**Option A - Environment Variables** (RECOMMENDED for development):
```dart
// Add flutter run with --dart-define
flutter run -d emulator-5554 \
  --dart-define=FIREBASE_ANDROID_API_KEY=AIzaSyDrM96tzLwGkVaCvqEP9cWAXZYqvOEGyAs \
  --dart-define=FIREBASE_ANDROID_APP_ID=1:850077575356:android:67c7130629f17dd57708b9
```

**Option B - Temporary Hardcode** (for testing only):
```dart
// pharmacy_app/lib/firebase_options.dart line 59
apiKey: 'AIzaSyDrM96tzLwGkVaCvqEP9cWAXZYqvOEGyAs', // TESTING ONLY
```

**Option C - google-services.json** (standard Android approach):
- Download from Firebase Console
- Place in `pharmacy_app/android/app/google-services.json`
- FlutterFire automatically reads it

### Fix Priority #2: City Selection Integration

**Investigation needed**:
1. Check if `CountryPaymentSelectionScreen` has city selection logic
2. Verify `Countries.cameroon` config includes cities
3. Add city dropdown UI if missing
4. Pass selected city to registration form

### Fix Priority #3: Phone Number Flow

**Recommended approach**:
- **Keep payment phone in Screen 1** (necessary for encrypted preferences)
- **Auto-populate registration phone in Screen 2** from payment phone
- Allow editing in Screen 2 (in case phones are different)

---

## 📊 TEST VERDICT

**Overall Status**: ❌ **FAILED - CANNOT PROCEED**

### Critical Blockers:
1. ❌ **API Key Invalid** - Users cannot sign in after registration
2. ⚠️ **City Selection Missing** - Business logic impacted
3. ⚠️ **Duplicate Phone Entry** - Poor UX

### Next Steps:
1. ✅ Fix API key configuration (URGENT)
2. ✅ Implement city selection in registration flow
3. ✅ Auto-populate phone number from payment screen
4. ✅ Submit fixes to code reviewer (@Reviewer)
5. ⏳ Re-run Scenario 1 test after fixes deployed
6. ⏳ Verify all 3 issues resolved

---

## 🔍 VERIFICATION CHECKLIST (Post-Fix)

After fixes are deployed, verify:

- [ ] **API Key Works**: Registration completes without "invalid API key" error
- [ ] **User Can Sign In**: After registration, app navigates to dashboard
- [ ] **City Selection Appears**: Dropdown shows Cameroon cities after country selection
- [ ] **City Stored**: Selected city saved to Firestore pharmacy document
- [ ] **Phone Auto-populated**: Payment phone from Screen 1 appears in Screen 2
- [ ] **Phone Editable**: User can change phone in Screen 2 if needed
- [ ] **Encryption Works**: Payment phone still encrypted in Firestore
- [ ] **No Errors**: Clean registration from start to dashboard

---

## 📁 EVIDENCE FILES

**Test performed but evidence NOT collected due to failures**:

**Missing Screenshots**:
- ❌ 01_pharmacy_app_launch.png (not captured)
- ❌ 02_country_selection.png (not captured)
- ❌ 03_payment_selection.png (not captured)
- ❌ 04_registration_form.png (not captured)
- ❌ 05_error_message.png (should have been captured!)
- ❌ 06-11 Firebase verification screenshots

**Available Evidence**:
- ✅ **Logcat Output**: Saved above with exact error messages
- ✅ **User Confirmation**: "the pharmacy is created in firebase"
- ✅ **User UID**: 5alQ85VL1pb3GXxPNeIUcO0ZFrJ3

---

## 🚀 ACTION ITEMS FOR DEVELOPMENT TEAM

### For @Codeur (Developer):
1. Fix API key in `pharmacy_app/lib/firebase_options.dart`
2. Investigate city selection in country screen
3. Implement phone number auto-population
4. Test all fixes on emulator

### For @Reviewer (Code Reviewer):
1. Review API key security approach
2. Verify city selection implementation
3. Check phone number data flow between screens
4. Approve or request changes

### For @Testeur (Tester):
1. **WAIT** for fixes before re-running Scenario 1
2. Prepare fresh test data for re-test
3. Capture ALL screenshots during re-test
4. Verify all 3 issues are resolved

### For @Chef (Program Manager):
1. Decide on API key management strategy (env vars vs google-services.json)
2. Prioritize fix deployment
3. Schedule re-test after fixes deployed

---

**Document Version**: 1.0
**Created**: 2025-10-21 01:30 UTC
**Status**: ⏳ Awaiting fixes from development team
**Test Can Resume**: ❌ NO - blocked by API key issue

**Related Documents**:
- [NEXT_SESSION_TEST_PLAN.md](NEXT_SESSION_TEST_PLAN.md) - Master test plan
- [SCENARIO_1_MANUAL_CHECKLIST.md](NEXT_SESSION_TEST_PLAN.md#scenario-1) - Full test checklist
- [CLAUDE.md](../CLAUDE.md#testing-phase-workflow) - Testing phase procedures

---

**Emergency Contact**: If unable to fix, escalate to project lead for firebase login assistance
