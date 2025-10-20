# PharmApp Setup - Remaining Fixes

## Current Status

✅ **Installed and Working:**
- Flutter 3.35.3
- Android Studio 2025.1.4
- Android SDK 36.1.0
- Firebase CLI 14.20.0
- FlutterFire CLI 1.3.1
- Node.js, npm, Git, VS Code

⚠️ **Issues to Fix:**
1. Android command-line tools missing
2. Visual Studio Build Tools incomplete

---

## Fix 1: Android Command-Line Tools (REQUIRED)

### Option A: Using PowerShell Script (Recommended - Fastest)

Run in PowerShell as Administrator:

```powershell
cd C:\Users\aebon\projects\pharmapp-mobile
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\fix-android-cmdline-tools.ps1
```

After running:
1. Close and reopen PowerShell
2. Run: `flutter doctor --android-licenses`
3. Type 'y' to accept all licenses

### Option B: Using Android Studio (Alternative)

1. Open Android Studio
2. Click on: **More Actions → SDK Manager** (or File → Settings → Android SDK)
3. Click on **"SDK Tools"** tab
4. Check: ☑ **Android SDK Command-line Tools (latest)**
5. Click **"Apply"** → **"OK"**
6. Wait for installation to complete
7. Close and reopen terminal
8. Run: `flutter doctor --android-licenses`

---

## Fix 2: Visual Studio Build Tools (User will reinstall)

**Status:** User is reinstalling/updating Visual Studio Build Tools

### Visual Studio Build Tools Installation

**Option A: Visual Studio Build Tools 2022 (Recommended)**

1. Download Visual Studio 2022 Build Tools:
   https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022

2. Run the installer

3. Select: **"Desktop development with C++"**

4. In the right panel, ensure these are checked:
   - ✅ MSVC v143 - VS 2022 C++ x64/x86 build tools (Latest)
   - ✅ Windows 11 SDK (10.0.22621.0 or later)
   - ✅ C++ CMake tools for Windows
   - ✅ C++ ATL for latest v143 build tools (optional but recommended)

5. Click **Install** (will take 30-60 minutes)

6. After installation, restart your computer

7. Run: `flutter doctor -v` to verify

**Option B: Visual Studio 2022 Community (Full IDE)**

If you prefer the full Visual Studio IDE:

1. Download Visual Studio 2022 Community:
   https://visualstudio.microsoft.com/vs/community/

2. During installation, select:
   - ✅ **Desktop development with C++**
   - ✅ **Universal Windows Platform development** (optional)

3. Individual components needed:
   - MSVC v143 C++ build tools
   - Windows 11 SDK
   - C++ CMake tools

4. Complete installation and restart

5. Run: `flutter doctor -v`

### Fixing Incomplete Visual Studio 2019 Installation

If you want to fix the existing VS 2019 Build Tools instead:

1. Find and run: **Visual Studio Installer**
   - Search in Start menu for "Visual Studio Installer"

2. For "Visual Studio Build Tools 2019", click **Modify**

3. Ensure **"Desktop development with C++"** is checked

4. In right panel, verify:
   - MSVC v142 build tools
   - Windows 10 SDK (10.0.19041.0 or higher)
   - C++ CMake tools

5. Click **Modify** to complete installation

6. Restart computer

7. Run: `flutter doctor -v`

### Do You Need Visual Studio?

**For PharmApp Development:**
- **Android apps**: NO (Android Studio is enough)
- **Web apps**: NO (Chrome is enough)
- **Windows desktop apps**: YES (required)

**If you only need Android and Web**, you can skip Visual Studio entirely.
The Flutter doctor warning won't affect your Android/Web development.

---

## Priority Order

**To get your PharmApp development environment fully working:**

1. **Fix Android command-line tools** (5 minutes)
   - This is CRITICAL for building Android apps

2. **Accept Android licenses** (2 minutes)
   - Run: `flutter doctor --android-licenses`

3. **Visual Studio (optional)** (30-60 minutes)
   - Only if you need Windows desktop builds
   - Can be done later

---

## Current Status - After Reboot

### ✅ Completed:
- Flutter 3.35.3 installed at `C:\tools\flutter`
- Android Studio 2025.1.4 installed
- Android SDK 36.1.0 at `C:\Users\aebon\AppData\Local\Android\sdk`
- Firebase CLI 14.20.0 installed
- FlutterFire CLI 1.3.1 installed
- Visual Studio Build Tools installed (user is rebooting)

### ⏳ To Do After Reboot:

1. **Run Android Command-Line Tools Fix**
   ```powershell
   cd C:\Users\aebon\projects\pharmapp-mobile
   .\fix-android-complete.ps1
   ```

2. **Accept Android Licenses**
   ```powershell
   flutter doctor --android-licenses
   # Type 'y' for all prompts
   ```

3. **Verify Complete Setup**
   ```powershell
   flutter doctor -v
   # Should show all green checkmarks
   ```

4. **Locate Flutter Apps**
   - Find: pharmacy_app, courier_app, admin_panel, pharmapp_unified, shared
   - These should be in a separate repository or directory
   - Check if they exist in parent directory or need to be cloned

5. **Install Dependencies (once apps located)**
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

6. **Configure Firebase**
   ```bash
   cd pharmacy_app
   flutterfire configure --project=mediexchange

   cd ../courier_app
   flutterfire configure --project=mediexchange

   cd ../admin_panel
   flutterfire configure --project=mediexchange

   cd ../pharmapp_unified
   flutterfire configure --project=mediexchange
   ```

7. **Build and Test**
   ```bash
   cd pharmacy_app
   flutter run -d chrome
   flutter build apk
   ```

---

## Quick Commands Reference

```powershell
# Check Flutter environment
flutter doctor -v

# Accept Android licenses
flutter doctor --android-licenses

# Check Firebase
firebase --version
firebase login

# Check FlutterFire
flutterfire --version
```

---

## Need Help?

If you encounter any issues:
1. Run `flutter doctor -v` and share the output
2. Check that PATH includes:
   - C:\tools\flutter\bin
   - C:\Users\aebon\AppData\Local\Android\sdk\cmdline-tools\latest\bin
   - C:\Users\aebon\AppData\Local\Pub\Cache\bin
