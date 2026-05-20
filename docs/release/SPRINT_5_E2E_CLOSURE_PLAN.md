# Sprint 5 — E2E Closure Plan

**Date** : 2026-05-14 (phase 1 emulator 2026-05-20, phase 2 real staging 2026-05-20)
**Statut** : phase 1 emulator 8/8 PASS + **phase 2 real Firebase staging 8/8 PASS (44/44 assertions)** → **PASS**
**Preuves phase 2** : [evidence/SPRINT_5_staging_2026-05-20/](evidence/SPRINT_5_staging_2026-05-20/SUMMARY.md)
**Pre-lock** : [docs/orchestrator_sprints/SPRINT_5_E2E_CLOSURE_TASK.md](../orchestrator_sprints/SPRINT_5_E2E_CLOSURE_TASK.md)
**Runbook monitoring** : [SPRINT_5_MONITORING_7D.md](SPRINT_5_MONITORING_7D.md)
**Script audit Ghana** : [`functions/scripts/auditGhanaLicenseReadiness.mjs`](../../functions/scripts/auditGhanaLicenseReadiness.mjs)

---

## 1. Préambule — deux flows distincts à NE PAS mélanger (lock #3)

PharmApp possède deux chemins canoniques pour qu'une pharmacie obtienne du
médicament d'une autre. La checklist E2E **nomme explicitement** le flow
testé à chaque scénario.

### Flow A — Exchange proposal canonique (Bloc 1)

```
A initie  →  createExchangeProposal           [callable, region europe-west1]
B accepte →  acceptExchangeProposal           [callable]
livraison →  completeExchangeDelivery         [callable, courier scan QR]
cancel    →  cancelExchangeProposal           [callable]
```

- Type purchase : wallet hold immédiat à la création (`available → held`),
  commit à l'accept (`held → deducted`), capture à la complétion.
- Type exchange (barter via createExchangeProposal) : inventory hold immédiat
  sur `details.exchangeInventoryItemId` à la création.
- Cible : pharmacie A connaît déjà l'inventaire de B (browse marketplace) et
  fait une offre ciblée.

### Flow B — Medicine request (Bloc 2 — Sprint 2A purchase + Sprint 4 exchange)

```
A demande →  createMedicineRequest            [callable, requestMode=purchase|exchange]
B propose →  submitMedicineRequestOffer       [callable, offerType strict match]
A accepte →  acceptMedicineRequestOffer       [callable, routing par offerType]
                ↓
       bridge → acceptRequestOfferIntoCanonicalProposal  (purchase)
              | acceptExchangeRequestOfferIntoCanonicalProposal  (exchange, Sprint 4)
                ↓
       proposal status='accepted', delivery status='pending'
livraison →  completeExchangeDelivery         [même fin de flow que A]
```

- Type purchase : wallet `available → deducted` à l'accept (skip held,
  acceptation immédiate par la requester).
- Type exchange (barter via medicine request, Sprint 4) : inventory hold sur
  `exchangeInventoryItemId` (item B, fourni par la requester) UNIQUEMENT à
  l'accept. Item seller racine décrémenté à `completeExchangeDelivery`.
- Cible : pharmacie A poste un besoin sans connaître les stocks, B répond.

**Les deux flows produisent le même `exchange_proposals/{id}` canonique**
via le helper `buildCanonicalProposalDocument` ([functions/src/lib/exchangePipeline.ts](../../functions/src/lib/exchangePipeline.ts)).
Les fonctions `createExchangeHold`, `exchangeCapture`, `exchangeCancel`
sont **dead-code legacy** dans `index.ts` — aucune UI ne les appelle plus.

---

## 2. Pré-requis recette

### 2.1 Environnement staging

- Project Firebase staging (ex : `mediexchange-staging` ou flag équivalent).
- Functions deployées depuis HEAD courant (`git rev-parse HEAD` = sprint 4
  commit `3ffd67f` ou descendant).
