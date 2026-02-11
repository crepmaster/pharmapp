# 🚨 URGENT ACTION REQUIRED - API KEY FIX

**Date**: 2025-10-21
**Status**: 🔴 **CRITICAL - BLOCKING ALL ANDROID TESTING**
**Time to Fix**: 5 minutes
**Your Action Required**: YES (cannot be automated)

---

## ⚡ WHAT HAPPENED

Scenario 1 test **partially succeeded**:
- ✅ Pharmacy created in Firebase (UID: `5alQ85VL1pb3GXxPNeIUcO0ZFrJ3`)
- ❌ User cannot sign in (API key invalid error)

**Error Message**:
```
❌ Custom token sign in failed: API key not valid. Please pass a valid API key.
```

---

## 🔧 WHAT YOU NEED TO DO NOW

### Step 1: Login to Firebase (2 minutes)

Open a NEW terminal (not in Claude Code):

```bash
firebase login
```

This will open your browser. Sign in with your Google account that has access to the `mediexchange` Firebase project.

### Step 2: Configure Firebase Keys (2 minutes)

Still in the NEW terminal:

```bash
# Install FlutterFire CLI (one-time)
dart pub global activate flutterfire_cli

# Navigate to pharmacy_app
cd c:\Users\aebon\projects\pharmapp-mobile\pharmacy_app

# Generate real API keys
flutterfire configure --project=mediexchange
```

**What this does**:
- Generates `lib/firebase_options.dart` with REAL API keys
- Keys stay on your computer (NOT committed to git)
- Works for Android, iOS, and Web automatically

### Step 3: Rebuild and Test (1 minute)

```bash
# Clean build
flutter clean
flutter pub get

# Run on emulator
flutter run -d emulator-5554
```

**Expected Result**: Registration should now complete successfully without "API key" error.

---

## ✅ VERIFICATION

After running the commands above, try registering again:

1. Fill registration form
2. Complete registration
3. **Should NOT see**: "API key not valid" error
4. **Should see**: Dashboard or home screen

If you see the dashboard → ✅ **SUCCESS! Continue with testing**

---

## 📚 DETAILED GUIDES (If You Need Help)

- **Full Setup Guide**: `SETUP_FIREBASE_ANDROID.md`
- **Test Failure Analysis**: `docs/testing/SCENARIO_1_TEST_FAILURE_REPORT.md`
- **All Fixes Needed**: `docs/testing/FIXES_REQUIRED_FOR_SCENARIO_1.md`

---

## 🚀 WHAT HAPPENS NEXT

After you fix the API key:

1. ✅ **You**: Re-run Scenario 1 test (should pass now)
2. ✅ **Claude**: Implement city selection UI (30 min)
3. ✅ **Claude**: Fix duplicate phone entry (15 min)
4. ✅ **You**: Re-test again with all fixes
5. ✅ **Proceed**: Scenario 2 (Courier registration)

---

## ❓ TROUBLESHOOTING

### If `firebase login` fails:
- Check internet connection
- Try: `firebase login --reauth`
- Try: `firebase login --no-localhost`

### If `flutterfire configure` fails:
- Verify you're logged in: `firebase projects:list`
- Should show `mediexchange` project
- If not, check Firebase Console permissions

### If still getting API key error:
- Verify `pharmacy_app/lib/firebase_options.dart` was regenerated
- File should show real key (starts with `AIzaSy...`)
- Run `flutter clean && flutter pub get` again

---

**CRITICAL**: Do this NOW to unblock testing! ⏰

**Estimated Time**: 5 minutes
**Urgency**: 🔴 IMMEDIATE
**Blocks**: Everything else

---

**Quick Command Copy-Paste**:
```bash
firebase login
dart pub global activate flutterfire_cli
cd c:\Users\aebon\projects\pharmapp-mobile\pharmacy_app
flutterfire configure --project=mediexchange
flutter clean && flutter pub get && flutter run -d emulator-5554
```

Just copy all 5 lines and paste into a NEW terminal (not Claude Code terminal).
