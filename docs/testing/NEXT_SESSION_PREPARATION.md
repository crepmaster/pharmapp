# 🔄 NEXT SESSION PREPARATION - Scenario 1 Re-Test

**Created**: 2025-10-21
**For**: Next testing session (after API key fix)
**Purpose**: Clean slate re-test of Scenario 1 - Pharmacy Registration

---

## 🎯 SESSION OBJECTIVE

**Goal**: Re-test Scenario 1 from scratch with all fixes applied

**Expected Result**: ✅ **PASS** (complete registration without errors)

**Prerequisites**:
- ✅ API key fixed (using FlutterFire CLI)
- ✅ City selection implemented
- ✅ Phone auto-populate implemented
- ✅ Previous test data cleaned from Firebase

---

## 🧹 PRE-SESSION CLEANUP (CRITICAL)

### Step 1: Delete Previous Test Data from Firebase

**Why**: The previous test created a pharmacy that couldn't sign in. Clean it up before re-testing.

**Firebase Console Cleanup Checklist**:

#### A. Delete Authentication User

1. Open Firebase Console: https://console.firebase.google.com/project/mediexchange
2. Navigate to: **Authentication** → **Users**
3. Search for: `pharmacyngousso@promoshake.net`
4. Click the user row
5. Click **⋮** (three dots) → **Delete account**
6. Confirm deletion

**User Details to Delete**:
```
Email: pharmacyngousso@promoshake.net
UID: 5alQ85VL1pb3GXxPNeIUcO0ZFrJ3
Status: Created during failed test
```

#### B. Delete Firestore Pharmacy Document

1. Navigate to: **Firestore Database** → **Data**
2. Open collection: `pharmacies`
3. Find document with ID: `5alQ85VL1pb3GXxPNeIUcO0ZFrJ3`
4. Click document
5. Click **Delete document**
6. Confirm deletion

**Document to Delete**:
```
Collection: pharmacies
Document ID: 5alQ85VL1pb3GXxPNeIUcO0ZFrJ3
Email: pharmacyngousso@promoshake.net
Created: 2025-10-21 (from failed test)
```

#### C. Delete Firestore Wallet (if exists)

1. Navigate to: **Firestore Database** → **Data**
2. Open collection: `wallets`
3. Find document with ID: `5alQ85VL1pb3GXxPNeIUcO0ZFrJ3`
4. If exists: Click **Delete document**
5. Confirm deletion

**Wallet to Delete** (if exists):
```
Collection: wallets
Document ID: 5alQ85VL1pb3GXxPNeIUcO0ZFrJ3
Owner: pharmacyngousso@promoshake.net
Balance: 0 XAF (auto-created)
```

#### D. Verify Cleanup Complete

- [ ] Search Authentication for `pharmacyngousso@promoshake.net` → **Should find nothing**
- [ ] Search Firestore pharmacies for `5alQ85VL1pb3GXxPNeIUcO0ZFrJ3` → **Should find nothing**
- [ ] Search Firestore wallets for `5alQ85VL1pb3GXxPNeIUcO0ZFrJ3` → **Should find nothing**

---

## 📝 FRESH TEST DATA FOR RE-TEST

