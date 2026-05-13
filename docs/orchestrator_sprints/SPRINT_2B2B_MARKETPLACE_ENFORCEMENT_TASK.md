# Sprint 2B.2b — Marketplace Enforcement (Listing Backend-Owned)

À exécuter dans l'orchestrator uniquement, **après** Sprint 2B.2a fermé + APPROVED + finalized.

## Origine

Split du Sprint 2B.2 monolithique acté par l'architecte le 2026-05-13 (verdict B). Le contrat agrégé [SPRINT_2B2_PHARMACY_UX_AND_MARKETPLACE_TASK.md](SPRINT_2B2_PHARMACY_UX_AND_MARKETPLACE_TASK.md) est **superseded**.

Le Sprint 2B.2 est split en :

- **2B.2a** ([SPRINT_2B2A_PHARMACY_UX_TASK.md](SPRINT_2B2A_PHARMACY_UX_TASK.md)) : Pharmacy UX. **Doit être fermé avant 2B.2b**.
- **2B.2b (ce contrat)** : Marketplace Enforcement — listing backend-owned + 6 consumers Flutter migrés + hardening read rules si callable choisi.

## Prérequis (hard dependency)

**Sprint 2B.2a doit être fermé**. Le test de non-régression "pharmacie rejected/correction_needed n'apparaît pas dans le listing mais peut quand même corriger via son profile" nécessite que le flow de correction côté UI existe (sinon on a un cul-de-sac UX pour les rejected). Si 2B.2a n'est pas fermé, l'explorer 2B.2b doit répondre `SAFE TO PROCEED = NO`.

## Objectif

Verrouiller la visibilité marketplace **côté backend** : aucune pharmacie inéligible (rejected, expired, pending-mandatory-out-of-grace, correction_needed) ne doit apparaître dans un listing client. Pas de filtre client fragile. Le contrat hard-block est strict : un client modifié ne peut pas bypasser le filtre.

## DoD (Definition of Done) — architect-locked

1. **Les pharmacies non éligibles disparaissent des listings marketplace côté backend.** Pas un filtre client. Soit un callable backend filtre et retourne uniquement les éligibles, soit un flag matérialisé serveur (`marketplaceVisible`) + rules durcies empêchent le bypass.
2. Les 6 consumers Flutter actuels qui queryent `collection('pharmacies').where(...)` direct pour des listings marketplace sont migrés.
3. Les **lookups individuels** (one pharmacy by uid) restent en Firestore direct s'ils sont nécessaires (profile d'une pharmacie spécifique, etc.) — l'explorer doit distinguer listing vs lookup pour ne pas casser les lookups.
4. Aucun changement à l'admin panel.
5. Aucun changement aux callables Sprint 2a / 2A.1 / 2A.2 / 2A.3 / 2B.1.
6. Aucun changement UX (registration / profile / correction flow) — c'est 2B.2a, déjà fermé.

## Décisions verrouillées

1. **Préférence : option CALLABLE** (`getMarketplacePharmacies`) sauf si l'explorer prouve dans son rapport que :
   - les 6 consumers font *tous* du listing simple sans état complexe (pagination, filtres avancés, jointures locales)
   - **ET** le coût de l'option FLAG (trigger sur `pharmacies` + recompute sur `system_config.countries.*.licenseRequired` flip + scheduled function pour expirer `grace_period` + backfill + durcissement rules) reste raisonnable
   - **ET** le bénéfice perf (pas de round-trip Cloud Function par listing) justifie cette complexité backend.
   
   Sans cette triple preuve : **callable** par défaut, parce que le callable est *frais par construction* — il gère immédiatement `licenseRequired` flip, unknown country, et grace expired sans état matérialisé à maintenir.

