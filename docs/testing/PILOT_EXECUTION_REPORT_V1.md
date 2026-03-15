# Pilot Execution Report - Exchange E2E v1

**Date**: 2026-03-15
**HEAD**: updated at commit time (see git log)
**Executor**: Claude (Developer role)
**Review**: Codex (Architect role) — multiple review cycles, business rule arbitrated
**Verdict**: **CONDITIONAL PASS** - code fixes applied and deployed, manual UI testing required

---

## Summary

Five blockers were discovered during code analysis and architect review. All five have been fixed. The code now implements the arbitrated business rule and produces the expected wallet flow (A=47k, B=97k, C=6k).

**Arbitrated business rule (pilot v1)**:
- Courier fee = **12%** of medicine price (no min/max bounds)
- Split **50/50** between buyer and seller
- Seller's share deducted from sale proceeds before net credit (no pre-existing balance required)
- Rate is hardcoded for pilot; admin-configurable rate is backlog (v1.1+)

**Key architectural correction**: `createExchangeHold`/`exchangeCapture` are dead code (no UI calls them). Courier fee is handled entirely within `completeExchangeDelivery.ts`.

Manual UI testing against a running `pharmapp_unified` instance remains required to complete the pilot.

---

## Files Changed

| File | Change | Severity |
|------|--------|----------|
| `pharmapp_unified/lib/services/exchange_service.dart:30` | Remove `* 100` centimes conversion | P0 fix |
| `functions/src/acceptExchangeProposal.ts:217` | Calculate courier fee (`round(totalPrice * 0.12)`, pure 12%, no bounds) | P1 fix (v3) |
| `functions/src/completeExchangeDelivery.ts:145-275` | Unified payment: medicine + courier fee in single phase, seller share from proceeds | P1 fix (v3) |
| `functions/src/completeExchangeDelivery.ts:130-143` | Move all transaction reads before writes (Firestore requirement) | P1 fix (v2) |
| `pharmapp_unified/lib/services/delivery_service.dart:13-40` | Read courier city from `couriers/` collection (not `users/`) | P1 fix (v2) |
| `functions/src/acceptExchangeProposal.ts:206` | Add `city` field to delivery document for courier filtering | P1 fix |
| `functions/src/createExchangeProposal.ts:107-131` | Add server-side city validation (both pharmacies must be in same city) | P1 fix |
| `firestore.rules:201-211` | Delivery read: couriers only, same city via `operatingCity` check | P1 fix (v3) |
| `firestore.rules:213-227` | Delivery update: city check + `courierId == auth.uid` + pharmacy writes removed | P1 fix (v4) |
| `pharmapp_unified/firestore.rules:196-225` | Mirror of root rules with `hasCourierRole` helper | P1 fix (v4) |
| `functions/src/completeExchangeDelivery.ts:152-163` | Buyer solvency check before courier fee debit | P2 fix (v4) |
| `docs/testing/PILOT_PRE_IMPLEMENTATION_ANALYSIS_V1.md` | Pass 1 entry (retroactive gate compliance) | P1 process (v4) |

---

## Execution Notes

### Phase 0 - Preflight
- HEAD `b1e897b` confirmed stabilized with pilot docs committed
- Firebase connectivity confirmed (`mediexchange` project)
- `pharmapp_unified` confirmed as execution target
- Pre-commit hook (typecheck + lint) passes

### Phase 1 - Code Analysis (in lieu of manual environment setup)

**Email Pattern Blocker Identified**: Test plan uses `@gmail.com` accounts. Sandbox functions only accept `@promoshake.net`. Test accounts must use `@promoshake.net` domain.

### Phase 2 - Blocker Discovery and Fix

**Blocker 1 (P0): Centimes Conversion**
- `exchange_service.dart:30` sent `courierFee * 100` (600,000) to backend expecting raw XAF (6,000)
- Fix: Remove `* 100` multiplication

