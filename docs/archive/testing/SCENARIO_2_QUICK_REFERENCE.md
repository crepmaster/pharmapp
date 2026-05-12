# 🚴 SCENARIO 2: COURIER REGISTRATION - QUICK REFERENCE

**One-Page Test Guide** for rapid execution of courier registration testing.

---

## ⚠️ STEP 0: VERIFY EMULATOR (MANDATORY)

```bash
# Check emulator status
adb devices

# Expected: emulator-5554   device
# If not running: emulator -avd Pixel_9a
```

**Only proceed when status shows "device"!**

---

## 🚀 LAUNCH COURIER APP

```bash
cd C:\Users\aebon\projects\pharmapp-mobile\courier_app
flutter run -d emulator-5554
```

**Wait**: 3-5 minutes for build and launch
**Theme**: GREEN (not blue like pharmacy app)

---

## 📝 TEST DATA - COPY-PASTE READY

### Personal Information
```
Full Name: Test Courier October 2025
Email: testcourier2025@promoshake.net
Password: TestCourier2025!
Confirm Password: TestCourier2025!
Phone: +237678123456
```

### Vehicle Information
```
Vehicle Type: Motorcycle
License Plate: ABC-123-XY
Operating City: Douala
```

### Payment Information
```
Payment Method: Orange Money
Payment Phone: 694123456
```

---

## ✅ VERIFICATION CHECKLIST (Fast)

### 1. App Launch
- [ ] Green theme courier app visible
- [ ] Registration button accessible

### 2. Registration Form
- [ ] All personal info fields filled
- [ ] Vehicle type: Motorcycle
- [ ] License plate: ABC-123-XY
- [ ] City: Douala
- [ ] Orange Money selected
- [ ] Payment phone: 694123456

### 3. Registration Success
- [ ] Success message appears
- [ ] Dashboard loads (courier interface)

### 4. Firebase Authentication
- [ ] Open: https://console.firebase.google.com/project/mediexchange
- [ ] Navigate: Authentication → Users
- [ ] Find: testcourier2025@promoshake.net
- [ ] Copy User ID (UID)

### 5. Firestore Courier Profile
- [ ] Navigate: Firestore → couriers collection
- [ ] Find document with UID
- [ ] Verify: fullName, email, phone, vehicleType, licensePlate, city

### 6. Firestore Wallet
- [ ] Navigate: Firestore → wallets collection
- [ ] Find document with UID
- [ ] Verify: balance = 0, currency = XAF, ownerType = courier

### 7. 🔒 CRITICAL SECURITY CHECK
- [ ] Open courier document in Firestore
- [ ] Press Ctrl+F, search: `694123456`
- [ ] **MUST FIND: ZERO MATCHES** (phone is encrypted)
- [ ] Verify exists: encryptedPhone, phoneHash, maskedPhone: "694****56"

---

## 📸 SCREENSHOTS (11 Required)

**Save to**: `docs/testing/evidence/screenshots/scenario2/`

1. `01_courier_app_launch.png` - App home screen
2. `02_registration_form_empty.png` - Empty form
3. `03_personal_info_filled.png` - Personal data entered
4. `04_vehicle_info_filled.png` - Vehicle data entered
5. `05_payment_method_selected.png` - Orange Money selected
6. `06_payment_phone_entered.png` - 694123456 entered
7. `07_registration_success.png` - Success message
8. `08_firebase_auth_user.png` - Firebase Auth user
9. `09_firestore_courier_profile.png` - Courier Firestore doc
10. `10_firestore_wallet.png` - Wallet Firestore doc
11. `11_firebase_payment_encrypted.png` - Encrypted payment data

---

## 🔍 FIREBASE CONSOLE QUICK LINKS

**Base URL**: https://console.firebase.google.com/project/mediexchange

- **Authentication**: /authentication/users
- **Firestore Data**: /firestore/data
- **Couriers Collection**: /firestore/data/~2Fcouriers
- **Wallets Collection**: /firestore/data/~2Fwallets

---

## 🚨 CRITICAL FAILURE CONDITIONS

