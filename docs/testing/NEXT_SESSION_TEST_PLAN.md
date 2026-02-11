# Next Session Testing Plan - Updated 2025-10-22

## 📊 Session Progress Summary

**Last Updated**: 2025-10-22
**Current Phase**: Infrastructure Validation (Scenarios 3-5) - **BLOCKED BY BUG**

### ✅ Completed (2/8 scenarios):
- **Scenario 1**: Pharmacy Registration - ✅ PASSED (2025-10-22)
- **Scenario 2**: Courier Registration - ✅ PASSED (2025-10-22)

### 🐛 CURRENT BLOCKER - Dropdown Duplicate Bug:
**Status**: Fix implemented, pending clean deployment test
**Issue**: Payment operator dropdown crashes with duplicate mtnCameroon error when clicking "Top Up"
**Root Cause**: Flutter build cache not clearing - old compiled code still executing
**Fix Applied**: Manual deduplication with debug logging (FIX v3)
**Next Step**: Complete VS Code shutdown → Fresh flutter run to deploy clean build

### ⏳ Next Session (3/8 scenarios):
- **Scenario 3**: Wallet Functionality Testing (15-20 min) - ⚠️ BLOCKED by dropdown bug
- **Scenario 4**: Payment Preferences Verification (10-15 min)
- **Scenario 5**: Firebase Integration Testing (20-25 min)

**Estimated Time**: 45-60 minutes total (after bug fix verified)

### 📋 Future Sessions (3/8 scenarios):
- **Scenario 6**: Pharmacy Dashboard & Medicine Management ⭐ CORE BUSINESS
- **Scenario 7**: Medicine Exchange Proposal Flow ⭐ CORE BUSINESS
- **Scenario 8**: Courier Transport Order Flow ⭐ CORE BUSINESS

---

## Session Objective

**Next Session Focus**: Validate infrastructure foundation (wallet, payment security, Firebase integration) before proceeding to core business workflow testing.

**Rationale**: Conservative approach to ensure foundation is solid before testing complex business logic. May reveal hidden issues with wallet, payment, or Firebase integration.

## Prerequisites
- ✅ Android emulator working (Pixel 9a)
- ✅ pharmacy_app builds and runs
- ✅ Firebase connected
- ✅ Backend functions deployed

## ⚠️ IMPORTANT: Start Emulator FIRST

**Before running any tests, start the Android emulator**:

```bash
# Check if emulator is already running
adb devices

# If no devices listed, start emulator:
emulator -avd Pixel_9a

# Wait 1-2 minutes, then verify:
adb devices
# Expected: emulator-5554   device
```

**Only proceed with tests when emulator shows as "device" (not "offline")**

## Test Scenarios

## 📊 TEST STATUS TRACKING

### ✅ Completed Tests:
- **Scenario 1**: Create Complete Pharmacy Profile - ✅ PASSED (2025-10-22)
- **Scenario 2**: Create Complete Courier Profile - ✅ PASSED (2025-10-22)

### ⏳ Pending Tests:
- **Scenario 3**: Wallet Functionality Testing
- **Scenario 4**: Payment Preferences Verification
- **Scenario 5**: Firebase Integration Testing
- **Scenario 6**: Pharmacy Dashboard & Medicine Management ⭐ CORE BUSINESS
- **Scenario 7**: Medicine Exchange Proposal Flow ⭐ CORE BUSINESS
- **Scenario 8**: Courier Transport Order Flow ⭐ CORE BUSINESS

---

### Scenario 1: Create Complete Pharmacy Profile ✅ COMPLETED
**Objective**: Register a new pharmacy with complete profile including payment preferences

**Steps**:
0. **START EMULATOR** (if not running):
   ```bash
   emulator -avd Pixel_9a
   # Wait 1-2 min, verify: adb devices shows "emulator-5554 device"
   ```
1. Launch pharmacy_app on emulator:
   ```bash
   cd pharmacy_app
   flutter run -d emulator-5554
   ```
2. Navigate to Registration screen
3. Fill pharmacy details:
   - Pharmacy Name: "Test Pharmacy October 2025"
   - Email: testpharmacy2025@promoshake.net
   - Password: [secure password]
   - Phone Number: +237677123456
   - Address: "123 Test Street, Douala, Cameroon"
4. Select Country: Cameroon
5. Select Payment Operator: MTN Mobile Money
6. Enter Payment Phone: 677123456 (test number)
7. Complete registration
8. Verify:
   - User created in Firebase Authentication
   - Pharmacy profile created in Firestore
   - Wallet automatically created with 0 XAF balance
   - Payment preferences saved (encrypted)
   - No errors in console