- Indexes Firestore sync (`firebase deploy --only firestore:indexes --project=<staging>`).
- Rules deployées (`firebase deploy --only firestore:rules --project=<staging>`).
- `system_config/main` peuplé :
  - `countries.CM = { licenseRequired: false, defaultCurrencyCode: 'XAF' }`
  - `countries.GH = { licenseRequired: true, licenseFormatRegex: '...', licenseGracePeriodDays: 30, defaultCurrencyCode: 'GHS' }`
  - `citiesByCountry.CM.douala = { deliveryFee: 1000, exchangeFee: 1200 }`
  - `citiesByCountry.GH.accra = { deliveryFee: 2000 }` (laisser exchangeFee absent pour tester fallback deliveryFee × 1.2 = 2400)

### 2.2 Comptes test

| Rôle | Email | Pays/Ville | Setup attendu |
|---|---|---|---|
| Super admin | `admin@staging.test` | global | rôle `super_admin` via console |
| Admin Ghana | `admin-gh@staging.test` | GH (scope) | `countryScopes: ['GH']`, permissions `manage_pharmacies` |
| Pharmacy CM-A | `pharm-cm-a@staging.test` | CM / douala | wallet 100 000 XAF (sandbox credit) |
| Pharmacy CM-B | `pharm-cm-b@staging.test` | CM / douala | wallet 50 000 XAF + inventaire seed |
| Pharmacy GH-A | `pharm-gh-a@staging.test` | GH / accra | sans licence (test mandatory) |
| Pharmacy GH-B | `pharm-gh-b@staging.test` | GH / accra | avec licence valide (test mandatory) |
| Courier | `courier-cm@staging.test` | CM / douala | profil courier activé |

### 2.3 Données seed

- `pharmacy_inventory` : 3 items minimum pour Pharmacy CM-B (medicines DB
  essentielle WHO), 2 items pour CM-A (pour avoir du stock pour exchange
  retour), 2 items pour GH-B.
- Toggle `availabilitySettings.availableForExchange=true` sur au moins 1
  item par pharmacie.

### 2.4 Drift check pre-recette

Exécuter avant la recette :

```bash
node functions/scripts/audit-remote-drift.mjs --project <staging>
# Attendu : 0 drift remote vs local
```

```bash
node functions/scripts/auditGhanaLicenseReadiness.mjs --project <staging> --out audit-staging.csv
# Attendu : doc Ghana en cours de seed, audit doit refléter le state seed
```

---

## 3. Scénarios E2E — 8 obligatoires

Chaque scénario indique le **flow ciblé** (A ou B), les **callables touchés**,
les **collections à vérifier** et les **critères PASS/FAIL**.

### Scénario 1 — Inscription Ghana sans licence → `LICENSE_REQUIRED`

- **Flow** : Auth canonical (`createPharmacyRegistration` Sprint 2A.3).
- **Acteur** : nouvel utilisateur, depuis l'app Flutter mobile.
- **Action** : remplir le form registration Ghana SANS champ licence.
- **Attendu** :
  - `FirebaseFunctionsException` `failed-precondition` avec `details.code='LICENSE_REQUIRED'`.
  - UI re-prompt licence (Sprint 2B.2a handler).
  - Aucun doc créé dans `pharmacies/{uid}`.
- **PASS** : code error correct + UI handler fire + 0 doc créé.
- **FAIL** : pharmacie créée sans licence, ou error code autre.

### Scénario 2 — Inscription Ghana avec licence → `pending_verification` + trial gated

- **Flow** : `createPharmacyRegistration` + Sprint 3 startTrialForPharmacy.
- **Action** : re-tenter inscription avec licence + URL document + expiry.
- **Attendu** :
  - `pharmacies/{uid}` créé avec `licenseStatus='pending_verification'`.
  - `subscriptionStatus='trial_pending_license'`, `hasActiveSubscription=false`.
  - Marketplace gate doit refuser cette pharmacie sur `getMarketplacePharmacies`.
- **PASS** : statut correct + gate marketplace fail-closed.

### Scénario 3 — Verify licence admin → `verified` + trial démarre

