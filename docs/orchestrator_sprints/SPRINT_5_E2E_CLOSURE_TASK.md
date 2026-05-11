# Sprint 5 — E2E Closure, Migration Audit and Monitoring

À exécuter dans l'orchestrator uniquement.

## Objectif

Clore le projet par validation bout en bout, audit migration et monitoring post-deploy.

## Résultat attendu

Le projet dispose d'une preuve de recette staging et d'un plan de surveillance post-déploiement 7 jours.

## Périmètre autorisé

- scripts d'audit sous `scripts/` ou `functions/scripts/`
- docs de recette sous `docs/testing/` ou `docs/release/`
- tests E2E/manuels documentés
- corrections mineures de bugs découverts pendant recette, si strictement liées
- `CLAUDE.md`, `docs/ACTIVE_DOCS.md`

## Périmètre interdit

- Nouvelles features.
- Refactor large.
- Changement de modèle métier.
- Deploy prod sans autorisation explicite.
- Suppression destructive de données prod.

## Explorer read-only

Tâches :

1. Vérifier l'état final des sprints 0-4.
2. Identifier les scénarios E2E nécessaires :
   - inscription Ghana avec licence ;
   - validation admin ;
   - trial démarré après validation ;
   - inventaire ;
   - request purchase ;
   - offer purchase ;
   - request exchange ;
   - offer exchange ;
   - acceptation ;
   - delivery ;
   - wallet/withdrawal.
3. Définir audit CSV pharmacies Ghana sans licence valide.
4. Définir monitoring 7 jours :
   - inscription Ghana sans licence bloquée ;
   - action marketplace par non verified bloquée ;
   - request/proposal/accept par non verified bloquée.
5. Proposer plan de validation.

Stop conditions :

- sprint précédent incomplet ;
- absence d'environnement staging utilisable ;
- besoin de deploy prod ou données prod destructives.

## Writer

Implémenter/documenter :

1. Script audit migration CSV.
2. Plan de recette E2E.
3. Checklist manuelle.
4. Requêtes/log checks monitoring.
5. Corrections mineures strictement liées si autorisées par explorer.
6. Mise à jour finale docs.

## Critères de done

- Rapport CSV générable.
- Checklist E2E prête.
- Monitoring 7j documenté.
- Tous les statuts docs sont cohérents.
- `CLAUDE.md` indique clairement ce qui est livré et les risques résiduels.

## Validation minimale

- commandes applicables selon les fichiers touchés ;
- exécution du script audit en dry-run ou local mode ;
- revue manuelle des docs release.

