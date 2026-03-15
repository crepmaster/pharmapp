# Pilot TASK - Exchange E2E v1

**Date**: 2026-03-15
**Status**: Ready for collab pilot
**Target**: `pharmapp_unified`

---

## Objective

Validate that the unified application can complete one same-city medicine exchange from request creation to delivery completion, while preserving city isolation and accounting integrity.

---

## Business outcome to prove

The project should prove that:

- a pharmacy in Douala can find inventory from another pharmacy in Douala
- a pharmacy in Yaounde remains isolated from the Douala workflow
- the exchange flow can complete end to end
- the final money movements and ledger state are coherent

---

## Canonical actors

- Pharmacy A: buyer, Douala
- Pharmacy B: seller, Douala
- Courier C: courier, Douala
- Pharmacy D: control pharmacy, Yaounde

---

## What success looks like

Success means all of the following are true:

1. Same-city search returns the expected inventory.
2. Cross-city search does not leak inventory.
3. Proposal creation, seller acceptance, courier assignment, pickup, and delivery all complete.
4. Final balances match the expected values for all four actors.
5. Ledger entries and inventory changes are coherent with the completed exchange.

---

## Hard boundaries

- run only against `pharmapp_unified`
- do not treat standalone apps as active surfaces for this pilot
- do not expand into unrelated cleanup or migration work
- do not redefine the pilot into multiple scenarios

---

## Evidence required

- search visibility proof
- exchange progression proof
- courier visibility proof
- final balances proof
- Firestore proof for wallets, ledger, and exchanges

