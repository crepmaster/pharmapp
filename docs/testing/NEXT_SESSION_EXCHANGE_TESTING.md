# Exchange Workflow Testing Plan - Next Session

> ⚠️ **STALE (2026-05-14, Sprint 5 truth cleanup)** — ce plan référence
> `createExchangeHold` / `exchangeCapture` comme functions actives, ce qui
> n'est plus le cas depuis la migration vers `createExchangeProposal` +
> `acceptExchangeProposal` + `completeExchangeDelivery` (Bloc 1/2). Ces
> trois HTTP endpoints legacy survivent dans `index.ts` mais ne sont
> jamais appelés par l'UI (dead code, voir TD-LEGACY-PHARMACY-HTTP-RETIREMENT
> dans `CLAUDE.md`).
>
> **Pour la recette E2E courante, utiliser** :
> [`docs/release/SPRINT_5_E2E_CLOSURE_PLAN.md`](../release/SPRINT_5_E2E_CLOSURE_PLAN.md).
>
> Ce document reste préservé pour traçabilité historique uniquement.

## 🎯 Objective
Test complete peer-to-peer medicine exchange workflow with city-based isolation

## 📋 Prerequisites

### 1. Clean Firebase Database
- Delete all existing test users
- Clean wallets, ledger, exchanges collections
- Keep city configurations intact

### 2. Create Test Accounts

#### Douala, Cameroon (City 1)
1. **Pharmacy A (Buyer)**
   - Email: `pharmacyA@gmail.com`
   - Password: `test1234`
   - City: Douala
   - Name: Pharmacy Centrale Douala
   - Address: Avenue de la Liberté, Douala
   - **Action**: Credit wallet with 100,000 XAF via sandbox

2. **Pharmacy B (Seller)**
   - Email: `pharmacyB@gmail.com`
   - Password: `test1234`
   - City: Douala
   - Name: Pharmacie du Marché
   - Address: Marché Central, Douala
   - **Action**: Credit wallet with 50,000 XAF via sandbox
   - **Action**: Add inventory (Paracetamol 500mg, 100 tablets, 50,000 XAF)

3. **Courier C (Delivery)**
   - Email: `courierC@gmail.com`
   - Password: `test1234`
   - Operating City: Douala
   - Name: Jean Dupont
   - Vehicle: Motorcycle
   - License Plate: DLA-1234-A
   - **Initial wallet**: 0 XAF (will receive delivery fees)

#### Yaoundé, Cameroon (City 2 - Isolation Test)
4. **Pharmacy D (Different City)**
   - Email: `pharmacyD@gmail.com`
   - Password: `test1234`
   - City: Yaoundé
   - Name: Pharmacie de l'Etoile
   - Address: Centre Ville, Yaoundé
   - **Action**: Credit wallet with 75,000 XAF via sandbox
   - **Action**: Add inventory (Paracetamol 500mg, 50 tablets, 45,000 XAF)

## 🧪 Test Scenarios

### Scenario 1: City Isolation Verification
**Test**: Pharmacy A searches for Paracetamol

**Expected Results**:
- ✅ **SHOULD SEE**: Pharmacy B's Paracetamol (Douala) - 50,000 XAF
- ❌ **SHOULD NOT SEE**: Pharmacy D's Paracetamol (Yaoundé) - 45,000 XAF

**Success Criteria**:
- Search results filtered by city
- Only Douala pharmacies visible to Pharmacy A
- No cross-city medicine visibility

---

### Scenario 2: Reverse City Isolation
**Test**: Pharmacy D searches for Paracetamol

**Expected Results**:
- ✅ **SHOULD SEE**: Their own inventory (Yaoundé)
- ❌ **SHOULD NOT SEE**: Pharmacy B's inventory (Douala)

**Success Criteria**:
- Yaoundé pharmacy sees ZERO results from Douala
- City-based filtering works bidirectionally

---

### Scenario 3: Exchange Workflow (Same City)
**Test**: Complete exchange from Pharmacy A to Pharmacy B

#### Step 1: Create Exchange Request
- **Actor**: Pharmacy A (Buyer)
- **Action**: Request Paracetamol from Pharmacy B
- **Medicine Cost**: 50,000 XAF
- **Courier Fee**: 6,000 XAF (3,000 XAF each pharmacy)

**Expected**:
- ✅ Exchange proposal created
- ✅ Pharmacy A wallet: 100,000 → 97,000 available + 3,000 held
- ✅ Status: "pending_acceptance"

#### Step 2: Accept Exchange
- **Actor**: Pharmacy B (Seller)
- **Action**: Accept exchange request

**Expected**:
- ✅ Exchange status: "accepted"
- ✅ Pharmacy B wallet: 50,000 → 47,000 available + 3,000 held
- ✅ Total held: 6,000 XAF (3,000 + 3,000)

#### Step 3: Courier Accepts Delivery
- **Actor**: Courier C
- **Action**: Accept delivery assignment
- **Location**: Douala only

**Expected**:
- ✅ Courier sees delivery in their city (Douala)
- ✅ Delivery status: "in_transit"
- ✅ Courier wallet: Still 0 XAF (paid on completion)

#### Step 4: Pickup Confirmation
- **Actor**: Courier C
- **Action**: Confirm pickup from Pharmacy B

**Expected**:
- ✅ Status: "picked_up"
- ✅ Timestamp recorded
- ✅ No wallet changes yet

#### Step 5: Delivery Completion
- **Actor**: Courier C
- **Action**: Confirm delivery to Pharmacy A

