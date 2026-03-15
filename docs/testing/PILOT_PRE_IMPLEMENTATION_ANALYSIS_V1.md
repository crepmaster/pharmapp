# Pilot Pre-Implementation Analysis v1

**Date**: 2026-03-15
**Status**: Active gate for remaining non-trivial pilot corrections
**Pilot**: Exchange E2E on `pharmapp_unified`

---

## Purpose

This file is a mandatory gate before any non-trivial correction pass in the pilot.

It is intentionally short.
Its role is not to dump internal reasoning.
Its role is to force the developer to stop, check the facts, identify ambiguities, and escalate before coding when the pilot touches sensitive rules.

---

## Required checklist for each pass

Before coding, update this file with:

1. confirmed facts from code and docs
2. ambiguities still present
3. options considered
4. required escalations
5. explicit go / no-go for coding

If the pass touches any of the following, unresolved ambiguity is blocking:

- money flow
- wallet balance computation
- ledger entries
- permissions
- Firestore rules
- city isolation
- pilot pass/fail semantics

In those cases, the developer must stop and escalate.
They must not invent a "reasonable" local rule.

---

## Current resolved arbitrations

### A1. Courier remuneration rule for this pilot

Resolved by product decision:

- courier remuneration for this pilot is `12%` of medicine price
- buyer pays `50%` of courier fee
- seller pays `50%` of courier fee
- if seller lacks enough available balance, the seller share may be deducted from sale proceeds before final net credit

Not approved in this pilot unless explicitly escalated again:

- extra min/max bounds
- city-specific fee overrides
- country-specific fee overrides
- admin-console configuration

Those are future evolutions, not pilot assumptions.

---

## Current open issues requiring care

### O1. Courier visibility must be true at security level

Confirmed facts:

- frontend courier filtering is part of the pilot
- pilot success also depends on real city isolation
- Firestore rules can still invalidate a UI-only proof if they remain too permissive

Implication:

- a patch that claims courier visibility `PASS` must check both application path and rules enforcement

### O2. Dead or legacy payment paths must not silently redefine the pilot

Confirmed facts:

- `createExchangeHold` / `exchangeCapture` were identified as non-driving or dead for the current runtime path
- the pilot must be judged on the real path used by the app, not on unused helper code

Implication:

- if a correction changes the effective payment model, it requires explicit confirmation against the pilot docs

---

## Current pass template

When a new correction pass starts, append a short section like this:

### Pass X

**Confirmed facts**

- ...

**Ambiguities**

- ...

**Options considered**

- ...

**Escalations required**

- ...

**Go / No-Go**

- Go
- or No-Go

---

## Pass 1 — Codex review findings correction (2026-03-15)

**Scope**: Fix 2 P1 + 1 P2 from Codex review of pilot v2/v3

**Note**: This pass was written retroactively. The code was already written before this analysis was filled in. This is acknowledged as a process gap — future passes must complete this gate before coding.

### Confirmed facts

- Firestore rules (root `firestore.rules`) are the deployed source of truth (`firebase.json` → `"rules": "firestore.rules"`)
- `delivery_service.dart:86` calls `_firestore.collection('deliveries').doc(deliveryId).update(...)` to accept deliveries — this is a client-side Firestore write governed by rules
- Current rules allow `fromPharmacyId` and `toPharmacyId` to update deliveries at any status, including `pending`
- Current acceptance rule checks `exists(couriers/uid)` but does NOT verify: (a) courier's city matches delivery city, (b) the `courierId` being written is `request.auth.uid`
- Buyer's `available` balance is debited `halfBuyer` (3000 XAF in canonical scenario) without prior solvency check
- Between proposal creation (50k held) and delivery completion, buyer could have spent remaining `available` (50k) via other transactions
- `completeExchangeDelivery` is called by the courier via Cloud Functions (callable), not via direct Firestore write — so the function controls the payment logic, but acceptance is a direct client write

### Ambiguities

