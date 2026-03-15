# Pilot Runtime Preparation - Exchange E2E v1

**Date**: 2026-03-15
**Commit**: aec3b86 (Pilot v4)
**Firebase Project**: mediexchange
**Deployed**: Cloud Functions (3) + Firestore rules
**Target App**: pharmapp_unified (web)

---

## 1. Prerequisites

### Backend (deployed)

- [x] `createExchangeProposal` (europe-west1, callable)
- [x] `acceptExchangeProposal` (europe-west1, callable)
- [x] `completeExchangeDelivery` (europe-west1, callable)
- [x] `sandboxCredit` (europe-west1, https) — for wallet seeding
- [x] Firestore rules deployed (root `firestore.rules`)

### Frontend

- [ ] `pharmapp_unified` running on Chrome (web)
- [ ] Firebase web keys present in `firebase_options.dart` (currently hardcoded — OK for testing)

### Accounts needed

All accounts must use `@promoshake.net` domain (sandbox restriction).

| Actor | Email | Role | City | Purpose |
|-------|-------|------|------|---------|
| Pharmacy A | `pilotA@promoshake.net` | pharmacy | Douala | Buyer |
| Pharmacy B | `pilotB@promoshake.net` | pharmacy | Douala | Seller |
| Courier C | `pilotC@promoshake.net` | courier | Douala (operatingCity) | Delivery |
| Pharmacy D | `pilotD@promoshake.net` | pharmacy | Yaounde | Isolation control |

### Wallet seeding (via sandboxCredit)

```bash
# Pharmacy A — buyer (needs 100,000 XAF)
curl -X POST https://europe-west1-mediexchange.cloudfunctions.net/sandboxCredit \
  -H "Content-Type: application/json" \
  -d '{"email": "pilotA@promoshake.net", "amount": 100000, "currency": "XAF"}'

# Pharmacy B — seller (needs 50,000 XAF)
curl -X POST https://europe-west1-mediexchange.cloudfunctions.net/sandboxCredit \
  -H "Content-Type: application/json" \
  -d '{"email": "pilotB@promoshake.net", "amount": 50000, "currency": "XAF"}'

# Pharmacy D — isolation control (needs 75,000 XAF)
curl -X POST https://europe-west1-mediexchange.cloudfunctions.net/sandboxCredit \
  -H "Content-Type: application/json" \
  -d '{"email": "pilotD@promoshake.net", "amount": 75000, "currency": "XAF"}'

# Courier C — starts at 0 XAF (no seeding needed)
```

### Inventory seeding

Inventory is added via the UI (Pharmacy dashboard → Inventory → Add Medicine).

- **Pharmacy B**: Add Paracetamol 500mg, quantity 100, price 50,000 XAF
- **Pharmacy D**: Add Paracetamol 500mg, quantity 50, price 45,000 XAF

---

## 2. Launch command

```bash
cd pharmapp_unified && flutter run -d chrome --web-port=8086
```

---

## 3. Account creation sequence

Accounts are created through the app's registration flow.

For each pharmacy account:
1. Open app → Select "Pharmacy"
2. Register with `@promoshake.net` email
3. Set city during registration (Douala or Yaounde)
4. Ensure subscription trial is active (auto-created at registration)

For the courier account:
1. Open app → Select "Courier"
2. Register with `pilotC@promoshake.net`
3. Set operating city to Douala
4. Vehicle type: Motorcycle, License: DLA-PILOT-C

After registration, seed wallets using the curl commands above.

---

## 4. Test execution order

### Phase 1 — City isolation proof

**Step 1.1**: Log in as Pharmacy A (Douala)
- Navigate to Exchanges → Create Proposal → Search medicines
- **Verify**: Only Pharmacy B inventory visible (Douala)
- **Verify**: Pharmacy D inventory NOT visible (Yaounde)
- **Capture**: Screenshot of search results

**Step 1.2**: Log in as Pharmacy D (Yaounde)
- Navigate to Exchanges → Create Proposal → Search medicines
- **Verify**: Only own city inventory visible
- **Verify**: Pharmacy B inventory NOT visible (Douala)
- **Capture**: Screenshot of search results

### Phase 2 — Exchange creation

