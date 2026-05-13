# Sprint 2B.1 — Admin License Operations

À exécuter dans l'orchestrator uniquement.

## Origine

Split du Sprint 2B monolithique acté par l'architecte le 2026-05-13. Le run monolithique `20260513-161632-0b66fb` est abandonné/superseded (trop de surfaces simultanées : admin UI, pharmacy registration UI, profile UX, marketplace backend, deux apps Flutter → mélange trop large pour une revue de preuve fiable).

Le Sprint 2B est split en :

- **2B.1 (ce contrat)** : Admin License Operations — super admin configure `licenseRequired` par pays + admin review/verify/reject des licences pharmacie.
- **2B.2** ([SPRINT_2B2_PHARMACY_UX_AND_MARKETPLACE_TASK.md](SPRINT_2B2_PHARMACY_UX_AND_MARKETPLACE_TASK.md)) : Pharmacy UX + Marketplace Enforcement. **Bloqué** jusqu'à clôture 2B.1.

## Objectif

Donner aux admins le contrôle effectif du flag licence par pays et du verdict de vérification des licences pharmacie. Aucun changement registration mobile, profile mobile, ou marketplace dans ce sprint — c'est purement la console super admin + admin pays.

## DoD (Definition of Done) — architect-locked

Un admin doit pouvoir :

1. Activer `licenseRequired=true` pour un pays (ex. Ghana / Cameroun) depuis la console super admin, et modifier les champs associés (`licenseLabel`, `licenseHelpText`, `licenseVerificationRequired`, `licenseFormatRegex`, `licenseDocumentRequired`, `licenseGracePeriodDays`).
2. Voir la liste des pharmacies en statut `pending_verification` ou `correction_needed` filtrée par ses `countryScopes`.
3. Approuver une licence (passer `verified`), la rejeter, ou demander une correction.
4. Toutes les mutations passent par des callables backend avec contrôle de permissions admin / super admin / countryScopes. Aucune écriture Firestore directe depuis l'admin panel sur ces champs.

Hors-DoD :

- Aucun changement à `unified_registration_screen.dart` côté pharmapp_unified.
- Aucun changement au profile pharmacy mobile.
- Aucun changement au marketplace (lecture côté Flutter ou listing endpoint).
- Aucun changement aux callables Sprint 2a / 2A.1 / 2A.2 / 2A.3 existants (sauf ajout strict).

## Décisions verrouillées

1. Source de vérité licence par pays : `system_config/main.countries.{countryCode}` (déjà en place depuis Sprint 2a).
2. Aucune écriture Firestore directe depuis admin panel sur les champs `licenseRequired`, `licenseLabel`, `licenseHelpText`, `licenseVerificationRequired`, `licenseFormatRegex`, `licenseDocumentRequired`, `licenseGracePeriodDays`. Tout passe par un callable backend.
3. Aucune écriture Firestore directe depuis admin panel sur les champs licence pharmacy ; tout passe par `adminVerifyPharmacyLicense` livré en Sprint 2a.
4. RBAC : super_admin peut toucher tous pays ; admin scope-par-pays peut toucher uniquement ses `countryScopes`.

## Périmètre autorisé

### Backend

- nouveau callable `functions/src/setCountryLicenseConfig.ts` (admin + super_admin) qui valide les inputs et upsert `system_config/main.countries.{countryCode}` sur les 7 champs licence uniquement
- export ajouté dans `functions/src/index.ts`
- tests backend Jest pour le callable (admin authz, super_admin authz, country scope match, input validation, fail-closed sur champ invalide)

### Admin panel

- `admin_panel/lib/screens/system_config/countries_tab.dart` : ajouter toggle `licenseRequired` + 6 inputs édition (label, helpText, verificationRequired, formatRegex, documentRequired, gracePeriodDays). Écriture via callable, pas de write Firestore direct.
- `admin_panel/lib/services/system_config_service.dart` : nouvelle méthode `setCountryLicenseConfig({countryCode, ...})` qui appelle le callable.
- nouveau `admin_panel/lib/screens/pharmacy_license_review_screen.dart` : listing pharmacies filtrées par `licenseStatus ∈ {pending_verification, correction_needed}` ET `countryCode ∈ admin.countryScopes`, avec actions `verify` / `reject` / `correction_needed` câblées sur `adminVerifyPharmacyLicense` (Sprint 2a).
- `admin_panel/lib/screens/pharmacy_management_screen.dart` : ajout d'un lien/bouton "License Reviews" vers le nouvel écran.
- widget tests admin pour les 2 écrans (config + review).

