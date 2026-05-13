# Sprint 2B.2a — Pharmacy UX (Registration + Profile + Correction Flow)

À exécuter dans l'orchestrator uniquement, **après** Sprint 2B.1 fermé + APPROVED + finalized.

## Origine

Split du Sprint 2B.2 monolithique acté par l'architecte le 2026-05-13 (préfère B, décision marketplace verrouillée dans un contrat isolé). Le contrat agrégé [SPRINT_2B2_PHARMACY_UX_AND_MARKETPLACE_TASK.md](SPRINT_2B2_PHARMACY_UX_AND_MARKETPLACE_TASK.md) est **superseded**.

Le Sprint 2B.2 est split en :

- **2B.2a (ce contrat)** : Pharmacy UX — registration `LICENSE_REQUIRED` handler + profile license status + correction flow. Aucun marketplace consumer migré.
- **2B.2b** ([SPRINT_2B2B_MARKETPLACE_ENFORCEMENT_TASK.md](SPRINT_2B2B_MARKETPLACE_ENFORCEMENT_TASK.md)) : Marketplace Enforcement — listing backend-owned + 6 consumers migrés. **Bloqué** jusqu'à clôture 2B.2a.

## Prérequis (hard dependency)

**Sprint 2B.1 doit être fermé** (admin license operations : `setCountryLicenseConfig` callable + admin license review screen). Sans 2B.1, une pharmacie qui soumet une correction via `submitPharmacyLicense` reste bloquée parce que personne ne peut la passer `verified`. Si 2B.1 n'est pas fermé, l'explorer 2B.2a doit répondre `SAFE TO PROCEED = NO`.

## Objectif

Rendre la feature licence end-to-end utilisable côté pharmacie : inscription qui re-prompt licence proprement, profile qui expose le statut, correction qui passe par le callable Sprint 2a. **Pas de touche marketplace** (Sprint 2B.2b).

## DoD (Definition of Done) — architect-locked

1. Une pharmacie qui s'inscrit pour un pays mandatory et n'a pas de licence est **re-prompt licence** par l'UI : le `details.code === 'LICENSE_REQUIRED'` retourné par le callable backend (contrat Sprint 2A.3.1) déclenche un état UI dédié qui re-collecte la licence et relance l'inscription. Aucune erreur générique affichée.
2. Une pharmacie au statut `rejected` ou `correction_needed` voit le statut dans son profile + peut corriger via un flow dédié qui appelle `submitPharmacyLicense` (Sprint 2a). Après succès, le badge passe à `pending_verification`.
3. Aucun changement à l'admin panel.
4. Aucun changement aux callables backend Sprint 2a / 2A.1 / 2A.2 / 2A.3 / 2B.1 (sauf si l'explorer prouve un ajout strict nécessaire — il devra le justifier).
5. **Aucun changement marketplace** (out of scope 2B.2b) : pas de migration des 6 consumers, pas de nouveau callable listing, pas de durcissement `firestore.rules` sur `pharmacies.*` côté read.

## Décisions verrouillées

1. Contrat erreur `LICENSE_REQUIRED` : `FirebaseFunctionsException(code: 'failed-precondition', details: { code: 'LICENSE_REQUIRED' })`. Sprint 2A.3.1 a verrouillé ça côté `shared/lib/services/unified_auth_service.dart` via `rethrow`. **2B.2a ne doit PAS changer ce contrat**, juste le consommer côté UI.
2. Pas d'upload Firebase Storage réel pour `licenseDocumentUrl` — un champ texte URL suffit (l'utilisateur colle un lien). Upload Storage = sprint dédié si jamais besoin.
3. Pas de refactor auth/registration global ni de migration courier/admin vers backend-owned registration (verrou Sprint 2A.3 toujours valide).
4. Pas de nouveau callable côté backend dans 2B.2a. Si l'explorer trouve une asymétrie strictement nécessaire avec l'UI, elle doit être justifiée par un finding architect et inclure les tests Jest correspondants.

## Périmètre autorisé

### Backend

