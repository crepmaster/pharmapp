# 🔄 Firebase Security Migration Guide

## 🎯 Migration Overview

This guide helps you migrate from hardcoded Firebase configuration to a secure environment variable approach.

## ⚠️ URGENT: Pre-Migration Steps

### 1. Firebase Console - Regenerate ALL API Keys
**CRITICAL**: Current API keys are compromised and must be regenerated.

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your `mediexchange` project
3. Go to Project Settings > General
4. For each platform (Web, Android, iOS):
   - Click the config/download button
   - Generate new configuration
   - **Save the new keys securely**

### 2. Google Cloud Console - Restrict API Keys
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to APIs & Services > Credentials
3. For each API key, click "Edit" and set restrictions:

**Web API Key Restrictions:**
```
Application restrictions: HTTP referrers
Allowed referrers: 
  - https://localhost:8080/*
  - https://localhost:8084/*
  - https://localhost:8083/*
  - https://yourdomain.com/*
```

**Android API Key Restrictions:**
```
Application restrictions: Android apps
Package names:
  - com.pharmapp.pharmacy  
  - com.mediexchange.courier_app
  - com.mediexchange.admin_panel
SHA-1 fingerprints: [Your app signing certificates]
```

## 🔧 Migration Steps

### Step 1: Setup Environment Variables
Create your local `.env` file:
```bash
cp .env.example .env
```

Edit `.env` with your new Firebase keys:
```env
# Firebase Project Configuration
FIREBASE_PROJECT_ID=mediexchange
FIREBASE_MESSAGING_SENDER_ID=your_new_sender_id

# Web Platform - NEW KEYS ONLY
FIREBASE_WEB_API_KEY=your_new_web_api_key
FIREBASE_WEB_APP_ID=your_new_web_app_id

# Android Platform - NEW KEYS ONLY
FIREBASE_ANDROID_API_KEY=your_new_android_api_key  
FIREBASE_ANDROID_APP_ID=your_new_android_app_id

# iOS Platform - NEW KEYS ONLY
FIREBASE_IOS_API_KEY=your_new_ios_api_key
FIREBASE_IOS_APP_ID=your_new_ios_app_id
```

### Step 2: Remove Hardcoded Configuration
**IMPORTANT**: This step removes security vulnerabilities.

```bash
# Backup current files
mkdir backup_firebase_config
cp pharmacy_app/lib/firebase_options.dart backup_firebase_config/
cp courier_app/lib/firebase_options.dart backup_firebase_config/
cp admin_panel/lib/firebase_options.dart backup_firebase_config/

# Replace with secure versions
cp pharmacy_app/lib/firebase_options_secure.dart pharmacy_app/lib/firebase_options.dart
cp pharmacy_app/lib/firebase_options_secure.dart courier_app/lib/firebase_options.dart  
cp pharmacy_app/lib/firebase_options_secure.dart admin_panel/lib/firebase_options.dart
```

### Step 3: Test Secure Configuration
Test each app with environment variables:

**Pharmacy App:**
```bash
cd pharmacy_app
flutter run -d chrome --dart-define=FIREBASE_WEB_API_KEY=%FIREBASE_WEB_API_KEY% --dart-define=FIREBASE_WEB_APP_ID=%FIREBASE_WEB_APP_ID% --dart-define=FIREBASE_PROJECT_ID=%FIREBASE_PROJECT_ID%
```

**Courier App:**
```bash
cd courier_app  
flutter run -d chrome --web-port=8083 --dart-define=FIREBASE_WEB_API_KEY=%FIREBASE_WEB_API_KEY% --dart-define=FIREBASE_WEB_APP_ID=%FIREBASE_WEB_APP_ID%
```

**Admin Panel:**
```bash
cd admin_panel
flutter run -d chrome --web-port=8085 --dart-define=FIREBASE_WEB_API_KEY=%FIREBASE_WEB_API_KEY% --dart-define=FIREBASE_WEB_APP_ID=%FIREBASE_WEB_APP_ID%
```

### Step 4: Clean Git History (Optional but Recommended)
**WARNING**: This rewrites Git history. Coordinate with team first.

```bash
# Create backup branch
git branch backup-before-security-cleanup

# Run cleanup script (Windows)
scripts\clean_git_secrets.bat

# Or manual cleanup (Git Bash/Linux)
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch */lib/firebase_options.dart' \
  --prune-empty --tag-name-filter cat -- --all
```

## 🚀 Production Deployment

### Environment Variables Setup (Production)
Set these in your hosting platform:

**Firebase Hosting:**
```bash
firebase functions:config:set \
  firebase.web_api_key="your_prod_web_key" \
  firebase.android_api_key="your_prod_android_key" \
  firebase.ios_api_key="your_prod_ios_key"
```

**Cloud Run / App Engine:**
```bash
gcloud run services update your-service \
  --set-env-vars FIREBASE_WEB_API_KEY=your_prod_web_key,FIREBASE_PROJECT_ID=mediexchange
```

### Secure Build Process
Always use the secure build script:
```bash
# Production build
scripts\secure_build.bat

# Or manual build with all variables
flutter build web --release \
  --dart-define=FIREBASE_WEB_API_KEY=%FIREBASE_WEB_API_KEY% \
  --dart-define=FIREBASE_ANDROID_API_KEY=%FIREBASE_ANDROID_API_KEY% \
  --dart-define=FIREBASE_IOS_API_KEY=%FIREBASE_IOS_API_KEY% \
  --dart-define=FIREBASE_PROJECT_ID=%FIREBASE_PROJECT_ID% \
  --dart-define=FIREBASE_WEB_APP_ID=%FIREBASE_WEB_APP_ID% \
  --dart-define=FIREBASE_ANDROID_APP_ID=%FIREBASE_ANDROID_APP_ID% \
  --dart-define=FIREBASE_IOS_APP_ID=%FIREBASE_IOS_APP_ID%
```

## ✅ Verification Checklist

After migration, verify:

- [ ] All 3 apps start without errors
- [ ] Firebase authentication works correctly
- [ ] Firestore read/write operations function
- [ ] No hardcoded keys in source code
- [ ] `.env` files are gitignored
- [ ] Production environment variables are set
- [ ] API keys are properly restricted in Google Cloud Console
- [ ] Git history cleaned of sensitive data

## 🆘 Rollback Procedure

If issues occur during migration:

```bash
# Restore from backup
git checkout backup-before-security-cleanup

# Or restore individual files
cp backup_firebase_config/firebase_options.dart pharmacy_app/lib/
cp backup_firebase_config/firebase_options.dart courier_app/lib/
cp backup_firebase_config/firebase_options.dart admin_panel/lib/

# But remember: You MUST regenerate compromised keys!
```

## 📞 Support

If you encounter issues during migration:

1. Check the `SECURITY.md` file for troubleshooting
2. Verify all environment variables are correctly set
3. Ensure Firebase API keys are not restricted too tightly
4. Check Firebase Console for any quota or billing issues

---

**Remember**: This migration is CRITICAL for production security. Take time to do it correctly.

*Migration Guide Version: 1.0*
*Last Updated: 2025-09-04*