**Expected Result**: ✅ Complete pharmacy profile with wallet

**Success Criteria**:
- [x] Registration completes without errors
- [x] Can sign in with created credentials
- [x] Pharmacy document exists in Firestore
- [x] Wallet document exists with correct structure
- [x] Payment preferences encrypted and saved
- [x] Trial subscription created automatically

**Status**: ✅ **COMPLETED** (2025-10-22)

---

### Scenario 2: Create Complete Courier Profile
**Objective**: Register a new courier with complete profile and wallet

**Steps**:
0. **VERIFY EMULATOR RUNNING** (from Scenario 1, or start it):
   ```bash
   adb devices  # Should show: emulator-5554 device
   ```
1. Launch courier_app on emulator:
   ```bash
   cd courier_app
   flutter run -d emulator-5554
   ```
2. Navigate to Registration screen
3. Fill courier details:
   - Full Name: "Test Courier October 2025"
   - Email: testcourier2025@promoshake.net
   - Password: [secure password]
   - Phone Number: +237678123456
   - Vehicle Type: Motorcycle
   - License Plate: ABC-123-XY
   - Operating City: Douala
4. Select Payment Method: Orange Money
5. Enter Payment Phone: 694123456
6. Complete registration
7. Verify:
   - User created in Firebase Authentication
   - Courier profile created in Firestore
   - Wallet automatically created
   - Payment preferences saved
   - Location services initialized

**Expected Result**: ✅ Complete courier profile with wallet

**Success Criteria**:
- [x] Registration completes without errors
- [x] Can sign in with created credentials
- [x] Courier document exists in Firestore
- [x] Wallet document exists
- [x] Payment preferences saved
- [x] GPS/Location permissions granted

**Status**: ✅ **COMPLETED** (2025-10-22)

---

### Scenario 3: Wallet Functionality Testing ⏳ NEXT SESSION
**Objective**: Test wallet operations (sandbox credit, balance display)

**Estimated Time**: 15-20 minutes

**Prerequisites**:
- ✅ Test accounts from Scenarios 1-2 exist
- ✅ Android emulator available
- ✅ Firebase Console access
- ✅ Backend functions deployed

**Steps**:

#### Step 3.1: Credit Pharmacy Wallet

```bash
# Credit test pharmacy wallet with 25,000 XAF
curl -X POST https://europe-west1-mediexchange.cloudfunctions.net/sandboxCredit \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"testpharmacy2025@promoshake.net\", \"amount\": 25000, \"currency\": \"XAF\"}"
```

**Expected Response**:

```json
{
  "success": true,
  "message": "Sandbox credit successful",
  "newBalance": 25000,
  "currency": "XAF"
}
```

#### Step 3.2: Verify Firestore Wallet Document

1. Go to Firebase Console → Firestore Database
2. Navigate to `wallets` collection
3. Find pharmacy wallet document
4. Verify structure:

```json
{
  "userId": "[pharmacyUserId]",
  "balance": 25000,
  "availableBalance": 25000,
  "heldBalance": 0,
  "currency": "XAF",
  "createdAt": "[timestamp]",
  "updatedAt": "[timestamp]"
}
```

#### Step 3.3: Verify Transaction Ledger

1. Navigate to `ledger` collection in Firestore
2. Find transaction for pharmacy wallet credit
3. Verify ledger entry:

```json
{
  "userId": "[pharmacyUserId]",
  "type": "credit",
  "amount": 25000,
  "currency": "XAF",
  "source": "sandboxCredit",
  "timestamp": "[timestamp]",
  "balanceAfter": 25000
}
```

#### Step 3.4: Verify Wallet Display in Pharmacy App

```bash
# Launch pharmacy app on emulator
cd pharmacy_app
flutter run -d emulator-5554
```

1. Sign in with: `testpharmacy2025@promoshake.net`
2. Navigate to Wallet/Balance screen
3. Verify balance displays: **25,000 XAF**

#### Step 3.5: Credit Courier Wallet

```bash
# Credit test courier wallet with 10,000 XAF
curl -X POST https://europe-west1-mediexchange.cloudfunctions.net/sandboxCredit \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"testcourier2025@promoshake.net\", \"amount\": 10000, \"currency\": \"XAF\"}"
```

#### Step 3.6: Verify Wallet Display in Courier App

