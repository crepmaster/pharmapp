# FILE STRUCTURE: ACTIVE VS OBSOLETE MODULES

**CRITICAL REFERENCE DOCUMENT - READ BEFORE MODIFYING CODE**

**Date Created**: 2025-10-23
**Last Updated**: 2025-10-26 (pharmacy_app made unbuildable - pubspec.yaml renamed to OBSOLETE)
**Purpose**: Prevent wasting time modifying obsolete/unused files

---

## 🎯 **MASTER APPLICATION: pharmapp_unified**

**CRITICAL DECISION - 2025-10-25**: `pharmapp_unified` is now the **MASTER APPLICATION** for ALL pharmacy AND courier functionality.

### **What This Means:**

- ✅ **ALL NEW FEATURES** → Implement in `pharmapp_unified`
- ✅ **ALL BUG FIXES** → Fix in `pharmapp_unified`
- ✅ **ALL PHARMACY WORK** → Modify `pharmapp_unified/lib/screens/pharmacy/*`
- ✅ **ALL COURIER WORK** → Modify `pharmapp_unified/lib/screens/courier/*`
- ❌ **NEVER MODIFY** → `pharmacy_app/` or `courier_app/` directories (OBSOLETE)

### **Obsolete Applications:**

- ❌ `pharmacy_app/` - Standalone pharmacy app (**UNBUILDABLE** - pubspec.yaml renamed, use pharmapp_unified instead)
- ❌ `courier_app/` - Standalone courier app (OBSOLETE - use pharmapp_unified instead)
- ✅ `pharmapp_unified/` - **MASTER** unified multi-app platform (pharmacy, courier, admin)
- ✅ `admin_panel/` - Still active (will eventually migrate to pharmapp_unified)

### **Migration Status:**

| App | Status | Master Location | Obsolete Location |
|-----|--------|----------------|-------------------|
| **Pharmacy** | ✅ **MIGRATED (2025-10-24)** | `pharmapp_unified/lib/screens/pharmacy/` | `pharmacy_app/` (OBSOLETE) |
| **Courier** | ✅ **MIGRATED (2025-10-25)** | `pharmapp_unified/lib/screens/courier/` | `courier_app/` (OBSOLETE) |
| **Admin** | 🔄 Pending | TBD | `admin_panel/` (still active) |

### **Architecture Benefits:**

1. **Single Codebase**: All apps share same architecture (UnifiedAuthBloc, Firebase, services)
2. **Code Reuse**: Services, models, widgets shared across all three apps
3. **Consistent UX**: Same navigation patterns, same UI components
4. **Easier Maintenance**: One place to fix bugs, one place to add features
5. **Multi-Role Support**: Users can have multiple roles (pharmacy owner + courier)

---

## 🚨 **CRITICAL WARNING**

**ALWAYS CHECK THIS DOCUMENT BEFORE MAKING CHANGES TO:**
- Registration screens
- Authentication flows
- Login screens
- Any screen with "unified" in the name

**We have lost multiple days modifying wrong files!** This document prevents that.

---

## ✅ **UNIFIED REGISTRATION FLOW - ACTIVE FILES ONLY**

### **📱 THE CORRECT REGISTRATION PATH (Pharmacy & Courier Apps)**

```
Login Screen (tap "Sign Up")
    ↓
PharmacyUnifiedRegistrationEntry (or CourierUnifiedRegistrationEntry)
    ↓
SCREEN 1: CountryPaymentSelectionScreen
    ↓ (pushReplacement)
SCREEN 2: UnifiedRegistrationScreen (from pharmapp_unified package)
    ↓ (registration completes)
Auto sign-in via UnifiedAuthBloc
    ↓ (popUntil to root)
Back to Login Screen (but user is now authenticated)
    ↓ (AuthBloc detects Firebase Auth user via AuthStarted)
SCREEN 3: DashboardScreen (shown by AuthWrapper)
```

---

## 📦 **ACTIVE FILES - REGISTRATION & AUTHENTICATION**

### **Entry Points (App-Specific)**

#### ✅ **Pharmacy App Entry**
```dart
File: pharmacy_app/lib/screens/auth/pharmacy_unified_registration_entry.dart
Status: ✅ ACTIVE - Currently used
Purpose: Entry point for pharmacy registration from login screen
Key Feature: Wraps UnifiedRegistrationScreen with userType: pharmacy
Usage: Navigator.push from login screen "Sign Up" button
```