**Step 2.1**: Log in as Pharmacy A
- Navigate to Exchanges → Create Proposal
- Select Paracetamol from Pharmacy B
- Submit proposal
- **Verify**: Proposal created, wallet shows hold deducted (50,000 XAF held)
- **Capture**: Screenshot of proposal confirmation + wallet balance

### Phase 3 — Seller acceptance

**Step 3.1**: Log in as Pharmacy B
- Navigate to Exchanges → Proposals → Received tab
- Accept the proposal from Pharmacy A
- **Verify**: Proposal status changes to accepted
- **Verify**: Delivery created (deliveryId returned)
- **Capture**: Screenshot of acceptance confirmation

### Phase 4 — Courier assignment

**Step 4.1**: Log in as Courier C
- Navigate to Available Orders
- **Verify**: Delivery from Pharmacy B → Pharmacy A is visible
- Accept the delivery
- **Verify**: Status changes to accepted/in_transit
- **Capture**: Screenshot of available orders + acceptance

### Phase 5 — Pickup and delivery

**Step 5.1**: As Courier C
- Confirm pickup (status → picked_up)
- Confirm delivery (status → delivered)
- This triggers `completeExchangeDelivery` which:
  - Transfers medicine payment to seller
  - Deducts courier fee shares
  - Credits courier
  - Updates inventory
- **Capture**: Screenshot of delivery completion

### Phase 6 — Accounting verification

**Step 6.1**: Check final balances
- Log in as each actor and check wallet balance
- Or verify directly in Firestore console

| Actor | Expected final balance |
|-------|----------------------|
| Pharmacy A | 47,000 XAF |
| Pharmacy B | 97,000 XAF |
| Courier C | 6,000 XAF |
| Pharmacy D | 75,000 XAF (unchanged) |

**Step 6.2**: Check Firestore directly
- `wallets/` — verify available balances
- `ledger/` — verify 4 entries (medicine payment + buyer fee + seller fee + courier payment)
- `pharmacy_inventory/` — verify quantity changes
- `exchange_proposals/` — verify status = completed

---

## 5. Evidence to capture

| # | Evidence | How |
|---|----------|-----|
| 1 | Pharmacy A search results (Douala only) | Screenshot |
| 2 | Pharmacy D search results (Yaounde only) | Screenshot |
| 3 | Proposal creation confirmation | Screenshot |
| 4 | Seller acceptance confirmation | Screenshot |
| 5 | Courier available orders (city-filtered) | Screenshot |
| 6 | Delivery completion | Screenshot |
| 7 | Final wallet balances (all 4 actors) | Screenshot or Firestore console |
| 8 | Ledger entries | Firestore console |
| 9 | Inventory state post-exchange | Firestore console |

---

## 6. Known gaps (not blocking pilot execution)

1. **cancelExchangeProposal not deployed**: The UI calls this callable for proposal rejection, but it doesn't exist as a deployed function. Not needed for the happy-path pilot.

2. **Node.js 20 deprecation warning**: Runtime will be deprecated 2026-04-30. Not blocking.

3. **Legacy remote functions**: `devSubscription` and `cleanupTestUser` exist remotely but are no longer in index.ts. Cleanup backlog.

4. **Delivery city field on existing data**: Only new deliveries (post-deployment) have the `city` field. Old test data won't be courier-visible.

5. **exchange_service.dart (dead code)**: `ExchangeService.createHold()` / `captureExchange()` call dead HTTP endpoints. The actual UI uses `ExchangeProposalService` and `ExchangeProposal.acceptProposal()` which call the correct callable functions.

---

## 7. Abort conditions

Stop and escalate if:

- Account registration fails with subscription error
- sandboxCredit returns an error for `@promoshake.net` accounts
- Proposal creation throws a Firestore permission error
- acceptExchangeProposal fails to create delivery
- Courier cannot see pending deliveries in Douala
- completeExchangeDelivery fails with a transaction error
- Final balances do not match expected values

---

## 8. Post-test actions

After test execution:

1. Update `docs/testing/PILOT_EXECUTION_REPORT_V1.md` with runtime evidence
2. Change verdict from CONDITIONAL PASS to PASS or FAIL
3. Document any discrepancies
4. Do NOT delete test data (needed for post-mortem)
