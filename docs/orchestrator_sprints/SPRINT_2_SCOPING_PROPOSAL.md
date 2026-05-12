# Sprint 2 — F-LICENSE : proposition de scoping pour l'architecte

**Date** : 2026-05-12
**Auteur** : Claude (developer/orchestrator runner)
**Destinataire** : Architecte projet
**Décision attendue** : choix de scope A / B / C avant exécution writer
**Statut orchestrator** : run `20260512-071930-295390` au statut `WAITING_CODER`, en attente.

---

## 1. Contexte

Sprints 0 (Doc Freeze) et 1 (3.2c-β MSISDN hardening) sont fermés, APPROVED par toi à l'itération 1 de l'orchestrator dans les deux cas. Le pre-deploy audit pour le 3.2c-β est tracké comme `TD-MSISDN-AUDIT` (BLOQUANT pour deploy) dans `CLAUDE.md`.

Sprint 2 — F-LICENSE est le prochain dans la séquence verrouillée (voir [memory/project_roadmap_2026-05.md](../../C:/Users/aebon/.claude/projects/c--Users-aebon-projects-pharmapp-mobile/memory/project_roadmap_2026-05.md) et [GLOBAL_EXECUTION_CONTRACT.md](GLOBAL_EXECUTION_CONTRACT.md)).

Les 5 décisions produit verrouillées sont valides et ne sont pas remises en cause par cette proposition de scoping :

1. License config pilotée par `system_config/main.countries.{code}`.
2. Activation rétroactive avec grâce 30 jours.
3. Accès limité tant que `licenseStatus != verified`.
4. Trial démarre à validation licence (Sprint 3, hors scope ici).
5. Bloc 2 P2 MVP `purchase | exchange`, pas `either`, pas de soulte (Sprint 4, hors scope ici).

---

## 2. Audit de taille — Sprint 2 dans son intégralité

J'ai cartographié les fichiers à toucher pour livrer le contrat `SPRINT_2_F_LICENSE_TASK.md` dans son intégralité :

| Batch contrat | Fichiers concernés | Type | Effort |
|---|---|---|---|
| **1. Master data country** | `shared/lib/models/master_data_snapshot.dart` (extend `MasterDataCountry` +7 champs), `shared/lib/services/master_data_service.dart` (parse nouveaux champs) | extend | S |
| **2. Admin panel country UI** | `admin_panel/lib/screens/system_config/countries_tab.dart` (toggle + 6 inputs édition), `admin_panel/lib/services/system_config_service.dart` (méthode `upsertCountryLicenseConfig`), nouveau callable `functions/src/setCountryLicenseConfig.ts` (admin-scoped) | new + extend | M |
| **3. Pharmacy registration UI** | `pharmapp_unified/lib/screens/auth/unified_registration_screen.dart` (license input conditionnel sur `MasterDataCountry.licenseRequired`), `shared/lib/screens/auth/country_payment_selection_screen.dart` (re-route via country snapshot) | extend | M |
| **4. Backend validation inscription** | `functions/src/auth/unified-auth-functions.ts` (`createPharmacyUser` valide `licenseNumber` selon country config, écrit `licenseStatus`, calcule `licenseGraceEndsAt` si activation rétroactive), nouveau `functions/src/submitPharmacyLicense.ts` (pharmacie corrige/upload sa licence) | extend + new | M |
| **5. Admin verify workflow** | Nouveau `functions/src/adminVerifyPharmacyLicense.ts` (admin verify/reject/correction_needed), nouveau écran `admin_panel/lib/screens/pharmacy_license_review_screen.dart`, lien dans `pharmacy_management_screen.dart` | new + extend | M |
| **6. Runtime gates** | Nouveau helper `functions/src/lib/licenseGate.ts` (`assertLicenseAllowsMarketplace(uid)`), application dans `createExchangeProposal.ts`, `acceptExchangeProposal.ts`, `createMedicineRequest.ts`, `submitMedicineRequestOffer.ts`, `acceptMedicineRequestOffer.ts` | new + extend ×5 | M |
| **7. Backfill grace period** | Nouveau callable admin-only `functions/src/backfillLicenseGracePeriod.ts` (dry-run + commit, idempotent par flag) | new | S |
| **8. Firestore rules** | `firestore.rules` — interdire client write sur `licenseStatus`, `licenseVerifiedBy`, `licenseVerifiedAt`, `licenseRejectionReason`, `licenseGraceEndsAt`, `licenseGracePeriodDays` (côté country) | extend | S |
| **9. Tests** | Jest backend ×4 nouvelles fonctions + gates × 5 callables + widget tests Flutter UI conditionnelle | new | L |
| **10. Docs** | `CLAUDE.md` (Sprint 2 statut + nouveaux modèles), `SPRINT_2_F_LICENSE_TASK.md` (statut final), éventuellement nouvelle entrée `ACTIVE_DOCS.md` | extend | S |

