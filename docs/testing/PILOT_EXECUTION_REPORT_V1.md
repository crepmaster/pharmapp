# Pilot Execution Report - Exchange E2E v1

**Date**: 2026-03-15
**HEAD**: b1e897b (stabilized) + pilot fixes
**Executor**: Claude (Developer role)
**Verdict**: **CONDITIONAL PASS** - code fixes applied, backend deployment + manual UI testing required

---

## Summary

Three P0/P1 blockers were discovered during code analysis that would have caused the pilot scenario to fail at runtime. All three have been fixed. The code is now correct for the expected wallet flow (A=47k, B=97k, C=6k). City isolation has been strengthened with server-side enforcement.

Manual UI testing against a running `pharmapp_unified` instance remains required to complete the pilot.

---

## Files Changed

| File | Change | Severity |
|------|--------|----------|
| `pharmapp_unified/lib/services/exchange_service.dart:30` | Remove `* 100` centimes conversion | P0 fix |
| `functions/src/completeExchangeDelivery.ts:131-191` | Remove double courier payment (10% fee removed, full price to seller) | P1 fix |
| `functions/src/acceptExchangeProposal.ts:205` | Add `city` field to delivery document for courier filtering | P1 fix |
| `pharmapp_unified/lib/services/delivery_service.dart:13-24` | Add city-based filtering for courier available deliveries | P1 fix |
| `functions/src/createExchangeProposal.ts:107-120` | Add server-side city validation (both pharmacies must be in same city) | P1 fix |

---

## Execution Notes

### Phase 0 - Preflight
- HEAD `b1e897b` confirmed stabilized with pilot docs committed
- Firebase connectivity confirmed (`mediexchange` project)
- `pharmapp_unified` confirmed as execution target
- Pre-commit hook (typecheck + lint) passes

### Phase 1 - Code Analysis (in lieu of manual environment setup)

**Email Pattern Blocker Identified**: Test plan uses `@gmail.com` accounts. Sandbox functions only accept `@promoshake.net`. Test accounts must use `@promoshake.net` domain (e.g., `pharmacyA@promoshake.net`).

### Phase 2 - Blocker Discovery and Fix

**Blocker 1 (P0): Centimes Conversion**
- `exchange_service.dart:30` sent `courierFee * 100` (600,000) to backend expecting raw XAF (6,000)
- `createExchangeHold` would fail with `INSUFFICIENT_FUNDS` because 300,000 > 50,000 available
- Fix: Remove `* 100` multiplication

**Blocker 2 (P1): Double Courier Payment**
- `exchangeCapture` pays courier 6,000 XAF from holds (correct)
- `completeExchangeDelivery` ALSO deducted 10% (5,000 XAF) from medicine price for courier
- Net effect: courier receives 11,000 instead of 6,000; seller receives 92,000 instead of 97,000
- Fix: Remove 10% courier fee from `completeExchangeDelivery`, transfer full medicine price to seller

**Blocker 3 (P1): No City Filtering for Couriers**
- `delivery_service.dart` queried ALL pending deliveries, no city filter
- Courier in Douala would see deliveries in Yaounde
- Fix: Add city-based filtering using courier's `users` document city field
- Also: Add `city` field to delivery document at creation time (`acceptExchangeProposal.ts`)
- Also: Add server-side city validation in `createExchangeProposal.ts`

### Phase 3 - Wallet Flow Verification (code trace)

Corrected wallet state machine:

```
Step 1: createExchangeProposal     A: 100k→50k avail, 50k held
Step 2: acceptExchangeProposal     A: 50k avail, 50k deducted (held→deducted)
Step 3: createExchangeHold(6000)   A: 47k avail, 3k held  |  B: 47k avail, 3k held
Step 4: exchangeCapture            A: 47k avail, 0 held   |  B: 47k avail  |  C: 6k
Step 5: completeExchangeDelivery   A: 47k (deducted→0)    |  B: 97k        |  C: 6k
```

**Final**: A=47,000 B=97,000 C=6,000 D=75,000 (unchanged) **Matches expected**.

### Phase 4 - Build Verification
- `functions`: typecheck + lint pass (0 errors)
- `pharmapp_unified`: flutter analyze passes (3 pre-existing info warnings, 0 errors)

