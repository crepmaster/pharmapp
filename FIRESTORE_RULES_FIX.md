# FIRESTORE RULES FIX - Add `users` Collection Rules

## Root Cause
The courier registration fails with `[cloud_firestore/permission-denied]` because:
- The `unified_auth_service.dart` writes to **TWO collections** in a transaction:
  1. `users/{userId}` (line 117) - **MISSING RULES** ← This is the problem
  2. `couriers/{userId}` (line 136) - Has rules
- When the `users` write fails, the **entire transaction rolls back**
- Result: No data is saved to Firestore, registration fails

## Fix Required
Add security rules for the `users` collection to your Firestore rules.

## How to Apply Fix

### Step 1: Go to Firebase Console
1. Open https://console.firebase.google.com
2. Select project: **mediexchange**
3. Navigate to: **Firestore Database → Rules** tab

### Step 2: Add Users Collection Rules
Add this block to your `firestore.rules` file (insert it BEFORE the `pharmacies` rules):

```javascript
// ========================================
// USERS COLLECTION (Master User Records)
// ========================================
match /users/{userId} {
  // Allow authenticated users to create their own user document during registration
  allow create: if request.auth != null
               && request.auth.uid == userId
               && request.resource.data.email == request.auth.token.email;

  // Allow users to read their own user document
  allow read: if request.auth != null && request.auth.uid == userId;

  // Allow users to update their own profile (displayName, etc.)
  allow update: if request.auth != null
               && request.auth.uid == userId
               && request.resource.data.email == resource.data.email; // Prevent email changes

  // Prevent deletion
  allow delete: if false;
}
```

### Step 3: Complete Firestore Rules File
Your complete rules should look like this:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ========================================
    // USERS COLLECTION (Master User Records)
    // ========================================
    match /users/{userId} {
      allow create: if request.auth != null
                   && request.auth.uid == userId
                   && request.resource.data.email == request.auth.token.email;

      allow read: if request.auth != null && request.auth.uid == userId;

      allow update: if request.auth != null
                   && request.auth.uid == userId
                   && request.resource.data.email == resource.data.email;

      allow delete: if false;
    }

    // ========================================
    // PHARMACIES COLLECTION
    // ========================================
    match /pharmacies/{pharmacyId} {
      allow create: if request.auth != null && request.auth.uid == pharmacyId;
      allow read: if request.auth != null && request.auth.uid == pharmacyId;
      allow update: if request.auth != null && request.auth.uid == pharmacyId;
      allow delete: if false;
    }

    // ========================================
    // COURIERS COLLECTION
    // ========================================
    match /couriers/{courierId} {
      allow create: if request.auth != null && request.auth.uid == courierId;
      allow read: if request.auth != null && request.auth.uid == courierId;
      allow update: if request.auth != null && request.auth.uid == courierId;
      allow delete: if false;
    }

    // ... keep all your other existing rules (wallets, ledger, exchanges, etc.)
  }
}
```

### Step 4: Publish Rules
1. Click **"Publish"** button in Firebase Console
2. Confirm the deployment

## Verification Steps

After deploying the rules:

1. **Test Courier Registration:**
   - Open courier app on emulator
   - Create new courier account with fresh email
   - Fill all registration details
   - Click "Complete Registration"

2. **Expected Results:**
   - ✅ No "permission-denied" error
   - ✅ Registration succeeds
   - ✅ Debug log shows: `🔍 DEBUG: Firestore transaction completed successfully!`
   - ✅ User navigates to courier dashboard

3. **Verify Firestore Data:**
   - Go to Firebase Console → Firestore Database
   - Check collections created:
     - `users/{userId}` - Contains email, displayName, userType
     - `couriers/{userId}` - Contains fullName, vehicleType, licensePlate, etc.
     - `wallets/{userId}` - Contains balance: 0 (if auto-created)

## Why Pharmacy Registration Worked
Pharmacy registration likely worked in one of these scenarios:
1. Tested in **Firebase emulator** first (no rules enforcement)
2. Used a **pre-existing account** (not fresh registration)
3. Firestore rules were **more permissive earlier** and got tightened later

The unified auth code is **identical** for both pharmacy and courier - the only difference is the missing `users` collection rules.

## Alternative Fix (NOT Recommended)
If you don't want the `users` collection, you would need to:
1. Remove the `users` collection write from `unified_auth_service.dart` (line 117)
2. Store email/displayName in role-specific collections only
3. Lose centralized user metadata across roles

**Verdict:** Keep the `users` collection design - it's cleaner. Just add the rules.

## Summary
- **Problem:** Missing Firestore security rules for `users` collection
- **Impact:** All courier registrations fail with permission-denied
- **Fix:** Add `users` collection rules to Firestore (see above)
- **Effort:** 5 minutes (copy rules, publish in Firebase Console)
- **Result:** Courier registration will work immediately after deploying rules