**STOP TESTING if**:
- ❌ App crashes during registration
- ❌ Firebase user NOT created
- ❌ Courier document missing in Firestore
- ❌ Wallet NOT auto-created
- ❌ **PRODUCTION BLOCKER**: Phone "694123456" found in plaintext in Firestore

---

## ✅ PASS CRITERIA

**Scenario 2 PASSES when**:
1. ✅ Courier app launches (green theme)
2. ✅ Registration completes without errors
3. ✅ Firebase user created (testcourier2025@promoshake.net)
4. ✅ Courier profile in Firestore with all fields
5. ✅ Wallet created with 0 XAF balance
6. ✅ **Payment phone encrypted** (no plaintext)
7. ✅ Orange Money operator matches 694 prefix
8. ✅ 11+ screenshots captured

---

## 🔄 DIFFERENCES FROM SCENARIO 1

| Item | Pharmacy (S1) | Courier (S2) |
|------|--------------|-------------|
| **Theme** | Blue | Green |
| **Email** | testpharmacy2025@... | testcourier2025@... |
| **Phone** | +237677123456 | +237678123456 |
| **Payment** | MTN (677123456) | Orange (694123456) |
| **Masked** | 677****56 | 694****56 |
| **Fields** | Pharmacy name, address | Vehicle, license, city |
| **Collection** | pharmacies | couriers |

---

## ⏱️ ESTIMATED TIME

| Step | Duration |
|------|----------|
| Launch app | 3-5 min |
| Fill form | 3 min |
| Registration | 30 sec |
| Firebase verification | 5 min |
| Screenshots | 3 min |
| **TOTAL** | **15-20 min** |

---

## 📋 QUICK FIREBASE VERIFICATION

```bash
# 1. Authentication User
Path: Authentication → Users
Search: testcourier2025@promoshake.net
Copy: User ID (UID)

# 2. Courier Profile
Path: Firestore → couriers → [UID]
Check: fullName, email, vehicleType, licensePlate, operatingCity

# 3. Wallet
Path: Firestore → wallets → [UID]
Check: balance = 0, currency = XAF, ownerType = courier

# 4. Payment Encryption (CRITICAL)
Path: Firestore → couriers → [UID] → paymentPreferences
Search (Ctrl+F): 694123456
Expected: ZERO MATCHES (encrypted)
Verify: encryptedPhone, phoneHash, maskedPhone = "694****56"
```

---

## 🛠️ TROUBLESHOOTING

### Issue: "No devices found"
```bash
# Check emulator
adb devices

# If offline: Wait 30 seconds
# If missing: emulator -avd Pixel_9a
```

### Issue: Build fails
```bash
# Clean and retry
cd courier_app
flutter clean
flutter pub get
flutter run -d emulator-5554
```

### Issue: Firebase data not appearing
- Wait 5-10 seconds for data propagation
- Refresh Firestore page
- Check internet connection
- Verify Firebase project: mediexchange

---

## 📝 NEXT STEPS

**After Scenario 2 PASSES**:
1. Update `docs/testing/test_proof_report.md`
2. Update `docs/testing/test_feedback.md`
3. Proceed to **Scenario 3: Wallet Functionality Testing**

**If Scenario 2 FAILS**:
1. Document all errors in test_feedback.md
2. Capture error screenshots
3. Report to development team
4. **DO NOT** proceed to Scenario 3

---

## 📁 FILE LOCATIONS

**Test Documentation**:
- Full checklist: `docs/testing/SCENARIO_2_MANUAL_CHECKLIST.md`
- This guide: `docs/testing/SCENARIO_2_QUICK_REFERENCE.md`
- Evidence: `docs/testing/evidence/screenshots/scenario2/`

**Test Reports** (update after test):
- `docs/testing/test_proof_report.md`
- `docs/testing/test_feedback.md`

---

**Document Version**: 1.0
**Created**: 2025-10-21
**Test Status**: ⏳ Pending (awaiting Scenario 1 completion)

**Related Documents**:
- [STEP 0: Start Emulator](STEP_0_START_EMULATOR.md)
- [Scenario 2 Full Checklist](SCENARIO_2_MANUAL_CHECKLIST.md)
- [How to Run Apps](HOW_TO_RUN_APPS.md)
- [Next Session Test Plan](NEXT_SESSION_TEST_PLAN.md)