- **Aucun** changement attendu. Si l'explorer prouve qu'un champ manque pour rendre le profile honnête (ex. `licenseGraceEndsAt` non lisible côté client parce que rules bloquent), proposer un ajout strict + justifier dans le rapport. Par défaut : `cd functions` non touché.

### pharmapp_unified Flutter

- `pharmapp_unified/lib/screens/auth/unified_registration_screen.dart` :
  - lecture `MasterDataCountry.licenseRequired` pour le pays sélectionné → afficher champ licence conditionnel avec `licenseLabel` + `licenseHelpText` + validation regex client-side si `licenseFormatRegex`
  - sur `FirebaseFunctionsException` avec `details['code'] == 'LICENSE_REQUIRED'` → afficher le champ licence (cas où le snapshot client était stale), focus, et message clair "License required for {country}". Pas d'erreur générique.
- `pharmapp_unified/lib/screens/pharmacy/profile/profile_screen.dart` : ajouter section "License status" :
  - badge avec statut courant (`not_required`, `pending_verification`, `verified`, `rejected`, `correction_needed`, `grace_period`, `expired`, plus défaut "pending" si inconnu)
  - si `rejected` ou `correction_needed` : affichage `licenseRejectionReason` + bouton "Correct license" qui ouvre un flow de correction
- nouveau flow de correction : un dialog (préféré) ou écran qui demande le `licenseNumber` (et optionnellement `licenseDocumentUrl`, `licenseExpiryDate`) puis appelle `submitPharmacyLicense` (Sprint 2a). Après succès, badge passe à `pending_verification` (via stream/rebuild).
- **mocktail** ajouté à `pharmapp_unified/pubspec.yaml` dev_dependencies si absent (déjà ajouté à `shared/` en 2A.3.1 et `admin_panel/` en 2B.1).
- widget tests pharmapp_unified pour : registration (champ licence conditionnel selon pays), registration (LICENSE_REQUIRED handler depuis `FirebaseFunctionsException`), profile license status (matrice statuts × badge), correction flow (happy path + callable invoqué avec bons args).

### Documentation

- `CLAUDE.md` : Sprint 2B.2a ajouté au tableau historique, backlog F-LICENSE 2B.2a marqué LIVRÉ + 2B.2b "prochain sprint, débloqué". Section "ce qui n'est PAS livré" §2 mise à jour : **conserve** la mention "marketplace listing filter côté Flutter" car 2B.2b reste pending.
- `docs/ACTIVE_DOCS.md` : 2B.2a → liste closed, 2B.2b → liste à venir.
- `docs/orchestrator_sprints/README.md` : refléter le split 2B.2 → 2B.2a + 2B.2b.
- statut final dans ce contrat.

## Périmètre interdit

- Aucun changement `admin_panel/**` (out of scope, livré en 2B.1)
- Aucun changement aux 4 callables licence backend existants (`submitPharmacyLicense`, `adminVerifyPharmacyLicense`, `backfillLicenseGracePeriod`, `setCountryLicenseConfig`)
- **Aucun nouveau callable backend** (sauf justification architecte explicite)
- Pas d'upload Firebase Storage réel
- Pas de refactor auth/registration global
- Pas de changement à `createPharmacyRegistration` (Sprint 2A.3)
- **Aucun marketplace listing** (out of scope, Sprint 2B.2b) : pas de migration des 6 consumers, pas de query `collection('pharmacies')` modifiée pour le filtrage marketplace
- Pas de Bloc 2 exchange mode (Sprint 4)
- Pas de Trial (Sprint 3)
- Pas de deploy prod
- Pas de mutation prod

## Architecture Evidence Contract

