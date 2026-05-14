# Sprint 5 — E2E Closure, Migration Audit and Monitoring

À exécuter dans l'orchestrator uniquement.

## Objectif

Clore le programme de sprints 0-4 par une preuve de recette bout en bout,
un audit migration Ghana et un plan de surveillance post-deploiement 7 jours.

Ce sprint n'est **pas** un sprint feature. Il ne doit pas rouvrir les décisions
produit verrouillées par les sprints 2A-4.

## Résultat attendu

Le projet dispose de :

1. une vérité documentaire cohérente pour la recette E2E ;
2. un script d'audit read-only générant un CSV des pharmacies Ghana sans
   licence valide ;
3. une checklist de recette staging couvrant license, trial, marketplace,
   medicine requests purchase/exchange, delivery, wallets et withdrawal ;
4. un plan de monitoring 7 jours prêt à exécuter après deploy ;
5. un rapport final qui dit clairement `PASS`, `CONDITIONAL PASS` ou `BLOCKED`.

Le sprint ne peut pas être marqué fermé si la preuve runtime staging n'est pas
disponible ou si elle est remplacée par une simple analyse statique.

## Périmètre autorisé

- scripts d'audit sous `scripts/` ou `functions/scripts/`
- docs de recette sous `docs/testing/` ou `docs/release/`
- tests E2E/manuels documentés
- corrections mineures de bugs découverts pendant recette, si strictement liées
- `CLAUDE.md`, `docs/ACTIVE_DOCS.md`
- le contrat Sprint 5 lui-même

## Périmètre interdit

- Nouvelles features.
- Refactor large.
- Changement de modèle métier.
- Deploy prod sans autorisation explicite.
- Suppression destructive de données prod.
- Changement des verrous Sprint 4 : pas de `either`, pas de soulte, exchange =
  barter pur, reservation 1 cote, courier fee 50/50 conserve.
- Migration destructive ou correction de donnees production sans validation
  explicite du proprietaire produit.

## Pre-lock architecte Sprint 5

Ces decisions sont verrouillees avant `run-start` :

1. **Sprint de preuve, pas de feature** : le writer documente, audite et
   corrige uniquement les bugs mineurs strictement decouverts pendant recette.
2. **Truth cleanup obligatoire avant recette** : les docs testing actives qui
   decrivent l'ancien pilot `createExchangeHold` / `exchangeCapture` comme
   chemin E2E courant doivent etre archivees, stubbees ou explicitement
   marquees legacy avant toute conclusion `PASS`.
3. **Deux flows distincts a ne pas melanger** :
   - `createExchangeProposal` / `acceptExchangeProposal` = exchange proposal
     canonique historique ;
   - `createMedicineRequest` / `submitMedicineRequestOffer` /
     `acceptMedicineRequestOffer` = medicine request purchase/exchange Sprint 4.
   La checklist E2E doit nommer le flow exact teste a chaque scenario.
4. **Ghana license audit read-only** : le script Sprint 5 doit lire Firestore,
   ne jamais muter, exiger un `--project`, produire un CSV et un resume JSON.
   Les exports CSV doivent eviter les PII inutiles par defaut.
5. **Monitoring 7 jours = runbook, pas deploy automatique** : documenter les
   requetes/log checks et seuils d'alerte, sans deploy prod non autorise.
6. **Staging obligatoire pour closure** : si aucun environnement staging
   utilisable n'est confirme, le sprint peut livrer les scripts/docs, mais son
   verdict final doit etre `BLOCKED` ou `CONDITIONAL PASS`, jamais `PASS`.

## Explorer read-only

Tâches :

1. Vérifier l'état final des sprints 0-4 :
   - Sprint 4 doit etre commite/finalise ou explicitement note comme pre-requis
     non satisfait ;
   - `CLAUDE.md`, `docs/ACTIVE_DOCS.md` et le contrat Sprint 4 ne doivent pas
     contenir de compteurs/tests stale qui contredisent le code courant.
