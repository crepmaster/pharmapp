# 📚 TESTER'S GUIDE - PharmApp Mobile Testing

**Welcome, Tester!** This guide helps you navigate all testing documentation.

**Last Updated**: 2025-10-21
**Current Status**: Scenario 1 failed, awaiting re-test after fixes

---

## 🚀 QUICK START

**If you're here for the NEXT testing session**:

1. **READ FIRST**: [NEXT_SESSION_PREPARATION.md](NEXT_SESSION_PREPARATION.md) ⭐
   - Everything you need to prepare for re-test
   - Firebase cleanup instructions
   - Fresh test data
   - Pre-test checklist

2. **THEN READ**: [URGENT_ACTION_REQUIRED.md](../../URGENT_ACTION_REQUIRED.md) ⚡
   - Critical API key fix (5 minutes)
   - Must be done before any testing

3. **THEN EXECUTE**: Follow Scenario 1 re-test steps

---

## 📋 DOCUMENT INDEX

### 🔴 URGENT - Read These First

| Document | Purpose | When to Read |
|----------|---------|--------------|
| [URGENT_ACTION_REQUIRED.md](../../URGENT_ACTION_REQUIRED.md) | API key fix guide (5 min) | **NOW - Before any testing** |
| [NEXT_SESSION_PREPARATION.md](NEXT_SESSION_PREPARATION.md) | Re-test preparation guide | **Before next session** |
| [NEXT_SESSION_TEST_PLAN.md](NEXT_SESSION_TEST_PLAN.md) | Master test plan (5 scenarios) | **During testing** |

### 📊 PREVIOUS TEST RESULTS

| Document | Purpose | When to Read |
|----------|---------|--------------|
| [SESSION_SUMMARY_2025-10-21.md](SESSION_SUMMARY_2025-10-21.md) | Complete session summary | To understand what happened |
| [SCENARIO_1_TEST_FAILURE_REPORT.md](SCENARIO_1_TEST_FAILURE_REPORT.md) | Detailed failure analysis | To understand why it failed |

### 🔧 FIX DOCUMENTATION

| Document | Purpose | When to Read |
|----------|---------|--------------|
| [SETUP_FIREBASE_ANDROID.md](../../SETUP_FIREBASE_ANDROID.md) | API key setup guide | If URGENT_ACTION doesn't work |
| [FIXES_REQUIRED_FOR_SCENARIO_1.md](FIXES_REQUIRED_FOR_SCENARIO_1.md) | All fixes needed | For developers (not tester) |
| [CODE_REVIEW_REQUEST_2025-10-21.md](CODE_REVIEW_REQUEST_2025-10-21.md) | Code review results | For context (optional) |

### 📖 QUICK REFERENCES

| Document | Purpose | When to Read |
|----------|---------|--------------|
| [SCENARIO_2_MANUAL_CHECKLIST.md](SCENARIO_2_MANUAL_CHECKLIST.md) | Courier registration test | After Scenario 1 passes |
| [SCENARIO_2_QUICK_REFERENCE.md](SCENARIO_2_QUICK_REFERENCE.md) | One-page courier test guide | During Scenario 2 test |
| [HOW_TO_RUN_APPS.md](HOW_TO_RUN_APPS.md) | App launch instructions | Reference during testing |
| [STEP_0_START_EMULATOR.md](STEP_0_START_EMULATOR.md) | Emulator startup guide | If emulator not running |

---

## 🎯 YOUR TESTING WORKFLOW

### Phase 1: Preparation (10 minutes)

```
┌─────────────────────────────────────┐
│ 1. Read URGENT_ACTION_REQUIRED.md  │ ⚡ Fix API key
│ 2. Run firebase login               │
│ 3. Run flutterfire configure        │
│ 4. Read NEXT_SESSION_PREPARATION.md │ 📋 Prepare for test
│ 5. Clean Firebase (delete old data) │ 🧹 Fresh start
│ 6. Prepare fresh test data          │ 📝 New email
└─────────────────────────────────────┘
```