1. **Should pharmacies retain any update right on deliveries?**
   - The `fromPharmacyId` and `toPharmacyId` update paths were present from the original courier migration session
   - Use cases that might need pharmacy writes: adding delivery notes, confirming receipt, reporting issues
   - However: receipt confirmation goes through `completeExchangeDelivery` (callable function), issue reporting has its own `delivery_issues` collection
   - **Conclusion**: No identified pharmacy use case requires direct delivery document writes. All pharmacy actions on deliveries go through Cloud Functions or separate collections.

2. **Should the update rule also enforce that the courier doesn't change the delivery city?**
   - A courier who accepts a delivery could theoretically modify the `city` field
   - However: the `city` field is set by `acceptExchangeProposal` (server-side) and the courier only needs to update `status`, `courierId`, location, timestamps
   - **Conclusion**: Not blocking for pilot. The assigned courier update path (`resource.data.courierId == request.auth.uid`) doesn't restrict which fields can be changed — this is a known limitation. Field-level security would require more complex rules.

3. **What happens if buyer's available balance is negative or zero at delivery time?**
   - The buyer's medicine payment (50k) was already held→deducted at proposal acceptance
   - Only the courier fee share (3k) comes from `available`
   - If buyer has < 3k available, delivery completion should fail
   - **Conclusion**: This is a data integrity check, not a business rule decision. The solvency check is within developer authority.

### Options considered

**Finding 1 (delivery acceptance rules):**

| Option | Description | Trade-off |
|--------|-------------|-----------|
| A. Remove pharmacy writes entirely | Pharmacies cannot update delivery documents | Clean security, but breaks any future pharmacy-delivery interaction |
| B. Allow pharmacy writes only on non-pending deliveries | Pharmacies can update after courier accepts | Partial fix — still allows pharmacy to modify assigned deliveries |
| C. Remove pharmacy writes, add city + self-assignment to courier acceptance | Only couriers accept, only in their city, only assigning themselves | Most restrictive, matches pilot requirements |

**Chosen: C** — most restrictive option. Any future pharmacy-delivery write needs go through Cloud Functions, not direct Firestore writes.

**Finding 2 (buyer solvency):**

| Option | Description | Trade-off |
|--------|-------------|-----------|
| A. Check buyer available >= halfBuyer, throw if insufficient | Delivery completion fails if buyer can't cover fee | Simple, explicit, courier doesn't get paid |
| B. Cap buyer share at available balance, courier gets less | Delivery completes but courier is shortchanged | Unfair to courier |
| C. Reserve buyer's fee share at proposal creation time | Move to held balance early | Requires changing proposal flow (out of scope) |

**Chosen: A** — fail explicitly. Option C is architecturally better but out of pilot scope.

### Escalations required

- None. All three corrections are security/data-integrity fixes, not business rule decisions.
- The pharmacy update removal was evaluated against known use cases (none found that require direct writes).

### Go / No-Go

- **Go** — corrections are within developer authority (security enforcement, data integrity, Firestore rules)
- No new business rules introduced
- Pre-analysis was retroactive (process gap acknowledged)

---

## Gate compliance status

### Pass 1 — retrospective (does NOT demonstrate the gate)

Pass 1 was written **after** the code was already implemented. It is retained as an honest retrospective trace of the correction, not as evidence that the pre-implementation analysis gate was effectively followed.

**Pass 1 is**:
- acceptable as a retrospective record of what was confirmed, what was ambiguous, and what options were considered
- **not** receivable as proof that the gate mechanism worked on this pass

**Ruling (Product Owner, 2026-03-15)**:
- No false forward-looking rewrite — the retroactive nature is acknowledged, not hidden
- The gate obligation is **not yet demonstrated** by any pass in this pilot
- The next non-trivial correction **must** open a real forward-looking Pass 2 **before** any code is written

### Obligation for future passes

- Any non-trivial change touching money flow, wallet balance, ledger entries, permissions, Firestore rules, city isolation, or pilot pass/fail semantics **must** complete a forward-looking Pass entry in this file **before** coding begins.
- The pass must be filled with confirmed facts, ambiguities, options, and escalations **derived from investigation**, not from a pre-existing solution plan.
- Only after the pass reaches an explicit **Go** may the developer derive a technical todo and begin patching.

---

## Pass 2 — Delivery acceptance field restriction + report coherence (2026-03-15)

