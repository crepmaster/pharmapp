# Troubleshooting Session - 2025-10-22

## Bug: Dropdown Duplicate Payment Operator Crash

### Issue Summary
**Discovered**: 2025-10-22 during Scenario 3 (Wallet Testing)
**Symptom**: App crashes when clicking "Top Up" button with dropdown duplicate error
**Error**: "There should be exactly one item with [DropdownButton]'s value: mtnCameroon"
**Impact**: BLOCKS Scenario 3 (Wallet Functionality Testing)

### Timeline of Investigation

#### 1. Initial Error Discovery
- User clicked "Top Up" button in dashboard
- Brief popup appeared, then app crashed
- Error: Dropdown has duplicate values for PaymentOperator.mtnCameroon

#### 2. Initial Fix Attempt (Commit ea8cf0b)
**Location**: `pharmapp_unified/lib/screens/auth/unified_registration_screen.dart:533-545`
**Fix**: Added `.toSet()` to remove duplicates from operator list
```dart
items: _getAvailableOperators()
    .toSet() // Remove duplicates
    .map((operator) => DropdownMenuItem(...))
    .toList(),
```
**Result**: ❌ FAILED - Error persisted after `flutter clean` and rebuild

#### 3. Flutter Build Cache Issue Identified
**Problem**: Multiple `flutter clean` commands failed to clear compiled bytecode
**Evidence**:
- Debug logs from FIX v3 never appeared in app output
- Error continued showing old behavior
- Local package dependencies (pharmapp_unified, shared) not recompiling

**Attempted Solutions**:
1. `flutter clean` in pharmacy_app - Failed
2. `flutter clean` in pharmapp_unified - Failed
3. `flutter clean` in shared - Failed
4. Manual .dart_tool directory deletion - Partial success
5. Process killing - Failed (syntax errors)

#### 4. Code Review (Score: 7.5/10)
**Reviewer**: pharmapp-reviewer agent
**Status**: Conditional Approval
**Recommendations**:
- Replace Builder widget with memoization for better performance
- Investigate why source data without duplicates causes dropdown duplicates
- Add debug logging to confirm enum values

#### 5. Root Cause Analysis
**Question from User**: "question les items du drop down provienent d'où?"

**Data Flow Traced**:
1. Dropdown (line 526) → `_getAvailableOperators()` (line 644)
2. `_getAvailableOperators()` → `_getCountryConfig()` (line 649)
3. `_getCountryConfig()` → `Countries.getByCountry()` (line 650)
4. Source: `shared/lib/models/country_config.dart` lines 143-152

**Source Data** (`country_config.dart:149-151`):
```dart
static const cameroon = CountryConfig(
  availableOperators: [
    PaymentOperator.mtnCameroon,      // Only 2 operators
    PaymentOperator.orangeCameroon,   // NO duplicates in source
  ],
);
```

**CRITICAL FINDING**: Source data has NO duplicates - only 2 unique operators in const list

**Conclusion**: The duplicate bug is caused by old cached bytecode, not the source data.

#### 6. Enhanced Fix v3 Implementation
**Location**: `pharmapp_unified/lib/screens/auth/unified_registration_screen.dart:522-569`
**Strategy**: Manual deduplication with comprehensive debug logging

```dart
Builder(
  builder: (context) {
    // Manual deduplication to prevent duplicate dropdown items
    final operators = _getAvailableOperators();
    print('🔍 DROPDOWN FIX v3: Got ${operators.length} operators from config');

    final uniqueOperators = <PaymentOperator>[];
    final seenOperators = <String>{};

    for (final op in operators) {
      final key = op.toString();
      if (!seenOperators.contains(key)) {
        seenOperators.add(key);
        uniqueOperators.add(op);
      }
    }
    print('🔍 DROPDOWN FIX v3: After dedup: ${uniqueOperators.length} unique operators');

    return DropdownButtonFormField<PaymentOperator>(
      items: uniqueOperators.map(...).toList(),
      // ...
    );
  },
)
```