### Phase 2: Scenario 1 Re-Test (25 minutes)

```
┌─────────────────────────────────────┐
│ 1. Start emulator                   │ 🖥️  STEP 0
│ 2. Launch pharmacy_app              │ 🚀 flutter run
│ 3. Complete registration flow       │ 📝 Fill all fields
│ 4. Verify success (no errors)       │ ✅ Dashboard appears
│ 5. Check Firebase (auth + firestore)│ 🔍 Verify data
│ 6. Capture all screenshots          │ 📸 Evidence
└─────────────────────────────────────┘
```

### Phase 3: Scenario 2 Test (25 minutes)

```
┌─────────────────────────────────────┐
│ 1. Launch courier_app               │ 🚴 Green theme
│ 2. Complete courier registration    │ 📝 Vehicle info
│ 3. Verify success                   │ ✅ Dashboard
│ 4. Check Firebase verification      │ 🔍 Encrypted data
│ 5. Capture screenshots              │ 📸 Evidence
└─────────────────────────────────────┘
```

---

## 📁 FILE LOCATIONS

### Where to Find Things:

**Testing Documentation**:
```
docs/testing/
├── README_TESTER.md (this file) ← YOU ARE HERE
├── NEXT_SESSION_PREPARATION.md  ← Read before re-test
├── NEXT_SESSION_TEST_PLAN.md    ← Master test plan
├── SCENARIO_1_TEST_FAILURE_REPORT.md
├── SCENARIO_2_MANUAL_CHECKLIST.md
├── evidence/
│   └── screenshots/
│       ├── scenario1_retest_2025-10-21/ ← Create this for next test
│       └── scenario2/ ← Create this for Scenario 2
└── reports/
```

**Critical Fixes**:
```
c:\Users\aebon\projects\pharmapp-mobile\
├── URGENT_ACTION_REQUIRED.md    ← API key fix (READ NOW!)
└── SETUP_FIREBASE_ANDROID.md    ← Detailed API key guide
```

**Test Apps**:
```
pharmacy_app/   ← Scenario 1 (Blue theme)
courier_app/    ← Scenario 2 (Green theme)
admin_panel/    ← Scenarios 3-5 (Web admin)
```

---

## 🚨 COMMON ISSUES & SOLUTIONS

### Issue: "API key not valid" Error

**Symptom**: Registration fails with API key error

**Solution**:
1. Read: [URGENT_ACTION_REQUIRED.md](../../URGENT_ACTION_REQUIRED.md)
2. Run: `firebase login`
3. Run: `flutterfire configure --project=mediexchange`
4. Rebuild: `flutter clean && flutter pub get`

**Doc**: [SETUP_FIREBASE_ANDROID.md](../../SETUP_FIREBASE_ANDROID.md)

---

### Issue: "Email already in use"

**Symptom**: Cannot register with same email

**Solution**:
1. Open Firebase Console: https://console.firebase.google.com/project/mediexchange
2. Go to Authentication → Users
3. Delete the existing user
4. Wait 2-3 minutes
5. Use fresh email or retry

**Doc**: [NEXT_SESSION_PREPARATION.md](NEXT_SESSION_PREPARATION.md) (Firebase Cleanup section)

---

### Issue: "No devices found"

**Symptom**: `flutter run` says no emulator

**Solution**:
```bash
# Check if emulator running
adb devices

# If not running, start it
emulator -avd Pixel_9a

# Wait 1-2 minutes, verify
adb devices  # Should show: emulator-5554   device
```

**Doc**: [STEP_0_START_EMULATOR.md](STEP_0_START_EMULATOR.md)

---

### Issue: City dropdown not appearing

**Symptom**: After selecting country, no city dropdown

**Status**: Feature may not be implemented yet

**Solution**: Report to developer, city selection UI needs implementation

