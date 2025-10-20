# 🧹 Clean Firebase Database - Manual Instructions

**Purpose:** Delete all pharmacy data to have a clean database for Kenya registration testing

**Time Required:** 5-10 minutes

---

## 🎯 Quick Overview

You need to delete data from 3 locations:
1. **Firebase Authentication** - User accounts
2. **Firestore Database** - Pharmacy documents
3. **Firestore Database** - Wallet documents
4. **Firestore Database** - Payment preferences

---

## 📋 Step-by-Step Instructions

### **Step 1: Open Firebase Console**

1. Open your browser
2. Go to: https://console.firebase.google.com/project/mediexchange
3. Make sure you're logged in with your Firebase account

---

### **Step 2: Delete Users from Authentication** ⏱️ 2-3 minutes

1. Click **"Authentication"** in the left sidebar
2. Click **"Users"** tab
3. You'll see a list of all registered users

**To delete all users:**

**Option A: Delete Individual Users**
- Click the **⋮** (three dots) menu on each user row
- Select **"Delete user"**
- Confirm the deletion
- Repeat for each user

**Option B: Delete Multiple Users (Faster)**
- Check the ☑️ checkbox next to each user (or check the top checkbox to select all)
- Click **"Delete selected users"** button at the top
- Confirm the deletion

**Screenshot locations:**
```
Firebase Console > mediexchange > Authentication > Users > Delete
```

---

### **Step 3: Delete Pharmacy Documents** ⏱️ 2 minutes

1. Click **"Firestore Database"** in the left sidebar
2. Click on the **"pharmacies"** collection

**You'll see all pharmacy documents listed**

**To delete all pharmacy documents:**

**Option A: Delete Individual Documents**
- Hover over each document
- Click the **🗑️** trash icon on the right
- Confirm deletion
- Repeat for all documents

**Option B: Delete Collection (Fastest)**
- Click the **⋮** (three dots) next to "pharmacies" collection name
- Select **"Delete collection"**
- Type the collection name to confirm: `pharmacies`
- Click **"Delete"**

**Screenshot location:**
```
Firebase Console > mediexchange > Firestore Database > pharmacies > Delete
```

---

### **Step 4: Delete Wallet Documents** ⏱️ 2 minutes

1. Still in **"Firestore Database"**
2. Click on the **"wallets"** collection

**To delete all wallet documents:**

- Click the **⋮** (three dots) next to "wallets" collection name
- Select **"Delete collection"**
- Type: `wallets`
- Click **"Delete"**

**Screenshot location:**
```
Firebase Console > mediexchange > Firestore Database > wallets > Delete
```

---

### **Step 5: Delete Payment Preferences** ⏱️ 1 minute

1. Still in **"Firestore Database"**
2. Look for **"paymentPreferences"** collection

**To delete (if it exists):**

- Click the **⋮** (three dots) next to "paymentPreferences"
- Select **"Delete collection"**
- Type: `paymentPreferences`
- Click **"Delete"**

**Note:** This collection might not exist yet, that's OK!

---

## ✅ Verification - Database is Clean

After completing all steps, verify:

### **Check Authentication:**
- Go to: Firebase Console > Authentication > Users
- **Should show:** "No users for this project"

### **Check Firestore:**
- Go to: Firebase Console > Firestore Database
- **Should show:**
  - No "pharmacies" collection (or empty)
  - No "wallets" collection (or empty)
  - No "paymentPreferences" collection (or empty)

---

## 🎉 Done! Database is Clean

Your Firebase database is now clean and ready for fresh Kenya pharmacy registration testing!

---

## 🚀 Next Steps After Cleanup

1. **Update Backend Functions** (from REGISTRATION-FIX-2025-10-19.md)
   - Add country/currency support to `createPharmacyUser`
   - Deploy updated functions

2. **Test Kenya Registration**
   - Open http://localhost:8084
   - Complete registration with Kenya data
   - Verify pharmacy appears in Firebase with:
     - `country: "Kenya"`
     - `currency: "KES"`
     - `city: "Nairobi"`

3. **Check Firebase Console**
   - Authentication: Should have 1 new user
   - Firestore > pharmacies: Should have 1 document with Kenya data
   - Firestore > wallets: Should have 1 document with `currency: "KES"`

---

## 🔗 Useful Links

- **Firebase Console:** https://console.firebase.google.com/project/mediexchange
- **Authentication:** https://console.firebase.google.com/project/mediexchange/authentication/users
- **Firestore:** https://console.firebase.google.com/project/mediexchange/firestore/data

---

## ⚠️ Important Notes

- **Backup First:** If you have important test data, there's no undo button!
- **Test Accounts:** All test accounts will be deleted (including `meunier@promoshake.net`, `09092025@promoshake.net`, etc.)
- **Production Safety:** We're working with project `mediexchange` - make sure this is your test environment!

---

**Created:** 2025-10-19
**Related:** REGISTRATION-FIX-2025-10-19.md, TEST-003-INDEX.md
**Purpose:** Clean database for Kenya registration testing
