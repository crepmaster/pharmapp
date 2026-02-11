# 🔧 URGENT FIX: Setup Firebase for Android Testing

**Issue**: Android emulator testing fails with "API key not valid" error
**Status**: 🔴 **CRITICAL - BLOCKS ALL ANDROID TESTING**
**Created**: 2025-10-21

---

## 🚨 Problem Summary

The `pharmacy_app/lib/firebase_options.dart` file currently uses PLACEHOLDER values for security:
```dart
apiKey: 'AIzaSyC-PLACEHOLDER-REPLACE-WITH-REAL-KEY',  // ❌ INVALID
appId: '1:850077575356:android:PLACEHOLDER...',        // ❌ INVALID
```

This was intentional (see CLAUDE.md) to avoid committing real API keys to git.
**However**, it completely blocks Android emulator testing.

---

## ✅ SOLUTION OPTIONS

### Option 1: FlutterFire CLI (RECOMMENDED - Automated)

**Pros**: Official Firebase tool, generates correct configs automatically
**Cons**: Requires firebase login

**Steps**:
```bash
# 1. Ensure firebase is logged in
firebase login

# 2. Install FlutterFire CLI
dart pub global activate flutterfire_cli

# 3. Run FlutterFire configure (from project root)
cd c:\Users\aebon\projects\pharmapp-mobile\pharmacy_app
flutterfire configure --project=mediexchange

# This will:
# - Generate lib/firebase_options.dart with REAL keys
# - Create android/app/google-services.json automatically
# - Setup iOS GoogleService-Info.plist
```

---

### Option 2: Manual google-services.json (FALLBACK)

If FlutterFire CLI doesn't work, manually download config:

**Steps**:
1. Open Firebase Console: https://console.firebase.google.com/project/mediexchange
2. Navigate to: Project Settings → General → Your apps
3. Find: Android app with package name `com.pharmapp.pharmacy`
4. Click: Download `google-services.json`
5. Place file in: `pharmacy_app/android/app/google-services.json`
6. **DO NOT commit this file to git** (add to .gitignore)

Then update `firebase_options.dart` to read from this file.

---

### Option 3: Environment Variables (RECOMMENDED for CI/CD)

For production builds, use environment variables:

**Build command**:
```bash
flutter run -d emulator-5554 \
  --dart-define=FIREBASE_ANDROID_API_KEY=AIzaSyDrM96tzLwGkVaCvqEP9cWAXZYqvOEGyAs \
  --dart-define=FIREBASE_ANDROID_APP_ID=1:850077575356:android:67c7130629f17dd57708b9
```

**Note**: This requires the keys to be available in your environment.

---

### Option 4: Temporary Hardcode (TESTING ONLY - NOT FOR COMMIT)

**⚠️ USE WITH EXTREME CAUTION - NEVER COMMIT THIS**

Edit `pharmacy_app/lib/firebase_options.dart`:

```dart
// Android Platform Configuration
static const FirebaseOptions android = FirebaseOptions(
  apiKey: 'AIzaSyDrM96tzLwGkVaCvqEP9cWAXZYqvOEGyAs',  // 🔧 TESTING ONLY
  appId: '1:850077575356:android:67c7130629f17dd57708b9',  // 🔧 TESTING ONLY
  messagingSenderId: '850077575356',
  projectId: 'mediexchange',
  storageBucket: 'mediexchange.firebasestorage.app',
);
```

**AFTER TESTING**:
```bash
# RESTORE PLACEHOLDERS before committing
git checkout pharmacy_app/lib/firebase_options.dart
```

---

## 🎯 IMMEDIATE ACTION REQUIRED

**For Testing to Continue TODAY**:

1. **Choose ONE of the options above**
2. **Implement the fix**
3. **Rebuild the app**:
   ```bash
   cd pharmacy_app
   flutter clean
   flutter pub get
   flutter run -d emulator-5554
   ```
4. **Re-run Scenario 1 test**
5. **Verify**: Registration completes without "API key not valid" error

---

## 🔐 SECURITY NOTES

**CRITICAL**: Real API keys should NEVER be committed to git!

**Current .gitignore** should include:
```gitignore
# Firebase
**/google-services.json
**/GoogleService-Info.plist
**/.firebase/
**/firebase-debug.log

# Environment files
.env
.env.local
**/*.env
```

**Verify .gitignore**:
```bash
cat .gitignore | grep -i firebase
cat .gitignore | grep -i google-services
```

---

## 🧪 VERIFICATION AFTER FIX

After implementing the fix, verify:

1. **App Builds Successfully**:
   ```bash
   cd pharmacy_app
   flutter build apk --debug
   # Should complete without errors
   ```

2. **Registration Works**:
   - Launch app on emulator
   - Complete registration flow
   - **Should NOT see**: "API key not valid" error
   - **Should see**: Successful navigation to dashboard

3. **Firebase Connection**:
   - Check logcat for Firebase initialization:
   ```bash
   adb logcat -s flutter:* | grep -i firebase
   # Should show successful Firebase initialization
   ```

---

## 📋 RELATED ISSUES TO FIX SIMULTANEOUSLY

While fixing the API key, also address:

**Issue #2**: City selection missing (see SCENARIO_1_TEST_FAILURE_REPORT.md)
**Issue #3**: Duplicate phone number entry (see SCENARIO_1_TEST_FAILURE_REPORT.md)

---

**Urgency**: 🔴 **CRITICAL**
**Blocks**: All Android emulator testing for pharmacy_app, courier_app, admin_panel
**Est. Time to Fix**: 15-30 minutes (Option 1 or 4)
**Priority**: **FIX IMMEDIATELY** before any further testing

---

**Next Steps After Fix**:
1. ✅ API key configured
2. ✅ App builds successfully
3. ✅ Re-run Scenario 1 test
4. ⏳ Fix issues #2 and #3
5. ⏳ Submit all fixes to code reviewer
