# Sprint 2b — F-LICENSE UI Integration

À exécuter dans l'orchestrator uniquement, **après** que Sprint 2A.3
(TD-LICENSE-REGISTRATION-OWNED, Option A backend-owned registration)
est fermé + APPROVED + finalized.

## Origine

Split du Sprint 2 monolithique acté par l'architecte le 2026-05-12 dans
[SPRINT_2_SCOPING_PROPOSAL.md](SPRINT_2_SCOPING_PROPOSAL.md). Voir
aussi le contrat backend [SPRINT_2A_LICENSE_BACKEND_TASK.md](SPRINT_2A_LICENSE_BACKEND_TASK.md),
les findings architecte [SPRINT_2A_ARCHITECT_REVIEW_FINDINGS.md](SPRINT_2A_ARCHITECT_REVIEW_FINDINGS.md),
et les sprints de consolidation [SPRINT_2A1_SECURITY_CORRECTION_TASK.md](SPRINT_2A1_SECURITY_CORRECTION_TASK.md)
+ [SPRINT_2A2_ARCHITECT_FOLLOWUP_TASK.md](SPRINT_2A2_ARCHITECT_FOLLOWUP_TASK.md).

## Objectif

Rendre la feature licence end-to-end utilisable côté humain : admin
peut configurer un pays comme mandatory et vérifier/refuser des
licences, pharmacie voit l'input licence conditionnel à l'inscription
selon master data et peut corriger sa licence après refus. **Plus** :
verrouiller la visibilité marketplace côté reads pour les pharmacies
non-verified hors grâce (finding architecte #5).

## Prérequis

**Sprint 2A.3 (TD-LICENSE-REGISTRATION-OWNED) doit être fermé** —
décision architecte 2026-05-12 :

- nouveau callable backend-owned créant `pharmacies/{uid}` + initialisant `licenseStatus` atomiquement selon `system_config/main.countries.{code}.licenseRequired` ;
- `UnifiedAuthService.signUp` Flutter migré pour appeler ce callable au lieu d'écrire Firestore direct ;
- tests backend + non-régression auth.

Sprint 2a + 2A.1 + 2A.2 doivent également être fermés :

- `MasterDataCountry` étendu côté shared (Sprint 2a).
- 3 callables backend opérationnels (`submitPharmacyLicense`, `adminVerifyPharmacyLicense`, `backfillLicenseGracePeriod`) + gate `licenseGate.ts` avec `PROTECTED_LICENSE_FIELDS` exporté (Sprint 2a + 2A.2).
- Firestore rules deny create + update sur les 9 champs licence (Sprint 2A.1).
- Counterparty gate fail-closed dans `acceptExchangeProposal` + `acceptMedicineRequestOffer` (Sprint 2A.1 + 2A.2).
- 22 tests rules + 12 tests callable-level counterparty + 19 tests gate (Sprint 2a + 2A.1 + 2A.2).

Si l'un de ces prérequis n'est pas rempli, l'explorer 2b doit
répondre `SAFE TO PROCEED = NO` et demander à clore les sprints
manquants d'abord.

## Registration write path canonique (post-2A.3)

À partir de Sprint 2A.3, le canonical path pour créer une pharmacie est :

```text
Flutter UI → UnifiedAuthService.signUp → callable backend createPharmacyAccount
           → atomic write pharmacies/{uid} + licenseStatus selon country config
```

Sprint 2B UI **n'écrit JAMAIS `pharmacies/{uid}` direct depuis Flutter** — elle appelle uniquement le callable Sprint 2A.3. L'input licence à l'inscription est passé en paramètre du callable. La Firestore rule `allow create` deny-on-license-fields (Sprint 2A.1) reste comme defense-in-depth.

## Décisions verrouillées rappelées

Toutes les 5 décisions verrouillées dans
[GLOBAL_EXECUTION_CONTRACT.md](GLOBAL_EXECUTION_CONTRACT.md) restent
valides. UX message doit éviter de promettre trial actif (Sprint 3 non
livré).

## Périmètre autorisé

- `admin_panel/lib/screens/system_config/countries_tab.dart` (toggle +
  6 inputs édition license config)
- `admin_panel/lib/services/system_config_service.dart` (méthode pour
  appeler le callable de mise à jour country, si nécessaire)
- nouveau callable côté backend si besoin :
  `functions/src/setCountryLicenseConfig.ts` (admin-scoped pour write
  des nouveaux champs licence sur `system_config/main.countries`)
- nouveau écran `admin_panel/lib/screens/pharmacy_license_review_screen.dart`
  (listing pharmacies pending_verification + actions verify / reject /
  correction_needed)
- lien dans `admin_panel/lib/screens/pharmacy_management_screen.dart`
  vers le license review
- `pharmapp_unified/lib/screens/auth/unified_registration_screen.dart`
  (champ licence conditionnel sur `MasterDataCountry.licenseRequired`,
  affichage label et helpText depuis master data)
- `pharmapp_unified/lib/screens/profile/` (affichage statut licence
  pharmacie + flow correction si rejected/correction_needed)
- `shared/lib/screens/auth/country_payment_selection_screen.dart` si
  re-route via country snapshot nécessaire
- tests widget Flutter ciblés
- docs actives (`CLAUDE.md`, ce contrat)

## Périmètre interdit

- Aucun changement backend déjà livré en 2a (sauf ajout strict du
  callable `setCountryLicenseConfig` si vraiment nécessaire pour le
  admin panel — l'explorer doit le justifier).
- Pas de changement Bloc 2 exchange mode (Sprint 4).
- Pas de changement trial subscription (Sprint 3).
- Pas de UX message qui promet trial actif.
- Pas d'upload Storage massif : `licenseDocumentUrl` peut rester un
  champ texte URL à coller. Upload réel via Firebase Storage = sprint
  dédié séparé si on en a besoin.
- Pas de refactor auth global ou registration global.

## Solution Architect Refactoring Challenge (obligatoire)

L'explorer doit produire une section `Solution Architect Refactoring
Challenge` qui répond explicitement à :

1. Le `unified_registration_screen.dart` lit-il déjà `MasterDataCountry`
   ? Sinon comment ajouter cette lecture proprement ?
2. Le `countries_tab.dart` admin écrit-il directement Firestore ou via
   un callable ? Doit-on créer `setCountryLicenseConfig` ou étendre un
   existant ?
3. Y a-t-il déjà un écran de pharmacy management dans
   `admin_panel/lib/screens/`? Quel pattern de navigation utiliser ?
4. L'affichage du statut licence sur le profil pharmacie doit-il
   passer par `pharmapp_unified/lib/blocs/unified_auth_bloc.dart` ou
   directement par un StreamBuilder ?
5. Le flow de correction licence après rejection partage-t-il du code
   avec l'inscription, ou faut-il un écran dédié ?
6. Quels widgets sont à tester en priorité pour couvrir la matrice
   licence ?

**Décision finale obligatoire** :

```text
Decision: EXTEND | REFACTOR_FIRST | STOP
```

## Explorer read-only

1. Inspecter `unified_registration_screen.dart` et la lecture
   `MasterDataCountry` (étendue en 2a).
2. Inspecter `countries_tab.dart` admin et son flow d'écriture.
3. Inspecter `pharmacy_management_screen.dart` pour le hook
   navigation.
4. Inspecter `profile/` côté pharmapp_unified.
5. Identifier les patterns de tests widget existants.
6. Répondre `SAFE TO PROCEED`.

Stop conditions :

- 2a non-fermé ou non-APPROVED ;
- besoin d'un refactor large auth/registration global ;
- besoin Storage réel (upload PDF/image) pour rendre la feature
  acceptable — auquel cas split en 2b et 2c (Storage).

## Writer

Implémenter par lots sûrs :

1. **Admin countries_tab license config** : toggle `licenseRequired`,
   inputs `licenseLabel`, `licenseHelpText`,
   `licenseVerificationRequired`, `licenseFormatRegex`,
   `licenseDocumentRequired`, `licenseGracePeriodDays`. Écriture via
   callable backend (créer `setCountryLicenseConfig.ts` si pas
   d'équivalent existant).
2. **Admin pharmacy_license_review_screen** : listing des pharmacies
   `pending_verification` ou `correction_needed` filtré par
   `countryScopes` de l'admin connecté. Actions
   verify/reject/correction_needed appellent
   `adminVerifyPharmacyLicense`.
3. **Pharmacy registration UI** : champ licence conditionnel sur
   `MasterDataCountry.licenseRequired`, affichage `licenseLabel` et
   `licenseHelpText`, validation regex côté client si
   `licenseFormatRegex` présent. Désactiver soumission si
   `licenseRequired=true` et licence vide. **L'écran ne write pas
   Firestore direct** — appelle le callable backend Sprint 2A.3.
4. **Pharmacy profile license status** : afficher le statut courant
   (badge), instructions claires si `rejected` ou `correction_needed`,
   bouton "soumettre/corriger" qui appelle
   `submitPharmacyLicense`. Aucune promesse trial.
5. **Marketplace visibility (architecte finding #5, ajouté 2A.2)** :
   les pharmacies mandatory non-`verified` post-grâce **N'APPARAISSENT
   PAS** dans le marketplace listing (search, "available pharmacies",
   "send offer to" picker, etc).
   - Préférer un endpoint backend listing filtré (par exemple callable
     `getMarketplacePharmacies(countryCode, cityCode)` ou ajouter un
     flag `marketplaceVisible: bool` calculé côté serveur lors des
     transitions `licenseStatus`).
   - **Filtre UI seul ne suffit pas** : un client modifié peut bypass.
     L'endpoint backend ou le flag calculé par function trigger sont
     les deux approches acceptables ; l'explorer 2b tranche.
   - Critère done : test prouvant qu'une pharmacie `rejected` ou
     `expired` ne remonte pas dans le listing accessible aux autres
     pharmacies, même si on bypass l'UI et qu'on requête Firestore
     direct.
6. **Tests widget Flutter** : matrice basique (pays mandatory rend le
   champ obligatoire, pays non-mandatory ne le rend pas, statut
   `rejected` affiche le flow correction, admin verify happy path).
7. **Docs** : update `CLAUDE.md` pour Sprint 2b fermé + section
   "Statut final" dans ce contrat. Marquer la feature F-LICENSE comme
   end-to-end livrée (backend + registration canonique + UI +
   marketplace visibility).

## Critères de done

- Super admin peut configurer license per country via UI admin sans
  toucher au code.
- Admin peut verify/reject/correction_needed une licence via UI.
- App mobile rend le champ licence conditionnellement.
- Pharmacie peut soumettre/corriger sa licence depuis le profil.
- Tests widget verts.
- Suite Flutter non-régressée
  (`flutter analyze` admin + unified clean).
- Pas de UX message qui promet trial actif.
- `CLAUDE.md` reflète Sprint 2b fermé et F-LICENSE end-to-end livrée.

## Conditions de non-régression

2b ne doit pas casser :

- login/registration unifiée pour pays non mandatory
- admin country/city/currency configuration existante
- profile pharmacy existant
- inventory preparation
- les callables backend livrés en 2a

## Validation minimale

```bash
cd shared && dart analyze
cd admin_panel && flutter analyze
cd pharmapp_unified && flutter analyze
cd functions && npm run build && npm test
```

Si `flutter analyze` timeout, documenter explicitement la commande à
relancer.
