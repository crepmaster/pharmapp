# CLAUDE.md

Guide de référence pour Claude Code sur ce dépôt. **Source de vérité unique** sur l'état du projet, les objectifs, et le backlog vivant.

> Dernière refonte : **2026-05-12**. Sessions antérieures à avril 2026 → [CLAUDE-ARCHIVE.md](CLAUDE-ARCHIVE.md).

---

## 🚨 RÈGLE 0 — Structure réelle du dépôt (2026-05-12)

**Dossiers actifs (présents sur disque) :**

| Dossier | Rôle | Statut |
|---|---|---|
| `pharmapp_unified/` | **Master app Flutter** — pharmacy + courier sous un même binaire | ✅ actif |
| `admin_panel/` | Back-office web Flutter (admin, super_admin) | ✅ actif |
| `shared/` | Code partagé Dart (models, services, encryption, master data) | ✅ actif |
| `functions/` | Firebase Functions (Node 22, TypeScript) — 42 functions déployées | ✅ actif |
| `docs/` | Documentation contrats, runbooks, post-mortems | ✅ actif |

**Dossiers supprimés (ne plus en parler) :**

- `pharmacy_app/` — supprimé. Tout le code utile a été migré dans `pharmapp_unified/` entre oct. 2025 et avril 2026.
- `courier_app/` — supprimé. Idem.

Si un document interne (ou une mémoire stale) mentionne `pharmacy_app/` ou `courier_app/` comme étant à modifier ou à éviter : c'est **caduc**. Ne pas perdre de temps à les chercher.

---

## 🧭 Orchestrator context

- **Repo orchestrator** : `C:\Users\aebon\projects\ai-dev-orchestrator`
- À consulter en premier quand une tâche a été lancée via l'orchestrator ou qu'un run précédent doit être revu.
- Artifacts : `runs/`, `tasks/`, `orchestrator/`.
- **Sprint pack PharmApp** : [docs/orchestrator_sprints/README.md](docs/orchestrator_sprints/README.md). Les prochains sprints doivent partir de ces contrats et garder les docs actives à jour à chaque run.
- **Contrat de prompt orchestrator** : allowed scope, forbidden scope, stop conditions, done criteria, output format obligatoire.
- **Règle canonical field** : toute introduction d'un champ canonique doit être vérifiée write path **et** read path. Écrire sans switcher le read runtime-critique (settlement, target selection, authorization) ≠ "complete". Si la compat legacy est conservée, le contrat doit dire **explicitement** quel path reste legacy et pourquoi.
- **`SAFE TO PROCEED = NO`** → ne pas démarrer l'implémentation en main thread. Si le verdict stop est tombé sans inspection data alors que la lecture était possible, re-dispatcher un explorer avec data-audit explicite.

---

## 📊 ÉTAT FONCTIONNEL — ce qui marche en prod

### Backend (Firebase project `mediexchange`, region `europe-west1`)

**Functions déployées (42 exports, 100% Node 22) :**

- **Exchange proposals** : `createExchangeProposal`, `acceptExchangeProposal`, `completeExchangeDelivery`, `cancelExchangeProposal`, `expireExchangeHolds` (scheduled)
- **Medicine requests (purchase-only)** : `createMedicineRequest`, `cancelMedicineRequest`, `submitMedicineRequestOffer`, `withdrawMedicineRequestOffer`, `acceptMedicineRequestOffer`
- **Wallet & withdrawal** : `createWithdrawalRequest`, `sandboxAdvanceWithdrawal`, `sandboxCredit`, `sandboxDebit`, `getWallet`
- **Subscription & treasury** : `sandboxSubscriptionSuccess`, `requestPlatformPayout`, `resolvePlatformPayout`, `getSubscriptionStatus`
- **Admin V2 (country-scoped)** : `setPharmacyActive`, `upsertCity`, `setCourierActive`
- **Payments mobile money** : `mtnMomoTopupIntent`, `mtnMomoCheckStatus`, `momoWebhook`, `orangeWebhook`, `topupIntent`
- **Paystack (Ghana)** : `paystackTopupIntent`, `paystackWebhook`
- **Notifications in-app** : `onDeliveryCreatedNotifyCouriers`, `onDeliveryStatusChangedNotifyPharmacies`
- **Auth unifiée** : `createPharmacyUser`, `createCourierUser`, `createAdminUser`, `cleanupTestUserUnified`
- **Legacy exchange (REST)** : `createExchangeHold`, `exchangeCapture`, `exchangeCancel`
- **Validation gateways** : `validateInventoryAccess`, `validateProposalAccess`, `validateAnalyticsAccess`, `health`

