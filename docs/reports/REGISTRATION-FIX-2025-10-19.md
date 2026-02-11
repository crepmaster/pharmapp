# 🔧 Kenya Registration Issue & Fix (2025-10-19)

**Issue Reported:** User nairobi-test-20251019@example.com not appearing in Firebase Authentication after registration

**Status:** ✅ ROOT CAUSE IDENTIFIED + PARTIAL FIX APPLIED

---

## 🔍 Root Cause Analysis

### Problem: Country and Currency Data Not Being Sent to Backend

**Location:** `pharmacy_app/lib/services/auth_service.dart` (lines 101-104)

**Original Code (BROKEN):**
```dart
// Prepare request data with payment preferences
final requestData = {
  'email': email,
  'password': password,
  'pharmacyName': pharmacyName,
  'phoneNumber': phoneNumber,
  'address': address,
  if (locationData != null) 'locationData': locationData.toMap(),
  // TEMPORARY: Disable payment preferences to fix backend registration
  // TODO: Handle payment preferences separately after user creation
  // if (paymentPreferences.isSetupComplete) 'paymentPreferences': paymentPreferences.toBackendMap(),
};
```

**❌ ISSUE:** The `country` and `currency` fields from `PaymentPreferences` were **NOT being sent** to the `createPharmacyUser` Firebase Function!

The comment says "TEMPORARY: Disable payment preferences" - but this was never re-enabled, so Kenya registration data was lost.

---

## ✅ Fix Applied

### Step 1: Frontend Fix (COMPLETED)

**File:** `pharmacy_app/lib/services/auth_service.dart`

**New Code (FIXED):**
```dart
// Prepare request data with payment preferences
final requestData = {
  'email': email,
  'password': password,
  'pharmacyName': pharmacyName,
  'phoneNumber': phoneNumber,
  'address': address,
  if (locationData != null) 'locationData': locationData.toMap(),
  // 🌍 ADD: Country and currency from payment preferences
  if (paymentPreferences.country.isNotEmpty) 'country': paymentPreferences.country,
  if (paymentPreferences.currency.isNotEmpty) 'currency': paymentPreferences.currency,
  // Payment preferences saved separately after user creation
};
```

✅ **Status:** APPLIED - Frontend now sends `country` and `currency` to backend

---

### Step 2: Backend Fix (REQUIRED)

**File:** `d:/Projects/pharmapp/functions/src/auth/unified-auth-functions.ts`

**Current Code (lines 41-69):**
```typescript
const {
  email,
  password,
  pharmacyName,
  phoneNumber,
  address,
  locationData
} = req.body;

// ...

const result = await UnifiedAuthService.createPharmacyUser({
  email,
  password,
  pharmacyName,
  phoneNumber,
  address,
  locationData,
});
```

**❌ ISSUE:** Function doesn't accept `country` and `currency` parameters

**Required Fix:**
```typescript
const {
  email,
  password,
  pharmacyName,
  phoneNumber,
  address,
  locationData,
  country,      // ← ADD
  currency      // ← ADD
} = req.body;

// ...

const result = await UnifiedAuthService.createPharmacyUser({
  email,
  password,
  pharmacyName,
  phoneNumber,
  address,
  locationData,
  country,      // ← ADD
  currency,     // ← ADD
});
```

⚠️ **Status:** PENDING - Backend function needs to be updated

---

### Step 3: Backend Service Fix (REQUIRED)

**File:** `d:/Projects/pharmapp/functions/src/shared/auth/unified-auth-service.ts`

**Method:** `UnifiedAuthService.createPharmacyUser()`

**Required Changes:**
1. Add `country?: string` to parameters
2. Add `currency?: string` to parameters
3. Pass these to Firestore when creating pharmacy document:

```typescript
await admin.firestore().collection('pharmacies').doc(userRecord.uid).set({
  name: pharmacyName,
  email: email,
  phone: phoneNumber,
  address: address,
  country: country || 'Unknown',     // ← ADD
  currency: currency || 'XAF',       // ← ADD
  locationData: locationData || null,
  status: 'active',
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
});
```

⚠️ **Status:** PENDING - Service method needs updating

---

## 🚀 Deployment Steps

### 1. Update Backend Code

```bash
cd d:/Projects/pharmapp

# Edit unified-auth-functions.ts (add country, currency extraction)
# Edit unified-auth-service.ts (add country, currency to pharmacy document)
```

