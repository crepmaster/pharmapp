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

### 1. Medicine Requests : exchange mode livré Sprint 4 (2026-05-14)

✅ **F-BLOC2-P2 livré Sprint 4** (orchestrator run `20260513-235401-167aae`).

Les flags `Only 'purchase' mode is supported` ont été remplacés par
`assertCanonicalMode` strict (`purchase | exchange`, pas de `either`). Une
pharmacie peut désormais créer une `medicine_requests` en mode `exchange`,
recevoir des offres d'échange (barter, pas de soulte), et les accepter via
un picker d'inventaire qui choisit l'item exact à donner en retour. Voir
[docs/f-bloc2-p2-medicine_requests_exchange.md](docs/f-bloc2-p2-medicine_requests_exchange.md)
pour le contrat complet.

### 2. License pharmacie : backend enforced (Sprint 2a + 2A.1 + 2A.2), UI non livrée

**Ce qui est livré côté backend** :
- `MasterDataCountry` étendu avec 7 champs licence (`licenseRequired`, `licenseLabel`, `licenseHelpText`, `licenseVerificationRequired`, `licenseFormatRegex`, `licenseDocumentRequired`, `licenseGracePeriodDays`) côté shared.
- 3 callables backend : `submitPharmacyLicense` (owner), `adminVerifyPharmacyLicense` (admin country-scoped), `backfillLicenseGracePeriod` (admin, dry-run + idempotent).
- Helper `licenseGate.ts` avec evaluator pur testable + `assertLicenseAllowsMarketplace(db, uid)`, appliqué aux 5 callables marketplace (caller ET counterparty post-2A.1).
- Firestore rules `allow create` ET `allow update` interdisent client write sur les 9 champs licence backend-controlled (`PROTECTED_LICENSE_FIELDS` exporté depuis `licenseGate.ts` comme single source of truth, miroir des rules).
- Rules emulator harness via `@firebase/rules-unit-testing` + script `npm run test:rules` : 22 tests verts (9 create deny + 9 update deny + REQ-2A1-001 explicite + allow-without-licence + allow-non-licence-update + admin SDK bypass).
- Tests callable-level : 12 tests sur la matrice counterparty (verified / rejected / expired / correction_needed / pending / grace active / grace expired / no status / non-mandatory country / pharmacy doc missing).

**Ce qui n'est PAS livré** :
- **UI admin livré (Sprint 2B.1, 2026-05-13)** : `countries_tab.dart` ouvre un dialog `LicenseConfigDialog` qui édite les 7 champs licence et passe par le nouveau callable `setCountryLicenseConfig` (RBAC super_admin OR admin `manage_pharmacies` + `countryScopes`, dotted-path merge sur `countries.{code}.{field}` pour ne pas écraser le reste). Nouveau `pharmacy_license_review_screen.dart` liste les pharmacies `pending_verification` / `correction_needed` filtrées par scope et câble verify / reject / correction_needed sur `adminVerifyPharmacyLicense`. Bouton "License Reviews" ajouté dans `pharmacy_management_screen.dart`.
- **UI mobile pharmacy livré (Sprint 2B.2a, 2026-05-13)** : registration UI conditionnelle sur `MasterDataCountry.licenseRequired` + handler `LICENSE_REQUIRED` (re-prompt licence, snapshot stale OK) ; `PharmacyLicenseStatusSection` (badge 7 statuts + fallback "Pending" unknown) ; `LicenseCorrectionDialog` (correction routée via `submitPharmacyLicense` Sprint 2a).
- **Marketplace listing livré (Sprint 2B.2b, 2026-05-13)** : nouveau callable `getMarketplacePharmacies` consumes `evaluateLicenseGate` Sprint 2A.3 ; firestore.rules durcies (`allow list: if false` sur `/pharmacies`, `allow get: if isAuthenticated()` préservé pour les 5 consumers en lookup) ; `inventory_service.getAvailableMedicines` migré via seam testable ; 18 tests Jest + 5 rules emulator + 4 tests Dart seam. **F-LICENSE end-to-end CLOS** côté backend, admin, pharmacy UX, marketplace.
- **Registration canonical path** : ✅ **livré en Sprint 2A.3** (callable `createPharmacyRegistration` + Flutter `UnifiedAuthService.signUp` migré pour `UserType.pharmacy`). Le `LICENSE_REQUIRED` signal du backend (`failed-precondition` + `details.code='LICENSE_REQUIRED'`) propage intact côté Flutter via `rethrow` de la `FirebaseFunctionsException` — Sprint 2B UI peut s'abonner sur ce contrat pour re-prompt licence. Courier/admin restent sur l'ancien flow client-write (out of scope par décision architecte 2026-05-13 ; refactor multi-rôles sera un sprint dédié si besoin régulatoire).
- **Marketplace visibility côté reads (Sprint 2B)** : les pharmacies non-verified post-grâce restent lisibles individuellement (rule `allow read: if isAuthenticated()`). Le filtre marketplace listing est dans le scope 2B.