2. Cartographier les docs testing actives :
   - identifier les docs encore valides ;
   - identifier les docs legacy/stale, notamment celles qui decrivent
     `createExchangeHold` / `exchangeCapture` comme chemin E2E courant ;
   - proposer archive, stub ou amendement.
3. Identifier les scénarios E2E nécessaires :
   - inscription Ghana sans licence -> `LICENSE_REQUIRED` ;
   - inscription Ghana avec licence -> `pending_verification` ;
   - validation admin -> `verified` + trial demarre ;
   - pharmacie non verified bloquee sur marketplace/request/proposal/accept ;
   - inventaire et marketplace listing par ville ;
   - medicine request purchase : request -> offer -> accept -> delivery ->
     wallets/ledger/inventory ;
   - medicine request exchange : request exchange -> offer exchange ->
     accept avec inventory picker -> hold requester item only -> delivery ->
     settlement/ledger/inventory ;
   - exchange proposal canonique historique, seulement si encore declare comme
     surface de recette active ;
   - withdrawal happy path + validations minimum/MSISDN.
4. Définir audit CSV pharmacies Ghana sans licence valide :
   - source de verite = `system_config/main.countries.GH` +
     `licenseGate.evaluateLicenseGate` semantics ;
   - categories minimales : missing `licenseStatus`, `pending_verification`,
     `rejected`, `correction_needed`, `expired`, grace expired, unknown status ;
   - dry-run/read-only par construction.
5. Définir monitoring 7 jours :
   - inscriptions Ghana bloquees sans licence ;
   - actions marketplace par non verified bloquees ;
   - create/submit/accept medicine request par non verified bloquees ;
   - delivery completion failures ;
   - `courierFee=0` inattendu sur villes configurees ;
   - anomalies wallet/ledger ;
   - remote function drift.
6. Proposer plan de validation.
7. Repondre au format obligatoire du `GLOBAL_EXECUTION_CONTRACT.md`, incluant
   le Solution Architect Refactoring Challenge.

Stop conditions :

- sprint précédent incomplet ou non finalise ;
- absence d'environnement staging utilisable pour un verdict `PASS` ;
- besoin de deploy prod ou données prod destructives ;
- docs actives trop contradictoires pour definir le chemin E2E courant ;
- besoin d'une nouvelle decision produit non verrouillee.

## Writer

Implémenter/documenter :

1. **Truth cleanup docs**
   - Creer `docs/release/` si absent.
   - Creer ou mettre a jour `docs/release/SPRINT_5_E2E_CLOSURE_PLAN.md`.
   - Archiver/stubber/amender les docs testing actives stale avant de les
     utiliser comme preuve.
   - Mettre a jour `docs/ACTIVE_DOCS.md` en consequence.
2. **Script audit migration CSV**
   - Ajouter un script read-only sous `functions/scripts/`, par exemple
     `auditGhanaLicenseReadiness.mjs`.
   - Exiger `--project=<id>` ou variable explicite.
   - Supporter `--out=<path>` pour ecrire un CSV local.
   - Produire un resume final `AUDIT_SUMMARY_JSON ...`.
   - Ne jamais appeler `set`, `update`, `delete`, `deploy` ou une commande
     destructive.
3. **Plan de recette E2E**
   - Documenter les acteurs, donnees, preconditions, commandes, preuves a
     collecter et criteres PASS/FAIL.
   - Distinguer explicitement medicine-request purchase, medicine-request
     exchange et exchange proposal canonique.
4. **Checklist manuelle**
   - Scenarios license/trial/admin.
   - Scenarios marketplace/city.
   - Scenarios request purchase/exchange.
   - Delivery/wallet/ledger/inventory.
   - Withdrawal.
5. **Monitoring 7 jours**
   - Creer `docs/release/SPRINT_5_MONITORING_7D.md`.
   - Inclure requetes/log checks, cadence, seuils d'alerte, owner/action.