**Scope**: P1 — acceptance rules too permissive on fields; P2 — report coherence; P2 — runtime note not committed

**This pass is forward-looking. No code has been written yet.**

### Confirmed facts

1. The acceptance branch in `firestore.rules:218-224` checks `status == 'pending'`, `courierId == null`, city match, and `request.resource.data.courierId == request.auth.uid`.
2. It does NOT constrain `request.resource.data.status` — so a client can write `status: 'delivered'` in the same update that sets `courierId`.
3. It does NOT restrict which other fields can be modified — a client could alter `city`, `courierFee`, `fromPharmacyId`, `toPharmacyId`, `items`, etc. in the acceptance write.
4. The legitimate client (`delivery_service.dart:86-93`) writes exactly: `courierId`, `courierName`, `status: 'accepted'`, `assignedAt`, `acceptedAt`, `updatedAt`.
5. The second branch (`resource.data.courierId == request.auth.uid`) allows the assigned courier to update any field — this is needed for location updates and status transitions during delivery, and is governed by the fact that `completeExchangeDelivery` (the financial operation) is a server-side callable, not a direct write.
6. `pharmapp_unified/firestore.rules:216-222` has the identical structure.
7. The pilot execution report marks "Pre-implementation gate" as `PASS`, which contradicts the gate compliance status section that says Pass 1 does not demonstrate the gate.
8. The report's "Open Issues" still lists "Backend deployment required" and "Commit fixes", which are now done (commit `aec3b86`, deploy completed).
9. `PILOT_RUNTIME_PREPARATION_V1.md` is untracked and not part of commit `aec3b86`.

### Ambiguities

1. **Should the acceptance branch enforce `request.resource.data.status == 'accepted'`?**
   - The legitimate client writes `status: 'accepted'`.
   - Without this constraint, a malicious client could write `status: 'delivered'` or `status: 'picked_up'` during acceptance.
   - However: `completeExchangeDelivery` (the only path that moves money) requires `status` to be `picked_up` or `in_transit`, and it's a server-side callable — it reads the delivery document itself and validates status independently.
   - So: the financial risk is that a malicious courier could skip the pickup/in_transit flow and go straight to calling `completeExchangeDelivery` after self-setting `status: 'picked_up'` via a second direct write (using the assigned courier branch).
   - **Conclusion**: Enforcing `status == 'accepted'` on the acceptance branch closes one vector. But the assigned courier branch still allows arbitrary status writes. The real protection is that `completeExchangeDelivery` is server-side. Field-level restriction on the assigned courier branch is a separate hardening concern, not required for pilot.

2. **Should the acceptance branch use `request.resource.data.diff(resource.data).affectedKeys()` to restrict modified fields?**
   - Firestore rules support `request.resource.data.diff(resource.data).affectedKeys().hasOnly([...])` to whitelist writable fields.
   - This would prevent altering `city`, `courierFee`, `fromPharmacyId`, `toPharmacyId`, `items`, `proposalId`.
   - The acceptance write needs to modify: `courierId`, `courierName`, `status`, `assignedAt`, `acceptedAt`, `updatedAt`.
   - **Conclusion**: Field whitelisting on the acceptance branch is feasible and would close the attack vector where a courier alters delivery metadata during acceptance. This is a security enforcement, not a business rule decision.

3. **Should the assigned courier branch also restrict writable fields?**
   - The assigned courier needs to update: `status`, location fields, timestamps, photo proof, delivery notes.
   - Restricting this branch to a field whitelist would be more complex and could break legitimate operations (location updates, status transitions).
   - The financial operations are protected by server-side callable.
   - **Conclusion**: Restricting the assigned courier branch is out of scope for this pass. The acceptance branch is the priority because it's where a courier first gains update rights.

### Options considered

**P1 — Acceptance field restriction:**

| Option | Description | Trade-off |
|--------|-------------|-----------|
| A. Add `status == 'accepted'` check only | Prevents status skip on acceptance | Doesn't prevent field tampering (city, fee, etc.) |
| B. Add `status == 'accepted'` + field whitelist on acceptance branch | Full field restriction on acceptance | More complex rule, but acceptance is a well-defined write |
| C. Add field whitelist on both acceptance AND assigned courier branches | Complete field-level security | Requires enumerating all legitimate courier update fields; risk of breaking location/status updates |