- **Flow** : `adminVerifyPharmacyLicense` (Sprint 2a, scope check Sprint 2B.1).
- **Action** : admin GH ouvre `pharmacy_license_review_screen.dart` → Verify.
- **Attendu** :
  - `licenseStatus='verified'`, `licenseVerifiedBy` et `licenseVerifiedAt`
    populés.
  - `startTrialForPharmacy` invoqué → `subscriptionStatus='trial'`,
    `subscriptionStartDate=now`, `subscriptionEndDate=now+30j`,
    `hasActiveSubscription=true`.
  - Re-test marketplace : la pharmacie apparaît désormais dans le listing.
- **PASS** : statut transition correcte + trial démarré + marketplace allow.

### Scénario 4 — Marketplace + medicine request purchase (flow B)

- **Flow** : Bloc 2 Phase 1.
- **Acteur** : Pharmacy CM-A (requester) + CM-B (seller).
- **Action séquence** :
  1. CM-A appelle `createMedicineRequest({ requestMode: 'purchase', medicineId, requestedQuantity: 10, currencyCode: 'XAF' })`.
  2. CM-B appelle `submitMedicineRequestOffer({ offerType: 'purchase', unitPrice: 500, ... })`.
  3. CM-A appelle `acceptMedicineRequestOffer({ requestId, offerId })`.
- **Vérifications Firestore** :
  - `medicine_requests/{rid}.status='matched'`, `selectedOfferId=offerId`.
  - `medicine_request_offers/{oid}.status='converted'`, `linkedProposalId=proposalId`.
  - `exchange_proposals/{pid}.details.type='purchase'`, `reservations.walletReserved=5000`.
  - `deliveries/{did}.status='pending'`, `proposalType='purchase'`,
    `courierFee=1000` (Douala deliveryFee), `currency='XAF'`.
  - `wallets/{cmAUid}.available -= 5000`, `deducted += 5000`.
  - `ledger` 1 entry `proposal_wallet_hold_created`.
- **Suite** : courier accepte → `pickup_at_seller` → `delivered` →
  `completeExchangeDelivery` :
  - `wallets/{cmBUid}.available += 4500` (totalPrice − courier 50/50 share).
  - `wallets/{courierUid}.available += 1000`.
  - `pharmacy_inventory/{itemB}.availableQuantity -= 10`.
  - Nouveau `pharmacy_inventory` doc créé pour CM-A (reception).
- **PASS** : toutes les assertions ci-dessus + ledger trace complète.

### Scénario 5 — Marketplace + medicine request exchange (flow B, Sprint 4)

- **Flow** : Bloc 2 Phase 2 (Sprint 4 livré 2026-05-14).
- **Acteur** : Pharmacy CM-A (requester, veut médicament X) + CM-B (seller,
  veut médicament Y en retour).
- **Action séquence** :
  1. CM-A appelle `createMedicineRequest({ requestMode: 'exchange', medicineId: 'X', requestedQuantity: 10, currencyCode: 'XAF' })`.
  2. CM-B appelle `submitMedicineRequestOffer({ offerType: 'exchange', inventoryItemId: itemXOfB, offeredQuantity: 10, exchangeItem: { medicineId: 'Y', medicineName: 'Drug Y', dosage: '10mg', form: 'tablet', quantity: 20 } })`.
  3. CM-A picker UI : sélectionne `itemYOfA` (matched medicineId+dosage+form,
     qty>=20).
  4. CM-A appelle `acceptMedicineRequestOffer({ requestId, offerId, exchangeInventoryItemId: itemYOfA })`.
