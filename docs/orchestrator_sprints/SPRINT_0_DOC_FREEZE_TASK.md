# Sprint 0 — Doc Freeze and Active Documentation Boundary

À exécuter dans l'orchestrator uniquement.

## Objectif

Clore le cleanup documentaire afin que chaque session future reparte d'une documentation fiable et courte.

## Résultat attendu

1. Les docs actives ne pointent plus vers `pharmacy_app/` ou `courier_app/` comme cibles d'exécution.
2. Les docs périmées sont déplacées physiquement sous `docs/archive/`.
3. `docs/DEVELOPMENT_COMMANDS.md` devient un alias vers `CLAUDE.md`, ou est remplacé par un stub.
4. `docs/ACTIVE_DOCS.md` existe et liste uniquement les docs opérationnelles.
5. `CLAUDE.md` mentionne explicitement que `docs/archive/` est historique et non source de vérité.

## Périmètre autorisé

- `CLAUDE.md`
- `docs/**/*.md`
- `pharmapp_unified/CLAUDE.md`
- `README.md` uniquement si nécessaire pour pointer vers `CLAUDE.md`

## Périmètre interdit

- Aucun code applicatif.
- Aucun fichier `functions/src/**`, `shared/lib/**`, `pharmapp_unified/lib/**`, `admin_panel/lib/**`.
- Aucun changement de règles Firestore.
- Aucun changement de config Firebase.

## Explorer read-only

Tâches :

1. Inventorier les `.md` actifs et historiques.
2. Identifier les docs qui contiennent encore :
   - `pharmacy_app`
   - `courier_app`
   - `PRODUCTION READY`
   - commandes obsolètes
3. Proposer la liste exacte des fichiers à déplacer vers `docs/archive/`.
4. Proposer la liste exacte des stubs/alias à conserver.
5. Vérifier que `CLAUDE.md` actuel contient l'état fiable.
6. Répondre `SAFE TO PROCEED`.

Stop conditions :

- impossible de distinguer docs historiques et docs actives ;
- besoin de modifier du code ;
- besoin de supprimer définitivement des documents.

## Writer

Implémenter seulement :

1. Créer `docs/archive/` si absent.
2. Déplacer les docs périmées identifiées par l'explorer.
3. Remplacer `docs/DEVELOPMENT_COMMANDS.md` par un stub pointant vers `CLAUDE.md#dev-commands`.
4. Créer `docs/ACTIVE_DOCS.md`.
5. Mettre à jour `docs/README.md` pour indiquer la nouvelle règle.
6. Mettre à jour `CLAUDE.md` si nécessaire.

## Critères de done

- `rg -n "pharmacy_app|courier_app" -g "*.md" docs CLAUDE.md README.md` ne retourne ces termes que dans :
  - `docs/archive/**`
  - docs explicitement historiques/stubs
  - `CLAUDE.md` uniquement pour dire que ces dossiers sont supprimés
- `docs/ACTIVE_DOCS.md` existe.
- Les commandes actives sont uniquement dans `CLAUDE.md`.
- Aucun code n'est modifié.

## Validation minimale

- `git status --short`
- `rg` ciblés sur références obsolètes
- lecture manuelle de `docs/ACTIVE_DOCS.md`, `docs/README.md`, `docs/DEVELOPMENT_COMMANDS.md`

---

## Statut final — 2026-05-12

**Run orchestrator :** `20260512-000940-c578fa`
**Verdict :** APPROVED à l'itération 1
**Commits livrés :**
- `472e178` — T1+T2 : `docs/archive/` créé, 67 fichiers historiques déplacés via `git mv` (préservation de structure : testing/, reports/, backups/, guides/, setup/, agent_knowledge/, admin/, specs/, plus top-level)
- `01e6906` — T3+T4+T5+T6 : `DEVELOPMENT_COMMANDS.md` stub, `ACTIVE_DOCS.md` créé, `README.md` refondu, `CLAUDE.md` archive policy

**Validations exécutées :**
- `rg "pharmacy_app|courier_app" docs/*.md docs/**/*.md` : aucun match hors `docs/archive/**` + 4 stubs/sprint-pack légitimes + `ACTIVE_DOCS.md` (contexte explicatif)
- `git status --short` : 71 changes, tous dans `docs/` + `CLAUDE.md`
- Pre-commit hook `validate:quick` (tsc + eslint) : passé

**Hors scope préservé :** `test_suite/unit_test_list.md`, `scripts/setup-firebase-keys.md`, `pharmapp_unified/README.md` contiennent encore des références aux dossiers supprimés mais sont hors périmètre Sprint 0. À traiter dans un sprint hygiène ultérieur si besoin.

**Risques résiduels :** aucun bloquant. Email de notification finalize a échoué (auth SMTP), n'affecte ni la doc ni le code.

