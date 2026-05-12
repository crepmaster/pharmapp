# Sprint 2A Architect Review Findings

Date: 2026-05-12
Reviewer role: Solution Architect
Scope: read-only validation of Sprint 2A F-LICENSE backend implementation

## Verdict

**Do not proceed to Sprint 2B yet.**

The orchestrator run `20260512-090822-3bfcff` was finalized as `APPROVED` and commit `d685421` exists, but the architecture review found security and consistency gaps that must be corrected first.

Create a short **Sprint 2A.1 security correction** before Sprint 2B.

## Blocking Findings

### 1. Firestore create path allows license self-verification

File: `firestore.rules`

Current state:

- `match /pharmacies/{userId}` protects license fields on `allow update`.
- `allow create` only checks `isOwner(userId) && isValidPharmacyData(request.resource.data)`.
- `isValidPharmacyData(data)` does not reject extra `license*` fields.

Risk:

A modified client can create `pharmacies/{uid}` directly with `licenseStatus: "verified"` or other backend-controlled license metadata. This bypasses the intended admin verification flow.

Required correction:

- Block all backend-controlled license fields on `allow create`, not only `allow update`.
- At minimum, deny direct client create/write for:
  - `licenseStatus`
  - `licenseVerifiedBy`
  - `licenseVerifiedAt`
  - `licenseRejectionReason`
  - `licenseGraceEndsAt`
  - `licenseNumber`
  - `licenseCountryCode`
  - `licenseDocumentUrl`
  - `licenseExpiryDate`
- Prefer a reusable rules helper such as `pharmacyLicenseFieldsAbsent(data)` or `pharmacyLicenseFieldsUnchanged(before, after)`.
- Add Firestore rules emulator tests proving:
  - client create with `licenseStatus: "verified"` is denied;
  - client create with any protected license field is denied;
  - normal pharmacy create without license fields still works;
  - callable/admin SDK paths remain the only valid write path for license metadata.

### 2. Active Flutter registration path does not use `createPharmacyUser`

Files:

- `shared/lib/services/unified_auth_service.dart`
- `pharmapp_unified/lib/screens/auth/unified_registration_screen.dart`
- `functions/src/auth/unified-auth-functions.ts`

Current state:

- Sprint 2A added license initialization in the backend HTTP function `createPharmacyUser`.
- The active unified app registration flow calls `UnifiedAuthService.signUp(...)`.
- `UnifiedAuthService.signUp(...)` creates Firebase Auth and writes `users/{uid}` + `pharmacies/{uid}` directly from Flutter.

Risk:

The implemented backend initialization is not guaranteed to run for the real app signup path. New pharmacies can be created without initialized license status. The gate fails closed for mandatory countries, but the model is inconsistent and Sprint 2B will inherit two competing write paths.

Required correction:

Choose one architecture and make it explicit:

Option A, preferred:

- Move pharmacy registration to a backend callable / HTTP function that owns creation of `pharmacies/{uid}` and initializes license state.
- Flutter calls the backend creation endpoint instead of writing `pharmacies/{uid}` directly.
- Firestore rules deny client creation of pharmacy profile documents if this is fully migrated.

Option B, acceptable only as a transitional state:

- Keep client-side profile creation but forbid all license fields on create.
- Immediately require `submitPharmacyLicense` for mandatory countries.
- Document that `createPharmacyUser` is legacy / secondary and not the canonical unified app path.
- Add a follow-up ticket to converge registration to a backend-owned write path.

Architect recommendation: **Option A**. Licensing is a regulatory gate; the pharmacy profile creation path should be backend-owned.

### 3. Accept flows gate only the caller, not the counterparty

Files:

- `functions/src/acceptExchangeProposal.ts`
- `functions/src/acceptMedicineRequestOffer.ts`
- `functions/src/lib/requestProposalBridge.ts`

Current state:

- `acceptExchangeProposal` calls `assertLicenseAllowsMarketplace(db, userId)` for the accepting pharmacy only.
- `acceptMedicineRequestOffer` also gates only the caller.
- The counterparty pharmacy is read later, but its license eligibility is not re-evaluated at acceptance time.

Risk:

A proposal or offer created while both parties were valid can be accepted later after the other pharmacy becomes `rejected`, `expired`, or outside grace period. That violates the locked product decision: mandatory-country pharmacies with `licenseStatus != verified` must not create proposals, accept offers, create requests, or participate in marketplace actions.

Required correction:

- At acceptance time, validate license eligibility for both parties.
- For `acceptExchangeProposal`:
  - caller must pass license gate;
  - `proposal.fromPharmacyId` must also pass license gate before acceptance.
- For `acceptMedicineRequestOffer`:
  - requester/caller must pass license gate;
  - `offerData.sellerPharmacyId` must also pass license gate inside the transaction or before committing.
- If the counterparty no longer passes, fail with `failed-precondition` and mark the offer/proposal stale/invalid if that matches existing flow conventions.

## Documentation Issues

### 4. `CLAUDE.md` backlog is stale

File: `CLAUDE.md`

Current state:

- Recent sprints table says Sprint 2A is closed.
- Backlog still lists `F-LICENSE (2a backend)` as `Prêt à exécuter`.
- Backlog still lists `F-LICENSE (2b UI)` as blocked until 2A closure.

Required correction:

- Mark `F-LICENSE (2a backend)` as done or remove it from active backlog.
- Mark `F-LICENSE (2b UI)` as next, but blocked by Sprint 2A.1 security correction.
- Add a short note that 2A was not architect-approved until these findings are resolved.

### 5. Marketplace public visibility requirement is not fully enforced

File: `firestore.rules`

Current state:

- `allow read: if isAuthenticated()` for `pharmacies/{userId}` remains broad.
- Sprint 2A gates write-side marketplace callables, but does not guarantee that non-verified pharmacies disappear from marketplace reads.

Required correction:

- Decide whether visibility is enforced server-side in query surfaces, client-side in UI filters, or both.
- For Sprint 2B, do not rely only on UI hiding if a backend marketplace listing endpoint exists or is introduced.
- Add explicit acceptance criteria: non-verified mandatory-country pharmacies must not appear in pharmacy marketplace/search results after grace expires.

## Sprint 2A.1 Acceptance Criteria

Sprint 2A.1 is complete only when:

1. Firestore rules deny protected license fields on client create and update.
2. Firestore rules tests cover attempted client self-verification.
3. The canonical registration write path is documented and made consistent with license initialization.
4. Accept flows validate both marketplace participants, not only the caller.
5. `CLAUDE.md` and sprint docs reflect that 2A required a security correction before 2B.
6. Existing backend tests remain green.

Suggested validation:

```bash
cd functions && npm run build
cd functions && npm run lint
cd functions && npm test
firebase emulators:exec --only firestore "<rules-test-command>"
cd shared && dart analyze
```

If no Firestore rules test harness exists yet, creating the minimal harness for these license-field tests is part of Sprint 2A.1.