### Documentation

- `CLAUDE.md` : statut Sprint 2B.1, backlog mis à jour
- `docs/ACTIVE_DOCS.md` : ajouter 2B.1 + 2B.2
- `docs/orchestrator_sprints/README.md` : refléter 2B → 2B.1 + 2B.2
- ce contrat : section "Statut final" en fin de sprint

## Périmètre interdit

- Aucun changement `pharmapp_unified/**` (out of scope, 2B.2)
- Aucun changement à `unified_registration_screen.dart`, `profile_screen.dart`, ou tout écran mobile
- Aucun changement marketplace (lecture/listing) — backend ou Flutter
- Aucun changement à `createPharmacyRegistration` ni aux callables Sprint 2a / 2A.1 / 2A.2 / 2A.3 (sauf si l'explorer prouve une asymétrie à corriger côté `adminVerifyPharmacyLicense`)
- Pas de modification `firestore.rules` sur les pharmacies/* ou system_config/* (déjà locked-down en 2A.1, 2A.3)
- Pas de upload Storage (out of scope, sprint dédié si besoin)
- Pas de deploy prod

## Architecture Evidence Contract

Conformément au nouveau standard orchestrator (commit `fdd3089`) :

| Path/Field | Write path | Read/consumption path | Authz | Negative/test path | Proof Required |
|---|---|---|---|---|---|
| `system_config/main.countries.{code}.licenseRequired` (et 6 champs licence pays) | **uniquement via `setCountryLicenseConfig` callable** | `MasterDataService` côté shared, déjà parsé depuis Sprint 2a | callable check : `super_admin` OU `admin` avec `countryCode ∈ countryScopes` | non-admin caller / scope mismatch / champ invalide → callable rejette ; Firestore rules deny aussi en defense-in-depth (à vérifier dans l'explorer) | Jest test setCountryLicenseConfig : super_admin OK, admin in-scope OK, admin out-of-scope DENIED, non-admin DENIED, regex invalide DENIED |
| `pharmacies/{uid}.licenseStatus`, `licenseVerifiedBy`, `licenseVerifiedAt`, `licenseRejectionReason` | uniquement via `adminVerifyPharmacyLicense` (déjà livré Sprint 2a) | listing screen admin via stream Firestore (read-only) + adminVerifyPharmacyLicense pour les transitions | callable check : admin / super_admin country-scoped (déjà testé en 2a) | callable rejette ; rules deny client write (Sprint 2A.1, drift guard Sprint 2A.3) | widget test : admin scope CM voit pharmacies CM uniquement, action verify → callable invoked, mutation visible dans UI |
| Listing pharmacies pending_verification / correction_needed | StreamBuilder côté admin sur `pharmacies` filtré par status + countryCode (read seulement) | écran license review | rules read-side autorisent admin authentifié (déjà en place) | aucune écriture côté Flutter | widget test : query filtre attendu (mock Firestore) |
| Lien "License Reviews" dans pharmacy_management_screen | UI navigation Flutter | écran pharmacy management | aucun (lien visible si admin authentifié — éligibilité pays validée par callable backend lors de la transition) | bouton n'apparaît pas pour non-admin (à vérifier — sinon overlap RBAC à creuser dans l'explorer) | widget test : bouton visible + tap → navigation correcte |

## Solution Architect Refactoring Challenge (obligatoire)

L'explorer doit répondre **explicitement** aux questions ci-dessous :

1. `countries_tab.dart` écrit-il Firestore directement aujourd'hui pour les autres champs country (defaultCurrencyCode, dialCode, etc.) ? Si oui, le nouveau callable `setCountryLicenseConfig` doit-il couvrir uniquement les 7 champs licence OU être étendu à tous les champs country pour cohérence (option REFACTOR_FIRST) ?
2. Y a-t-il un callable existant `upsertCountry` ou équivalent à étendre, ou faut-il bien créer un nouveau callable spécifique licence ?
3. `pharmacy_management_screen.dart` (742 lignes) a-t-il déjà un pattern d'action overlay / drawer pour les operations admin, ou faut-il un bouton "License Reviews" qui pousse vers un nouvel écran ?
4. Le pharmacy_license_review_screen doit-il être un StatefulWidget pur consommant un StreamBuilder Firestore, ou doit-il passer par un Bloc existant (admin auth bloc) ?
5. Les widget tests existants dans `admin_panel/test/` utilisent-ils mocktail (comme on a mis en place Sprint 2A.3.1 côté shared/) ou un autre pattern ?
6. L'écran de review doit-il afficher le `licenseDocumentUrl` quand présent ? Comment l'admin le voit-il (URL clickable simple, sans Storage upload réel — c'est juste un texte) ?

**Décision attendue** : `Decision: EXTEND | REFACTOR_FIRST | STOP`

Stop conditions :

- découverte qu'aucun callable n'écrit aujourd'hui les autres champs country et que l'architecture impose de refactorer tout le path d'écriture country en même temps (REFACTOR_FIRST sortirait du scope 2B.1)
- absence de pattern admin RBAC clair (`countryScopes` non lu par les écrans actuels → refactor RBAC large hors scope)

## Explorer read-only

1. Lire `admin_panel/lib/screens/system_config/countries_tab.dart`.
2. Lire `admin_panel/lib/services/system_config_service.dart`.
3. Lire `admin_panel/lib/screens/pharmacy_management_screen.dart`.
4. Inspecter `functions/src/upsertCity.ts` (Sprint 2A V2B) comme template potentiel pour `setCountryLicenseConfig.ts`.
5. Inspecter `functions/src/adminVerifyPharmacyLicense.ts` (Sprint 2a) — pas modifié mais consommé en UI.
6. Inspecter `firestore.rules` section `system_config` et `pharmacies` pour confirmer le defense-in-depth.
7. Inspecter `admin_panel/test/` (si existant) pour le pattern widget test.
8. Répondre `SAFE TO PROCEED`.

## Writer — lots

### Lot 1 — Backend callable `setCountryLicenseConfig`

- nouveau `functions/src/setCountryLicenseConfig.ts` (`onCall`, region europe-west1)
  - input : `{ countryCode: string, licenseRequired?: bool, licenseLabel?: string, licenseHelpText?: string, licenseVerificationRequired?: bool, licenseFormatRegex?: string, licenseDocumentRequired?: bool, licenseGracePeriodDays?: int }`
  - authz : lit `admins/{callerUid}` → vérifie `role ∈ {super_admin, admin}` ; si `admin`, vérifie `countryCode ∈ countryScopes`
  - validation : `licenseFormatRegex` si fourni doit être une regex valide (`new RegExp(...)` ne throw pas) ; `licenseGracePeriodDays` si fourni ≥ 1 et fini
  - écriture : `system_config/main.countries.{countryCode}` merge sur les 7 champs uniquement (pas écrasement des autres champs country)
  - retour : `{ ok: true, countryCode, fields: [...] }`
- export ajouté dans `functions/src/index.ts`
- nouveau `functions/src/__tests__/setCountryLicenseConfig.test.ts` : Jest tests
  - super_admin → OK
  - admin in-scope → OK
  - admin out-of-scope → `permission-denied`
  - non-admin (no admins/{uid} doc) → `permission-denied`
  - unauth → `unauthenticated`
  - regex invalide → `invalid-argument`
  - gracePeriodDays négatif / NaN → `invalid-argument`
  - merge ne pas écraser : test que les autres champs country (defaultCurrencyCode, etc.) restent intacts après update licence

### Lot 2 — Admin countries_tab UI

- `admin_panel/lib/screens/system_config/countries_tab.dart` : ajouter une section "License configuration" par pays avec :
  - `Switch` pour `licenseRequired`
  - `TextField` pour `licenseLabel` (e.g. "Pharmacy License Number")
  - `TextField` multiligne pour `licenseHelpText`
  - `Switch` pour `licenseVerificationRequired`
  - `TextField` pour `licenseFormatRegex` (avec validation côté UI : tester `RegExp(value)` sans throw)
  - `Switch` pour `licenseDocumentRequired`
  - `TextField` numérique pour `licenseGracePeriodDays` (default 30)
  - bouton Save → appelle le callable via `system_config_service`
- `admin_panel/lib/services/system_config_service.dart` : nouvelle méthode `setCountryLicenseConfig({...})` qui invoque le callable

### Lot 3 — Admin pharmacy license review screen

- nouveau `admin_panel/lib/screens/pharmacy_license_review_screen.dart`
  - StreamBuilder sur `pharmacies` filtré par `licenseStatus ∈ {pending_verification, correction_needed}` et `countryCode in admin.countryScopes` (si admin pays-scoped)
  - card par pharmacie avec : pharmacyName, countryCode, licenseNumber, licenseDocumentUrl (texte clickable simple), licenseExpiryDate, licenseStatus, et 3 boutons : Approve / Reject / Request correction
  - Approve : appelle `adminVerifyPharmacyLicense({pharmacyId, action: 'verify'})`
  - Reject : ouvre un dialog "Reason ?" requis non-vide, puis appelle `adminVerifyPharmacyLicense({pharmacyId, action: 'reject', reason})`
  - Request correction : idem mais `action: 'correction_needed'`
- `admin_panel/lib/screens/pharmacy_management_screen.dart` : ajouter un bouton/lien "License Reviews" en haut (visible si admin authentifié) qui push vers le nouvel écran

### Lot 4 — Widget tests

- `admin_panel/test/screens/system_config/countries_tab_license_test.dart` (NEW)
  - Render countries_tab avec un pays mocké, change `licenseRequired` → assert le callable est invoqué avec les bons params
  - validation regex côté UI : champ invalide → bouton Save désactivé
- `admin_panel/test/screens/pharmacy_license_review_test.dart` (NEW)
  - mock Firestore (cloud_firestore_mocks ou stream stubbé) : 2 pharmacies pending_verification CM + 1 pharmacie CM rejected → 2 cartes affichées, pas la 3ᵉ
  - tap Approve → callable `adminVerifyPharmacyLicense` invoqué avec `action: 'verify'`
  - tap Reject avec reason vide → erreur affichée, callable PAS invoqué
  - tap Reject avec reason renseignée → callable invoqué avec `action: 'reject', reason: '...'`

### Lot 5 — Documentation

- `CLAUDE.md` : ajouter Sprint 2B.1 au tableau historique sprints, mettre à jour le backlog (F-LICENSE 2B → split 2B.1 livré, 2B.2 prochain), section "ce qui n'est PAS livré" §2 updated avec "admin UI livré"
- `docs/ACTIVE_DOCS.md` : ajouter 2B.1 + 2B.2 dans la liste "Sprints à venir / fermés"
- `docs/orchestrator_sprints/README.md` : refléter le split 2B → 2B.1 + 2B.2
- statut final dans ce contrat

## Critères de done

- Nouveau callable `setCountryLicenseConfig` exporté + 8+ tests Jest verts (RBAC + validation + merge non-écrasant)
- Admin `countries_tab.dart` édite les 7 champs licence et appelle uniquement le callable
- `pharmacy_license_review_screen.dart` liste les pharmacies pending/correction filtrées par countryScopes et câble les 3 actions verify/reject/correction_needed
- Lien depuis `pharmacy_management_screen.dart`
- Widget tests admin verts pour les 2 écrans (config + review)
- 188+ tests Jest backend toujours verts (zéro régression)
- `cd functions && npm run build && npm run lint && npm test` ✅
- `cd functions && npm run test:rules` ✅ 22/22
- `cd admin_panel && flutter analyze` clean ou pré-existant inchangé
- `cd admin_panel && flutter test` widget tests admin verts
- aucun changement `pharmapp_unified/**` ni `shared/lib/**` (sauf si l'explorer prouve une asymétrie strictement nécessaire)
- CLAUDE.md backlog 2B.1 marqué livré ; 2B.2 noté "prochain sprint, dépend de 2B.1 fermé"

## Conditions de non-régression

- inscription pharmacie pays non mandatory (via `createPharmacyRegistration` Sprint 2A.3) : inchangée
- inscription pharmacie pays mandatory : inchangée (UI mobile = 2B.2)
- exchange / medicine request flow : inchangé
- admin V1+V2A→V2C (Sprint 2a / mars 2026) : inchangé sauf ajouts strictement requis
- les 188 tests backend + 22 rules tests + 2 Flutter shared tests : tous verts

## Validation minimale

```bash
cd functions && npm run build
cd functions && npm run lint
cd functions && npm test
cd functions && npm run test:rules
cd admin_panel && flutter analyze
cd admin_panel && flutter test
```

`pharmapp_unified` et `shared` non touchés en 2B.1 → pas besoin de relancer leurs analyses.
