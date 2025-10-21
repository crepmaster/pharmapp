# 🚴 SCENARIO 2: COURIER REGISTRATION - MANUAL TEST CHECKLIST

**Test Objective**: Register a new courier with complete profile including encrypted payment preferences (Orange Money)

**Test Date**: 2025-10-21
**Tester**: [Your Name]
**Emulator**: Pixel 9a (emulator-5554)
**App**: courier_app

---

## ⚠️ STEP 0: VERIFY EMULATOR IS RUNNING (CRITICAL)

**BEFORE STARTING THIS TEST** - Verify emulator from Scenario 1 is still running:

```bash
adb devices
```

**Expected Output**:
```
List of devices attached
emulator-5554   device
```

**Status Indicators**:
- ✅ **GREEN - Ready**: Shows `emulator-5554   device`
- ⚠️ **YELLOW - Booting**: Shows `emulator-5554   offline` → Wait 30 seconds
- 🔴 **RED - Not Running**: No devices listed → Run `emulator -avd Pixel_9a`

**Only proceed when emulator shows "device" status!**

---

## 📋 PRE-TEST CHECKLIST

- [ ] **Emulator verified running**: `adb devices` shows `emulator-5554 device`
- [ ] **Scenario 1 completed**: Pharmacy registration test passed
- [ ] **Firebase Console open**: https://console.firebase.google.com/project/mediexchange
- [ ] **Test data ready**: Email, phone numbers, vehicle info prepared
- [ ] **Screenshot tool ready**: Emulator camera button or Windows Snipping Tool
- [ ] **Evidence folder created**: `docs/testing/evidence/screenshots/scenario2/`

---

## 🧪 TEST EXECUTION STEPS

### STEP 1: Launch Courier App on Emulator

**Command**:
```bash
cd C:\Users\aebon\projects\pharmapp-mobile\courier_app
flutter run -d emulator-5554
```

**Verification**:
- [ ] **Build starts**: "Running Gradle task 'assembleDebug'..."
- [ ] **No compilation errors**: Build completes successfully
- [ ] **App installs**: "Installing app..." message appears
- [ ] **App launches**: Courier app with GREEN theme appears on emulator
- [ ] **Splash screen**: App shows courier branding

**Expected Time**: 3-5 minutes (first build)

**Screenshot 01**: `01_courier_app_launch.png` - App splash/home screen

---

### STEP 2: Navigate to Registration Screen

**Actions on Emulator**:
1. Tap **"Create Account"** or **"Sign Up"** button
2. Registration form should appear

**Verification**:
- [ ] **Registration form visible**: Shows input fields
- [ ] **Required fields present**: Name, Email, Password, Phone
- [ ] **Courier-specific fields**: Vehicle Type, License Plate, Operating City
- [ ] **Payment section**: Payment method selection visible
- [ ] **Green theme**: Courier app color scheme (not pharmacy blue)

**Screenshot 02**: `02_registration_form_empty.png` - Empty registration form

---

### STEP 3: Fill Courier Personal Information

**Test Data to Enter**:
```
Full Name: Test Courier October 2025
Email: testcourier2025@promoshake.net
Password: TestCourier2025!
Confirm Password: TestCourier2025!
Phone Number: +237678123456
```

**Verification**:
- [ ] **Name field accepts text**: Full name entered
- [ ] **Email validation**: Accepts @promoshake.net email
- [ ] **Password strength**: Meets minimum requirements
- [ ] **Phone format**: Accepts +237 Cameroon format
- [ ] **No validation errors**: All fields accept input

**Screenshot 03**: `03_personal_info_filled.png` - Personal info section completed

---

### STEP 4: Fill Courier Vehicle Information

**Test Data to Enter**:
```
Vehicle Type: Motorcycle
License Plate: ABC-123-XY
Operating City: Douala
```