```bash
# Launch courier app on emulator
cd courier_app
flutter run -d emulator-5554
```

1. Sign in with: `testcourier2025@promoshake.net`
2. Navigate to Wallet/Earnings screen
3. Verify balance displays: **10,000 XAF**

**Expected Result**: ✅ Wallet balance updates correctly in Firestore and displays in both apps

**Success Criteria**:

- [ ] sandboxCredit function works for pharmacy account
- [ ] sandboxCredit function works for courier account
- [ ] Wallet balance updates correctly in Firestore (2 wallets)
- [ ] Transaction recorded in ledger collection (2 transactions)
- [ ] Balance displays correctly in pharmacy_app UI
- [ ] Balance displays correctly in courier_app UI
- [ ] No balance inconsistencies
- [ ] No errors in app console/logs

**Evidence to Collect**:

- [ ] Screenshot of curl command outputs (pharmacy + courier)
- [ ] Screenshot of Firestore wallet documents (2 wallets)
- [ ] Screenshot of ledger transactions (2 entries)
- [ ] Screenshot of pharmacy app wallet screen
- [ ] Screenshot of courier app wallet screen

---

### Scenario 4: Payment Preferences Verification ⏳ NEXT SESSION
**Objective**: Verify encrypted payment preferences work correctly

**Estimated Time**: 10-15 minutes

**Prerequisites**:
- ✅ Test accounts from Scenarios 1-2 exist
- ✅ Firebase Console access
- ✅ Apps running on emulator

**Steps**:

#### Step 4.1: Check Pharmacy Payment Preferences in Firestore

1. Go to Firebase Console → Firestore Database
2. Navigate to `pharmacies` collection
3. Find pharmacy document (by email or user ID)
4. Look for `paymentPreferences` field

**Expected Structure**:

```json
{
  "paymentPreferences": {
    "paymentOperator": "mtn",
    "encryptedPhone": "[ENCRYPTED_VALUE]",
    "phoneHash": "[HASH_VALUE]",
    "country": "CM",
    "createdAt": "[timestamp]"
  }
}
```

**⚠️ CRITICAL SECURITY CHECK**: Phone number must NOT be plaintext!

#### Step 4.2: Check Courier Payment Preferences in Firestore

1. Navigate to `couriers` collection
2. Find courier document
3. Check `paymentPreferences` field

**Expected Structure**:

```json
{
  "paymentPreferences": {
    "paymentOperator": "orange",
    "encryptedPhone": "[ENCRYPTED_VALUE]",
    "phoneHash": "[HASH_VALUE]",
    "country": "CM",
    "createdAt": "[timestamp]"
  }
}
```

#### Step 4.3: Verify Masked Phone Display in Pharmacy App

1. Open pharmacy_app (if not running)
2. Sign in with: `testpharmacy2025@promoshake.net`
3. Navigate to Settings/Profile/Payment Settings

**Expected UI Display**:
- Payment Operator: **MTN Mobile Money**
- Payment Phone: **677\*\*\*\*56** (masked format)
- Should NOT show: 677123456 (plaintext)

#### Step 4.4: Verify Masked Phone Display in Courier App

1. Open courier_app
2. Sign in with: `testcourier2025@promoshake.net`
3. Navigate to Settings/Profile/Payment Settings

**Expected UI Display**:
- Payment Operator: **Orange Money**
- Payment Phone: **694\*\*\*\*56** (masked format)

#### Step 4.5: Verify Operator/Prefix Validation

**Test Logic** (manual verification):
- Pharmacy: MTN operator with phone 677123456
  - ✅ Prefix 677 is valid for MTN (MTN uses 65/67/68)
- Courier: Orange operator with phone 694123456
  - ✅ Prefix 694 is valid for Orange (Orange uses 69)

**Expected Behavior**: Registration validated these during Scenarios 1-2

**Expected Result**: ✅ Payment data encrypted properly, UI displays masked phone

**Success Criteria**:

- [ ] Pharmacy phone number encrypted in Firestore (not plaintext)
- [ ] Courier phone number encrypted in Firestore (not plaintext)
- [ ] Phone hash present for both accounts
- [ ] Pharmacy UI shows masked phone (677\*\*\*\*56 format)
- [ ] Courier UI shows masked phone (694\*\*\*\*56 format)
- [ ] Operator/prefix validation enforced (MTN=65/67/68, Orange=69)
- [ ] Environment-aware behavior (test numbers allowed in dev)
- [ ] No sensitive data exposure in logs/console

