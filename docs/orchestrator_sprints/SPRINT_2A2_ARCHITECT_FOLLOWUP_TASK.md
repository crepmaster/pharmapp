# Sprint 2A.2 — F-LICENSE Architect Follow-up

À exécuter dans l'orchestrator uniquement.

## Origine

Architect review post-Sprint-2A.1 (run `20260512-200553-7f698f` APPROVED orchestrator + APPROVED hotfix sécurité architecte) a identifié 6 findings additionnels (2 HIGH + 3 MEDIUM + 1 LOW/MED) qui ne remettent pas en cause la fermeture du hotfix sécurité mais empêchent de qualifier F-LICENSE backend de "fully closed" architecturalement.

Sprint 2A.2 ferme ces 6 findings dans un sprint dédié de consolidation.

## Décisions verrouillées par l'architecte (2026-05-12)

1. Sprint 2A.2 via orchestrator (cohérence workflow).
2. **TD-LICENSE-REGISTRATION-OWNED (Option A) sera traité en Sprint 2A.3 dédié AVANT Sprint 2B** — pour aligner registration sur write path canonique avant l'UI, garantir UX cohérente sur mandatory countries dès le jour 1, et déblo­quer Sprint 3 Trial gate sur path canonique.
3. Séquence verrouillée : **2A.2 → 2A.3 → 2B → 3 → 4 → 5**.
4. Marketplace visibility (Finding #5) traité comme **lot supplémentaire de Sprint 2B**, pas dans 2A.2 (UI + backend filter coordinated).
5. Sprint 2A.2 = follow-up doc + tests + fail-closed + contract updates, **pas de refactor architectural**. L'Option A est en 2A.3.

## Objectif

Fermer les 6 findings architecte, garantir cohérence docs/tests/contracts pour permettre l'exécution propre de 2A.3 puis 2B.

## Périmètre autorisé

### Code

- `functions/src/acceptExchangeProposal.ts` — fail-closed counterparty
- `functions/src/acceptMedicineRequestOffer.ts` — fail-closed counterparty
- `functions/src/__tests__/firestore-rules.test.ts` — paramétrisation `PROTECTED_LICENSE_FIELDS` couvrant 9 champs
- nouveaux fichiers de tests callable-level : `functions/src/__tests__/acceptExchangeProposal-license-gate.test.ts` ou équivalent qui mock counterparty rejected/expired et asserte le throw
- éventuellement extraction d'une constante partagée `PROTECTED_LICENSE_FIELDS` (par exemple dans `functions/src/lib/licenseGate.ts`) pour single source of truth rules-tests/code

### Documentation

- `CLAUDE.md` — section "État fonctionnel — ce qui n'est PAS livré" §2 (license stub), section "Dev commands" (ajouter `npm run test:rules`)
- `docs/ACTIVE_DOCS.md` — ajouter 2a, 2A.1, 2A.2, 2A.3, 2B + findings file
- `docs/orchestrator_sprints/SPRINT_2B_LICENSE_UI_TASK.md` — contrat corrigé :
  - lot "Marketplace visibility" ajouté (Finding #5 : non-verified mandatory hors listing post-grâce)
  - note que la registration UI **n'écrit pas** Firestore direct mais appelle le nouveau callable Option A livré en Sprint 2A.3 (le contrat 2B présuppose 2A.3 fermé)
- `docs/orchestrator_sprints/README.md` — refléter séquence 2A.2 → 2A.3 → 2B
- ce contrat (statut final)

## Périmètre interdit

- **Pas de refactor de registration** (Option A est Sprint 2A.3, pas 2A.2).
- Pas d'UI (admin_panel, pharmapp_unified) — toujours scope 2B.
- Pas de changement de la logique des callables marketplace (gates et code métier restent intacts, seul ajout : throw fail-closed sur counterparty ID absent).
- Pas de touche au gate principal `licenseGate.ts.assertLicenseAllowsMarketplace` (sauf extraction de constante `PROTECTED_LICENSE_FIELDS` si choisi en explorer).
- Pas de changement Bloc 2 exchange mode (Sprint 4), trial subscription (Sprint 3), money, wallet.
- Pas de deploy prod.

## Solution Architect Refactoring Challenge

1. Y a-t-il un risque de duplication de la liste des 9 champs licence (rules / tests / éventuel code) ? Si oui, l'extraire en constante TypeScript partagée `PROTECTED_LICENSE_FIELDS` consommée par `firestore-rules.test.ts` et documentée dans `licenseGate.ts`.
2. Le fail-closed sur counterparty ID absent doit-il `throw HttpsError("failed-precondition")` ou `throw HttpsError("internal")` — quel code reflète mieux "le proposal/offer est inutilisable parce qu'il manque la counterparty" ?
3. Les tests callable-level peuvent-ils être unitaires avec mocks Firestore (style `createWithdrawalRequest-msisdn.test.ts`), ou demandent-ils l'emulator ? Préférer le mock pour rester dans `npm test` standard.
4. Sprint 2B contract correction : la registration UI doit **présupposer** que 2A.3 est livré (donc appelle le nouveau callable). Si 2A.3 dérape, 2B reste bloqué — c'est explicite dans le contrat 2A.2 ?
5. Marketplace visibility en lot Sprint 2B : critère done explicite "non-verified mandatory post-grâce **N'APPARAÎT PAS** dans le marketplace listing" — niveau d'enforcement (backend filter vs UI filter) à trancher dans l'explorer 2B.
6. ACTIVE_DOCS.md doit-il lister chaque sprint orchestrator individuellement ou un seul pointer vers `orchestrator_sprints/README.md` ? Le pointer évite la duplication mais perd la visibilité ; les deux approches sont acceptables.
7. Décision : EXTEND (pas de refactor architectural en 2A.2).

**Décision attendue : EXTEND**

## Explorer read-only

1. Lire les 6 findings dans `SPRINT_2A_ARCHITECT_REVIEW_FINDINGS.md`.
2. Inspecter la section "État fonctionnel — ce qui n'est PAS livré" §2 dans `CLAUDE.md` pour confirmer le wording exact à remplacer.
3. Inspecter `firestore-rules.test.ts` pour comprendre la structure actuelle (12 tests dont 6 create + 3 update + variantes) et planifier la paramétrisation.
4. Inspecter `acceptExchangeProposal.ts` et `acceptMedicineRequestOffer.ts` pour planifier la transition `if (sellerUid)` → `if (!sellerUid) throw...`.
5. Inspecter le contrat 2B existant pour identifier les sections à patcher (Batch 3 registration UI, ajout lot marketplace visibility).
6. Identifier le pattern de tests callable-level existant (probablement `firebase-functions-test` déjà présent ; sinon mocks Firestore comme `createWithdrawalRequest-min-resolution.test.ts`).
7. `SAFE TO PROCEED = YES/NO`.

## Writer — par lots

### Lot 1 — Code fail-closed counterparty + tests

- `acceptExchangeProposal.ts` : remplacer `if (typeof fromPharmacyId === "string" && fromPharmacyId.length > 0)` par `if (!fromPharmacyId || typeof fromPharmacyId !== "string") throw new HttpsError("failed-precondition", "Proposal counterparty missing.")` puis call gate sans le check optionnel.
- `acceptMedicineRequestOffer.ts` : idem pour `sellerUid`, en gardant le pattern "read l'offer pré-tx puis throw si non-existante OU si seller manquant".
- Nouveau fichier `functions/src/__tests__/acceptCallables-license-gate.test.ts` (ou 2 fichiers séparés) : mocks firebase-admin + tests qui prouvent :
  - counterparty `verified` → gate passe
  - counterparty `rejected` → gate throw
  - counterparty `expired` → gate throw
  - counterparty grace_period expiré → gate throw
  - counterparty grace_period actif → gate passe
  - counterparty ID manquant → throw fail-closed avec code `failed-precondition`

### Lot 2 — Rules tests paramétrés sur 9 champs

- Extraire `PROTECTED_LICENSE_FIELDS: readonly string[]` (par exemple ajout dans `functions/src/lib/licenseGate.ts` ou nouveau fichier `licenseProtectedFields.ts`).
- Réécrire `firestore-rules.test.ts` :
  - Conserver REQ-2A1-001 explicite comme test "headline" (critère architecte non négociable).
  - Ajouter `test.each(PROTECTED_LICENSE_FIELDS)` pour `create` : chaque champ individuellement → DENIED.
  - Ajouter `test.each(PROTECTED_LICENSE_FIELDS)` pour `update` : chaque champ → DENIED.
  - Conserver allow create normal + allow update non-licence + admin SDK bypass.
- Cible : ≥ 18 tests (9 create + 9 update) + 4 variantes (allow normal create, allow phoneNumber update, admin bypass, REQ-2A1-001 explicite).

### Lot 3 — CLAUDE.md correctness

- Réécrire la section §2 "License pharmacie : stub non-enforced" :
  - Avant : "Aucune validation, aucune enforcement par pays, aucun guard."
  - Après : "**Backend enforcement livré (Sprint 2a + 2A.1)** : helper `licenseGate.ts`, 3 callables, gate appliqué aux 5 callables marketplace, Firestore rules deny client write sur 9 champs licence (create + update), counterparty gate. **UI non livrée (Sprint 2B à venir)**. **Registration canonical path en dette (Sprint 2A.3 à venir, TD-LICENSE-REGISTRATION-OWNED)** : le flow Flutter `UnifiedAuthService.signUp` écrit `pharmacies/{uid}` direct ; les rules deny-on-create bouchent la faille sécurité mais le design canonical (callable backend-owned) est attendu en 2A.3."
- Section "Dev commands" : ajouter `npm run test:rules` dans la section testing avec note "à exécuter avant tout deploy de firestore.rules".

### Lot 4 — ACTIVE_DOCS.md

- Ajouter sous Orchestrator sprint pack :
  - `SPRINT_2A_LICENSE_BACKEND_TASK.md` — Sprint 2a fermé + correction 2A.1
  - `SPRINT_2A_ARCHITECT_REVIEW_FINDINGS.md` — findings architecte
  - `SPRINT_2A1_SECURITY_CORRECTION_TASK.md` — hotfix sécurité fermé
  - `SPRINT_2A2_ARCHITECT_FOLLOWUP_TASK.md` — ce sprint
  - `SPRINT_2A3_REGISTRATION_BACKEND_OWNED_TASK.md` — Sprint 2A.3 (à créer en explorer ou en post-2A.2)
  - `SPRINT_2_SCOPING_PROPOSAL.md` — décision split monolithic
- Marquer `SPRINT_2_F_LICENSE_TASK.md` comme "référence agrégée, ne plus exécuter".

### Lot 5 — Sprint 2B contract correction

- Préambule du contrat 2B :
  - Note : **Sprint 2B présuppose 2A.3 (TD-LICENSE-REGISTRATION-OWNED) fermé**. Si 2A.3 n'est pas livré, 2B est bloqué.
  - Registration UI 2B appelle le nouveau callable backend (livré en 2A.3) au lieu d'écrire `pharmacies/{uid}` direct via `UnifiedAuthService.signUp`.
- Ajout nouveau lot **Marketplace Visibility** :
  - Critère done : pharmacies mandatory non-verified post-grâce **N'APPARAISSENT PAS** dans le marketplace listing.
  - Préférer un endpoint backend listing filtré (par exemple callable `getMarketplacePharmacies` ou ajouter un flag `marketplaceVisible: bool` calculé côté serveur). Filter UI seul **ne suffit pas** (un client modifié peut bypass).
  - Tests : pharmacie mandatory `rejected` ne doit pas apparaître dans le listing.

### Lot 6 — Sprint pack README

- `docs/orchestrator_sprints/README.md` : mettre à jour la séquence pour inclure 2A.2 et 2A.3, marquer 2A.1 fermé.

## Critères de done

- 6 findings fermés (mappés un-pour-un sur les lots 1-6).
- Tests rules : ≥ 18 cas paramétrisés couvrant les 9 champs en create ET update + REQ-2A1-001 explicite + admin SDK bypass + non-licence allow.
- Tests callable-level counterparty : ≥ 6 tests dont fail-closed sur ID absent.
- CLAUDE.md cohérent : pas de double énoncé contradictoire.
- ACTIVE_DOCS.md complet.
- Sprint 2B contract patché avec préambule 2A.3-dependency + lot marketplace visibility.
- Sprint pack README aligné sur la séquence verrouillée.
- `npm run build && npm run lint && npm test && npm run test:rules` ✅

## Validation minimale

```bash
cd functions && npm run build
cd functions && npm run lint
cd functions && npm test
cd functions && npm run test:rules
cd shared && dart analyze
```

Pas de `flutter analyze` (aucune UI touchée).

## Non-régression

- 144 tests backend pré-2A.2 : restent verts.
- 12 tests rules pré-2A.2 : remplacés par ≥ 18 tests paramétrisés ; REQ-2A1-001 explicite reste comme test nommé.
- Sprint 2a + 2A.1 hotfix sécurité : non-modifié.