#### ✅ **Courier App Entry**
```dart
File: courier_app/lib/screens/auth/courier_unified_registration_entry.dart
Status: ✅ ACTIVE - Currently used
Purpose: Entry point for courier registration from login screen
Key Feature: Wraps UnifiedRegistrationScreen with userType: courier
Usage: Navigator.push from login screen "Sign Up" button
```

---

### **Shared Registration Screens**

#### ✅ **SCREEN 1: Country & City Selection**
```dart
File: shared/lib/screens/auth/country_payment_selection_screen.dart
Status: ✅ ACTIVE - Shared between pharmacy & courier apps
Purpose: User selects country and city before registration
Features:
  - Country selection (Cameroon, Kenya, Nigeria, Ghana, etc.)
  - City selection (dynamic based on country)
  - Navigates to Screen 2 with pushReplacement
Navigation: pushReplacement → UnifiedRegistrationScreen
```

#### ✅ **SCREEN 2: Unified Registration Form**
```dart
File: pharmapp_unified/lib/screens/auth/unified_registration_screen.dart
Status: ✅ ACTIVE - Shared between pharmacy & courier apps
Purpose: Main registration form (adapts to pharmacy/courier/admin roles)
Features:
  - Role-specific fields (pharmacy name vs courier name, etc.)
  - Payment method selection with encrypted preferences
  - Email/Password credentials
  - Uses UnifiedAuthService for backend
  - BlocListener for UnifiedAuthBloc.Authenticated state
Key Method: _handleRegistration() (line 730)
  - Calls UnifiedAuthService.signUp()
  - Auto sign-in via UnifiedAuthBloc.add(SignInRequested())
Navigation: popUntil((route) => route.isFirst) - line 824
  - Pops back to login screen
  - AuthWrapper automatically shows dashboard when AuthBloc detects Firebase user
```

#### ✅ **SCREEN 3: Dashboard**
```dart
File: pharmacy_app/lib/screens/main/dashboard_screen.dart (pharmacy)
File: courier_app/lib/screens/main/dashboard_screen.dart (courier)
Status: ✅ ACTIVE - App-specific dashboards
Purpose: Main app dashboard after successful registration
Navigation: Shown by AuthWrapper when AuthBloc emits AuthAuthenticated
```

---

### **Authentication Services**

#### ✅ **Unified Auth Service**
```dart
File: shared/lib/services/unified_auth_service.dart
Status: ✅ ACTIVE - Shared backend service
Purpose: Backend service for registration/authentication
Key Methods:
  - signUp() - Creates Firebase Auth user + Firestore documents
  - signIn() - Authenticates user and loads profile
  - getUserProfile() - Loads user data from Firestore
Features:
  - Multi-role support (pharmacy, courier, admin)
  - Encrypted payment preferences
  - Multi-country support
```

#### ✅ **App-Specific Auth Service**
```dart
File: pharmacy_app/lib/services/auth_service.dart (pharmacy)
File: courier_app/lib/services/auth_service.dart (courier)
Status: ✅ ACTIVE - App-specific wrappers
Purpose: App-specific authentication logic
Key Feature: Wraps UnifiedAuthService for app-specific needs
```

---

### **State Management (BLoC)**

#### ✅ **UnifiedAuthBloc**
```dart
File: pharmapp_unified/lib/blocs/unified_auth_bloc.dart
Status: ✅ ACTIVE - Used during registration flow
Purpose: Manages authentication state during unified registration
Events:
  - SignInRequested - Auto-triggered after successful registration
States:
  - Authenticated - Triggers navigation via BlocListener
Usage: Provided by PharmacyUnifiedRegistrationEntry/CourierUnifiedRegistrationEntry
```

#### ✅ **App-Specific AuthBloc**
```dart
File: pharmacy_app/lib/blocs/auth_bloc.dart (pharmacy)
File: courier_app/lib/blocs/auth_bloc.dart (courier)
Status: ✅ ACTIVE - Root-level auth state management
Purpose: Manages app-level authentication state
Events:
  - AuthStarted - Dispatched on app start (main.dart line 23)
  - AuthSignInRequested - Manual login
States:
  - AuthAuthenticated - Triggers AuthWrapper to show dashboard
  - AuthUnauthenticated - Shows login screen
Key Feature: AuthStarted checks AuthService.currentUser (Firebase Auth)
  - This is how it detects the new user after registration completes!
```