**Verification**:
- [ ] **Vehicle dropdown**: Shows Motorcycle, Car, Bicycle options
- [ ] **License plate field**: Accepts alphanumeric format
- [ ] **City dropdown**: Shows Cameroon cities (Douala, Yaoundé, etc.)
- [ ] **Courier-specific**: These fields don't exist in pharmacy registration

**Screenshot 04**: `04_vehicle_info_filled.png` - Vehicle information completed

---

### STEP 5: Select Payment Method (Orange Money)

**Actions**:
1. Scroll to Payment Method section
2. Tap **"Orange Money"** option

**Verification**:
- [ ] **Payment operators visible**: MTN, Orange, Camtel options
- [ ] **Orange Money selectable**: Orange option can be selected
- [ ] **Phone input appears**: Payment phone number field appears
- [ ] **Visual feedback**: Selected payment method highlighted

**Screenshot 05**: `05_payment_method_selected.png` - Orange Money selected

---

### STEP 6: Enter Orange Money Phone Number

**Test Data to Enter**:
```
Payment Phone: 694123456
```

**Critical Security Test**:
- [ ] **Orange prefix (69) accepted**: Number starts with 69 (Orange)
- [ ] **Cross-validation works**: Orange number with Orange method accepted
- [ ] **Invalid prefix blocked**: If you enter 677 (MTN), should show error
- [ ] **Test number allowed**: 694123456 is allowed in development environment

**Screenshot 06**: `06_payment_phone_entered.png` - Orange payment phone entered

---

### STEP 7: Complete Registration

**Actions**:
1. Review all entered data
2. Tap **"Register"** or **"Create Account"** button
3. Wait for registration process

**Verification**:
- [ ] **Loading indicator**: Shows "Creating account..." or spinner
- [ ] **No errors**: Registration proceeds without validation errors
- [ ] **Success message**: "Account created successfully" or similar
- [ ] **Navigation**: App navigates to dashboard or home screen
- [ ] **Courier dashboard loads**: Shows courier-specific features (deliveries, earnings)

**Expected Time**: 5-10 seconds for registration

**Screenshot 07**: `07_registration_success.png` - Success message or dashboard

---

## 🔍 FIREBASE VERIFICATION STEPS

### STEP 8: Verify Firebase Authentication

**Actions**:
1. Open Firebase Console: https://console.firebase.google.com/project/mediexchange
2. Navigate to **Authentication** → **Users**
3. Search for: `testcourier2025@promoshake.net`

**Verification**:
- [ ] **User exists**: Email found in users list
- [ ] **User ID (UID)**: Copy UID for next steps (e.g., `Xyz789AbC...`)
- [ ] **Sign-in method**: Email/Password provider enabled
- [ ] **Creation timestamp**: Shows today's date (2025-10-21)

**Screenshot 08**: `08_firebase_auth_user.png` - Firebase Authentication user entry

**Copy User ID**: `____________________________________` (write it down)

---

### STEP 9: Verify Firestore Courier Profile

**Actions**:
1. Navigate to **Firestore Database** → **Data** tab
2. Open `couriers` collection
3. Find document with UID from Step 8

**Verification**:
- [ ] **Courier document exists**: Document ID matches user UID
- [ ] **Name field**: `fullName: "Test Courier October 2025"`
- [ ] **Email field**: `email: "testcourier2025@promoshake.net"`
- [ ] **Phone field**: `phoneNumber: "+237678123456"`
- [ ] **Vehicle type**: `vehicleType: "Motorcycle"`
- [ ] **License plate**: `licensePlate: "ABC-123-XY"`
- [ ] **Operating city**: `operatingCity: "Douala"`
- [ ] **Status field**: `status: "pending"` or `"active"`
- [ ] **Creation timestamp**: `createdAt: [today's timestamp]`

**Screenshot 09**: `09_firestore_courier_profile.png` - Courier Firestore document

---

### STEP 10: Verify Wallet Creation

**Actions**:
1. In Firestore, open `wallets` collection
2. Find wallet document with same UID