**Conséquence opérationnelle (post-Sprint-2A.3)** : sur un pays mandatory (ex. Ghana avec `licenseRequired=true`), une pharmacie qui s'inscrit via l'app Flutter passe par le callable backend `createPharmacyRegistration` ; le serveur lit `system_config/main.countries.{code}.licenseRequired` au moment du create et refuse l'inscription avec `failed-precondition` + `details.code='LICENSE_REQUIRED'` si aucune licence n'est fournie (la `FirebaseFunctionsException` propage intact côté Flutter via `rethrow`, sans re-wrap, pour que Sprint 2B UI puisse re-prompt licence immédiatement). Si une licence est fournie, la pharmacie atterrit avec `licenseStatus='pending_verification'` et un admin doit appeler `adminVerifyPharmacyLicense` pour la passer `verified`. Le gate marketplace reste fail-closed jusque-là. **Pas d'UI consommatrice du contrat `LICENSE_REQUIRED` tant que Sprint 2B n'est pas livré** — l'enforcement backend existe en prod mais l'expérience inscription Ghana n'est pas encore montée bout-en-bout côté humain.

### 3. Trial subscription — livré Sprint 3 (2026-05-14)

✅ **Trial subscription backend-owned aligné avec license verification, livré Sprint 3 (2026-05-14, orchestrator run `20260513-214326-e4322f`).**

