# 🔍 Code Review - Common Errors to Avoid

**Purpose:** Track all errors found during code reviews to prevent repetition

**Last Updated:** 2025-10-19

---

## 📋 Coding Standards

### **Flutter/Dart Best Practices:**
1. ✅ Always use `const` for immutable widgets
2. ✅ One class per file (feature-based organization)
3. ✅ Use descriptive file names matching class names (snake_case)
4. ✅ Add null safety checks (`mounted` for async)
5. ✅ Proper error handling with try-catch
6. ✅ Use meaningful variable names (no abbreviations)
7. ✅ Add documentation comments for public APIs
8. ✅ Follow repository pattern (separate data layer)

### **Firebase Best Practices:**
1. ✅ Never expose API keys in code
2. ✅ Use server-side validation for critical operations
3. ✅ Implement proper Firestore security rules
4. ✅ Denormalize data when needed for performance
5. ✅ Use batch writes for multiple operations
6. ✅ Handle offline scenarios gracefully

### **Architecture Patterns:**
1. ✅ Clean Architecture: Domain → Data → Presentation
2. ✅ Repository pattern for data access
3. ✅ BLoC pattern for state management
4. ✅ Dependency injection for testability
5. ✅ Feature-first folder structure

---

## ❌ **Errors Found in Previous Code Reviews**

### **Error #1: Missing Country/Currency in Registration (2025-10-19)**
**File:** `pharmacy_app/lib/services/auth_service.dart`
**Issue:** Payment preferences (country, currency) were commented out and not sent to backend
**Code:**
```dart
// ❌ WRONG - Commented out
// if (paymentPreferences.isSetupComplete) 'paymentPreferences': paymentPreferences.toBackendMap(),
```
**Fix:**
```dart
// ✅ CORRECT - Send country and currency explicitly
if (paymentPreferences.country.isNotEmpty) 'country': paymentPreferences.country,
if (paymentPreferences.currency.isNotEmpty) 'currency': paymentPreferences.currency,
```
**Lesson:** Always verify required data is sent to backend, don't comment out critical fields

---

### **Error #2: Backend Not Accepting Country/Currency Parameters (2025-10-19)**
**File:** `functions/src/auth/unified-auth-functions.ts`
**Issue:** Backend function didn't extract country/currency from request body
**Code:**
```typescript
// ❌ WRONG - Missing country and currency
const {
  email,
  password,
  pharmacyName,
  phoneNumber,
  address,
  locationData
} = req.body;
```
**Fix:**
```typescript
// ✅ CORRECT - Extract all required fields
const {
  email,
  password,
  pharmacyName,
  phoneNumber,
  address,
  locationData,
  country,     // ← ADD
  currency     // ← ADD
} = req.body;
```
**Lesson:** Frontend and backend must be synchronized on API contract

---

### **Error #3: Hardcoded Cities in App (2025-10-19)**
**File:** `shared/lib/models/country_config.dart`
**Issue:** Cities were hardcoded, making it impossible to add new cities without app update
**Code:**
```dart
// ❌ WRONG - Hardcoded city list
static const cities = ['Douala', 'Yaoundé', 'Bafoussam'];
```
**Fix:**
```dart
// ✅ CORRECT - Cities fetched from Firestore dynamically
final cities = await FirebaseFirestore.instance
    .collection('countries/cameroon/cities')
    .where('enabled', '==', true)
    .get();
```
**Lesson:** Static data that changes should be in database, not hardcoded

---

## 📝 **Code Review Checklist (Use Before Each Commit)**

### **Before Writing Code:**
- [ ] Read this file (CODE_REVIEW_ERRORS.md) to avoid past mistakes
- [ ] Create technical specification document
- [ ] Submit spec to code reviewer for architecture review
- [ ] Wait for approval before coding

### **During Coding:**
- [ ] One class per file
- [ ] Descriptive naming (no abbreviations)
- [ ] Null safety checks
- [ ] Error handling (try-catch)
- [ ] No hardcoded strings (use constants)
- [ ] No API keys in code
- [ ] Add documentation comments

### **After Coding:**
- [ ] Run `dart analyze` (0 errors, 0 warnings)
- [ ] Run `dart format .` (consistent formatting)
- [ ] Test locally
- [ ] Submit to code reviewer BEFORE committing
- [ ] Address all reviewer feedback
- [ ] Update this file if new errors found

### **Backend Code (TypeScript):**
- [ ] Proper TypeScript types (no `any`)
- [ ] Input validation
- [ ] Error handling
- [ ] CORS configuration
- [ ] Security checks
- [ ] Run `npm run build` (0 errors)
- [ ] Run `npm run lint` (0 errors)

---

## 🏗️ **Architecture Guidelines**

