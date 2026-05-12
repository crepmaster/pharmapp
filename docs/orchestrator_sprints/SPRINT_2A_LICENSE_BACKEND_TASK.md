# Sprint 2a — F-LICENSE Backend Foundation

À exécuter dans l'orchestrator uniquement.

## Origine

Split du Sprint 2 monolithique acté par l'architecte le 2026-05-12 dans
[SPRINT_2_SCOPING_PROPOSAL.md](SPRINT_2_SCOPING_PROPOSAL.md). Le run
`20260512-071930-295390` (Sprint 2 monolithique) est abandonné.

## Objectif

Poser la fondation backend complète de la licence pharmacie obligatoire
configurable par pays : modèles de données, helpers, gates marketplace,
backfill grace period, Firestore rules et tests. Aucune UI dans ce
sprint. La feature doit être **testable end-to-end via Jest/CLI** mais
non utilisable côté humain sans Sprint 2b.

## Décisions verrouillées rappelées

1. Source de vérité : `system_config/main.countries.{countryCode}`.
2. Pays existants activés rétroactivement avec délai de grâce 30 jours.
3. Accès limité tant que `licenseStatus != verified`, sauf période de grâce.
4. Validation function-based dès ce sprint.
5. Pas de hardcode Ghana comme stratégie principale.

## Modèle cible country (à ajouter dans `system_config/main.countries.{code}`)

- `licenseRequired: bool`
- `licenseLabel: string`
- `licenseHelpText: string`
- `licenseVerificationRequired: bool`
- `licenseFormatRegex: string?`
- `licenseDocumentRequired: bool`
- `licenseGracePeriodDays: number` (default `30` si absent)

## Modèle cible pharmacy (à ajouter dans `pharmacies/{uid}`)

- `licenseNumber: string?`
- `licenseCountryCode: string?`
- `licenseStatus: not_required | pending_verification | verified | rejected | correction_needed | expired | grace_period`
- `licenseExpiryDate: timestamp?`
- `licenseDocumentUrl: string?` (metadata-only en 2a — upload réel en 2b)
- `licenseVerifiedBy: uid?`
- `licenseVerifiedAt: timestamp?`
- `licenseRejectionReason: string?`
- `licenseGraceEndsAt: timestamp?`

## Gate d'accès (à enforcer via helper backend)

Pour un pays `licenseRequired = true`, une pharmacie non `verified` et
hors période de grâce active :

**Autorisé** : créer/éditer profil, préparer inventaire privé,
soumettre/corriger licence (`submitPharmacyLicense`).

**Interdit** par les callables `createExchangeProposal`,
`acceptExchangeProposal`, `createMedicineRequest`,
`submitMedicineRequestOffer`, `acceptMedicineRequestOffer`.

## Périmètre autorisé

- `shared/lib/models/master_data_snapshot.dart` (extend `MasterDataCountry`)
- `shared/lib/services/master_data_service.dart` (parse nouveaux champs)
- `functions/src/auth/unified-auth-functions.ts` (`createPharmacyUser` : init licence côté write)
- `functions/src/submitPharmacyLicense.ts` (nouveau, metadata-only)
- `functions/src/adminVerifyPharmacyLicense.ts` (nouveau, backend-only)
- `functions/src/backfillLicenseGracePeriod.ts` (nouveau, dry-run + commit idempotent)
- `functions/src/lib/licenseGate.ts` (nouveau helper)
- `functions/src/index.ts` (exports des nouveaux callables)
- `functions/src/createExchangeProposal.ts` (apply gate)
- `functions/src/acceptExchangeProposal.ts` (apply gate)
- `functions/src/createMedicineRequest.ts` (apply gate)
- `functions/src/submitMedicineRequestOffer.ts` (apply gate)
- `functions/src/acceptMedicineRequestOffer.ts` (apply gate)
- `firestore.rules` (protect license fields)
- `functions/src/__tests__/**` (tests ciblés license)
- docs actives strictement nécessaires (`CLAUDE.md`, ce contrat)

## Périmètre interdit

- Aucune UI : pas de touche à `admin_panel/**`, ni
  `pharmapp_unified/lib/screens/**`, ni
  `shared/lib/screens/**`. UI sera Sprint 2b.