**Indexes Firestore wired** (`firestore.indexes.json` lié dans `firebase.json` depuis 2026-04-22) :
- `pharmacies(countryCode + createdAt)`, `couriers(countryCode + createdAt)`, `exchanges(status + createdAt)`, TTL sur `idempotency.at` et `webhook_logs.expireAt`.

### Frontend `pharmapp_unified` (Flutter 3.13+)

**Modules en prod :**
- Landing + app selection (pharmacy / courier) + auth role-based via `UnifiedAuthBloc`
- **Dashboard pharmacy** : 1030-line — wallet, subscriptions, inventory, exchanges, profile, notifications
- **Dashboard courier** : GPS tracking 30s, smart order sorting (distance/fee/efficiency), QR scan pickup/delivery, photo proof, wallet withdrawal, issue reporting
- **Inventory** : add (3 voies : DB essentielle WHO 547 médicaments, barcode EAN/UPC/Data Matrix/Code 128/QR, custom), browser avec filtres, dénormalisation `medicineName/Dosage/Form` à la création
- **Exchange proposals** : create / status / list, city-scoped, snapshot inventaire au moment de la proposition
- **Medicine requests UI** : écran 3 tabs (Open Requests / My Requests / My Offers) — **purchase-only**, voir section limites
- **Profile éditable** : GPS picker (formal address, landmark, descriptive), what3words optionnel, Haversine pour calcul distance
- **Notifications N1** : cloche + badge + inbox temps réel sur events exchange/delivery/wallet
- **Master data shared** : `MasterDataService` parse `system_config/main` (currencies avec `decimals`, `minWithdrawalMinor`, countries, cities)

### Admin panel (web)

- RBAC country-scoped : `super_admin` global, `admin` par `countryScopes: ['CM']`
- Gestion pharmacies, couriers, cities, currencies, subscription plans
- Toutes les opérations sensibles passent par callables backend (writes directs supprimés)

### Sécurité

- HMAC-SHA256 sur phone numbers (hash + encrypt + masked display `677****56`)
- Cross-validation opérateur/préfixe (MTN 65/67/68, Orange 69, Camtel 62, Ghana stripping `233`)
- Production blocking des numéros test
- Firestore rules durcies : `pharmacy_inventory` (Private non lisible), `exchange_proposals`, `deliveries`, `delivery_issues`
- API keys Firebase **jamais** committées (firebase_options.dart utilise des placeholders, voir Testing phase plus bas)

### URLs prod

- Admin : <https://mediexchange-76872.web.app>
- App : <https://app-mediexchange.web.app>

---

## 🚧 ÉTAT FONCTIONNEL — ce qui n'est PAS livré (à savoir)

### 1. Medicine Requests : MVP purchase-only

Le **flag bloquant** est dans le code :

