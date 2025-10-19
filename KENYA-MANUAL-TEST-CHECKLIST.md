# 🇰🇪 Kenya Pharmacy Registration - Manual Testing Checklist

**Use this checklist when performing manual UI testing**

---

## ✅ Pre-Test Setup

- [ ] Pharmacy app running on http://localhost:8084
- [ ] Firebase project accessible (mediexchange)
- [ ] Firebase Console open in browser
- [ ] Test data ready (see below)

---

## 📋 Test Data

```
Country: Kenya (🇰🇪)
Payment Operator: M-Pesa (Safaricom)
Mobile Number: 712345678
Pharmacy Name: Nairobi Test Pharmacy 2025-10-19
Email: nairobi-test-20251019@example.com
Phone: +254712345678
Address: Westlands, Nairobi
City: Nairobi
Password: TestKenya123!
```

---

## 🧪 Test Execution Steps

### Step 1: Navigate to Registration
- [ ] Open http://localhost:8084 in browser
- [ ] Click "Register" or "Sign Up" button
- [ ] Verify registration form loads

### Step 2: Country Selection (TEST-001)
- [ ] First screen shows country selection
- [ ] Find and select "🇰🇪 Kenya" from list
- [ ] Click "Continue" or "Next" button
- [ ] Screenshot: `kenya-step1-country.png`

### Step 3: Payment Method Selection
- [ ] Payment method screen appears
- [ ] Select operator: "M-Pesa (Safaricom)"
- [ ] Enter mobile number: 712345678
- [ ] Verify validation messages (if any)
- [ ] Click "Continue" or "Next" button
- [ ] Screenshot: `kenya-step2-payment.png`

### Step 4: Pharmacy Details
- [ ] Pharmacy registration form appears
- [ ] Enter pharmacy name: "Nairobi Test Pharmacy 2025-10-19"
- [ ] Enter email: nairobi-test-20251019@example.com
- [ ] Enter phone: +254712345678
- [ ] Enter address: "Westlands, Nairobi"
- [ ] Select city: "Nairobi" from dropdown
- [ ] Enter password: TestKenya123!
- [ ] Confirm password: TestKenya123!
- [ ] Click "Register" button
- [ ] Screenshot: `kenya-step3-details.png`

### Step 5: Registration Success
- [ ] Registration completes without errors
- [ ] Navigate to dashboard or home screen
- [ ] Screenshot: `kenya-step4-success.png`

---

## 🔍 Firebase Console Verification

### Authentication Verification
- [ ] Open: https://console.firebase.google.com/project/mediexchange/authentication/users
- [ ] Search for: nairobi-test-20251019@example.com
- [ ] User exists with UID: _______________
- [ ] Screenshot: `firebase-auth.png`

### Pharmacy Document Verification
- [ ] Open: https://console.firebase.google.com/project/mediexchange/firestore
- [ ] Navigate to: `pharmacies` collection
- [ ] Find document with UID from above
- [ ] Verify fields:
  - [ ] `country: "Kenya"` ✅
  - [ ] `currency: "KES"` ✅
  - [ ] `city: "Nairobi"` ✅
  - [ ] `email: "nairobi-test-20251019@example.com"` ✅
  - [ ] `status: "active"` ✅
- [ ] Screenshot: `firebase-pharmacy.png`

### Payment Preferences Verification
- [ ] Navigate to: `pharmacies/{uid}/payment_preferences/default`
- [ ] Verify fields:
  - [ ] `operator: "M-Pesa"` ✅
  - [ ] `encryptedPhone`: (exists, not plaintext)
  - [ ] `phoneHash`: (exists, is hash)
  - [ ] `maskedPhone: "712****78"` ✅
- [ ] Screenshot: `firebase-payment.png`

### Wallet Verification
- [ ] Navigate to: `wallets/{uid}`
- [ ] Verify fields:
  - [ ] `currency: "KES"` ✅
  - [ ] `balance: 0` ✅
  - [ ] `availableBalance: 0` ✅
  - [ ] `heldBalance: 0` ✅
  - [ ] `pharmacyId: {uid}` ✅
- [ ] Screenshot: `firebase-wallet.png`

---

## 📱 App Dashboard Verification

### Wallet Display
- [ ] Wallet section visible on dashboard
- [ ] Currency shows as "KES" or Kenya Shillings symbol
- [ ] Balance shows 0 or 0.00
- [ ] Screenshot: `app-wallet.png`

### Pharmacy Info Display
- [ ] Pharmacy name: "Nairobi Test Pharmacy 2025-10-19"
- [ ] City: Nairobi
- [ ] Country: Kenya
- [ ] Screenshot: `app-pharmacy-info.png`

---

## 🧪 Additional Tests (Optional)

### Payment Method Display
- [ ] Navigate to payment settings/preferences
- [ ] Verify M-Pesa is shown as payment method
- [ ] Phone number displayed as masked: 712****78
- [ ] Screenshot: `app-payment-display.png`

### Sandbox Credit Test
- [ ] Attempt to add funds using sandbox credit
- [ ] Verify wallet balance updates
- [ ] Currency remains KES
- [ ] Screenshot: `app-sandbox-credit.png`

---

## 📊 Test Results

### Overall Status
- [ ] All registration steps completed successfully
- [ ] All Firebase documents created correctly
- [ ] All Kenya-specific data (country, currency, city) verified
- [ ] Payment preferences encrypted and masked
- [ ] Wallet created with KES currency

### Issues Found
List any issues encountered:
1. ______________________________________
2. ______________________________________
3. ______________________________________

### Screenshots Captured
Total screenshots: _____
All uploaded to: ______________________

---

## ✅ Final Verification

- [ ] User can log in with registered credentials
- [ ] Dashboard displays correctly with KES wallet
- [ ] No console errors in browser
- [ ] Firebase documents match expected structure
- [ ] Payment data is encrypted (not plaintext)

---

## 📝 Test Notes

**Tester Name:** _______________
**Test Date:** _______________
**Test Duration:** _______________
**Browser Used:** _______________
**Overall Result:** ☐ PASS ☐ FAIL ☐ PARTIAL

**Additional Comments:**
_______________________________________
_______________________________________
_______________________________________

---

**Test ID:** TEST-003
**Test Type:** Manual UI Testing
**Test Coverage:** Kenya Pharmacy Registration (End-to-End)
**Expected Duration:** 15-20 minutes
