# Sprint 5 — Staging setup with Firebase Emulator Suite

**Phase** : stabilisation Sprint 5 (étape 1 de 2 dans la stratégie hybride
architecte 2026-05-14).
**Objectif** : exécuter rapidement les 8 scénarios de
[SPRINT_5_E2E_CLOSURE_PLAN.md](SPRINT_5_E2E_CLOSURE_PLAN.md), détecter
les bugs évidents, stabiliser la checklist — **sans coût, sans risque
prod**.
**Limite** : l'émulateur **ne suffit pas** pour transiter Sprint 5 de
CONDITIONAL PASS → PASS. Voir [STAGING_SETUP_FIREBASE_PROJECT.md](STAGING_SETUP_FIREBASE_PROJECT.md)
pour la preuve finale.

---

## 1. Ce que l'émulateur couvre vs ne couvre pas

### ✅ Couvert par l'émulateur local

| Scénario | Surface testée |
|---|---|
| S1 Inscription Ghana sans licence → `LICENSE_REQUIRED` | Callable `createPharmacyRegistration` + license gate rules |
| S2 Inscription Ghana avec licence → `pending_verification` | Idem + sysconfig Ghana |
| S3 Verify admin → `verified` + trial démarre | Callables `adminVerifyPharmacyLicense` + `startTrialForPharmacy` |
| S4 Medicine request purchase E2E | 3 callables + Firestore + wallet sandbox |
| S5 Medicine request exchange E2E (Sprint 4) | 3 callables + inventory hold lock #5 |
| S6 Parity matrix cross-mode | Validation backend pure |
| S7 Non-verified bloqué sur 5 callables marketplace | License gate matrix |
| S8 Withdrawal happy path + MSISDN | `createWithdrawalRequest` + sandbox advance |

### ❌ NON couvert par l'émulateur (réservé real Firebase staging)

- Webhooks Mobile Money réels (MTN MoMo, Orange, Paystack callbacks).
- FCM push notifications réelles vers device.
- Géolocalisation / QR scan caméra sur device physique.
- Build mobile signé + déploiement TestFlight / Play Internal Testing.
- Sandbox payment des providers (callbacks `momoWebhook`, `paystackWebhook`).
- Cloud Logging réel et audit drift sur projet déployé.

**Conséquence** : les 8 scénarios E2E **passeront** sur l'émulateur si le
code est correct, mais la preuve PASS finale exige le real staging
Firebase.

---

## 2. Prérequis machine

- Node 22+ (`node --version`).
- Java 21+ pour Firebase Emulator Suite avec firebase-tools 15.x
  (`java -version`). Sur cette machine, firebase-tools 15.18 refuse Java
  17. Si plusieurs JDK coexistent, vérifier `where java` et mettre le JDK
  21+ en tête du `PATH` ou définir `JAVA_HOME` dans le terminal de recette.
- Firebase CLI 15.x (`firebase --version`). Si absent :
  `npm install -g firebase-tools`.
- Flutter 3.13+ pour lancer l'app mobile en mode emulator (`flutter --version`).

---

## 3. Extension `firebase.json` pour la recette E2E

`firebase.json` a déjà une section `emulators` minimale (Firestore port
8080, ajoutée Sprint 2A.1 pour les rules tests). Pour la recette
Sprint 5 il faut ajouter Auth + Functions :

```diff
 "emulators": {
+  "auth": { "port": 9099 },
+  "functions": { "port": 5001 },
   "firestore": { "port": 8080 },
+  "ui": { "enabled": true, "port": 4000 },
-  "ui": { "enabled": false },
   "singleProjectMode": true
 }
```

> ⚠️ **Avant le commit** : si tu veux préserver la config minimale pour
> les rules tests CI (Sprint 2A.1 utilise `firebase emulators:exec` avec
> Firestore-only), garde la version actuelle et utilise un fichier
> `firebase.local.json` séparé via la variable `FIREBASE_CONFIG`.
> Solution alternative : passer `--only firestore` à
> `firebase emulators:exec` dans le script `test:rules`. **À décider
> avant d'éditer `firebase.json`** — l'extension peut casser le harness
> rules existant si l'Auth emulator change le comportement.