#### ✅ **AuthWrapper**
```dart
File: pharmacy_app/lib/main.dart lines 40-79 (pharmacy)
File: courier_app/lib/main.dart (courier)
Status: ✅ ACTIVE - Root navigation controller
Purpose: Shows Login vs Dashboard based on AuthBloc state
How It Works:
  - BlocBuilder<AuthBloc, AuthState>
  - if (state is AuthAuthenticated) → shows DashboardScreen
  - if (state is AuthUnauthenticated) → shows LoginScreen
```

---

## ❌ **OBSOLETE APPLICATIONS & FILES**

### **🚫 OBSOLETE: courier_app (Standalone Courier App)**

**Status**: ❌ **OBSOLETE - DO NOT MODIFY** (as of 2025-10-25)
**Replacement**: `pharmapp_unified` is now the master application for courier features

#### **Why It's Obsolete:**
1. **Dashboard fully migrated**: All courier features now in `pharmapp_unified/lib/screens/courier/`
2. **4,913+ lines of code migrated**: Complete delivery system with GPS tracking, QR scanning, payment integration
3. **Firebase Functions integrated**: Courier payment system (createExchangeHold, exchangeCapture, exchangeCancel)
4. **Architecture consistency**: Uses same UnifiedAuthBloc, same navigation patterns as pharmacy
5. **Feature parity achieved**: `pharmapp_unified` has ALL features from standalone courier app

#### **Obsolete Files (DO NOT MODIFY):**

```dart
❌ courier_app/lib/screens/main/dashboard_screen.dart
   Replacement: pharmapp_unified/lib/screens/courier/courier_main_screen.dart
   Status: OBSOLETE - old courier dashboard
   Migration: Complete feature transfer on 2025-10-25 (417 lines in unified app)

❌ courier_app/lib/models/delivery.dart
   Replacement: pharmapp_unified/lib/models/delivery.dart
   Status: OBSOLETE - copied to unified app (288 lines)

❌ courier_app/lib/services/delivery_service.dart
   Replacement: pharmapp_unified/lib/services/delivery_service.dart
   Status: OBSOLETE - copied with Firebase Functions integration (367 lines)

❌ courier_app/lib/services/courier_location_service.dart
   Replacement: pharmapp_unified/lib/services/courier_location_service.dart
   Status: OBSOLETE - copied to unified app (170 lines)

❌ courier_app/lib/screens/deliveries/*.dart (5 screens)
   Replacement: pharmapp_unified/lib/screens/courier/deliveries/*.dart
   Status: OBSOLETE - all delivery screens copied (3,353 lines total)

❌ courier_app/lib/widgets/courier_wallet_widget.dart
   Replacement: pharmapp_unified/lib/widgets/courier/courier_wallet_widget.dart
   Status: OBSOLETE - copied to unified app (371 lines)
```

#### **What to Do if You Need to Modify Courier Features:**

```bash
# ❌ WRONG - Modifying obsolete standalone app
cd courier_app
vim lib/screens/main/dashboard_screen.dart  # DON'T DO THIS!

# ✅ RIGHT - Modify master unified app
cd pharmapp_unified
vim lib/screens/courier/courier_main_screen.dart  # Correct!
```

---

### **🚫 OBSOLETE: pharmacy_app (Standalone Pharmacy App)**

**Status**: ❌ **OBSOLETE - DO NOT MODIFY** (as of 2025-10-24)
**Replacement**: `pharmapp_unified` is now the master application for pharmacy features

#### **Why It's Obsolete:**
1. **Dashboard fully migrated**: All pharmacy features now in `pharmapp_unified/lib/screens/pharmacy/`
2. **Architecture duplicated**: Same UnifiedAuthBloc, same services, same models
3. **Maintenance burden**: Keeping two codebases in sync is error-prone
4. **Feature parity achieved**: `pharmapp_unified` has ALL features from standalone app

#### **Obsolete Files (DO NOT MODIFY):**

