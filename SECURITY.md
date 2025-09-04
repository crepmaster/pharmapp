# 🔒 PharmApp Security Guidelines

## 🚨 PRIORITY 1: HARDCODED SECRET DETECTION

**BEFORE ANY DEVELOPMENT, REVIEW, OR DEPLOYMENT** - Run the secret detection system:

```bash
# Windows
scripts\detect_secrets.bat

# Linux/Mac
bash scripts/detect_secrets.sh
```

**❌ IF SECRETS DETECTED**: 
- **STOP ALL WORK IMMEDIATELY**
- Remove all hardcoded secrets
- Regenerate compromised keys
- Re-run detection until clean

## ⚠️ CRITICAL SECURITY NOTICE

This document outlines security practices for the PharmApp mobile platform. **All team members MUST follow these guidelines.**

## 🚨 Firebase Configuration Security

### ❌ NEVER DO THIS:
```dart
// INSECURE - Hardcoded API keys
static const FirebaseOptions web = FirebaseOptions(
  apiKey: 'AIzaSyA7LyWPJZmkSGjrmj0uyEYHiCfXBRXQ0MA', // EXPOSED!
  appId: '1:850468406397:web:40b26b7b9a1c8b4e0b4a2d',     // EXPOSED!
  // ... other sensitive data
);
```

### ✅ SECURE APPROACH:
```dart
// SECURE - Environment variables
static const String _webApiKey = String.fromEnvironment('FIREBASE_WEB_API_KEY');
static const String _androidApiKey = String.fromEnvironment('FIREBASE_ANDROID_API_KEY');

static FirebaseOptions get web {
  if (_webApiKey.isEmpty) {
    throw Exception('Firebase configuration missing - check environment variables');
  }
  return FirebaseOptions(apiKey: _webApiKey, /* ... */);
}
```

## 🔧 Development Setup

### 1. Environment Variables Setup
Copy `.env.example` to `.env` and fill with your Firebase keys:
```bash
cp .env.example .env
# Edit .env with your Firebase project keys
```

### 2. Secure Build Process
Always use the secure build script:
```bash
# Windows
scripts\secure_build.bat

# Or manually with environment variables
flutter run --dart-define=FIREBASE_WEB_API_KEY=your_key_here
```

### 3. Git Configuration
Ensure sensitive files are ignored:
```bash
# Check if sensitive files are tracked
git status

# They should NOT appear in git status:
# - firebase_options.dart
# - google-services.json  
# - GoogleService-Info.plist
# - .env files
```

## 📋 Security Checklist

### Before Every Commit:
- [ ] **🔍 RUN SECRET DETECTION FIRST**: `scripts\detect_secrets.bat` passes ✅
- [ ] No hardcoded API keys in source code
- [ ] `.env` files are gitignored  
- [ ] `firebase_options.dart` uses environment variables only
- [ ] No sensitive data in print statements
- [ ] Google Services files are gitignored

### Before Production Deploy:
- [ ] All Firebase API keys are restricted (not unrestricted)
- [ ] Firestore security rules are properly configured
- [ ] Environment variables are set in production environment
- [ ] No debug print statements in production code
- [ ] SSL/HTTPS enforced for all API calls

### Weekly Security Review:
- [ ] Scan for newly added hardcoded secrets
- [ ] Review Firebase access logs for unusual activity
- [ ] Update Firebase API key restrictions
- [ ] Review Firestore security rules
- [ ] Check for dependency vulnerabilities

## 🛡️ Firebase API Key Restrictions

### Configure in Firebase Console:
1. Go to Google Cloud Console > APIs & Services > Credentials
2. For each API key, set restrictions:

**Web Keys:**
- Application restrictions: HTTP referrers
- Allowed referrers: `https://yourdomain.com/*`

**Android Keys:**
- Application restrictions: Android apps
- Package name: `com.pharmapp.pharmacy`
- SHA-1 fingerprint: Your app's signature

**iOS Keys:**
- Application restrictions: iOS apps  
- Bundle ID: `com.pharmapp.pharmacy`

## 🚨 Incident Response

### If Secrets Are Exposed:
1. **IMMEDIATELY** revoke exposed keys in Firebase Console
2. Generate new keys and update environment variables
3. Clean Git history using `scripts/clean_git_secrets.bat`
4. Force push cleaned history: `git push --force-with-lease`
5. Notify all team members to pull updated repository
6. Review access logs for unauthorized usage

### Emergency Contacts:
- Firebase Admin: [admin-email@company.com]
- Security Team: [security@company.com]
- DevOps Lead: [devops@company.com]

## 📊 Security Monitoring

### Daily Checks:
- Firebase usage logs for unusual patterns
- Authentication logs for failed attempts
- API call patterns for anomalies

### Weekly Reports:
- Security scan results
- Firebase API usage statistics  
- Access pattern analysis
- Dependency vulnerability updates

## 🔄 Compliance Requirements

### Data Protection:
- GDPR compliance for EU users
- HIPAA considerations for health data
- Local privacy regulations in African markets

### Payment Security:
- PCI DSS requirements for mobile money
- MTN MoMo and Orange Money security standards
- Financial transaction audit trails

---

**Remember: Security is everyone's responsibility. When in doubt, ask the security team.**

*Last updated: 2025-09-04*
*Next review: 2025-10-04*