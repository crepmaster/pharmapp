# PharmApp Unified - Complete Deployment Guide for Testing

## 🎯 **Deployment Overview**

This guide will walk you through deploying the PharmApp Unified Super-App for testing purposes.

**Target Platform**: Web (Chrome) - Easiest for testing
**Firebase Project**: mediexchange
**Estimated Time**: 30-45 minutes

---

## ✅ **Prerequisites Checklist**

Before starting, ensure you have:

- [x] Flutter SDK installed (✅ Version 3.35.3 detected)
- [x] Firebase CLI installed (⚠️ needs reinstallation)
- [ ] Firebase project access (mediexchange)
- [ ] Git repository up to date
- [x] Chrome browser for web testing

---

## 📋 **STEP-BY-STEP DEPLOYMENT PROCESS**

### **STEP 1: Fix Firebase CLI (Required)**

Your Firebase CLI installation is corrupted. Fix it first:

```bash
# Uninstall corrupted Firebase CLI
npm uninstall -g firebase-tools

# Reinstall Firebase CLI
npm install -g firebase-tools

# Verify installation
firebase --version

# Login to Firebase
firebase login
```

**Expected Output**: `firebase --version` should show version 13.x or higher

---

### **STEP 2: Get Real Firebase Configuration Keys**

#### **Option A: Using Firebase CLI (Recommended)**

```bash
# Navigate to project directory
cd d:\Projects\pharmapp-mobile\pharmapp_unified

# Select the mediexchange project
firebase use mediexchange

# Get web app configuration
firebase apps:sdkconfig web --project=mediexchange
```

**Copy the output** - you'll need these values:
- `apiKey`
- `appId`
- `messagingSenderId`
- `projectId`
- `authDomain`
- `storageBucket`

#### **Option B: Using Firebase Console (Alternative)**

1. Go to https://console.firebase.google.com/
2. Select project: **mediexchange**
3. Click ⚙️ **Project Settings**
4. Scroll to **Your apps** section
5. Find or create a **Web app** (globe icon)
6. Copy the configuration values

---

### **STEP 3: Configure Firebase Options**

Edit `pharmapp_unified/lib/firebase_options.dart`:

Replace lines 27-30 (web configuration) with your real keys:

```dart
static const FirebaseOptions web = FirebaseOptions(
  apiKey: 'AIza...',  // ← YOUR REAL API KEY HERE
  appId: '1:850077575356:web:...',  // ← YOUR REAL APP ID HERE
  messagingSenderId: '850077575356',  // Usually stays the same
  projectId: 'mediexchange',  // Already correct
  authDomain: 'mediexchange-76872.firebaseapp.com',  // Already correct
  storageBucket: 'mediexchange.firebasestorage.app',  // Already correct
);
```

**⚠️ SECURITY WARNING**: These keys will be TEMPORARY for testing only. Never commit real keys to git!

---

### **STEP 4: Install Dependencies**

```bash
# Navigate to unified app directory
cd d:\Projects\pharmapp-mobile\pharmapp_unified

# Get all Flutter dependencies
flutter pub get

# Verify no dependency conflicts
flutter pub outdated
```

**Expected Output**: All dependencies should resolve successfully.

---

### **STEP 5: Deploy Firestore Security Rules**

The unified app has comprehensive security rules that must be deployed first:

```bash
# Deploy Firestore rules (from pharmapp_unified directory)
firebase deploy --only firestore:rules --project=mediexchange

# Verify deployment
firebase firestore:rules get --project=mediexchange
```

**What this does**:
- Deploys the 244-line security rules file
- Enables multi-role access control
- Protects wallet operations (Cloud Functions only)
- Enforces role verification

---

### **STEP 6: Test Firestore Rules (Optional but Recommended)**

Verify your rules are working:

```bash
# Install Firestore emulator (if not already installed)
firebase setup:emulators:firestore

# Start local testing with emulators
firebase emulators:start --only firestore
```

Then in another terminal:

```bash
# Test the unified app with emulators
cd d:\Projects\pharmapp-mobile\pharmapp_unified
flutter run -d chrome --web-port=8084
```

**Test scenarios**:
1. Login as pharmacy user
2. Switch to courier role (if available)
3. View dashboard data
4. Logout

---

### **STEP 7: Build the Unified App for Testing**

#### **Web Build (Recommended for Testing)**

```bash
cd d:\Projects\pharmapp-mobile\pharmapp_unified

# Build optimized web version
flutter build web --release

# Output will be in: build/web/
```

#### **Android APK Build (Optional)**

```bash
# Build debug APK for testing
flutter build apk --debug

# Build release APK (requires signing)
flutter build apk --release

# Output: build/app/outputs/flutter-apk/app-debug.apk
```

