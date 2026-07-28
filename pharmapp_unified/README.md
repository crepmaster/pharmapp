# PharmApp Unified - Master Application

**🚀 MASTER APPLICATION - This is the primary and only active PharmApp project**

PharmApp Unified is a comprehensive Flutter-based medicine exchange platform that combines both **Pharmacy** and **Courier** functionality into a single unified application.

## 📱 What is PharmApp Unified?

PharmApp Unified is a mobile application that enables:
- **Pharmacies**: Manage inventory, create medicine exchange proposals, track subscriptions, and manage profiles
- **Couriers**: Accept delivery orders, track GPS routes, scan QR codes, and manage wallet withdrawals
- **Unified Authentication**: Role-based authentication system with secure wallet integration
- **Payment Integration**: Mobile money (MTN MoMo, Orange Money) with encrypted payment preferences
- **City-Based Operations**: Geographic isolation for exchanges and deliveries

## 🏗️ Project Structure

```
pharmapp_unified/
├── lib/
│   ├── screens/
│   │   ├── pharmacy/          # Pharmacy dashboard & features
│   │   ├── courier/           # Courier dashboard & features
│   │   └── auth/              # Authentication screens
│   ├── blocs/                 # State management (BLoC pattern)
│   ├── services/              # Business logic services
│   ├── models/                # Data models
│   └── widgets/               # Reusable UI components
├── .claude/
│   ├── agents/                # Specialized AI agents
│   ├── flutter-backup-agent.md
│   ├── flutter-restoration-agent.md
│   └── settings.local.json
├── docs/                      # Project documentation
├── CLAUDE.md                  # AI assistant instructions
└── HOW_TO_RUN.md             # Build and run instructions

```

## 🚀 Quick Start

### Prerequisites
- Flutter SDK (>=3.13.0)
- Dart SDK (>=3.1.0)
- Firebase project configured (Project ID: `mediexchange`)
- VS Code or Android Studio

### Running the Application

```bash
# Install dependencies
flutter pub get

# Run on Chrome (for testing)
flutter run -d chrome --web-port=8086

# Run on Android emulator
flutter run

# Build APK
flutter build apk
```

For detailed build instructions, see [HOW_TO_RUN.md](HOW_TO_RUN.md)

## 📋 Key Features

### Pharmacy Features ✅
- Dashboard with wallet balance and subscription status
- Inventory management with barcode scanning
- Medicine exchange proposals (city-based)
- Editable profile with GPS location picker
- African medicines database (WHO Essential Medicines List)
- Subscription management with trial support

### Courier Features ✅
- Real-time GPS tracking (updates every 30 seconds)
- Smart order sorting (proximity-based algorithm)
- QR code scanning for pickup/delivery verification
- Photo proof of delivery
- Wallet withdrawals to mobile money
- Issue reporting system
- Google Maps navigation integration

### Security Features 🔒
- HMAC-SHA256 encryption for payment data
- Masked phone number display (677****56)
- Environment-aware test number blocking
- Firestore security rules with role-based access
- GDPR/NDPR compliance

## 🔧 Development

### Architecture
- **Framework**: Flutter 3.13+
- **State Management**: flutter_bloc + equatable
- **Backend**: Firebase (Auth, Firestore, Functions)
- **UI**: Material Design 3 with custom theming
- **Security**: crypto package for HMAC-SHA256 encryption

### Key Dependencies
```yaml
dependencies:
  flutter_bloc: ^8.1.6
  firebase_core: ^3.6.0
  firebase_auth: ^5.3.1
  cloud_firestore: ^5.4.4
  google_maps_flutter: ^2.9.0
  qr_code_scanner: ^1.0.1
  url_launcher: ^6.3.1
  crypto: ^3.0.3
```

## 📚 Documentation

- **[CLAUDE.md](CLAUDE.md)** - Complete project overview and AI assistant instructions
- **[HOW_TO_RUN.md](HOW_TO_RUN.md)** - Build and deployment instructions
- **[CLEAN_BUILD_GUIDE.md](CLEAN_BUILD_GUIDE.md)** - Build system maintenance
- **[docs/](docs/)** - Additional documentation (security audits, session reports)

## 🤖 AI Agents

This project includes specialized AI agents in `.claude/agents/`:
- **agent-chef-projet.md** - Project management agent
- **agent-codeur.md** - Coding assistant agent
- **agent-reviewer.md** - Code review agent
- **agent-testeur.md** - Testing agent
- ~~**pharmapp-deployer.md**~~ - Archivé 2026-07-22 (voir `docs/archive/`). Le déploiement passe uniquement par `npm run deploy:staging -- preflight --project=mediexchange-staging` ; aucune commande Firebase/GCloud directe.
- **pharmapp-reviewer.md** - PharmApp-specific reviewer
- **pharmapp-tester.md** - PharmApp-specific tester

## 🔐 Security Notes

- Firebase API keys are managed via environment variables
- Payment data is encrypted before storage
- All sensitive operations use server-side validation
- See [docs/SECURITY.md](docs/SECURITY.md) for details

## 📊 Project Status

**Status**: ✅ Production Ready

**Latest Achievement**: Profile feature complete with GPS location picker (2025-10-26)

**Previous Sessions**:
- ✅ Inventory & Exchange migration (2025-10-25)
- ✅ Courier module migration (2025-10-25)
- ✅ Wallet testing complete (2025-10-25)
- ✅ Master app established (2025-10-24)

## 🌍 Deployment

**Firebase Project**: `mediexchange`

**Target Markets**: Africa (Cameroon, Kenya, Nigeria, Ghana)

**Supported Currencies**: XAF, KES, NGN, GHS, USD

**Payment Methods**: MTN MoMo, Orange Money, Camtel

## 📞 Support

For development questions, see [CLAUDE.md](CLAUDE.md) which contains comprehensive guidance for working with this codebase.

---

**Note**: This is the **MASTER APPLICATION**. The standalone `pharmacy_app` and `courier_app` directories are obsolete and should not be modified.