- Helper transactionnel idempotent `startTrialForPharmacy` ([functions/src/lib/startTrialForPharmacy.ts](functions/src/lib/startTrialForPharmacy.ts)). Décision via `shouldStartTrial({subscriptionStatus, subscriptionStartDate})` : statut `trial`/`active` → no-op `already_active` ; **`subscriptionStartDate` non-null → no-op `trial_already_consumed`** (invariant architect-locked 2026-05-14 : ONE trial per pharmacy, ever — un trial expiré ne peut pas être redémarré).
- `createPharmacyRegistration` (Sprint 2A.3) initialise les flat fields conditionnellement : pays non mandatory → `subscriptionStatus='trial'` actif 30j ; pays mandatory + licence fournie → `subscriptionStatus='trial_pending_license'` (pas de consommation tant que admin n'a pas verify).
- `adminVerifyPharmacyLicense` appelle `startTrialForPharmacy` à `action='verify'`, idempotent (double verify ne re-démarre pas + ne rallonge pas ; expired ne ré-octroie pas).
- **Retrait complet** du `SubscriptionCreationService.createTrialSubscription` côté client : bloc supprimé de `_handleRegistration` pour tous user types. Le service écrivait dans `subscriptions/{id}` rule-locked backend-only — silencieusement cassé. Le test seam `createTrialSubscriptionOverride` + typedef `CreateTrialSubscription` + import `subscription_creation_service.dart` + constante `_countryCurrencyMap` retirés (plus aucun consumer). Courier/admin : aucun appel trial côté client (il n'y en avait jamais eu de légitime).
- Rules : `'trial_pending_license'` ne matche PAS `hasActiveSubscription()` → marketplace gated. Tests emulator REQ-3-001..003 prouvent.

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
| 2026-05-14 | **5 — E2E Closure (CONDITIONAL PASS)** | Sprint de preuve (pas une feature). 4 livrables : (1) **Truth cleanup** — `docs/testing/NEXT_SESSION_EXCHANGE_TESTING.md` stubbé avec banner Sprint 5 (décrivait encore `createExchangeHold`/`exchangeCapture` comme actifs alors qu'ils sont dead-code). (2) **Plan recette E2E** ([docs/release/SPRINT_5_E2E_CLOSURE_PLAN.md](docs/release/SPRINT_5_E2E_CLOSURE_PLAN.md)) — 8 scénarios obligatoires avec nommage explicite du flow ciblé à chaque test (flow A `createExchangeProposal` vs flow B `medicine_request` purchase/exchange — pas de mélange, lock #3). Couvre license Ghana mandatory (1+2+3), trial gating, marketplace city-scoped, medicine request purchase (4) + exchange Sprint 4 (5, avec preuve runtime lock #5 = 1 inv hold à l'accept), parity matrix cross-mode (6), non-verified blocked sur 5 callables (7), withdrawal happy path + MSISDN validation (8). Critères PASS/CONDITIONAL PASS/BLOCKED documentés. (3) **Script audit Ghana** ([functions/scripts/auditGhanaLicenseReadiness.mjs](functions/scripts/auditGhanaLicenseReadiness.mjs)) — read-only par construction (jamais `set/update/delete`), exige `--project=<id>` explicite (exit 2 sinon), supporte `--out=<csv>`, catégorise pharmacies par `licenseStatus` en 10 buckets (verified_allow, grace_active_allow, missing_status, pending_deny, rejected_deny, correction_needed_deny, expired_deny, grace_expired_deny, not_required_misconfig_deny, unknown_status_deny), redacte `licenseRejectionReason` à 32 chars par défaut, exclut PII (email/phone/licenseNumber) du CSV, émet `AUDIT_SUMMARY_JSON {…}` machine-parsable en dernière ligne. Testé `--help` + `exit 2` sur missing project. (4) **Runbook monitoring 7j** ([docs/release/SPRINT_5_MONITORING_7D.md](docs/release/SPRINT_5_MONITORING_7D.md)) — 7 checks Cloud Logging + Firestore (license gate fail-closed, lock #5 invariant 1 inv hold, courier fee resolved correctly, delivery completion failures, function drift, Ghana admin follow-up, wallet held/deducted divergence), cadence J+0/1/3/7, seuils P0..P3, owner default à définir. Pas de deploy auto (lock #5). **Verdict : CONDITIONAL PASS** — la recette staging n'a pas été exécutée (pas d'environnement staging confirmé au moment du sprint). Le sprint livre tous les artefacts mais le deploy prod reste gated par l'exécution ultérieure de la checklist 8 scénarios. Pré-lock contrat Sprint 5 respecté en intégralité (6 décisions architecte). | (pending commit) |
| 2026-05-14 | **4 — F-BLOC2-P2 Medicine Requests Exchange Mode** | 9 décisions architecte verrouillées pré-run-start. Nouveau helper canonique `functions/src/lib/exchangePipeline.ts` (purs + transactionnel `reserveExchangeInventory`) consommé par `createExchangeProposal` ET le nouveau bridge `acceptExchangeRequestOfferIntoCanonicalProposal` — pas de duplication inline, même contrat `exchange_proposals` consommé par `acceptExchangeProposal` / `cancelExchangeProposal` / `completeExchangeDelivery`. `createMedicineRequest` accepte désormais `requestMode` strict purchase-or-exchange (retrait du flag MVP). `submitMedicineRequestOffer` enforce `offerType === request.requestMode` (lock #2), exige un sous-objet `exchangeItem` (`medicineId`, `medicineName`, `dosage`, `form`, `quantity`, `expiryDate?`, `lotNumber?`) sur les offres exchange, gate license sur seller ET requester (lock #8). `acceptMedicineRequestOffer` route sur `offer.offerType` : purchase inchangé, exchange exige `exchangeInventoryItemId` (item owned par requester, match medicine/dosage/form/qty/expiry), réserve UNIQUEMENT cet item (`availableQuantity -= q`, `reservedQuantity += q`) — l'item seller racine reste vérifié à l'accept et décrémenté à `completeExchangeDelivery` (lock #5 prouvé : 1 inventory update, 0 wallet write, 0 seller inv write au happy path). Frontend Flutter : retrait de `RequestMode.either` du model, classe `ExchangeItem`, enum `OfferType`, service `submitPurchaseOffer` / `submitExchangeOffer` / `acceptOffer(exchangeInventoryItemId?)`, UI `_showCreateRequestDialog` avec toggle Purchase/Exchange, `_MakeOfferDialog` branche sur `request.requestMode` (prix vs `exchangeItem`), nouveau `_InventoryPickerDialog` au accept exchange qui filtre l'inventaire requester par medicineId + dosage + form + quantity disponible. Aucun changement `firestore.rules` (medicine_requests + medicine_request_offers déjà backend-only). Backend : 338/338 Jest (was 251, +87) — 53 tests pipeline (dont 8 `resolveCourierFee` + matrice helper) + 14 callable-level + 17 bridge intégration (happy + 4 courier-fee + 12 négatives) + 3 tests directs `createExchangeProposal` exchange branch. **Round-2 architecte (3 findings clos post-livraison)** : (1) HIGH — `createExchangeProposal` désormais routé via `reserveExchangeInventory` (medicineId match strict + snapshot canonique) au lieu de la réservation inline ; (2) MEDIUM — bridge medicine_request exchange lit `system_config/main` dans la transaction et résout `courierFee` via le nouveau helper partagé `resolveCourierFee` (mirror de la formule `acceptExchangeProposal`) — fini le `courierFee=0` hard-codé qui violait le lock #6 ; (3) LOW — `acceptExchangeProposal` lui aussi refactor pour consommer `resolveCourierFee`, dédup complet. flutter analyze : 0 nouvelle erreur Sprint 4. Orchestrator run `20260513-235401-167aae` | (pending commit) |
| 2026-05-14 | **3 — Trial Subscription aligned with license verification** | Décision architecte verrouillée 2026-05-13 avant run-start : trial 100% backend-owned, **retrait complet** du `SubscriptionCreationService.createTrialSubscription` côté client (tous user types — pharmacie passe par backend, courier/admin n'avaient jamais de trial légitime). Nouveau helper transactionnel idempotent `startTrialForPharmacy` ([functions/src/lib/startTrialForPharmacy.ts](functions/src/lib/startTrialForPharmacy.ts)) + 18 tests Jest. **Invariant architect HIGH 2026-05-14** : `shouldStartTrial({subscriptionStatus, subscriptionStartDate})` regarde aussi la présence de `subscriptionStartDate` comme trace positive d'un trial passé → no-op `'trial_already_consumed'` empêche qu'un statut `expired`/`cancelled` puisse réclamer une 2e fenêtre. Retour discriminé `'started'`/`'already_active'`/`'trial_already_consumed'`/`'pharmacy_not_found'`. `createPharmacyRegistration` (Sprint 2A.3) initialise désormais les flat fields trial conditionnellement : pays non mandatory → `subscriptionStatus='trial'` + `hasActiveSubscription=true` + dates `now → now+30j` ; pays mandatory + licence fournie → `subscriptionStatus='trial_pending_license'` + `hasActiveSubscription=false` + pas de dates. `adminVerifyPharmacyLicense` (Sprint 2a) appelle `startTrialForPharmacy` uniquement sur `action='verify'`, dans un try/catch qui swallow les erreurs trial pour ne JAMAIS annuler la verify licence (5 tests wire-up). Rules emulator : 3 nouveaux tests `REQ-3-001/002/003`. Client Flutter : bloc trial retiré complètement de `_handleRegistration` ; typedef `CreateTrialSubscription`, champ widget `createTrialSubscriptionOverride`, import `subscription_creation_service.dart`, constante `_countryCurrencyMap`, binding `userCredential` tous retirés (plus aucun consumer). Test seam Sprint 2B.2a `_noopTrial` + 4 lignes `createTrialSubscriptionOverride: _noopTrial` retirées du fichier de test (7/7 widget tests Sprint 2B.2a passent toujours). UI `subscription_screen.dart` : nouveau banner `trial_pending_license` lu depuis flat fields `pharmacies/{uid}.subscriptionStatus`. Backend total : **251/251 Jest** (was 226, +25), rules 34/34 (was 31, +3). Orchestrator run `20260513-214326-e4322f` APPROVED iter 2 ; architect human review identified HIGH (idempotence par trace) + MEDIUM (condition inversée) closés via commit follow-up. | (pending commit) |
| 2026-05-13 | **2B.2b — F-LICENSE Marketplace Enforcement (end-to-end clos)** | Décision architecte verrouillée = CALLABLE (vs FLAG). Nouveau callable `getMarketplacePharmacies` (region europe-west1, auth required, input `{countryCode, cityCode?}`, charge `system_config/main.countries[code]` puis évalue `evaluateLicenseGate` Sprint 2A.3 sur chaque pharmacie, retourne uniquement celles `allow: true`, fail-closed sur pays inconnu / system_config absent avec `logger.warn` structuré). Helper pur `projectListingSafe` qui strippe les 9 champs licence + ne surface que `{uid, pharmacyName, address, countryCode, cityCode?, city?, phoneNumber?, locationData?}`. 18 tests Jest (matrice 7 architecte-locked + listing-safe output guard + auth + validator + edge cases). Firestore rules durcies : `match /pharmacies/{userId}` split `allow read` → `allow get: if isAuthenticated()` + `allow list: if false` (admin SDK bypass conservé, lookups par UID préservés). 5 nouveaux rules emulator tests `REQ-2B2B-001..005` (client list denied, client where-query denied, client get by UID allowed, unauth list denied, admin SDK list allowed). Audit Flutter listing vs lookup : sur les 6 consumers listés, **un seul** (`inventory_service.getAvailableMedicines`) faisait du marketplace listing — les 5 autres sont des lookups par UID (preserve `allow get`). Migration : `InventoryService` expose `fetchMarketplacePharmacyIds` (test seam `@visibleForTesting`) qui appelle le callable, `getAvailableMedicines` route via ce seam au lieu des 2 `.where(cityCode|city, ...).get()` directs. 4 tests Dart sur le seam (forwarding params + null city + empty list + reversible swap) + audit manifest inline. Backend : 222/222 Jest (was 204, +18), rules 27/27 (was 22, +5). Orchestrator run `20260513-205611-69104d` | (pending commit) |
| 2026-05-13 | **2B.2a — F-LICENSE Pharmacy UX** | Registration UI conditionnelle sur `MasterDataCountry.licenseRequired` + handler `LICENSE_REQUIRED` (contrat Sprint 2A.3.1) qui re-prompt licence sans réinitialiser le formulaire. Profile : nouveau widget `PharmacyLicenseStatusSection` (badge sur 7 statuts + fallback "Pending" pour unknown avec log warning) + bouton "Correct license" pour `rejected` / `correction_needed`. Nouveau `LicenseCorrectionDialog` qui collecte licenseNumber + URL document optionnelle + expiry yyyy-MM-dd optionnelle, route via `submitPharmacyLicense` callable (Sprint 2a, inchangé). 3 test seams sur le screen registration (`masterDataOverride`, `signUpOverride`, `createTrialSubscriptionOverride` — ce dernier **retiré ensuite en Sprint 3** quand le bloc trial client-side a été supprimé) + 1 sur `ProfileScreen` (`submitLicenseCorrectionOverride`) pour widget tests sans Firebase. mocktail ajouté en dev-dep `pharmapp_unified`. 21 widget tests verts (7 registration + 14 profile/correction). **Aucun marketplace**, **aucun backend**, **aucun admin_panel** touché (out of scope 2B.2b). Orchestrator run `20260513-200915-499497` | (pending commit) |
| 2026-05-13 | **2B.1 — F-LICENSE Admin License Operations** | Split 2B → 2B.1 + 2B.2 acté par l'architecte pour éviter une revue mixée (admin / registration / marketplace). 2B.1 livre la console admin : nouveau callable `setCountryLicenseConfig` (RBAC `super_admin` OR `admin` avec `permissions.manage_pharmacies` + `countryScopes`, dotted-path merge `countries.${code}.${field}` qui ne touche pas les autres champs country, validation `licenseFormatRegex` compilable + `licenseGracePeriodDays ∈ [1, 365]`, +16 tests Jest). Admin panel : `countries_tab.dart` ouvre un `LicenseConfigDialog` extrait dans `screens/system_config/license_config_dialog.dart` (testable via callback `LicenseConfigSubmit`, Save désactivé tant que regex/grace invalides) ; nouveau `pharmacy_license_review_screen.dart` (StreamBuilder filtre `licenseStatus ∈ {pending_verification, correction_needed}` + `countryCode ∈ countryScopes`, 3 actions verify/reject/correction_needed sur `adminVerifyPharmacyLicense` Sprint 2a, reason mandatory pour reject/correction). Abstraction `LicenseReviewDataSource` injectable pour tests. Lien "License Reviews" dans `pharmacy_management_screen.dart`. mocktail ajouté en dev-dep ; 11 widget tests verts (4 dialog + 7 review). Backend : 204/204 Jest (was 188), 22/22 rules. Aucun changement `pharmapp_unified/`, `shared/`, marketplace, registration, profile mobile (out of scope 2B.2). Orchestrator run `20260513-163310-d506b0` | (pending commit) |
| 2026-05-12 | **2A.3 — F-LICENSE registration backend-owned** | 4 lots fermés : (A) `evaluateLicenseGate` fail-closed sur countryCode absent / pays inconnu / system_config absent, signature changée de `(pharmacy, country)` à `(pharmacy, resolution)` + tests étendus ; (B) `acceptCallables-license-gate.test.ts` renommé en `licenseGate-async-matrix.test.ts` (naming honnête : teste le helper), nouveau `acceptCallables-input-validation.test.ts` avec 4 tests callable-level réels (firebase-functions-test wrap) prouvant fail-closed sur `fromPharmacyId` / `sellerPharmacyId` manquant ; (C) nouveau `protectedLicenseFields-drift-guard.test.ts` qui lit `firestore.rules` et asserte présence des 9 champs `PROTECTED_LICENSE_FIELDS` ; (D) nouveau callable `createPharmacyRegistration` (onCall, region europe-west1) qui crée Auth + `users/{uid}` + `pharmacies/{uid}` + `wallets/{uid}` atomiquement avec license init SERVER-SIDE depuis `system_config/main.countries` + anti-orphan, et migration `UnifiedAuthService.signUp` Flutter pour `UserType.pharmacy` qui appelle ce callable puis `signInWithEmailAndPassword` (courier/admin inchangés). `shared/pubspec.yaml` ajoute `cloud_functions: ^5.1.3`. Suite backend : 188/188 pass (was 156 → +32 dont 13 createPharmacyRegistration + 12 drift guard + 4 callable-validation + 3 fail-closed gate). Test:rules : 22/22. shared dart analyze : 0 nouvelle warning. Orchestrator run `20260512-224720-6c0a2a` APPROVED iter 1 | `cb20892` |
| 2026-05-12 | **2A.2 — F-LICENSE architect follow-up** | 6 findings post-2A.1 fermés : (#4) fail-closed counterparty sur ID manquant + 12 nouveaux tests callable-level matrice counterparty ; (#3) `PROTECTED_LICENSE_FIELDS` exporté de `licenseGate.ts` comme single source of truth, `firestore-rules.test.ts` paramétrisé via `test.each` → 22 tests (9 deny create + 9 deny update + 4 variantes) couvrant les 9 champs licence ; (#2) CLAUDE.md section "ce qui n'est PAS livré" §2 réécrite pour refléter backend enforced + UI 2B + registration 2A.3 ; (#1+#5) contrat 2B mis à jour : préambule "présuppose 2A.3 fermé", section "registration write path canonique", nouveau Lot 5 marketplace visibility ; (#6) `ACTIVE_DOCS.md` structuré meta/closed/à-venir, CLAUDE.md dev commands ajoute `npm run test:rules`. Suite backend : 156/156 pass (was 144). Test:rules : 22/22 pass (was 12). Orchestrator run `20260512-221309-3e615c` APPROVED iter 1 | `9da95da` |
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
| **TD-LICENSE-REGISTRATION-OWNED (Sprint 2A.3)** | Refactor : inscription pharmacy backend-owned | Migrer `UnifiedAuthService.signUp` Flutter → callable backend `createPharmacyRegistration` qui owne la création `pharmacies/{uid}` et l'init licence en lisant `system_config/main.countries.{code}.licenseRequired` côté serveur au moment du create. C'est l'Option A / alpha verrouillée avant 2B pour éviter qu'un snapshot client stale décide l'enforcement licence. | ✅ Livré (cb20892 + 2A.3.1) |
| **F-LICENSE (2B.1) Admin License Operations** | Super admin configure `licenseRequired` par pays + admin review/verify/reject licences pharmacie | Nouveau callable `setCountryLicenseConfig` (RBAC + dotted-path merge + regex/grace validation, 16 tests Jest) ; admin `countries_tab.dart` + `LicenseConfigDialog` extrait pour testabilité ; nouveau `pharmacy_license_review_screen.dart` (filtre scope + verify/reject/correction_needed) ; lien dans `pharmacy_management_screen.dart` ; 22 widget+unit tests (mocktail, dont follow-up architecte sur clobber `upsertCountry` + scope filter) | ✅ Livré (Sprint 2B.1 + corrections, 2026-05-13) |
| **F-LICENSE (2B.2a) Pharmacy UX** | Registration UI conditionnel + LICENSE_REQUIRED handler + profile license status + correction flow | UI mobile inscription mandatory re-prompt `LICENSE_REQUIRED` (contrat 2A.3.1) ; `PharmacyLicenseStatusSection` (badge 7 statuts + fallback unknown) + `LicenseCorrectionDialog` (validation + dialog backend error) routés via `submitPharmacyLicense` (Sprint 2a) ; 4 test seams (`masterDataOverride`, `signUpOverride`, `createTrialSubscriptionOverride` **retiré ensuite en Sprint 3**, `submitLicenseCorrectionOverride`) ; 21 widget tests verts | ✅ Livré (Sprint 2B.2a, 2026-05-13) |
| **F-LICENSE (2B.2b) Marketplace Enforcement** | Listing pharmacies backend-owned + migration 6 consumers Flutter + durcissement `firestore.rules` | Décision CALLABLE retenue (explorer 2B.2b). Nouveau callable `getMarketplacePharmacies` (gate sur 7 statuts, listing-safe output, fail-closed unknown country) + 18 tests Jest. `firestore.rules` split `allow get` (lookup UID, profile/correction préservés) vs `allow list: if false` + 5 tests emulator REQ-2B2B-001..005. Audit Flutter : seul `inventory_service.getAvailableMedicines` faisait du listing (migré via seam `fetchMarketplacePharmacyIds`) ; les 5 autres consumers sont des lookups par UID, inchangés. 4 tests Dart sur le seam. | ✅ Livré (Sprint 2B.2b, 2026-05-13). **F-LICENSE end-to-end CLOS.** |
| **F-BLOC2-P2** | Medicine Requests — exchange mode | Lever le blocage purchase-only dans `createMedicineRequest` + `submitMedicineRequestOffer`. Permettre offre purchase OU exchange (proposition d'échange avec médicament de la pharmacie offrante). Bridge vers `exchange_proposals` canonique. Helper `exchangePipeline.ts` partagé entre `createExchangeProposal` et le nouveau `acceptExchangeRequestOfferIntoCanonicalProposal`. License gate symétrique (lock #8). Hold strict 1 côté (lock #5). | ✅ Livré (Sprint 4, 2026-05-14) |

### 🛠️ Sprint planifié

| ID | Sujet | État |
|---|---|---|
| **2A.3** | TD-LICENSE-REGISTRATION-OWNED — inscription pharmacie backend-owned, Option A / alpha | ✅ Livré (cb20892) + correction 2A.3.1 (audit script + Flutter test + LICENSE_REQUIRED signal preservation) |
| **2B.1** | F-LICENSE Admin License Operations (countries_tab license config + pharmacy_license_review + setCountryLicenseConfig callable) | **Prochain sprint** |
| **2B.2** | F-LICENSE Pharmacy UX + Marketplace Enforcement (registration UI + profile + correction + getMarketplacePharmacies + 6 consumer migrations) | Bloqué jusqu'à clôture 2B.1 |
| **3** | Trial subscription aligné licence | ✅ Livré (2026-05-14) |
| **4** | F-BLOC2-P2 exchange mode | ✅ Livré (2026-05-14, orchestrator run `20260513-235401-167aae`, commit `3ffd67f`) |
| **5** | Clôture E2E | ✅ Livré CONDITIONAL PASS (2026-05-14) — stratégie hybride architecte : phase 1 emulator local pour stabilisation + phase 2 real Firebase staging (`mediexchange-staging`) pour transition PASS. Voir [docs/release/STAGING_SETUP_EMULATOR.md](docs/release/STAGING_SETUP_EMULATOR.md) + [docs/release/STAGING_SETUP_FIREBASE_PROJECT.md](docs/release/STAGING_SETUP_FIREBASE_PROJECT.md) |

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
| **TD-LICENSE-REGISTRATION-AUDIT** | **Pre-deploy audit (Sprint 2A.3 follow-up)** — avant push prod du callable `createPharmacyRegistration` + gate fail-closed sur unknown country, lancer le script `functions/scripts/auditUnknownCountryPharmacies.mjs` pour compter les pharmacies actuellement en prod sans `countryCode` ou avec `countryCode` absent de `system_config/main.countries`. Ces comptes seront refusés par le gate post-deploy → décision produit nécessaire (migration data, backfill grace-period ciblé, ou activation progressive pays par pays). Script livré en Sprint 2A.3.1 (commit suivant). | **BLOQUANT pour deploy** | ~30min |
| **TD-LEGACY-PHARMACY-HTTP-RETIREMENT** | Retirer l'endpoint HTTP legacy `createPharmacyUser` (Sprint 2A.3.1 a ajouté un commentaire de deprecation, le canonical path est désormais `createPharmacyRegistration`). À planifier après vérification que les logs prod montrent 0 trafic sur l'ancien endpoint sur une fenêtre stable (~1-2 mois post-2B). | Low | ~1h |
| ~~**TD-SANDBOX-SCREEN-EMULATOR**~~ | ✅ **RÉSOLU** par le micro-sprint emulator HTTP routing (2026-05-14, élargi à 4 fichiers : `shared/lib/services/authenticated_http_service.dart` source canonique + `unified_wallet_service.dart` + `sandbox_testing_screen.dart` + `exchange_service.dart` (dead-code) + `secure_subscription_service.dart`). `AuthenticatedHttpService.functionsBaseUrl` devient un getter gated par `--dart-define=USE_EMULATOR=true` ; les 4 consommateurs y délèguent. Build prod : branche emulator élidée par tree-shaking (`_useEmulator` est compile-time constant `false`). | — | — |
| **TD-REGISTRATION-POST-SUCCESS-UX** | **(Sprint 5 phase 1 recette follow-up)** — Pendant la recette S2-CM et S2-GH sur emulator, le bouton "Create Account" affiche systématiquement le snackbar rouge `Registration failed: <message>` MALGRÉ le fait que le callable `createPharmacyRegistration` réussit côté backend (vérifié via Firestore : doc `pharmacies/{uid}` correctement créé avec `licenseStatus='pending_verification'` / `'not_required'` + `subscriptionStatus` correct). Retry produit ensuite `email already used` (preuve que l'Auth user EST créé). Hypothèse : `UnifiedAuthService.signUp` (Sprint 2A.3 migration) appelle la callable puis enchaîne une étape downstream (probablement `signInWithEmailAndPassword` auto-login) qui plante silencieusement côté emulator, et le code propagate cette erreur secondaire comme si la callable elle-même avait échoué. À investiguer : tracer le control flow exact post-callable dans `UnifiedAuthService.signUp` et différencier l'erreur de la callable vs erreur signin. Non-bloquant pour la recette (data correcte) mais fait perdre du temps. | Medium | ~1h |
| **TD-WALLET-CURRENCY-SERVER-SIDE** | **(Sprint 5 phase 1 recette follow-up, 2026-05-14)** — `createPharmacyRegistration` ([functions/src/createPharmacyRegistration.ts:291](functions/src/createPharmacyRegistration.ts#L291)) initialise `wallets/{uid}.currency` depuis `profile.currency` (valeur client) avec fallback `"XAF"`. Conséquence : pour une pharmacie Ghana (`countryCode='GH'`, sysconfig `defaultCurrencyCode='GHS'`), si le client Flutter n'envoie pas `profile.currency` (ce qui est le cas actuellement), le wallet est créé avec `currency: 'XAF'` au lieu de `'GHS'`. Inconsistant avec l'architecture Sprint 2A.3 (server-side derivation depuis sysconfig). Fix : remplacer le fallback par `country.defaultCurrencyCode` du sysconfig déjà chargé ligne 173. Affecte toutes les pharmacies non-CM (Ghana, futurs pays). | Medium | ~30min |
| **TD-SANDBOX-EMAIL-GUARD-EMULATOR** | **(Sprint 5 phase 1 recette follow-up, 2026-05-14)** — `sandboxCredit` / `sandboxDebit` callables enforcent un guard email pattern (`test*@promoshake.net`, `sandbox*@promoshake.net`, `dev*@promoshake.net`) avec erreur `NOT_TEST_ACCOUNT`. Pour la recette emulator, les pharmacies sont créées avec des emails métier (`accra1@gmail.com`, `cmA@test.com`, etc.) qui ne matchent pas → SandboxTestingScreen unusable. Workaround actuel : écrire le wallet directement via Admin SDK node one-liner. Fix : détecter env emulator (`process.env.FUNCTIONS_EMULATOR === 'true'`) et bypass le guard, OU rendre la liste autorisée configurable via `system_config`. Bonus : SandboxTestingScreen hardcode aussi `currency: 'XAF'` dans le payload — fixer en lisant la devise du wallet/pharmacy dynamiquement. | Medium | ~1h |

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
cd functions && npm test           # 338+ tests (excludes firestore rules tests)
cd functions && npm run test:rules # Firestore rules emulator tests (requires Java 21+ with firebase-tools 15.x, ~10s startup)
cd functions && npm run serve      # emulator (functions only)
```

**⚠️ Pre-deploy règle** : `npm run test:rules` est **obligatoire avant tout deploy de `firestore.rules`** depuis Sprint 2A.1. Le harness lance le Firestore emulator via `firebase emulators:exec` et valide les 22 cas de rules license (9 deny create + 9 deny update + REQ-2A1-001 headline + variantes allow). Tournant à part de `npm test` standard pour ne pas exiger Java sur CI.

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
