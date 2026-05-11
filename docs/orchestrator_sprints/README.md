# PharmApp Orchestrator Sprint Pack

Ce dossier contient les contrats de sprint à exécuter via `ai-dev-orchestrator`.

Chaque fichier `SPRINT_*.md` est conçu comme un ticket source autonome pour l'orchestrator. Le principe est volontairement strict : un sprint ne peut pas être marqué terminé si les docs actives ne reflètent pas l'état réel du code.

## Ordre d'exécution verrouillé

1. `SPRINT_0_DOC_FREEZE_TASK.md`
2. `SPRINT_1_MSISDN_HARDENING_TASK.md`
3. `SPRINT_2_F_LICENSE_TASK.md`
4. `SPRINT_3_TRIAL_SUBSCRIPTION_TASK.md`
5. `SPRINT_4_MEDICINE_REQUESTS_EXCHANGE_TASK.md`
6. `SPRINT_5_E2E_CLOSURE_TASK.md`

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
