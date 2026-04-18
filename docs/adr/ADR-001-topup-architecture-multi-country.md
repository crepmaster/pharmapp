# ADR-001: Top-Up Wallet Architecture for Multi-Country Pharmacy Operations

- Status: Accepted
- Date: 2026-04-18
- Owners: Product / Architecture / Backend
- Scope: Pharmacy wallet top-up, payment orchestration, wallet accounting, customer funds segregation, payment preference source of truth

## Context

PharmApp already contains a meaningful base for wallet and payment flows:

- runtime country/provider master data via `system_config/main`
- role-based registration using canonical `countryCode`, `cityCode`, and `providerId`
- existing wallet, ledger, and payment collections
- direct MTN MoMo callable flow and legacy webhook-based top-up flow
- platform treasury model for subscription revenue and admin payouts

However, the current implementation is not structurally ready for production multi-country top-up, especially for Ghana.

The main architectural issues are:

1. Monetary convention is inconsistent across the codebase.
   Some flows treat wallet amounts as local major units, others as `x100` minor units, and parts of the UI compensate with implicit `/100` display logic.

2. Top-up runtime behavior is still Cameroon-centric.
   Existing runtime validation, provider selection, and top-up UI/backend assumptions remain biased toward `mtn_momo` and `orange_money`.

3. Provider integrations are siloed.
   MTN, Orange, and sandbox behavior are implemented as separate payment flows instead of a single provider-routed orchestration layer.

4. Customer wallet balances do not have a dedicated accounting counterpart.
   Platform treasury currently models platform revenue, not customer funds backing wallet balances.

5. `paymentPreferences` is duplicated.
   The same functional data can live in both `users/{uid}` and role-specific documents such as `pharmacies/{uid}`, creating silent divergence risk.

This ADR defines the target architecture for multi-country pharmacy top-up and the migration strategy to reach it safely.

## Decision

### D1. Monetary values are stored as integers in the smallest currency unit

All payment, wallet, ledger, treasury, and customer-funds amounts must be stored as integers in the smallest unit defined by the runtime currency configuration.

Examples:

- `XAF`: `1500 XAF -> 1500`
- `GHS`: `12.50 GHS -> 1250`
- `KES`: `199.99 KES -> 19999`

The runtime source for formatting and conversion is `CurrencyOption.decimals`.

### D2. No business-critical money flow uses floating-point values

No `double` or floating-point amount is authoritative in:

- payment initiation
- payment settlement
- wallet balances
- ledger entries
- customer funds pools
- platform treasuries
- exchange money movements

Display formatting may convert integer values for presentation, but storage and business logic remain integer-only.

### D3. Canonical monetary field naming uses `*Minor`

Canonical field names for newly introduced or migrated money fields must use explicit suffixes indicating minor-unit semantics.

Examples:

- `amountMinor`
- `availableMinor`
- `heldMinor`
- `pendingMinor`
- `totalCollectedMinor`
- `totalWithdrawnMinor`

This naming removes ambiguity and avoids another wave of mixed conventions.

### D4. A single backend Top-Up Orchestrator becomes the only entry point

All pharmacy top-up flows must pass through one orchestration layer responsible for:

- validating caller, pharmacy, country, provider, and currency
- creating payment intents
- checking provider status
- handling webhooks or polling outcomes
- applying idempotent terminal settlement
- crediting wallet balances exactly once
- writing ledger and settlement records

Provider-specific logic becomes adapter logic behind the orchestrator, not an app-visible flow.

### D5. Routing is based on `providerId`, not on UI assumptions or generic method codes

The runtime key for payment routing is `providerId`, resolved from `system_config/main`.

`methodCode` remains useful for rail/category information, but it is not sufficient as the primary runtime routing key in a multi-country topology.

### D6. The provider schema is extended for runtime routing and validation

Each mobile money provider entry must support the fields needed by orchestration and validation.

Minimum required runtime fields:

- `id`
- `name`
- `countryCode`
- `currencyCode`
- `methodCode`
- `processor`
- `networkCode`
- `enabled`
- `requiresMsisdn`
- `supportsCollections`
- `supportsPayouts`