2. **Hard block contract** : aucun client modifié ne doit pouvoir lister une pharmacie inéligible. Conséquence :
   - **Si CALLABLE choisi** : `firestore.rules` doit être durci pour interdire `allow list` sur `pharmacies` aux clients non-admin. Le `allow read` individuel (par UID) reste autorisé pour les lookups (profile d'une pharmacie connue, etc.). Documenter explicitement la dette s'il existe une exception.
   - **Si FLAG choisi** : `firestore.rules` doit interdire client write sur `marketplaceVisible` (defense-in-depth, miroir du pattern Sprint 2A.1/2A.2 sur les 9 champs licence) ET le `allow list` doit imposer `where('marketplaceVisible', '==', true)` (rule security guarantee, pas filtre client).

3. Pas de Firebase Storage. Pas de changement à 2B.2a. Pas de deploy prod. Pas de mutation prod.

## Périmètre autorisé

### Si CALLABLE (path préféré) — Backend

- nouveau `functions/src/getMarketplacePharmacies.ts` (`onCall`, region europe-west1)
  - input : `{ countryCode: string, cityCode?: string }`
  - logique : query `pharmacies` filtré par `countryCode + cityCode`, pour chaque pharmacie évalue le license gate via `evaluateLicenseGate` (Sprint 2A.3 fail-closed sur unknown country / system_config absent), ne retourne que celles `allow: true`
  - sortie : `{ pharmacies: [{ uid, pharmacyName, address, locationData, ... }] }` — **PAS** de `licenseStatus` côté output (le client n'a pas à savoir pourquoi telle pharmacie est cachée)
- export dans `functions/src/index.ts`
- nouveau `functions/src/__tests__/getMarketplacePharmacies.test.ts` avec ≥ 7 tests :
  - pharmacie `verified` visible
  - pharmacie `pending_verification` cachée
  - pharmacie en `grace_period` actif visible
  - pharmacie en `grace_period` expiré cachée
  - pharmacie `rejected` cachée
  - pays non mandatory : toutes pharmacies visibles
  - unknown country : 0 pharmacie retournée (fail-closed) + log warn
- `firestore.rules` : durcir `allow list` sur `pharmacies` (admin SDK bypass préservé via callable backend). Documenter dans le commit ce qui change.
- harness `npm run test:rules` étendu : test `client list pharmacies → DENIED ; client read pharmacie individuelle par uid → ALLOWED ; admin SDK list → ALLOWED`.

### Si FLAG (path alternatif) — Backend

- trigger `functions/src/onPharmacyLicenseStatusChange.ts` qui recalcule `marketplaceVisible: bool` à chaque mutation de `pharmacies/{uid}` sur les 9 champs licence + `countryCode`
- trigger `functions/src/onSystemConfigCountriesChange.ts` qui recompute `marketplaceVisible` pour toutes les pharmacies d'un pays quand `licenseRequired` flip
- scheduled function `functions/src/expireGracePeriods.ts` (cron quotidien) qui passe `marketplaceVisible=false` sur les pharmacies dont `licenseGraceEndsAt` est passé
- script `functions/scripts/backfillMarketplaceVisible.mjs` idempotent (pattern `backfillLicenseGracePeriod`)
- `firestore.rules` : `marketplaceVisible` backend-only (deny client write) ; `allow list pharmacies` imposé sur `where('marketplaceVisible', '==', true)`
- tests Jest : trigger pharmacy update, trigger system_config update, scheduled function dry-run + apply, rules emulator (deny write `marketplaceVisible`, allow list seulement filtré)

### pharmapp_unified Flutter (commun aux 2 options)

- migration des 6 consumers marketplace (liste confirmée par l'explorer ; canonique cible) :
  - `pharmapp_unified/lib/screens/pharmacy/requests/medicine_requests_screen.dart`
  - `pharmapp_unified/lib/screens/pharmacy/exchanges/create_proposal_screen.dart`
  - `pharmapp_unified/lib/screens/pharmacy/exchanges/exchange_status_screen.dart`
  - `pharmapp_unified/lib/screens/pharmacy/subscription_screen.dart`
  - `pharmapp_unified/lib/services/inventory_service.dart`
  - `pharmapp_unified/lib/screens/pharmacy/pharmacy_main_screen.dart`
- pour chaque fichier, distinguer **listing** (filtré, à migrer) vs **lookup individuel** (par UID, peut rester en Firestore direct)
- **Si CALLABLE** : remplacer la query par appel `FirebaseFunctions.instanceFor(region: 'europe-west1').httpsCallable('getMarketplacePharmacies').call({...})`, avec loading/error states
- **Si FLAG** : ajouter `.where('marketplaceVisible', '==', true)` à chaque listing concerné. Pas de round-trip supplémentaire.
- widget test négatif global (option CALLABLE) : un test mock qui tente de querier Firestore direct et confirme que les rules durcies retournent zéro (ou erreur permission-denied)
- widget test (option FLAG) : un test prouve que sans le `where('marketplaceVisible', '==', true)`, la rule rejette le listing client → forcing les consumers à le mettre

### Documentation

- `CLAUDE.md` : Sprint 2B.2b ajouté au tableau historique, **F-LICENSE end-to-end LIVRÉ** (closing the whole feature). Section "ce qui n'est PAS livré" §2 retire la mention "marketplace listing filter côté Flutter".
- `docs/ACTIVE_DOCS.md` : 2B.2b fermé.
- `docs/orchestrator_sprints/README.md` : 2B.2b fermé.
- statut final dans ce contrat.
- documenter la dette `TD-MARKETPLACE-RULE-HARDEN` si l'option callable laisse `allow read` individuel autorisé sans condition (justifier le compromis).

## Périmètre interdit

- Aucun changement `admin_panel/**`
- Aucun changement aux callables Sprint 2a / 2A.1 / 2A.2 / 2A.3 / 2B.1 (sauf consommation depuis le nouveau callable marketplace ou le trigger)
- Aucun changement aux écrans Sprint 2B.2a (registration / profile / correction)
- Pas d'upload Firebase Storage
- Pas de migration courier/admin
- Pas de Bloc 2 exchange mode (Sprint 4) ni Trial (Sprint 3)
- Pas de deploy prod
- Pas de mutation prod

## Architecture Evidence Contract

| Path/Field | Write path | Read/consumption path | Authz | Negative/test path | Proof Required |
|---|---|---|---|---|---|
| Marketplace listing (CALLABLE) | n/a (read-only callable) | `getMarketplacePharmacies` callable | callable check : authenticated | rules durcies : `allow list pharmacies` denied côté client ; admin SDK bypass dans la callable | Jest tests ≥ 7 (verified visible, pending cachée, grace-active visible, grace-expired cachée, rejected cachée, country non mandatory toutes, unknown country zéro+warn) ; rules emulator (client list denied, client read by uid allowed, admin SDK list allowed) |
| Marketplace listing (FLAG) | trigger backend uniquement | les 6 consumers utilisent `where('marketplaceVisible', '==', true)` | rules : deny client write `marketplaceVisible` ; allow list seulement si filtre présent | client tente de write `marketplaceVisible=true` → DENIED ; client list sans filtre → DENIED | tests Jest trigger update, tests scheduled expiry, rules emulator (write deny + list deny without filter) |
| Hard block contract | tout chemin direct Firestore client doit aboutir à liste filtrée ou denied | les 6 consumers migrés | rules + callable (selon option) | un test simulant un client modifié qui tente `.collection('pharmacies').where('countryCode', '==', 'GH').get()` doit soit retourner `[]` (option flag, rule auto-filter) soit `permission-denied` (option callable, list denied) | rules emulator dédié dans `firestore-rules.test.ts` |
| 6 consumers migration | n/a (read) | listing endpoint backend = unique source | callable backend OU rule | document chaque fichier touché dans le commit | revue diff des 6 fichiers + widget tests Flutter qui prouvent le câblage |

## Solution Architect Refactoring Challenge (obligatoire)

L'explorer doit répondre **explicitement** :

1. Confirmer la liste exacte des 6 consumers — distinguer listing (à migrer) vs lookup individuel (à laisser) fichier par fichier.
2. **Décision CALLABLE vs FLAG** — justifier en preuve, pas en préférence. Si flag, prouver les 3 conditions (consumers simples, coût acceptable, gain perf justifie). Sinon : callable.
3. Si callable : le durcissement `allow list pharmacies` casse-t-il un consumer existant non listé (admin panel y compris) ? À cartographier.
4. Si flag : la backfill est-elle faisable dans le sprint ou doit-on documenter la dette ? Si flip pré-2B.2b → grace_period à reconstruire, comment ?
5. Comment teste-t-on le hard-block contract sans laisser un trou (rule passe mais callable filtre — quid si admin call et que le filtre callable est buggé) ? Le test rules emulator + Jest doivent se compléter.
6. Y a-t-il un risque de page blanche utilisateur si une pharmacie devient subitement invisible (countryCode flip côté admin) ? Comportement UX souhaité ?

**Décision attendue** : `Decision: CALLABLE | FLAG | STOP`

Stop conditions :

- Sprint 2B.2a non finalisé
- les 6 consumers incluent du code marketplace tellement complexe que migrer demande un refactor large hors scope (à splitter alors en 2B.2b.1 + 2B.2b.2)
- l'option flag est nécessaire mais le coût trigger/scheduler/backfill dépasse le budget sprint — proposer de garder callable et documenter la dette de perf

## Explorer read-only

1. Lire les 6 fichiers consumers candidats listés ci-dessus.
2. Lire `functions/src/lib/licenseGate.ts` (Sprint 2A.3) pour comprendre `evaluateLicenseGate`.
3. Lire `firestore.rules` section `pharmacies` pour cartographier `allow read/list` actuel.
4. Inspecter `functions/src/__tests__/firestore-rules.test.ts` pour le pattern de tests rules emulator.
5. Inspecter `pharmapp_unified/test/**` pour le pattern widget tests.
6. Répondre `SAFE TO PROCEED` avec décision CALLABLE vs FLAG.

## Writer — lots

### Lot 1 — Backend (selon décision explorer)

**Si CALLABLE** :
- nouveau `getMarketplacePharmacies.ts` + export + 7+ tests Jest
- durcir `firestore.rules` `allow list pharmacies`
- harness `test:rules` étendu

**Si FLAG** :
- trigger `onPharmacyLicenseStatusChange.ts` + tests
- trigger `onSystemConfigCountriesChange.ts` + tests
- scheduled `expireGracePeriods.ts` + tests
- script `backfillMarketplaceVisible.mjs`
- durcir `firestore.rules` (deny write `marketplaceVisible`, list-with-filter only)
- harness `test:rules` étendu

### Lot 2 — Migration des 6 consumers Flutter

- pour chaque fichier listing : remplacer la query (CALLABLE) ou ajouter le `.where('marketplaceVisible', '==', true)` (FLAG)
- préserver les lookups individuels (one pharmacy by uid)
- ajouter loading/error states si CALLABLE (round-trip async)

### Lot 3 — Widget tests pharmapp_unified

- au moins 1 widget test par consumer migré qui prouve l'appel au callable / la présence du filtre
- 1 widget test négatif global (selon option) qui prouve le hard-block

### Lot 4 — Documentation

- `CLAUDE.md` : Sprint 2B.2b au tableau historique, F-LICENSE end-to-end LIVRÉ
- `docs/ACTIVE_DOCS.md` : 2B.2b fermé
- `docs/orchestrator_sprints/README.md` : 2B.2b fermé
- statut final dans ce contrat
- dette `TD-MARKETPLACE-RULE-HARDEN` documentée si applicable

## Critères de done

- Backend listing (callable ou flag) opérationnel + ≥ 7 tests Jest
- 6 consumers Flutter migrés
- `firestore.rules` durcies + rules emulator tests verts
- Widget tests pharmapp_unified verts (≥ 6 nouveaux, 1+ par consumer)
- 204 → 211+ backend Jest tests pass (+7 marketplace), zéro régression
- 22 → 25+ rules emulator tests pass, zéro régression
- `cd functions && npm run build && npm run lint && npm test && npm run test:rules` ✅
- `cd shared && dart analyze` ✅
- `cd admin_panel && flutter analyze && flutter test` ✅ (inchangé)
- `cd pharmapp_unified && flutter analyze && flutter test` ✅
- `git diff --check origin/main..HEAD` clean
- CLAUDE.md F-LICENSE marqué **end-to-end LIVRÉ**

## Conditions de non-régression

- inscription pays mandatory : LICENSE_REQUIRED handler (livré 2B.2a) inchangé
- profile + correction (livré 2B.2a) inchangés
- admin V1+V2A→V2C + 2B.1 : inchangés
- exchange / medicine request flow : utilisent désormais le listing filtré (les éligibles uniquement)
- lookup individuel d'une pharmacie par UID : inchangé (rule allow read individuel préservée)

## Validation minimale

```bash
cd functions && npm run build && npm run lint && npm test && npm run test:rules
cd shared && dart analyze
cd admin_panel && flutter analyze
cd pharmapp_unified && flutter analyze && flutter test
```
