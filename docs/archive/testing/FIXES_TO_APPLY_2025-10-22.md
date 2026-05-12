# REGRESSION FIXES - READY TO APPLY

## Overview
Two code changes needed to fix the regressions identified during testing.

---

## FIX #1: Wallet Balance Real-time Refresh ⭐ CRITICAL

**File**: `pharmacy_app/lib/screens/main/dashboard_screen.dart`
**Lines**: 118-130
**Priority**: HIGH (Blocks wallet testing)

### Current Code (BROKEN - FutureBuilder):
```dart
// Wallet Balance Section
Container(
  padding: const EdgeInsets.all(12),
  decoration: BoxDecoration(
    color: Colors.grey[50],
    borderRadius: BorderRadius.circular(8),
    border: Border.all(color: Colors.grey[200]!),
  ),
  child: FutureBuilder<Map<String, dynamic>>(
    future: PaymentService.getWalletBalance(
      userId: FirebaseAuth.instance.currentUser!.uid,
    ),
    builder: (context, snapshot) {
      if (snapshot.connectionState == ConnectionState.waiting) {
```

### New Code (FIXED - StreamBuilder):
```dart
// Wallet Balance Section with Real-time Updates
Container(
  padding: const EdgeInsets.all(12),
  decoration: BoxDecoration(
    color: Colors.grey[50],
    borderRadius: BorderRadius.circular(8),
    border: Border.all(color: Colors.grey[200]!),
  ),
  child: StreamBuilder<DocumentSnapshot>(
    stream: FirebaseFirestore.instance
        .collection('wallets')
        .doc(FirebaseAuth.instance.currentUser!.uid)
        .snapshots(),
    builder: (context, snapshot) {
      if (snapshot.connectionState == ConnectionState.waiting) {
```

### Also Update the Data Extraction (Lines ~191-193):
**Current Code**:
```dart
final wallet = snapshot.data ?? {};
final available = wallet['available'] ?? 0;
final held = wallet['held'] ?? 0;
```

**New Code**:
```dart
// Extract data from Firestore DocumentSnapshot
final data = snapshot.data?.data() as Map<String, dynamic>?;
if (data == null) {
  return const Text('Wallet not found');
}
final available = data['available'] ?? 0;
final held = data['held'] ?? 0;
```

### Why This Works:
- ✅ Stream automatically updates when Firestore data changes
- ✅ After Top Up, wallet document updates trigger automatic UI refresh
- ✅ No manual refresh needed
- ✅ Real-time balance updates

---

## FIX #2: Navigation After Registration

**File**: `pharmapp_unified/lib/screens/auth/unified_registration_screen.dart`
**Lines**: 822-825
**Priority**: MEDIUM (User can still logout/login as workaround)

### Current Code (INCOMPLETE):
```dart
void _navigateToDashboard(UserType userType) {
  // Pop back to root - BlocBuilder will show dashboard for authenticated user
  Navigator.of(context).popUntil((route) => route.isFirst);
}
```

### Analysis:
The current code pops back to the first route (login screen), but the root BlocBuilder doesn't automatically detect the auth state change and show the dashboard. This is because:

1. The `popUntil` returns to login screen
2. The BlocBuilder at root doesn't rebuild
3. User stays stuck on login instead of seeing dashboard

### Recommended Solutions:

**OPTION A - Force Navigation (Simplest)**:
```dart
void _navigateToDashboard(UserType userType) {
  // Clear entire navigation stack and return to root
  // The root BlocBuilder will detect auth state change
  Navigator.of(context).popUntil((route) => route.isFirst);

  // Give the bloc time to emit the new state
  // Then pop one more time to force rebuild
  Future.delayed(const Duration(milliseconds: 100), () {
    if (mounted && Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }
  });
}
```

**OPTION B - Explicit State Trigger** (Requires checking if AuthBloc has this event):
```dart
void _navigateToDashboard(UserType userType) {
  // Trigger auth state refresh to force BlocBuilder rebuild
  context.read<UnifiedAuthBloc>().add(CheckAuthenticationStatus());

  // Then pop to root
  Navigator.of(context).popUntil((route) => route.isFirst);
}
```

**OPTION C - Complete Stack Replacement** (Most robust):
```dart
void _navigateToDashboard(UserType userType) {
  // Remove ALL routes and let root handle navigation
  Navigator.of(context).pushNamedAndRemoveUntil(
    '/', // Root route
    (route) => false, // Remove all previous routes
  );
}
```

### Recommended: Use OPTION C
This completely resets the navigation stack and forces the root widget to rebuild, which should trigger the BlocBuilder to show the appropriate dashboard.

---

## Testing Instructions

### Test Fix #1 (Wallet StreamBuilder):

1. **Stop Flutter**:
   ```bash
   # Kill all running Flutter processes
   taskkill /IM dart.exe /F
   taskkill /IM flutter.exe /F
   ```

2. **Apply the StreamBuilder fix** to `dashboard_screen.dart`

3. **Rebuild and Run**:
   ```bash
   cd pharmacy_app
   flutter clean
   flutter pub get
   flutter run -d emulator-5554
   ```

4. **Test Wallet Refresh**:
   - Login as `test1@pharma.com` or `09092025@promoshake.net`
   - Note current balance (should be 25,000 XAF)
   - Click "Top Up" → Enter 10,000 XAF → Submit
   - **VERIFY**: Balance updates to 35,000 XAF immediately (NO logout/login needed)

**Expected Result**: ✅ Balance refreshes automatically after Top Up

---

### Test Fix #2 (Navigation):

1. **Apply navigation fix** to `unified_registration_screen.dart` (Choose Option C)

2. **Rebuild**:
   ```bash
   cd pharmapp_unified
   flutter clean
   flutter pub get
   cd ../pharmacy_app
   flutter clean
   flutter pub get
   flutter run -d emulator-5554
   ```

3. **Test Registration Flow**:
   - Start app → Click "Register"
   - Fill form with new test data
   - Submit registration
   - **VERIFY**: Immediately see pharmacy dashboard (NOT login screen)

**Expected Result**: ✅ Auto-navigation to dashboard after registration

---

## Files Modified Summary

| File | Lines Changed | Type | Priority |
|------|--------------|------|----------|
| `pharmacy_app/lib/screens/main/dashboard_screen.dart` | 118-193 | StreamBuilder | CRITICAL |
| `pharmapp_unified/lib/screens/auth/unified_registration_screen.dart` | 822-825 | Navigation | MEDIUM |

## Estimated Time
- **Applying Fixes**: 15 minutes
- **Testing Both**: 30 minutes
- **Total**: 45 minutes

## Success Criteria
- ✅ Wallet balance updates in real-time after Top Up
- ✅ Registration automatically navigates to dashboard
- ✅ No logout/login required for either flow
- ✅ Code reviewer approval: 9/10 score

---

**Created**: 2025-10-22
**Code Reviewer**: pharmapp-reviewer agent
**Status**: Ready to Apply
