# Next Session Testing Briefing - 2025-10-22

## 📋 Quick Start Guide for Next Session

**Session Goal**: Complete Infrastructure Validation (Scenarios 3-5)
**Estimated Time**: 45-60 minutes
**Prerequisites**: ✅ All ready (test accounts created, emulator working)

---

## ✅ What We've Already Completed

### Scenario 1: Pharmacy Registration - ✅ PASSED
- Test account created: `testpharmacy2025@promoshake.net`
- Pharmacy profile in Firestore ✅
- Wallet auto-created ✅
- Payment preferences encrypted ✅
- Git commit: `72ffede`

### Scenario 2: Courier Registration - ✅ PASSED
- Test account created: `testcourier2025@promoshake.net`
- Courier profile in Firestore ✅
- Wallet auto-created ✅
- Payment preferences encrypted ✅
- Git commit: `72ffede`

---

## 🎯 Next Session Tasks (Scenarios 3-5)

### Scenario 3: Wallet Functionality (15-20 min)

**What to test**:
1. Use `sandboxCredit` function to add 25,000 XAF to pharmacy wallet
2. Use `sandboxCredit` function to add 10,000 XAF to courier wallet
3. Verify balances in Firestore
4. Verify transactions in ledger collection
5. Check wallet display in pharmacy_app UI
6. Check wallet display in courier_app UI

**Quick Commands**:
```bash
# Credit pharmacy wallet
curl -X POST https://europe-west1-mediexchange.cloudfunctions.net/sandboxCredit \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"testpharmacy2025@promoshake.net\", \"amount\": 25000, \"currency\": \"XAF\"}"

# Credit courier wallet
curl -X POST https://europe-west1-mediexchange.cloudfunctions.net/sandboxCredit \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"testcourier2025@promoshake.net\", \"amount\": 10000, \"currency\": \"XAF\"}"
```

**Success Criteria**:
- ✅ Both wallets credited successfully
- ✅ Balances display correctly in apps
- ✅ Transactions recorded in ledger

---

### Scenario 4: Payment Preferences Security (10-15 min)

**What to test**:
1. Check Firestore pharmacy document for encrypted phone
2. Check Firestore courier document for encrypted phone
3. Verify UI shows masked phone (677\*\*\*\*56)
4. Verify operator/prefix validation

**🔴 CRITICAL CHECK**: Phone numbers must be encrypted, NOT plaintext!

**Success Criteria**:
- ✅ Phone numbers encrypted in Firestore
- ✅ UI shows masked display
- ✅ No plaintext phone numbers anywhere

**Blocker**: If phones are plaintext → STOP and fix security issue!

---

### Scenario 5: Firebase Integration (20-25 min)

**What to test**:
1. **Authentication**: Sign in, sign out, password reset
2. **Firestore**: Documents exist, security rules work
3. **Cloud Functions**: Verify deployed and working
4. **Function Logs**: Check for errors

**Quick Commands**:
```bash
# List deployed functions
firebase functions:list --project mediexchange

# Check function logs
firebase functions:log --project mediexchange --limit 50
```

**Success Criteria**:
- ✅ Auth flows working
- ✅ Security rules enforced
- ✅ Functions operational
- ✅ No critical errors in logs

---

## 📊 Evidence to Collect

### Screenshots Needed:
1. Scenario 3:
   - [ ] sandboxCredit curl outputs (2)
   - [ ] Firestore wallet documents (2)
   - [ ] Ledger transactions (2)
   - [ ] Pharmacy app wallet screen
   - [ ] Courier app wallet screen

2. Scenario 4:
   - [ ] Firestore pharmacy paymentPreferences (encrypted)
   - [ ] Firestore courier paymentPreferences (encrypted)
   - [ ] Pharmacy app masked phone display
   - [ ] Courier app masked phone display

3. Scenario 5:
   - [ ] Successful sign in/out
   - [ ] Security rules test (access denied)
   - [ ] Cloud Functions list
   - [ ] Function logs

---

## 🚀 Session Startup Checklist

Before starting tests:

1. **Start Android Emulator**:
   ```bash
   adb devices  # Check if running
   # If not: emulator -avd Pixel_9a
   ```

2. **Verify Firebase Login**:
   ```bash
   firebase login
   firebase projects:list  # Should show mediexchange
   ```

3. **Open Firebase Console**:
   - <https://console.firebase.google.com/project/mediexchange/firestore>
   - Keep this tab open for verification

4. **Review Test Plan**:
   - Read: `docs/testing/NEXT_SESSION_TEST_PLAN.md`
   - Review detailed steps for each scenario

---

## ⚠️ Known Test Accounts

**Pharmacy Account**:
- Email: `testpharmacy2025@promoshake.net`
- Password: [from Scenario 1 registration]
- Payment: MTN Mobile Money (677123456)

**Courier Account**:
- Email: `testcourier2025@promoshake.net`
- Password: [from Scenario 2 registration]
- Payment: Orange Money (694123456)

---

## 🎯 Success/Failure Criteria

### ✅ PROCEED to Business Workflows (Scenarios 6-8) if:
- Wallet operations functional
- Payment preferences encrypted
- Firebase authentication working
- No critical errors

### ❌ DO NOT PROCEED if:
- Wallet balances incorrect
- Phone numbers in plaintext (SECURITY ISSUE!)
- Firebase authentication broken
- Cloud Functions failing

---

## 📝 Test Results Documentation

After testing, create: `docs/testing/INFRASTRUCTURE_TEST_RESULTS_2025-10-22.md`

**Structure**:
- Executive Summary (Pass/Fail counts)
- Scenario 3 Results (wallet testing)
- Scenario 4 Results (payment security)
- Scenario 5 Results (Firebase integration)
- Issues Found
- Recommendations
- Next Steps

---

## 🔄 After Scenarios 3-5 Complete

**If all tests PASS**:
→ Proceed to Scenarios 6-8 (Business Workflows)
→ Medicine management, exchange proposals, courier orders

**If critical issues found**:
→ Fix issues first
→ Re-test failed scenarios
→ Document blockers

---

## 💡 Project Manager's Perspective

**Why these tests matter**:

> "We've successfully built the registration system. Now we need to ensure the infrastructure (wallet, payments, Firebase) is solid before testing if pharmacies can actually exchange medicines. Better to find infrastructure issues now than during complex business flow testing."

**Conservative Approach**: Validate foundation → Test business logic

---

## 📞 Quick Reference Links

- Test Plan: `docs/testing/NEXT_SESSION_TEST_PLAN.md`
- Firebase Console: <https://console.firebase.google.com/project/mediexchange>
- sandboxCredit Function: `https://europe-west1-mediexchange.cloudfunctions.net/sandboxCredit`

---

**Ready to start testing!** 🚀

Follow the detailed steps in `NEXT_SESSION_TEST_PLAN.md` for each scenario.
