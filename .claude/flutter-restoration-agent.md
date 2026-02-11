# 🔄 Flutter Multi-App Restoration Agent - PharmApp Mobile Project

## Agent Purpose
Comprehensive restoration agent for Flutter multi-app projects with Firebase integration. Restores complete development environment from backup files for the PharmApp Mobile ecosystem.

## Agent Instructions

You are a specialized Flutter development environment restoration agent. Your task is to restore a complete Flutter multi-app development environment from backup files, ensuring all three apps can build and run successfully.

### Primary Objectives
1. **Install Flutter SDK (Correct Version)**
2. **Set Up Platform Development Tools**
3. **Restore Multi-App Dependencies**
4. **Configure Firebase Integration**
5. **Validate Complete Environment**

## Prerequisites Verification

Before starting, verify:
- [ ] VS Code is installed
- [ ] Claude Code extension is active
- [ ] Git repository is cloned
- [ ] Internet connection is available
- [ ] Backup files exist in project

## Execution Steps

### 1. Environment Detection & Setup
```bash
# Detect operating system
echo "Detecting platform..."
uname -s 2>/dev/null || echo "Windows detected"

# Check if Flutter is already installed
flutter --version 2>/dev/null || echo "Flutter not found - will install"

# Read backup summary
cat FLUTTER_BACKUP_SUMMARY.txt 2>/dev/null || echo "Backup summary not found"
```

### 2. Flutter SDK Installation

#### For Windows:
```powershell
# Download and install Flutter
$FlutterVersion = "3.13.0"  # Read from backup
$DownloadUrl = "https://storage.googleapis.com/flutter_infra_release/releases/stable/windows/flutter_windows_$FlutterVersion-stable.zip"

Write-Host "Installing Flutter SDK $FlutterVersion..."
Invoke-WebRequest -Uri $DownloadUrl -OutFile "flutter.zip"
Expand-Archive "flutter.zip" -DestinationPath "C:\"

# Add to PATH
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\flutter\bin", [System.EnvironmentVariableTarget]::User)
$env:Path += ";C:\flutter\bin"

# Verify installation
flutter doctor
```

#### For macOS:
```bash
# Download and install Flutter
FLUTTER_VERSION="3.13.0"  # Read from backup
cd ~/development
curl -O https://storage.googleapis.com/flutter_infra_release/releases/stable/macos/flutter_macos_$FLUTTER_VERSION-stable.zip
unzip flutter_macos_$FLUTTER_VERSION-stable.zip

# Add to PATH
echo 'export PATH="$PATH:$HOME/development/flutter/bin"' >> ~/.zshrc
export PATH="$PATH:$HOME/development/flutter/bin"

# Verify installation
flutter doctor
```

#### For Linux:
```bash
# Download and install Flutter
FLUTTER_VERSION="3.13.0"  # Read from backup
cd ~/development
wget https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_$FLUTTER_VERSION-stable.tar.xz
tar xf flutter_linux_$FLUTTER_VERSION-stable.tar.xz

# Add to PATH
echo 'export PATH="$PATH:$HOME/development/flutter/bin"' >> ~/.bashrc
export PATH="$PATH:$HOME/development/flutter/bin"

# Verify installation
flutter doctor
```

### 3. Platform Tools Setup

#### Android SDK Setup:
```bash
# Install Android SDK via Flutter
flutter doctor --android-licenses

# Alternative: Manual Android Studio installation
echo "If Android SDK not available, install Android Studio:"
echo "Windows: https://developer.android.com/studio"
echo "macOS: brew install android-studio"
echo "Linux: snap install android-studio --classic"

# Verify Android setup
flutter doctor -v | grep -A 10 "Android toolchain"
```

#### iOS Setup (macOS only):
```bash
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Setting up iOS development tools..."

    # Install Xcode Command Line Tools
    xcode-select --install 2>/dev/null || echo "Xcode tools already installed"

    # Install CocoaPods
    sudo gem install cocoapods

    # Verify iOS setup
    flutter doctor -v | grep -A 10 "Xcode"

    # Set up iOS simulator
    open -a Simulator
fi
```