Recommended extension fields:

- `msisdnRegex`
- `displayOrder`
- `brandColor`
- `logoAsset`
- `callbackMode`
- `statusCheckMode`
- `metadata`

### D7. Customer funds are segregated from platform revenue

Customer wallet backing funds must not be mixed with platform revenue.

`platform_treasuries/{countryCode}_{currencyCode}` remains dedicated to:

- subscription revenue
- commissions
- admin financial operations

A separate accounting store is introduced for customer wallet backing:

- `customer_funds_pools/{countryCode}_{currencyCode}`

Each successful wallet top-up must increase both:

- the user's wallet balance
- the corresponding customer funds pool

### D8. Platform treasury is not the backing account for user wallets

Under no circumstance should platform revenue collections be used as the implicit backing of end-user wallet liabilities.

This is a compliance, auditability, and reconciliation requirement.

### D9. `paymentPreferences` has one runtime source of truth

For pharmacies, the runtime source of truth is `pharmacies/{uid}`.

For couriers, the runtime source of truth is `couriers/{uid}`.

`users/{uid}` may keep generic identity/profile data, but it must not remain the authoritative runtime record for payment behavior.

### D10. Payment status follows an explicit state machine

Canonical states:

- `created`
- `pending`
- `authorized`
- `succeeded`
- `failed`
- `canceled`
- `expired`

Provider-specific statuses must be normalized into this state machine.

### D11. Wallet credit occurs exactly once on terminal success

Wallet credit must occur only on the first valid transition to `succeeded`.

This settlement must be:

- transactional
- idempotent
- auditable
- safe under retries, duplicate callbacks, polling overlap, and provider replays

### D12. New flows adopt the target convention before legacy migration is complete

To reduce delivery risk, new Ghana top-up flows may adopt the target `*Minor` convention before all legacy wallet and ledger data is migrated.

This is an intentional transitional strategy and not a permanent mixed-mode architecture.

## Consequences

### Positive

- aligns with Stripe, Paystack, Flutterwave, and common payment-system practices
- supports both zero-decimal and decimal currencies without hacks
- allows Ghana to be introduced cleanly using `GHS`
- removes provider-specific branching from the app runtime
- makes idempotency and reconciliation tractable
- creates an auditable separation between customer money and platform revenue

### Negative

- requires a staged migration because legacy collections already contain ambiguous monetary semantics
- increases backend orchestration complexity
- requires new reconciliation and operational monitoring
- introduces temporary dual-read compatibility during migration

### Risks if we do nothing

- incorrect wallet balances
- duplicate or missing credits
- country rollout blocked by hidden Cameroon assumptions
- reconciliation gaps between PSP transactions and wallet balances
- compliance and audit exposure due to customer funds commingling

## Implementation Strategy

The delivery sequence intentionally prioritizes speed for the Ghana pilot while protecting the existing Cameroon flow from broad breakage.

### Phase 0: ADR and Audit

Goals:

- freeze the architecture decision
- stop further payment-scope drift
- inventory all monetary fields and conventions in use

Outputs:

- approved ADR
- money-field audit
- migration map by collection and field
- explicit list of legacy read/write paths

### Phase 1a: New Money Convention for New Top-Up Records Only

Goals:

- adopt `*Minor` semantics for newly created top-up payment records
- avoid broad refactors on existing wallet and exchange behavior

In scope:

- new payment intent records
- new provider settlement records
- new orchestrator-related fields

Out of scope:

- legacy wallet balances
- legacy ledger entries
- existing exchange money logic

Rationale:

This phase enables Ghana work to begin on clean monetary semantics without destabilizing the currently working Cameroon runtime.

### Phase 2: Top-Up Orchestrator and MTN Ghana Pilot

Goals:

- introduce the single backend top-up orchestration layer
- route by `providerId`
- support a real Ghana pilot on MTN direct

Target pilot example:

- pharmacy: `Accra1`
- country: `GH`
- city: `accra`
- currency: `GHS`
- provider: `mtn_gh`

Expected outcome:

`Accra1` can initiate a Ghana wallet top-up in `GHS`, receive a provider approval request, and be credited exactly once on terminal success.

