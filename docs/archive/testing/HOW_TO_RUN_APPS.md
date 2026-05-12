# 🚀 How to Run PharmApp Applications

**Quick Guide**: Running pharmacy_app and courier_app on Android Emulator

---

## 📋 Prerequisites (MUST DO FIRST)

### ⚠️ STEP 0: START THE EMULATOR (CRITICAL)

**This is the FIRST thing you must do before ANY testing!**

#### Option 1: Command Line (Recommended)
```bash
# Start Pixel 9a emulator
emulator -avd Pixel_9a
```

#### Option 2: Android Studio
- Open Android Studio
- Go to Device Manager (phone icon in toolbar)
- Click ▶️ on "Pixel 9a" emulator

### Wait 1-2 Minutes for Emulator to Boot

**Then verify it's ready**:
```bash
adb devices
```

**Expected Output**:
```
List of devices attached
emulator-5554   device
```

**✅ Ready when status shows "device" (NOT "offline")**

---

## ⚠️ Common Mistake: Skipping Emulator Start

**ERROR**: "No supported devices found with name or id matching 'emulator-5554'"
**CAUSE**: Emulator is not running
**FIX**: Go back to STEP 0 and start the emulator

---

## 🏥 SCENARIO 1: Run Pharmacy App

### Step 1: Open Terminal/PowerShell

**Windows**: Press `Win + X`, select "Windows Terminal" or "PowerShell"

### Step 2: Navigate to pharmacy_app Folder

```bash
cd C:\Users\aebon\projects\pharmapp-mobile\pharmacy_app
```

### Step 3: Launch the App

```bash
flutter run -d emulator-5554
```

### What Happens:
1. **Building** (2-5 minutes first time):
   ```
   Running Gradle task 'assembleDebug'...
   Building...
   ```

2. **Installing on Emulator**:
   ```
   Installing app...
   ```

3. **App Launches**:
   ```
   Flutter run key commands.
   r Hot reload.
   R Hot restart.
   q Quit.
   ```

4. **App appears on emulator** with blue theme

### Step 4: Perform Test

**Now you can manually**:
1. Tap "Create Account" on emulator
2. Fill registration form with test data:
   ```
   Pharmacy Name: Test Pharmacy October 2025
   Email: testpharmacy2025@promoshake.net
   Password: TestPharm2025!
   Phone: +237677123456
   Country: Cameroon
   Payment: MTN Mobile Money
   Payment Phone: 677123456
   ```
3. Complete registration
4. **Data is saved to Firebase automatically!**

### Step 5: Verify in Firebase Console

**Open Firebase Console**:
https://console.firebase.google.com/project/mediexchange

**Check 4 places**:

1. **Authentication** → Users
   - Find: testpharmacy2025@promoshake.net
   - Copy the User ID (UID)

2. **Firestore** → `pharmacies` collection
   - Find document with the UID
   - Verify pharmacy data is there

3. **Firestore** → `wallets` collection
   - Find wallet document
   - Verify balance = 0 XAF

4. **Firestore** → `pharmacies/[UID]` → payment preferences
   - **CRITICAL CHECK**: Verify phone is encrypted
   - Must have: `encryptedPhone`, `phoneHash`, `maskedPhone`
   - Must NOT have: plaintext "677123456"

---

## 🚴 SCENARIO 2: Run Courier App

### Step 1: Stop Pharmacy App (if running)

In the terminal where pharmacy_app is running:
```
Press 'q' to quit
```

OR open new terminal

### Step 2: Navigate to courier_app Folder

```bash
cd C:\Users\aebon\projects\pharmapp-mobile\courier_app
```

### Step 3: Launch the App

```bash
flutter run -d emulator-5554
```

### What Happens:
1. **Building** (2-5 minutes first time)
2. **Installing on Emulator**
3. **App Launches** with green theme

### Step 4: Perform Test

**Now you can manually**:
1. Tap "Create Account" on emulator
2. Fill registration form:
   ```
   Full Name: Test Courier October 2025
   Email: testcourier2025@promoshake.net
   Password: TestCourier2025!
   Phone: +237678123456
   Vehicle Type: Motorcycle
   License Plate: ABC-123-XY
   City: Douala
   Payment: Orange Money
   Payment Phone: 694123456
   ```
3. Complete registration
4. **Data is saved to Firebase automatically!**

### Step 5: Verify in Firebase Console

**Check 4 places**:

1. **Authentication** → Users
   - Find: testcourier2025@promoshake.net

2. **Firestore** → `couriers` collection
   - Find courier document
   - Verify vehicle type, license plate

3. **Firestore** → `wallets` collection
   - Verify wallet created

4. **Firestore** → Payment preferences
   - **CRITICAL**: Verify "694123456" is encrypted
   - Must have: `encryptedPhone`, `phoneHash`, `maskedPhone = "694****56"`

