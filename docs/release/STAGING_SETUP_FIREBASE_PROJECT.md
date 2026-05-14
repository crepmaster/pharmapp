# Sprint 5 — Real Firebase staging project setup

**Phase** : preuve finale Sprint 5 (étape 2 de 2 dans la stratégie
hybride architecte 2026-05-14).
**Objectif** : refaire la recette complète sur un vrai projet Firebase
isolé pour collecter les preuves PASS finales avant deploy prod.
**Pré-requis** : phase 1 emulator (`STAGING_SETUP_EMULATOR.md`) terminée,
8 scénarios stables, bugs évidents corrigés.

> 🔒 **Décision architecte verrouillée 2026-05-14** : Sprint 5 transite
> de CONDITIONAL PASS → PASS **uniquement après recette sur ce real
> Firebase staging**, pas après émulateur seul.

---

## 1. Création du projet Firebase staging

### 1.1 Console

1. <https://console.firebase.google.com> → Add project.
2. Nom : `mediexchange-staging` (ou autre selon convention org).
3. Désactiver Google Analytics pour staging (pas pertinent, évite la
   facturation Analytics).
4. Région par défaut : Cloud Functions doit pouvoir tourner en
   `europe-west1` (région utilisée par toutes les callables prod).
5. Activer le **Blaze plan** si :
   - tu veux tester les webhooks Mobile Money sandbox réels (Paystack,
     MTN MoMo) → OUI Blaze car sortie réseau.
   - sinon Spark plan suffit (gratuit, mais pas d'egress).
6. Activer les services :
   - **Authentication** (Email/Password)
   - **Firestore Database** (Native mode, région `europe-west1`)
   - **Cloud Functions** (région `europe-west1`)
   - **Storage** seulement si testé (optionnel pour Sprint 5).

### 1.2 CLI association

```bash
# Lister les projets
firebase projects:list

# Associer le projet staging au dépôt local sans toucher prod
firebase use --add mediexchange-staging --alias staging

# Vérifier
firebase use
# attendu : Active Project: staging (mediexchange-staging)
```

---

## 2. Deploy initial backend

### 2.1 Build + deploy en séquence sécurisée

```bash
# Build TS frais
cd functions && npm run build && npm run lint && npm test
cd ..

# Indexes EN PREMIER (sinon les fonctions échouent à l'init)
firebase deploy --only firestore:indexes --project=staging

# Rules
firebase deploy --only firestore:rules --project=staging

# Functions
firebase deploy --only functions --project=staging
```

### 2.2 Vérifier le drift

```bash
node functions/scripts/audit-remote-drift.mjs --project=mediexchange-staging
# attendu : remote_only=[], local_only=[], intersection ≥ 45 functions
```

---

## 3. Seed `system_config/main`

`system_config/main` n'est pas déployé par `firebase deploy`. Il faut le
créer manuellement.

### 3.1 Via Console Firebase

Ajouter le document `system_config/main` avec la structure miroir de
celle utilisée en prod, ou un sous-ensemble adapté :

```json
{
  "countries": {
    "CM": {
      "licenseRequired": false,
      "defaultCurrencyCode": "XAF"
    },
    "GH": {
      "licenseRequired": true,
      "licenseFormatRegex": "^GH-\\d{4}$",
      "licenseGracePeriodDays": 30,
      "defaultCurrencyCode": "GHS",
      "licenseLabel": "Pharmacy Council License",
      "licenseHelpText": "Enter your Pharmacy Council of Ghana license number."
    }
  },
  "citiesByCountry": {
    "CM": {
      "douala": { "deliveryFee": 1000, "exchangeFee": 1200 }
    },
    "GH": {
      "accra": { "deliveryFee": 2000 }
    }
  },
  "currencies": {
    "XAF": { "decimals": 0, "minWithdrawalMinor": 1000 },
    "GHS": { "decimals": 2, "minWithdrawalMinor": 10000 }
  },
  "mobileMoneyProviders": {
    "mtn_momo": { "enabled": true, "supportsPayouts": true, "methodCode": "mtn_momo" }
  }
}
```

### 3.2 Via callable admin

Si `setCountryLicenseConfig` callable est déjà déployé (Sprint 2B.1),
on peut peupler les pays via cet endpoint en s'authentifiant comme
super_admin.

---

## 4. Création des comptes test

Suivre [SPRINT_5_E2E_CLOSURE_PLAN.md](SPRINT_5_E2E_CLOSURE_PLAN.md)
section 2.2.

- Super admin : créé via Console Auth → custom claims via callable
  `createAdminUser` ou via `gcloud iam` selon convention.
- Pharmacies test : créées via l'app mobile (utilise
  `createPharmacyRegistration` Sprint 2A.3, le canonical path).
- Courier : créé via callable `createCourierUser`.

---

## 5. Configuration app mobile pour pointer sur staging

### 5.1 Récupérer les clés staging

```bash
firebase apps:sdkconfig web --project=mediexchange-staging
firebase apps:sdkconfig android --project=mediexchange-staging
firebase apps:sdkconfig ios --project=mediexchange-staging
```

### 5.2 Build flavor staging