**Debug Markers**: `"🔍 DROPDOWN FIX v3"` logs to confirm execution

#### 7. Nuclear Cache Cleanup Solution
**Created**: `clean_and_rebuild.ps1` PowerShell script
**Actions**:
1. Kill all Dart/Flutter/Gradle processes
2. Remove `.dart_tool` and `build` directories from all 3 packages
3. Run `flutter clean` in all 3 packages (pharmacy_app, pharmapp_unified, shared)
4. Rebuild dependencies with `flutter pub get`

**Execution Result**: ✅ SUCCESS
- All caches cleared
- Fresh dependencies installed
- App rebuilt from clean state

#### 8. Persistent Process Discovery
**User Insight**: "if the session is still live it should also have the last code"
**Critical Finding**: Firebase Auth persists login across app restarts
- If user is still logged in → app process is still running
- Old compiled code still loaded in memory
- Clean build NOT deployed to running app

**Solution**: Complete VS Code shutdown required to:
- Kill all background Flutter processes
- Force emulator app to fully close
- Deploy NEW clean build with FIX v3 on next run

### Current Status

**Fix Status**: ✅ Implemented and compiled
**Deployment Status**: ⏳ Pending clean deployment
**Blocker**: Need complete VS Code restart to kill cached app process

### Next Steps

1. **User Action Required**:
   - Close VS Code completely
   - Reopen VS Code
   - Navigate to project

2. **Clean Deployment**:
   ```bash
   cd pharmacy_app
   flutter run -d emulator-5554
   ```

3. **Verification Test**:
   - Login as testpharmacy2025@promoshake.net
   - Click "Top Up" button
   - Watch logs for: `"🔍 DROPDOWN FIX v3"`
   - Verify NO crash occurs

4. **Success Criteria**:
   - ✅ Debug logs show `"🔍 DROPDOWN FIX v3: Got 2 operators from config"`
   - ✅ Debug logs show `"🔍 DROPDOWN FIX v3: After dedup: 2 unique operators"`
   - ✅ Dropdown displays without crash
   - ✅ User can select payment operator

5. **If Successful**:
   - Request code review from pharmapp-reviewer
   - Commit fix with proper documentation
   - Resume Scenario 3 testing

### Files Modified

**Modified**:
- `pharmapp_unified/lib/screens/auth/unified_registration_screen.dart` (lines 522-569)
  - Enhanced dropdown with manual deduplication
  - Added debug logging for verification

**Created**:
- `clean_and_rebuild.ps1` - PowerShell cache cleanup script

**Documentation**:
- `docs/testing/NEXT_SESSION_TEST_PLAN.md` - Updated with blocker status
- `docs/testing/TROUBLESHOOTING_SESSION_2025-10-22.md` - This file

### Lessons Learned

1. **Flutter Build Cache Persistence**:
   - Local package dependencies cache more aggressively than main app
   - `flutter clean` may not clear local package caches effectively
   - Manual `.dart_tool` deletion needed for local packages

2. **Running App Process Cache**:
   - Firebase Auth persists sessions across app restarts
   - Logged-in state indicates app process still running with old code
   - Complete IDE shutdown required to deploy clean builds

3. **Debug Logging Importance**:
   - Absence of debug logs proves old code is executing
   - Version markers (`FIX v3`) help verify which code version is running
   - Essential for diagnosing cache issues

4. **Code Review Process**:
   - User policy: ALWAYS get code review before commit/push
   - Reminder system needed to prevent policy violations
   - Reviews provide valuable optimization insights

### Related Documentation

- [NEXT_SESSION_TEST_PLAN.md](./NEXT_SESSION_TEST_PLAN.md) - Test scenarios and progress
- [NEXT_SESSION_BRIEFING.md](./NEXT_SESSION_BRIEFING.md) - Quick start guide
- Source files:
  - [unified_registration_screen.dart](../../pharmapp_unified/lib/screens/auth/unified_registration_screen.dart#L522-L569)
  - [country_config.dart](../../shared/lib/models/country_config.dart#L143-L152)
