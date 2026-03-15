# Pilot Brief v1 - Exchange E2E on pharmapp_unified

**Date**: 2026-03-15
**Status**: Proposed pilot scope
**Application**: `pharmapp_unified`
**Pilot mode**: bounded canonical scenario

---

## 1. Objective

Use one real, bounded end-to-end exchange scenario as the first project pilot:

- validate that the current code path in `pharmapp_unified` matches the business workflow
- validate city isolation, exchange execution, courier flow, wallet movements, and ledger consistency
- exercise the collab protocol on a task that is complex enough to challenge assertions, but still bounded

This pilot is not meant to "validate the whole project".
It is meant to validate one high-value workflow through all critical layers.

---

## 2. Why this is the right pilot

This pilot is selected because:

- `pharmapp_unified` is the master application according to
  - `docs/FILE_STRUCTURE_ACTIVE_VS_OBSOLETE.md`
  - `docs/testing/SESSION_2025-10-24_MASTER_APP_MIGRATION.md`
- `docs/testing/NEXT_SESSION_EXCHANGE_TESTING.md` is the most concrete and current workflow plan in the repo
- the scenario crosses the critical layers that matter before broader rollout:
  - pharmacy UI
  - courier UI
  - Firestore rules and filtering
  - Cloud Functions
  - wallet accounting
  - ledger integrity

This is a better pilot than:

- hygiene-only work: useful, but not a pilot
- wallet-only work: too narrow
- admin migration: too broad and too architectural for first pilot

---

## 3. Mandatory pre-pilot actions

These actions must happen before the collab run starts:

1. Stabilize the repo HEAD with a non-collab commit.
   Reason: the pilot must run against a real, reviewable commit. A dirty worktree would make `target_repo_head_sha` misleading and weaken the context firewall.
   This stabilization commit must include this pilot brief and the pilot `TASK` / `SPEC` documents so the developer can complete the required reading without relying on untracked files.

2. Update or retire `docs/testing/NEXT_SESSION_TEST_PLAN.md`.
   Reason: it still references `pharmacy_app` and `courier_app`, which are obsolete for this workflow.

3. Confirm the pilot will run against `pharmapp_unified`, not standalone apps.

If these three conditions are not met, the pilot should not start.

---

## 4. Pilot scope

### In scope

- one canonical exchange workflow in `pharmapp_unified`
- city isolation checks
- exchange proposal creation
- seller acceptance
- courier assignment and delivery completion
- wallet balance verification
- ledger verification
- basic evidence capture

### Out of scope

- admin migration
- broad feature cleanup
- unrelated UX polishing
- non-critical documentation cleanup beyond the stale test plan
- large refactors not required by the scenario

---

## 5. Canonical scenario

### Actors

- **Pharmacy A**: buyer, city = Douala
- **Pharmacy B**: seller, city = Douala
- **Courier C**: courier, operating city = Douala
- **Pharmacy D**: pharmacy, city = Yaounde, used only for isolation proof

### Scenario

1. Pharmacy A searches for Paracetamol.
2. Pharmacy A sees inventory from Pharmacy B in Douala.
3. Pharmacy A does not see inventory from Pharmacy D in Yaounde.
4. Pharmacy A creates an exchange proposal to Pharmacy B.
5. Pharmacy B accepts the proposal.
6. Courier C sees and accepts only the Douala delivery.
7. Courier C confirms pickup.
8. Courier C confirms delivery.
9. Final balances, ledger entries, and inventory deltas match expectations.

This is the single canonical pilot path.

---

## 6. Success criteria

The pilot is successful only if all of the following are true:

1. City isolation works in both directions.
2. The exchange can be created, accepted, assigned, picked up, and delivered without workflow breakage.
3. Pharmacy A, Pharmacy B, Courier C, and Pharmacy D balances match expected post-transaction values.
4. Ledger entries exist and are coherent with the transaction.
5. Inventory changes are correct after completion.
6. Courier visibility is restricted to the courier's city.
7. No workaround depends on obsolete standalone apps.

---

## 7. Expected evidence

Minimum evidence to collect:

- screenshot of Pharmacy A search results showing only Douala inventory
- screenshot or log proving Pharmacy D does not see Douala inventory
- screenshot or log of proposal creation
- screenshot or log of proposal acceptance
- screenshot or log of courier assignment
- screenshot or log of final balances
- snapshot of relevant Firestore records:
  - `wallets`
  - `ledger`
  - `exchanges`
