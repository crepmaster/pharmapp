# Development Commands - PharmApp

## Building and Running

### Individual Applications
```bash
# Run pharmacy app
cd pharmacy_app && flutter run

# Run courier app  
cd courier_app && flutter run

# Run admin panel (web only)
cd admin_panel && flutter run -d chrome --web-port=8084

# Build APK for pharmacy app
cd pharmacy_app && flutter build apk

# Build APK for courier app
cd courier_app && flutter build apk

# Build web app for admin panel
cd admin_panel && flutter build web
```

### Testing and Analysis
```bash
# Run tests for pharmacy app
cd pharmacy_app && flutter test

# Run tests for courier app
cd courier_app && flutter test

# Analyze code for issues
cd pharmacy_app && flutter analyze
cd courier_app && flutter analyze

# Format code
cd pharmacy_app && dart format .
cd courier_app && dart format .
```

### Firebase Commands

#### Firebase Project
- **Firebase project ID**: `mediexchange`
- **Region**: `europe-west1`

#### Backend System (D:\Projects\pharmapp)
```bash
# Build TypeScript functions
cd functions && npm run build

# Start Firebase emulator
cd functions && npm run serve

# Deploy functions
cd functions && npm run deploy

# Run 69 unit tests
cd functions && npm test

# Test full payment/exchange flow
pwsh ./scripts/test-cloudrun.ps1 -RunDemo
```

## 🔄 Post-Reboot Quick Start

### Test All Apps with Authentication
```bash
# Terminal 1 - Pharmacy App (Port 8080)
cd pharmacy_app && flutter run -d chrome --web-port=8080

# Terminal 2 - Courier App (Port 8082)
cd courier_app && flutter run -d chrome --web-port=8082

# Terminal 3 - Admin Panel (Port 8084)
cd admin_panel && flutter run -d chrome --web-port=8084
```

### Mobile Device Testing
```bash
# Check connected devices
flutter devices

# Run on physical device
flutter run -d [device-id]

# Run on Genymotion (after setup)
flutter run -d [genymotion-ip]:5555
```

### Development Workflow
1. **Primary Development**: Chrome browser (fast hot reload)
2. **Mobile Testing**: Physical device or Genymotion
3. **Backend Testing**: Firebase integration on any platform
4. **Final Testing**: Multiple devices for compatibility

## Platform Support

### ✅ Working Platforms
- **Chrome Browser**: All apps running perfectly with authentication
- **Windows Desktop**: Platform support added (Firebase compatible)
- **Android Physical Device**: Ready for connection via USB debugging

### ⚠️ Known Issues
- **Android Emulator**: Hardware compatibility issues with Intel UHD Graphics 620
- **Genymotion**: Device crashes when accessing settings

## Quick Testing Commands

### Flutter Analysis
```bash
# Check all apps for issues
cd pharmacy_app && flutter analyze
cd courier_app && flutter analyze  
cd admin_panel && flutter analyze
```

### Build Validation
```bash
# Test web builds
cd pharmacy_app && flutter build web --release
cd admin_panel && flutter build web --release

# Test Android builds
cd pharmacy_app && flutter build apk --release
cd courier_app && flutter build apk --release
```