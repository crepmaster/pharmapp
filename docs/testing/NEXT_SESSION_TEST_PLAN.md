# Next Session Test Plan - Exchange E2E Pilot

**Last Updated**: 2026-03-15
**Status**: Active source of truth for the next pilot
**Execution Target**: `pharmapp_unified`
**Supersedes**: older next-session plans that referenced `pharmacy_app` and `courier_app`

---

## 1. Session objective

Run one bounded pilot that proves the core exchange workflow in the unified application:

- same-city medicine visibility works
- cross-city visibility is blocked
- an exchange can be created, accepted, assigned, picked up, and delivered
- wallet balances and ledger entries remain coherent

This session is not a broad product validation.
It is a focused pilot for the canonical Exchange E2E scenario.

---

## 2. Source documents

Read in this order before execution:

1. `docs/FILE_STRUCTURE_ACTIVE_VS_OBSOLETE.md`
2. `docs/testing/SESSION_2025-10-24_MASTER_APP_MIGRATION.md`
3. `docs/testing/NEXT_SESSION_EXCHANGE_TESTING.md`
4. `docs/testing/PILOT_BRIEF_EXCHANGE_E2E_V1.md`
5. `docs/testing/PILOT_TASK_EXCHANGE_E2E_V1.md`
6. `docs/testing/PILOT_SPEC_EXCHANGE_E2E_V1.md`

If any older note contradicts these documents, treat the older note as obsolete for this pilot.

---

## 3. Mandatory pre-session conditions

Do not start the pilot unless all items below are true:

1. The repo HEAD has been stabilized with a non-collab commit.
   That commit must include:
   - `docs/testing/PILOT_BRIEF_EXCHANGE_E2E_V1.md`
   - `docs/testing/PILOT_TASK_EXCHANGE_E2E_V1.md`
   - `docs/testing/PILOT_SPEC_EXCHANGE_E2E_V1.md`
2. The pilot is explicitly scoped to `pharmapp_unified`.
3. Firebase backend and required functions are available for the scenario.
4. Test accounts can be created or reset cleanly.
5. Evidence capture is ready.

If the worktree is still in a misleading intermediate state, do not start.

---

## 4. Execution target

### Active target

- `pharmapp_unified/`

### Not to be used for this pilot

- `pharmacy_app/`
- `courier_app/`
- `admin_panel/` as a pilot target

Those directories may still exist in the repo, but they are not the execution surface for this pilot.

---

## 5. Canonical pilot scenario

### Actors

- Pharmacy A: buyer, city = Douala
- Pharmacy B: seller, city = Douala
- Courier C: courier, operating city = Douala
- Pharmacy D: pharmacy, city = Yaounde, isolation control

### Workflow

1. Pharmacy A searches for Paracetamol.
2. Pharmacy A sees Pharmacy B inventory in Douala.
3. Pharmacy A does not see Pharmacy D inventory from Yaounde.
4. Pharmacy A creates an exchange proposal to Pharmacy B.
5. Pharmacy B accepts the proposal.
6. Courier C sees and accepts the delivery in Douala.
7. Courier C confirms pickup.
8. Courier C confirms delivery.
9. Final balances, ledger entries, and inventory changes are verified.

This is the only required pilot path for the session.

---

## 6. Session phases

### Phase 0 - Preflight

- confirm emulator or test device readiness
- confirm Firebase connectivity
- confirm backend functions needed for exchange are available
- confirm the repo and branch state used for the pilot
- confirm who owns environment setup for this run:
  - operator
  - or developer with explicit credentials and setup instructions

### Phase 1 - Environment setup

- clean or reset test data as needed
- create the four pilot actors
- credit wallets
- seed inventory for Pharmacy B and Pharmacy D

### Phase 2 - Isolation proof

- Pharmacy A search shows only Douala inventory
- Pharmacy D search does not expose Douala inventory
- Courier C sees only Douala deliveries

### Phase 3 - Exchange execution

- create proposal
- seller acceptance
- courier acceptance
- pickup confirmation
- delivery confirmation

### Phase 4 - Accounting proof

- verify final wallet balances
- verify ledger entries
- verify inventory transfer

### Phase 5 - Evidence and close

- capture screenshots and Firestore evidence
- document any mismatch between UI and backend state
- record pass/fail against success criteria

---

## 7. Success criteria

The session is successful only if all of the following are true:

1. City isolation works in both directions.
2. The complete exchange path executes without workflow breakage.
3. Final balances match expected values.
4. Ledger entries are present and coherent.
5. Inventory changes reflect the completed exchange.
6. Courier visibility is restricted by operating city.
7. No step depends on obsolete standalone apps.

---

## 8. Expected balances

Use these expected final values unless the business rules are intentionally updated before execution:

| Actor | Initial | Final |
|------|---------|-------|
| Pharmacy A | 100,000 XAF | 47,000 XAF |
| Pharmacy B | 50,000 XAF | 97,000 XAF |
| Courier C | 0 XAF | 6,000 XAF |
| Pharmacy D | 75,000 XAF | 75,000 XAF |

If the implementation uses different fee or capture rules, the difference must be explained explicitly in the pilot notes.

---

## 9. Evidence to collect

Minimum evidence:

- Pharmacy A search results showing only Douala inventory
- proof that Pharmacy D cannot use Douala inventory
- proposal created
- proposal accepted
- courier assigned
- delivery completed
- final balances
- Firestore snapshots for:
  - `wallets`
  - `ledger`
  - `exchanges`

Evidence must be enough to support a post-mortem without rerunning the scenario blindly.

---

## 10. Risks and anti-patterns

### Risks

- starting from a dirty or unstable HEAD
- following obsolete app paths
- proving only UI behavior without backend/accounting proof
- expanding the pilot into broad cleanup work

### Anti-patterns

- testing in `pharmacy_app` or `courier_app`
- treating a partial happy path as sufficient
- skipping ledger verification
- skipping city isolation verification

---

## 11. Deliverables from the session

At the end of the pilot, produce:

- a concise pilot execution note
- the collected evidence
- a pass/fail decision against the success criteria
- a short list of discrepancies or follow-up fixes

---

## 12. Immediate next action

Use this plan together with:

- `docs/testing/PILOT_TASK_EXCHANGE_E2E_V1.md`
- `docs/testing/PILOT_SPEC_EXCHANGE_E2E_V1.md`

Those two files define the actual pilot task to run under the collab workflow.

---

## 13. Deferred follow-up backlog

This backlog is intentionally out of scope for the current pilot and must not delay pilot execution.

- [ ] After the Exchange E2E pilot, define a Git-based agent handoff workflow that minimizes manual relay between Claude and Codex.
- [ ] After the pilot, specify the machine-readable contract for a future meta-orchestrator script:
  - mission status file
  - execution report file
  - review file
  - iteration and stop conditions
- [ ] Only after the pilot post-mortem, decide whether to implement a local script to automate the Claude -> review -> Claude loop.