- note on any discrepancy between UI state and backend state

Evidence should be enough to support a post-mortem without rerunning the scenario blindly.

---

## 8. Environment ownership

This pilot is manual and requires a prepared environment.

### Operator responsibilities

Before the developer starts the collab task, the operator must provide or prepare:

- the stabilized repo commit to use for the pilot
- the Firebase project/environment to use
- the four pilot accounts or the clean procedure to create them
- the initial wallet funding actions
- the inventory seeding for Pharmacy B and Pharmacy D
- the runtime target for execution:
  - Chrome
  - emulator
  - or physical device

### Developer responsibilities

The developer is responsible for:

- working only within the scoped pilot surface
- implementing or completing the minimum work needed to make the scenario executable and provable
- recording the evidence and pass/fail result

If credentials, seed data, or runtime target are missing, the developer should stop and escalate rather than guessing.

---

## 9. Expected code areas

The pilot is expected to exercise, at minimum:

- `pharmapp_unified/lib/screens/pharmacy/*`
- `pharmapp_unified/lib/screens/courier/*`
- `pharmapp_unified/lib/services/exchange_service.dart`
- `pharmapp_unified/lib/services/delivery_service.dart`
- `pharmapp_unified/lib/services/secure_subscription_service.dart`
- `shared/lib/services/unified_auth_service.dart`
- `shared/lib/services/unified_wallet_service.dart`
- `functions/src/createExchangeProposal.ts`
- exchange capture / wallet-related Cloud Functions
- relevant Firestore rules

This does not mean all of these files must change.
It means the pilot must be reasoned against this actual surface area.

---

## 10. Collab fit

This task is a good collab pilot because each role has real work:

- **Architect**
  - define the exact test shape
  - bound the scope to one canonical scenario
  - identify the minimum evidence required

- **Developer**
  - implement the missing test harness or supporting changes needed for the scenario
  - keep work anchored in `pharmapp_unified`

- **Challenger**
  - challenge incomplete assertions, especially around balances, ledger, and city isolation
  - challenge any test that passes without proving the business path

- **Auditor**
  - verify that security-sensitive claims are still true
  - especially city isolation, wallet movements, and backend enforcement

Manual arbitration may be required if the pilot touches `firestore.rules` or sensitive backend logic and there is disagreement on acceptable test strategy.

---

## 11. Risks to watch

### Risk 1: Dirty worktree

If the pilot starts before a stabilization commit, the run will be anchored to an unreliable repo state.

### Risk 2: Following stale docs

`docs/testing/NEXT_SESSION_TEST_PLAN.md` still points to obsolete app paths.

### Risk 3: False green from shallow tests

A test that validates only UI states without checking balances, ledger, and backend effects is not sufficient.

### Risk 4: Scope drift

This pilot must not become "finish the whole platform".

---

## 12. Recommended immediate next steps

1. Create a stabilization commit outside collab.
2. Replace or rewrite `docs/testing/NEXT_SESSION_TEST_PLAN.md` so it points to `pharmapp_unified`.
3. Convert this brief into:
   - one `TASK` document: business objective only
   - one `SPEC` document: repo-aware implementation/testing scope
4. Start the collab pilot on this scenario.

---

## 13. Proposed TASK seed

Validate that the exchange workflow works correctly in the unified application for one same-city transaction, while preserving city isolation and accounting integrity.

---

## 14. Proposed SPEC seed

Implement or complete the minimum test and validation work needed to prove the following in `pharmapp_unified`:

- same-city search visibility works
- cross-city visibility is blocked
- exchange proposal flow completes end to end
- courier assignment and delivery complete correctly
- final balances and ledger entries match expected values

Scope must remain limited to the canonical scenario defined in this brief.

---

## 15. Go / No-Go decision

### Go

Start the pilot if:

- HEAD is stabilized
- stale test plan is neutralized
- `pharmapp_unified` is the explicit execution target

### No-Go

Do not start the pilot if:

- the repo remains in an unstable dirty state
- the execution plan still references `pharmacy_app` or `courier_app`
- the scenario expands beyond the canonical exchange flow