**Recommended: B** — restrict acceptance to `status == 'accepted'` AND whitelist the exact fields. The acceptance write is well-defined (6 fields). The assigned courier branch remains permissive for now (server-side callable protects financial operations).

**P2 — Report coherence:**

No options needed. The report must be corrected to:
- Change "Pre-implementation gate" from `PASS` to `NOT YET DEMONSTRATED (Pass 1 retrospective)`
- Update "Open Issues" to reflect that deployment and commit are done
- Add note about runtime preparation note

**P2 — Runtime note not committed:**

No options needed. Stage and commit `PILOT_RUNTIME_PREPARATION_V1.md`.

### Escalations required

- None. The P1 is a security enforcement fix (field restriction on Firestore rules), not a business rule decision. The fields written during acceptance are already defined by the legitimate client code. No money flow, fee calculation, or ledger logic is changed.

### Go / No-Go

- **Go** — the acceptance field restriction is security enforcement within developer authority
- The field whitelist is derived from the legitimate client behavior, not from a new business rule
- Report corrections are factual accuracy fixes
- No new business rules introduced

---

## Pass 3 — Assigned courier field restriction (2026-03-15)

**Scope**: P1 — assigned courier branch allows modification of `courierFee` and other financial fields; P2 — report/runtime note header coherence

**This pass is forward-looking. No code has been written yet.**

### Confirmed facts

1. Once a courier accepts a delivery (via the whitelisted acceptance branch), the branch `resource.data.courierId == request.auth.uid` (line 231 root, line 228 unified) gives the assigned courier unrestricted update rights on the delivery document.
2. `completeExchangeDelivery.ts:156` reads `delivery.courierFee` from the delivery document and uses it to compute `halfBuyer`, `halfSeller`, and the courier's full payment.
3. `courierFee` is set server-side by `acceptExchangeProposal.ts:220` as `Math.round(totalPrice * 0.12)`. It should never change after delivery creation.
4. Attack vector: courier accepts delivery → direct Firestore update sets `courierFee` to an arbitrary value (e.g., 1,000,000) → calls `completeExchangeDelivery` → receives inflated payment.
5. The legitimate courier client (`delivery_service.dart`) writes to deliveries in these contexts:
   - Status updates: `status`, `updatedAt`, `pickedUpAt`, `deliveredAt`, `failureReason`, `notes`, `proofImages`
   - Issue reporting: `hasIssue`, `lastIssueReportedAt`
   - Never writes: `courierFee`, `totalPrice`, `fromPharmacyId`, `toPharmacyId`, `city`, `proposalId`, `items`, `proposalType`, `currency`, `paymentStatus`
6. `courier_location_service.dart` does not write to the deliveries collection.
7. The execution report header still says `HEAD: b1e897b` and verdict line says "backend deployment + manual UI testing required". The runtime note says `Commit: aec3b86`.

### Ambiguities

1. **Should the assigned courier branch use a field whitelist or a field blacklist?**
   - Whitelist (hasOnly): more restrictive, only allows known fields. Risk: if a future feature adds a legitimate courier write field, the rule must be updated.
   - Blacklist (hasNone/hasAny negation): less restrictive, blocks only dangerous fields. Risk: new dangerous fields added in the future could be missed.
   - **Conclusion**: Whitelist is the safer approach. The set of legitimate courier write fields is known and bounded. Future feature additions should update the rule — this is normal Firestore rules maintenance, not an excessive constraint.

2. **What is the complete set of fields the courier may legitimately write?**
   - From `delivery_service.dart` analysis: `status`, `updatedAt`, `pickedUpAt`, `deliveredAt`, `failureReason`, `notes`, `proofImages`, `hasIssue`, `lastIssueReportedAt`
   - From `acceptDelivery`: `courierId`, `courierName`, `assignedAt`, `acceptedAt` — but these are already handled by the acceptance branch, not the assigned courier branch
   - Location fields (if ever added for tracking): not currently written to deliveries
   - **Conclusion**: 9 fields: `status`, `updatedAt`, `pickedUpAt`, `deliveredAt`, `failureReason`, `notes`, `proofImages`, `hasIssue`, `lastIssueReportedAt`. This is a data integrity determination from existing client code, not a business rule decision.