---

## 4. Démarrage de l'émulateur

```bash
# Build TS frais (les emulator functions tournent depuis lib/)
cd functions && npm run build
cd ..

# Lance tout en avant-plan (Ctrl-C pour arrêter)
firebase emulators:start --project=demo-pharmapp

# OU en mode interactif avec UI sur localhost:4000
firebase emulators:start --project=demo-pharmapp --import=./emulator-data --export-on-exit
```

Le projet ID `demo-pharmapp` (préfixe `demo-`) déclenche automatiquement
le mode offline de Firebase CLI : pas d'authentification gcloud
requise, pas de billing.

**Ports par défaut après extension** :

- Auth : `http://localhost:9099`
- Firestore : `http://localhost:8080`
- Functions : `http://localhost:5001`
- UI : `http://localhost:4000`

---

## 5. Seed data minimal pour les 8 scénarios

> ⚠️ **Note importante** : un seed **écrit** des documents dans l'émulateur
> par définition — ce n'est pas read-only. Les options ci-dessous écrivent
> uniquement dans l'émulateur local (jamais prod, jamais staging) et
> doivent être interrompues si le `FIRESTORE_EMULATOR_HOST` n'est pas
> détecté. Le projet ID `demo-pharmapp` (préfixe `demo-`) garantit que
> Firebase Admin SDK refuse de cibler un projet réel.

### 5.1 Option A — Seed manuel via Emulator UI (recommandé pour démarrer)

Ouvrir l'UI émulateur sur `http://localhost:4000/firestore` et créer à la
main les documents listés en 5.3 ci-dessous. Plus rapide qu'un script
quand on lance la recette pour la première fois et qu'on veut
expérimenter les valeurs.

### 5.2 Option B — Script de seed dédié ([functions/scripts/seedEmulator.mjs](../../functions/scripts/seedEmulator.mjs))

Livré et testé en phase 1 (Windows 11 + Node 22 + firebase-tools 15.18 +
JDK 25, le 2026-05-14). Idempotent (`set` avec `merge:true`) — peut être
ré-exécuté sans casser l'état seedé.

```bash
# Pré-requis : émulateur démarré dans une autre fenêtre
firebase emulators:start --only firestore,auth,functions --project=demo-pharmapp

# Puis dans une 2e fenêtre :
export FIRESTORE_EMULATOR_HOST=localhost:8080
export FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
node functions/scripts/seedEmulator.mjs --project=demo-pharmapp
```

**3 garde-fous anti-prod** (tous doivent passer, sinon exit 2) :

1. `FIRESTORE_EMULATOR_HOST` doit être défini.
2. `--project` doit commencer par `demo-`.
3. Confirmation visuelle des valeurs cibles avant écriture.

Tests garde-fous validés au moment du livrable Sprint 5 phase 1 :

| Test | Attendu | Résultat |
|---|---|---|
| `--help` | exit 0, aide affichée | ✅ |
| Sans env var ni `--project` | exit 2, "GUARD 1 FAILED" | ✅ |
| Env var set, sans `--project` | exit 2, "GUARD 2 FAILED" | ✅ |
| Env var set, `--project=mediexchange` (non-demo) | exit 2, "GUARD 2 FAILED" | ✅ |
| Env var + `--project=demo-pharmapp` (légitime) | exit 0, document écrit | ✅ |

### 5.3 Contenu attendu du seed (manuel ou script)

1. `system_config/main` :
   - `countries.CM = { licenseRequired: false, defaultCurrencyCode: 'XAF' }`
   - `countries.GH = { licenseRequired: true, licenseFormatRegex: '^GH-\\d{4}$', licenseGracePeriodDays: 30, defaultCurrencyCode: 'GHS' }`
   - `citiesByCountry.CM.douala = { deliveryFee: 1000, exchangeFee: 1200 }`
   - `citiesByCountry.GH.accra = { deliveryFee: 2000 }` (laisser exchangeFee absent pour tester fallback × 1.2 = 2400)
