# Sprint 5 — Evidence archives

Ce dossier rassemble les preuves runtime des 8 scénarios du plan
[../SPRINT_5_E2E_CLOSURE_PLAN.md](../SPRINT_5_E2E_CLOSURE_PLAN.md).

## Convention de nommage

Un sous-dossier par exécution de recette, daté ISO :

```text
evidence/
├── README.md                              ← ce fichier (template, NE pas éditer par run)
├── SPRINT_5_emulator_<YYYY-MM-DD>/        ← preuves phase 1 (emulator local)
│   ├── S1/   S2/   S3/ … S8/
│   └── recap.md
└── SPRINT_5_staging_<YYYY-MM-DD>/         ← preuves phase 2 (real Firebase staging)
    ├── S1/   S2/   S3/ … S8/
    └── recap.md
```

> 🔒 **Architect lock 2026-05-14** : seules les preuves
> `SPRINT_5_staging_*` permettent de transiter Sprint 5 en `PASS`. Les
> preuves emulator servent à valider la phase de stabilisation
> (corrections de bugs avant phase 2), pas à clore le sprint.

## Contenu attendu d'un sous-dossier `S<n>/`

Pour chaque scénario (S1 à S8), 4 fichiers :

- `summary.md` — 1 paragraphe + verdict PASS/FAIL.
- `firestore-export.json` — export des docs créés/modifiés (proposalId,
  deliveryId, ledger, wallet snapshot pré/post).
- `cloud-logging.txt` — extract Cloud Logging filtré par `requestId` /
  `proposalId` pendant la fenêtre du scénario.
- `ui-<step>.png` — screenshots clés du flow utilisateur.

Pour S1 (LICENSE_REQUIRED) : screenshot du snackbar + log
`failed-precondition`.
Pour S5 (medicine request exchange Sprint 4) : screenshot du
`_InventoryPickerDialog` + extraction `pharmacy_inventory/{itemB}`
montrant `reservedQuantity` incrémenté seul (lock #5).
Pour S8 (withdrawal) : ledger + wallet pré/post.

## Format `recap.md`

Synthèse runtime à compléter à la fin de chaque session recette :

```markdown
# Sprint 5 — Recap recette <emulator|staging> <YYYY-MM-DD>

| # | Scénario | Verdict | Notes |
|---|---|---|---|
| 1 | Inscription Ghana sans licence → LICENSE_REQUIRED | ⏳ |  |
| 2 | Inscription Ghana avec licence → pending_verification | ⏳ |  |
| 3 | Admin verify → verified + trial démarre | ⏳ |  |
| 4 | Medicine request purchase E2E | ⏳ |  |
| 5 | Medicine request exchange Sprint 4 E2E | ⏳ |  |
| 6 | Parity matrix cross-mode | ⏳ |  |
| 7 | Non-verified bloqué sur 5 callables | ⏳ |  |
| 8 | Withdrawal happy path + MSISDN | ⏳ |  |

**Verdict global** : <PASS / FAIL / BLOCKED>
**Bugs découverts** : <liste, lien vers commits de correction>
**Décision** : <continue phase 2 / mark Sprint 5 PASS / open micro-sprint X>
```

## Pourquoi pas dans `.gitignore` ?

Les preuves sont commit-trackées (sauf binaires lourds optionnels) pour
traçabilité produit. Pour les très gros exports Firestore (> 1 MB),
préférer un upload sur `gs://<bucket>/sprint5-evidence/` et garder un
pointer dans `summary.md`.

## Liens

- Plan recette : [../SPRINT_5_E2E_CLOSURE_PLAN.md](../SPRINT_5_E2E_CLOSURE_PLAN.md)
- Phase 1 emulator : [../STAGING_SETUP_EMULATOR.md](../STAGING_SETUP_EMULATOR.md)
- Phase 2 real staging : [../STAGING_SETUP_FIREBASE_PROJECT.md](../STAGING_SETUP_FIREBASE_PROJECT.md)
- Runbook post-deploy : [../SPRINT_5_MONITORING_7D.md](../SPRINT_5_MONITORING_7D.md)