**Total estimé** : ~35-45 fichiers modifiés/créés, ~2000-3000 lignes de code écrites. Coût orchestrator estimé ~$0.30-$0.50.

À titre de comparaison :
- Sprint 0 (Doc Freeze) : 72 fichiers déplacés/modifiés mais zéro logique métier — ~$0.12
- Sprint 1 (MSISDN hardening) : 4 fichiers touchés, 43 tests ajoutés — ~$0.12

Sprint 2 est **~3x la taille** des sprints précédents en logique métier, et touche **6 modules différents** (shared, admin_panel, pharmapp_unified, functions, firestore.rules, tests).

---

## 3. Trois options de scope

### Option A — Sprint 2 complet en un seul run orchestrator

**Livrable** : les 10 batches du contrat dans le run actuel `20260512-071930-295390`.

**Stratégie** : 2-3 itérations orchestrator review-changes-review. Iter 1 livre backend + data models + gates + tests backend + docs. Review identifiera l'UI manquante, iter 2 ajoute admin UI + registration UI + widget tests. Iter 3 cleanup résiduel.

**Avantages** :
- Un seul artefact orchestrator pour tracer le travail F-LICENSE.
- Le critère de done "Ghana activable sans code change" est atteint en fin de run.

**Risques** :
- **Saturation context window** : la conversation actuelle est déjà longue. Lire 35-45 fichiers, écrire 2000-3000 lignes, gérer 2-3 itérations orchestrator → risque réel de devoir reprendre dans une nouvelle session, ce qui complique la cohérence des décisions.
- **Atomicité commit** : un sprint qui couvre 6 modules différents en un seul lot de commits est dur à reviewer humainement, et difficile à reverter proprement si on découvre un bug mi-session.
- **Risque de bâcler** : pour rester dans la budget context, je risque de simplifier trop l'UI ou les tests.

### Option B — Split Sprint 2 en 2a (backend) + 2b (UI)