**Blocker 2 (P1): Dead Code — createExchangeHold/exchangeCapture never called**
- No UI screen calls these HTTP endpoints. The actual UI flow is:
  `createExchangeProposal` → `acceptExchangeProposal` → courier accepts → `completeExchangeDelivery`
- Original fix left courier paid ZERO
- v3 Fix (after product arbitrage):
  - Courier fee = `round(totalPrice * 0.12)` — pure 12%, no min/max bounds
  - Calculated at delivery creation (`acceptExchangeProposal.ts`)
  - Paid at delivery completion (`completeExchangeDelivery.ts`):
    - Buyer's share deducted from `available` balance
    - Seller's share deducted from sale proceeds before net credit
    - Courier credited with full fee
  - 4 ledger entries: 1 medicine payment + 3 courier fee entries

**Blocker 3 (P1): Courier city field wrong collection**
- Registration stores courier city in `couriers/<uid>.operatingCity`
- Fix: `delivery_service.dart` reads from `couriers/<uid>` with `operatingCity` → `city` fallback

**Blocker 4 (P1): No City Filtering for Couriers**
- Fix: City-based query filter + `city` field on delivery document + server-side city validation

**Blocker 5 (P1): Firestore transaction reads-after-writes**
- Fix: All reads (courier wallet, target inventory) moved to Phase 1b before any writes

### Phase 3 - Wallet Flow Verification (code trace)

Corrected wallet state machine (v3 — seller share from proceeds):

```
Step 1: createExchangeProposal      A: 100k→50k avail, 50k held
Step 2: acceptExchangeProposal      A: 50k avail, 50k deducted
         delivery.courierFee = round(50000 * 0.12) = 6000
         halfBuyer = floor(6000/2) = 3000
         halfSeller = 6000 - 3000  = 3000
Step 3: completeExchangeDelivery (single atomic phase):
  buyer:   deducted -50k (→0), available -3k (50k→47k)
  seller:  available +(50k-3k) = +47k net credit (50k→97k)
  courier: available +6k (0→6k)
```

**Final**: A=47,000 B=97,000 C=6,000 D=75,000 (unchanged) **Matches expected**.

**Note on seller solvency**: Seller's courier share (3k) is deducted from the sale proceeds (50k), so seller receives net 47k. This means seller does NOT need pre-existing available balance to cover the courier fee.

### Phase 4 - Build Verification
- `functions`: typecheck + lint pass (0 errors)
- `pharmapp_unified`: flutter analyze passes (pre-existing info warnings, 0 errors)

---

## Business Rules Applied (Arbitrated)

| Rule | Value | Authority |
|------|-------|-----------|
| Courier fee rate | 12% of medicine price | Product Owner (Codex), 2026-03-15 |
| Fee split | 50% buyer / 50% seller | Product Owner (Codex), 2026-03-15 |
| Seller insufficient balance | Share deducted from sale proceeds | Product Owner (Codex), 2026-03-15 |
| Min/max bounds | **Not approved** — pure percentage only | Product Owner (Codex), 2026-03-15 |
| Admin configurability | Backlog v1.1+ (not in pilot) | Product Owner (Codex), 2026-03-15 |

---

## Evidence Collected

