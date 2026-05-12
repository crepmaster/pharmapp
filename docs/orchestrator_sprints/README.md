# PharmApp Orchestrator Sprint Pack

Ce dossier contient les contrats de sprint à exécuter via `ai-dev-orchestrator`.

Chaque fichier `SPRINT_*.md` est conçu comme un ticket source autonome pour l'orchestrator. Le principe est volontairement strict : un sprint ne peut pas être marqué terminé si les docs actives ne reflètent pas l'état réel du code.

## Ordre d'exécution verrouillé

1. `SPRINT_0_DOC_FREEZE_TASK.md` — ✅ fermé 2026-05-12 (run `20260512-000940-c578fa`)
2. `SPRINT_1_MSISDN_HARDENING_TASK.md` — ✅ fermé 2026-05-12 (run `20260512-065209-a16494`)
3. `SPRINT_2A_LICENSE_BACKEND_TASK.md` — orchestrator APPROVED 2026-05-12 (run `20260512-090822-3bfcff`) mais **correction sécurité 2A.1 requise par l'architecte** (voir [SPRINT_2A_ARCHITECT_REVIEW_FINDINGS.md](SPRINT_2A_ARCHITECT_REVIEW_FINDINGS.md))
3.1. `SPRINT_2A1_SECURITY_CORRECTION_TASK.md` — 3 findings critiques + rules emulator harness
4. `SPRINT_2B_LICENSE_UI_TASK.md` — bloqué jusqu'à clôture **2A.1**
5. `SPRINT_3_TRIAL_SUBSCRIPTION_TASK.md`
6. `SPRINT_4_MEDICINE_REQUESTS_EXCHANGE_TASK.md`
7. `SPRINT_5_E2E_CLOSURE_TASK.md`

Le contrat monolithique `SPRINT_2_F_LICENSE_TASK.md` est conservé comme
référence agrégée (modèle cible country + pharmacy + critères de done
end-to-end) mais **n'est plus exécuté** directement. Il a été split en
2a (backend) + 2b (UI) sur décision architecte.

## Contrat global

Lire `GLOBAL_EXECUTION_CONTRACT.md` avant chaque sprint. Il définit :

- les décisions produit verrouillées ;
- les règles de reprise entre sessions ;
- le challenge architecte solution/refactoring obligatoire ;
- les obligations de documentation ;
- le format de rapport final attendu.

## Prompt maître Claude

Utiliser `CLAUDE_RUNNER_PROMPT.md` pour demander à Claude Code de lancer et suivre les sprints via l'orchestrator.

## Règle de continuité

À chaque nouvelle session, l'agent doit commencer par lire :

1. `CLAUDE.md`
2. `docs/orchestrator_sprints/GLOBAL_EXECUTION_CONTRACT.md`
3. le fichier du sprint courant
4. le rapport final du run orchestrator précédent, s'il existe

Si ces sources se contredisent, le sprint doit s'arrêter avec `SAFE TO PROCEED = NO` jusqu'à clarification ou correction documentaire.