- **Vérifications Firestore (clé : lock #5 prouvé)** :
  - `exchange_proposals/{pid}.details.type='exchange'`,
    `exchangeInventoryItemId=itemYOfA`, `exchangeQuantity=20`.
  - `exchange_proposals/{pid}.reservations.inventoryReserved=20`,
    `walletReserved=null`.
  - `pharmacy_inventory/{itemYOfA}.availableQuantity -= 20`,
    `reservedQuantity += 20` ← **seul hold à l'accept**.
  - `pharmacy_inventory/{itemXOfB}` **inchangé** (vérifié à l'accept, hold
    différé à completeDelivery).
  - **0 wallet write** sur les deux pharmacies.
  - `deliveries/{did}.proposalType='exchange'`, `totalPrice=0`,
    `currency=''`, `courierFee=1200` (Douala exchangeFee explicite) ou
    `courierFee=resolveCourierFee()` selon city config.
- **Suite** : courier livre item X de B vers A → `completeExchangeDelivery` :
  - `pharmacy_inventory/{itemXOfB}.availableQuantity -= 10`.
  - `pharmacy_inventory/{itemYOfA}.reservedQuantity -= 20`.
  - Back-office transfer : nouveau doc `pharmacy_inventory` chez CM-B avec
    items Y, nouveau doc chez CM-A avec items X.
  - Courier wallet credit `courierFee`.
  - 50/50 split sur courier fee : `halfBuyer = floor(1200/2) = 600`,
    `halfSeller = 600`. Mais sans `totalPrice`, le seller's `sellerNetCredit`
    est purement courier-fee neutre (pas de medicine payment).
- **PASS** : toutes les assertions + lock #5 (1 inv update à accept, 0 wallet)
  prouvé runtime.

### Scénario 6 — Cross-mode rejection (parity matrix)

- **Action** : Pharmacy CM-A poste request `purchase`. CM-B essaie offer
  `exchange` (avec `exchangeItem` valide).
- **Attendu** : `submitMedicineRequestOffer` → `failed-precondition`,
  `Offer type 'exchange' does not match request mode 'purchase'.`
- **Inverse** : CM-A poste request `exchange`. CM-B essaie offer `purchase`
  avec `unitPrice=500`. Même rejet.
- **PASS** : 2 rejets `failed-precondition` côté backend, snackbar UI propre.

### Scénario 7 — Non-verified pharmacy bloquée sur 5 callables marketplace

- **Setup** : Pharmacy GH-A reste `pending_verification` (Scenario 2 stop).
- **Action** : depuis l'app GH-A, tenter les 5 callables marketplace :
  - `createExchangeProposal`
  - `acceptExchangeProposal`
  - `createMedicineRequest`
  - `submitMedicineRequestOffer`
  - `acceptMedicineRequestOffer`
- **Attendu** : 5x `failed-precondition` avec message générique
  "Marketplace access requires a verified pharmacy license. …" (Sprint 2A).
- **Variante** : tester counterparty gate (Sprint 2A.1 + Sprint 4 lock #8) —
  GH-B verified offre sur request de GH-A pending → submit blocked.

### Scénario 8 — Withdrawal happy path + MSISDN validation

- **Flow** : `createWithdrawalRequest` + `sandboxAdvanceWithdrawal`.
- **Acteur** : Courier après réception fee Scénario 4 ou 5.
- **Action** :
  1. `createWithdrawalRequest({ amountMinor: 100000, currency: 'XAF', methodCode: 'mtn_momo', msisdn: '+237677****56' })`.
  2. Admin / sandbox `sandboxAdvanceWithdrawal({ withdrawalId })`.
- **Vérifications** :
  - Cross-validation operator/prefix (MTN = 67 ou 68 pour CM).
  - Min withdrawal respecté (`system_config minWithdrawalMinor`).
  - `withdrawal_requests/{wid}.status` : `pending → processing → completed`.
  - `wallets/{courierUid}.available -= 100000`.
  - Ledger `withdrawal_debit` entry.
- **Variante MSISDN wrong-prefix** : `+237699xxxxxx` (Orange prefix) avec
  `methodCode='mtn_momo'` → `invalid-argument` (Sprint 1 3.2c-β).
- **Variante missing methodCode** : `methodCode` absent → reject (Sprint 1).

---

## 4. Critères globaux PASS / CONDITIONAL PASS / BLOCKED

> 🔒 **Décision architecte 2026-05-14 — Stratégie hybride** :
>
> - **Phase 1 — Emulator local** ([STAGING_SETUP_EMULATOR.md](STAGING_SETUP_EMULATOR.md)) :
>   débloque rapidement la recette sans coût ni risque prod. Couvre 8/8
>   scénarios côté logique mais **ne suffit pas** comme preuve PASS.
>   But : détecter et corriger les bugs évidents, stabiliser la
>   checklist.
> - **Phase 2 — Real Firebase staging project** ([STAGING_SETUP_FIREBASE_PROJECT.md](STAGING_SETUP_FIREBASE_PROJECT.md)) :
>   recette complète sur un projet Firebase isolé (`mediexchange-staging`).
>   Seule cette phase peut faire transiter Sprint 5 de
>   `CONDITIONAL PASS → PASS`.

### Phase 1 — Emulator recette EXÉCUTÉE (2026-05-20) — 8/8 PASS (logique)

Recette émulateur jouée bout-en-bout. S1, S2-CM, S2-GH, S3 validés via
l'UI Flutter le 2026-05-19 (preuves Firestore runtime). S4→S8 rejoués le
2026-05-20 via le driver [`functions/scripts/e2eRecette.mjs`](../../functions/scripts/e2eRecette.mjs)
qui appelle les **vrais callables** sur le functions emulator avec de
vrais tokens Auth (pas de raccourci Admin SDK), avec assertions Firestore :

| Scénario | Assertions | Preuve clé |
|---|---|---|
| S4 purchase | 12/12 | wallet débité ; inventaire seller intact à l'accept (lock #5) ; proposal `accepted` + delivery `pending` courierFee=12% |
| S5 exchange | 13/13 | **1 seul** hold = item B requester ; item A seller intact (lock #5) ; **0 mouvement wallet** (lock #1) ; courierFee résolu depuis config (lock #6) |
| S6 parity | 8/8 | cross-mode → `failed-precondition` ; mode `either`/exchangeItem incohérent → `invalid-argument` |
| S7 fail-closed | 6/6 | pharmacie `pending_verification` bloquée sur les **5** callables marketplace + contrôle positif |
| S8 withdrawal | 9/9 | débit→held ; idempotence (pas de double débit) ; MSISDN mauvais opérateur rejeté ; montant < min rejeté |

Run consolidé `node functions/scripts/e2eRecette.mjs all` : **48/48 passed**.

Bugs corrigés pendant la recette : (1) `cancelMedicineRequest` read-after-write
en transaction (commit `529156a`) ; (2) `seedInventory.mjs` medicineIds non
alignés avec `EssentialAfricanMedicines` (commit `67d89bd`) ; (3) seed lancé
avec un UID seller erroné (`…ll…` au lieu de `…lI…`) → inventaire orphelin
(fix data emulator + re-seed).

> ⚠️ Conformément à la stratégie hybride ci-dessus, cette phase prouve la
> **logique** mais ne fait PAS transiter Sprint 5 à PASS. Le verdict global
> reste **CONDITIONAL PASS** tant que la phase 2 (real Firebase staging)
> n'est pas exécutée.

### PASS — ✅ ATTEINT 2026-05-20

**Phase 2 real Firebase staging exécutée le 2026-05-20 : 8/8 scénarios PASS,
44/44 assertions** sur `mediexchange-staging` via le driver
[`functions/scripts/e2eRecetteStaging.mjs`](../../functions/scripts/e2eRecetteStaging.mjs)
(callables déployés, ID tokens réels). Drift `remote_only=0 / local_only=0`,
audit Ghana 0 bucket critique. Preuves :
[evidence/SPRINT_5_staging_2026-05-20/](evidence/SPRINT_5_staging_2026-05-20/SUMMARY.md).
Caveat : recette pilotée par callables (UI mobile prouvée séparément par
widget tests + recette émulateur phase 1).

**Critères PASS (rappel) — Sprint 5 transite à PASS uniquement après recette
sur real Firebase staging, pas après émulateur seul.**

- Tous les 8 scénarios passent **sur `mediexchange-staging`** avec
  preuves collectées dans `docs/release/evidence/SPRINT_5_staging_<date>/` :
  - screenshots UI (au moins 1 par scénario).
  - exports Firestore (proposalId, deliveryId, ledger entries).
  - logs Cloud Functions (filtrer par `requestId` / `proposalId`).
- 0 issue critique remontée par audit Ghana.
- Drift audit `remote_only=0`, `local_only=0` post-deploy staging.

### CONDITIONAL PASS (statut actuel Sprint 5 — 2026-05-14)

- Artefacts livrés : audit script + plan E2E + runbook monitoring + truth
  cleanup docs.
- Recette staging **non encore exécutée** (pas de project staging confirmé
  au moment de la livraison du sprint).
- Le sprint peut être marqué clos avec ce statut, mais la décision deploy
  prod **reste conditionnée** à l'exécution ultérieure de la checklist.

### BLOCKED

- Un scénario sur 8 échoue avec impact bloquant (ex : marketplace gate
  bypass possible, wallet inconsistency).
- Audit Ghana révèle > N pharmacies en `pending_verification` depuis
  > X jours sans plan migration.

---

## 5. Preuves à collecter

Pour chaque scénario PASS exécuté, archiver dans `docs/release/evidence/SPRINT_5_<date>/` :

- `S<n>-summary.md` : 1 paragraphe + verdict.
- `S<n>-firestore.json` : exports des docs créés/modifiés.
- `S<n>-logs.txt` : extrait Cloud Logging filtré par requestId.
- `S<n>-ui-<step>.png` : screenshots clés (notamment Scénario 5 inventory
  picker, Scénario 1 LICENSE_REQUIRED snackbar).

---

## 6. Commandes utiles (cheat sheet)

```bash
# Build & deploy staging
cd functions && npm run build
firebase deploy --only firestore:indexes --project <staging>
firebase deploy --only firestore:rules     --project <staging>
firebase deploy --only functions           --project <staging>

# Audits read-only
node functions/scripts/audit-remote-drift.mjs            --project <staging>
node functions/scripts/auditGhanaLicenseReadiness.mjs    --project <staging> --out gh-audit.csv

# Backend tests (avant deploy)
cd functions && npm run build && npm run lint && npm test
# 338+ tests attendus

# Frontend lint
cd pharmapp_unified && flutter analyze
# 6 issues préexistantes hors Sprint 4 OK (qr_scanner + pharmacy_main_screen)
```

---

## 7. Risques résiduels (à la date du Sprint 5)

| Risque | Sévérité | Mitigation |
|---|---|---|
| Recette staging non encore exécutée | High (operational) | CONDITIONAL PASS ; deploy prod reste gated |
| 11 failures préexistantes `unified_registration_screen_test.dart` | Medium | Hors périmètre Sprint 4 ; à fixer dans micro-sprint séparé |
| `functions/lib/index.js` gitignored (build artifact) | Low | regen au deploy via `tsc` |
| Legacy HTTP endpoints `createExchangeHold/exchangeCapture/exchangeCancel` dead-code dans `index.ts` | Low | TD-LEGACY-PHARMACY-HTTP-RETIREMENT planifié post-monitoring 7j |
| Ghana en prod : pharmacies pré-2A.3 sans `countryCode` peuvent fail-close sur le gate | Medium | TD-LICENSE-REGISTRATION-AUDIT (script audit déjà livré Sprint 2A.3.1) |
| `unitPrice` exchange dans medicine_request offer écrit comme 0 (lock #1) | None | Documented, tests Sprint 4 explicit |

---

## 8. Liens

- Pre-lock contrat : [SPRINT_5_E2E_CLOSURE_TASK.md](../orchestrator_sprints/SPRINT_5_E2E_CLOSURE_TASK.md)
- Runbook monitoring : [SPRINT_5_MONITORING_7D.md](SPRINT_5_MONITORING_7D.md)
- Sprint 4 contrat livré : [f-bloc2-p2-medicine_requests_exchange.md](../f-bloc2-p2-medicine_requests_exchange.md)
- Source de vérité projet : [CLAUDE.md](../../CLAUDE.md)