**Evidence to Collect**:

- [ ] Screenshot of Firestore pharmacy paymentPreferences (showing encrypted phone)
- [ ] Screenshot of Firestore courier paymentPreferences (showing encrypted phone)
- [ ] Screenshot of pharmacy app masked phone display
- [ ] Screenshot of courier app masked phone display

**🔴 BLOCKER**: If phone numbers are in plaintext, DO NOT proceed - flag as critical security issue!

---

### Scenario 5: Firebase Integration Testing ⏳ NEXT SESSION
**Objective**: Verify Firebase services work end-to-end

**Estimated Time**: 20-25 minutes

**Prerequisites**:
- ✅ Test accounts from Scenarios 1-2 exist
- ✅ Firebase Console access
- ✅ Apps running on emulator

**Steps**:

#### Step 5.1: Authentication Testing

##### 5.1.1: Sign In (Existing Account)

1. Open pharmacy_app
2. Navigate to Sign In screen
3. Enter credentials:
   - Email: `testpharmacy2025@promoshake.net`
   - Password: [password from Scenario 1]
4. Tap "Sign In"

**Expected Result**:
- ✅ Sign in successful
- ✅ Redirected to Dashboard
- ✅ No errors in console

##### 5.1.2: Sign Out

1. Navigate to Settings/Profile
2. Tap "Sign Out" button
3. Verify return to Sign In screen

**Expected Result**:
- ✅ User signed out
- ✅ Redirected to auth screen
- ✅ Session cleared

##### 5.1.3: Password Reset (Optional)

1. On Sign In screen, tap "Forgot Password"
2. Enter email: `testpharmacy2025@promoshake.net`
3. Tap "Send Reset Email"
4. Check email inbox

**Expected Result**:
- ✅ Password reset email sent
- ✅ Email received (check spam folder)

#### Step 5.2: Firestore Testing

##### 5.2.1: Document Creation Verification

**Verification** (via Firebase Console):
- [ ] `pharmacies/[userId]` document exists
- [ ] `couriers/[userId]` document exists
- [ ] `wallets/[userId]` documents exist (2 wallets)
- [ ] All required fields present

##### 5.2.2: Security Rules Testing

**Test**: Attempt to access another user's data

**Actions** (Firebase Console Rules Playground):
1. Go to Firestore Rules tab
2. Click "Rules Playground"
3. Test read access to pharmacy document with:
   - Authenticated as: `testcourier2025@promoshake.net`
   - Path: `/pharmacies/[pharmacyUserId]`
   - Operation: `get`

**Expected Result**:
- ❌ Access DENIED (courier cannot read pharmacy data)

##### 5.2.3: Real-time Updates Testing

1. Open pharmacy_app (signed in)
2. Keep app running
3. Go to Firebase Console
4. Manually update pharmacy document (e.g., change pharmacy name)
5. Observe if app UI updates in real-time

**Expected Result**:
- ✅ UI updates automatically (if real-time listeners implemented)
- OR: Changes visible after app refresh

#### Step 5.3: Cloud Functions Testing

##### 5.3.1: Verify Functions Deployed

```bash
# List deployed functions
firebase functions:list --project mediexchange
```

**Expected Functions**:
- createPharmacyUser
- createCourierUser
- sandboxCredit
- Wallet auto-creation trigger

##### 5.3.2: createPharmacyUser (Callable Function)

**Status**: Already tested in Scenario 1 registration

**Verification**:
- [ ] Function executed during pharmacy registration
- [ ] Pharmacy document created
- [ ] Wallet auto-created
- [ ] Trial subscription created

##### 5.3.3: createCourierUser (Callable Function)

**Status**: Already tested in Scenario 2 registration

**Verification**:
- [ ] Function executed during courier registration
- [ ] Courier document created
- [ ] Wallet auto-created

##### 5.3.4: sandboxCredit (HTTP Function)

**Status**: Will be tested in Scenario 3

**Verification**:
- [ ] Function accepts HTTP POST requests
- [ ] Validates test account patterns
- [ ] Credits wallet correctly
- [ ] Returns proper JSON response

##### 5.3.5: Check Function Logs

```bash
# Check function logs for errors
firebase functions:log --project mediexchange --limit 50
```

**Look for**:
- Wallet creation logs from Scenarios 1-2
- Any error messages
- Function execution times

#### Step 5.4: Firebase Messaging (Optional - if implemented)

