# PharmApp Unified - Quick Start Guide

## 🚀 **5-Minute Deployment for Testing**

### **Prerequisites** (One-Time Setup):

1. **Fix Firebase CLI** (if you saw the ENOENT error):
   ```bash
   npm uninstall -g firebase-tools
   npm install -g firebase-tools
   firebase login
   ```

2. **Get Firebase Configuration**:
   ```bash
   firebase apps:sdkconfig web --project=mediexchange
   ```

   Copy the `apiKey` and `appId` values.

3. **Update firebase_options.dart**:

   Edit `lib/firebase_options.dart` lines 27-30:
   ```dart
   apiKey: 'YOUR_REAL_API_KEY',  // ← Paste here
   appId: 'YOUR_REAL_APP_ID',    // ← Paste here
   ```

---

## ⚡ **Option 1: Automated Deployment (Easiest)**

Double-click the deployment script:
```
deploy.bat
```

Select option 1 for local testing or option 4 for full deployment.

---

## ⚡ **Option 2: Manual Commands (3 Steps)**

### **For Local Testing**:
```bash
cd pharmapp_unified
flutter pub get
flutter run -d chrome --web-port=8084
```

### **For Firebase Hosting Deployment**:
```bash
cd pharmapp_unified
flutter pub get
flutter build web --release
firebase deploy --only hosting --project=mediexchange
```

---

## 🧪 **Testing the App**

### **Test Accounts**:
```
Email: meunier@promoshake.net
Email: 09092025@promoshake.net
Password: [your actual password]
```

### **What to Test**:
1. ✅ Login with test account
2. ✅ Dashboard loads correctly
3. ✅ Role detection works (pharmacy/courier/admin)
4. ✅ Role switching works (if multi-role user)
5. ✅ Wallet balance displays
6. ✅ Logout works

---

## 🆘 **Troubleshooting**

### **"API Key Invalid" Error**:
- Update `firebase_options.dart` with real keys (see step 2 above)

### **"Permission Denied" in Firestore**:
```bash
firebase deploy --only firestore:rules --project=mediexchange
```

### **Slow Login**:
- Normal for first login (cold start)
- Should be 1-3 seconds after first login

---

## 📄 **Full Documentation**:
- [DEPLOYMENT_GUIDE.md](../DEPLOYMENT_GUIDE.md) - Complete deployment guide
- [UNIFIED_APP_STATUS_REPORT.md](../UNIFIED_APP_STATUS_REPORT.md) - Technical details

---

**Questions?** Check the full DEPLOYMENT_GUIDE.md