- [functions/src/createMedicineRequest.ts:45-50](functions/src/createMedicineRequest.ts#L45-L50) : `Only 'purchase' mode is supported in this version.`
- [functions/src/submitMedicineRequestOffer.ts:48-53](functions/src/submitMedicineRequestOffer.ts#L48-L53) : `Only 'purchase' offer type is supported in this version.`

**Conséquence** : une pharmacie peut demander un médicament et recevoir des offres d'**achat**, mais pas d'**échange**. La branche "exchange-mode" (Bloc 2 Phase 2) reste à livrer — c'est une feature backlog explicite (voir plus bas).

### 2. License pharmacie : stub non-enforced

- Champ `String? licenseNumber` existe dans [shared/lib/models/unified_user.dart:134](shared/lib/models/unified_user.dart#L134).
- **Aucune validation, aucune enforcement par pays, aucun flow de vérification.**
- Le champ peut rester null à l'inscription, aucun guard ne le bloque.

**Conséquence** : pour les pays où la licence est légalement obligatoire (ex. Ghana), le système actuel **n'empêche pas** une pharmacie de s'enregistrer sans licence. C'est une feature à construire.

### 3. Trial subscription auto-création — implémentation absente

L'archive mentionne des functions `createTrialSubscription`, `migratePharmacySubscriptions`, `checkMigrationStatus` (annoncées 2025-09-18). **Ces fichiers n'existent pas dans `functions/src/`.** Soit l'implémentation n'a jamais été aboutie, soit elle a été supprimée. Les inscriptions ne créent **pas** automatiquement de trial actuellement.

À clarifier produit avant d'agir : faut-il (re)construire, ou la logique trial est-elle gérée ailleurs ?

### 4. Asymétries / dettes connues

- `minWithdrawalMinor` exposé widget courier et backend, mais **pas exposé dans `CurrencyOption` du admin panel** → operational debt (admin ne peut pas le modifier via UI).
- Test hook `debugResolveMinWithdrawalMajor` duplique la logique privée → drift risk MEDIUM.
- UX `.ceil()` boundary : affichage potentiel +1 unité majeure au pire (cosmétique).
- 3 orphan Firestore composite indexes en prod (`deliveries`, `pharmacy_inventory`, `subscriptions`) absents de `firestore.indexes.json` — décision re-add ou `--force` delete.

### 5. Cleanup admin UI/UX

Identifié pendant la recette V1+V2 (mars 2026), pas adressé. Détail en mémoire `project_admin_cleanup_todo.md`.

---

## ✅ Sprints récemment fermés (avril–mai 2026)

| Date | Sprint | Sujet | Commits |
|---|---|---|---|
| 2026-05-12 | **2A.1 — F-LICENSE security correction** | Correction des 3 findings critiques de la revue architecte sur Sprint 2a : (1) Firestore rules `allow create` denies désormais les 9 champs licence (helper `pharmacyLicenseFieldsAbsentAtCreate`), bouchage de la faille de self-verification client ; (2) gate counterparty appliqué dans `acceptExchangeProposal` (read pré-tx du `fromPharmacyId` + gate) et `acceptMedicineRequestOffer` (read pré-tx du `sellerPharmacyId` + gate) ; (3) rules emulator harness ciblé licence — `@firebase/rules-unit-testing` + `firebase` client SDK installés, `jest.rules.config.cjs` séparé, script `npm run test:rules` via `firebase emulators:exec`, 12 tests verts dont **REQ-2A1-001** (critère non négociable architecte : client create avec `licenseStatus: "verified"` → DENIED). `firebase.json` étendu d'une section `emulators` minimale (port 8080). Option A refactor registration backend-owned déféré comme `TD-LICENSE-REGISTRATION-OWNED`. Orchestrator run `20260512-200553-7f698f` APPROVED iter 1 | `82af5e5` |
| 2026-05-12 | **2a — F-LICENSE backend** | `MasterDataCountry` étendu (+7 champs licence dans shared), nouveau helper `licenseGate.ts` avec evaluator pur testable, 3 nouveaux callables (`submitPharmacyLicense`, `adminVerifyPharmacyLicense`, `backfillLicenseGracePeriod` avec dry-run + idempotence), application du gate aux 5 callables marketplace (createExchangeProposal, acceptExchangeProposal, createMedicineRequest, submitMedicineRequestOffer, acceptMedicineRequestOffer), `createPharmacyUser` initialise `licenseStatus` post-creation (not_required vs pending_verification selon country config), Firestore rules interdisent client write sur 9 champs licence backend-controlled, 19 nouveaux tests gate. Suite backend : 144/144 pass (was 125). UI = Sprint 2b. Orchestrator run `20260512-090822-3bfcff` APPROVED iter 1. **Note rétroactive : architect review a identifié 3 findings sécurité critiques, corrigés dans Sprint 2A.1 ci-dessus avant clôture finale F-LICENSE backend.** | `d685421` |
| 2026-05-12 | **1 — 3.2c-β MSISDN hardening** | `isValidMsisdnForMethod` reject sur `methodCode` manquant (was: graceful pass). `methodCode` inconnu reste graceful avec `logger.warn` structuré pour détection drift ops. Helpers `isValidMsisdnForMethod` + `stripLeadingCountryCode` exportés pour testabilité. 43 nouveaux tests CM/GH positifs + cross-country + wrong-prefix + missing/empty/whitespace methodCode + unknown-methodCode warn. Suite backend : 125/125 pass (was 82). Orchestrator run `20260512-065209-a16494` APPROVED iter 1 | `7c3df07` |
| 2026-05-12 | **0 — Doc Freeze** | Archive 67 docs historiques sous `docs/archive/`, stub `DEVELOPMENT_COMMANDS.md`, création `docs/ACTIVE_DOCS.md`, refonte `docs/README.md`, archive policy dans `CLAUDE.md`. Orchestrator run `20260512-000940-c578fa`, APPROVED iter 1 | `472e178`, `01e6906` |
| 2026-04-22 | **A + B** | Firestore indexes wiring (`firebase.json`) + script audit drift remote vs local + fix schema CLI v14 | `3df4704`, `98a714d` |
| 2026-04-21 | **3.3-β** | Node 20 → 22 (deadline Firebase 2026-04-30 sécurisée 9j en avance) | `73f8456` |
| 2026-04-21 | **3.3-α** | `firebase-functions` 6→7, `firebase-admin` 12→13 | `50acda1` |
| 2026-04-21 | **3.2c-α.1** | `minWithdrawalMinor` zero/invalid semantics backend + 13 tests | `ed04ec1` |
| 2026-04-21 | **3.2c-α** | Widget courier consomme `minWithdrawalMinor` depuis snapshot shared | `f40fa85` |
| 2026-04-21 | **3.2b** | Ghana MSISDN symétrique client↔backend, FR i18n below-min, `decimals` snapshot | `ea61eb0` |
| 2026-04-19 | **Demo polish** | Notifications N1, Paystack Ghana, Money schema V1 (`amountMinor`), Ghana multi-country, Unknown Medicine fix, dashboard responsive | (multiple) |

**Conséquence majeure** : known noise `expireExchangeHolds` (FAILED_PRECONDITION 30 min) **fully closed**. Audit remote drift en prod = **0** (42 local exports = 42 remote, tous nodejs22).

Pour le détail de Bloc 1 (Inventory Visibility), Bloc 2 Phase 1 (Medicine Requests purchase-only), Admin V1+V2A→V2C (mars 2026) → voir [CLAUDE-ARCHIVE.md](CLAUDE-ARCHIVE.md).

---

## 📋 Backlog vivant

### 🆕 Features produit (priorité à clarifier avec le user)

| ID | Feature | Description | État |
|---|---|---|---|
| **F-LICENSE (2a backend)** | License pharmacie — fondation backend | Master data fields, helpers, callables submit/verify/backfill, gate marketplace, Firestore rules, tests Jest. Split du Sprint 2 monolithique (architect decision 2026-05-12, voir [docs/orchestrator_sprints/SPRINT_2_SCOPING_PROPOSAL.md](docs/orchestrator_sprints/SPRINT_2_SCOPING_PROPOSAL.md)). | ✅ Livré + corrigé via 2A.1 |
| **F-LICENSE (2A.1 security correction)** | Findings architecte fermés | rules deny on create + counterparty gate + rules emulator harness 12/12 verts | ✅ Livré |
| **F-LICENSE (2b UI)** | License pharmacie — UI admin + mobile | Admin panel country config + license review, pharmacy registration field conditionnel, profile license status & correction flow, widget tests. | Débloqué après clôture 2A.1 |
| **TD-LICENSE-REGISTRATION-OWNED** | Refactor : inscription pharmacy backend-owned | Migrer `UnifiedAuthService.signUp` Flutter → callable backend qui owne la création `pharmacies/{uid}` et l'init licence. Sprint 2A.1 a verrouillé la faille de l'inscription via rules deny-on-create (Option B transitionnelle) ; ce refactor est l'Option A pérenne. **À planifier idéalement avant ou pendant Sprint 3 Trial** pour aligner le trial gate sur un write path canonique. | À planifier |
| **F-BLOC2-P2** | Medicine Requests — exchange mode | Lever le blocage purchase-only dans `createMedicineRequest` + `submitMedicineRequestOffer`. Permettre offre = `purchase` **OU** `exchange` (proposition d'échange avec médicament de la pharmacie offrante). Bridge vers `exchange_proposals` canonique. | À spécifier |

### 🛠️ Sprint planifié

| ID | Sujet | État |
|---|---|---|
| **3.2c-β** | MSISDN hardening (gated par audit `methodCode` actif, prompt finalisé avec ajouts A+B+C) | Prêt à exécuter |

### 🧹 Tech debt

| ID | Sujet | Sévérité | Effort |
|---|---|---|---|
| **TD-IDX-ORPHANS** | 3 orphan Firestore indexes (`deliveries`, `pharmacy_inventory`, `subscriptions`) — décider re-add source ou `--force` delete | Low | ~1h |
| **TD-ADMIN-MIN** | `CurrencyOption` admin panel n'expose pas `minWithdrawalMinor` | Medium | ~2h |
| **TD-DRIFT-HOOK** | `debugResolveMinWithdrawalMajor` duplique la logique privée du widget — drift risk | Medium | ~1h |
| **TD-CEIL-UX** | Polish `.ceil()` boundary affichage min withdrawal | Low | ~30min |
| **TD-FCM** | FCM push (N2) — backend trigger à ajouter (activation client plus tard) | Low | ~2h |
| **TD-ADR001-P1B** | Migration `wallets`/`ledger`/`exchanges` vers `amountMinor` canonique + retrait adapter legacy | Medium | sprint dédié |
| **TD-BALANCE-CHECK** | Vérifier balance (`totalPrice + courierFee/2`) avant création proposal | Low | ~2h |
| **TD-ADMIN-UI** | Cleanup UI/UX admin panel identifié pendant recette V1+V2 | Low | sprint dédié |
| **TD-DEAD-COMMENT** | Commentaire mort `// export { cleanupTestUser } from "./cleanup.js"` dans [functions/src/index.ts:17](functions/src/index.ts#L17) | Trivial | inclus dans ce cleanup |
| **TD-MSISDN-AUDIT** | **Pre-deploy audit (Sprint 1 follow-up)** — avant push prod de `createWithdrawalRequest`, vérifier que tous les `system_config/main.mobileMoneyProviders.*` avec `enabled=true ET supportsPayouts=true` ont `methodCode` non-vide. Sans cet audit, le strictness 3.2c-β peut bloquer des retraits pour providers historiquement mal configurés. Audit read-only via Firestore console ou script script (commit `7c3df07`). | **BLOQUANT pour deploy** | ~30min |

### ❓ Décisions produit en attente

- **Trial subscription** : reconstruction des functions absentes (`createTrialSubscription` etc.) ou approche différente ?
- **`devSubscription` / `cleanupTestUser`** : utilité réelle ou suppression définitive du code local ? (Audit 2026-04-22 prouve 0 drift remote, donc pas d'urgence opérationnelle.)
- **`testpharmacy*` / comptes test** : politique de gestion des données de test en prod.

### 📅 Échéances externes

- **Firebase Node 20 décommissioning** : 2026-10-30. Déjà sécurisé via Node 22 (sprint 3.3-β).
- Pas d'autre deadline externe identifiée.

---

## 🎯 Objectif global du produit

PharmApp est une **plateforme SaaS d'échange de médicaments entre pharmacies** sur le marché africain, avec :
- Abonnement mensuel pharmacie (XAF 6 000 - 30 000 / KES / NGN / GHS selon pays)
- Wallet interne pour payer/recevoir des médicaments et frais de course
- Course livraison via courier indépendant (50/50 split entre 2 pharmacies)
- Mobile money topup (MTN MoMo, Orange Money, Paystack Ghana)
- Admin country-scoped (un admin par pays + super_admin global)

**Pays actifs / en préparation** : Cameroun (XAF, ville-scopé), Ghana (GHS, Paystack), Kenya / Nigeria / autres = framework prêt (multi-currency, multi-country) mais activation par flag.

---

## 🛠️ Dev commands

### Build / run

```bash
# Frontend (master app)
cd pharmapp_unified && flutter run -d chrome --web-port=8086
cd admin_panel && flutter run -d chrome --web-port=8087

# Backend functions
cd functions && npm run build      # tsc clean
cd functions && npm test           # 82+ tests
cd functions && npm run serve      # emulator
```

### Deploy

```bash
firebase deploy --only firestore:indexes      # indexes
firebase deploy --only firestore:rules        # rules
firebase deploy --only functions              # all functions
firebase deploy --only functions:NAME         # one function
```

### Audit drift remote vs local

```bash
node functions/scripts/audit-remote-drift.mjs --project mediexchange
```

Read-only. Rapporte `remote_only` / `local_only` / `intersection`. Au 2026-04-22 : 0 drift.

---

## 🧪 Testing phase — règle de sécurité

**API keys réelles = TEMPORAIRES, JAMAIS committées.**

1. Récupérer clés : `firebase apps:sdkconfig web --project=mediexchange`
2. Remplacer placeholders dans `pharmapp_unified/lib/firebase_options.dart` (lignes des `defaultValue`)
3. Tester
4. **AVANT TOUT COMMIT** : restaurer les placeholders (`'AIzaSyC-PLACEHOLDER-...'`)

Validation pré-commit : git hook `.husky/pre-commit` scanne les patterns sensibles.

---

## 📁 Architecture Firebase

**Firestore collections clés** :
- `pharmacies/{uid}` — profil pharmacy (countryCode, cityCode, subscriptionStatus, licenseNumber)
- `couriers/{uid}` — profil courier
- `wallets/{uid}` — `{available, held, currency, updatedAt}`
- `ledger/{id}` — transactions (audit trail)
- `exchanges/{id}` — état exchange legacy (`hold_active`/`completed`/`canceled`)
- `exchange_proposals/{id}` — proposals canoniques (avec snapshot inventaire)
- `deliveries/{id}` — courses livraison
- `medicine_requests/{id}` — requests purchase-only (Bloc 2 phase 1)
- `medicine_request_offers/{id}` — offres sur requests
- `notifications/{uid}/inbox/{id}` — inbox notifications N1
- `pharmacy_inventory/{id}` — inventaire pharmacy (toggle public/private)
- `system_config/main` — currencies, countries, cities, plans (source de vérité master data)
- `payments/{id}`, `webhook_logs/{id}` (TTL 30j), `idempotency/{id}` (TTL)

**Workflows clés** :
- **Top-up** : `topupIntent` ou `paystackTopupIntent` → webhook idempotent → crédite wallet
- **Exchange (canonical)** : `createExchangeProposal` → `acceptExchangeProposal` (hold 50/50 courier fee) → courier livre → `completeExchangeDelivery` (capture, ledger, notifications)
- **Withdrawal** : `createWithdrawalRequest` (valide MSISDN + min minor) → admin/sandbox advance → ledger debit

---

## 📚 Mémoires actives

Voir l'index `C:\Users\aebon\.claude\projects\c--Users-aebon-projects-pharmapp-mobile\memory\MEMORY.md`.

**Mémoires projet à jour** :
- `project_admin_lot1_status.md` — Contrat V1 + V2 (A→D) complétés
- `project_admin_cleanup_todo.md` — Cleanup UI/UX admin identifié
- `project_withdrawal_min_thread_closed.md` — Thread `minWithdrawalMinor` fermé
- `project_functions_remote_drift_backlog.md` — Thread remote drift fermé, 1 résiduel mineur (orphan indexes)
- `project_roadmap_2026-05.md` — Roadmap 6 sprints (Doc Freeze → MSISDN → F-LICENSE → Trial → F-BLOC2-P2 → Clôture) + 5 décisions produit verrouillées

---

## 🗂️ Archive policy

Le répertoire **[`docs/archive/`](docs/archive/)** contient toute la documentation historique du projet (sessions briefings, anciens reports, drafts CLAUDE, analyses pre-unified-app, setup docs périmés qui pointaient vers les anciens dossiers `pharmacy_app/` et `courier_app/` supprimés). **Ces documents ne sont PAS source de vérité pour les pratiques ou décisions courantes**. Ils sont préservés pour traçabilité git et investigation historique uniquement.

Les documents opérationnels actifs sont listés dans **[`docs/ACTIVE_DOCS.md`](docs/ACTIVE_DOCS.md)**. Si un document n'est pas dans cet index ou dans ce `CLAUDE.md`, considérer qu'il est archivé.

L'archive contient également **[`CLAUDE-ARCHIVE.md`](CLAUDE-ARCHIVE.md)** (à la racine) — snapshot intégral du `CLAUDE.md` pré-cleanup avec disclaimer en tête listant les affirmations devenues factuellement obsolètes (références à `pharmacy_app/courier_app`, statut Bloc 2, etc.).
