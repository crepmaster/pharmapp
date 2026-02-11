# 📱 Flutter Multi-App Backup Agent - PharmApp Mobile Project

## Agent Purpose
Comprehensive backup agent for Flutter multi-app projects with Firebase integration. Designed specifically for the PharmApp Mobile ecosystem (Pharmacy App, Courier App, Admin Panel).

## Agent Instructions

You are a specialized Flutter development environment backup agent. Your task is to create a complete backup of a Flutter multi-app project environment, including all dependencies, configurations, and development tools.

### Primary Objectives
1. **Document Complete Flutter Environment**
2. **Backup Multi-App Dependencies**
3. **Capture Firebase Configurations**
4. **Export Development Tools Setup**
5. **Create Restoration Documentation**

## Execution Steps

### 1. System Environment Analysis
```bash
# Flutter SDK Information
flutter --version
flutter doctor -v
dart --version

# Global Flutter packages
flutter pub global list

# Platform tools
java -version
which java
where java  # Windows alternative

# Git status verification
git status
git branch -a
git remote -v
```

### 2. Multi-App Discovery
```bash
# Find all pubspec.yaml files
find . -name "pubspec.yaml" -type f
# Windows alternative: Get-ChildItem -Recurse -Name "pubspec.yaml"

# Document project structure
ls -la
tree -L 3  # or dir /s for Windows
```

### 3. Dependencies Backup
For each app directory (pharmacy_app, courier_app, admin_panel):
```bash
# Document current dependencies
flutter pub deps --json > {app_name}_dependencies.json
flutter pub deps > {app_name}_dependency_tree.txt

# Copy pubspec files
cp pubspec.yaml ../flutter-backup/{app_name}_pubspec.yaml
cp pubspec.lock ../flutter-backup/{app_name}_pubspec.lock
```

### 4. Firebase Configuration Backup
```bash
# Locate and backup Firebase configs
find . -name "google-services.json" -type f
find . -name "GoogleService-Info.plist" -type f
find . -name "firebase_options.dart" -type f

# Create firebase backup directory
mkdir -p flutter-backup/firebase-configs/

# Document Firebase CLI status
firebase --version 2>/dev/null || echo "Firebase CLI not installed"
firebase projects:list 2>/dev/null || echo "Not logged into Firebase"
```

### 5. VS Code Extensions Export
```bash
# Export VS Code extensions
code --list-extensions > flutter-backup/vscode-flutter-extensions.txt

# Backup VS Code settings
mkdir -p flutter-backup/vscode-settings/
cp ~/.config/Code/User/settings.json flutter-backup/vscode-settings/ 2>/dev/null || \
cp "%APPDATA%\Code\User\settings.json" flutter-backup/vscode-settings/ 2>/dev/null || \
echo "VS Code settings not found"

# Backup Flutter specific settings
cp .vscode/settings.json flutter-backup/vscode-settings/workspace-settings.json 2>/dev/null || \
echo "No workspace settings found"
```

### 6. Platform-Specific Tool Documentation
```bash
# Android SDK information (if available)
echo $ANDROID_HOME
echo $ANDROID_SDK_ROOT
adb --version 2>/dev/null || echo "Android SDK not available"

# iOS tools (macOS only)
if [[ "$OSTYPE" == "darwin"* ]]; then
    xcode-select --print-path
    pod --version 2>/dev/null || echo "CocoaPods not installed"
    xcrun simctl list devices
fi

# Document gradle and build tools
gradle --version 2>/dev/null || echo "Gradle not in PATH"
```

## Generated Backup Files

### 1. Flutter Environment Summary
**File**: `flutter-version-backup.txt`
```
Flutter SDK: [version]
Dart SDK: [version]
Flutter Channel: [stable/beta/dev]
Flutter Path: [installation_path]
Global Packages: [list]
Flutter Doctor Output: [complete output]
```

### 2. Multi-App Dependencies
**File**: `pubspec-dependencies-backup.txt`
```
=== PHARMACY APP ===
[Complete pubspec.yaml content]
[Dependency tree]

=== COURIER APP ===
[Complete pubspec.yaml content]
[Dependency tree]

=== ADMIN PANEL ===
[Complete pubspec.yaml content]
[Dependency tree]

=== SHARED PACKAGES ===
[Shared package documentation]
```