- Aucun upload Storage réel : `licenseDocumentUrl` est traité comme une
  URL opaque stockée tel quel. L'upload réel sera Sprint 2b.
- Aucun deploy prod, aucune mutation prod.
- Aucun changement Bloc 2 exchange mode (Sprint 4).
- Aucun changement trial subscription (Sprint 3).
- Aucun refactor money global, auth global, wallet/ledger.

## Solution Architect Refactoring Challenge (obligatoire)

Avant tout edit, l'explorer doit produire dans son rapport une section
`Solution Architect Refactoring Challenge` qui répond explicitement aux
7 questions suivantes, et conclut par une décision :

1. `system_config/main.countries.{code}` est-il la seule source
   canonique pour les champs license ? Y a-t-il un autre modèle pays
   concurrent dans `shared/`, `admin_panel/`, ou Firestore qui
   risquerait de diverger ?
2. Existe-t-il déjà un modèle pays concurrent dans
   admin/shared/mobile qu'il faut consolider avant d'ajouter les champs ?
3. Quel helper unique doit porter la vérité du gate licence ? Un seul
   helper `licenseGate.ts` doit être lu par tous les callables sensibles.
4. Quels write paths peuvent actuellement créer ou modifier une
   pharmacie ? `createPharmacyUser` ? Direct Firestore writes via
   `pharmacies/{uid}` ? Tous doivent passer par la même initialisation
   licence.
5. Quels read paths consomment l'accès marketplace ? Lister les 5
   callables ciblés et confirmer qu'ils sont les seuls.
6. Quelles données licence doivent être protégées par Firestore rules
   pour interdire au client de s'auto-vérifier ?
7. Quel backfill est nécessaire pour pharmacies existantes au moment
   où un pays passe `licenseRequired=true` ? Comment garantir
   l'idempotence ?

**Décision finale obligatoire** :

```text
Decision: EXTEND | REFACTOR_FIRST | STOP
```

Si un modèle canonique manque ou si un write path parallèle existe, 2a
doit faire le refactor minimal **avant** d'ajouter les gates.

## Explorer read-only

Tâches :

1. Inspecter `MasterDataSnapshot`, `MasterDataService`, modèles Country
   dans `shared/` et `admin_panel/` pour détecter une duplication.
2. Inspecter `createPharmacyUser` et tous les write paths existants sur
   `pharmacies/{uid}`.
3. Inspecter `firestore.rules` section `match /pharmacies/{userId}`.
4. Inspecter les 5 callables marketplace pour le point d'injection du
   gate.
5. Inspecter les patterns de tests existants
   (`createWithdrawalRequest-min-resolution.test.ts`,
   `createWithdrawalRequest-msisdn.test.ts`) pour reproduire le style.
6. Définir le plus petit patch livrant les modèles + helpers +
   write paths + gates + backfill + rules + tests.
7. Répondre `SAFE TO PROCEED = YES/NO`.

Stop conditions :

- modèle pays dupliqué nécessitant un refactor large hors scope ;
- impossibilité de poser le gate sans toucher l'UI ;
- besoin d'un upload Storage réel pour `submitPharmacyLicense`
  (le borner à metadata-only et noter la dette).

## Writer

Implémenter par lots sûrs :

1. **Master data backend-readable** : extend `MasterDataCountry` côté
   shared avec les 7 champs licence, parsing côté `MasterDataService`.
2. **`licenseGate.ts` helper** : lecture `pharmacies/{uid}` +
   `system_config/main.countries.{code}`, calcul de `licenseStatus`
   effectif (avec respect de `licenseGraceEndsAt`), API
   `assertLicenseAllowsMarketplace(uid): Promise<void>` qui throw
   `HttpsError("failed-precondition", "...")` générique sans fuite.
3. **`createPharmacyUser` extension** : initialise correctement
   `licenseStatus` selon la config pays au moment de l'inscription :
   - pays sans `licenseRequired` ou `licenseRequired=false` →
     `not_required`
   - pays `licenseRequired=true` + `licenseNumber` fourni avec format
     valide → `pending_verification`
   - pays `licenseRequired=true` + pas de licence → refus inscription
     (ou statut `pending_verification` avec doc à compléter, à trancher
     dans l'explorer en s'alignant sur le contrat licence label/help text).
