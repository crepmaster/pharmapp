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
- Java 17+ pour Firestore emulator + Auth emulator (`java -version`).
- Firebase CLI ≥ 13 (`firebase --version`). Si absent : `npm install -g firebase-tools`.
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

### 5.2 Option B — Script de seed dédié (à créer lors de la recette si besoin)

Si tu veux rejouer plusieurs fois la recette à partir d'un état propre,
créer un script local lors de la recette. Le fichier n'existe pas dans
le repo aujourd'hui — c'est un livrable optionnel de la phase de
stabilisation, à committer (ou pas) selon utilité opérationnelle.

Esquisse de l'API attendue :

```bash
# Pré-requis : émulateur démarré + FIRESTORE_EMULATOR_HOST exporté
export FIRESTORE_EMULATOR_HOST=localhost:8080
export FIREBASE_AUTH_EMULATOR_HOST=localhost:9099

# functions/scripts/seedEmulator.mjs — emulator-only, refuse de tourner
# si FIRESTORE_EMULATOR_HOST est absent (garde-fou anti-prod).
node functions/scripts/seedEmulator.mjs --project=demo-pharmapp
```

Le script doit échouer fail-closed si :

- `FIRESTORE_EMULATOR_HOST` n'est pas défini, OU
- `--project` ne commence pas par `demo-` ou ne matche pas `mediexchange-staging`.

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

Dans `pharmapp_unified/lib/main.dart` (ou équivalent), ajouter en dev
seulement :

```dart
if (kDebugMode) {
  FirebaseAuth.instance.useAuthEmulator('localhost', 9099);
  FirebaseFirestore.instance.useFirestoreEmulator('localhost', 8080);
  FirebaseFunctions.instanceFor(region: 'europe-west1')
      .useFunctionsEmulator('localhost', 5001);
}
```

> ⚠️ **Ne pas commit ce bloc** — temporaire pour la recette. Restaurer
> après chaque session emulator.
> Mieux : guard derrière une variable d'environnement
> `--dart-define=USE_EMULATOR=true`.

---

## 7. Exécution des 8 scénarios

Suivre [SPRINT_5_E2E_CLOSURE_PLAN.md](SPRINT_5_E2E_CLOSURE_PLAN.md)
section 3, scénarios 1 à 8.

Adaptations émulateur :

- **S3 Admin verify** : créer un user admin manuellement via
  l'UI emulator Auth (`http://localhost:4000/auth`) avec custom claims
  `{ role: 'admin', countryScopes: ['GH'], permissions: ['manage_pharmacies'] }`.
- **S4/S5 Wallet sandbox** : appeler `sandboxCredit` callable pour
  créditer les wallets avant exécution.
- **S8 Withdrawal** : `sandboxAdvanceWithdrawal` simule le PSP — pas
  de webhook réel requis.

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