| Path/Field | Write path | Read/consumption path | Authz | Negative/test path | Proof Required |
|---|---|---|---|---|---|
| `LICENSE_REQUIRED` contract UI | n/a — propage du backend Sprint 2A.3 | `unified_registration_screen.dart` catch `FirebaseFunctionsException` + `details['code'] == 'LICENSE_REQUIRED'` | n/a | callable throw avec autre code → UI affiche erreur générique, pas re-prompt licence | widget test : signUp pharmacy → throw LICENSE_REQUIRED → UI re-render avec champ licence + focus, et un autre code (`internal`) NE re-prompt PAS licence |
| Champ licence conditionnel registration | n/a (UI seulement) | `unified_registration_screen.dart` lit `MasterDataCountry.licenseRequired` du pays sélectionné | n/a | country non mandatory → champ caché ; country mandatory → champ visible | widget test : 2 cas (mandatory visible / non mandatory caché) + transition mandatory → non mandatory au changement de pays sélectionné |
| Profile license status badge | n/a (read-only) | `profile_screen.dart` StreamBuilder ou Bloc sur `pharmacies/{currentUser.uid}.licenseStatus` | rules read existant (Sprint 2a) | pas de status / unknown status → "pending" par défaut + log warn | widget test : matrice des statuts × badge correct + cas "unknown" |
| Profile correction flow | `submitPharmacyLicense` callable (Sprint 2a, inchangé) | profile screen → flow correction | callable check : caller is owner (Sprint 2a) | submit sans `licenseNumber` → erreur backend visible UI (pas crash) | widget test : flow happy path, validation client-side, callable invoqué avec bons args, erreur backend affichée |

## Solution Architect Refactoring Challenge (obligatoire)

L'explorer doit répondre **explicitement** :

1. Le `unified_registration_screen.dart` (931 lignes) lit-il déjà `MasterDataCountry` ? Où, comment, et avec quel pattern de réactivité (rebuild on country change) ? Si non, où câbler le read sans casser le state existant ?
2. Le `profile_screen.dart` consomme-t-il déjà la pharmacie via Bloc / StreamBuilder ? Quel pattern utiliser pour la section license status pour rester cohérent avec le reste du fichier ?
3. Le flow de correction : dialog ou écran dédié ? UX call à motiver. Le contrat penche dialog (moins de plumbing), mais si le profile_screen a un pattern de sous-écran existant, l'utiliser.
4. Sur `LICENSE_REQUIRED` post-soumission, l'UI doit-elle réafficher le formulaire complet (tous les champs avec leur valeur déjà saisie) ou juste pousser le champ licence (les autres déjà saisis restent montés en arrière) ? **Décision attendue** par l'explorer.
5. Les widget tests `pharmapp_unified` utilisent-ils déjà mocktail ? Si non, l'ajouter à `dev_dependencies`.
6. `unified_auth_service.signUp` (`shared/`) — comment intercepter le `FirebaseFunctionsException` côté `unified_registration_screen.dart` ? Le contrat dit `rethrow` côté `shared/`, donc l'écran doit pouvoir le catch directement. À confirmer.

**Décision attendue** : `Decision: EXTEND | REFACTOR_FIRST | STOP`

Stop conditions :

- Sprint 2B.1 non finalisé
- découverte qu'un upload Firebase Storage réel est nécessaire pour rendre l'expérience acceptable (sprint dédié à proposer)
- découverte que `unified_registration_screen.dart` ne lit pas `MasterDataCountry` et qu'un refactor large du state est nécessaire pour câbler le champ licence (REFACTOR_FIRST hors scope 2B.2a)

## Explorer read-only

1. Lire `pharmapp_unified/lib/screens/auth/unified_registration_screen.dart` en entier (931 lignes).
2. Lire `pharmapp_unified/lib/screens/pharmacy/profile/profile_screen.dart`.
3. Lire `shared/lib/services/unified_auth_service.dart` pour confirmer le `rethrow` post-2A.3.1.
4. Lire `shared/lib/models/master_data_country.dart` pour confirmer les 7 champs licence.
5. Lire `functions/src/submitPharmacyLicense.ts` pour valider input shape.
6. Inspecter `pharmapp_unified/pubspec.yaml` pour confirmer absence/présence de mocktail.
7. Inspecter les tests existants `pharmapp_unified/test/**`.
8. Répondre `SAFE TO PROCEED`.

## Writer — lots

### Lot 1 — Registration UI : champ licence conditionnel + LICENSE_REQUIRED handler

