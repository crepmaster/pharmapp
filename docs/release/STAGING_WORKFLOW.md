# Staging-first workflow — PharmApp

Discipline de déploiement : **toute nouveauté est validée sur staging
(`mediexchange-staging`) avant d'être promue en prod (`mediexchange`)**.
Staging peut recevoir régulièrement une copie des données prod pour des
démos réalistes ET pour servir de dry-run de migration.

> Source de vérité projet : [../../CLAUDE.md](../../CLAUDE.md).
> Setup initial staging : [STAGING_SETUP_FIREBASE_PROJECT.md](STAGING_SETUP_FIREBASE_PROJECT.md).

---

## 1. Les 3 environnements

| Env | Projet Firebase | URLs | Usage |
|---|---|---|---|
| **DEV** | `demo-pharmapp` (émulateur local) | localhost:4000 | dev + recette rapide (éphémère) |
| **STAGING** | `mediexchange-staging` | app: <https://mediexchange-staging.web.app> · admin: <https://mediexchange-staging-admin.web.app> | validation + démo clients des nouveautés |
| **PROD** | `mediexchange` | app: <https://app-mediexchange.web.app> · admin: <https://mediexchange-76872.web.app> | live |

Region functions partout : `europe-west1`. Firestore staging : Native,
`europe-west1`.

---

## 2. Déployer une nouveauté sur STAGING

Pré-requis : code committé sur `main`, tests verts (`npm test`, `npm run test:rules`).

```bash
# Backend (depuis la racine)
firebase deploy --only firestore:indexes --project=staging
firebase deploy --only firestore:rules    --project=staging   # après npm run test:rules
firebase deploy --only functions          --project=staging

# Flutter web — clés staging via --dart-define (JAMAIS committées)
#   Récupérer la config : firebase apps:sdkconfig web --project=mediexchange-staging
cd pharmapp_unified && flutter build web --release \
  --dart-define=USE_STAGING=true \
  --dart-define=STAGING_API_KEY=<apiKey> \
  --dart-define=STAGING_APP_ID=<appId> \
  --dart-define=STAGING_SENDER_ID=<messagingSenderId> \
  --dart-define=STAGING_PROJECT_ID=mediexchange-staging && cd ..
firebase deploy --only hosting:app --project=staging

cd admin_panel && flutter build web --release \
  --dart-define=USE_STAGING=true \
  --dart-define=STAGING_API_KEY=<apiKey> \
  --dart-define=STAGING_APP_ID=<appId> \
  --dart-define=STAGING_SENDER_ID=<messagingSenderId> \
  --dart-define=STAGING_PROJECT_ID=mediexchange-staging && cd ..
firebase deploy --only hosting:admin --project=staging
```

`USE_STAGING` est géré dans `pharmapp_unified/lib/main.dart`,
`admin_panel/lib/main.dart` et `shared/lib/services/authenticated_http_service.dart`
(miroir du pattern `USE_EMULATOR`). Build prod (sans le flag) → prod inchangée.

Recette automatisée S1-S8 (callables) : `functions/scripts/e2eRecetteStaging.mjs`
(env `STAGING_WEB_API_KEY`).

---

## 3. Copier les données PROD → STAGING (récurrent)

> ⚠️ **PII** : ceci copie emails, hash téléphone, licences réelles dans
> staging. Décision produit assumée. Ne JAMAIS copier dans le sens inverse.

### 3.1 Firestore — one-time setup (bucket + IAM)

```bash
# Bucket de sync (dans le projet staging)
gsutil mb -p mediexchange-staging -l europe-west1 gs://mediexchange-staging-sync

# Le service agent Firestore de PROD doit pouvoir ÉCRIRE l'export dans le bucket.
#   Numéro projet prod : gcloud projects describe mediexchange --format='value(projectNumber)'
gsutil iam ch \
  serviceAccount:service-<PROD_PROJECT_NUMBER>@gcp-sa-firestore.iam.gserviceaccount.com:objectAdmin \
  gs://mediexchange-staging-sync
```

### 3.2 Firestore — copie récurrente

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
# Export prod (read-only sur prod)
gcloud firestore export gs://mediexchange-staging-sync/$STAMP --project=mediexchange
# Import dans staging (overwrite par doc-id ; n'efface pas les docs absents de l'export)
gcloud firestore import gs://mediexchange-staging-sync/$STAMP --project=mediexchange-staging
```

> Pour repartir d'un staging propre avant import, supprimer les collections
> de test côté staging (ou recréer la base). L'import ne fait pas de "replace
> total" : il écrase les docs de même ID et ajoute le reste.

### 3.3 Auth — copie des comptes

```bash
firebase auth:export staging-users.json --format=json --project=mediexchange
# Les paramètres de hash (algo/clé/salt/rounds/memCost) viennent de la console
# PROD : Authentication → ⋮ → Password hash parameters.
firebase auth:import staging-users.json --project=mediexchange-staging \
  --hash-algo=SCRYPT --hash-key=<base64> --salt-separator=<base64> \
  --rounds=8 --mem-cost=14
rm staging-users.json   # ne pas committer (PII)
```

### 3.4 Re-config post-import obligatoire

`system_config/main` prod peut différer de staging. Après import, re-vérifier
ou re-seeder : `node functions/scripts/seedStaging.mjs --project=mediexchange-staging --confirm`
(ou laisser la copie prod si elle est complète).

---

## 4. Dry-run de migration (le bonus de la copie prod)

Après une copie prod→staging, le code à jour (fail-closed) tourne sur des
**vraies données** dans un env sûr. Lancer les audits pour voir ce qui
casserait en prod **avant** d'y toucher :

```bash
node functions/scripts/auditUnknownCountryPharmacies.mjs --project=mediexchange-staging
node functions/scripts/auditGhanaLicenseReadiness.mjs   --project=mediexchange-staging --out gh-staging.csv
node functions/scripts/audit-remote-drift.mjs           --project mediexchange-staging
```

Toute pharmacie sans `countryCode` valide ou en statut licence non géré
apparaît ici → décider migration / backfill avant la promotion prod.

---

## 5. Promouvoir STAGING → PROD

Une fois la nouveauté validée + démo OK sur staging :

1. **Audits read-only sur PROD** (bloquants) :
   - `node functions/scripts/auditUnknownCountryPharmacies.mjs --project=mediexchange`
   - `node functions/scripts/auditGhanaLicenseReadiness.mjs --project=mediexchange --out gh-prod-pre.csv`
   - `node functions/scripts/audit-remote-drift.mjs --project mediexchange`
   - cf. TD-LICENSE-REGISTRATION-AUDIT + TD-MSISDN-AUDIT dans CLAUDE.md.
2. Plan de rollback documenté + fenêtre off-peak.
3. Deploy prod dans l'ordre : `indexes` → `rules` (après `npm run test:rules`)
   → `functions` → `hosting` (build prod = SANS `--dart-define=USE_STAGING`).
4. Suivi runbook 7 jours : [SPRINT_5_MONITORING_7D.md](SPRINT_5_MONITORING_7D.md).

---

## 6. Garde-fous

- Build **prod** = aucun flag `USE_STAGING`/`USE_EMULATOR` → pointe `mediexchange`.
- `seedStaging.mjs` refuse tout projet ne finissant pas par `-staging`.
- Secrets paiement : staging a des valeurs **dummy** ; ne jamais y copier les
  secrets prod (les webhooks paiement ne sont pas exercés sur staging).
- Coût staging : Blaze, conso quasi nulle ; supprimable si non utilisé
  (`gcloud projects delete mediexchange-staging`).
