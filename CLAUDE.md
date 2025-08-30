# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains a Flutter-based medicine exchange platform with two separate mobile applications that connect to a Firebase backend system:

- **pharmacy_app/**: Mobile app for pharmacies to manage inventory and exchange medicines
- **courier_app/**: Mobile app for couriers handling deliveries between pharmacies
- **shared/**: (Currently empty) Intended for shared code/utilities between apps

Both apps are built with Flutter 3.13+ and use Firebase as the backend service.

### Backend Integration

The mobile apps connect to a Firebase backend system (separate repository at D:\Projects\pharmapp) that provides:
- **Payment Processing**: Mobile money integration (MTN MoMo, Orange Money)
- **Exchange Management**: Peer-to-peer pharmaceutical exchanges with escrow functionality
- **Wallet System**: User balance management with hold/release mechanisms
- **Firebase Functions**: Cloud functions for payment webhooks, exchange workflows, and scheduled tasks
- **Firebase Project ID**: `mediexchange`

## Development Commands

### Building and Running
```bash
# Run pharmacy app
cd pharmacy_app && flutter run

# Run courier app  
cd courier_app && flutter run

# Build APK for pharmacy app
cd pharmacy_app && flutter build apk

# Build APK for courier app
cd courier_app && flutter build apk
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

### Firebase
Firebase project ID: `mediexchange`
Both apps are configured with Firebase and include:
- Authentication
- Firestore database
- Cloud Functions
- Push notifications

### Backend System Architecture (D:\Projects\pharmapp)

**Firestore Collections:**
- `payments` - Payment intent records
- `webhook_logs` - Webhook call logs (TTL: 30 days)
- `wallets` - User wallet balances (available/held amounts)
- `ledger` - Transaction history
- `exchanges` - Exchange state (hold_active/completed/canceled)
- `idempotency` - Idempotency tracking

**Key Workflows:**
- Payment Flow: Create payment intent → External webhook → Credit wallet (idempotent)
- Exchange Flow: Create hold (50/50 courier fee split) → Capture/Cancel → Process transaction
- Security: Webhook authentication, Firestore rules, ACID transactions, idempotency

**Backend Commands:**
- `cd functions && npm run build` - Build TypeScript functions
- `cd functions && npm run serve` - Start Firebase emulator
- `cd functions && npm run deploy` - Deploy functions
- `cd functions && npm test` - Run 69 unit tests
- `pwsh ./scripts/test-cloudrun.ps1 -RunDemo` - Test full payment/exchange flow

## Architecture

### Technology Stack
- **Framework**: Flutter 3.13+
- **State Management**: flutter_bloc + equatable
- **Backend**: Firebase (Auth, Firestore, Functions, Messaging)
- **UI**: Material Design 3 with custom theming
- **Maps**: Google Maps (courier app only)
- **QR Codes**: Both scanning and generation capabilities

### Key Dependencies
- **firebase_core/firebase_auth/cloud_firestore**: Firebase integration
- **flutter_bloc**: State management pattern
- **google_maps_flutter**: Maps functionality (courier app)
- **qr_code_scanner/qr_flutter**: QR code handling
- **cached_network_image**: Optimized image loading
- **shared_preferences/sqflite**: Local data persistence

### App-Specific Features

**Pharmacy App**:
- Primary color: Blue (#1976D2) 
- Focus on inventory management and medicine exchange
- QR code generation for orders

**Courier App**:
- Primary color: Green (#4CAF50)
- GPS/location services with Google Maps
- QR code scanning for order verification
- Camera permissions for delivery proof

### Project Structure
Each app follows standard Flutter architecture:
- `lib/main.dart`: Entry point with Firebase initialization
- `lib/firebase_options.dart`: Firebase configuration
- `pubspec.yaml`: Dependencies and asset declarations
- `assets/`: Images, icons, and fonts (Inter font family)

## Current Setup Status (2025-08-30)

### ✅ Completed Setup:
- **Both apps fully configured** with Flutter 3.13+ and all dependencies
- **Platform support added**: Web, Windows, Android (emulator issues noted below)
- **Asset directories created** and configured properly
- **Firebase integration ready** with updated compatible packages
- **Both apps successfully tested** on Chrome browser
- **Project structure** following Flutter best practices

### 🚀 Working Platforms:
- **Chrome Browser**: Both apps running perfectly with hot reload
- **Windows Desktop**: Platform support added (Firebase compatibility pending)
- **Android Physical Device**: Ready for connection via USB debugging

### ⚠️ Known Issues:
- **Android Emulator**: Hardware compatibility issues with Intel UHD Graphics 620
  - Emulators start but fail to boot completely (60-second timeout)
  - Issue persists even with updated graphics drivers
  - **Solutions**: Use Genymotion, physical device, or Chrome for development

### 📱 Mobile Testing Solutions:
1. **Physical Android Device** (Recommended): Enable Developer Options + USB Debugging
2. **Genymotion Emulator**: Better hardware compatibility than standard Android Emulator  
3. **Chrome Browser**: Excellent for UI/UX development with responsive design tools

### 🔥 Firebase Integration:
- Project connected to `mediexchange` Firebase project
- Updated Firebase packages for better web compatibility
- Simple versions created for initial testing
- Full Firebase integration ready to restore

## 🔄 Post-Reboot Quick Start Commands

After rebooting, use these commands to quickly resume development:

### Test Both Apps on Chrome (Immediate):
```bash
# Terminal 1 - Pharmacy App
cd pharmacy_app && flutter run -d chrome lib/main_simple.dart

# Terminal 2 - Courier App  
cd courier_app && flutter run -d chrome lib/main_simple.dart
```

### Mobile Device Testing:
```bash
# Check connected devices
flutter devices

# Run on physical device
flutter run -d [device-id]

# Run on Genymotion (after setup)
flutter run -d [genymotion-ip]:5555
```

### Restore Full Firebase Integration:
```bash
# Pharmacy app with Firebase
cd pharmacy_app && cp pubspec_firebase.yaml pubspec.yaml && flutter pub get
flutter run -d chrome  # or device

# Test Firebase connection in main.dart
```

### Development Workflow:
1. **Primary Development**: Chrome browser (fast hot reload)
2. **Mobile Testing**: Physical device or Genymotion
3. **Backend Testing**: Firebase integration on any platform
4. **Final Testing**: Multiple devices for compatibility

## 📋 Next Session Tasks:
- [ ] Complete Genymotion setup and test
- [ ] Connect physical Android device via USB
- [ ] Restore full Firebase integration
- [ ] Test authentication and database connectivity
- [ ] Begin feature development on medicine exchange workflows