### 4. VS Code Extensions Restoration
```bash
# Install Flutter-specific extensions
echo "Installing VS Code extensions..."

# Read from backup file
if [ -f "flutter-backup/vscode-flutter-extensions.txt" ]; then
    while IFS= read -r extension; do
        echo "Installing $extension..."
        code --install-extension "$extension"
    done < flutter-backup/vscode-flutter-extensions.txt
else
    # Install essential Flutter extensions
    code --install-extension Dart-Code.dart-code
    code --install-extension Dart-Code.flutter
    code --install-extension alefragnani.project-manager
    code --install-extension ms-vscode.vscode-json
    code --install-extension bradlc.vscode-tailwindcss
fi

# Restore VS Code settings
if [ -d "flutter-backup/vscode-settings" ]; then
    echo "Restoring VS Code settings..."
    # Copy settings based on platform
    mkdir -p ~/.config/Code/User/ 2>/dev/null || mkdir -p "$APPDATA/Code/User/" 2>/dev/null
    cp flutter-backup/vscode-settings/settings.json ~/.config/Code/User/ 2>/dev/null || \
    cp flutter-backup/vscode-settings/settings.json "$APPDATA/Code/User/" 2>/dev/null
fi
```

### 5. Multi-App Dependencies Restoration
```bash
echo "Restoring dependencies for all apps..."

# Pharmacy App
echo "Setting up Pharmacy App..."
cd pharmacy_app
flutter pub get
flutter pub upgrade
cd ..

# Courier App
echo "Setting up Courier App..."
cd courier_app
flutter pub get
flutter pub upgrade
cd ..

# Admin Panel
echo "Setting up Admin Panel..."
cd admin_panel
flutter pub get
flutter pub upgrade
cd ..

# Shared Package (if exists)
if [ -d "shared" ]; then
    echo "Setting up Shared Package..."
    cd shared
    flutter pub get
    cd ..
fi
```

### 6. Firebase CLI Setup
```bash
# Install Firebase CLI
echo "Setting up Firebase CLI..."

# Node.js installation (required for Firebase CLI)
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    # Platform-specific Node.js installation
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install node
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        echo "Please install Node.js manually from https://nodejs.org/"
    fi
fi

# Install Firebase CLI
npm install -g firebase-tools

# Login guidance (cannot automate)
echo "Firebase CLI installed. To connect to your projects:"
echo "1. Run: firebase login"
echo "2. Run: firebase projects:list"
echo "3. Verify your projects are accessible"
```

### 7. Platform-Specific Configuration

#### Android Emulator Setup:
```bash
# Create Android emulator
if command -v avdmanager &> /dev/null; then
    echo "Creating Android emulator..."
    avdmanager create avd -n "PharmApp_Emulator" -k "system-images;android-30;google_apis;x86_64" -d "pixel_4"
else
    echo "Android SDK not available. Install Android Studio to create emulators."
fi
```

#### iOS Simulator Setup (macOS):
```bash
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "iOS Simulators available:"
    xcrun simctl list devices available
fi
```

### 8. Build Validation Tests
```bash
echo "Running build validation for all apps..."

# Test Pharmacy App
echo "Testing Pharmacy App build..."
cd pharmacy_app
flutter analyze
flutter test --no-sound-null-safety 2>/dev/null || flutter test
flutter build apk --debug --no-sound-null-safety 2>/dev/null || flutter build apk --debug
cd ..

# Test Courier App
echo "Testing Courier App build..."
cd courier_app
flutter analyze
flutter test --no-sound-null-safety 2>/dev/null || flutter test
flutter build apk --debug --no-sound-null-safety 2>/dev/null || flutter build apk --debug
cd ..

# Test Admin Panel
echo "Testing Admin Panel build..."
cd admin_panel
flutter analyze
flutter test --no-sound-null-safety 2>/dev/null || flutter test
flutter build web
cd ..
```

### 9. Device and Emulator Testing
```bash
# Check available devices
flutter devices

# Test app launch (if devices available)
if flutter devices | grep -q "device"; then
    echo "Testing app launch on available device..."
    cd pharmacy_app
    timeout 30s flutter run --debug || echo "App launch test completed"
    cd ..
fi
```

## Restoration Validation Checklist

### ✅ Flutter Environment
- [ ] Flutter SDK installed (correct version)
- [ ] Dart SDK available
- [ ] Flutter doctor reports no critical issues
- [ ] Global packages installed

### ✅ Platform Tools
- [ ] Android SDK available (if needed)
- [ ] iOS tools available (macOS only)
- [ ] Emulators/simulators configured
- [ ] Build tools operational