**Doc**: [FIXES_REQUIRED_FOR_SCENARIO_1.md](FIXES_REQUIRED_FOR_SCENARIO_1.md) (Fix #2)

---

### Issue: Phone asked twice

**Symptom**: Enter phone in payment screen AND registration form

**Status**: Known UX issue, fix planned

**Workaround**: Enter the same phone number in both places

**Doc**: [FIXES_REQUIRED_FOR_SCENARIO_1.md](FIXES_REQUIRED_FOR_SCENARIO_1.md) (Fix #3)

---

## ✅ SUCCESS CRITERIA

### How to Know Tests Are Passing:

**Scenario 1 PASSES when**:
- ✅ Registration completes without errors
- ✅ App shows dashboard (not error message)
- ✅ Firebase Authentication has new user
- ✅ Firestore pharmacy document created
- ✅ Wallet created with 0 XAF balance
- ✅ Payment phone encrypted (no plaintext "677123456")
- ✅ City field populated (if implemented)

**Scenario 2 PASSES when**:
- ✅ Courier registration completes
- ✅ Firebase Authentication has courier user
- ✅ Firestore courier document created
- ✅ Wallet created for courier
- ✅ Vehicle info stored correctly
- ✅ Payment phone encrypted (Orange Money)

---

## 📊 TESTING STATUS TRACKER

### Current Status (2025-10-21):

| Scenario | Status | Notes |
|----------|--------|-------|
| **Scenario 1: Pharmacy Registration** | ❌ FAILED | 3 issues identified, fixes ready |
| **Scenario 2: Courier Registration** | ⏸️ BLOCKED | Awaiting Scenario 1 pass |
| **Scenario 3: Wallet Functionality** | ⏸️ BLOCKED | Awaiting Scenario 1 pass |
| **Scenario 4: Medicine Exchange** | ⏸️ BLOCKED | Awaiting Scenario 1 pass |
| **Scenario 5: Courier Delivery** | ⏸️ BLOCKED | Awaiting Scenario 2 pass |

**Overall Progress**: 0/5 scenarios passed

**Blocking Issue**: API key (fix in 5 minutes with [URGENT_ACTION_REQUIRED.md](../../URGENT_ACTION_REQUIRED.md))

---

## 🎯 TESTING GOALS

### Short-term Goals (This Week):
- [ ] Fix API key issue (5 min - USER ACTION)
- [ ] Implement city selection (30 min - DEVELOPER)
- [ ] Implement phone auto-populate (15 min - DEVELOPER)
- [ ] Re-test Scenario 1 → ✅ PASS
- [ ] Test Scenario 2 → ✅ PASS

### Medium-term Goals (Next Week):
- [ ] Test Scenario 3: Wallet top-up and balance
- [ ] Test Scenario 4: Medicine exchange flow
- [ ] Test Scenario 5: Courier delivery with GPS

### Long-term Goals (This Month):
- [ ] Complete all 5 scenarios
- [ ] Verify security (payment encryption)
- [ ] Performance testing
- [ ] Ready for production deployment

---

## 🔐 SECURITY TESTING CHECKLIST

**CRITICAL - Must Verify Every Test**:

### Payment Phone Encryption:
- [ ] Search Firestore for plaintext phone (Ctrl+F)
- [ ] Should find **ZERO MATCHES**
- [ ] Verify `encryptedPhone` field exists
- [ ] Verify `phoneHash` field exists
- [ ] Verify `maskedPhone` shows "677****56" format

### Firebase Rules:
- [ ] Cannot access other pharmacies' data
- [ ] Cannot modify payment preferences directly
- [ ] Test numbers blocked in production

**If you find plaintext phone** → 🚨 **PRODUCTION BLOCKER - STOP AND REPORT**

---

## 📞 NEED HELP?

### Documentation Navigation:
- **Can't find a document?** Check this index (you are here)
- **Don't know what to do next?** Read [NEXT_SESSION_PREPARATION.md](NEXT_SESSION_PREPARATION.md)
- **Stuck on error?** Check "Common Issues" section above

### Technical Issues:
- **API key problems**: [URGENT_ACTION_REQUIRED.md](../../URGENT_ACTION_REQUIRED.md)
- **Emulator problems**: [STEP_0_START_EMULATOR.md](STEP_0_START_EMULATOR.md)
- **App won't run**: [HOW_TO_RUN_APPS.md](HOW_TO_RUN_APPS.md)

### Test Execution:
- **Scenario 1 help**: [NEXT_SESSION_TEST_PLAN.md](NEXT_SESSION_TEST_PLAN.md) (Scenario 1 section)
- **Scenario 2 help**: [SCENARIO_2_MANUAL_CHECKLIST.md](SCENARIO_2_MANUAL_CHECKLIST.md)
- **Quick reference**: [SCENARIO_2_QUICK_REFERENCE.md](SCENARIO_2_QUICK_REFERENCE.md)

---

## 🎓 TESTING BEST PRACTICES

### Before Each Test:
1. ✅ Read the test plan for that scenario
2. ✅ Verify emulator is running
3. ✅ Prepare fresh test data
4. ✅ Create screenshots folder
5. ✅ Review previous test notes

### During Each Test:
1. 📸 Capture screenshots at EVERY step
2. 📝 Note any unexpected behavior
3. ⏱️ Record test duration
4. 🔍 Verify Firebase data immediately
5. 🔒 Check security (encrypted data)

### After Each Test:
1. 📊 Update test reports
2. 📁 Archive evidence
3. ✅ Mark test as passed/failed
4. 📝 Document any issues
5. 🚀 Prepare for next scenario

---

## 🏁 FINAL CHECKLIST

**Before Starting ANY Testing Session**:

- [ ] Read [URGENT_ACTION_REQUIRED.md](../../URGENT_ACTION_REQUIRED.md)
- [ ] API key fixed (flutterfire configure completed)
- [ ] Emulator verified working (adb devices)
- [ ] Firebase Console open in browser
- [ ] Test data prepared
- [ ] Screenshots folder created
- [ ] Know which scenario testing today
- [ ] Read that scenario's test plan

**When ALL items checked** → ✅ **READY TO TEST**

---

## 📈 PROGRESS TRACKING

### Track Your Testing Sessions:

**Session 1 (2025-10-21)**: ❌ Scenario 1 FAILED
- Issues: API key, no city, duplicate phone
- Evidence: [SESSION_SUMMARY_2025-10-21.md](SESSION_SUMMARY_2025-10-21.md)

**Session 2 (Next)**: ⏳ Scenario 1 RE-TEST
- Goal: Pass Scenario 1 with fixes
- Prep: [NEXT_SESSION_PREPARATION.md](NEXT_SESSION_PREPARATION.md)

**Session 3 (Future)**: ⏳ Scenario 2
- Goal: Courier registration
- Prep: [SCENARIO_2_MANUAL_CHECKLIST.md](SCENARIO_2_MANUAL_CHECKLIST.md)

---

## ✨ TIPS FOR EFFICIENT TESTING

1. **Use Two Monitors**: Firebase Console on one, emulator on another
2. **Copy-Paste Test Data**: Use the ready-made test data in docs
3. **Screenshot Naming**: Use consistent names (01_step_name.png)
4. **Take Notes**: Document any unusual behavior immediately
5. **Verify as You Go**: Check Firebase after EACH registration
6. **Clean Between Tests**: Always delete previous test data

---

**You're all set! Start with [NEXT_SESSION_PREPARATION.md](NEXT_SESSION_PREPARATION.md) when ready to test.** 🚀

**Good luck with testing!**

---

**Document Version**: 1.0
**Last Updated**: 2025-10-21
**Next Review**: After Scenario 1 re-test

**Quick Links**:
- 🔴 [URGENT_ACTION_REQUIRED.md](../../URGENT_ACTION_REQUIRED.md) - Fix API key NOW
- 📋 [NEXT_SESSION_PREPARATION.md](NEXT_SESSION_PREPARATION.md) - Prepare for re-test
- 📖 [NEXT_SESSION_TEST_PLAN.md](NEXT_SESSION_TEST_PLAN.md) - Master test plan
- 📊 [SESSION_SUMMARY_2025-10-21.md](SESSION_SUMMARY_2025-10-21.md) - Previous results