### **Feature-First Folder Structure:**
```
lib/
├── features/
│   ├── country_management/
│   │   ├── data/
│   │   │   ├── models/
│   │   │   │   └── country_model.dart
│   │   │   ├── repositories/
│   │   │   │   └── country_repository.dart
│   │   │   └── data_sources/
│   │   │       └── country_remote_data_source.dart
│   │   ├── domain/
│   │   │   ├── entities/
│   │   │   │   └── country.dart
│   │   │   ├── repositories/
│   │   │   │   └── country_repository_interface.dart
│   │   │   └── usecases/
│   │   │       └── get_active_countries.dart
│   │   └── presentation/
│   │       ├── blocs/
│   │       │   └── country_bloc.dart
│   │       ├── screens/
│   │       │   └── country_selection_screen.dart
│   │       └── widgets/
│   │           └── country_card_widget.dart
│   │
│   └── city_management/
│       └── ... (same structure)
```

### **Class Naming Conventions:**
- **Models:** `CountryModel`, `CityModel`
- **Entities:** `Country`, `City`
- **Repositories:** `CountryRepository`, `CityRepository`
- **UseCases:** `GetActiveCountries`, `ValidateCityLocation`
- **BLoCs:** `CountryBloc`, `CityBloc`
- **Screens:** `CountrySelectionScreen`, `CityManagementScreen`
- **Widgets:** `CountryCardWidget`, `CityListWidget`

---

## 🎯 **New Feature Development Process**

### **Step 1: Specification**
Create `FEATURE_SPEC_{name}.md` with:
- Purpose
- Requirements
- API contract (if backend involved)
- Data model
- UI mockup
- Test cases

### **Step 2: Architecture Review**
Submit spec to code reviewer:
- Verify architecture follows clean code principles
- Check separation of concerns
- Validate data flow
- Approve before coding

### **Step 3: Implementation**
- Create one file at a time
- Follow folder structure
- Submit each class for mini-review (syntax check)

### **Step 4: Code Review**
Submit complete feature to reviewer:
- Check all files
- Verify tests pass
- Validate error handling
- Approve before commit

### **Step 5: Documentation**
- Update this file if errors found
- Update CHANGELOG.md
- Update API documentation

---

## 📚 **Resources**

- **Dart Style Guide:** https://dart.dev/guides/language/effective-dart/style
- **Flutter Best Practices:** https://flutter.dev/docs/development/ui/layout/best-practices
- **Clean Architecture:** https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
- **BLoC Pattern:** https://bloclibrary.dev/#/architecture

---

---

## ❌ **Error #4: Firestore Security Rules - Missing Admin Validation (2025-10-19)**
**File:** `FEATURE_SPEC_COUNTRY_CITY_MANAGEMENT.md` (Architecture Review)
**Reviewer:** pharmapp-reviewer agent
**Severity:** 🔴 CRITICAL (Deploy-blocking)

**Issue:** Firestore rules use undefined `hasRole()` function, breaking admin panel

**Wrong Code:**
```javascript
// ❌ WRONG - Function not defined
match /countries/{countryId} {
  allow read: if request.auth != null;
  allow write: if hasRole('super_admin'); // Function doesn't exist!
}
```

**Correct Code:**
```javascript
// ✅ CORRECT - Define function first
function isSuperAdmin() {
  return request.auth != null
    && exists(/databases/$(database)/documents/pharmacies/$(request.auth.uid))
    && get(/databases/$(database)/documents/pharmacies/$(request.auth.uid)).data.role == 'super_admin';
}

match /countries/{countryId} {
  allow read: if request.auth != null;
  allow create, update, delete: if isSuperAdmin();
}
```

**Impact:** Admin cannot add/edit countries or cities (all writes denied)
**Lesson:** Always define helper functions in Firestore rules before using them

---

## ❌ **Error #5: Client-Side Only Location Validation (2025-10-19)**
**File:** `FEATURE_SPEC_COUNTRY_CITY_MANAGEMENT.md` (Architecture Review)
**Reviewer:** pharmapp-reviewer agent
**Severity:** 🔴 CRITICAL (Security vulnerability)

**Issue:** Location validation only in client code, can be bypassed

**Wrong Approach:**
```dart
// ❌ WRONG - Client-side only
class LocationValidationService {
  Future<bool> validateLocation(lat, lng, cityId) {
    // User can modify this in their app!
  }
}
```

**Correct Approach:**
```typescript
// ✅ CORRECT - Server-side Firebase Function
export const validatePharmacyLocation = functions.https.onCall(
  async (data, context) => {
    // Server validates, user cannot bypass
    const distance = calculateDistance(userLocation, cityCenter);
    return distance <= maxRadius;
  }
);
```

**Impact:** Users could register pharmacy in wrong city, breaking exchange matching
**Lesson:** Critical business logic must be server-side (Firebase Functions)

---