### Code-level evidence (static analysis)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| City isolation (medicine search) | **PASS** | `inventory_service.dart:111` — Firestore query filters by city |
| City isolation (proposal creation) | **PASS** | `createExchangeProposal.ts:118-131` — server-side city validation |
| City isolation (courier deliveries) | **PASS** | `delivery_service.dart:18-40` — city-filtered query from `couriers/` |
| Courier fee = 12% (no bounds) | **PASS** | `acceptExchangeProposal.ts:217` — `Math.round(totalPrice * 0.12)` |
| Courier fee payment (seller from proceeds) | **PASS** | `completeExchangeDelivery.ts:145-275` — seller gets `totalAmount - halfSeller` |
| No double payment | **PASS** | Single payment path in `completeExchangeDelivery` only |
| Wallet math A=47k | **PASS** | 100k - 50k(medicine) - 3k(courier) = 47k |
| Wallet math B=97k | **PASS** | 50k + (50k-3k)(net sale) = 97k |
| Wallet math C=6k | **PASS** | 0 + 3k(buyer) + 3k(seller) = 6k |
| Ledger entries | **PASS** | 4 entries: medicine payment + buyer fee + seller fee + courier payment |
| Inventory transfer | **PASS** | `completeExchangeDelivery` — deducts seller, adds buyer |
| Transaction read ordering | **PASS** | All reads (buyer wallet, courier wallet, target inventory) before first write |
| Delivery acceptance (rules) | **PASS** | `firestore.rules:218-230` — city match + `courierId == auth.uid` + `status == 'accepted'` + field whitelist + no pharmacy writes |
| Buyer solvency for fee | **PASS** | `completeExchangeDelivery.ts:152-163` — checks `available >= halfBuyer` before debit |
| Pre-implementation gate | **DEMONSTRATED (Pass 2+3)** | Pass 1 retrospective (process gap). Pass 2 and Pass 3 are forward-looking, written before code. Gate mechanism demonstrated but not yet validated by runtime execution. |

### Runtime evidence (NOT YET COLLECTED)

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
| 4 | Ledger entries coherent | **PASS (code)** | 4 entries in completeExchangeDelivery |
| 5 | Inventory transfer correct | **PASS (code)** | Deduct seller, add buyer |
| 6 | Courier visibility restricted | **PASS (code)** | City filter from couriers/ collection |
| 7 | No obsolete app dependency | **PASS** | All changes in pharmapp_unified + functions |

---

## Open Issues

1. **Backend deployment**: **DONE** (2026-03-15). Functions `createExchangeProposal`, `acceptExchangeProposal`, `completeExchangeDelivery` deployed to `europe-west1`. Firestore rules deployed.

2. **Email pattern**: Test accounts must use `@promoshake.net` domain (sandbox restriction). Old test plan references to `@gmail.com` are obsolete.

3. **Firestore rules — delivery visibility**: **FIXED**. Pending deliveries restricted to couriers with matching `operatingCity`. Acceptance branch now enforces `status == 'accepted'` + field whitelist.

4. **Firestore rules — city isolation for inventory**: Server-side check is in Cloud Function only. Firestore rules allow any authenticated user to read any pharmacy's inventory directly. Production hardening needed (separate from pilot scope).

5. **Delivery `city` field on existing data**: Only new deliveries (post-deployment) have the `city` field.

6. **Dead code**: `createExchangeHold`, `exchangeCapture`, `exchangeCancel` in `index.ts` — HTTP endpoints with no UI integration. Cleanup backlog.

7. **Remote function drift**: `devSubscription` and `cleanupTestUser` exist remotely but are not exported from local `index.ts`. Status unknown. Not needed for pilot. Cleanup backlog.

8. **cancelExchangeProposal not deployed**: UI calls this callable for proposal rejection, but it does not exist as a deployed function. Not needed for the happy-path pilot.

---

## Process Notes

**Escalation failure acknowledged**: The min/max bounds (2000/10000 XAF) were introduced without product arbitrage. This was corrected after architect review. The corrected rule (pure 12%) was explicitly arbitrated by the Product Owner.

**Lesson**: Business rules that are missing or ambiguous must be escalated, not decided locally by the developer.

---

## Recommended Next Steps

1. ~~**Deploy functions**~~: **DONE** (2026-03-15)
2. ~~**Commit fixes**~~: **DONE** (Pilot v4→v6)
3. ~~**Deploy Firestore rules**~~: **DONE** (2026-03-15, includes acceptance + assigned courier field whitelists)
4. **Manual runtime test**: Execute canonical scenario with `@promoshake.net` accounts per `PILOT_RUNTIME_PREPARATION_V1.md`
5. **Collect runtime evidence**: Screenshots + Firestore snapshots
6. **Update this report**: Change verdict to PASS or FAIL based on runtime results
