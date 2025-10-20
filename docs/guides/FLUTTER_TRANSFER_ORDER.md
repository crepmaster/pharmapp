# 🔄 FLUTTER TRANSFER ORDER - PharmApp Mobile Multi-App Project

## Overview
This document provides the exact order of operations for transferring your Flutter multi-app development environment (PharmApp Mobile) from one laptop to another using the specialized Flutter transfer agents.

---

## 📋 PHASE 1: PREPARATION (OLD LAPTOP)

### Prerequisites
- [ ] Active internet connection
- [ ] Git repository access
- [ ] VS Code with Claude Code extension running
- [ ] PharmApp Mobile project is open and all three apps are working
- [ ] Firebase project `mediexchange` is accessible

### Step 1: Pre-Transfer Verification
```bash
# Check Flutter environment
flutter doctor -v
flutter --version
dart --version

# Check project structure
ls -la  # Should see: pharmacy_app/, courier_app/, admin_panel/, shared/

# Verify all apps build
cd pharmacy_app && flutter build apk --debug && cd ..
cd courier_app && flutter build apk --debug && cd ..
cd admin_panel && flutter build web && cd ..

# Check Git status
git status
git branch -a
```

### Step 2: Launch Flutter Backup Agent
1. **Open Claude Code** in your PharmApp Mobile project
2. **Use this exact prompt**:
   ```
   Launch the Flutter Backup Agent to prepare this multi-app Flutter project for transfer. Document the complete Flutter development environment, all three apps (Pharmacy, Courier, Admin Panel), Firebase configuration, and shared packages.
   ```

### Step 3: Agent Execution
The Flutter backup agent will automatically:
- [ ] Document Flutter SDK and Dart versions
- [ ] Export VS Code Flutter/Dart extensions
- [ ] Backup pubspec.yaml for all three apps
- [ ] Document Firebase project configuration
- [ ] Snapshot shared package dependencies
- [ ] Document Android SDK and iOS tools (if macOS)
- [ ] Check Git status and ensure everything is committed
- [ ] Create comprehensive Flutter environment documentation

### Step 4: Verify Backup Files
Check that these files were created:
- [ ] `flutter-version-backup.txt`
- [ ] `pubspec-dependencies-backup.txt`
- [ ] `firebase-config-backup/` directory
- [ ] `platform-tools-backup.txt`
- [ ] `vscode-flutter-extensions.txt`
- [ ] `shared-packages-backup.txt`
- [ ] `FLUTTER_BACKUP_SUMMARY.txt`

### Step 5: Firebase Configuration Backup
```bash
# Document Firebase project details
firebase projects:list > firebase-projects.txt
firebase apps:list --project=mediexchange > firebase-apps.txt

# Note: Do NOT backup google-services.json (contains sensitive keys)
# These will be re-downloaded on new laptop
```

### Step 6: Commit and Push
```bash
# Add backup files to git
git add flutter-version-backup.txt
git add pubspec-dependencies-backup.txt
git add firebase-config-backup/
git add platform-tools-backup.txt
git add vscode-flutter-extensions.txt
git add shared-packages-backup.txt
git add FLUTTER_BACKUP_SUMMARY.txt

# Commit backup files
git commit -m "Add Flutter multi-app environment backup files for laptop transfer

- Complete Flutter/Dart environment documentation
- All three apps dependencies backed up (Pharmacy, Courier, Admin)
- Firebase project configuration documented
- VS Code extensions and settings exported
- Platform tools and shared packages documented"

# Push to remote repository
git push origin main
```

### Step 7: Final Verification
- [ ] All changes are committed and pushed
- [ ] Backup files are in the repository
- [ ] Firebase project is accessible
- [ ] You have repository clone URL ready
- [ ] Old laptop Flutter environment is documented

---

## 🔄 PHASE 2: RESTORATION (NEW LAPTOP)

