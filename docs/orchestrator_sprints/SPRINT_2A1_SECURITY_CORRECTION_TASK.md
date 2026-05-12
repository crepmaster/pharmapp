# Sprint 2A.1 — F-LICENSE Security Correction

À exécuter dans l'orchestrator uniquement.

## Origine

Architect review post-Sprint-2a (voir [SPRINT_2A_ARCHITECT_REVIEW_FINDINGS.md](SPRINT_2A_ARCHITECT_REVIEW_FINDINGS.md)) a identifié 3 findings bloquants et 2 issues doc. L'orchestrator run `20260512-090822-3bfcff` a été marqué APPROVED prématurément ; la fermeture réelle de Sprint 2a nécessite cette correction.

**Sprint 2B reste bloqué jusqu'à clôture de Sprint 2A.1.**

## Objectif

Fermer les 3 findings sécurité critiques sur le scope F-LICENSE backend :

1. **Findings #1** : Firestore rules `allow create` ne protège pas les champs licence → un client modifié peut s'auto-vérifier au moment de la création de `pharmacies/{uid}`.
2. **Finding #2** : Le flow d'inscription unified app utilise `UnifiedAuthService.signUp(...)` qui écrit `pharmacies/{uid}` direct depuis Flutter — bypass complet de la license-init du backend `createPharmacyUser`.
3. **Finding #3** : `acceptExchangeProposal` et `acceptMedicineRequestOffer` gate uniquement le caller, pas la counterparty. Une proposition créée alors que les 2 parties étaient `verified` reste acceptable même si une partie est passée `rejected` / `expired` entre-temps.

Plus une exigence test :

- **Test harness Firestore rules emulator** ciblé sur les champs licence, suffisant pour prouver la fermeture du finding #1.

## Décisions verrouillées par l'architecte (2026-05-12)

1. **Orchestrator track requis** — pas de direct commit.
2. **Fix finding #2 = Option B transitionnel** :
   - Aucun refactor de registration backend-owned dans 2A.1.
   - Les Firestore rules de 2A.1 doivent **bloquer** les champs licence sur `allow create` côté client.
   - Conséquence : une pharmacy fraîchement créée par `UnifiedAuthService.signUp` n'a aucun champ licence ; le gate marketplace fail-closed pour les pays mandatory (statut absent + `licenseRequired=true` → deny) ; la pharmacie doit appeler `submitPharmacyLicense` pour soumettre.
   - **Option A** (registration backend-owned via callable) est planifiée comme refactor dédié, **idéalement avant ou pendant Sprint 3 Trial**. Tracker comme `TD-LICENSE-REGISTRATION-OWNED`.
3. **Rules emulator test harness inclus dans 2A.1**, ciblé license fields uniquement (pas une suite complète).
4. **Critère non négociable** : un test doit prouver qu'une tentative client de créer `pharmacies/{uid}` avec `licenseStatus: "verified"` échoue.

## Périmètre autorisé

