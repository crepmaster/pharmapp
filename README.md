# PharmApp - Pharmacy Exchange Platform

Firebase-based pharmacy application with Cloud Functions for payment processing and peer-to-peer pharmaceutical exchanges with escrow functionality.

## Prerequisites

### Required Software

| Tool | Version | Download |
|------|---------|----------|
| Node.js | 20+ | https://nodejs.org/ |
| npm | 10+ | Included with Node.js |
| Firebase CLI | Latest | `npm install -g firebase-tools` |
| Git | Latest | https://git-scm.com/ |

### For Mobile Development (Flutter)

| Tool | Version | Download |
|------|---------|----------|
| Flutter SDK | 3.x | https://flutter.dev/docs/get-started/install |
| Android SDK | Latest | https://developer.android.com/studio |
| Java JDK | 17 | https://adoptium.net/ |

## Environment Variables (Windows)

Set these system environment variables for mobile development:

```powershell
# PowerShell - Run as Administrator
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "C:\Android\Sdk", "User")
[System.Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Microsoft\jdk-17.0.17.10-hotspot", "User")

# Add to PATH
$env:Path += ";$env:ANDROID_HOME\tools;$env:ANDROID_HOME\platform-tools"
```

Or via System Settings:
```
ANDROID_HOME = C:\Android\Sdk
JAVA_HOME = C:\Program Files\Microsoft\jdk-17.0.17.10-hotspot
```

### Verify Installation

```bash
# Node.js
node --version  # Should show v20.x.x

# Firebase CLI
firebase --version

# Flutter (if installed)
flutter doctor

# Android SDK
adb --version
```

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/pharmapp.git
cd pharmapp
```

### 2. Install Dependencies

```bash
# Root dependencies (Husky hooks)
npm install

# Functions dependencies
cd functions
npm install
```

### 3. Firebase Setup

```bash
# Login to Firebase
firebase login

# Select project
firebase use --add
```

## Development

### Build & Test

```bash
cd functions

# Build TypeScript
npm run build

# Run tests (69 unit tests)
npm test

# Run tests in watch mode
npm run test:watch

# Full validation (typecheck + lint + tests)
npm run validate

# Quick validation (typecheck + lint)
npm run validate:quick
```

### Local Development

```bash
cd functions

# Start Firebase emulator
npm run serve

# Deploy to Firebase
npm run deploy
```

### Integration Testing

```powershell
# PowerShell scripts for testing
./scripts/test-cloudrun.ps1 -TestHealth      # Health check
./scripts/test-cloudrun.ps1 -RunDemo         # Full demo flow
./scripts/test-cloudrun.ps1 -GetWallet pharmacy_A  # Check wallet
```

## Project Structure

```
pharmapp/
├── functions/              # Firebase Cloud Functions
│   ├── src/
│   │   ├── index.ts       # HTTP endpoints (webhooks, payments, exchanges)
│   │   ├── scheduled.ts   # Cron jobs (expire holds)
│   │   ├── lib/           # Business logic
│   │   └── __tests__/     # Unit tests (Jest)
│   └── package.json
├── firestore.rules        # Security rules
├── firestore.indexes.json # Database indexes
├── firebase.json          # Firebase config
├── scripts/               # PowerShell test scripts
├── CLAUDE.md              # AI assistant instructions
└── README.md              # This file
```

## Firebase Collections

| Collection | Description |
|------------|-------------|
| `payments` | Payment intent records |
| `wallets` | User wallet balances (available/held) |
| `ledger` | Transaction history |
| `exchanges` | Exchange state (hold_active/completed/canceled) |
| `webhook_logs` | Webhook call logs (TTL: 30 days) |
| `idempotency` | Idempotency tracking |

## Key Features

- **Payment Processing**: MTN MoMo & Orange Money integration
- **Escrow System**: 50/50 courier fee split with hold/capture/cancel
- **Idempotent Webhooks**: Prevents duplicate processing
- **Automatic Expiry**: Holds expire after 6 hours
- **City-Based Filtering**: Geographic isolation for exchanges

## Configuration

### Firebase Secrets

Required secrets for production:
- `MOMO_CALLBACK_TOKEN` - MTN MoMo webhook authentication
- `ORANGE_CALLBACK_TOKEN` - Orange Money webhook authentication

```bash
firebase functions:secrets:set MOMO_CALLBACK_TOKEN
firebase functions:secrets:set ORANGE_CALLBACK_TOKEN
```

## Deployment

### Deploy Functions Only

```bash
cd functions
npm run deploy
```

### Deploy Everything

```bash
firebase deploy
```

## Code Quality

- **ESLint**: TypeScript linting
- **TypeScript**: Strict type checking
- **Husky**: Pre-commit hooks run `validate:quick`
- **Jest**: 69 unit tests with coverage

## Region & Timezone

- **Cloud Functions**: `europe-west1`
- **Scheduled Jobs**: `Africa/Douala` timezone

## Troubleshooting

### NativeScript Environment Not Loading

Verify environment variables are set:
```powershell
echo $env:ANDROID_HOME
echo $env:JAVA_HOME
```

### Firebase Emulator Issues

```bash
# Clear emulator data
firebase emulators:start --clear-data
```

### Build Errors

```bash
cd functions
npm run clean
npm install
npm run build
```

## License

Private - All rights reserved