## ❌ **Error #6: Denormalized Data Without Sync Mechanism (2025-10-19)**
**File:** `FEATURE_SPEC_COUNTRY_CITY_MANAGEMENT.md` (Architecture Review)
**Reviewer:** pharmapp-reviewer agent
**Severity:** 🔴 CRITICAL (Data consistency)

**Issue:** Storing `countryName` and `cityName` in pharmacy docs without sync triggers

**Problem:**
```
1. Admin changes "Kenya" → "Republic of Kenya"
2. 1000 pharmacy documents still have old name
3. Data inconsistency across collections
```

**Solution:**
```typescript
// ✅ CORRECT - Cloud Function to sync changes
export const syncCountryNameChanges = functions.firestore
  .document('countries/{countryId}')
  .onUpdate(async (change, context) => {
    const newName = change.after.data().name;

    // Update all pharmacies with new country name
    const pharmacies = await db.collection('pharmacies')
      .where('countryId', '==', context.params.countryId)
      .get();

    // Batch update
    for (const doc of pharmacies.docs) {
      await doc.ref.update({ countryName: newName });
    }
  });
```

**Impact:** Stale data shown to users, broken search/filtering
**Lesson:** Denormalization requires sync triggers to maintain consistency

---

## ❌ **Error #7: Missing Composite Indexes for Queries (2025-10-19)**
**File:** `FEATURE_SPEC_COUNTRY_CITY_MANAGEMENT.md` (Architecture Review)
**Reviewer:** pharmapp-reviewer agent
**Severity:** 🔴 CRITICAL (Performance)

**Issue:** Complex queries will fail without composite indexes

**Missing Index:**
```javascript
// Query: Get active cities in Kenya, sorted by name
db.collection('cities')
  .where('countryId', '==', 'kenya')
  .where('isActive', '==', true)
  .orderBy('name')
  .get();

// ❌ FAILS: No index for countryId + isActive + name
```

**Required Fix:** Create `firestore.indexes.json`
```json
{
  "indexes": [
    {
      "collectionGroup": "cities",
      "fields": [
        { "fieldPath": "countryId", "order": "ASCENDING" },
        { "fieldPath": "isActive", "order": "ASCENDING" },
        { "fieldPath": "name", "order": "ASCENDING" }
      ]
    }
  ]
}
```

**Impact:** Queries fail in production, slow performance
**Lesson:** Define composite indexes for all multi-field queries

---

## ❌ **Error #8: Payment Method Not Validated Against Country (2025-10-19)**
**File:** `FEATURE_SPEC_COUNTRY_CITY_MANAGEMENT.md` (Architecture Review)
**Reviewer:** pharmapp-reviewer agent
**Severity:** ⚠️ HIGH (Business logic)

**Issue:** User could select MTN in Kenya (should only have M-Pesa)

**Missing Validation:**
```dart
// ❌ WRONG - No country-payment validation
final selectedPayment = PaymentMethod.mtn;
final selectedCountry = Country.kenya;
// No check if MTN available in Kenya!
```

**Required Addition:**
```dart
// ✅ CORRECT - Validate payment method for country
class PaymentCountryValidator {
  static List<PaymentMethod> getAvailableMethods(String countryCode) {
    switch (countryCode) {
      case 'CM': return [PaymentMethod.mtn, PaymentMethod.orange];
      case 'KE': return [PaymentMethod.mpesa]; // Only M-Pesa!
      case 'NG': return [PaymentMethod.mtn];
      default: return [];
    }
  }

  static bool isMethodAvailable(Country country, PaymentMethod method) {
    return getAvailableMethods(country.code).contains(method);
  }
}
```

**Impact:** Users register with invalid payment methods, transactions fail
**Lesson:** Cross-validate related business entities (country + payment method)

---

## 🔄 **Update Log**

| Date | Error # | Feature | Reviewer | Fixed? |
|------|---------|---------|----------|--------|
| 2025-10-19 | #1 | Registration | Claude | ✅ Yes |
| 2025-10-19 | #2 | Backend API | Claude | ⚠️ Pending |
| 2025-10-19 | #3 | Country Config | Claude | 📋 Spec needed |
| 2025-10-19 | #4 | Firestore Rules | pharmapp-reviewer | ❌ Must fix |
| 2025-10-19 | #5 | Location Validation | pharmapp-reviewer | ❌ Must fix |
| 2025-10-19 | #6 | Denormalization Sync | pharmapp-reviewer | ❌ Must fix |
| 2025-10-19 | #7 | Composite Indexes | pharmapp-reviewer | ❌ Must fix |
| 2025-10-19 | #8 | Payment Validation | pharmapp-reviewer | ⚠️ Important |

---

**Note:** This document is a living file. Update it after EVERY code review session.

**🚨 CRITICAL ERRORS TO FIX BEFORE CODING:**
Errors #4, #5, #6, #7 must be resolved before implementing Country/City Management feature.
