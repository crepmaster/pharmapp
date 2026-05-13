# Sprint 3 — Trial Subscription Gate Aligned With License Verification

À exécuter dans l'orchestrator uniquement.

## Objectif

Construire le trial subscription manquant en l'alignant avec le gate licence.

## Décisions verrouillées

- Pays sans licence obligatoire : trial démarre à l'inscription.
- Pays avec licence obligatoire : trial démarre à `licenseStatus = verified`.
- 30 jours complets garantis après validation licence.
- Une pharmacie non vérifiée ne consomme pas son trial.
- Sprint 3 présuppose Sprint 2A.3 fermé : le trial doit s'accrocher au
  write path canonique backend-owned, pas au create Firestore direct
  historique.

### Décisions verrouillées (mise à jour 2026-05-13, post-F-LICENSE)

> Ces points sont **verrouillés par l'architecte avant run-start**. L'explorer doit confirmer les impacts mais NE doit PAS re-débattre ni proposer d'alternative. Exécuter le verrou.

1. **Retrait du `SubscriptionCreationService.createTrialSubscription` côté client pour le flow pharmacie.**
   - Raison : le trial doit être 100% accroché au write path canonique backend-owned. Le service Flutter actuel écrit dans `subscriptions/{id}` depuis le client alors que `firestore.rules` rend cette collection backend-only. Bruyant et fragile par construction — ne doit plus porter de logique métier.
   - Le call dans [pharmapp_unified/lib/screens/auth/unified_registration_screen.dart:891](../../pharmapp_unified/lib/screens/auth/unified_registration_screen.dart#L891) (`SubscriptionCreationService.createTrialSubscription(...)` après signUp pharmacy) est retiré pour `UserType.pharmacy`. Courier / admin restent sur leur flow legacy (out of scope Sprint 3).

2. **`createPharmacyRegistration` (Sprint 2A.3) devient le seul point d'initialisation trial à l'inscription pharmacie.**
   - **Pays non mandatory** : trial démarre immédiatement. Flat fields sur `pharmacies/{uid}` :
     - `hasActiveSubscription = true`
     - `subscriptionStatus = 'trial'`
     - `subscriptionStartDate = serverTimestamp() (now)`
     - `subscriptionEndDate = now + 30 days`
   - **Pays mandatory + licence fournie** : licence init à `licenseStatus = 'pending_verification'` (déjà géré 2A.3) ET subscription init à :
     - `hasActiveSubscription = false`
     - `subscriptionStatus = 'trial_pending_license'`
     - Pas de `subscriptionStartDate` / `subscriptionEndDate` (trial pas démarré).
   - **Pays mandatory sans licence** : déjà géré par 2A.3 — `LICENSE_REQUIRED` signal, pas d'inscription.

3. **Helper backend `startTrialForPharmacy` transactionnel et idempotent.**
   - Signature : `async function startTrialForPharmacy(db, uid, { trialDurationDays = 30 })`.
   - Idempotence : si `pharmacies/{uid}.subscriptionStatus` est déjà `'trial'` ou `'active'`, retourne `{ started: false, reason: 'already_active' }` sans modifier. Re-verify après rejection, double clic admin, retry callable, ou correction après rejet ne doivent JAMAIS recréer ni rallonger le trial.
   - Transactionnel : Firestore `runTransaction` lecture pharmacy → écriture flat fields, pour éviter race conditions sur double-verify concurrent.
   - **Si trial existe déjà** : pas de mutation. Le 30j initial reste autoritaire (verrou produit : pas d'extension).

4. **`adminVerifyPharmacyLicense` (Sprint 2a) appelle `startTrialForPharmacy` à la transition `licenseStatus → 'verified'`.**
   - Uniquement sur `action === 'verify'` (pas sur `reject` / `correction_needed`).
   - L'appel se fait dans la même transaction que la mutation license, ou immédiatement après commit (à trancher par l'explorer selon faisabilité).
   - Idempotence du helper garantit qu'une 2e verify (après une rejection puis re-soumission) ne crée pas de 2e trial : la pharmacie n'a droit qu'à un seul trial dans sa vie.

5. **`subscriptions/{id}` collection reste backend-only.**
   - Si l'explorer trouve que cette collection est conservée pour audit historique, elle reste backend-only avec `allow read` restreint et `allow write: if false` (déjà en place dans `firestore.rules`).
   - **La source runtime pour gates et rules reste les flat fields `pharmacies/{uid}.subscriptionStatus` + `subscriptionEndDate`**, parce que `hasActiveSubscription()` les lit déjà (firestore.rules:9-22).

6. **Le nouveau statut `'trial_pending_license'` ne doit PAS matcher `hasActiveSubscription()`.**
   - La rule actuelle lit `subscriptionStatus == 'active' || subscriptionStatus == 'trial'`. Conceptuellement OK puisque `'trial_pending_license'` n'est ni l'un ni l'autre — la pharmacie est correctement gatée hors marketplace.
   - **Test rules emulator obligatoire** : pharmacie avec `subscriptionStatus = 'trial_pending_license'` → `canCreateInventory` et `canCreateProposal` retournent false (proxy via `hasActiveSubscription()`).
   - Aucun changement de rule nécessaire si ce test passe. Si l'explorer trouve une incohérence, fixer la rule (pas le statut).

7. **Périmètre Flutter UI restreint à 2B.2a + minimum subscription_screen.**
   - `subscription_screen.dart` doit afficher le bon statut runtime : `trial`, `trial_pending_license`, `active`, `expired`. Pas de nouveau composant — extension d'affichage seulement.
   - Aucun changement aux registration / profile screens (déjà couverts 2B.2a).
   - Aucun marketplace consumer ne doit être retouché.

8. **Pas de split de sprint.** Le scope reste single Sprint 3.

## Résultat attendu

L'onboarding pharmacie a un état subscription fiable :

- `trial_pending_license` si licence obligatoire non vérifiée ;
- `trial` actif 30 jours après inscription ou validation selon pays ;
- expiration claire ;
- source backend autoritaire.

## Périmètre autorisé

- `functions/src/**` pour création/activation trial et tests.
- `shared/lib/models/**`, `shared/lib/services/**` pour lecture status si nécessaire.
- `pharmapp_unified/lib/**` pour affichage onboarding/subscription status.
- `admin_panel/lib/**` si affichage/admin action nécessaire.
- `firestore.rules` uniquement si enforcement subscription existant doit être ajusté.
- docs actives.

## Périmètre interdit

- Pas de paiement réel subscription.
- Pas de pricing refactor.
- Pas de Bloc 2 exchange mode.
- Pas de refactor wallet.
- Pas de migration destructive.

## Explorer read-only

Tâches :

1. Vérifier les fonctions subscription existantes.
2. Confirmer l'absence ou présence de `createTrialSubscription`.
3. Inspecter les champs subscription lus par :
   - inventory ;
   - proposals ;
   - medicine requests ;
   - UI subscription.
4. Inspecter la sortie de Sprint 2 F-LICENSE, incluant 2A.3
   registration backend-owned et 2B UI.
5. Proposer le modèle d'état trial.
6. Identifier la fonction d'activation à appeler quand licence devient `verified`.
7. Définir tests.

Stop conditions :

- Sprint 2A.3 ou Sprint 2B non terminé ;
- modèle subscription actuel incompatible sans refactor large ;
- décision produit manquante sur durée trial ou accès pendant pending license.

## Writer

Implémenter :

1. Helper backend `startTrialForPharmacy` idempotent.
2. Déclenchement à inscription si pays non mandatory.
3. Déclenchement à vérification licence si mandatory.
4. Statut `trial_pending_license` si mandatory non vérifié.
5. UI status clair.
6. Tests.
7. Docs.

## Critères de done

- Nouvelle pharmacie pays non mandatory obtient trial 30j à inscription.
- Nouvelle pharmacie pays mandatory obtient trial 30j à validation licence.
- Validation tardive donne bien 30j complets.
- Fonction idempotente : pas de double trial.
- Gates inventory/proposal/request respectent subscription + license.
- Docs à jour.

## Validation minimale

- `cd functions && npm run build && npm run lint && npm test`
- `cd pharmapp_unified && flutter analyze`
- tests ciblés si disponibles

## Statut final

✅ **Livré 2026-05-14** (orchestrator run `20260513-214326-e4322f`).

### Backend (Lots 1+2+3)

- **Nouveau helper transactionnel idempotent `startTrialForPharmacy`** ([functions/src/lib/startTrialForPharmacy.ts](../../functions/src/lib/startTrialForPharmacy.ts)) :
  - Exporte `shouldStartTrial({subscriptionStatus, subscriptionStartDate})` pur (idempotence rule testable hors Firestore — architect-locked 2026-05-14), `computeTrialEndDate(start, days)` pur (date math testable), `startTrialForPharmacy(db, uid, {trialDurationDays = 30})` async.
  - **Invariant idempotence (architect HIGH 2026-05-14)** : "ONE trial per pharmacy, ever". La décision regarde **deux signaux** :
    - le statut courant : `'trial'` / `'active'` → no-op, reason `'already_active'`.
    - une **trace positive** d'un trial passé : `subscriptionStartDate != null` → no-op, reason `'trial_already_consumed'`. C'est cette deuxième garde qui empêche qu'une pharmacie `expired` / `cancelled` / unknown-post-trial puisse réclamer une 2e fenêtre via re-verify licence, ré-init, ou tout futur trigger.
  - `runTransaction` : lit `pharmacies/{uid}`, applique la décision via `shouldStartTrial(...)`, et seulement si `start: true` écrit atomiquement `{hasActiveSubscription: true, subscriptionStatus: 'trial', subscriptionPlan: 'basic', subscriptionStartDate, subscriptionEndDate, updatedAt}`.
  - Retour discriminé `StartTrialResult.reason` : `'started'` | `'already_active'` | `'trial_already_consumed'` | `'pharmacy_not_found'`.
- **`createPharmacyRegistration`** modifié ([functions/src/createPharmacyRegistration.ts](../../functions/src/createPharmacyRegistration.ts)) :
  - Import `Timestamp` + constante `TRIAL_DURATION_DAYS = 30`.
  - Bloc subscription defaults remplacé par logique conditionnelle sur `licenseStatus` (sortie de `computeInitialPharmacyLicenseStatus`) :
    - `'not_required'` (pays non mandatory) → trial actif inline : `hasActiveSubscription=true`, `subscriptionStatus='trial'`, dates `Timestamp.fromDate(now)` et `now+30j`.
    - `'pending_verification'` (pays mandatory + licence fournie) → `subscriptionStatus='trial_pending_license'`, `hasActiveSubscription=false`, pas de dates.
- **`adminVerifyPharmacyLicense`** modifié ([functions/src/adminVerifyPharmacyLicense.ts](../../functions/src/adminVerifyPharmacyLicense.ts)) :
  - Import `startTrialForPharmacy` depuis `./lib/startTrialForPharmacy.js`.
  - Après `pharmacyRef.update(update)`, si `action === 'verify'`, appelle `startTrialForPharmacy(db, pharmacyId.trim())` dans un try/catch.
  - Trial failure (transaction conflict, network) loggée mais ne propage pas — la verify licence ne doit JAMAIS être annulée parce que le trial helper a planté. L'admin peut retry verify ; idempotence garantit la safety.
  - `reject` / `correction_needed` : le helper trial n'est PAS appelé.
  - Le retour inclut `trialStarted: boolean` pour audit côté caller.

### Tests Jest (Lots 1+2+3 — total +25 incluant correction architect HIGH 2026-05-14)

- [functions/src/\_\_tests\_\_/startTrialForPharmacy.test.ts](../../functions/src/__tests__/startTrialForPharmacy.test.ts) — **18 tests** (was 14 → +4 sur l'invariant `trial_already_consumed`) :
  - 8 `shouldStartTrial` pur :
    - `trial` / `active` → `{start:false, reason:'already_active'}`.
    - `pendingPayment` / `trial_pending_license` / null / missing + pas de `subscriptionStartDate` → `{start:true}`.
    - `expired` SANS `subscriptionStartDate` → `{start:true}` (defensive baseline data-loss).
    - `expired` AVEC `subscriptionStartDate` → `{start:false, reason:'trial_already_consumed'}` (architect HIGH).
    - Future-proofing : `cancelled` / `terminated` / `unknown` + `subscriptionStartDate` → tous `trial_already_consumed`.
  - 2 `computeTrialEndDate` pur : default 30j ; custom N jours.
  - 8 `startTrialForPharmacy` async : pharmacy doc absent → `pharmacy_not_found`, `pendingPayment` → writes trial fields, `trial_pending_license` → writes trial fields (canonical license-verify flow), `trial` → no-op `already_active`, `active` → no-op `already_active`, `expired` + past `subscriptionStartDate` Timestamp → no-op `trial_already_consumed`, `cancelled` + raw millis `subscriptionStartDate` → no-op `trial_already_consumed`, custom `trialDurationDays` propagation.
- [functions/src/\_\_tests\_\_/createPharmacyRegistration.test.ts](../../functions/src/__tests__/createPharmacyRegistration.test.ts) — **+2 tests Sprint 3** (15/15 total, was 13/13) :
  - Non-mandatory → `subscriptionStatus='trial'` + `hasActiveSubscription=true` + dates 30j set, vérifié via `lastPharmacyDocWritten()` helper qui inspecte le batch.set.
  - Mandatory + licence fournie → `subscriptionStatus='trial_pending_license'` + `hasActiveSubscription=false` + dates nulles, `licenseStatus` préservé.
- [functions/src/\_\_tests\_\_/adminVerifyPharmacyLicense.test.ts](../../functions/src/__tests__/adminVerifyPharmacyLicense.test.ts) (NEW) — **5 tests wire-up** :
  - `action='verify'` → `startTrialForPharmacy` appelé avec le `pharmacyId`.
  - `action='reject'` → helper PAS appelé.
  - `action='correction_needed'` → helper PAS appelé.
  - `action='verify'` sur trial déjà actif → helper retourne `{started:false, already_active}`, callable resolves OK avec `trialStarted=false`.
  - `action='verify'` + helper throws → callable resolves OK quand même, le pharmacy update licence a déjà été commité avant le call trial.

### Firestore rules (Lot 5)

- [firestore.rules](../../firestore.rules) inchangé — la rule existante `hasActiveSubscription()` (lignes 9-22) lit `subscriptionStatus == 'active' || subscriptionStatus == 'trial'`, donc `'trial_pending_license'` ne matche déjà PAS. Aucun changement nécessaire.
- [functions/src/\_\_tests\_\_/firestore-rules.test.ts](../../functions/src/__tests__/firestore-rules.test.ts) — **+3 tests Sprint 3** (34/34 total, was 31/31) :
  - **REQ-3-001** : pharmacie avec `subscriptionStatus='trial_pending_license'` → create `exchange_proposals` DENIED.
  - **REQ-3-002** : pharmacie avec `subscriptionStatus='trial'` + `subscriptionEndDate` futur → create `exchange_proposals` ALLOWED (regression guard sur la rule trial gate existante).
  - **REQ-3-003** : pharmacie avec `subscriptionStatus='trial_pending_license'` → create `pharmacy_inventory` DENIED (couvre la deuxième surface gated par `hasActiveSubscription()`).

### Flutter (Lots 4+6)

- [pharmapp_unified/lib/screens/auth/unified_registration_screen.dart](../../pharmapp_unified/lib/screens/auth/unified_registration_screen.dart) :
  - **Architect MEDIUM follow-up 2026-05-14** — le bloc `SubscriptionCreationService.createTrialSubscription` est **retiré complètement** de `_handleRegistration`. La première version Sprint 3 inversait la condition `==/!=` au lieu de supprimer, ce qui déclenchait l'écriture client (rule-bloquée) pour courier/admin. Le retrait propre supprime aussi : le typedef `CreateTrialSubscription`, le champ widget `createTrialSubscriptionOverride` (test seam Sprint 2B.2a devenu mort), l'import `subscription_creation_service.dart`, la constante `_countryCurrencyMap` (sole consumer = trial call retiré), et le binding `userCredential` (sole consumer = trial call retiré — `signUp(...)` est désormais `await` sans nom de retour).
  - Pharmacy passe 100% par `createPharmacyRegistration` (Sprint 2A.3 + Sprint 3 trial init). Courier/admin : aucun appel trial côté client (il n'y en avait jamais eu de légitime, le service écrivait dans une collection rule-locked backend-only).
  - Tests Sprint 2B.2a : `_noopTrial` helper retiré + 4 lignes `createTrialSubscriptionOverride: _noopTrial` retirées du fichier de test. 7/7 widget tests Sprint 2B.2a passent toujours.
- [pharmapp_unified/lib/screens/pharmacy/subscription_screen.dart](../../pharmapp_unified/lib/screens/pharmacy/subscription_screen.dart) :
  - Nouveau state field `_pharmacySubscriptionStatus` lu depuis `pharmacies/{uid}.subscriptionStatus` dans `_loadSubscription`.
  - Nouveau widget `_buildTrialPendingLicenseBanner()` (key `trial_pending_license_banner`) : Container orange avec icône `hourglass_top`, titre "Trial pending license verification" + texte explicatif "Your 30-day trial will start as soon as an administrator verifies your pharmacy licence. Marketplace actions are temporarily disabled.".
  - Banner rendu conditionnellement au-dessus du `_buildCurrentStatusCard()` quand `_pharmacySubscriptionStatus == 'trial_pending_license'`.

### Documentation (Lot 7)

- `CLAUDE.md` : Sprint 3 ajouté au tableau historique sprints. Section "ce qui n'est PAS livré" §3 (Trial subscription auto-création absente) **remplacée** par bloc "✅ Trial subscription livré Sprint 3 (2026-05-14)" qui pointe les artefacts.
- `docs/ACTIVE_DOCS.md` : Sprint 3 déplacé en "Sprints closed". Sprint 4 noté "Prochain sprint, débloqué".
- `docs/orchestrator_sprints/README.md` : ligne 5 (`SPRINT_3`) marquée fermée avec résumé.
- Ce contrat : section "Statut final" présente.

### Validations finales

- `cd functions && npm run build && npm run lint && npm test` : **251/251 Jest** (was 226 → +25 incluant 4 tests architect HIGH 2026-05-14), build + lint clean.
- `cd functions && npm run test:rules` : **34/34** rules emulator (was 31 → +3 Sprint 3).
- `cd shared && dart analyze` : pas de changement (Sprint 3 ne touche pas `shared/`).
- `cd admin_panel && flutter analyze && flutter test` : pas de changement.
- `cd pharmapp_unified && flutter analyze` : clean sur les 2 fichiers touchés (`unified_registration_screen.dart`, `subscription_screen.dart`).
- `git diff --check` : clean.

### Non-régressions

- Sprint 2a / 2A.1 / 2A.2 / 2A.3 callables licence : inchangés (consommation seule).
- Sprint 2B.1 admin operations : inchangé.
- Sprint 2B.2a pharmacy UX + Sprint 2B.2b marketplace : inchangés.
- `subscriptions/{id}` collection : reste backend-only (rule `allow write: if false`). Si conservée, c'est un miroir/audit potentiel — Sprint 3 ne l'alimente pas, mais ne la supprime pas non plus (out of scope).
- Courier/admin signup : flow client-write Sprint 2A.3 préservé. `SubscriptionCreationService.createTrialSubscription` reste utilisé pour eux par compat héritage (out of scope).
- Pas d'upload Firebase Storage. Pas de migration destructive. Pas de deploy prod. Pas de mutation prod.
