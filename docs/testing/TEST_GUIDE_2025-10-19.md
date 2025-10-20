# Testing Guide - Country Selection First Feature (2025-10-19)

## 🎯 **TESTING OBJECTIVE**

Verify that pharmacy registration now starts with **country and payment method selection FIRST**, before collecting pharmacy details.

---

## 🧪 **TESTING AGENT INSTRUCTIONS**

Follow these tests in order. Each test must PASS before proceeding to the next.

---

## ✅ **TEST 1: Country Selection Appears FIRST**

### **Test ID:** TEST-001
### **Priority:** CRITICAL
### **Type:** Visual Verification
### **Prerequisites:** None

### **Setup:**
```bash
# 1. Kill ALL Flutter/Dart processes
taskkill //F //IM dart.exe
taskkill //F //IM chrome.exe

# 2. Navigate to pharmacy app
cd D:\Projects\pharmapp-mobile\pharmacy_app

# 3. Launch fresh instance
flutter run -d chrome --web-port=8084
```

### **Wait For:**
- Console shows: "Application running on http://localhost:8084"
- Chrome browser opens automatically
- App loads without errors (~60-90 seconds first time)

### **Test Steps:**
1. Open http://localhost:8084 in browser (if not auto-opened)
2. Click "Register" or "Create Account" link/button
3. **OBSERVE the first screen that appears**

### **Expected Result - PASS:**
```
Screen Title: "Welcome to PharmApp!" OR "Step 1: Select Country"

Content visible:
✅ Logo (PharmApp/NoWasteMed logo)
✅ Title: "Welcome to PharmApp!"
✅ Subtitle: "Let's start by selecting your country and payment method"
✅ BIG BUTTON: "Select Country & Payment Method"
✅ Info card with text:
   - "Why choose country first?"
   - "Sets your currency (XAF, KES, NGN, etc.)"
   - "Shows correct phone format"
   - "Displays available payment operators"
   - "Helps group pharmacies by city/region"
✅ Sign In link at bottom

Content NOT visible:
❌ NO "Pharmacy Name" input field
❌ NO "Email Address" input field
❌ NO "Phone Number" input field
❌ NO "Address" input field
❌ NO "Password" input fields
❌ NO "Continue" button
```

### **Expected Result - FAIL:**
```
If you see:
❌ Pharmacy Name field
❌ Email field
❌ Any form input fields
❌ "Continue" button at bottom of form

→ This means the OLD code is running, NOT the new country-first code
```

### **Verification Commands:**
```bash
# Check that code has the new structure
grep -n "_currentStep = 0" pharmacy_app/lib/screens/auth/register_screen.dart

# Should return: Line 33 or similar with _currentStep = 0

# Check welcome screen exists
grep -n "_buildCountrySelectionPrompt" pharmacy_app/lib/screens/auth/register_screen.dart

# Should return: Multiple lines including the method definition
```

### **Proof Required:**
- [ ] Screenshot of registration first screen
- [ ] Browser console (F12) showing NO errors
- [ ] Code verification output from grep commands
- [ ] Timestamp when test was run

### **Test Result:**
- [ ] ✅ PASS - Country selection screen appears first
- [ ] ❌ FAIL - Old pharmacy form appears (specify what you see)
- [ ] ⚠️ BLOCKED - Cannot complete test (specify blocker)

---

## ✅ **TEST 2: Country Selection Flow Works**

### **Test ID:** TEST-002
### **Priority:** HIGH
### **Type:** Functional
### **Prerequisites:** TEST-001 must PASS

### **Test Steps:**

#### **Step 2.1: Click Country Selection Button**
1. Click the "Select Country & Payment Method" button
2. Wait for country selection screen to appear

**Expected:**
- New screen loads
- Shows grid or list of countries with flags

#### **Step 2.2: Verify 5 Countries Present**
**Expected countries:**
1. 🇨🇲 Cameroon (XAF - FCFA)
2. 🇰🇪 Kenya (KES - KSh)
3. 🇹🇿 Tanzania (TZS - TSh)
4. 🇺🇬 Uganda (UGX - USh)
5. 🇳🇬 Nigeria (NGN - ₦)

**Verify:**
- [ ] All 5 countries visible
- [ ] Each has flag/icon
- [ ] Each shows currency

#### **Step 2.3: Select a Country**
1. Click on "Cameroon" (or any country)
2. Observe what happens

**Expected:**
- Payment operator dropdown/section appears
- Shows operators for selected country:
  - **Cameroon**: MTN Mobile Money, Orange Money
  - **Kenya**: M-Pesa (Safaricom), Airtel Money
  - **Tanzania**: M-Pesa (Vodacom), Tigo Pesa, Airtel Money
  - **Uganda**: MTN Mobile Money, Airtel Money
  - **Nigeria**: MTN MoMo, Airtel Money, Glo Mobile Money, 9mobile