**Actions** (if push notifications are implemented):
1. Check if FCM tokens are stored in user documents
2. Verify notification permissions granted
3. Test sending a test notification via Firebase Console

**Expected Result**:
- ✅ FCM token stored in user document
- ✅ Notification received on emulator
- OR: Note: "Push notifications not yet implemented"

**Expected Result**: ✅ All Firebase services operational

**Success Criteria**:

- [ ] Sign in/out works correctly
- [ ] Password reset functional (or skipped)
- [ ] Firestore documents created correctly
- [ ] Security rules enforced (users can't access others' data)
- [ ] Real-time updates working (or manual refresh works)
- [ ] Cloud Functions operational (createPharmacyUser, createCourierUser, sandboxCredit)
- [ ] Wallet auto-creation triggers working
- [ ] Function logs show no critical errors
- [ ] Firebase Messaging configured (if implemented)

**Evidence to Collect**:

- [ ] Screenshot of successful sign in
- [ ] Screenshot of sign out confirmation
- [ ] Screenshot of Firestore security rules test (access denied)
- [ ] Screenshot of Cloud Functions list
- [ ] Screenshot of function logs
- [ ] Note: Real-time updates status (working/not implemented)

---

## Test Data

### Test Accounts to Create:

**Pharmacy 1**:
- Email: testpharmacy2025@promoshake.net
- Name: Test Pharmacy October 2025
- Phone: +237677123456
- Payment: MTN (677123456)
- Country: Cameroon

**Courier 1**:
- Email: testcourier2025@promoshake.net
- Name: Test Courier October 2025
- Phone: +237678123456
- Payment: Orange (694123456)
- Vehicle: Motorcycle
- City: Douala

### Sandbox Credits to Apply:
- Pharmacy wallet: 25,000 XAF
- Courier wallet: 10,000 XAF

---

## Test Environment

**Emulator**: Pixel 9a (emulator-5554)
**Android Version**: API 36
**Firebase Project**: mediexchange
**Backend URL**: https://europe-west1-mediexchange.cloudfunctions.net
**Test Mode**: Development (test numbers allowed)

---

## Testing Tools

### Firebase Emulator (if needed):
```bash
cd functions
firebase emulators:start
```

### Check Firestore Data:
```bash
# Via Firebase Console
https://console.firebase.google.com/project/mediexchange/firestore

# Via Firebase CLI
firebase firestore:get /pharmacies/[userId]
firebase firestore:get /wallets/[userId]
```

### Check Backend Functions:
```bash
# List deployed functions
firebase functions:list

# Check function logs
firebase functions:log
```

---

## Success Criteria for Session

✅ **Minimum Success**:
- 1 pharmacy created with wallet
- 1 courier created with wallet
- Wallet balances display correctly
- Payment preferences encrypted

✅ **Full Success**:
- All 5 test scenarios completed
- All success criteria met
- No critical errors
- Documentation updated

✅ **Stretch Goals**:
- Test medicine inventory creation (pharmacy)
- Test delivery acceptance (courier)
- Test exchange proposal flow

---

## Known Issues to Watch

⚠️ **Potential Issues**:
1. Firebase placeholder keys may need real credentials
2. Location permissions may require manual grant on emulator
3. Camera permissions needed for QR scanning
4. Network connectivity in emulator

💡 **Workarounds**:
- Use sandboxCredit instead of real mobile money
- Grant permissions via emulator settings
- Test QR codes with image files if camera unavailable

---

## Test Report Template

After testing, create: `docs/testing/SESSION_2025-10-21_RESULTS.md`

Structure:
```markdown
# Testing Session Results - 2025-10-21

## Summary
- Tests Passed: X/Y
- Tests Failed: Z
- Blocking Issues: [number]

## Scenario Results
[For each scenario: PASS/FAIL with evidence]

## Issues Found
[List any bugs or problems]

## Recommendations
[Next steps]
```

---

## Preparation Checklist

Before next session:
- [ ] Emulator running (Pixel 9a)
- [ ] pharmacy_app ready to launch
- [ ] courier_app ready to launch (if testing)
- [ ] Firebase Console open
- [ ] Backend functions deployed
- [ ] Test data prepared
- [ ] This test plan reviewed

---

**Estimated Time**: 1-2 hours for complete testing
**Prerequisites**: Android emulator working (✅ completed today)
**Priority**: HIGH - Core functionality validation

---

**Created**: 2025-10-20
**For Session**: 2025-10-21
**Agent**: pharmapp-testeur (with Chef de Projet oversight)
