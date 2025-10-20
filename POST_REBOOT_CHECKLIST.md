# Post-Reboot Setup Checklist for PharmApp

## What You've Accomplished So Far

✅ **Flutter SDK 3.35.3** - Installed at `C:\tools\flutter`
✅ **Android Studio 2025.1.4** - Installed
✅ **Android SDK 36.1.0** - Installed at `C:\Users\aebon\AppData\Local\Android\sdk`
✅ **Firebase CLI 14.20.0** - Installed globally via npm
✅ **FlutterFire CLI 1.3.1** - Installed via Dart pub
✅ **Visual Studio Build Tools** - Just installed (you rebooted for this)
✅ **Node.js, npm, Git, VS Code** - Already installed

---

## Steps to Complete After Reboot

### Step 1: Run Android Command-Line Tools Fix (5 minutes)

Open PowerShell and run:

```powershell
cd C:\Users\aebon\projects\pharmapp-mobile
.\fix-android-complete.ps1
```

**What this does:**
- Downloads Android command-line tools
- Installs them to the correct location
- Sets ANDROID_HOME environment variable
- Adds tools to PATH

**After script completes:** Close and reopen PowerShell

---

### Step 2: Accept Android Licenses (2 minutes)

In a fresh PowerShell window:

```powershell
flutter doctor --android-licenses
```

Type `y` for all prompts (there will be several).

---

### Step 3: Verify Everything is Working (1 minute)

```powershell
flutter doctor -v
```

**Expected result:**
- ✓ Flutter (Channel stable, 3.35.3)
- ✓ Windows Version
- ✓ Android toolchain (all green, no warnings)
- ✓ Chrome
- ✓ Visual Studio (should be green now after reboot)
- ✓ Android Studio
- ✓ VS Code
- ✓ Connected device
- ✓ Network resources

---

### Step 4: Locate Your Flutter Apps (Important!)

According to the backup documentation, PharmApp has **5 Flutter applications:**

1. **pharmacy_app** - Main pharmacy app
2. **courier_app** - Courier delivery app
3. **admin_panel** - Admin web panel
4. **pharmapp_unified** - Combined super-app
5. **shared** - Shared code package

**Current directory (`pharmapp-mobile`) contains:**
- Firebase Functions (backend)
- Firestore rules
- Cloud Functions code

**The Flutter apps should be in a different location or repository.**

**Action:** Let me know where these Flutter apps are, or if you need to:
- Clone them from a Git repository
- Locate them on your system
- Restore them from backup

---

### Step 5: Once Apps Located - Install Dependencies

For each app, run:

```bash
cd pharmacy_app
flutter pub get

cd ../courier_app
flutter pub get

cd ../admin_panel
flutter pub get

cd ../pharmapp_unified
flutter pub get

cd ../shared
flutter pub get
```

---

### Step 6: Configure Firebase for Each App

```bash
# Pharmacy App
cd pharmacy_app
flutterfire configure --project=mediexchange

# Courier App
cd ../courier_app
flutterfire configure --project=mediexchange

# Admin Panel
cd ../admin_panel
flutterfire configure --project=mediexchange

# Unified App
cd ../pharmapp_unified
flutterfire configure --project=mediexchange
```

**Note:** You'll need Firebase login credentials for project "mediexchange"

---

### Step 7: Test Your Setup

```bash
# Test Android build
cd pharmacy_app
flutter build apk

# Test web build
flutter run -d chrome --web-port=8084

# Test Windows build (if needed)
flutter build windows
```

---

## Quick Reference Commands

```powershell
# Check Flutter environment
flutter doctor -v

# Check Flutter version
flutter --version

# Check Firebase login
firebase login

# Check FlutterFire
flutterfire --version

# List available devices
flutter devices
```

---

## Troubleshooting

### If "flutter" command not found:
- Restart PowerShell/Terminal
- Check PATH includes: `C:\tools\flutter\bin`

### If Android licenses still failing:
- Open Android Studio
- Go to SDK Manager > SDK Tools
- Install "Android SDK Command-line Tools"

### If Visual Studio still showing errors:
- Open Visual Studio Installer
- Modify installation
- Ensure "Desktop development with C++" is checked

---

## Next Steps After Setup Complete

1. **Login to Firebase:** `firebase login`
2. **Test backend functions** (in current directory)
3. **Run Flutter apps** (once located)
4. **Test payment system** with sandbox
5. **Deploy to production** (when ready)

---

**You're almost there! Just 3 quick steps after reboot:**
1. Run the Android fix script
2. Accept licenses
3. Verify with `flutter doctor -v`

Then we'll locate and configure your Flutter apps!