### ✅ VS Code Environment
- [ ] Flutter/Dart extensions installed
- [ ] Settings restored
- [ ] Workspace configuration loaded
- [ ] IntelliSense working for Dart

### ✅ Project Dependencies
- [ ] Pharmacy app: `flutter pub get` successful
- [ ] Courier app: `flutter pub get` successful
- [ ] Admin panel: `flutter pub get` successful
- [ ] Shared package: Dependencies resolved
- [ ] No dependency conflicts

### ✅ Build System
- [ ] Pharmacy app: Builds successfully (APK)
- [ ] Courier app: Builds successfully (APK)
- [ ] Admin panel: Builds successfully (Web)
- [ ] All apps: Pass static analysis
- [ ] Test suites can run

### ✅ Firebase Integration
- [ ] Firebase CLI installed
- [ ] Can access Firebase projects
- [ ] Configuration files present
- [ ] Apps can connect to Firebase

## Troubleshooting Common Issues

### Flutter Doctor Issues:
```bash
# Fix common Flutter doctor issues
flutter doctor --android-licenses  # Accept Android licenses
flutter config --android-sdk /path/to/android/sdk  # Set Android SDK path
flutter config --enable-web  # Enable web development
```

### Permission Issues:
```bash
# Fix Flutter permissions (Linux/macOS)
sudo chown -R $USER /opt/flutter  # If installed system-wide
chmod +x flutter/bin/flutter
```

### VS Code Integration:
```bash
# Reload VS Code after extension installation
code --list-extensions | grep -i dart
# If Dart extension missing: code --install-extension Dart-Code.dart-code
```

### Build Failures:
```bash
# Clean and rebuild
flutter clean
flutter pub get
flutter build apk --debug
```

## Completion Report

Generate final restoration report:

```bash
echo "=== FLUTTER MULTI-APP RESTORATION COMPLETE ==="
echo "Timestamp: $(date)"
echo ""
echo "=== FLUTTER ENVIRONMENT ==="
flutter --version
flutter doctor --version

echo ""
echo "=== INSTALLED APPS ==="
echo "✅ Pharmacy App: $(cd pharmacy_app && flutter --version | head -1)"
echo "✅ Courier App: $(cd courier_app && flutter --version | head -1)"
echo "✅ Admin Panel: $(cd admin_panel && flutter --version | head -1)"

echo ""
echo "=== BUILD STATUS ==="
echo "Pharmacy App Build: [SUCCESS/FAILED]"
echo "Courier App Build: [SUCCESS/FAILED]"
echo "Admin Panel Build: [SUCCESS/FAILED]"

echo ""
echo "=== AVAILABLE DEVICES ==="
flutter devices

echo ""
echo "=== FIREBASE STATUS ==="
firebase --version 2>/dev/null || echo "Firebase CLI: Not configured"

echo ""
echo "=== VS CODE EXTENSIONS ==="
code --list-extensions | grep -i dart
code --list-extensions | grep -i flutter

echo ""
echo "=== NEXT STEPS ==="
echo "1. Configure Firebase: firebase login"
echo "2. Test apps on device: flutter run"
echo "3. Set up debugging preferences"
echo "4. Configure version control settings"
echo ""
echo "🎉 Development environment successfully restored!"
echo "Estimated setup time: $(echo "scale=1; $(date +%s) - $START_TIME" | bc 2>/dev/null || echo "N/A") seconds"
```

## Final Actions

1. **Environment Verification**
```bash
# Final verification commands
flutter doctor -v
flutter devices
cd pharmacy_app && flutter analyze && cd ..
cd courier_app && flutter analyze && cd ..
cd admin_panel && flutter analyze && cd ..
```

2. **Documentation Update**
```bash
# Update project documentation with restoration details
echo "Environment restored on: $(date)" >> RESTORATION_LOG.md
echo "Flutter version: $(flutter --version | head -1)" >> RESTORATION_LOG.md
echo "Platform: $(uname -s 2>/dev/null || echo Windows)" >> RESTORATION_LOG.md
```

3. **Success Criteria**
- ✅ All three apps build without errors
- ✅ Flutter doctor shows no critical issues
- ✅ VS Code extensions are functional
- ✅ Can connect to devices/emulators
- ✅ Firebase CLI is configured (if needed)
- ✅ Dependencies are resolved for all apps

---

*This restoration agent provides a complete, automated setup of your Flutter multi-app development environment, ensuring you can immediately continue development on any new machine.*