2. Pas de pharmacies pré-seedées : les scénarios S1/S2/S3 les créent via
   les flows réels (`createPharmacyRegistration`).
3. Pour S4/S5 : créer **après** les inscriptions S1+S2+S3, manuellement
   via Emulator UI — inventaire de Pharmacy CM-B (3 items WHO) + Pharmacy
   CM-A (2 items pour exchange retour).

### 5.4 Snapshot import/export

Le flag `--import=./emulator-data --export-on-exit` lors du démarrage
sauvegarde l'état de l'émulateur entre sessions. Une fois le seed
initial fait (option A ou B), `Ctrl-C` exporte automatiquement, et le
prochain `firebase emulators:start --import=./emulator-data` repart de
l'état seedé. **Ne pas committer le dossier `emulator-data/`** dans
git : c'est de la state locale.

---

## 6. Configuration app Flutter pour pointer sur émulateur

✅ **Livré Sprint 5 phase 1.** Le wiring est dans
[`pharmapp_unified/lib/main.dart`](../../pharmapp_unified/lib/main.dart) et
**gated** par `--dart-define=USE_EMULATOR=true`. La build prod ne voit
jamais `useEmulator=true`, donc l'app prod ne résout jamais `localhost`.

### 6.1 Point critique — projectId doit matcher

