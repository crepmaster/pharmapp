# Pilot SPEC - Exchange E2E v1

**Date**: 2026-03-15
**Status**: Ready for collab pilot
**Execution Target**: `pharmapp_unified`

---

## 1. Scope

Implement or complete the minimum execution and verification work needed to prove the canonical Exchange E2E scenario in the unified app.

This spec stays bounded to:

- city isolation
- exchange proposal creation
- seller acceptance
- courier acceptance
- pickup confirmation
- delivery confirmation
- final wallet, ledger, and inventory verification

---

## 2. Repo-aware surface area

The pilot is expected to reason against, and possibly touch, only the code that serves the scenario:

- `pharmapp_unified/lib/screens/pharmacy/*`
- `pharmapp_unified/lib/screens/courier/*`
- `pharmapp_unified/lib/services/exchange_service.dart`
- `pharmapp_unified/lib/services/delivery_service.dart`
- `pharmapp_unified/lib/services/secure_subscription_service.dart`
- `shared/lib/services/unified_auth_service.dart`
- `shared/lib/services/unified_wallet_service.dart`
- `functions/src/createExchangeProposal.ts`
- relevant exchange capture and wallet-related functions
- relevant Firestore rules

This is not blanket permission for broad refactors.
It is the expected technical surface for the pilot.

---

## 3. Mandatory assumptions

1. `pharmapp_unified` is the master application.
2. Standalone `pharmacy_app` and `courier_app` are not valid execution targets for this pilot.
3. The repo HEAD used for the pilot must already be stabilized.
   The stabilization commit must include the pilot brief, task, and spec documents referenced by the mission.
4. `docs/testing/NEXT_SESSION_TEST_PLAN.md` is the active plan for this session.
5. The operator must either prepare the pilot environment or provide explicit setup credentials and instructions.
6. Any non-trivial correction pass must go through `docs/testing/PILOT_PRE_IMPLEMENTATION_ANALYSIS_V1.md` before code changes begin.

---

## 4. Execution requirements

### Pre-analysis gate

Before any non-trivial patch in this pilot, the active pass must record:

- what is already confirmed by code
- what remains ambiguous
- which options were considered
- which points require product or security escalation
- whether coding is allowed to proceed

This pre-analysis must be written in:

- `docs/testing/PILOT_PRE_IMPLEMENTATION_ANALYSIS_V1.md`

If a missing rule affects money, wallet movements, ledger entries, permissions, Firestore rules, city isolation, or pass/fail interpretation, the developer must stop and escalate instead of inventing a local rule.

### Setup

- clean or isolate test data
- create four actors:
  - Pharmacy A, Douala
  - Pharmacy B, Douala
  - Courier C, Douala
  - Pharmacy D, Yaounde
- fund wallets
- seed inventory for Pharmacy B and Pharmacy D

### Workflow checks

- Pharmacy A must see only same-city inventory
- Pharmacy D must not see Douala inventory
- Courier C must see only same-city deliveries
- exchange must progress through creation, acceptance, assignment, pickup, and delivery

### Accounting checks

- final balances must match expected values
- ledger entries must exist and be coherent
- inventory movement must match the completed exchange

---

## 5. Acceptance criteria

The pilot spec is satisfied only if:

1. City isolation is proven both ways.
2. The exchange completes end to end.
3. Wallet balances are correct at the end.
4. Ledger entries are correct at the end.
5. Inventory transfer is correct at the end.
6. No obsolete standalone app is used as a workaround.

---

## 6. Explicit non-goals

- admin migration
- broad UX improvement work
- unrelated bug backlog cleanup
- converting the pilot into a full project readiness review

---

## 7. Outputs

The pilot should produce:

- pre-implementation analysis for each non-trivial correction pass
- evidence package
- concise execution notes
- pass/fail result against the acceptance criteria
- list of discrepancies, if any