```dart
❌ pharmacy_app/lib/screens/main/dashboard_screen.dart
   Replacement: pharmapp_unified/lib/screens/pharmacy/pharmacy_main_screen.dart
   Status: OBSOLETE - old placeholder dashboard (335 lines)
   Migration: Complete feature transfer on 2025-10-24 (1030 lines in unified app)

❌ pharmacy_app/lib/services/payment_service.dart
   Replacement: pharmapp_unified/lib/services/payment_service.dart
   Status: OBSOLETE - copied to unified app

❌ pharmacy_app/lib/services/subscription_*.dart
   Replacement: pharmapp_unified/lib/services/subscription_*.dart
   Status: OBSOLETE - all subscription services copied to unified app

❌ pharmacy_app/lib/widgets/subscription_status_widget.dart
   Replacement: pharmapp_unified/lib/widgets/subscription_status_widget.dart
   Status: OBSOLETE - copied to unified app

❌ pharmacy_app/lib/screens/inventory/inventory_browser_screen.dart
   Replacement: pharmapp_unified/lib/screens/pharmacy/inventory/inventory_browser_screen.dart
   Status: OBSOLETE - copied to unified app

❌ pharmacy_app/lib/screens/exchanges/proposals_screen.dart
   Replacement: pharmapp_unified/lib/screens/pharmacy/exchanges/proposals_screen.dart
   Status: OBSOLETE - copied to unified app

❌ pharmacy_app/lib/screens/profile/profile_screen.dart
   Replacement: pharmapp_unified/lib/screens/pharmacy/profile/profile_screen.dart
   Status: OBSOLETE - copied to unified app

❌ pharmacy_app/lib/models/subscription.dart
   Replacement: pharmapp_unified/lib/models/subscription.dart
   Status: OBSOLETE - copied to unified app
```

#### **What to Do if You Need to Modify Pharmacy Features:**

```bash
# ❌ WRONG - Modifying obsolete standalone app
cd pharmacy_app
vim lib/screens/main/dashboard_screen.dart  # DON'T DO THIS!

# ✅ RIGHT - Modify master unified app
cd pharmapp_unified
vim lib/screens/pharmacy/pharmacy_main_screen.dart  # Correct!
```

---

## ❌ **DELETED FILES - MIGRATION COMPLETE (2025-10-24)**

### **⚠️ Old Authentication System (PERMANENTLY REMOVED)**

#### ❌ **auth_bloc.dart (Pharmacy App)**
```dart
File: pharmacy_app/lib/blocs/auth_bloc.dart
Status: ❌ DELETED - 2025-10-24
Reason: Replaced by UnifiedAuthBloc from pharmapp_unified package
Replacement: Use pharmapp_unified/lib/blocs/unified_auth_bloc.dart
Migration: pharmacy_app now uses UnifiedAuthBloc exclusively
```

#### ❌ **auth_bloc.dart (Courier App)**
```dart
File: courier_app/lib/blocs/auth_bloc.dart
Status: ❌ DELETED - 2025-10-24
Reason: Replaced by UnifiedAuthBloc from pharmapp_unified package
Replacement: Use pharmapp_unified/lib/blocs/unified_auth_bloc.dart
Migration: courier_app now uses UnifiedAuthBloc exclusively
Architecture Fix: Removed duplicate BlocProvider from courier_unified_registration_entry.dart
```

#### ❌ **register_screen.dart**
```dart
File: pharmacy_app/lib/screens/auth/register_screen.dart
Status: ❌ DELETED - 2025-10-24 (previously deprecated 2025-10-23)
Reason: Old single-app registration (before unified system)
Replacement: Use pharmapp_unified/lib/screens/auth/unified_registration_screen.dart
Migration: pharmacy_unified_registration_entry.dart now uses unified screens
```

#### ❌ **registration_navigation_helper.dart**
```dart
File: pharmacy_app/lib/services/registration_navigation_helper.dart
Status: ❌ DELETED - 2025-10-24 (previously deprecated 2025-10-23)
Reason: Caused navigation conflicts with AuthWrapper + duplicate BlocProvider issues
Replacement: No replacement needed - AuthWrapper handles navigation automatically
Architecture Fix: Single BlocProvider in main.dart, navigation via popUntil
```

#### ❌ **register_screen_test.dart**
```dart
File: pharmacy_app/test/screens/register_screen_test.dart
Status: ❌ DELETED - 2025-10-24
Reason: Test file for deleted register_screen.dart
Replacement: Will need new tests for unified registration flow
```

#### ❌ **unified_registration_service.dart**
```dart
File: shared/lib/services/unified_registration_service.dart
Status: ❌ OBSOLETE (likely unused)
Reason: Appears to be legacy code - not imported anywhere
Replacement: Use shared/lib/services/unified_auth_service.dart
Note: Contains similar problematic navigation patterns (pushAndRemoveUntil)
```

---

## 🔍 **HOW TO VERIFY WHICH FILE TO USE**

### **Before Modifying ANY Registration/Auth File:**

1. **Check this document** - Is the file marked as OBSOLETE?
2. **Check file deprecation header** - Does the file have a "⚠️ OBSOLETE FILE" banner?
3. **Check imports** - Run `git grep "import.*filename"` to see if it's actually used
4. **Check login screen** - What does "Sign Up" button navigate to?
   ```dart
   // pharmacy_app/lib/screens/auth/login_screen.dart line 208
   Navigator.push(
     context,
     MaterialPageRoute(
       builder: (context) => const PharmacyUnifiedRegistrationEntry(),
     ),
   );
   ```