6. **Corrections mineures strictement liées**
   - Autorisees seulement si l'explorer les a nommees comme mineures.
   - Toute correction touchant argent, auth, rules, subscription, license gate,
     delivery settlement ou modele Firestore doit declencher STOP ou nouveau
     micro-sprint explicite.
7. **Mise à jour finale docs**
   - `CLAUDE.md`
   - `docs/ACTIVE_DOCS.md`
   - ce contrat Sprint 5 avec statut final ou lien vers rapport orchestrator.

## Critères de done

- Rapport CSV generable et teste en mode local/help ou dry-run.
- Checklist E2E prete, avec criteres PASS/FAIL et evidence attendue.
- Monitoring 7j documente.
- Docs actives coherentes : aucune doc active ne pilote l'ancien flow
  `createExchangeHold` / `exchangeCapture` comme chemin E2E courant.
- `CLAUDE.md` indique clairement :
  - ce qui est livre ;
  - si la recette staging a ete executee ou non ;
  - le verdict Sprint 5 (`PASS`, `CONDITIONAL PASS` ou `BLOCKED`) ;
  - les risques residuels.
- Si staging non disponible, le sprint ne pretend pas etre clos en `PASS`.

## Validation minimale

- commandes applicables selon les fichiers touchés ;
- execution du script audit en `--help`, puis en mode local/dry-run si possible ;
- revue manuelle des docs release.
- Si `functions/scripts/` est touche : `node <script> --help` doit passer.
- Si `functions/` TypeScript est touche : `npm run build`, `npm run lint`,
  `npm test`.
- Si `pharmapp_unified/` est touche : `flutter analyze` et tests cibles, ou
  justification explicite des failures preexistantes.

## Rapport final attendu

Le writer doit finir avec :

1. `Files changed`
2. `Behavior changed`
3. `Security / authorization impact`
4. `Migration / backfill impact`
5. `Documentation updated`
6. `Tests run / results`
7. `E2E / staging evidence`
8. `Monitoring 7d readiness`
9. `Residual risks`
10. `Final verdict: PASS / CONDITIONAL PASS / BLOCKED`

---

## Statut final Sprint 5 (livré 2026-05-14)

**Verdict : CONDITIONAL PASS.**

Artefacts livrés :

- Truth cleanup : [docs/testing/NEXT_SESSION_EXCHANGE_TESTING.md](../testing/NEXT_SESSION_EXCHANGE_TESTING.md) stubbé avec banner stale et pointer vers le plan E2E courant.
- Plan recette : [docs/release/SPRINT_5_E2E_CLOSURE_PLAN.md](../release/SPRINT_5_E2E_CLOSURE_PLAN.md) — 8 scénarios obligatoires, flow A vs flow B explicitement nommés.
- Script audit read-only : [functions/scripts/auditGhanaLicenseReadiness.mjs](../../functions/scripts/auditGhanaLicenseReadiness.mjs) — testé `--help` + exit 2 sur `--project` manquant.
- Runbook monitoring 7j : [docs/release/SPRINT_5_MONITORING_7D.md](../release/SPRINT_5_MONITORING_7D.md) — 7 checks Cloud Logging + Firestore, cadence J+0/1/3/7, seuils P0..P3.

**Recette staging non exécutée** au moment de la livraison du sprint (pas
d'environnement staging confirmé). Le verdict deviendra `PASS` après
exécution des 8 scénarios + collecte des preuves dans `docs/release/evidence/SPRINT_5_<date>/`.

6 décisions architecte pré-lock respectées intégralement : sprint de
preuve sans feature, truth cleanup obligatoire fait, deux flows ne sont
pas mélangés dans le plan, audit Ghana read-only par construction,
monitoring 7j = runbook sans deploy auto, staging non confirmé donc
CONDITIONAL PASS et non PASS.