**Livrable Sprint 2a** (ce run, abandonner et relancer avec un task file dédié 2a) :
- Batch 1 : `MasterDataCountry` étendu (data model)
- Batch 4 : `createPharmacyUser` validation + nouveau `submitPharmacyLicense`
- Batch 5 (backend only) : nouveau `adminVerifyPharmacyLicense` (sans l'écran admin)
- Batch 6 : licenseGate helper + application aux 5 callables sensibles
- Batch 7 : backfill function
- Batch 8 : Firestore rules
- Batch 9 (backend only) : Jest tests
- Batch 10 : docs partielles
- **~15-20 fichiers, ~1000-1500 lignes**

**Livrable Sprint 2b** (run suivant) :
- Batch 2 : Admin panel countries_tab license UI + service callable wire
- Batch 3 : Pharmacy registration UI conditionnel
- Batch 5 (UI only) : Écran admin de verification
- Batch 9 (frontend only) : widget tests
- Docs finales et `CLAUDE.md` final
- **~15-20 fichiers, ~1000-1500 lignes**

**Avantages** :
- Chaque sub-sprint est complet et testable atomiquement (backend complet = on peut valider via curl/Jest avant de toucher l'UI).
- Aligné avec le principe contrat `Implémenter par lots sûrs` ([SPRINT_2_F_LICENSE_TASK.md:104](SPRINT_2_F_LICENSE_TASK.md#L104)).
- Pas de risque context saturation : chaque run est dimensionné comme Sprint 1.
- Cohérent avec ton retour d'expérience sur Sprint 1 (review architecte propre en iter 1).
- Le sprint pack peut être étendu d'un fichier `SPRINT_2A_BACKEND_TASK.md` et `SPRINT_2B_UI_TASK.md` si tu valides cette option.

**Inconvénients** :
- Le critère "Ghana activable sans code change" n'est techniquement vrai qu'en fin de 2b (donc retardé d'un sprint).
- Deux runs orchestrator au lieu d'un — surcoût marginal en tokens (~+10%).
- Le sprint pack a un fichier en plus à maintenir.

### Option C — Sprint 2 MVP réduit en un run

**Livrable** : batches 1, 4 (`createPharmacyUser` uniquement, pas de `submitPharmacyLicense`), 6, 7, 8, tests minimaux, docs.

**Stratégie** : implémenter uniquement la **fondation** (data model + un seul write path backend + gate + backfill + rules). Pas de `submitPharmacyLicense`, pas d'`adminVerifyPharmacyLicense`, pas d'UI nulle part.

**Avantages** :
- Tient en un run.
- Permet d'activer le flag `licenseRequired` côté config sans code change (via admin panel direct write Firestore par super_admin temporairement).
- Risque context faible.

**Inconvénients critiques** :
- **La feature n'est pas utilisable end-to-end** : aucun moyen pour la pharmacie de soumettre/corriger sa licence après inscription, aucun moyen pour l'admin de la vérifier autrement qu'à la main via Firestore console.
- Aller à Sprint 3 (Trial) sans `licenseVerifiedAt` accessible créerait des couplages bancals (Sprint 3 a besoin de cette colonne pour le compteur trial sur pays mandatory).
- La feature paraîtrait livrée alors qu'elle ne l'est pas vraiment, violant la règle `Ne marque pas un sprint terminé si les tests ou les docs ne sont pas cohérents` ([CLAUDE_RUNNER_PROMPT.md:189](CLAUDE_RUNNER_PROMPT.md#L189)).

---

## 4. Recommandation

**Option B (split 2a + 2b)** est la plus saine et la plus alignée avec :

1. Le principe contrat `Implémenter par lots sûrs`.
2. La discipline de revue architecte itérative qu'on a établie sur les sprints précédents.
3. La règle `un sprint ne peut pas être marqué terminé si les tests ou les docs ne sont pas cohérents` — chaque sub-sprint est intrinsèquement cohérent.
4. La contrainte technique réelle (context window, taille des changements à reviewer humainement).

L'option A est défendable mais risquée. L'option C laisse une feature half-baked qui complique Sprint 3.

**Action concrète si tu valides B** :

1. Je marque le run `20260512-071930-295390` comme abandonné (status reste `WAITING_CODER` jusqu'à ce qu'on le rouvre — pas critique, on peut le laisser orphan ou créer un nouveau run avec le task 2a).
2. Je crée deux nouveaux fichiers task :
   - `docs/orchestrator_sprints/SPRINT_2A_LICENSE_BACKEND_TASK.md`
   - `docs/orchestrator_sprints/SPRINT_2B_LICENSE_UI_TASK.md`
3. Je mets à jour `docs/orchestrator_sprints/README.md` et `GLOBAL_EXECUTION_CONTRACT.md` pour refléter le split.
4. Je lance `run-start` sur Sprint 2a.

---

## 5. Question pour l'architecte

**Choisis A, B, ou C.**

Si B : valide aussi que je peux abandonner le run orchestrator actuel (`20260512-071930-295390`) et créer un sprint pack 2a/2b plutôt qu'un seul Sprint 2.

Si A : valide que tu acceptes le risque context-window et de devoir potentiellement reprendre dans une nouvelle session si la conversation devient trop longue.

Si C : valide que tu acceptes une feature livrée mais non-utilisable end-to-end pour la durée d'un sprint suivant.

Aucune action côté code tant que tu n'as pas répondu.

---

## 6. Réponse architecte — 2026-05-12

**Décision : Option B validée — split Sprint 2 en 2a backend + 2b UI.**

Je valide l'analyse de taille : Sprint 2 complet en un seul run est trop large pour une exécution robuste. Il touche trop de frontières critiques en même temps : master data, auth/registration, callables métier, Firestore rules, admin panel, app mobile, tests et docs. Ce n'est pas un bon candidat pour un run monolithique.

Je rejette donc :

- **Option A** : faisable mais trop risquée en context window, review humaine et rollback.
- **Option C** : non acceptable, car elle livrerait une fondation non utilisable end-to-end et créerait une ambiguïté dangereuse avant Sprint 3 Trial.

### Run actuel

Je valide l'abandon du run orchestrator actuel `20260512-071930-295390` pour le scope monolithique.

Ne pas essayer de réutiliser ce run pour coder. Créer de nouveaux task files dédiés :

1. `SPRINT_2A_LICENSE_BACKEND_TASK.md`
2. `SPRINT_2B_LICENSE_UI_TASK.md`

Mettre à jour :

- `docs/orchestrator_sprints/README.md`
- `docs/orchestrator_sprints/GLOBAL_EXECUTION_CONTRACT.md` si l'ordre verrouillé doit lister 2a/2b explicitement
- `CLAUDE.md` si le backlog vivant doit refléter le split

### Scope Sprint 2a validé

Sprint 2a doit livrer une fondation backend complète, testable sans UI :

1. Extension des modèles master data côté shared :
   - `licenseRequired`
   - `licenseLabel`
   - `licenseHelpText`
   - `licenseVerificationRequired`
   - `licenseFormatRegex`
   - `licenseDocumentRequired`
   - `licenseGracePeriodDays`

2. Backend license service / helpers :
   - lecture de `system_config/main.countries.{countryCode}`
   - calcul du statut initial licence
   - validation du format si regex configurée
   - fonction de gate marketplace

3. Write paths backend :
   - `createPharmacyUser` doit initialiser correctement les champs licence selon le pays
   - `submitPharmacyLicense` peut être livré en 2a si simple et testable sans Storage complet ; sinon le task 2a doit le borner explicitement à metadata-only et laisser upload document réel pour 2b
   - `adminVerifyPharmacyLicense` backend peut être livré en 2a même sans écran admin

4. Runtime gates backend :
   appliquer le helper aux actions sensibles :
   - `createExchangeProposal`
   - `acceptExchangeProposal`
   - `createMedicineRequest`
   - `submitMedicineRequestOffer`
   - `acceptMedicineRequestOffer`

5. Backfill / migration :
   - dry-run obligatoire
   - mode commit optionnel mais idempotent
   - grace period 30 jours par défaut
   - aucun deploy / aucune mutation prod dans le sprint

6. Firestore rules :
   - protéger les champs de vérification (`licenseStatus`, `licenseVerifiedBy`, `licenseVerifiedAt`, `licenseRejectionReason`, `licenseGraceEndsAt`)
   - éviter que le client puisse auto-verify
   - garder un chemin de correction licence contrôlé

7. Tests backend :
   - pays non mandatory -> `not_required`
   - pays mandatory sans licence -> refus à l'inscription ou statut non vérifié selon write path
   - pays mandatory avec licence valide -> `pending_verification`
   - regex invalide -> refus
   - `verified` -> accès marketplace autorisé
   - `pending/rejected/correction_needed/expired` -> accès marketplace refusé
   - `grace_period` non expiré -> accès autorisé
   - `grace_period` expiré -> accès refusé

### Scope Sprint 2b validé

Sprint 2b doit rendre la feature utilisable end-to-end côté utilisateurs et admin :

1. Admin panel :
   - UI super admin pour config pays licence
   - écran/listing de vérification licence
   - actions verify / reject / correction_needed

2. App mobile :
   - champ licence conditionnel à l'inscription pharmacie
   - texte d'aide et label depuis master data
   - affichage du statut licence dans profil/onboarding
   - flow de correction licence si rejetée/correction_needed

3. UX gates :
   - accès limité visible et compréhensible
   - inventaire préparatoire autorisé mais publication marketplace bloquée si non verified/hors grâce
   - messages cohérents, sans promettre trial actif avant Sprint 3

4. Tests frontend ciblés :
   - champ obligatoire si country mandatory
   - champ absent ou optionnel si non mandatory
   - admin verify/reject happy path si testable

### Challenge architecte obligatoire pour 2a

Le task 2a doit forcer une section `Solution Architect Refactoring Challenge` avec décision explicite :

```text
Decision: EXTEND | REFACTOR_FIRST | STOP
```

Points à challenger avant code :

1. Est-ce que `system_config/main.countries` est bien la source canonique suffisante ?
2. Est-ce qu'il existe déjà un modèle country concurrent dans admin/shared/mobile ?
3. Quel helper unique porte la vérité du gate licence ?
4. Quels write paths peuvent créer ou modifier une pharmacie ?
5. Quels read paths consomment l'accès marketplace ?
6. Quelles données doivent être protégées par Firestore rules ?
7. Quel backfill est nécessaire pour pharmacies existantes ?

Si un modèle canonique manque, 2a doit faire le refactor minimal avant d'ajouter les gates.

### Conditions de non-régression

2a ne doit pas casser :

- inscription pharmacie pays non mandatory
- exchange proposal purchase existant
- medicine request purchase-only existant
- admin country-scoped RBAC existant
- tests functions existants

2b ne doit pas casser :

- login/registration unifiée
- admin country/city/currency configuration
- profile pharmacy existant
- inventory preparation

### Validation attendue

Pour 2a :

```bash
cd functions && npm run build
cd functions && npm run lint
cd functions && npm test
cd shared && dart analyze
```

Pour 2b :

```bash
cd shared && dart analyze
cd admin_panel && flutter analyze
cd pharmapp_unified && flutter analyze
cd functions && npm run build && npm test
```

Si Flutter analyze timeout, le rapport final doit le documenter explicitement avec commande à relancer.

### Statut final de cette décision

**APPROVED TO SPLIT.**

Prochaine action autorisée : créer les contrats `SPRINT_2A_LICENSE_BACKEND_TASK.md` et `SPRINT_2B_LICENSE_UI_TASK.md`, mettre à jour l'index des sprints, puis lancer `run-start` uniquement sur 2a.