---

### **STEP 8: Deploy to Firebase Hosting for Testing**

Deploy the web version to Firebase Hosting for easy testing:

```bash
# Initialize Firebase Hosting (one-time setup)
cd d:\Projects\pharmapp-mobile\pharmapp_unified
firebase init hosting

# When prompted:
# - What do you want to use as your public directory? → build/web
# - Configure as a single-page app? → Yes
# - Set up automatic builds with GitHub? → No
# - File build/web/index.html already exists. Overwrite? → No

# Deploy to Firebase Hosting
firebase deploy --only hosting --project=mediexchange
```

**Expected Output**:
```
✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/mediexchange/overview
Hosting URL: https://mediexchange.web.app
```

---

### **STEP 9: Test the Deployed Application**

Open the hosting URL in Chrome:
```
https://mediexchange.web.app
```

#### **Test Account Credentials**:

**Existing Test Accounts** (from CLAUDE.md):
```
Email: meunier@promoshake.net
Password: [your actual password]
Role: Pharmacy (has encrypted payment preferences)

Email: 09092025@promoshake.net
Password: [your password]
Role: Pharmacy (has 25,000 XAF wallet balance)
```

#### **Testing Checklist**:

1. **Login Flow**:
   - [ ] Login screen loads correctly
   - [ ] Can login with test account
   - [ ] Auto-detects user role (pharmacy/courier/admin)
   - [ ] Navigates to correct dashboard

2. **Dashboard Functionality**:
   - [ ] Pharmacy dashboard displays (if pharmacy role)
   - [ ] Wallet balance shows correctly
   - [ ] Menu navigation works
   - [ ] Profile information displays

3. **Role Switching** (if user has multiple roles):
   - [ ] Role switcher button appears
   - [ ] Can switch to courier role
   - [ ] Dashboard updates correctly
   - [ ] Can switch back to pharmacy role

4. **Security Features**:
   - [ ] Cannot access admin panel without admin role
   - [ ] Firestore data loads with proper permissions
   - [ ] Payment preferences are encrypted (masked display)
   - [ ] Logout works correctly

5. **Performance**:
   - [ ] Login completes in 1-3 seconds
   - [ ] Dashboard loads quickly
   - [ ] Role switching is smooth (< 1 second)

---

### **STEP 10: Monitor and Debug**

#### **Check Firebase Console**:

1. **Authentication**: https://console.firebase.google.com/project/mediexchange/authentication
   - Verify user login events

2. **Firestore**: https://console.firebase.google.com/project/mediexchange/firestore
   - Check data reads/writes
   - Verify security rules are enforcing

3. **Hosting**: https://console.firebase.google.com/project/mediexchange/hosting
   - Monitor deployment status
   - Check usage metrics

#### **Debug with Browser DevTools**:

```javascript
// Open Chrome DevTools (F12)
// Console tab - check for errors

// Common issues:
// - Firebase config errors → Check firebase_options.dart keys
// - CORS errors → Ensure Firebase Functions have CORS enabled
// - Auth errors → Check Firestore rules deployment
```

---

## 🚨 **TROUBLESHOOTING COMMON ISSUES**

### **Issue 1: Firebase Init Error (ENOENT)**

**Error**: `Error: ENOENT: no such file or directory`

**Solution**:
```bash
npm uninstall -g firebase-tools
npm cache clean --force
npm install -g firebase-tools
```

---

### **Issue 2: "API Key Invalid" Error**

**Cause**: Placeholder keys still in firebase_options.dart

**Solution**:
1. Run `firebase apps:sdkconfig web --project=mediexchange`
2. Copy real `apiKey` and `appId` values
3. Replace in `firebase_options.dart` lines 27-30

---

### **Issue 3: "Permission Denied" in Firestore**

**Cause**: Security rules not deployed

**Solution**:
```bash
firebase deploy --only firestore:rules --project=mediexchange
```

---

### **Issue 4: Slow Login (> 5 seconds)**

**Cause**: Using sequential queries instead of parallel

**Solution**: ✅ Already fixed in unified app (parallel queries)

Check network connection - African mobile networks may have high latency.

---

### **Issue 5: Role Switcher Not Appearing**

**Cause**: User only has one role

**Expected Behavior**: Role switcher only shows if user has 2+ roles (pharmacy + courier, etc.)

**Solution**: Create test user with multiple roles in Firebase Console.

---

## 📱 **ALTERNATIVE: Local Testing (Faster)**

For rapid iteration during development:

```bash
# Terminal 1: Start Firebase emulators
cd d:\Projects\pharmapp
firebase emulators:start --only firestore,auth

# Terminal 2: Run unified app pointing to emulators
cd d:\Projects\pharmapp-mobile\pharmapp_unified
flutter run -d chrome --web-port=8084
```

**Advantages**:
- No real Firebase quota usage
- Faster development cycle
- Can test offline

**Limitations**:
- Payment webhooks won't work (no external access)
- Push notifications unavailable

---

## 🔐 **SECURITY REMINDERS**

### **Before Committing Changes**:

If you added real Firebase keys to `firebase_options.dart`:

```bash
# CRITICAL: Restore placeholders before committing
git checkout pharmapp_unified/lib/firebase_options.dart

# Or manually replace with placeholders:
# apiKey: 'AIzaSyC-PLACEHOLDER-REPLACE-WITH-REAL-KEY'
# appId: '1:850077575356:web:PLACEHOLDER-REPLACE-WITH-REAL-APPID'
```

### **Production Deployment Security**:

For production, use environment variables:

```bash
# Build with environment variables (production-ready)
flutter build web --release \
  --dart-define=FIREBASE_WEB_API_KEY=$FIREBASE_WEB_API_KEY \
  --dart-define=FIREBASE_WEB_APP_ID=$FIREBASE_WEB_APP_ID
```

---

## 📊 **POST-DEPLOYMENT VALIDATION**

After deploying, verify these metrics in Firebase Console:

### **Authentication Dashboard**:
- [ ] User sign-in events appearing
- [ ] No authentication errors in logs
- [ ] Rate limiting working (if testing failed logins)

### **Firestore Dashboard**:
- [ ] Read/write operations under quota limits
- [ ] Security rules enforcing (denied operations logged)
- [ ] No unauthorized access attempts

### **Hosting Dashboard**:
- [ ] Deployment successful
- [ ] SSL certificate active (https://)
- [ ] Response times < 500ms

---

## 🎯 **SUCCESS CRITERIA**

Your deployment is successful when:

1. ✅ Web app loads at Firebase Hosting URL
2. ✅ Login works with test accounts
3. ✅ Auto-role detection completes in 1-3 seconds
4. ✅ Dashboard displays correctly
5. ✅ Role switching works (if multi-role user)
6. ✅ Firestore data loads with proper permissions
7. ✅ No console errors in browser DevTools
8. ✅ Firebase Console shows user activity

---

## 📞 **NEXT STEPS AFTER TESTING**

Once testing is successful:

1. **Performance Optimization**:
   - Implement role detection caching (70% read reduction)
   - Add Firebase Analytics for usage tracking
   - Create Firestore indexes for complex queries

2. **User Acceptance Testing (UAT)**:
   - Invite 5-10 pilot pharmacies/couriers
   - Collect feedback on UX/performance
   - Monitor Firebase usage metrics

3. **Production Preparation**:
   - Implement comprehensive unit tests
   - Set up CI/CD pipeline (GitHub Actions)
   - Configure production environment variables
   - Create backup/rollback procedures

4. **Scale Testing**:
   - Test with 50+ concurrent users
   - Monitor Firestore read/write quotas
   - Optimize Cloud Functions cold starts
   - Test payment webhooks end-to-end

---

## 📄 **QUICK REFERENCE - Essential Commands**

```bash
# Fix Firebase CLI
npm install -g firebase-tools && firebase login

# Get Firebase config
firebase apps:sdkconfig web --project=mediexchange

# Deploy rules
firebase deploy --only firestore:rules --project=mediexchange

# Build web app
cd pharmapp_unified && flutter build web --release

# Deploy to hosting
firebase deploy --only hosting --project=mediexchange

# Local testing
flutter run -d chrome --web-port=8084
```

---

## 🆘 **HELP & SUPPORT**

### **Documentation**:
- [UNIFIED_APP_STATUS_REPORT.md](UNIFIED_APP_STATUS_REPORT.md) - Complete technical details
- [pharmapp_unified/IMPROVEMENTS_IMPLEMENTED.md](pharmapp_unified/IMPROVEMENTS_IMPLEMENTED.md) - Implementation guide
- [CLAUDE.md](CLAUDE.md) - Project instructions

### **Firebase Project**:
- Console: https://console.firebase.google.com/project/mediexchange
- Project ID: `mediexchange`
- Region: `europe-west1`

### **Backend Repository**:
- Path: `D:\Projects\pharmapp`
- Functions: 9+ deployed
- Testing scripts: `functions/scripts/test-cloudrun.ps1`

---

**Deployment Guide Version**: 1.0
**Last Updated**: October 5, 2025
**Status**: Ready for testing deployment

---

**END OF DEPLOYMENT GUIDE**