---

## 🔄 Quick Command Reference

### Pharmacy App
```bash
cd C:\Users\aebon\projects\pharmapp-mobile\pharmacy_app
flutter run -d emulator-5554
```

### Courier App
```bash
cd C:\Users\aebon\projects\pharmapp-mobile\courier_app
flutter run -d emulator-5554
```

### Stop Running App
Press `q` in the terminal

### Hot Reload (if app is running and you made code changes)
Press `r` in the terminal

### Full Restart
Press `R` (capital R) in the terminal

---

## 📸 Taking Screenshots on Emulator

### Method 1: Emulator Built-in (Recommended)
1. Click the **camera icon** (📷) in emulator toolbar (right side)
2. Screenshot saved to your Pictures folder
3. Copy to: `C:\Users\aebon\projects\pharmapp-mobile\docs\testing\evidence\screenshots\`

### Method 2: Windows Snipping Tool
1. Press `Win + Shift + S`
2. Select area to capture
3. Save to: `docs\testing\evidence\screenshots\`

---

## ⚠️ Troubleshooting

### Issue: "No devices found"
**Fix**:
```bash
# Check emulator status
adb devices

# If no device, start emulator from Android Studio
```

### Issue: "Flutter not recognized"
**Fix**:
```bash
# Add Flutter to PATH or use full path
C:\path\to\flutter\bin\flutter run -d emulator-5554
```

### Issue: "Gradle build failed"
**Fix**:
```bash
# Clean and retry
flutter clean
flutter pub get
flutter run -d emulator-5554
```

### Issue: "App crashes on launch"
**Fix**:
```bash
# Check logs
flutter logs
```

### Issue: "Firebase connection error"
**Fix**:
- Check internet connection
- Verify Firebase project is active
- Check `firebase_options.dart` has correct configuration

---

## 🎯 Complete Test Workflow

### For Pharmacy Registration (Scenario 1):

1. **Launch App**:
   ```bash
   cd pharmacy_app
   flutter run -d emulator-5554
   ```

2. **Manual Test** (on emulator):
   - Register pharmacy with test data
   - Take screenshots (11 total)

3. **Verify Firebase** (in browser):
   - Open Firebase Console
   - Check all 4 document types
   - **CRITICAL**: Verify payment encryption

4. **Document Results**:
   - Update `docs/testing/test_proof_report.md`
   - Update `docs/testing/test_feedback.md`

### For Courier Registration (Scenario 2):

1. **Launch App**:
   ```bash
   cd courier_app
   flutter run -d emulator-5554
   ```

2. **Manual Test** (on emulator):
   - Register courier with test data
   - Take screenshots (11 total)

3. **Verify Firebase**:
   - Check all 4 document types
   - **CRITICAL**: Verify payment encryption (694****56)

4. **Document Results**:
   - Update `docs/testing/SCENARIO_2_test_proof_report.md`
   - Update `docs/testing/SCENARIO_2_test_feedback.md`

---

## 📊 Expected Timeline

| Activity | Duration |
|----------|----------|
| Launch pharmacy_app | 3-5 min (first time) |
| Perform registration | 5 min |
| Verify in Firebase | 7 min |
| Take screenshots | 3 min |
| **Total Scenario 1** | **20-25 min** |
| Launch courier_app | 3-5 min (first time) |
| Perform registration | 5 min |
| Verify in Firebase | 7 min |
| Take screenshots | 3 min |
| **Total Scenario 2** | **20-25 min** |
| **Grand Total** | **40-50 min** |

---

## ✅ Success Indicators

**App Launched Successfully**:
- ✅ Emulator shows app interface
- ✅ No crash or error screens
- ✅ Can interact with UI (tap buttons, fill forms)

**Registration Successful**:
- ✅ Success message appears
- ✅ Dashboard/home screen loads
- ✅ No error messages

**Firebase Verification Successful**:
- ✅ User in Authentication
- ✅ Profile in Firestore
- ✅ Wallet created (0 XAF)
- ✅ **Payment phone encrypted** (CRITICAL)

---

## 🔒 Critical Security Reminder

**After EVERY registration, verify**:
```bash
# Open Firebase Console
# Go to Firestore → pharmacies or couriers
# Find the document
# Expand payment preferences
# Press Ctrl+F, search for the phone number (677123456 or 694123456)
```

**Expected**: **ZERO MATCHES** (phone is encrypted)

**If found in plaintext**: **CRITICAL SECURITY FAILURE** - Stop testing immediately

---

**Need Help?**
- Check `docs/testing/MANUAL_TEST_CHECKLIST.md` for step-by-step guide
- Check `docs/testing/QUICK_REFERENCE.md` for quick tips
- Check `docs/testing/SECURITY_VERIFICATION_GUIDE.md` for security checks

---

**Document Version**: 1.0
**Last Updated**: 2025-10-21