3. **Does this change affect money flow logic?**
   - No. The `completeExchangeDelivery` function continues to read `courierFee` from the delivery document. The change ensures that `courierFee` cannot be tampered with between delivery creation and completion.
   - No new fee calculation, no new payment logic, no new ledger entries.
   - **Conclusion**: This is a security enforcement that protects existing money flow, not a change to it.

### Options considered

| Option | Description | Trade-off |
|--------|-------------|-----------|
| A. Whitelist on assigned courier branch | `hasOnly([9 legitimate fields])` | Most restrictive. Future courier features need rule update. |
| B. Blacklist financial fields | `hasNone(['courierFee', 'totalPrice', 'currency', ...])` | Less restrictive. New financial fields could be missed. |
| C. Read courierFee from proposal instead of delivery | Server-side fix in `completeExchangeDelivery` | Eliminates the attack vector at source. But requires changing money flow logic (out of scope per gate rules). |
| D. Do nothing, note as accepted risk | Document that server-side callable is the real gate | Leaves an exploitable attack vector open. |

**Recommended: A** — whitelist the 9 legitimate fields. This is the same approach used for the acceptance branch, extended to the assigned courier branch. Option C would be architecturally better but changes money flow logic, which requires escalation.

### Escalations required

- None. The field whitelist is derived from the existing client code. No money flow logic is changed. No new business rule introduced. This is security enforcement within developer authority.

### Go / No-Go

- **Go** — field whitelist on assigned courier branch is security enforcement
- The 9 allowed fields are derived from `delivery_service.dart` client code analysis
- No change to fee calculation, payment logic, or ledger entries
- Report/runtime note header corrections are factual accuracy

---

## Pass 4 — Inventory subscription validation failure (2026-03-15)

See above (inserted after Pass 3 in the document body).

---

## Pass 5 — Mini-correction UX : modes explicites dans Inventory (2026-03-15)

**Scope**: UX clarity — replace hidden toggle with explicit TabBar in inventory browser; add "Published" badge on inventory items

**This pass is forward-looking. No code has been written yet.**

### Confirmed facts

1. `inventory_browser_screen.dart` uses an icon button toggle (globe/inventory) to switch between "My Inventory" and "Available Medicines". There is no visible label or TabBar — the user must discover the toggle by guessing.
2. The title changes dynamically (`showMyInventory ? 'My Inventory' : 'Available Medicines'`) but there is no persistent indication of which mode is active.
3. `pharmacy_main_screen.dart:105` shows "Inventory" as a single bottom nav entry — no distinction between own stock and marketplace.
4. `_buildMyInventoryCard` does not display the `availableForExchange` status. A pharmacy owner cannot see which of their medicines are published for exchange.
5. The `availableForExchange` default is currently `true` in `PharmacyInventoryItem.create()`. Changing this default is **out of scope** for this pass — it is a business behavior change that requires its own pass.
6. This pass does not touch: money flow, wallet, ledger, Firestore rules, navigation structure, data model.

### Ambiguities

1. **Should the tab be called "Available Medicines" or "Marketplace"?**
   - "Marketplace" better reflects the 3-tier model (Inventory / Marketplace / Exchanges) decided in this session.
   - "Available Medicines" is descriptive but doesn't establish the concept boundary.
   - **Conclusion**: Use "Marketplace" for consistency with the architecture decision. Apply the name in both the tab label and the AppBar title.

2. **Should the "Published" badge be interactive (toggle)?**
   - Adding a toggle to flip `availableForExchange` on each card would be useful but exceeds the "mini-correction" scope.
   - **Conclusion**: Display-only badge for this pass. A toggle is a separate feature (noted for future).

### Options considered

| Option | Description | Trade-off |
|--------|-------------|-----------|
| A. TabBar with 2 tabs | Explicit mode switching, standard Flutter pattern | Requires converting to TabController, slightly more code |
| B. SegmentedButton | Material 3 segmented control | Less standard for full-screen mode switching |
| C. Keep icon toggle, add label | Minimal change | Still not discoverable enough |