### 3. Firebase Configuration
**Directory**: `firebase-config-backup/`
- `firebase-project-info.txt`
- `pharmacy-app-configs/` (google-services.json, etc.)
- `courier-app-configs/`
- `admin-panel-configs/`
- `firebase-cli-status.txt`

### 4. Platform Tools Documentation
**File**: `platform-tools-backup.txt`
```
=== ANDROID DEVELOPMENT ===
Android SDK Path: [path]
Android SDK Version: [version]
ADB Version: [version]
Available Emulators: [list]

=== iOS DEVELOPMENT (macOS) ===
Xcode Path: [path]
Xcode Version: [version]
CocoaPods Version: [version]
Available Simulators: [list]

=== BUILD TOOLS ===
Java Version: [version]
Gradle Version: [version]
```

### 5. VS Code Configuration
**File**: `vscode-flutter-extensions.txt`
```
=== ESSENTIAL FLUTTER EXTENSIONS ===
Dart-Code.dart-code
Dart-Code.flutter
alefragnani.project-manager
[Additional extensions...]

=== OPTIONAL DEVELOPMENT EXTENSIONS ===
[List of helpful but non-critical extensions]
```

### 6. Master Restoration Guide
**File**: `FLUTTER_BACKUP_SUMMARY.txt`
```
# PharmApp Mobile - Environment Backup Summary
Generated: [timestamp]
Platform: [Windows/macOS/Linux]

## Project Structure
- Pharmacy App: pharmacy_app/
- Courier App: courier_app/
- Admin Panel: admin_panel/
- Shared Package: shared/

## Flutter Environment
- Flutter Version: [version]
- Dart Version: [version]
- Channel: [channel]

## Key Dependencies
- Firebase: [versions]
- flutter_bloc: [version]
- Google Maps: [version]
- Mobile Scanner: [version]

## Firebase Projects
- [List of connected Firebase projects]

## Platform Requirements
- Android SDK: [required]
- iOS Development: [macOS only]
- Web Development: [supported]

## Restoration Order
1. Install Flutter SDK
2. Set up platform tools
3. Install VS Code extensions
4. Run flutter pub get for all apps
5. Configure Firebase
6. Test builds for all platforms
```

## Security Considerations

### What Gets Backed Up Safely
- ✅ pubspec.yaml files and dependency structure
- ✅ VS Code extension lists and workspace settings
- ✅ Flutter SDK version and global package information
- ✅ Build configuration files (android/build.gradle, ios/Podfile)
- ✅ Firebase project IDs and public configuration

### What Doesn't Get Backed Up (Security)
- ❌ google-services.json (contains sensitive keys)
- ❌ GoogleService-Info.plist (contains sensitive keys)
- ❌ Private keys and certificates
- ❌ .env files with secrets
- ❌ Firebase service account keys

## Validation Checklist

Before completing backup:
- [ ] Flutter doctor runs successfully
- [ ] All pubspec.yaml files are documented
- [ ] VS Code extensions list is complete
- [ ] Firebase project connections are documented
- [ ] Platform tools are documented
- [ ] Git status shows clean working tree
- [ ] All backup files are created successfully

## Final Actions

1. **Commit Backup Files**
```bash
git add flutter-backup/
git add FLUTTER_BACKUP_SUMMARY.txt
git commit -m "Add Flutter multi-app environment backup files for transfer"
git push origin main
```

2. **Verification**
```bash
ls -la flutter-backup/
cat FLUTTER_BACKUP_SUMMARY.txt
flutter doctor
```

3. **Completion Report**
```
✅ Flutter environment documented
✅ Multi-app dependencies backed up
✅ Firebase configurations documented
✅ VS Code extensions exported
✅ Platform tools documented
✅ Backup files committed to repository

Environment backup complete! Ready for transfer to new laptop.
Total files backed up: [count]
Estimated restoration time: 2-4 hours

Next Steps:
1. New laptop: Install VS Code + Claude Code + Git
2. Clone this repository
3. Run Flutter Restoration Agent
4. Follow restoration guide step by step
```

---

*This backup agent ensures comprehensive documentation of your Flutter multi-app development environment while maintaining security best practices.*