- `firestore.rules` (étendre la protection licence à `allow create`, et garder `allow update`)
- `functions/src/acceptExchangeProposal.ts` (gate counterparty)
- `functions/src/acceptMedicineRequestOffer.ts` ou helper `functions/src/lib/requestProposalBridge.ts` (gate seller)
- nouveau harness Firestore rules tests (chemin à définir par l'explorer, candidates: `functions/firestore-rules-tests/`, `tests/firestore-rules/`, ou `functions/src/__tests__/firestore-rules.test.ts` avec script Jest séparé)
- `functions/package.json` (ajouter `@firebase/rules-unit-testing` en devDependency + script `test:rules`)
- `CLAUDE.md` (backlog : 2a corrigé, 2A.1 en cours, 2b bloqué jusqu'à clôture 2A.1 ; ajouter TD-LICENSE-REGISTRATION-OWNED)
- `docs/orchestrator_sprints/SPRINT_2A_LICENSE_BACKEND_TASK.md` (note rétroactive : APPROVED par orchestrator mais correction sécurité 2A.1 a été requise par architecte)
- ce contrat (statut final)

## Périmètre interdit

- **Pas de refactor registration backend-owned** (Option A déférée).
- **Pas de touche à `unified-auth-service.dart` ou `UnifiedAuthService`** : registration Flutter direct reste tel quel pour 2A.1.
- Pas d'UI (toujours 2B scope).
- Pas de changement Bloc 2, trial, money, wallet, autres callables non listés.
- Pas de deploy prod.

## Solution Architect Refactoring Challenge (obligatoire)

Avant tout edit, répondre :

1. Firestore rules `allow create` doit-elle interdire la **présence** des champs licence dans `request.resource.data`, OU vérifier qu'ils sont **absents**, OU les deux (interdire la présence en allow create, interdire le changement en allow update) ?
2. Le helper `pharmacyLicenseFieldChanged` existant est-il réutilisable au moment de `allow create` (où `resource` n'existe pas) ? Sinon faut-il un helper séparé `pharmacyLicenseFieldAbsent` ?
3. Pour le gate counterparty dans `acceptExchangeProposal`, l'appel à `assertLicenseAllowsMarketplace(db, proposal.fromPharmacyId)` doit-il être à l'extérieur de la transaction (lecture additionnelle avant la tx) ou à l'intérieur (re-read dans la tx pour cohérence) ? Trade-off : performance vs cohérence stricte.
4. Pour `acceptMedicineRequestOffer`, où le seller pharmacy ID est-il déterminé dans le pipeline `acceptRequestOfferIntoCanonicalProposal` ? La gate-call s'insère avant la transaction ou dans la transaction ?
5. Le rules emulator harness ajoute-t-il une dépendance Java/Firebase emulator au CI ? Si oui, comment isoler le `test:rules` du `npm test` standard pour ne pas casser CI ?
6. Faut-il une régression test pour le flow `signUp` Flutter qui prouve que `pharmacies/{uid}` est créée sans champ licence aujourd'hui ? Ou suffit-il du rules test ?
7. La doc backlog CLAUDE.md doit-elle mentionner `TD-LICENSE-REGISTRATION-OWNED` (Option A future) comme blocker de Sprint 3 Trial ?

**Décision** : `Decision: EXTEND | REFACTOR_FIRST | STOP`

## Explorer read-only

1. Lire le rapport architecte `SPRINT_2A_ARCHITECT_REVIEW_FINDINGS.md`.
2. Inspecter `firestore.rules` actuel : helper `pharmacyLicenseFieldChanged`, et la section `allow create` de `match /pharmacies/{userId}`.
3. Inspecter `functions/src/acceptExchangeProposal.ts` : à quel endroit lire `proposal.fromPharmacyId` puis injecter le gate counterparty.
4. Inspecter `functions/src/acceptMedicineRequestOffer.ts` et `functions/src/lib/requestProposalBridge.ts` : où le seller pharmacy ID est déterminé, peut-on gate avant la tx.
5. Inspecter `functions/package.json` : version Jest, dépendances déjà installées, scripts existants.
6. Inspecter `shared/lib/services/unified_auth_service.dart` pour confirmer (read-only) que le flow `signUp` n'écrit jamais de champs licence aujourd'hui (ce qui assure la compat avec la nouvelle rule deny-on-create).
7. Répondre `SAFE TO PROCEED`.

## Writer

Implémenter par lots :

### Lot A — Firestore rules deny-on-create + deny-on-update

- Dans `match /pharmacies/{userId}` :
  - `allow update` reste : `isOwner(userId) && isValidPharmacyData(...) && (les 9 champs licence inchangés)`.
  - `allow create` devient : `isOwner(userId) && isValidPharmacyData(...) && pharmacyLicenseFieldsAbsentAtCreate(request.resource.data)`.
- Nouveau helper :
  ```javascript
  function pharmacyLicenseFieldsAbsentAtCreate(data) {
    return !data.keys().hasAny([
      'licenseStatus', 'licenseVerifiedBy', 'licenseVerifiedAt',
      'licenseRejectionReason', 'licenseGraceEndsAt',
      'licenseNumber', 'licenseCountryCode',
      'licenseDocumentUrl', 'licenseExpiryDate'
    ]);
  }
  ```
- Note : le callable backend `createPharmacyUser` continue d'utiliser admin SDK et bypass les rules.

### Lot B — Counterparty gate

- `acceptExchangeProposal` :
  - Après lecture du proposal doc (et de `proposal.fromPharmacyId`), insérer `await assertLicenseAllowsMarketplace(db, proposal.fromPharmacyId)`.
  - Faire ça **avant** de débiter le wallet ou de créer la delivery.
- `acceptMedicineRequestOffer` ou helper :
  - Identifier le seller pharmacy ID (probablement `offer.sellerPharmacyId` ou équivalent dans `requestProposalBridge.ts`).
  - Gate avant le commit transaction. Si l'API actuelle ne le permet pas proprement, ajouter une lecture pré-transaction.

### Lot C — Rules emulator test harness ciblé

- `npm install --save-dev @firebase/rules-unit-testing` dans `functions/`.
- Script `test:rules` dans `functions/package.json` :
  ```json
  "test:rules": "firebase emulators:exec --only firestore --project=demo-pharmapp \"jest --config jest.rules.config.cjs\""
  ```
  (ou équivalent qui orchestre l'emulator + Jest).
- Nouveau fichier Jest config `functions/jest.rules.config.cjs` pour isoler de `npm test`.
- Nouveau fichier test (chemin à choisir par l'explorer) avec **au minimum** :
  - **TEST CRITIQUE** : client authentifié `alice` essaie de `setDoc("pharmacies/alice", { ...validPharmacyData, licenseStatus: "verified" })` → MUST FAIL.
  - Client `alice` essaie create avec `licenseVerifiedBy: callerUid` → MUST FAIL.
  - Client `alice` create normal sans aucun champ licence → MUST PASS.
  - Client `alice` essaie update set `licenseStatus: "verified"` après create légitime → MUST FAIL.
  - Client `alice` update son `phoneNumber` (champ non-licence) → MUST PASS.
- Le harness ne tourne PAS dans `npm test` standard (pour ne pas exiger Java sur CI). Doc explicite dans `CLAUDE.md` qu'il faut lancer `npm run test:rules` manuellement avant deploy rules.

### Lot D — Documentation

- `CLAUDE.md` :
  - Tableau sprints : ajouter Sprint 2A.1 fermé après run, marquer note "2a APPROVED orchestrator mais sécurité corrigée en 2A.1 sur findings architecte".
  - Backlog `F-LICENSE (2a backend)` → `Livré + correction sécurité 2A.1 appliquée`.
  - Backlog : nouveau row `F-LICENSE (2a.1)` → `Livré`.
  - Backlog : nouveau row `TD-LICENSE-REGISTRATION-OWNED` → `Option A future : refactor inscription pharmacy en backend-owned callable. À planifier idéalement avant Sprint 3 Trial pour aligner trial gate sur write path canonique`.
  - Section Testing : note sur `npm run test:rules` à exécuter avant deploy rules.
- `SPRINT_2A_LICENSE_BACKEND_TASK.md` statut final : ajouter note rétroactive "APPROVED par orchestrator mais l'architecte a requis correction Sprint 2A.1 — voir lien".
- Statut final dans ce contrat.

## Critères de done

- Firestore rules deny les 9 champs licence sur `allow create` ET `allow update`.
- Test rules emulator passe : create avec `licenseStatus: "verified"` → fails. Create sans licence → passes. Update licence côté client → fails.
- `acceptExchangeProposal` gate counterparty `fromPharmacyId`.
- `acceptMedicineRequestOffer` gate seller pharmacy.
- Suite backend Jest : non-régression sur les 144 tests existants.
- `cd functions && npm run build && npm run lint && npm test` ✅
- `cd functions && npm run test:rules` ✅ (au moins 4 scénarios passent)
- CLAUDE.md backlog reflète 2a corrigé, 2A.1 fermé, 2b déblo­qué, `TD-LICENSE-REGISTRATION-OWNED` créé.

## Conditions de non-régression

- L'inscription pharmacie unified app (`UnifiedAuthService.signUp`) continue de fonctionner pour les pays non mandatory et mandatory (la pharmacie atterrit sans champ licence ; gate fail-closed sur mandatory ; la pharmacie soumet via `submitPharmacyLicense` pour devenir éligible).
- Les 144 tests backend de Sprint 2a restent verts.
- Les 5 callables marketplace gardent leur gate caller. Le nouveau gate counterparty s'ajoute, ne le remplace pas.

## Validation minimale

```bash
cd functions && npm run build
cd functions && npm run lint
cd functions && npm test
cd functions && npm run test:rules
cd shared && dart analyze
```

Si `test:rules` échoue à cause de l'environnement emulator (Java manquant en CI par exemple), documenter explicitement et l'isoler du pipeline CI standard. Le test reste exécutable manuellement.

---

## Statut final — 2026-05-12

**Run orchestrator :** `20260512-200553-7f698f`

**Décision architecte (Solution Architect Refactoring Challenge) :** EXTEND. Tous les artefacts de 2A sont conservés, on ajoute uniquement la rule deny-on-create + counterparty gate + harness — pas de refactor du gate ni de la registration.

### Livré

**Lot A — Firestore rules deny on create**

- Helper `pharmacyLicenseFieldsAbsentAtCreate(data)` ajouté dans
  [firestore.rules](../../firestore.rules), interdit la **présence** dans `request.resource.data` (au moment du create) des 9 champs licence (`licenseStatus`, `licenseVerifiedBy`, `licenseVerifiedAt`, `licenseRejectionReason`, `licenseGraceEndsAt`, `licenseNumber`, `licenseCountryCode`, `licenseDocumentUrl`, `licenseExpiryDate`).
- `allow create` du match `/pharmacies/{userId}` enforce ce helper.
- `allow update` (Sprint 2a) conserve le helper `pharmacyLicenseFieldChanged` pre/post existant.
- Les callables backend (`submitPharmacyLicense`, `adminVerifyPharmacyLicense`) tournent avec admin SDK et bypass les rules — seul write path légitime pour la licence.

**Lot B — Counterparty gate**

- [functions/src/acceptExchangeProposal.ts](../../functions/src/acceptExchangeProposal.ts) : read pré-tx du proposal pour récupérer `fromPharmacyId`, puis `assertLicenseAllowsMarketplace(db, fromPharmacyId)` **avant** la transaction wallet/delivery. Throw générique `failed-precondition` si la counterparty n'est plus éligible.
- [functions/src/acceptMedicineRequestOffer.ts](../../functions/src/acceptMedicineRequestOffer.ts) : read pré-tx de l'offer pour récupérer `sellerPharmacyId`, puis `assertLicenseAllowsMarketplace(db, sellerUid)` avant le `runTransaction` qui invoque le bridge.
- Le caller gate (Sprint 2a) reste — la counterparty est un ajout, pas un remplacement.

**Lot C — Rules emulator harness**

- Dépendances ajoutées dans [functions/package.json](../../functions/package.json) : `@firebase/rules-unit-testing@^5.0.1` et `firebase@^12.13.0` (client SDK requis par la lib pour l'API modulaire `setDoc`, `updateDoc`).
- Nouveau [functions/jest.rules.config.cjs](../../functions/jest.rules.config.cjs) : config Jest dédiée matchant uniquement `firestore-rules.test.ts`, `testTimeout: 30000` pour l'emulator cold-boot.
- [functions/jest.config.cjs](../../functions/jest.config.cjs) (standard) exclut désormais `firestore-rules.test.ts` via `testPathIgnorePatterns` → `npm test` reste runnable sans Java/emulator.
- Nouveau [firebase.json](../../firebase.json) section `emulators` minimale (`firestore` port 8080, UI désactivée, `singleProjectMode`) requise par `firebase emulators:exec`. Scope étendu d'1 sous-section JSON, justifié comme prérequis technique pour le harness.
- Script `npm run test:rules` ajouté : `firebase emulators:exec --only firestore --project=demo-pharmapp-rules "jest --config jest.rules.config.cjs"`. Spin-up + tear-down emulator automatique.
- [functions/src/__tests__/firestore-rules.test.ts](../../functions/src/__tests__/firestore-rules.test.ts) : 12 tests verts couvrant les 4 scénarios mandatory du brief + variantes :
  - REQ-2A1-001 ✅ **critère non négociable architecte** : client create `licenseStatus="verified"` → DENIED
  - REQ-2A1-002 à 006 : autres champs licence (`licenseVerifiedBy`, `licenseVerifiedAt`, `licenseGraceEndsAt`, `licenseNumber`, `licenseRejectionReason`) → DENIED
  - REQ-2A1-007 : create sans champ licence → ALLOWED
  - REQ-2A1-008 à 010 : update post-create avec champ licence → DENIED
  - REQ-2A1-011 : update non-licence (phoneNumber) → ALLOWED
  - REQ-2A1-012 : admin SDK bypass documenté

**Lot D — Documentation**

- [CLAUDE.md](../../CLAUDE.md) : tableau sprints ajoute 2A.1, note rétroactive sur 2a, backlog F-LICENSE découpé (2a livré+corrigé, 2A.1 livré, 2b débloqué, `TD-LICENSE-REGISTRATION-OWNED` tracké comme Option A future).
- [SPRINT_2A_LICENSE_BACKEND_TASK.md](SPRINT_2A_LICENSE_BACKEND_TASK.md) : note rétroactive en tête du statut final.
- Ce contrat (statut final).

### Validations exécutées

- `cd functions && npm run build` ✅ tsc clean
- `cd functions && npm run lint` ✅ eslint clean
- `cd functions && npm test` ✅ **144/144 pass** (rules tests correctement exclus)
- `cd functions && npm run test:rules` ✅ **12/12 pass** (rules emulator)
- `cd shared && dart analyze` (non-régression depuis 2a — pas de changement Dart en 2A.1)

### Non-régression

- Sprint 2a backend reste intact : licenseGate, 3 callables, gate sur 5 callables marketplace, init licence dans `createPharmacyUser`.
- Sprint 2a tests : 19 tests licenseGate verts.
- 125 tests pré-2a : tous verts.
- Inscription pharmacie non mandatory : conserve son comportement (création sans licence, gate transparent).
- Inscription pharmacie mandatory : le client peut toujours créer son pharmacy doc sans champ licence ; le gate marketplace fail-closed jusqu'à `submitPharmacyLicense` + verify.

### Limites assumées (en plus de celles de 2a)

- **Registration write path canonique** : Sprint 2A.1 utilise l'Option B transitionnelle. Le flow réel app Flutter (`UnifiedAuthService.signUp`) reste un write Firestore direct. La rule deny-on-create empêche la faille sécurité (auto-vérification) mais le design cible (Option A backend-owned) est repoussé à `TD-LICENSE-REGISTRATION-OWNED`, planifié idéalement avant Sprint 3 Trial pour aligner trial gate sur write path canonique.
- **Marketplace public visibility** (Finding #5 architecte) : reads sur `pharmacies/{uid}` restent `allow read: if isAuthenticated()`. Filtrer les pharmacies non-verified hors marketplace **listing** sera traité en Sprint 2b (UI filters server-side ou client-side, à trancher en explorer 2b).
- **Java 21 warning** : `firebase-tools` annonce drop support pour Java < 21 dans v15. Le harness tourne actuellement sur JDK 17 disponible localement. Bump Java à 21 sera nécessaire avant la prochaine major update de firebase-tools. Non bloquant pour 2A.1.
- **`npm audit`** : 25 vulnérabilités (10 low, 6 moderate, 7 high, 2 critical) reportées par npm sur les dépendances transitives Firebase / rules-unit-testing. Pré-existantes ou amenées par les nouvelles devDeps. Hors scope 2A.1, à traiter dans un audit sécu dédié si besoin.