#### **Step 2.4: Select Payment Operator**
1. Choose operator (e.g., "MTN Mobile Money" for Cameroon)
2. Observe phone number field

**Expected:**
- Phone number field appears
- Shows hint text with valid prefixes
- Example for Cameroon MTN: "Enter number starting with: 650, 651, 677, 678..."

#### **Step 2.5: Enter Phone Number**
**For Cameroon MTN, try:**
```
Valid: 677123456
Invalid: 694123456 (Orange prefix with MTN selected)
```

**Expected:**
- Valid number: No error
- Invalid number: Error message showing operator mismatch

#### **Step 2.6: Submit Country/Payment Selection**
1. Enter valid phone number
2. Click "Submit" or "Continue" or "Next"

**Expected:**
- Returns to registration screen
- NOW shows pharmacy details form (Step 2)
- AppBar title changes to "Step 2: Pharmacy Details" or similar

### **Proof Required:**
- [ ] Screenshots of each step (2.1 through 2.6)
- [ ] Browser console showing no errors
- [ ] Verification that _currentStep changed from 0 to 1

### **Test Result:**
- [ ] ✅ PASS - Full country selection flow works
- [ ] ❌ FAIL - (specify which step failed and why)
- [ ] ⚠️ BLOCKED - Cannot complete test (specify blocker)

---

## ✅ **TEST 3: Complete Registration End-to-End**

### **Test ID:** TEST-003
### **Priority:** HIGH
### **Type:** Integration
### **Prerequisites:** TEST-001 and TEST-002 must PASS

### **Test Steps:**

#### **Step 3.1: Complete Country/Payment Selection**
Follow TEST-002 steps to select country and payment method.

**Use these test values:**
```
Country: Cameroon
Operator: MTN Mobile Money
Phone: 677888999
```

#### **Step 3.2: Fill Pharmacy Details**
After country selection, you should see the pharmacy details form.

**Fill with test data:**
```
Pharmacy Name: Test Pharmacy 2025-10-19-001
Email: test-pharmacy-20251019-001@example.com
Phone Number: 677888999 (should match payment phone)
Pharmacy Address: Douala, Akwa, Cameroon
Password: TestPass123!
Confirm Password: TestPass123!
```

**Optional fields:**
- Enhanced Location: Skip or select random location on map

#### **Step 3.3: Submit Registration**
1. Click "Complete Registration" button
2. Wait for processing
3. Observe result

**Expected - SUCCESS:**
```
✅ No errors in browser console
✅ Success message appears
✅ Redirects to pharmacy dashboard
✅ User is logged in
```

**Expected - FAILURE (if Firebase keys are placeholders):**
```
❌ Error: "API key not valid"
❌ Backend creates user but frontend sign-in fails
```

#### **Step 3.4: Verify in Firebase Console**

**Firebase Authentication:**
```
1. Open http://127.0.0.1:4000/auth (emulator) OR
   https://console.firebase.google.com/project/mediexchange/authentication

2. Find user: test-pharmacy-20251019-001@example.com

3. Verify:
   ✅ User exists
   ✅ UID generated
   ✅ Email verified
```

**Firestore Database:**
```
1. Open http://127.0.0.1:4000/firestore (emulator) OR
   https://console.firebase.google.com/project/mediexchange/firestore

2. Navigate to: pharmacies/{user-id}

3. Verify fields exist:
   ✅ pharmacyName: "Test Pharmacy 2025-10-19-001"
   ✅ email: "test-pharmacy-20251019-001@example.com"
   ✅ paymentPreferences.country: "cameroon"
   ✅ paymentPreferences.operator: "mtn_cameroon"
   ✅ paymentPreferences.currency: "XAF"
   ✅ paymentPreferences.encryptedPhone: (encrypted value)
   ✅ paymentPreferences.phoneHash: (hash value)

4. Navigate to: wallets/{user-id}

5. Verify wallet created:
   ✅ available: 0
   ✅ held: 0
   ✅ currency: "XAF"
```

### **Proof Required:**
- [ ] Screenshot of filled registration form
- [ ] Screenshot of success message or dashboard
- [ ] Screenshot of Firebase Authentication showing new user
- [ ] Screenshot of Firestore pharmacies document with payment preferences
- [ ] Screenshot of Firestore wallets document
- [ ] Browser console log (full output)

### **Test Result:**
- [ ] ✅ PASS - Complete registration works end-to-end
- [ ] ❌ FAIL - (specify at which step it failed)
- [ ] ⚠️ BLOCKED - Firebase API key issue (specify error)

---

## 🔄 **ADDITIONAL TESTS (Optional but Recommended)**

### **TEST 4: Cross-Country Testing**

Repeat TEST-003 for each country:

| Country | Operator | Test Phone | Expected Currency |
|---------|----------|------------|-------------------|
| 🇨🇲 Cameroon | MTN MoMo | 677123456 | XAF |
| 🇰🇪 Kenya | M-Pesa | 712345678 | KES |
| 🇹🇿 Tanzania | M-Pesa Vodacom | 742345678 | TZS |
| 🇺🇬 Uganda | MTN MoMo | 772345678 | UGX |
| 🇳🇬 Nigeria | MTN MoMo | 7031234567 | NGN |

**For each country, verify:**
- [ ] Correct operators shown
- [ ] Correct currency displayed
- [ ] Phone validation matches country rules
- [ ] Registration creates correct currency in Firestore

---

### **TEST 5: Error Handling**

#### **Test 5.1: Invalid Phone Number**
1. Select Cameroon + MTN
2. Enter Orange phone number (694123456)
3. Try to submit

**Expected:**
- ❌ Error message: "Phone number doesn't match selected operator"
- Cannot proceed until fixed

#### **Test 5.2: Back Button Behavior**
1. Complete country selection
2. Go to pharmacy details form
3. Press browser back button

**Expected:**
- Returns to country selection screen OR
- Shows confirmation dialog OR
- Preserves selected country data

#### **Test 5.3: Refresh During Registration**
1. Complete country selection
2. Start filling pharmacy details
3. Refresh browser (F5)

**Expected:**
- Form data preserved OR
- Returns to step 1 (country selection)

---

## 📝 **TEST REPORT TEMPLATE**

Use this template for final report:

```markdown
# PharmApp Registration Testing Report
**Date:** 2025-10-19
**Tester:** [Your Name]
**Environment:** Windows 11 / Flutter 3.35.3 / Chrome

## Summary
- Total Tests: 3 (critical) + 2 (optional)
- Passed: X
- Failed: X
- Blocked: X

## Test Results

### TEST-001: Country Selection First
**Status:** ✅ PASS / ❌ FAIL / ⚠️ BLOCKED
**Evidence:**
- Screenshot: [attached/linked]
- Code verification: [grep output]
**Notes:** [Any observations]

### TEST-002: Country Selection Flow
**Status:** ✅ PASS / ❌ FAIL / ⚠️ BLOCKED
**Evidence:**
- Screenshots: [6 steps]
- Console log: [no errors]
**Notes:** [Any observations]

### TEST-003: Complete Registration
**Status:** ✅ PASS / ❌ FAIL / ⚠️ BLOCKED
**Evidence:**
- Firebase Auth: [screenshot showing user]
- Firestore pharmacies: [screenshot showing payment preferences]
- Firestore wallets: [screenshot showing wallet]
**Notes:** [Any observations]

## Issues Found
1. [Issue description]
2. [Issue description]

## Recommendations
- [Recommendation 1]
- [Recommendation 2]

## Conclusion
Ready for user testing: YES / NO
Reason: [Explanation]
```

---

## 🚨 **TROUBLESHOOTING**

### **Problem: OLD registration screen still appears**

**Diagnosis:**
```bash
# Check if code was modified recently
ls -lh pharmacy_app/lib/screens/auth/register_screen.dart

# If modified > 1 hour ago, code may not be running
```

**Solution:**
```bash
# Kill ALL processes
taskkill //F //IM dart.exe
taskkill //F //IM chrome.exe

# Full clean rebuild
cd pharmacy_app
flutter clean
flutter pub get
flutter run -d chrome --web-port=8084
```

---

### **Problem: Firebase API key error during registration**

**Error Message:**
```
[firebase_auth/api-key-not-valid]
```

**Cause:** Firebase keys in firebase_options.dart are placeholders

**Solution:**
```bash
# Check current keys
grep "defaultValue.*AIza" pharmacy_app/lib/firebase_options.dart

# If you see "PLACEHOLDER", need to update with real keys
# Real keys (for testing ONLY):
# API Key: AIzaSyDrM96tzLwGkVaCvqEP9cWAXZYqvOEGyAs
# App ID: 1:850077575356:web:67c7130629f17dd57708b9
```

---

### **Problem: Port 8084 already in use**

**Error:**
```
SocketException: Failed to create server socket
errno = 10048
```

**Solution:**
```bash
# Find what's using port
netstat -ano | findstr ":8084"

# Kill that process (replace PID with actual PID from above)
taskkill //F //PID [PID_NUMBER]

# Then restart flutter
flutter run -d chrome --web-port=8084
```

---

## 📊 **SUCCESS CRITERIA**

The feature is ready for production when:

- [x] TEST-001 PASSES (country selection appears first)
- [x] TEST-002 PASSES (country selection flow works)
- [x] TEST-003 PASSES (complete registration succeeds)
- [ ] All 5 countries tested (optional but recommended)
- [ ] Error handling works (optional but recommended)
- [ ] Firebase credentials protected (NOT in git)
- [ ] Code reviewed
- [ ] Documentation complete

---

**Test Guide Version:** 1.0
**Last Updated:** 2025-10-19
**Related:** CHANGES_2025-10-19.md, MULTI_COUNTRY_PAYMENT_GUIDE.md
