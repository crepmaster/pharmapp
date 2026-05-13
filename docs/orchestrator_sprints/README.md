# PharmApp Orchestrator Sprint Pack

Ce dossier contient les contrats de sprint à exécuter via `ai-dev-orchestrator`.

Chaque fichier `SPRINT_*.md` est conçu comme un ticket source autonome pour l'orchestrator. Le principe est volontairement strict : un sprint ne peut pas être marqué terminé si les docs actives ne reflètent pas l'état réel du code.

## Ordre d'exécution verrouillé

1. `SPRINT_0_DOC_FREEZE_TASK.md` — ✅ fermé 2026-05-12 (run `20260512-000940-c578fa`)
2. `SPRINT_1_MSISDN_HARDENING_TASK.md` — ✅ fermé 2026-05-12 (run `20260512-065209-a16494`)
3. `SPRINT_2A_LICENSE_BACKEND_TASK.md` — ✅ fermé fonctionnellement (run `20260512-090822-3bfcff`) ; revue architecte a requis 2A.1 + 2A.2 (voir [SPRINT_2A_ARCHITECT_REVIEW_FINDINGS.md](SPRINT_2A_ARCHITECT_REVIEW_FINDINGS.md))
3.1. `SPRINT_2A1_SECURITY_CORRECTION_TASK.md` — ✅ fermé (run `20260512-200553-7f698f`)
3.2. `SPRINT_2A2_ARCHITECT_FOLLOWUP_TASK.md` — ✅ fermé (run `20260512-221309-3e615c`)
3.3. `SPRINT_2A3_REGISTRATION_BACKEND_OWNED_TASK.md` — ✅ fermé (run `20260513-150635-7c7af8`) + correction 2A.3.1 (audit script + Flutter entrypoint test + LICENSE_REQUIRED signal preservation), pushed sur origin/main
4. `SPRINT_2B_LICENSE_UI_TASK.md` — ⚠️ **SUPERSEDED 2026-05-13** (split en 2B.1 + 2B.2 par décision architecte ; run monolithique `20260513-161632-0b66fb` abandonné)
4.1. `SPRINT_2B1_ADMIN_LICENSE_OPS_TASK.md` — ✅ fermé (run `20260513-163310-d506b0` + corrections architecte). Admin License Operations livrés : nouveau callable `setCountryLicenseConfig`, admin UI (`countries_tab.dart` + `LicenseConfigDialog` extrait), `pharmacy_license_review_screen.dart`, fix clobber `upsertCountry` (dotted-path), helper `buildLicenseReviewQuerySpec` testable, 22 widget+unit tests, 16 Jest tests callable.
4.2. `SPRINT_2B2_PHARMACY_UX_AND_MARKETPLACE_TASK.md` — ⚠️ **SUPERSEDED 2026-05-13** (split en 2B.2a + 2B.2b par verdict architecte B ; éviter une revue mixée Pharmacy UX + Marketplace)
4.2.a. `SPRINT_2B2A_PHARMACY_UX_TASK.md` — Pharmacy UX : registration `LICENSE_REQUIRED` handler + champ licence conditionnel + profile license status + correction flow. **Aucun marketplace**. **Prochain sprint, débloqué par 2B.1**.
4.2.b. `SPRINT_2B2B_MARKETPLACE_ENFORCEMENT_TASK.md` — Marketplace Enforcement : listing backend-owned + migration 6 consumers Flutter + durcissement `firestore.rules`. Décision `CALLABLE` vs `FLAG` verrouillée dans le contrat (préférence callable sauf triple preuve explorer). **Bloqué jusqu'à clôture 2B.2a**.
5. `SPRINT_3_TRIAL_SUBSCRIPTION_TASK.md`
6. `SPRINT_4_MEDICINE_REQUESTS_EXCHANGE_TASK.md`
7. `SPRINT_5_E2E_CLOSURE_TASK.md`

Le contrat monolithique `SPRINT_2_F_LICENSE_TASK.md` est conservé comme
référence agrégée (modèle cible country + pharmacy + critères de done
end-to-end) mais **n'est plus exécuté** directement. Idem pour
`SPRINT_2B_LICENSE_UI_TASK.md` (superseded par 2B.1 + 2B.2) et
`SPRINT_2B2_PHARMACY_UX_AND_MARKETPLACE_TASK.md` (superseded par 2B.2a + 2B.2b).

## Contrat global

Lire `GLOBAL_EXECUTION_CONTRACT.md` avant chaque sprint. Il définit :

- les décisions produit verrouillées ;
- les règles de reprise entre sessions ;
- le challenge architecte solution/refactoring obligatoire ;
- les obligations de documentation ;
- le format de rapport final attendu.

## Prompt maître Claude

Utiliser `CLAUDE_RUNNER_PROMPT.md` pour demander à Claude Code de lancer et suivre les sprints via l'orchestrator.

Pour le prochain sprint, utiliser le prompt dédié
`SPRINT_2A3_RUNNER_PROMPT.md` : il verrouille Option A / alpha,
unknown-country fail-closed, les tests counterparty pragmatiques et le
drift guard `PROTECTED_LICENSE_FIELDS` vs `firestore.rules`.

## Règle de continuité

À chaque nouvelle session, l'agent doit commencer par lire :

1. `CLAUDE.md`
2. `docs/orchestrator_sprints/GLOBAL_EXECUTION_CONTRACT.md`
3. le fichier du sprint courant
4. le rapport final du run orchestrator précédent, s'il existe

Si ces sources se contredisent, le sprint doit s'arrêter avec `SAFE TO PROCEED = NO` jusqu'à clarification ou correction documentaire.