5. **Trace the flow** - Follow the navigation chain to confirm

---

## 📊 **NAVIGATION ARCHITECTURE EXPLANATION**

### **Why popUntil((route) => route.isFirst) is CORRECT:**

The unified registration uses `popUntil` (NOT explicit dashboard navigation) because:

1. **Registration completes** → Creates Firebase Auth user
2. **Auto sign-in** → Triggers UnifiedAuthBloc to emit Authenticated
3. **Pop to root** → Returns to login screen
4. **AuthBloc detects new user** → AuthStarted handler checks AuthService.currentUser
5. **AuthBloc emits AuthAuthenticated** → AuthWrapper automatically shows dashboard

**This avoids race conditions** that occur when both:
- Explicit navigation tries to push dashboard
- AuthWrapper tries to show dashboard based on auth state

**The "back button shows dashboard" bug** was caused by explicit navigation COVERING the dashboard that AuthWrapper had already rendered.

---

## ⚠️ **COMMON MISTAKES TO AVOID**

### **Mistake #1: Modifying register_screen.dart**
```
❌ WRONG: "I need to fix registration, let me edit register_screen.dart"
✅ RIGHT: "register_screen.dart is obsolete - edit unified_registration_screen.dart"
```

### **Mistake #2: Adding explicit navigation after registration**
```
❌ WRONG: Navigator.pushAndRemoveUntil(DashboardScreen) in registration helper
✅ RIGHT: Let AuthWrapper handle navigation via AuthBloc state changes
```

### **Mistake #3: Creating separate pharmacy/courier registration screens**
```
❌ WRONG: Duplicate registration screens per app
✅ RIGHT: One UnifiedRegistrationScreen, adapt via userType parameter
```

---

## 📋 **DECISION TREE: Which File Should I Modify?**

```
Need to change registration flow?
├─ Is it app-specific entry point? (e.g., pharmacy vs courier button text)
│  └─ YES → Edit pharmacy_unified_registration_entry.dart or courier_unified_registration_entry.dart
│
├─ Is it country/city selection UI?
│  └─ YES → Edit shared/lib/screens/auth/country_payment_selection_screen.dart
│
├─ Is it the main registration form?
│  └─ YES → Edit pharmapp_unified/lib/screens/auth/unified_registration_screen.dart
│
├─ Is it navigation after registration?
│  └─ YES → DON'T ADD EXPLICIT NAVIGATION! Check AuthWrapper/AuthBloc instead
│
├─ Is it backend registration logic?
│  └─ YES → Edit shared/lib/services/unified_auth_service.dart
│
└─ Is it authentication state management?
   ├─ During registration? → Edit pharmapp_unified/lib/blocs/unified_auth_bloc.dart
   └─ App-level auth? → Edit pharmacy_app/lib/blocs/auth_bloc.dart (or courier equivalent)
```

---

## 🎯 **SUMMARY: ONE WORKFLOW ONLY**

**Pharmacy App Registration:**
```
Login → PharmacyUnifiedRegistrationEntry → CountryPaymentSelectionScreen →
UnifiedRegistrationScreen(userType: pharmacy) → Auto sign-in → Pop to root →
AuthWrapper detects authenticated user → Dashboard
```

**Courier App Registration:**
```
Login → CourierUnifiedRegistrationEntry → CountryPaymentSelectionScreen →
UnifiedRegistrationScreen(userType: courier) → Auto sign-in → Pop to root →
AuthWrapper detects authenticated user → Dashboard
```

**Admin Registration (Future):**
```
Special admin panel → UnifiedRegistrationScreen(userType: admin) → Same flow
```

---

## 📝 **CHANGELOG**

### 2025-10-23 - Complete Rewrite
- **Removed** all references to obsolete register_screen.dart as active
- **Added** comprehensive unified workflow documentation
- **Clarified** pharmacy_unified_registration_entry.dart vs unified_registration_screen.dart
- **Explained** why popUntil navigation is correct (avoids race conditions)
- **Deprecated** register_screen.dart and registration_navigation_helper.dart
- **Added** decision tree for file selection

### Previous
- Original document created with incorrect file classifications
- Lost multiple days modifying wrong files due to incomplete information

---

**Last Reviewed**: 2025-10-23
**Reviewer**: Claude (AI Assistant)
**Status**: Comprehensive - covers all registration/auth files