- `unified_registration_screen.dart` :
  - section licence conditionnelle sur `MasterDataCountry.licenseRequired` (label, helpText, regex)
  - `try/catch FirebaseFunctionsException` autour de l'appel signUp : si `details['code'] == 'LICENSE_REQUIRED'` → re-render avec champ licence visible, focus, message clair
  - autre code → erreur générique inchangée
- widget tests : 4 cas
  - country mandatory + licence fournie + valid regex → callable invoqué avec licence
  - country mandatory + licence manquante → throw `LICENSE_REQUIRED` simulée → UI re-render avec champ licence visible + focus
  - country non mandatory → pas de champ licence montré
  - `FirebaseFunctionsException` avec autre code → erreur générique, pas re-render licence

### Lot 2 — Profile license status + correction flow

- `profile_screen.dart` : section badge + `licenseRejectionReason` + bouton "Correct license" si `rejected` ou `correction_needed`
- nouveau dialog/écran de correction qui demande `licenseNumber` (mandatory), `licenseDocumentUrl` (optionnel), `licenseExpiryDate` (optionnel) puis appelle `submitPharmacyLicense`. Après succès, ferme et le badge se met à jour via le stream/rebuild.
- widget tests : matrice statuts (7 cas + default "unknown") × badge correct, correction flow happy path, correction flow validation (numéro vide → bloqué), correction flow erreur backend → message visible.

### Lot 3 — mocktail + finalisation widget tests pharmapp_unified

- ajouter `mocktail: ^1.0.4` à `pharmapp_unified/pubspec.yaml` `dev_dependencies` si absent
- valider que les tests Lot 1 + Lot 2 tournent localement
- exposer les seams d'injection nécessaires côté `unified_registration_screen` et `profile_screen` si la testabilité l'exige (callbacks pour signUp / submitPharmacyLicense — pattern Sprint 2B.1 `LicenseConfigDialog` + `LicenseReviewDataSource`)

### Lot 4 — Documentation

- `CLAUDE.md` : Sprint 2B.2a ajouté au tableau historique sprints fermés, backlog F-LICENSE 2B.2a livré + 2B.2b "prochain sprint"
- `docs/ACTIVE_DOCS.md` : 2B.2a fermé + 2B.2b "à venir"
- `docs/orchestrator_sprints/README.md` : refléter le split
- statut final dans ce contrat

## Critères de done

- `unified_registration_screen.dart` reprompt `LICENSE_REQUIRED` correctement
- `profile_screen.dart` affiche statut + permet correction via `submitPharmacyLicense`
- ≥ 8 widget tests pharmapp_unified verts (4 registration + 4 profile/correction au minimum)
- Aucun nouveau callable backend (sauf finding architect)
- `cd functions && npm run build && npm run lint && npm test && npm run test:rules` ✅ (204/204 Jest, 22/22 rules — inchangés)
- `cd shared && dart analyze` ✅ (inchangé)
- `cd admin_panel && flutter analyze && flutter test` ✅ (inchangé)
- `cd pharmapp_unified && flutter analyze` ✅
- `cd pharmapp_unified && flutter test` ✅ (nouveaux widget tests verts)
- `git diff --check origin/main..HEAD` clean
- CLAUDE.md backlog 2B.2a marqué livré ; 2B.2b noté "prochain sprint"

## Conditions de non-régression

- inscription pays non mandatory : inchangée
- inscription pays mandatory avec licence valide : succès, redirection dashboard
- inscription pays mandatory sans licence : `LICENSE_REQUIRED` affiché (was : erreur générique)
- courier/admin signup : flow client-write Sprint 2A.3 préservé
- exchange / medicine request flow : **inchangé** (marketplace filtering = Sprint 2B.2b)
- admin V1+V2A→V2C + 2B.1 : inchangés
- 204/204 backend Jest, 22/22 rules, 22/22 admin_panel widget tests : tous verts

## Validation minimale

```bash
cd functions && npm run build && npm run lint && npm test && npm run test:rules
cd shared && dart analyze
cd admin_panel && flutter analyze
cd pharmapp_unified && flutter analyze && flutter test
```

`admin_panel` et `shared` n'ont pas de changement attendu → analyses suffisent.