**Recommended: A** — TabBar with "My Inventory" and "Marketplace" tabs. Standard Flutter pattern, immediately clear to the user.

### Constraints (from architect review)

- "Add" button / FAB only in "My Inventory" tab
- "Exchanges" remains for engaged negotiations, not for browsing
- "Marketplace" naming must be consistent in tab label and title

### Escalations required

- None. This is a UI clarity fix. No money flow, no data model change, no Firestore rules change.

### Go / No-Go

- **Go** — bounded UX correction within developer authority
- No business rule change (availableForExchange default unchanged)
- No navigation restructuring
- Display-only "Published" badge, no toggle

## Pass 4 — Inventory subscription validation failure (2026-03-15)

**Scope**: P1 — transport errors misclassified as "Access Denied / Upgrade"; Cloud Functions not deployed; error typing absent in `SecureSubscriptionService`

**This pass is forward-looking. No code has been written yet.**

### Confirmed facts

1. **Cloud Functions exist but are not deployed.** `validateInventoryAccess` (index.ts:788), `validateProposalAccess` (index.ts:853), and `getSubscriptionStatus` (index.ts:937) all compile cleanly (`npm run build` → success). They have never been deployed to Firebase.

2. **The HTTP call fails with a network/404 error.** `SecureSubscriptionService.validateInventoryAccess()` calls `https://europe-west1-mediexchange.cloudfunctions.net/validateInventoryAccess` — which does not exist on the server. The `catch (e)` at line 61 catches this and returns `InventoryAccessResult(canAccess: false, error: 'Network error: $e')`.

3. **The error result has no typed error code for transport failures.** `InventoryAccessResult` has `errorCode` (String?) and convenience getters `isLimitExceeded` and `needsSubscription`, but no `isTransportError` or `isServerError`. The `errorCode` is only populated from the 403 response body — network errors leave it null.

4. **`AddMedicineScreen._addMedicine()` treats all `!canAccess` as either `isLimitExceeded` or generic "Access Denied / Upgrade".** Lines 616-666: if `canAccess == false` and not `isLimitExceeded`, the user sees a red snackbar with "Access Denied" and an "Upgrade" button. This is architecturally wrong when the real cause is a transport failure — the user has a valid subscription.

5. **Firestore rules are the true security gate.** `firestore.rules` requires `hasActiveSubscription(request.auth.uid)` on `pharmacy_inventory` create. Even if the Cloud Function validation is skipped or fails, a user without a valid subscription cannot write to the collection. This means: if transport validation fails but the user has a valid subscription, letting them attempt the Firestore write is safe — rules will enforce.

6. **The 3 functions use `requireAuth()` from `functions/src/lib/auth.ts`.** This verifies Firebase ID tokens and returns 401 for missing/invalid tokens, 403 for userId mismatch. The functions also read subscription state from `pharmacies/{uid}` flat fields via `getValidSubscription()` — consistent with the v1 single source of truth.

7. **`functions/src/lib/auth.ts` is a new file (untracked).** It needs to be deployed alongside the functions.

8. **Selective deployment is possible.** `firebase deploy --only functions:validateInventoryAccess,functions:validateProposalAccess,functions:getSubscriptionStatus` deploys only these 3 functions without affecting existing deployed functions.

### Ambiguities

1. **Should transport errors block the user or fall through?**
   - Option A: Block — show "Network error, try again" (not "Access Denied")
   - Option B: Fall through — let the user attempt `addMedicineToInventory()`, rely on Firestore rules as final gate
   - The mission prompt recommends Option B (transport_error fallback). This does NOT bypass security — Firestore rules enforce subscription at write time.
   - **Conclusion**: Option B is correct. The Cloud Function is a UX optimization (show remaining slots, plan info), not the security gate. Firestore rules are the security gate. Falling through on transport failure is architecturally sound.

