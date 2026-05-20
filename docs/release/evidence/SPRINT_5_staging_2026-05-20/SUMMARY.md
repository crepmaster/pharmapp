# Sprint 5 — Phase 2 staging recette evidence (2026-05-20)

**Project**: `mediexchange-staging` (real Firebase, Blaze, region `europe-west1`)
**Method**: deployed callables driven over HTTPS with real Identity Toolkit
ID tokens (`signInWithPassword`); Firestore reads/setup via Admin SDK (ADC).
Driver: [`functions/scripts/e2eRecetteStaging.mjs`](../../../../functions/scripts/e2eRecetteStaging.mjs).

## Verdict: **PASS** — 8/8 scenarios, 44/44 assertions

See [recette-run.txt](recette-run.txt) (`RESULT (staging): 44 passed, 0 failed`).

| Scénario | Couverture | Preuve |
|---|---|---|
| S1 | Ghana registration sans licence | `LICENSE_REQUIRED` (failed-precondition + details.code) + anti-orphan (0 Auth user) |
| S2 | Ghana registration avec licence | `licenseStatus=pending_verification`, `subscriptionStatus=trial_pending_license`, marketplace gated |
| S3 | Admin verify | `verified` + trial démarré (`subscriptionStatus=trial`) sur les 2 pharmacies |
| S4 | medicine_request purchase | wallet débité 500 ; inv seller intact à l'accept (#5) ; proposal accepted purchase ; delivery pending courierFee=60 (12%) |
| S5 | medicine_request exchange | 1 seul hold = item B requester (#5) ; item A intact ; 0 mouvement wallet (#1) ; courierFee=2400 résolu config (#6) |
| S6 | parity matrix | cross-mode → failed-precondition ; mode/exchangeItem invalides → invalid-argument |
| S7 | fail-closed | pharmacie `pending_verification` bloquée sur les 5 callables marketplace |
| S8 | withdrawal | débit→held ; idempotence (pas de double débit) ; MSISDN mauvais opérateur + montant < min rejetés |

## Audits post-recette

- **Drift** ([drift-audit.txt](drift-audit.txt)): `intersection=48, remote_only=0, local_only=0`, tout nodejs22.
- **Ghana license readiness** ([ghana-audit.txt](ghana-audit.txt)): 0 bucket critique
  (rejected/expired/correction_needed/unknown/misconfig tous à 0). Les
  pharmacies `pending_deny` sont les comptes de test des runs successifs,
  correctement bloqués par le gate.
- **Cloud Logging** ([cloud-logging-sample.txt](cloud-logging-sample.txt)):
  extraits INFO des transactions bridge + withdrawal.

## Setup notes (one-time, real project)

1. `firebase projects:create mediexchange-staging`
2. Blaze billing lié (compte `017CF6-6183A4-ED46A8`).
3. IAM fix: `roles/cloudbuild.builds.builder` au compte de service Compute
   (échec build sinon — politique GCP 2024 sur Cloud Functions 2nd gen).
4. Firestore Native `europe-west1` + Identity Platform `initializeAuth` +
   provider Email/Password activé (sinon `auth/configuration-not-found`).
5. 6 secrets paiement (MTN/Paystack/MoMo/Orange) posés en dummy (functions
   paiement non exercées par la recette).
6. IAM fix: `allUsers roles/run.invoker` sur `acceptexchangeproposal`
   (binding manquant après le premier deploy partiel → 401).

## Caveat

Recette pilotée par callables (pas d'UI Flutter sur staging). Les chemins
serveur (license gate, mode strict, bridge transactionnel, locks #1/#5/#6/#8,
withdrawal MSISDN/min) sont exercés en conditions réelles. La couche UI mobile
reste prouvée séparément par les widget tests + la recette émulateur phase 1.