**Expected - Wallet Changes**:
- ✅ **Pharmacy A**: 97,000 - 50,000 (medicine) = **47,000 XAF**
- ✅ **Pharmacy B**: 47,000 + 50,000 (sale) = **97,000 XAF**
- ✅ **Courier C**: 0 + 6,000 (delivery fee) = **6,000 XAF**

**Expected - Ledger Entries**:
- ✅ Pharmacy A: `hold_release` (3,000), `pharmaceutical_purchase` (50,000)
- ✅ Pharmacy B: `hold_release` (3,000), `pharmaceutical_sale` (50,000)
- ✅ Courier C: `courier_payment` (6,000)

**Expected - Inventory Changes**:
- ✅ Pharmacy B: Paracetamol quantity: 100 → 0 tablets
- ✅ Pharmacy A: Receives 100 tablets of Paracetamol

---

### Scenario 4: Courier City Restriction
**Test**: Courier C views available deliveries

**Expected Results**:
- ✅ **SEES**: Deliveries within Douala only
- ❌ **DOES NOT SEE**: Any deliveries involving Yaoundé
- ✅ Operating city filter enforced

---

## 📊 Final Balance Verification

### After Complete Exchange Workflow:

| User | Initial Balance | Medicine Cost | Courier Fee Share | Final Balance |
|------|----------------|---------------|-------------------|---------------|
| **Pharmacy A** | 100,000 XAF | -50,000 XAF | -3,000 XAF | **47,000 XAF** |
| **Pharmacy B** | 50,000 XAF | +50,000 XAF | -3,000 XAF | **97,000 XAF** |
| **Courier C** | 0 XAF | - | +6,000 XAF | **6,000 XAF** |
| **Pharmacy D** | 75,000 XAF | - | - | **75,000 XAF** (unchanged) |

**Total System Balance**: 47,000 + 97,000 + 6,000 + 75,000 = **225,000 XAF** ✅

---

## 🔍 What to Test

### Frontend Features:
1. ✅ City-based medicine search filtering
2. ✅ Exchange proposal creation
3. ✅ Exchange acceptance workflow
4. ✅ Courier delivery assignment (city-restricted)
5. ✅ Wallet balance updates (real-time)
6. ✅ Ledger transaction history
7. ✅ Inventory quantity updates

### Backend Functions:
1. ✅ `createExchangeHold` - Holds courier fees
2. ✅ `exchangeCapture` - Processes medicine payment + courier payment
3. ✅ `getWallet` - Real-time balance retrieval
4. ✅ City-based query filtering (Firestore)

### Security Validation:
1. ✅ Cannot create exchange with pharmacy in different city
2. ✅ Cannot assign courier from different city
3. ✅ Cannot bypass city restrictions via API calls
4. ✅ Insufficient funds handled gracefully

---

## 🚨 Known Issues to Verify Fixed

1. **Login Navigation**: ✅ Fixed - No back button needed
2. **Sandbox Credit**: ✅ Fixed - Gmail accounts allowed
3. **Sandbox Debit**: ✅ Fixed - Withdraw function deployed

---

## 📝 Testing Checklist

### Pre-Testing:
- [ ] Clean Firebase database
- [ ] Create 4 test accounts (3 pharmacies + 1 courier)
- [ ] Credit wallets via sandbox (A: 100k, B: 50k, D: 75k)
- [ ] Add inventory to Pharmacy B and D

### City Isolation Tests:
- [ ] Pharmacy A searches - sees only Douala results
- [ ] Pharmacy D searches - sees only Yaoundé results
- [ ] Courier C sees only Douala deliveries

### Exchange Workflow Tests:
- [ ] Create exchange request (Pharmacy A → B)
- [ ] Verify courier fee hold (3,000 each)
- [ ] Accept exchange (Pharmacy B)
- [ ] Assign courier (Courier C)
- [ ] Confirm pickup
- [ ] Confirm delivery
- [ ] Verify final balances match expected

### Edge Cases:
- [ ] Insufficient wallet balance (try exchange with low funds)
- [ ] Cross-city exchange attempt (should fail)
- [ ] Courier from wrong city (should not see delivery)
- [ ] Cancel exchange (test refund logic)

---

## 🎯 Success Criteria

**Test is successful if**:
1. ✅ City isolation works perfectly (no cross-city visibility)
2. ✅ Complete exchange workflow executes without errors
3. ✅ All wallet balances match expected values
4. ✅ Ledger entries created correctly
5. ✅ Inventory updates properly
6. ✅ Courier restricted to their operating city
7. ✅ Security validations prevent unauthorized actions

---

## 📸 Evidence Collection

During testing, capture:
- [ ] Screenshot: Pharmacy A search results (showing only Douala)
- [ ] Screenshot: Pharmacy D search results (showing only Yaoundé)
- [ ] Screenshot: Exchange proposal created
- [ ] Screenshot: Wallet balances before/after exchange
- [ ] Screenshot: Courier delivery list (city-filtered)
- [ ] Screenshot: Final ledger entries
- [ ] Firestore database snapshots (wallets, exchanges, ledger)

---

## ⏱️ Estimated Time
- **Setup**: 30 minutes (account creation + wallet credits + inventory)
- **City Isolation Tests**: 15 minutes
- **Exchange Workflow**: 30 minutes
- **Verification & Edge Cases**: 15 minutes
- **Total**: ~90 minutes

---

## 🔄 Next Steps After Testing

If all tests pass:
1. Document any bugs found
2. Create production deployment plan
3. Plan user acceptance testing (UAT)
4. Prepare for beta launch

If tests fail:
1. Log detailed error information
2. Identify root cause
3. Create bug fix tasks
4. Re-test after fixes

---

**Session Date**: Next session
**Tester**: User
**Environment**: Firebase Production (`mediexchange`)
**App Version**: pharmapp_unified (master application)