**Verification**:
- [ ] **Wallet exists**: Document ID matches courier UID
- [ ] **Balance is zero**: `balance: 0` or `availableBalance: 0`
- [ ] **Currency field**: `currency: "XAF"`
- [ ] **Owner type**: `ownerType: "courier"` (not "pharmacy")
- [ ] **Wallet ID matches**: Same as user UID
- [ ] **Held balance**: `heldBalance: 0` (if field exists)
- [ ] **Created timestamp**: Shows today's date

**Screenshot 10**: `10_firestore_wallet.png` - Wallet Firestore document

---

### STEP 11: CRITICAL SECURITY AUDIT - Verify Payment Encryption

**Actions**:
1. In Firestore, find `couriers/[UID]` document
2. Expand `paymentPreferences` field (if nested) or find payment fields
3. Press `Ctrl+F` in browser, search for: `694123456` (the plaintext phone)

**🔒 CRITICAL VERIFICATION**:
- [ ] **ZERO PLAINTEXT MATCHES**: Searching "694123456" finds NOTHING
- [ ] **Encrypted phone exists**: `encryptedPhone: "[long encrypted string]"`
- [ ] **Phone hash exists**: `phoneHash: "[64-character hash]"`
- [ ] **Masked phone displayed**: `maskedPhone: "694****56"`
- [ ] **Payment method**: `paymentMethod: "Orange Money"`
- [ ] **No test numbers in production**: If environment is production, test number blocked

**🚨 PRODUCTION BLOCKER**:
If you find "694123456" in plaintext → **CRITICAL SECURITY FAILURE**
- [ ] **STOP TESTING IMMEDIATELY**
- [ ] **Report to development team**
- [ ] **Do NOT proceed to production**

**Screenshot 11**: `11_firebase_payment_encrypted.png` - Payment preferences showing encryption

---

### STEP 12: Verify Orange Money Validation

**Actions**:
1. Review payment preferences in Firestore
2. Check that operator matches phone prefix

**Verification**:
- [ ] **Operator field**: `paymentOperator: "Orange Money"` or similar
- [ ] **Phone prefix validation**: 694 matches Orange (69x prefix)
- [ ] **Cross-validation passed**: Orange method with Orange number
- [ ] **Country consistency**: Cameroon operator with Cameroon phone

**Evidence**: Screenshot 11 should show this data

---

## 📊 TEST RESULTS SUMMARY

### Test Execution Status

- [ ] **PASS**: All 12 steps completed successfully
- [ ] **PARTIAL PASS**: Some steps passed, minor issues found
- [ ] **FAIL**: Critical failures, cannot proceed

### Critical Security Checks

- [ ] **✅ PASS**: Payment phone encrypted (no plaintext in Firestore)
- [ ] **❌ FAIL**: Payment phone in plaintext (PRODUCTION BLOCKER)

### Issues Found

**List any bugs, errors, or unexpected behavior**:
1. ___________________________________________________________
2. ___________________________________________________________
3. ___________________________________________________________

---

## 📁 EVIDENCE COLLECTION

### Screenshots Collected (Target: 11+)

**Required Screenshots**:
- [ ] 01_courier_app_launch.png
- [ ] 02_registration_form_empty.png
- [ ] 03_personal_info_filled.png
- [ ] 04_vehicle_info_filled.png
- [ ] 05_payment_method_selected.png
- [ ] 06_payment_phone_entered.png
- [ ] 07_registration_success.png
- [ ] 08_firebase_auth_user.png
- [ ] 09_firestore_courier_profile.png
- [ ] 10_firestore_wallet.png
- [ ] 11_firebase_payment_encrypted.png

**Storage Location**: `docs/testing/evidence/screenshots/scenario2/`

### Additional Evidence

- [ ] **App logs**: Saved from `flutter run` output
- [ ] **Firebase export**: JSON export of courier document
- [ ] **Console errors**: Any errors captured from browser/emulator

---

## 🔄 COMPARISON WITH SCENARIO 1