4. **`submitPharmacyLicense`** (callable, owner-only, metadata-only) :
   permet à la pharmacie de soumettre/corriger `licenseNumber`,
   `licenseDocumentUrl` (URL opaque, pas d'upload Storage), met le
   statut à `pending_verification`. Vérifie le format regex si
   configuré.
5. **`adminVerifyPharmacyLicense`** (callable, admin/super_admin
   country-scoped) : transitionne le statut à `verified` / `rejected`
   / `correction_needed`, écrit `licenseVerifiedBy`,
   `licenseVerifiedAt`, et `licenseRejectionReason` si applicable.
6. **`backfillLicenseGracePeriod`** (callable, admin-only) : pour un
   pays donné qui vient de passer `licenseRequired=true`, calcule
   `licenseGraceEndsAt = activationDate + licenseGracePeriodDays` pour
   toutes les pharmacies de ce pays sans `licenseStatus`, met
   `licenseStatus=grace_period`. Mode `dryRun: bool` obligatoire.
   Idempotent (re-run ne re-écrase pas une pharmacie déjà traitée).
7. **Application du gate** aux 5 callables marketplace : ajouter
   `await assertLicenseAllowsMarketplace(uid)` en tête de chaque
   callable, après l'auth check mais avant toute autre validation.
8. **Firestore rules** : interdire au client de write sur
   `licenseStatus`, `licenseVerifiedBy`, `licenseVerifiedAt`,
   `licenseRejectionReason`, `licenseGraceEndsAt`. Seul le backend
   (service account) peut. Le client peut write sur `licenseNumber`,
   `licenseCountryCode`, `licenseDocumentUrl`, `licenseExpiryDate` mais
   uniquement via le callable `submitPharmacyLicense` (pas en direct).
9. **Tests Jest** ciblés :
   - **pays non mandatory** → pharmacy created with
     `licenseStatus=not_required`
   - **pays mandatory + licence valide** →
     `licenseStatus=pending_verification`
   - **pays mandatory sans licence ou format invalide** → refus
     (ou statut pending selon décision explorer, doit être documenté)
   - **regex invalide** → refus avec message non-leaky
   - **`verified`** → `assertLicenseAllowsMarketplace` passe
   - **`pending_verification` / `rejected` / `correction_needed` /
     `expired`** → `assertLicenseAllowsMarketplace` throw
   - **`grace_period` non expiré** → passe
   - **`grace_period` expiré** → throw
   - **`backfillLicenseGracePeriod` dryRun** → retourne un rapport
     count, n'écrit rien
   - **`backfillLicenseGracePeriod` commit puis re-run** → second run
     idempotent (count=0 affecté)
   - **error messages des gates ne leak ni `licenseNumber` ni
     `licenseStatus` interne**
10. **Docs** : update `CLAUDE.md` pour Sprint 2a fermé + section
    "Statut final" dans ce contrat.

## Critères de done

- 7 nouveaux champs sur `MasterDataCountry` côté shared, parsing OK.
- 4 nouveaux callables exportés depuis `functions/src/index.ts`.
- Helper `licenseGate.ts` utilisé par les 5 callables marketplace.
- Firestore rules denies sur les 5 champs backend-controlled.
- `backfillLicenseGracePeriod` dry-run + commit, idempotent.
- Tests Jest verts : couvrent les 11 scénarios listés.
- Suite backend totale : non-régression sur les 125 tests existants
  (≥ 125 + nouveaux tests license).
- `CLAUDE.md` reflète Sprint 2a fermé.
- Aucune UI touchée (`admin_panel/**` et `pharmapp_unified/**` strictement
  à `git status` = vide).

## Conditions de non-régression

2a ne doit pas casser :

- inscription pharmacie pays non mandatory
- exchange proposal purchase existant
- medicine request purchase-only existant
- admin country-scoped RBAC existant
- les 125 tests backend existants

## Validation minimale

```bash
cd functions && npm run build
cd functions && npm run lint
cd functions && npm test
cd shared && dart analyze
```

Pas de `flutter analyze` côté admin/unified en 2a — aucune UI touchée.

---

## Statut final — 2026-05-12

> ⚠️ **Note rétroactive (architect review post-finalize, 2026-05-12)** :
> L'orchestrator a marqué ce run APPROVED à l'itération 1, mais la revue
> architecte a identifié 3 findings sécurité critiques (Firestore rules
> `allow create` non protégées, registration Flutter direct bypass du
> `createPharmacyUser` backend, accept flows ne gate pas la counterparty).
> Les correctifs sont livrés dans **Sprint 2A.1** — voir
> [SPRINT_2A1_SECURITY_CORRECTION_TASK.md](SPRINT_2A1_SECURITY_CORRECTION_TASK.md)
> et [SPRINT_2A_ARCHITECT_REVIEW_FINDINGS.md](SPRINT_2A_ARCHITECT_REVIEW_FINDINGS.md).
> Sprint 2A est fermé **fonctionnellement**, mais sa clôture sécurité a
> nécessité Sprint 2A.1. La leçon est intégrée dans la procédure : tout
> run orchestrator APPROVED reste sujet à une revue architecte humaine.

**Run orchestrator :** `20260512-090822-3bfcff`

**Décision architecte (Solution Architect Refactoring Challenge) :** EXTEND. Aucun modèle pays concurrent à consolider, le shared `MasterDataCountry` est l'unique modèle runtime, l'unique helper `licenseGate.ts` porte la vérité du gate, write paths convergent sur `createPharmacyUser` + futur `submitPharmacyLicense`/`adminVerifyPharmacyLicense`, 5 read paths marketplace clairement identifiés, 9 champs Firestore à protéger énumérés, backfill idempotent via skip-if-licenseStatus.

**Livré :**

1. **Master data extension shared** ([shared/lib/models/master_data_snapshot.dart](../../shared/lib/models/master_data_snapshot.dart), [shared/lib/services/master_data_service.dart](../../shared/lib/services/master_data_service.dart)) : `MasterDataCountry` reçoit 7 nouveaux champs (`licenseRequired`, `licenseLabel`, `licenseHelpText`, `licenseVerificationRequired`, `licenseFormatRegex`, `licenseDocumentRequired`, `licenseGracePeriodDays`), tous nullable / défaut sûr pour préserver le comportement historique des pays non mandatory.
2. **License gate helper** ([functions/src/lib/licenseGate.ts](../../functions/src/lib/licenseGate.ts)) : evaluator pur `evaluateLicenseGate(pharmacy, country, now?)` + wrapper async `assertLicenseAllowsMarketplace(db, uid)`. Type `LicenseStatus` exporté avec 7 valeurs. Defensive parsing sur `licenseGraceEndsAt` (Timestamp, epoch ms, broken toMillis → tous gérés). Error message uniforme côté HttpsError sans fuite du statut interne ni du pays.
3. **3 nouveaux callables** :
   - `submitPharmacyLicense` ([functions/src/submitPharmacyLicense.ts](../../functions/src/submitPharmacyLicense.ts)) : owner-only, metadata-only (URL document opaque), valide regex pays si configuré, transitionne `pending_verification`, clear `licenseRejectionReason` au resubmit
   - `adminVerifyPharmacyLicense` ([functions/src/adminVerifyPharmacyLicense.ts](../../functions/src/adminVerifyPharmacyLicense.ts)) : admin/super_admin country-scoped, transitions `verify | reject | correction_needed`, écrit `licenseVerifiedBy` + `licenseVerifiedAt`, exige `reason` pour reject/correction
   - `backfillLicenseGracePeriod` ([functions/src/backfillLicenseGracePeriod.ts](../../functions/src/backfillLicenseGracePeriod.ts)) : admin-only, `dryRun: true` par défaut, idempotent (skip si `licenseStatus` déjà set), batching 400 ops, rapport `{affected, skipped, total, gracePeriodDaysUsed}`
4. **Gate appliqué aux 5 callables marketplace** : `createExchangeProposal`, `acceptExchangeProposal`, `createMedicineRequest`, `submitMedicineRequestOffer`, `acceptMedicineRequestOffer`. Injection après l'auth check, avant toute autre validation. Aucun changement de logique métier.
5. **`createPharmacyUser` license init** ([functions/src/auth/unified-auth-functions.ts](../../functions/src/auth/unified-auth-functions.ts)) : helper pur `computeInitialLicenseStatus(countryLicenseRequired, hasLicenseNumber)`, post-create update du `licenseStatus` (`not_required` vs `pending_verification`), `licenseCountryCode` initialisé depuis le pharmacy doc. Si l'update échoue, log warn mais ne fail pas le create (gate fail-closed sur licenseStatus manquant + licenseRequired).
6. **Firestore rules** ([firestore.rules](../../firestore.rules)) : interdiction client-side mutation sur les 9 champs licence (`licenseStatus`, `licenseVerifiedBy`, `licenseVerifiedAt`, `licenseRejectionReason`, `licenseGraceEndsAt`, `licenseNumber`, `licenseCountryCode`, `licenseDocumentUrl`, `licenseExpiryDate`). Helper rule `pharmacyLicenseFieldChanged(before, after, name)`. Callables backend bypass les rules (admin SDK).
7. **Exports `functions/src/index.ts`** ([functions/src/index.ts](../../functions/src/index.ts)) : section "Pharmacy License (Sprint 2a F-LICENSE)" avec les 3 nouveaux callables.
8. **Tests** ([functions/src/__tests__/licenseGate.test.ts](../../functions/src/__tests__/licenseGate.test.ts)) : 19 tests couvrant les 11 scénarios du brief + cas defensive (Timestamp / epoch ms / broken toMillis / unknown status / null).

**Validations exécutées :**

- `cd functions && npm run build` ✅ tsc clean
- `cd functions && npm run lint` ✅ eslint clean
- `cd functions && npm test` ✅ **144/144 pass** (était 125 → +19 nouveaux licenseGate, zéro régression)
- `cd shared && dart analyze` ✅ 5 issues pré-existantes (unused fields dans unified_auth_service, deprecated withOpacity dans country_payment_selection_screen), 0 nouvelle issue introduite par Sprint 2a

**Non-régression :**
- Pays non mandatory : `evaluateLicenseGate` renvoie `allow / country_not_required` → aucun blocage marketplace, même pour pharmacies `rejected` (le flag pays fait foi)
- Inscription pharmacie pays non mandatory : `licenseStatus=not_required` écrit, aucun blocage
- Exchange / medicine request purchase-only existants : gate transparent pour pharmacies dans pays non mandatory, ou `verified`, ou `grace_period` actif
- Admin V2A country-scoped RBAC : `adminVerifyPharmacyLicense` et `backfillLicenseGracePeriod` réutilisent le même pattern (lecture `admins/{uid}`, vérification `countryScopes`)
- 125 tests pré-existants : tous verts

**Aucune UI touchée :** `git status --short` confirme `admin_panel/**` et `pharmapp_unified/**` à zéro modifs. Strictement conforme au périmètre Sprint 2a.

**Prérequis pour Sprint 2b (UI) :**
- Sprint 2a doit être finalisé orchestrator-side (APPROVED + run-finalize OK)
- Pre-deploy : avant de pousser Sprint 2a en prod, exécuter `backfillLicenseGracePeriod` en `dryRun: true` sur chaque pays qui passe `licenseRequired=true` pour estimer l'impact, puis en `dryRun: false`. Aucun deploy effectué dans ce sprint.

**Limites assumées :**
- `submitPharmacyLicense` accepte `licenseDocumentUrl` comme chaîne opaque. Pas d'upload Firebase Storage réel — Sprint 2b décidera si on intègre Storage ou si l'URL reste fournie par le client.
- Les Firestore rules s'appuient sur `request.resource.data` vs `resource.data`. Si le client n'envoie pas le champ, `request.resource.data` ne le contient pas → considéré "presence change". Cela suppose que le client maintient le shape complet du document à chaque update. Si un client envoie un update partiel sans réenvoyer les champs licence, l'update sera refusé. Pratique standard dans cette codebase (les Flutter writes envoient le map complet via `set`/`update`).