`firebase_options.dart` hardcode `projectId: 'mediexchange'` (prod). Mais
le seed écrit dans `demo-pharmapp`. Si tu ne surcharges pas le projectId
en mode emulator, l'app et le seed regardent **deux namespaces différents**
dans l'émulateur, ce qui produit des comportements incompréhensibles
(documents invisibles, callables qui réussissent mais l'app ne voit rien).

Le wiring committé résout ce problème en construisant des `FirebaseOptions`
synthétiques (apiKey/appId factices, `projectId` aligné sur le seed) quand
`USE_EMULATOR=true`.

### 6.2 Dart-defines disponibles

| Flag | Default | Rôle |
|---|---|---|
| `USE_EMULATOR` | `false` | Active le wiring localhost |
| `FIREBASE_PROJECT_ID` | `demo-pharmapp` | Doit matcher `--project=` passé au seed et à l'émulateur |
| `EMULATOR_HOST` | `localhost` | Pour cas atypiques (ex : Docker, WSL) |

---

## 7. Procédure 3 terminaux PowerShell

Architect-recommended setup pour exécuter les 8 scénarios contre
l'émulateur.

### Terminal 1 — émulateur

```powershell
cd C:\Users\aebon\projects\pharmapp-mobile

# Si java -version renvoie encore 17, pointer explicitement un JDK 21+.
# Exemple local validé :
$env:JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-25.0.0.36-hotspot"
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"

cd functions
npm run build
cd ..
firebase emulators:start --only firestore,auth,functions --project=demo-pharmapp
```

Attendre le banner `All emulators ready! It is now safe to connect your app.`
puis laisser tourner.

### Terminal 2 — seed

```powershell
cd C:\Users\aebon\projects\pharmapp-mobile
$env:FIRESTORE_EMULATOR_HOST="localhost:8080"
$env:FIREBASE_AUTH_EMULATOR_HOST="localhost:9099"
node .\functions\scripts\seedEmulator.mjs --project=demo-pharmapp
```

Doit afficher `system_config/main written successfully`. Garder le
terminal ouvert pour relancer le seed entre runs si besoin.

### Terminal 3 — app Flutter web

```powershell
cd C:\Users\aebon\projects\pharmapp-mobile\pharmapp_unified
flutter run -d chrome --web-port=8086 `
  --dart-define=USE_EMULATOR=true `
  --dart-define=FIREBASE_PROJECT_ID=demo-pharmapp
```

Ouvre Chrome sur `http://localhost:8086`. Les 3 instances Firebase
(Auth, Firestore, Functions) sont automatiquement re-routées vers
l'émulateur via le wiring conditionnel de `main.dart`.

### Premier flow à tester (suggestion architecte)

- Choisir **Pharmacy** sur la landing page.
- Tenter une inscription **Ghana sans licence**.
  - Attendu : snackbar `LICENSE_REQUIRED`, aucun doc `pharmacies/{uid}`
    visible sur `http://localhost:4000/firestore`.
- Refaire l'inscription **Ghana avec licence `GH-1234`**.
  - Attendu : doc `pharmacies/{uid}` créé avec `licenseStatus='pending_verification'`
    et `subscriptionStatus='trial_pending_license'`.

### Adaptations émulateur

- **S3 Admin verify** : créer un user admin manuellement via
  l'UI emulator Auth (`http://localhost:4000/auth`) avec custom claims
  `{ role: 'admin', countryScopes: ['GH'], permissions: ['manage_pharmacies'] }`.
- **S4/S5 Wallet sandbox** : ⚠️ **NE PAS** utiliser `SandboxTestingScreen`
  côté Flutter — il contient une URL Functions hardcodée vers la prod
  (`europe-west1-mediexchange`). Créditer les wallets via l'Emulator UI
  Firestore (créer un doc `wallets/{uid}` à la main) ou via un script
  local Admin SDK. À fixer dans un futur micro-sprint (TD à ouvrir).
- **S8 Withdrawal** : `sandboxAdvanceWithdrawal` simule le PSP — pas
  de webhook réel requis.

### Smoke backend-only Scénario 4

`functions/scripts/smokeScenario4.mjs` orchestre le Scénario 4
medicine-request purchase contre Auth + Functions + Firestore emulators :
inscription CM-A/CM-B via `createPharmacyRegistration`, seed wallet +
inventory, puis `createMedicineRequest` → `submitMedicineRequestOffer` →
`acceptMedicineRequestOffer`.

Validé le 2026-05-14 avec firebase-tools 15.18 + JDK 25 : script exit 0,
13 assertions end-state pass. Commande PowerShell :

```powershell
cd C:\Users\aebon\projects\pharmapp-mobile
$env:JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-25.0.0.36-hotspot"
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
firebase emulators:exec --only firestore,auth,functions --project=demo-pharmapp "cmd /c node functions/scripts/seedEmulator.mjs --project=demo-pharmapp && node functions/scripts/smokeScenario4.mjs --project=demo-pharmapp"
```

---

## 8. Collecte des preuves émulateur

Pour chaque scénario passé, archiver dans
`docs/release/evidence/SPRINT_5_emulator_<date>/S<n>/` :

- `firestore-export.json` : `firebase emulators:export ./emulator-data`
  après le scénario.
- `functions-logs.txt` : copie depuis le terminal emulator.
- `ui-screenshots.png` : screenshots clés (notamment S1 snackbar
  `LICENSE_REQUIRED`, S5 inventory picker).

**Note importante** : les preuves émulateur **ne sont pas suffisantes**
pour PASS. Elles servent uniquement à confirmer que les scénarios
passent côté logique avant de répéter sur real Firebase staging.

---

## 9. Critères de sortie phase emulator

- [ ] Les 8 scénarios passent sur l'émulateur.
- [ ] Aucun bug critique découvert (sinon micro-sprint correction avant
  de continuer).
- [ ] Preuves émulateur archivées.
- [ ] Décision : passer à [STAGING_SETUP_FIREBASE_PROJECT.md](STAGING_SETUP_FIREBASE_PROJECT.md)
  pour la phase 2 (real Firebase staging) avant le verdict PASS final.

---

## 10. Liens

- Plan recette : [SPRINT_5_E2E_CLOSURE_PLAN.md](SPRINT_5_E2E_CLOSURE_PLAN.md)
- Phase 2 staging réel : [STAGING_SETUP_FIREBASE_PROJECT.md](STAGING_SETUP_FIREBASE_PROJECT.md)
- Runbook monitoring : [SPRINT_5_MONITORING_7D.md](SPRINT_5_MONITORING_7D.md)
- Sprint 4 contrat : [../f-bloc2-p2-medicine_requests_exchange.md](../f-bloc2-p2-medicine_requests_exchange.md)