### Phase 1b: Legacy Migration to Minor-Unit Convention

Goals:

- migrate legacy wallet and ledger semantics to canonical `*Minor`
- remove implicit `/100` and similar display compensations

Approach:

- introduce dual-read compatibility during migration
- convert legacy fields with collection-specific migration rules
- backfill canonical fields
- switch reads to canonical fields
- remove legacy compatibility once verified

Primary collections:

- `wallets`
- `ledger`
- `payments`
- exchange-related money records

### Phase 3: Ghana Multi-Network Provider Expansion

Goals:

- extend Ghana beyond MTN direct
- support multiple Ghana mobile money networks under one operational model
- integrate the PSP selected by the vendor-routing decision record

Selection of the production Ghana PSP and any regional fallback is explicitly out of scope for this ADR and must be governed by `ADR-002: PSP Selection & Routing`.

### Phase 4: Customer Funds Pool and Settlement Layer

Goals:

- introduce customer funds backing records
- reconcile top-up success against pooled customer liabilities

Key properties:

- every wallet liability has a backing pool record
- pool is per country and currency
- reconciliation can be run against PSP settlement data and wallet totals

### Phase 5: Payment Preferences Deduplication Cleanup

Goals:

- make role documents the only runtime source of truth
- remove silent desynchronization between `users/{uid}` and role collections

Approach:

- migrate reads first
- stop dual writes
- remove legacy fields once all readers are moved

## Operational Rules

### Rule 1

No new country or provider top-up rollout is allowed outside the orchestrator once Phase 2 starts.

### Rule 2

No new money field may be introduced without explicit unit naming.

### Rule 3

Any PSP adapter must define:

- create intent behavior
- final status behavior
- idempotency key strategy
- callback behavior
- reconciliation reference format

### Rule 4

Any wallet credit path must define its exact idempotency boundary before implementation begins.

## Alternatives Considered

### Alternative A: Keep major-unit integer storage

Rejected as the default architecture.

Reason:

- cannot represent fractional currencies safely
- diverges from common PSP patterns
- forces market-specific restrictions that are unnecessary

### Alternative B: Migrate the entire money model before building Ghana

Rejected as the initial execution order.

Reason:

- too risky for existing Cameroon flows
- delays Ghana pilot unnecessarily
- creates a large regression surface before delivering business value

### Alternative C: Reuse platform treasury as wallet backing

Rejected.

Reason:

- mixes customer liabilities and platform revenue
- weak auditability
- poor compliance posture

## Related ADRs

- `ADR-002: PSP Selection & Routing` defines provider selection, PSP rollout order, and routing policy by market and country.
- `ADR-001` remains the stable architecture contract for wallet top-up, monetary semantics, funds segregation, and runtime orchestration boundaries.

## Success Criteria

This ADR is considered successfully implemented when all the following are true:

1. A Ghana pharmacy such as `Accra1` can top up in `GHS`.
2. The wallet is credited exactly once on terminal success.
3. The flow uses `providerId`-based orchestration.
4. New top-up records use explicit minor-unit semantics.
5. Customer wallet backing is segregated from platform revenue.
6. Payment preferences are read from a single runtime source of truth.

## Review Triggers

This ADR must be revisited if any of the following changes:

- the product introduces bank transfer top-up as a first-class wallet funding rail
- the platform adds cross-currency wallet balances
- a regulator requires stricter safeguarding or reporting structures
- the orchestrator boundary or customer-funds segregation model changes materially

## References

Internal:

- `functions/src/index.ts`
- `functions/src/mtnMomoTopupIntent.ts`
- `functions/src/mtnMomoCheckStatus.ts`
- `functions/src/lib/platformTreasury.ts`
- `functions/src/lib/platformPayout.ts`
- `shared/lib/models/payment_preferences.dart`
- `shared/lib/services/master_data_service.dart`
- `admin_panel/lib/models/system_config.dart`
- `admin_panel/lib/models/provider_option.dart`
- `docs/specs/CONTRACT_ADMIN_MASTER_DATA_AND_TREASURY_V1.md`

Planned:

- `ADR-002: PSP Selection & Routing`
