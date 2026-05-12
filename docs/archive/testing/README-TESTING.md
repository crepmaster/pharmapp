# 🧪 PharmApp Testing Guide

## ⚠️ **ALWAYS START EMULATORS BEFORE TESTING**

The PharmApp platform requires Firebase emulators for safe testing. Never test against production Firebase directly.

## 🚀 **Quick Start - Testing Setup**

### 1. **Start Firebase Emulators (Required First Step)**
```bash
# Navigate to backend directory
cd D:\Projects\pharmapp

# Start emulators with safe ports
firebase emulators:start --only firestore,auth --project=demo-mediexchange
```

**Expected Output:**
```
┌─────────────────────────────────────────────────────────────┐
│ ✔  All emulators ready! It is now safe to connect your app. │
│ i  View Emulator UI at http://localhost:4000                │
└─────────────────────────────────────────────────────────────┘

┌────────────────┬────────────────┬─────────────────────────────────┐
│ Emulator       │ Host:Port      │ View in Emulator UI             │
├────────────────┼────────────────┼─────────────────────────────────┤
│ Authentication │ localhost:9099 │ http://localhost:4000/auth      │
│ Firestore      │ localhost:8080 │ http://localhost:4000/firestore │
└────────────────┴────────────────┴─────────────────────────────────┘
```

### 2. **Run PharmApp Applications**

**Pharmacy App (Test wallet top-up functionality):**
```bash
cd D:\Projects\pharmapp-mobile\pharmacy_app
flutter run -d chrome --web-port=8085
```

**Courier App:**
```bash
cd D:\Projects\pharmapp-mobile\courier_app
flutter run -d chrome --web-port=8086
```

**Admin Panel:**
```bash
cd D:\Projects\pharmapp-mobile\admin_panel
flutter run -d chrome --web-port=8087
```

## 🏥 **Test Pharmacy Accounts**

### **Primary Test Account:**
```
Email: test@pharmacy.com
Password: password123
Pharmacy: Test Pharmacy Ltd
```

### **Additional Test Accounts:**
```
Email: pharmacy-a@test.com
Password: password123
Pharmacy: Pharmacy A

Email: douala@cm.com  
Password: password123
Pharmacy: Douala Medical
```

## 💳 **Test Payment Numbers**

### **MTN Mobile Money (Valid):**
- 677123456
- 678987654  
- 654123456

### **Orange Money (Valid):**
- 694123456
- 695987654
- 696111222

## 🧪 **Testing Wallet Top-Up Feature**

1. **Login** with test pharmacy account
2. **Navigate** to Dashboard → Wallet Balance section  
3. **Click "Top Up"** button to open enhanced dialog
4. **Test Features:**
   - Quick amount selection (500, 1K, 2.5K, 5K, 10K, 25K XAF)
   - Payment method validation (MTN vs Orange)
   - Cross-operator validation (prevents mismatched phone/operator)
   - Encrypted payment preferences saving
   - Form validation and error handling

## 🔒 **Security Features to Verify**

- **Phone Masking**: Saved numbers display as 677****56
- **Cross-Validation**: MTN number with Orange method shows error
- **Encryption**: Payment preferences stored securely
- **Environment Controls**: Test numbers only in development

## 🛑 **Important Testing Rules**

### ✅ **DO:**
- Always start emulators first
- Use test accounts listed above
- Test with valid MTN/Orange numbers
- Register new accounts with fake data for testing

### ❌ **DON'T:**
- Test against production Firebase directly
- Use real pharmacy emails or phone numbers
- Skip emulator startup
- Test payment processing with real money

## 🔧 **Troubleshooting**

### **Port Conflicts:**
```bash
# If port 8080 is taken, use different port:
firebase emulators:start --only firestore,auth --project=demo-mediexchange --port=8081
```

### **Authentication Errors:**
```bash
# Restart emulators to clear auth state:
Ctrl+C (stop emulators)
firebase emulators:start --only firestore,auth --project=demo-mediexchange
```

### **Clean Emulator Data:**
```bash
# Start with fresh data:
firebase emulators:start --only firestore,auth --project=demo-mediexchange --wipe-data
```

## 📱 **Emulator UI Access**

- **Emulator Dashboard**: http://localhost:4000
- **Authentication Panel**: http://localhost:4000/auth  
- **Firestore Data**: http://localhost:4000/firestore

## 🎯 **Testing Workflow**

1. **Start emulators** (mandatory first step)
2. **Run app** on desired platform  
3. **Register/Login** with test account
4. **Test wallet functionality**
5. **Verify security features**
6. **Clean state**: Restart emulators between tests

---

## 📋 **Testing Checklist**

- [ ] Firebase emulators running (localhost:9099 auth, localhost:8080 firestore)
- [ ] PharmApp launched with chrome on port 8085+
- [ ] Test pharmacy account login successful  
- [ ] Wallet balance section visible on dashboard
- [ ] Top-up dialog opens with enhanced features
- [ ] Quick amount selection works
- [ ] Payment method validation functional
- [ ] Cross-operator validation prevents errors
- [ ] Test phone numbers accepted
- [ ] Payment preferences saved securely

**Remember: Emulators must be running before any app testing!**