### Prerequisites - New Laptop Initial Setup
- [ ] Install **Git** (https://git-scm.com/downloads)
- [ ] Install **VS Code** (https://code.visualstudio.com/)
- [ ] Install **Claude Code extension** in VS Code
- [ ] Have internet connection

### Step 1: Repository Setup
```bash
# Clone your PharmApp Mobile repository
git clone <your-pharmapp-mobile-repository-url>

# Navigate to project directory
cd pharmapp-mobile

# Open in VS Code
code .
```

### Step 2: Launch Flutter Restoration Agent
1. **Open Claude Code** in VS Code (Ctrl/Cmd + Shift + P → "Claude Code")
2. **Use this exact prompt**:
   ```
   Launch the Flutter Restoration Agent to set up this new laptop for PharmApp Mobile development. Read the backup files and restore the complete Flutter multi-app environment with Firebase integration.
   ```

### Step 3: Agent Execution
The Flutter restoration agent will automatically:
- [ ] Detect your operating system (Windows/macOS/Linux)
- [ ] Read Flutter environment backup files
- [ ] Install Flutter SDK (correct version from backup)
- [ ] Install Dart SDK and global packages
- [ ] Set up Android SDK and tools
- [ ] Set up iOS tools (if macOS)
- [ ] Install VS Code Flutter/Dart extensions
- [ ] Restore VS Code settings for Flutter development
- [ ] Install Firebase CLI
- [ ] Run `flutter pub get` for all three apps
- [ ] Configure shared package dependencies
- [ ] Set up platform-specific build tools

### Step 4: Multi-App Dependencies Setup
The agent will handle:
```bash
# Pharmacy App dependencies
cd pharmacy_app
flutter pub get
flutter pub upgrade
cd ..

# Courier App dependencies
cd courier_app
flutter pub get
flutter pub upgrade
cd ..

# Admin Panel dependencies
cd admin_panel
flutter pub get
flutter pub upgrade
cd ..

# Shared package dependencies
cd shared
flutter pub get
cd ..
```

### Step 5: Firebase Configuration
The agent will guide you through:
- [ ] Firebase CLI installation
- [ ] Firebase login: `firebase login`
- [ ] Project verification: `firebase projects:list`
- [ ] Download configuration files for each app
- [ ] Set up Firebase emulators (optional)

### Step 6: Platform-Specific Setup
#### Android (All Platforms):
- [ ] Android SDK installation and setup
- [ ] Accept Android licenses: `flutter doctor --android-licenses`
- [ ] Create Android emulator
- [ ] Verify Android setup: `flutter doctor`

#### iOS (macOS Only):
- [ ] Xcode installation verification
- [ ] CocoaPods installation: `sudo gem install cocoapods`
- [ ] iOS simulator setup
- [ ] Verify iOS setup: `flutter doctor`

### Step 7: Build Validation Tests
```bash
# Test all three apps build successfully
echo "Testing Pharmacy App..."
cd pharmacy_app && flutter build apk --debug && cd ..

echo "Testing Courier App..."
cd courier_app && flutter build apk --debug && cd ..

echo "Testing Admin Panel..."
cd admin_panel && flutter build web && cd ..

# Run static analysis
cd pharmacy_app && flutter analyze && cd ..
cd courier_app && flutter analyze && cd ..
cd admin_panel && flutter analyze && cd ..
```

### Step 8: Development Environment Verification
```bash
# Check Flutter doctor status
flutter doctor -v

# Check available devices
flutter devices

# Test hot reload (if devices available)
cd pharmacy_app
flutter run --debug  # Test if apps launch correctly
```

---

## 🔧 TROUBLESHOOTING GUIDE (Flutter Specific)

### Common Flutter Issues & Solutions

#### Flutter SDK Installation Issues
```bash
# If Flutter not in PATH
export PATH="$PATH:/path/to/flutter/bin"  # Linux/macOS
# Windows: Add to System Environment Variables

# If Flutter doctor shows issues
flutter doctor --android-licenses
flutter config --android-sdk /path/to/android/sdk
```

#### Multi-App Dependency Conflicts
```bash
# Clear all app caches
cd pharmacy_app && flutter clean && cd ..
cd courier_app && flutter clean && cd ..
cd admin_panel && flutter clean && cd ..

# Reinstall dependencies
cd pharmacy_app && flutter pub get && cd ..
cd courier_app && flutter pub get && cd ..
cd admin_panel && flutter pub get && cd ..
```

#### Firebase Configuration Issues
```bash
# Reinstall Firebase CLI
npm uninstall -g firebase-tools
npm install -g firebase-tools

# Re-login to Firebase
firebase logout
firebase login
firebase projects:list
```

#### Android SDK Issues
```bash
# Set Android SDK path
flutter config --android-sdk /path/to/android/sdk

# Accept all licenses
flutter doctor --android-licenses

# Install missing components
sdkmanager "platform-tools" "platforms;android-30"
```

#### iOS Setup Issues (macOS)
```bash
# Install/update Xcode Command Line Tools
sudo xcode-select --install

# Install CocoaPods
sudo gem install cocoapods

# Update pods for apps with iOS
cd pharmacy_app/ios && pod install && cd ../..
cd courier_app/ios && pod install && cd ../..
```

#### VS Code Extension Issues
```bash
# Reinstall Flutter extensions
code --uninstall-extension Dart-Code.dart-code
code --uninstall-extension Dart-Code.flutter
code --install-extension Dart-Code.dart-code
code --install-extension Dart-Code.flutter

# Restart VS Code after installation
```

---

## 📋 VERIFICATION CHECKLIST (PharmApp Mobile Specific)

### Flutter Environment
- [ ] Flutter SDK installed (>=3.13.0)
- [ ] Dart SDK installed (>=3.1.0)
- [ ] Flutter doctor shows no critical issues
- [ ] Global Flutter packages installed

### Multi-App Development Environment
- [ ] **Pharmacy App**: Dependencies installed, builds APK
- [ ] **Courier App**: Dependencies installed, builds APK
- [ ] **Admin Panel**: Dependencies installed, builds web
- [ ] **Shared Package**: Dependencies resolved correctly

### Firebase Integration
- [ ] Firebase CLI installed and authenticated
- [ ] Can access `mediexchange` project
- [ ] Firebase configuration files downloaded
- [ ] Can deploy Firebase functions (optional)

### VS Code Environment
- [ ] Flutter and Dart extensions installed and active
- [ ] IntelliSense working for Dart/Flutter
- [ ] Debug configurations available for all apps
- [ ] Hot reload working in development

### Platform-Specific Tools
- [ ] **Android**: SDK installed, emulator working, licenses accepted
- [ ] **iOS (macOS only)**: Xcode working, simulators available, CocoaPods installed
- [ ] **Web**: Chrome available for web debugging

### Payment System (PharmApp Mobile Specific)
- [ ] Encryption services configured
- [ ] Mobile money testing environment ready
- [ ] Multi-currency support available
- [ ] Sandbox testing accounts accessible

### Final Test
- [ ] All three apps build without errors
- [ ] Can run apps in development mode
- [ ] Hot reload works across all apps
- [ ] Firebase authentication functional
- [ ] No critical errors in console

---

## 🚨 EMERGENCY PROCEDURES (Flutter Specific)

### If Flutter Backup Agent Fails
1. **Manual Flutter Documentation**:
   ```bash
   flutter --version > flutter-version.txt
   flutter doctor -v > flutter-doctor.txt
   flutter pub global list > flutter-global-packages.txt
   ```

2. **Manual Dependency Backup**:
   ```bash
   cp pharmacy_app/pubspec.yaml backup/pharmacy-pubspec.yaml
   cp courier_app/pubspec.yaml backup/courier-pubspec.yaml
   cp admin_panel/pubspec.yaml backup/admin-pubspec.yaml
   cp shared/pubspec.yaml backup/shared-pubspec.yaml
   ```

3. **VS Code Extensions Export**:
   ```bash
   code --list-extensions > flutter-extensions.txt
   ```

### If Flutter Restoration Agent Fails
1. **Manual Flutter Installation**:
   - Download from https://docs.flutter.dev/get-started/install
   - Follow platform-specific installation guide
   - Add to PATH and verify with `flutter doctor`

2. **Manual Dependencies**:
   ```bash
   cd pharmacy_app && flutter pub get
   cd courier_app && flutter pub get
   cd admin_panel && flutter pub get
   cd shared && flutter pub get
   ```

3. **Manual Firebase Setup**:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase projects:list
   ```

### Recovery from Partial Setup
```bash
# Reset Flutter configuration
flutter config --clear-ios-signing-cert
flutter config --clear-features

# Clean all projects
find . -name "pubspec.lock" -delete
find . -type d -name "build" -exec rm -rf {} +
find . -type d -name ".dart_tool" -exec rm -rf {} +

# Reinstall everything
cd pharmacy_app && flutter pub get && cd ..
cd courier_app && flutter pub get && cd ..
cd admin_panel && flutter pub get && cd ..
cd shared && flutter pub get && cd ..

# Rebuild
flutter doctor
flutter devices
```

---

## 📞 SUPPORT RESOURCES (Flutter & PharmApp Mobile)

### Documentation Links
- [Flutter Installation](https://docs.flutter.dev/get-started/install)
- [Firebase CLI Setup](https://firebase.google.com/docs/cli)
- [VS Code Flutter Extension](https://marketplace.visualstudio.com/items?itemName=Dart-Code.flutter)
- [Android SDK Setup](https://developer.android.com/studio)

### PharmApp Mobile Specific
- Firebase Project: `mediexchange`
- Test Accounts: `*@promoshake.net`
- Mobile Money Testing: MTN (677123456), Orange (694123456)
- Multi-Currency: XAF, KES, NGN, GHS

### Community Support
- [Flutter Discord](https://discord.gg/flutter)
- [Firebase Support](https://firebase.google.com/support)
- [VS Code Flutter Support](https://github.com/Dart-Code/Dart-Code)

---

## 🎯 SUCCESS CRITERIA (PharmApp Mobile Specific)

**Transfer is successful when:**
1. ✅ Flutter doctor reports no critical issues
2. ✅ All three apps build successfully (Pharmacy, Courier, Admin)
3. ✅ Firebase project `mediexchange` is accessible
4. ✅ VS Code Flutter development environment is functional
5. ✅ Android/iOS development tools are working
6. ✅ Shared package dependencies resolve correctly
7. ✅ Encrypted payment system is configured
8. ✅ Mobile money testing environment is operational
9. ✅ Hot reload works for all applications
10. ✅ Can deploy to Firebase (functions/hosting)

**Estimated Total Time: 3-5 hours** (depending on internet speed, platform complexity, and Flutter SDK download)

---

*This Flutter transfer order guide ensures a systematic, reliable migration of your PharmApp Mobile multi-app development environment between laptops while maintaining security and full functionality across all three applications.*