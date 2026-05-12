# REGRESSION ANALYSIS - 2025-10-22

## Executive Summary

After fixing the dropdown bugs, TWO CRITICAL REGRESSIONS were identified during user testing:

1. **Navigation Regression**: User NOT automatically logged into dashboard after registration
2. **Wallet Refresh Regression**: Balance does NOT update after Top Up completes

---

## REGRESSION #1: Navigation After Registration

### Problem
- After successful registration, user stays stuck on registration screen
- User must manually logout/login to see dashboard
- Expected: Automatic navigation to dashboard after registration completes

### Root Cause
**File**: `pharmapp_unified/lib/screens/auth/unified_registration_screen.dart:822-825`

```dart
void _navigateToDashboard(UserType userType) {
  // Pop back to root - BlocBuilder will show dashboard for authenticated user
  Navigator.of(context).popUntil((route) => route.isFirst);
}
```

**Issue**: `popUntil((route) => route.isFirst)` pops back to the LOGIN screen, not the dashboard. The root BlocBuilder doesn't automatically rebuild to show the dashboard.

### Code Reviewer's Recommended Fix

**Option 1 - pushAndRemoveUntil (Simple)**:
```dart
void _navigateToDashboard(UserType userType) {
  // Clear all routes and let root app handle dashboard display
  Navigator.of(context).popUntil((route) => route.isFirst);

  // Alternative: Force complete navigation stack reset
  // Navigator.of(context).pushAndRemoveUntil(
  //   MaterialPageRoute(builder: (context) => PharmacyDashboard()),
  //   (route) => false,
  // );
}
```

**Option 2 - Trigger Auth State Refresh**:
```dart
void _navigateToDashboard(UserType userType) {
  // Trigger auth state check to force BlocBuilder rebuild
  context.read<AuthBloc>().add(CheckAuthenticationStatus());
  Navigator.of(context).popUntil((route) => route.isFirst);
}
```

### Testing Steps
1. Start app → Click "Register"
2. Fill registration form
3. Submit
4. **VERIFY**: User immediately sees dashboard (NOT login screen)

---

## REGRESSION #2: Wallet Balance Not Refreshing

### Problem
- After Top Up completes successfully, wallet balance stays at 25,000 XAF
- Expected: Balance should increase to 35,000 XAF (if topped up 10,000 XAF)
- User must logout/login to see updated balance

### Root Cause
**File**: `pharmacy_app/lib/screens/main/dashboard_screen.dart`

**Issue 1 - Static FutureBuilder** (lines 126-130):
```dart
child: FutureBuilder<Map<String, dynamic>>(
  future: PaymentService.getWalletBalance(...), // ❌ Only called ONCE
  builder: (context, snapshot) { ... }
),
```

The Future is evaluated only when the widget first builds. After Top Up, the FutureBuilder does NOT re-run.

**Issue 2 - No Refresh After Top Up** (lines 799-840):
```dart
// After successful Top Up
if (success) {
  await _savePaymentPreferences();
}
// ❌ NO wallet balance refresh here
```

No mechanism to trigger wallet reload after Top Up completes.

### Code Reviewer's Recommended Fix

**RECOMMENDED SOLUTION - StreamBuilder for Real-time Updates**:

```dart
// Replace FutureBuilder with StreamBuilder (lines 126-130)
child: StreamBuilder<DocumentSnapshot>(
  stream: FirebaseFirestore.instance
      .collection('wallets')
      .doc(FirebaseAuth.instance.currentUser!.uid)
      .snapshots(),
  builder: (context, snapshot) {
    if (!snapshot.hasData || snapshot.data == null) {
      return const CircularProgressIndicator();
    }

    final data = snapshot.data!.data() as Map<String, dynamic>?;
    if (data == null) {
      return Text('Wallet not found');
    }

    final available = data['available'] ?? 0;
    final held = data['held'] ?? 0;
    final currency = data['currency'] ?? 'XAF';

    // Display wallet balance UI
    return _buildWalletCard(available, held, currency);
  },
),
```

**Benefits**:
- ✅ Automatic real-time updates when Firestore data changes
- ✅ No manual refresh needed after Top Up
- ✅ Simple implementation (no new files/BLoCs required)
- ✅ Works perfectly with Firebase backend

**Alternative - WalletBloc Pattern**:
See code reviewer's detailed WalletBloc implementation in review report for more complex state management approach.

### Testing Steps
1. Login → Note initial balance (25,000 XAF)
2. Click "Top Up" → Enter 10,000 XAF
3. Submit Top Up
4. **VERIFY**: Balance immediately updates to 35,000 XAF (NO logout/login needed)

---

## Priority & Impact

**Priority**: CRITICAL
**Blocking**: Scenario 3 (Wallet & Payment Infrastructure Testing)

**Impact**:
- ❌ Cannot test complete registration flow
- ❌ Cannot validate wallet top-up functionality
- ❌ Poor user experience (manual logout/login required)

**Estimated Fix Time**: 2-3 hours (both regressions)

---

## Implementation Checklist

### Regression #1 - Navigation:
- [ ] Update `_navigateToDashboard()` method
- [ ] Test registration → dashboard flow
- [ ] Verify dashboard matches user type (pharmacy/courier/admin)

### Regression #2 - Wallet Refresh:
- [ ] Replace FutureBuilder with StreamBuilder
- [ ] Update wallet display logic to use DocumentSnapshot
- [ ] Test Top Up → balance update flow
- [ ] Verify no logout/login needed

### Final Validation:
- [ ] Complete end-to-end test: Register → Login → Top Up → Verify Balance
- [ ] Code review approval
- [ ] Commit both fixes together

---

## Code Reviewer Score

**Current Status**: 7.5/10 (Regressions present)
**After Fixes**: 9/10 (Clean BLoC architecture + real-time updates)

---

**Document Created**: 2025-10-22
**Reviewed By**: pharmapp-reviewer agent
**Status**: Fixes Pending Implementation