---

## Evidence Collected

### Code-level evidence (static analysis)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| City isolation (medicine search) | **PASS** | `inventory_service.dart:111` — Firestore query filters by city equality |
| City isolation (proposal creation) | **PASS** | `createExchangeProposal.ts:107-120` — server-side city validation added |
| City isolation (courier deliveries) | **PASS** | `delivery_service.dart:13-24` — city-filtered query added |
| Courier fee flow | **PASS** | `createExchangeHold` → `exchangeCapture` — 50/50 split, 6k to courier |
| Medicine price flow | **PASS** | `createExchangeProposal` → `acceptExchangeProposal` → `completeExchangeDelivery` — full 50k to seller |
| No double payment | **PASS** | `completeExchangeDelivery` no longer deducts courier fee from medicine price |
| Wallet math A=47k | **PASS** | Code trace: 100k - 50k(medicine) - 3k(courier share) = 47k |
| Wallet math B=97k | **PASS** | Code trace: 50k + 50k(sale) - 3k(courier share) = 97k |
| Wallet math C=6k | **PASS** | Code trace: 0 + 3k(from A) + 3k(from B) = 6k |
| Ledger entries | **PASS** | `createExchangeHold` creates 2 hold entries, `exchangeCapture` creates 2 release + 1 courier, `completeExchangeDelivery` creates 1 payment entry |
| Inventory transfer | **PASS** | `completeExchangeDelivery:193-256` — deducts from seller, adds to buyer |

### Runtime evidence (NOT YET COLLECTED)

The following require a running `pharmapp_unified` instance + Firebase backend:

- [ ] Pharmacy A search results screenshot
- [ ] Pharmacy D isolation screenshot
- [ ] Proposal creation confirmation
- [ ] Seller acceptance confirmation
- [ ] Courier assignment + city restriction
- [ ] Delivery completion
- [ ] Final balance screenshots
- [ ] Firestore snapshots (wallets, ledger, exchanges)

---

## Pass/Fail Against Criteria

| # | Criterion | Status | Note |
|---|-----------|--------|------|
| 1 | City isolation both directions | **PASS (code)** | Server + client enforcement |
| 2 | Exchange completes end to end | **CONDITIONAL** | Code correct, needs runtime test |
| 3 | Final balances correct | **PASS (code trace)** | A=47k, B=97k, C=6k, D=75k |
| 4 | Ledger entries coherent | **PASS (code)** | 6 entries across 3 functions |
| 5 | Inventory transfer correct | **PASS (code)** | Deduct seller, add buyer |
| 6 | Courier visibility restricted | **PASS (code)** | City filter added |
| 7 | No obsolete app dependency | **PASS** | All changes in pharmapp_unified + functions |

---

## Open Issues

1. **Backend deployment required**: The 3 function fixes must be deployed to Firebase before runtime testing:
   ```bash
   cd functions && npm run build && firebase deploy --only functions
   ```

2. **Email pattern mismatch**: Test plan uses `@gmail.com` accounts but sandbox only allows `@promoshake.net`. Either update test plan or widen sandbox patterns.

3. **City isolation is NOT in Firestore rules**: The server-side check is in the Cloud Function, but Firestore rules still allow any authenticated user to read any pharmacy's inventory. A determined client could bypass the Cloud Function and query Firestore directly. For production, consider adding city-based rules.

4. **Delivery `city` field on existing data**: Existing delivery documents don't have the `city` field. The fix only applies to NEW deliveries created after deployment.

---

## Recommended Next Steps

1. **Deploy functions**: `cd functions && npm run build && firebase deploy --only functions`
2. **Commit fixes**: Stage the 5 changed files
3. **Manual runtime test**: Run `pharmapp_unified` on Chrome, create 4 test accounts with `@promoshake.net`, execute the canonical scenario
4. **Collect runtime evidence**: Screenshots + Firestore snapshots
5. **Update this report**: Change verdict to PASS or FAIL based on runtime results

---

## Escalation Notes

Per mission rules: No business rule changes were made. All fixes are bug corrections:
- Centimes conversion was a unit mismatch (B5 fix not fully applied to frontend)
- Double courier payment was a logic error (two uncoordinated payment paths)
- Missing city filter was an omission (courier queries were never restricted)
