# Setup Firebase Keys for Testing

## ONE-TIME SETUP (Do this once, never repeat)

### Step 1: Get Your Real Firebase Keys

1. Go to: https://console.firebase.google.com/project/mediexchange/settings/general
2. Scroll to **"Your apps"** section
3. Find the **Web app** (globe icon 🌐)
4. Click **"Config"** to see the configuration
5. You'll see:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",           // ← COPY THIS
  appId: "1:850077575356:web:..." // ← COPY THIS
};
```

### Step 2: Update firebase_options.dart Files

Update these 3 files with your REAL keys:

#### File 1: `pharmacy_app/lib/firebase_options.dart`
Lines 36 and 40:
```dart
// REPLACE THIS:
defaultValue: 'AIzaSyC-PLACEHOLDER-REPLACE-WITH-REAL-KEY',
defaultValue: '1:850077575356:web:PLACEHOLDER-REPLACE-WITH-REAL-APPID',

// WITH YOUR REAL KEYS:
defaultValue: 'AIzaSy[YOUR_REAL_API_KEY_HERE]',
defaultValue: '1:850077575356:web:[YOUR_REAL_APP_ID_HERE]',
```

#### File 2: `courier_app/lib/firebase_options.dart`
Same lines - replace placeholders with real keys

#### File 3: `admin_panel/lib/firebase_options.dart`
Same lines - replace placeholders with real keys

### Step 3: Verify Git Ignores These Files

Run this command to confirm:
```bash
git status pharmacy_app/lib/firebase_options.dart
```

**Expected output**: Nothing (file is ignored) ✅

If you see the file listed, it means `.gitignore` is not working properly.

### Step 4: Test

After updating, run:
```bash
cd pharmacy_app
flutter run -d chrome --web-port=8084
```

Registration should now work! 🎉

---

## Why This Works Forever

1. **`.gitignore` already excludes `**/firebase_options.dart`** (line 52)
2. **Real keys stay in your local files** for testing
3. **Git will NEVER commit them** to the repository
4. **You only do this ONCE** - keys stay forever on your machine

---

## Security Guarantees

✅ **Real keys are in your local files** for testing
✅ **Git ignores these files** - they won't be committed
✅ **Other developers** will need to set up their own keys
✅ **CI/CD** uses environment variables (not files)

---

## Troubleshooting

**If registration still fails after setup:**
1. Verify you copied the FULL API key (starts with `AIzaSy...`)
2. Verify you copied the FULL App ID (starts with `1:850077575356:web:...`)
3. Clear browser cache and restart Flutter: `flutter run -d chrome`
4. Check Chrome DevTools console for the actual error

**If git tries to commit the file:**
1. Run: `git rm --cached pharmacy_app/lib/firebase_options.dart`
2. Run: `git rm --cached courier_app/lib/firebase_options.dart`
3. Run: `git rm --cached admin_panel/lib/firebase_options.dart`
4. Verify `.gitignore` line 52 says: `**/firebase_options.dart`

---

**Created**: 2025-10-23
**Purpose**: Permanent solution for Firebase testing keys
**Status**: Ready to use