Créer un build flavor `staging` qui utilise un `firebase_options_staging.dart`
distinct de `firebase_options.dart` (qui contient les placeholders prod).

```bash
flutter run -d chrome --web-port=8086 \
  --flavor=staging \
  --dart-define=FIREBASE_PROJECT=mediexchange-staging
```

### 5.3 Sécurité clés

Les clés staging sont moins sensibles que prod mais doivent quand même
suivre la règle de [CLAUDE.md](../../CLAUDE.md) section "Testing phase" :
**ne jamais commit les vraies clés**. Utiliser des placeholders +
configuration locale via `.env` ou `--dart-define`.

---

## 6. Exécution recette E2E complète

Suivre [SPRINT_5_E2E_CLOSURE_PLAN.md](SPRINT_5_E2E_CLOSURE_PLAN.md)
section 3, scénarios 1 à 8.

Sur real staging vs emulator :

- Mobile Money : les `sandboxCredit` / `sandboxDebit` callables restent
  utilisées (pas de vrai paiement même sur staging — sauf si on teste
  spécifiquement Paystack/MTN sandbox payment, voir 6.2 ci-dessous).
- FCM push : envoyer des messages tests via `notifications` callable et
  vérifier sur device.
- Withdrawal (S8) : utiliser `sandboxAdvanceWithdrawal` côté backend,
  pas de vraie payout.

### 6.1 Audits pré-recette

```bash
node functions/scripts/audit-remote-drift.mjs --project=mediexchange-staging
node functions/scripts/auditGhanaLicenseReadiness.mjs --project=mediexchange-staging --out gh-staging-pre.csv
# attendu staging neuf : tous les buckets à 0 ou très bas
```

### 6.2 Optionnel : test Paystack / MTN sandbox payment

Si Blaze plan activé et tu veux exercer les webhooks réels :

- Paystack : créer une clé sandbox sur le dashboard Paystack, configurer
  `paystack_secret` dans Functions secrets staging :
  `firebase functions:secrets:set PAYSTACK_SECRET --project=mediexchange-staging`.
- MTN MoMo : utiliser les credentials sandbox MTN (séparées de prod).
- Tester `paystackTopupIntent` + webhook réception, vérifier idempotency
  via `webhook_logs/{id}` (TTL 30j).

---

## 7. Collecte preuves PASS finales

Pour chaque scénario sur real staging, archiver dans
`docs/release/evidence/SPRINT_5_staging_<date>/S<n>/` :

- `firestore-export.json` : export via Firebase Console ou
  `gcloud firestore export gs://<bucket>/sprint5-evidence/`.
- `cloud-logging.txt` : extract via
  `gcloud logging read 'resource.type="cloud_function"' --project=mediexchange-staging --limit=100`.
- `ui-screenshots/*.png` : screenshots clés.
- `S<n>-summary.md` : 1 paragraphe verdict.

---

## 8. Audits post-recette

```bash
# Drift après la recette
node functions/scripts/audit-remote-drift.mjs --project=mediexchange-staging

# Audit Ghana post-recette
node functions/scripts/auditGhanaLicenseReadiness.mjs --project=mediexchange-staging --out gh-staging-post.csv

# Comparer pre/post : seules les pharmacies créées par S1/S2/S3 doivent apparaître
diff gh-staging-pre.csv gh-staging-post.csv
```

---

## 9. Transition vers PASS

Tous les 8 scénarios passés sur real staging + preuves archivées →
modifier dans cette même séquence :

1. `CLAUDE.md` ligne Sprint 5 : `CONDITIONAL PASS` → `PASS`.
2. `docs/ACTIVE_DOCS.md` même mise à jour.
3. `docs/orchestrator_sprints/SPRINT_5_E2E_CLOSURE_TASK.md` section
   "Statut final" mise à jour.
4. `docs/release/POST_DEPLOY_REPORT_<date>.md` créé après J+7 monitoring
   propre.

Commit message suggéré :

```text
docs(release): sprint 5 — staging recette completed, transition to PASS
```

---

## 10. Pré-deploy prod (gate suivant)

PASS Sprint 5 est nécessaire mais **pas suffisant** pour deploy prod.
Avant `firebase deploy --project=mediexchange` :

1. Re-lancer les 3 audits sur prod en read-only :
   - `auditUnknownCountryPharmacies.mjs --project=mediexchange`
   - `auditGhanaLicenseReadiness.mjs --project=mediexchange --out gh-prod-pre.csv`
   - `audit-remote-drift.mjs --project=mediexchange`
2. Confirmer owner monitoring 7j (cf. `SPRINT_5_MONITORING_7D.md`).
3. Plan de rollback documenté.
4. Window de deploy off-peak.
5. Suivi runbook 7j post-deploy.

---

## 11. Liens

- Plan recette : [SPRINT_5_E2E_CLOSURE_PLAN.md](SPRINT_5_E2E_CLOSURE_PLAN.md)
- Phase 1 émulateur : [STAGING_SETUP_EMULATOR.md](STAGING_SETUP_EMULATOR.md)
- Runbook monitoring : [SPRINT_5_MONITORING_7D.md](SPRINT_5_MONITORING_7D.md)
- Source de vérité projet : [../../CLAUDE.md](../../CLAUDE.md)