### Differences from Pharmacy Registration:

| Aspect | Pharmacy (Scenario 1) | Courier (Scenario 2) |
|--------|----------------------|---------------------|
| **App Theme** | Blue (#1976D2) | Green (#4CAF50) |
| **Email** | testpharmacy2025@... | testcourier2025@... |
| **Phone** | +237677123456 | +237678123456 |
| **Payment Method** | MTN Mobile Money | Orange Money |
| **Payment Phone** | 677123456 (MTN) | 694123456 (Orange) |
| **Masked Display** | 677****56 | 694****56 |
| **Specific Fields** | Pharmacy name, address | Vehicle type, license plate |
| **Collection** | `pharmacies` | `couriers` |
| **Owner Type** | pharmacy | courier |

### Similarities:

- ✅ Both use encrypted payment preferences
- ✅ Both auto-create wallets with 0 XAF balance
- ✅ Both store in Firebase Authentication + Firestore
- ✅ Both use HMAC-SHA256 encryption for phone numbers
- ✅ Both enforce environment-aware test number validation

---

## ✅ SUCCESS CRITERIA

**Scenario 2 PASSES if**:
1. ✅ Courier app launches successfully on emulator
2. ✅ Registration completes without errors
3. ✅ Firebase Authentication user created
4. ✅ Firestore courier profile created with all fields
5. ✅ Wallet auto-created with 0 XAF balance
6. ✅ **CRITICAL**: Payment phone encrypted (no plaintext "694123456")
7. ✅ Orange Money operator matches 694 prefix
8. ✅ All 11+ screenshots captured

**Scenario 2 FAILS if**:
- ❌ App crashes during registration
- ❌ Firebase data missing or incomplete
- ❌ **CRITICAL**: Payment phone stored in plaintext
- ❌ Wallet not created automatically
- ❌ Cross-validation failure (MTN number with Orange method)

---

## 📝 NEXT STEPS AFTER SCENARIO 2

### If PASS:
1. **Update test reports**:
   - `docs/testing/test_proof_report.md` - Add Scenario 2 results
   - `docs/testing/test_feedback.md` - Add courier-specific feedback
2. **Proceed to Scenario 3**: Wallet Functionality Testing
3. **Archive evidence**: Move screenshots to dated folder

### If FAIL:
1. **Document failures**: Record all errors and screenshots
2. **Report to development team**: Use `docs/testing/test_feedback.md`
3. **Do NOT proceed**: Fix issues before continuing tests

---

## 🚀 QUICK REFERENCE - Copy-Paste Test Data

```
# Courier Personal Info
Full Name: Test Courier October 2025
Email: testcourier2025@promoshake.net
Password: TestCourier2025!
Phone: +237678123456

# Vehicle Info
Vehicle Type: Motorcycle
License Plate: ABC-123-XY
Operating City: Douala

# Payment Info
Payment Method: Orange Money
Payment Phone: 694123456
Expected Masked: 694****56

# Firebase Search
User Email: testcourier2025@promoshake.net
Collection: couriers
Wallet Collection: wallets
Critical Check: Search "694123456" → MUST FIND ZERO MATCHES
```

---

**Document Version**: 1.0
**Created**: 2025-10-21
**Last Updated**: 2025-10-21
**Test Status**: ⏳ Pending Execution (Scenario 1 must pass first)

**Prerequisites**:
- ✅ Emulator running (emulator-5554 device)
- ✅ STEP 0 verification completed
- ⏳ Scenario 1 completed and passed

---

**Related Documents**:
- [STEP 0: Start Emulator](STEP_0_START_EMULATOR.md) - Emulator startup guide
- [How to Run Apps](HOW_TO_RUN_APPS.md) - App launch instructions
- [Next Session Test Plan](NEXT_SESSION_TEST_PLAN.md) - Master test plan
- [Scenario 2 Quick Reference](SCENARIO_2_QUICK_REFERENCE.md) - One-page summary
