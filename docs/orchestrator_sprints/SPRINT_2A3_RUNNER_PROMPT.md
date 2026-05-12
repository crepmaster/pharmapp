# Runner Prompt — Sprint 2A.3 TD-LICENSE-REGISTRATION-OWNED

Copier-coller ce prompt dans Claude Code pour lancer Sprint 2A.3 via
`ai-dev-orchestrator`.

---

Tu es Claude Code en mode runner orchestrator pour PharmApp.

## Mission

Lancer et suivre Sprint 2A.3 :

```text
C:\Users\aebon\projects\pharmapp-mobile\docs\orchestrator_sprints\SPRINT_2A3_REGISTRATION_BACKEND_OWNED_TASK.md
```

Objectif verrouillé :

1. Migrer l'inscription pharmacie vers un write path backend-owned
   `createPharmacyRegistration`.
2. Lire `system_config/main.countries.{countryCode}.licenseRequired`
   côté serveur au moment du create.
3. Fermer les 3 findings résiduels de revue architecte 2A.2 :
   unknown-country fail-closed, tests counterparty honnêtes, drift guard
   `PROTECTED_LICENSE_FIELDS` vs `firestore.rules`.

## Repos

Repo cible :

```text
C:\Users\aebon\projects\pharmapp-mobile
```

Repo orchestrator :

```text
C:\Users\aebon\projects\ai-dev-orchestrator
```

## Sources obligatoires à lire avant run-start

Lis dans cet ordre :

1. `C:\Users\aebon\projects\pharmapp-mobile\CLAUDE.md`
2. `C:\Users\aebon\projects\pharmapp-mobile\docs\orchestrator_sprints\GLOBAL_EXECUTION_CONTRACT.md`
3. `C:\Users\aebon\projects\pharmapp-mobile\docs\orchestrator_sprints\README.md`
4. `C:\Users\aebon\projects\pharmapp-mobile\docs\orchestrator_sprints\SPRINT_2A3_REGISTRATION_BACKEND_OWNED_TASK.md`
5. Le dernier rapport orchestrator de Sprint 2A.2, run
   `20260512-221309-3e615c`, s'il existe dans :

```text
C:\Users\aebon\projects\ai-dev-orchestrator\runs
```

Si ces sources se contredisent, ne lance rien. Réponds :

```text
SAFE TO PROCEED = NO
Reason: <contradiction exacte>
```

## Décisions verrouillées

- Option A / alpha : inscription pharmacie backend-owned avant Sprint 2B.
- Unknown country marketplace gate = deny.
- Pas de full `firebase-functions-test` harness si mocks ciblés suffisent.
- Ajouter un drift guard test pour la liste des champs licence protégés.
- Exécuter 2A.3 en un sprint M-L, sauf stop condition auth/session large.
- Aucun deploy prod, aucune mutation prod.

## Commande run-start

Depuis PowerShell :

```powershell
cd C:\Users\aebon\projects\ai-dev-orchestrator
python -m orchestrator.cli run-start `
  --task C:\Users\aebon\projects\pharmapp-mobile\docs\orchestrator_sprints\SPRINT_2A3_REGISTRATION_BACKEND_OWNED_TASK.md `
  --repo-path C:\Users\aebon\projects\pharmapp-mobile `
  --base-ref main `
  --max-iterations 3 `
  --policy standard
```

## Après run-start

Lis le dossier créé :

```text
C:\Users\aebon\projects\ai-dev-orchestrator\runs\<run_id>
```

Puis :

1. Lis `SPEC.md`.
2. Lis `CODER_PROMPT_ITER_1.md`.
3. Fais l'exploration read-only demandée.
4. Ne modifie rien tant que le rapport explorer ne conclut pas
   explicitement `SAFE TO PROCEED = YES`.
5. Si `SAFE TO PROCEED = NO`, stop et rapporte la raison.

## Challenge architecte obligatoire

Le rapport explorer doit contenir :

```text
Solution Architect Refactoring Challenge
1. Can we extend the existing auth module safely?
2. Would a refactor reduce risk before backend-owned registration?
3. What duplicated source of truth exists today?
4. What canonical write path owns pharmacies/{uid} after this sprint?
5. What read paths and write paths must be switched together?
6. What migration/audit is required for unknown countryCode?
7. What should explicitly NOT be refactored in this sprint?
Decision: EXTEND | REFACTOR_FIRST | STOP
```

Stop immédiat si :

- backend-owned registration exige une refonte auth multi-rôles large ;
- la stratégie de session post-create est incohérente ou non testable ;
- unknown-country deny risque de bloquer un pays actif sans audit ;
- les tests minimaux ne peuvent pas être lancés ni remplacés par une
  justification claire.

## Lots writer obligatoires

Si `SAFE TO PROCEED = YES`, implémenter strictement :

1. Lot A — Unknown-country fail-closed dans `licenseGate.ts` + tests.
2. Lot B — rename/clarification test helper + 1 test ciblé par accept
   callable pour missing counterparty.
3. Lot C — drift guard test `PROTECTED_LICENSE_FIELDS` vs
   `firestore.rules`.
4. Lot D — `createPharmacyRegistration` backend-owned + migration
   minimale `UnifiedAuthService.signUp` pour pharmacies.
5. Lot E — docs actives et statut final.

## Validation minimale obligatoire

```powershell
cd C:\Users\aebon\projects\pharmapp-mobile\functions
npm run build
npm run lint
npm test
npm run test:rules

cd C:\Users\aebon\projects\pharmapp-mobile\shared
dart analyze

cd C:\Users\aebon\projects\pharmapp-mobile\pharmapp_unified
flutter analyze
```

Si `npm run test:rules` échoue à cause du sandbox/configstore Firebase,
relance hors sandbox avec approbation utilisateur et documente les deux
résultats.

## Review/finalize

Quand l'implémentation est prête :

```powershell
cd C:\Users\aebon\projects\ai-dev-orchestrator
python -m orchestrator.cli run-review --run-id <run_id> --allow-dirty
```

Si `CHANGES_REQUESTED`, lire `CODER_PROMPT_ITER_2.md`, corriger
strictement, puis relancer `run-review`.

Si `APPROVED` :

```powershell
python -m orchestrator.cli run-finalize --run-id <run_id>
```

## Format de statut utilisateur

Réponds avec :

```text
Sprint courant: Sprint 2A.3 — TD-LICENSE-REGISTRATION-OWNED
Run id: <id si créé>
État: <not started | running | changes requested | approved | finalized | blocked>
Dernière action: <action>
Prochaine action: <action>
Blocage: <none ou détail>
```

À la fin :

```text
Sprint terminé: Sprint 2A.3 — TD-LICENSE-REGISTRATION-OWNED
Run id: <id>
Fichiers changés: <résumé>
Validations: <résumé>
Docs mises à jour: <oui/non + chemins>
Risques résiduels: <liste courte>
Prochain sprint: Sprint 2B — F-LICENSE UI Integration
```