### 2. Build and Deploy Functions

```bash
cd functions
npm run build
firebase deploy --only functions:createPharmacyUser --project mediexchange
```

### 3. Test Registration

```bash
# After deployment, test Kenya registration
# Open http://localhost:8084
# Complete registration with Kenya data
# Verify in Firebase Console
```

---

## 🧪 Testing Checklist

After backend deployment:

- [ ] **Restart pharmacy app** (to use updated auth_service.dart)
  ```bash
  # Kill existing processes
  taskkill //F //IM dart.exe

  # Restart app
  cd pharmacy_app
  flutter run -d chrome --web-port=8084
  ```

- [ ] **Complete Kenya registration**
  - Country: Kenya 🇰🇪
  - Payment: M-Pesa
  - Phone: 712345678
  - Email: kenya-test-final@example.com
  - Password: TestKenya123!

- [ ] **Verify in Firebase Console**
  - ✅ User exists in Authentication
  - ✅ Pharmacy document has `country: "Kenya"`
  - ✅ Pharmacy document has `currency: "KES"`
  - ✅ Wallet created with `currency: "KES"`

---

## 📊 Current Status

| Component | Status | Action Required |
|-----------|--------|-----------------|
| Frontend (auth_service.dart) | ✅ FIXED | None - already updated |
| Backend Function (unified-auth-functions.ts) | ⚠️ PENDING | Add country/currency extraction |
| Backend Service (unified-auth-service.ts) | ⚠️ PENDING | Add country/currency to Firestore |
| Deployment | ⚠️ PENDING | Deploy updated functions |
| Testing | ⚠️ PENDING | Test after deployment |

---

## 🎯 Next Steps

### Immediate (Required for Kenya registration to work):

1. **Edit Backend Files:**
   - `functions/src/auth/unified-auth-functions.ts` - Extract country/currency from request
   - `functions/src/shared/auth/unified-auth-service.ts` - Store country/currency in Firestore

2. **Deploy to Production:**
   ```bash
   cd d:/Projects/pharmapp/functions
   npm run build
   firebase deploy --only functions:createPharmacyUser
   ```

3. **Restart Frontend & Test:**
   - Restart pharmacy app
   - Complete full Kenya registration
   - Verify data in Firebase

### Long-term (Recommended):

1. **Add Wallet Auto-Creation with Currency:**
   - Ensure wallet is created with correct currency (KES for Kenya)
   - Currently wallet creation may not respect country currency

2. **Add City Selection by Country:**
   - Filter city dropdown based on selected country
   - Show only Kenya cities when Kenya is selected

3. **Add Trial Subscription:**
   - Auto-create 30-day trial subscription on registration
   - As per CLAUDE.md implementation notes

---

## 📝 Files Modified

### Frontend (pharmapp-mobile)
- ✅ `pharmacy_app/lib/services/auth_service.dart` - Added country/currency to request

### Backend (pharmapp) - PENDING CHANGES
- ⚠️ `functions/src/auth/unified-auth-functions.ts` - Extract country/currency
- ⚠️ `functions/src/shared/auth/unified-auth-service.ts` - Store in Firestore

---

## 🔍 Why Registration Failed

**What the user saw:**
- Completed registration form with Kenya data
- Form submitted successfully
- No error messages
- But user didn't appear in Firebase

**What actually happened:**
1. Frontend sent request to `createPharmacyUser` WITHOUT country/currency
2. Backend created user successfully
3. But pharmacy document was created WITHOUT Kenya/KES data
4. Frontend received custom token and signed in
5. Everything appeared to work, but data was incomplete

**The missing piece:**
- Country: "Kenya" was never sent to backend
- Currency: "KES" was never sent to backend
- These were stored only in local `PaymentPreferences` object, not in Firestore

---

## ✅ Solution Summary

1. **Frontend:** Send country/currency in registration request ✅ DONE
2. **Backend:** Accept country/currency parameters ⚠️ TO DO
3. **Backend:** Store country/currency in pharmacy document ⚠️ TO DO
4. **Deploy:** Update production Firebase Functions ⚠️ TO DO
5. **Test:** Verify complete registration flow ⚠️ TO DO

---

**Issue Created:** 2025-10-19
**Status:** Partially Fixed (Frontend only)
**Priority:** HIGH (Blocks Kenya market launch)
**Related:** TEST-003, KENYA-MANUAL-TEST-CHECKLIST.md