**Use NEW test data** (don't reuse deleted email):

### Recommended Test Data:

```
# Pharmacy Information
Pharmacy Name: Test Pharmacy October 2025
Email: testpharmacy20251021@promoshake.net
Password: TestPharm2025!
Confirm Password: TestPharm2025!

# Contact Information
Phone: +237677123456

# Location (Enhanced)
Address: Akwa, Douala
City: Douala (from dropdown - NEW!)
Country: Cameroon

# Payment Preferences
Payment Method: MTN Mobile Money
Payment Phone: 677123456
Expected Masked: 677****56

# Expected UID (Firebase will generate)
UID: [Will be auto-generated]
```

**Why New Email**:
- Firebase Authentication won't allow re-registration with deleted email for 30+ days
- Using new email ensures clean test without conflicts

**Copy-Paste Ready**:
```
Test Pharmacy October 2025
testpharmacy20251021@promoshake.net
TestPharm2025!
+237677123456
Douala
MTN Mobile Money
677123456
```

---

## ✅ PRE-SESSION VERIFICATION CHECKLIST

**Before Starting Re-Test** - Verify ALL items are complete:

### 1. API Key Fixed
- [ ] Ran `firebase login` successfully
- [ ] Ran `flutterfire configure --project=mediexchange`
- [ ] File `pharmacy_app/lib/firebase_options.dart` regenerated with real keys
- [ ] Rebuilt app: `flutter clean && flutter pub get`
- [ ] App launches without API key errors

**Verification Command**:
```bash
# Check if firebase_options.dart has real key (not placeholder)
grep "AIzaSy" pharmacy_app/lib/firebase_options.dart
# Should show: apiKey: 'AIzaSy...' (real key, not PLACEHOLDER)
```

### 2. City Selection Implemented
- [ ] City dropdown appears after selecting Cameroon
- [ ] Dropdown shows: Douala, Yaoundé, Bafoussam, etc.
- [ ] City selection is required (cannot skip)
- [ ] Selected city saved to PaymentPreferences

**Test**: Launch app, select Cameroon → Should see city dropdown

### 3. Phone Auto-Populate Implemented
- [ ] Enter payment phone in Screen 1 (Country/Payment)
- [ ] Phone appears in Screen 2 (Registration Form)
- [ ] Phone is editable in Screen 2

**Test**: Enter phone in payment screen → Should appear in registration form

### 4. Firebase Cleanup Complete
- [ ] Old pharmacy deleted (`pharmacyngousso@promoshake.net`)
- [ ] Old user deleted from Authentication
- [ ] Old wallet deleted (if existed)
- [ ] Firebase search shows nothing for old email

### 5. Emulator Ready
- [ ] Android emulator running (`adb devices` shows `emulator-5554 device`)
- [ ] If not running: `emulator -avd Pixel_9a`
- [ ] Wait for full boot (1-2 minutes)

### 6. Test Documentation Prepared
- [ ] Screenshots folder created: `docs/testing/evidence/screenshots/scenario1_retest/`
- [ ] Test checklist printed: [NEXT_SESSION_TEST_PLAN.md](NEXT_SESSION_TEST_PLAN.md)
- [ ] Fresh test data copied (see above)
- [ ] Timer ready for recording test duration

---

## 🧪 RE-TEST EXECUTION PLAN

**Follow these steps exactly**:

### STEP 0: Start Emulator (if not running)
```bash
# Check emulator status
adb devices

# If not running:
emulator -avd Pixel_9a

# Wait 1-2 minutes for boot
adb devices  # Should show: emulator-5554   device
```

### STEP 1: Launch Pharmacy App (3-5 min)
```bash
cd c:\Users\aebon\projects\pharmapp-mobile\pharmacy_app
flutter run -d emulator-5554
```

**Screenshot 01**: `01_pharmacy_app_launch.png` - App splash/home screen

### STEP 2: Navigate to Registration
- Tap "Create Account" or "Sign Up"
- **Screenshot 02**: `02_registration_start.png`

### STEP 3: Select Country & Payment (Screen 1)
- Select Country: **Cameroon**
- **Screenshot 03**: `03_country_selected.png`
- ✅ **NEW**: Verify city dropdown appears
- Select City: **Douala**
- **Screenshot 04**: `04_city_selected.png`
- Select Payment: **MTN Mobile Money**
- **Screenshot 05**: `05_payment_selected.png`
- Enter Payment Phone: **677123456**
- **Screenshot 06**: `06_payment_phone.png`
- Scroll down and tap **Continue**

### STEP 4: Complete Pharmacy Details (Screen 2)
- Pharmacy Name: `Test Pharmacy October 2025`
- Email: `testpharmacy20251021@promoshake.net`
- Phone: ✅ **NEW**: Should be pre-filled with `+237677123456`
- **Screenshot 07**: `07_phone_prefilled.png`
- Address: `Akwa, Douala`
- Password: `TestPharm2025!`
- Confirm Password: `TestPharm2025!`
- **Screenshot 08**: `08_registration_form_complete.png`

### STEP 5: Submit Registration
- Tap **Register** or **Complete Registration**
- Wait for processing (5-10 seconds)
- **Screenshot 09**: `09_registration_processing.png`

### STEP 6: Verify Success
- ✅ **NEW**: Should see success message or dashboard (NOT error)
- **Screenshot 10**: `10_registration_success.png`
- Copy the displayed User ID if shown

### STEP 7: Firebase Verification

#### A. Authentication User
1. Open: https://console.firebase.google.com/project/mediexchange/authentication/users
2. Search: `testpharmacy20251021@promoshake.net`
3. Verify user exists
4. Copy UID
5. **Screenshot 11**: `11_firebase_auth_user.png`

#### B. Firestore Pharmacy Document
1. Navigate: Firestore → pharmacies → [UID]
2. Verify fields:
   - `pharmacyName`: "Test Pharmacy October 2025"
   - `email`: "testpharmacy20251021@promoshake.net"
   - `phoneNumber`: "+237677123456"
   - `city`: "Douala" ✅ **NEW**
   - `country`: "cameroon" ✅ **NEW**
   - `paymentPreferences`: exists
3. **Screenshot 12**: `12_firestore_pharmacy.png`

#### C. Firestore Wallet
1. Navigate: Firestore → wallets → [UID]
2. Verify fields:
   - `balance`: 0 or `availableBalance`: 0
   - `currency`: "XAF"
   - `ownerType`: "pharmacy"
3. **Screenshot 13**: `13_firestore_wallet.png`

#### D. 🔒 CRITICAL: Payment Phone Encryption
1. Open pharmacy document in Firestore
2. Expand `paymentPreferences` field
3. Press **Ctrl+F**, search: `677123456`
4. **MUST FIND**: **ZERO MATCHES** (phone is encrypted)
5. Verify exists:
   - `encryptedPhone`: "[long encrypted string]"
   - `phoneHash`: "[64-character hash]"
   - `maskedPhone`: "677****56"
   - `method`: "mtn"
   - `operator`: "mtnCameroon" ✅ **NEW**
   - `city`: "Douala" ✅ **NEW**
6. **Screenshot 14**: `14_payment_encrypted.png`

**🚨 PRODUCTION BLOCKER**: If you find "677123456" in plaintext → **STOP AND REPORT**

---

## ✅ SUCCESS CRITERIA

**Scenario 1 Re-Test PASSES if ALL are true**:

### Registration Flow:
- [x] App launches without errors
- [x] Country selection works
- [x] ✅ **NEW**: City dropdown appears and works
- [x] Payment method selection works
- [x] Payment phone entry works
- [x] ✅ **NEW**: Phone auto-populated in registration form
- [x] Registration form all fields fillable
- [x] Registration submits successfully
- [x] ✅ **NEW**: NO "API key not valid" error
- [x] User navigates to dashboard or home screen

### Firebase Verification:
- [x] User created in Authentication
- [x] Pharmacy document created in Firestore
- [x] Wallet created with 0 XAF balance
- [x] ✅ **NEW**: City field populated ("Douala")
- [x] ✅ **NEW**: Country field populated ("cameroon")
- [x] 🔒 **CRITICAL**: Payment phone encrypted (no plaintext)

### Evidence Collection:
- [x] All 14+ screenshots captured
- [x] Screenshots saved to `docs/testing/evidence/screenshots/scenario1_retest/`
- [x] User UID recorded
- [x] Test duration recorded

**If ALL criteria met** → ✅ **SCENARIO 1 PASSED**

---

## 📊 EXPECTED RESULTS

### What Should Change from Last Test:

| Aspect | Previous Test (FAILED) | Re-Test (Expected) |
|--------|----------------------|-------------------|
| **API Key** | ❌ Invalid, sign-in failed | ✅ Valid, sign-in succeeds |
| **City Selection** | ❌ No dropdown appeared | ✅ Dropdown shows Douala, Yaoundé, etc. |
| **Phone Entry** | ❌ Asked twice | ✅ Auto-populated, editable |
| **Registration** | ❌ Error message shown | ✅ Success, navigates to dashboard |
| **User Status** | ❌ Created but can't sign in | ✅ Fully functional account |
| **Firestore City** | ❌ Not stored | ✅ City: "Douala" |
| **Overall Result** | ❌ FAILED | ✅ PASSED |

### What Should Stay the Same:

- ✅ Backend still creates user (already worked)
- ✅ Pharmacy document created (already worked)
- ✅ Wallet auto-created (already worked)
- ✅ Payment phone encrypted (already secure)

---

## 🚨 TROUBLESHOOTING GUIDE

### If API Key Error Still Appears:

**Problem**: "API key not valid" error during registration

**Solutions**:
1. Verify `pharmacy_app/lib/firebase_options.dart` has real key:
   ```bash
   cat pharmacy_app/lib/firebase_options.dart | grep apiKey
   # Should show: apiKey: 'AIzaSy...' (NOT 'PLACEHOLDER')
   ```

2. Rebuild app completely:
   ```bash
   cd pharmacy_app
   flutter clean
   flutter pub get
   flutter run -d emulator-5554
   ```

3. Check Firebase project matches:
   ```bash
   cat pharmacy_app/lib/firebase_options.dart | grep projectId
   # Should show: projectId: 'mediexchange'
   ```

4. If still failing: Try manual google-services.json approach (see [SETUP_FIREBASE_ANDROID.md](../../SETUP_FIREBASE_ANDROID.md))

### If City Dropdown Missing:

**Problem**: After selecting Cameroon, no city dropdown appears

**Check**:
1. Is `cities_config.dart` exported in `pharmapp_shared.dart`?
2. Is UI implementation complete? (May need to be implemented)
3. Check console logs for errors

**Solution**: City selection UI may not be implemented yet. Report to developer.

### If Phone Not Auto-Populated:

**Problem**: Phone from Screen 1 doesn't appear in Screen 2

**Check**:
1. Did you complete Screen 1 (payment phone entry)?
2. Is phone auto-populate implemented? (May need to be implemented)

**Solution**: Phone auto-populate may not be implemented yet. Report to developer.

### If Email Already Exists:

**Problem**: "Email already in use" error during registration

**Cause**: Cleanup not complete, old user still exists

**Solution**:
1. Go back to Firebase Console → Authentication
2. Delete the existing user
3. Wait 2-3 minutes
4. Try registration again

---

## 📋 POST-TEST TASKS

**After Scenario 1 Re-Test Completes**:

### If Test PASSES ✅:

1. **Update Test Reports**:
   - Mark Scenario 1 as ✅ **PASSED** in `NEXT_SESSION_TEST_PLAN.md`
   - Update `test_proof_report.md` with results
   - Update `test_feedback.md` with observations

2. **Archive Evidence**:
   - Move screenshots to dated folder: `scenario1_retest_2025-10-21_PASSED/`
   - Create summary document with key findings

3. **Proceed to Scenario 2**:
   - Review Scenario 2 checklist: Courier Registration
   - Prepare new test data for courier
   - Schedule Scenario 2 test

### If Test FAILS ❌:

1. **Document Failure**:
   - Capture error screenshots
   - Copy error messages from console
   - Note which step failed

2. **Report Issues**:
   - Update `test_feedback.md` with new issues
   - Create new issue report if different from previous failures

3. **DO NOT Proceed**:
   - Fix new issues before Scenario 2
   - Re-test Scenario 1 until it passes

---

## 📁 DOCUMENTATION STRUCTURE

**Before Re-Test, organize files**:

```
docs/testing/
├── NEXT_SESSION_PREPARATION.md (this file)
├── NEXT_SESSION_TEST_PLAN.md (master test plan)
├── evidence/
│   ├── screenshots/
│   │   ├── scenario1_failed_2025-10-21/ (previous failed test)
│   │   └── scenario1_retest_2025-10-21/ (NEW - create this folder)
│   └── logs/
└── reports/
    ├── SCENARIO_1_TEST_FAILURE_REPORT.md (previous failure)
    └── SCENARIO_1_RETEST_REPORT.md (NEW - create after re-test)
```

**Create Screenshots Folder**:
```bash
mkdir -p docs/testing/evidence/screenshots/scenario1_retest_2025-10-21
```

---

## ⏱️ ESTIMATED TIME

### Preparation (Before Test):
- Firebase cleanup: 5 minutes
- API key verification: 2 minutes
- Test data preparation: 2 minutes
- **Total Prep**: 10 minutes

### Test Execution:
- Emulator start: 2 minutes (if needed)
- App launch: 3 minutes
- Registration flow: 5 minutes
- Firebase verification: 10 minutes
- Screenshots: 5 minutes
- **Total Test**: 25 minutes

### Post-Test:
- Documentation update: 10 minutes
- Evidence archival: 5 minutes
- **Total Post**: 15 minutes

**Total Session Time**: ~50 minutes

---

## 🎯 SUCCESS INDICATORS

**You'll know Scenario 1 PASSED when**:

1. ✅ Registration completes without any error messages
2. ✅ App navigates to dashboard/home screen automatically
3. ✅ User can see their pharmacy name on screen
4. ✅ Firebase Authentication shows new user
5. ✅ Firestore pharmacy document has all fields
6. ✅ Payment phone is encrypted (no plaintext)
7. ✅ City field shows "Douala"
8. ✅ Wallet exists with 0 XAF balance

**Then you can confidently say**: "Scenario 1 PASSED ✅"

---

## 📞 SUPPORT

**If You Encounter Issues**:

**API Key Problems**:
- Read: [SETUP_FIREBASE_ANDROID.md](../../SETUP_FIREBASE_ANDROID.md)
- Read: [URGENT_ACTION_REQUIRED.md](../../URGENT_ACTION_REQUIRED.md)

**Test Execution Questions**:
- Read: [NEXT_SESSION_TEST_PLAN.md](NEXT_SESSION_TEST_PLAN.md)
- Review: Previous test failure report

**Firebase Cleanup Help**:
- Firebase Console: https://console.firebase.google.com/project/mediexchange
- Delete from Authentication first, then Firestore

**General Testing Help**:
- All test documentation in: `docs/testing/`
- Check: `SESSION_SUMMARY_2025-10-21.md` for context

---

## ✅ FINAL CHECKLIST

**Before Starting Next Session, Verify**:

- [ ] Firebase cleanup complete (old pharmacy deleted)
- [ ] API key fixed (`flutterfire configure` completed)
- [ ] City selection implemented (dropdown appears)
- [ ] Phone auto-populate implemented (phone pre-fills)
- [ ] Fresh test data prepared (new email)
- [ ] Screenshots folder created
- [ ] Emulator verified working
- [ ] Test plan reviewed
- [ ] Timer ready for recording duration

**When ALL items checked** → ✅ **READY FOR SCENARIO 1 RE-TEST**

---

**Document Status**: ✅ Complete
**Next Action**: Clean Firebase + Fix API Key + Re-Test
**Expected Outcome**: ✅ Scenario 1 PASSED
**Estimated Date**: Next session (after API key fix)

**Good luck with the re-test! With these fixes, Scenario 1 should pass without issues.** 🚀

---

**Related Documents**:
- [NEXT_SESSION_TEST_PLAN.md](NEXT_SESSION_TEST_PLAN.md) - Master test plan
- [SETUP_FIREBASE_ANDROID.md](../../SETUP_FIREBASE_ANDROID.md) - API key fix guide
- [SESSION_SUMMARY_2025-10-21.md](SESSION_SUMMARY_2025-10-21.md) - Previous session results
- [SCENARIO_1_TEST_FAILURE_REPORT.md](SCENARIO_1_TEST_FAILURE_REPORT.md) - Previous failure analysis