2. **What error codes should the typed result support?**
   - The mission prompt specifies 6 codes: `allowed`, `subscription_required`, `limit_exceeded`, `unauthorized`, `transport_error`, `server_error`
   - Current code has 2 implicit states: `canAccess: true` (allowed) and `canAccess: false` + `errorCode` (from server 403)
   - **Conclusion**: Keep the boolean `canAccess` and add an `errorCategory` enum field alongside it (Option C). This is an additive, non-breaking change. All consumers are in `add_medicine_screen.dart` (1 call site) and `create_proposal_screen.dart` (1 call site).

3. **Does this change affect money flow?**
   - No. Inventory creation has no money flow. The medicine is added to `pharmacy_inventory` — no wallet, no ledger, no fees.
   - **Conclusion**: Not a blocking ambiguity. No escalation needed.

4. **Does `create_proposal_screen.dart` have the same error classification bug?**
   - `ProposalAccessResult` has the same pattern: `canAccess: false` with no transport error distinction.
   - The mission prompt covers `validateProposalAccess` deployment but doesn't explicitly scope `create_proposal_screen.dart` error handling refactoring.
   - **Conclusion**: Fix both result classes in the same pass for consistency, but only refactor `add_medicine_screen.dart` UI handling (the active test path). `create_proposal_screen.dart` UI refactoring can be deferred — it's not on the current pilot test path.

### Options considered

**Error typing model:**

| Option | Description | Trade-off |
|--------|-------------|-----------|
| A. Add `isTransportError` getter to existing result class | Minimal change, check if `errorCode == null && !canAccess && error?.startsWith('Network') == true` | Fragile — string matching on error message |
| B. Add an enum `AccessCode` with 6 values | Replace boolean `canAccess` with typed enum | Clean, exhaustive, but changes the interface |
| C. Keep `canAccess` boolean, add `errorCategory` enum field | Additive change, no breaking interface change | Slightly redundant (canAccess + errorCategory overlap) but backward-compatible |

**Recommended: C** — add an `AccessErrorCategory` enum (`none`, `subscription_required`, `limit_exceeded`, `unauthorized`, `transport_error`, `server_error`) as a new field alongside `canAccess`. This preserves the existing boolean interface (no risk of breaking other consumers) while adding typed error information. The `canAccess` boolean remains the primary gate; `errorCategory` provides the reason.

**Transport error fallback behavior:**

| Option | Description | Trade-off |
|--------|-------------|-----------|
| A. Block with retry prompt | Show "Connection error — Retry?" dialog | User is blocked if server is unreachable |
| B. Fall through silently | Skip validation, attempt Firestore write | User might not understand if Firestore rules then block |
| C. Fall through with warning | Show info snackbar "Offline validation skipped", proceed to Firestore write | User is informed, not blocked; Firestore rules enforce |

**Recommended: C** — fall through with a brief info message. If Firestore rules then reject the write (no subscription), the existing `catch (e)` at line 692 will show the Firestore error.

### Escalations required

- None. This change:
  - Does NOT touch money flow, wallet, or ledger
  - Does NOT change Firestore rules (the security gate remains unchanged)
  - Does NOT introduce new business rules
  - Deploys existing, already-compiled Cloud Functions
  - Adds error typing to a service result class (developer authority)
  - The fallback behavior relies on Firestore rules already enforcing `hasActiveSubscription` — no security weakening

### Go / No-Go

- **Go** — this is an error classification fix + function deployment, within developer authority
- No money flow, no new business rule, no rule change
- Firestore rules remain the security gate regardless of the Cloud Function deployment
- The fallback (let Firestore rules decide on transport error) is architecturally correct: defense in depth, not bypass

### Implementation plan (post-Go)

1. Deploy 3 Cloud Functions: `firebase deploy --only functions:validateInventoryAccess,functions:validateProposalAccess,functions:getSubscriptionStatus`
2. Add `AccessErrorCategory` enum to `secure_subscription_service.dart`
3. Populate `errorCategory` in all return paths of `validateInventoryAccess()` and `validateProposalAccess()`
4. Refactor `add_medicine_screen.dart:_addMedicine()` to switch on `errorCategory` instead of the current if/else
5. For `transport_error`: show info snackbar, proceed to `addMedicineToInventory()`, let Firestore rules be final gate
6. Hot-restart and test with pilotB (has active subscription → should succeed)
