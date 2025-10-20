# Next Session Testing Plan - 2025-10-21

## Session Objective
Complete end-to-end testing of pharmacy and courier registration flows with wallet creation and payment setup.

## Prerequisites
- ✅ Android emulator working (Pixel 9a)
- ✅ pharmacy_app builds and runs
- ✅ Firebase connected
- ✅ Backend functions deployed

## Test Scenarios

### Scenario 1: Create Complete Pharmacy Profile
**Objective**: Register a new pharmacy with complete profile including payment preferences

**Steps**:
1. Launch pharmacy_app on emulator
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
- [ ] Registration completes without errors
- [ ] Can sign in with created credentials
- [ ] Pharmacy document exists in Firestore
- [ ] Wallet document exists with correct structure
- [ ] Payment preferences encrypted and saved
- [ ] Trial subscription created automatically

---

### Scenario 2: Create Complete Courier Profile
**Objective**: Register a new courier with complete profile and wallet

**Steps**:
1. Launch courier_app on emulator
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
- [ ] Registration completes without errors
- [ ] Can sign in with created credentials
- [ ] Courier document exists in Firestore
- [ ] Wallet document exists
- [ ] Payment preferences saved
- [ ] GPS/Location permissions granted

---

### Scenario 3: Wallet Functionality Testing
**Objective**: Test wallet operations (sandbox credit, balance display)

**Steps**:
1. Use sandboxCredit function to credit test pharmacy wallet:
   ```bash
   curl -X POST https://europe-west1-mediexchange.cloudfunctions.net/sandboxCredit \
     -H "Content-Type: application/json" \
     -d '{
       "email": "testpharmacy2025@promoshake.net",
       "amount": 25000,
       "currency": "XAF"
     }'
   ```
2. Check wallet in pharmacy_app:
   - Navigate to Wallet/Balance screen
   - Verify balance shows 25,000 XAF
3. Repeat for courier wallet
4. Test wallet display in both apps

**Expected Result**: ✅ Wallet balance updates correctly

**Success Criteria**:
- [ ] sandboxCredit function works
- [ ] Wallet balance updates in Firestore
- [ ] Balance displays correctly in app UI
- [ ] Transaction recorded in ledger
- [ ] No balance inconsistencies

---

### Scenario 4: Payment Preferences Verification
**Objective**: Verify encrypted payment preferences work correctly

**Steps**:
1. Check Firestore for pharmacy payment preferences
2. Verify phone number is encrypted (not plaintext)
3. Verify phone hash exists
4. Check that masked phone displays in UI (677****56)
5. Verify operator matches country prefix validation

**Expected Result**: ✅ Payment data encrypted properly

**Success Criteria**:
- [ ] Phone number encrypted in Firestore
- [ ] Phone hash present for validation
- [ ] UI shows masked phone number
- [ ] Operator validation works
- [ ] Environment-aware (test numbers allowed in dev)

---

### Scenario 5: Firebase Integration Testing
**Objective**: Verify Firebase services work end-to-end

**Test Items**:
1. Authentication:
   - [ ] Sign up works
   - [ ] Sign in works
   - [ ] Sign out works
   - [ ] Password reset works
2. Firestore:
   - [ ] Documents created correctly
   - [ ] Security rules enforced
   - [ ] Real-time updates work
3. Cloud Functions:
   - [ ] createPharmacyUser callable
   - [ ] createCourierUser callable
   - [ ] sandboxCredit works
   - [ ] Wallet auto-creation triggers
4. Firebase Messaging (if implemented):
   - [ ] Push notification setup

**Expected Result**: ✅ All Firebase services operational

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
