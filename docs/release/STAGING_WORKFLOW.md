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

> ⛔ **Le déploiement direct est interdit.** Les quatre phases passent par
> `scripts/deploy-staging.mjs` et ciblent uniquement `mediexchange-staging`.
> Cette implémentation est candidate : elle n'a pas encore été exercée sur le
> projet distant. Une revue du diff et un préflight depuis un commit poussé
> doivent précéder le premier `expand`.

Pré-requis : worktree propre, commit poussé sur sa branche et visible par
`git ls-remote origin`, Java, ADC pour écrire/lire la preuve Firestore et
identité Firebase CLI autorisée à déployer sur staging. Le script réinstalle
les dépendances verrouillées, reconstruit et teste Functions et Rules à
chaque phase. `expand` reconstruit aussi les deux sites web. Aucune phase
ne cible la production.

Pour `expand`, définir `FLUTTER_ROOT` vers le SDK Flutter (le script invoque
son binaire Dart natif, sans `flutter.bat`) et fournir les fichiers locaux
ignorés `pharmapp_unified/lib/firebase_options.dart` et
`admin_panel/lib/firebase_options.dart`, ainsi que les dossiers d'assets
déclarés dans leurs `pubspec.yaml`. Définir, pour **chaque** site, les trois
variables `STAGING_APP_API_KEY`, `STAGING_APP_APP_ID`,
`STAGING_APP_SENDER_ID`, puis les mêmes avec le préfixe `STAGING_ADMIN`.
Le script confirme auprès de Firebase que ces valeurs appartiennent aux apps
Web du projet staging avant de construire quoi que ce soit. Ces sept valeurs
peuvent être placées dans `.deploy/staging-web.env.json` (ignoré Git). Le
fichier `functions/.env.mediexchange-staging`, ignoré Git, doit contenir
`SANDBOX_ENABLED=true` ; un `functions/.env` générique qui définit ce flag
est refusé.

Séquence contrôlée, à exécuter depuis la racine d'un checkout propre :

```text
npm run deploy:staging -- preflight --project=mediexchange-staging
npm run deploy:staging -- expand --project=mediexchange-staging
npm run deploy:staging -- contract --project=mediexchange-staging
npm run deploy:staging -- verify --project=mediexchange-staging
```

Portée réelle :

| Phase | Portée | Cible |
|---|---|---|
| `preflight` | installation, build, tests, hash, anti-dérive ; aucune mutation distante | local |
| `expand` | Snapshot distant préalable, indexes, Functions, Hosting app puis admin ; comparaison des archives source de toutes les Functions et des fichiers complets des deux versions Hosting ; preuve d'expand écrite dans Firestore staging après succès | staging |
| `contract` | Rules uniquement, après relecture des artefacts distants et d'un reçu de recette vente + échange vérifié dans Firestore ; comparaison du ruleset actif au fichier local après publication | staging |
| `verify` | relit les preuves `expand` et `contract`, les sources Functions, les versions Hosting et le contenu Rules actif ; aucune mutation distante | staging |

Un échec après un déploiement partiel **ne** produit **pas** de preuve de
succès. Les Rules ne peuvent donc pas être durcies par `contract` tant que
`expand` n'a pas été relancé et vérifié entièrement. Le document
`deployment_proofs/staging-functions-expand` est la preuve distante ; le
manifeste local `.deploy/` n'autorise jamais `contract`.

Avant la première mutation, `expand` écrit un snapshot ignoré dans
`.deploy/rollback-before-<sha8>-<horodatage>/` : manifeste, archives source
des Functions, versions Hosting app/admin et ruleset actif. Il refuse si les
anciennes générations du bucket source Functions ne sont pas conservées. La
procédure de restauration ciblée est dans
[STAGING_ROLLBACK.md](STAGING_ROLLBACK.md). Conserver ce dossier hors Git.

Après `expand`, réaliser les deux parcours sur staging. Créer
`.deploy/recette-<sha8>.json` avec les ID des propositions réellement créées :

```json
{"saleProposalId":"ID_PROPOSITION_VENTE","exchangeProposalId":"ID_PROPOSITION_ECHANGE"}
```

`contract` relit lui-même les propositions, livraisons et écritures `ledger`
staging. Leur création et achèvement doivent être postérieurs à
`proof.writtenAt`, l'horodatage serveur de la preuve `expand`. La vente doit
être `completed`/`delivered`, en GHS, avec un paiement médicament cohérent
et un paiement du livreur. L'échange doit l'être aussi, avec le contrat de
stock transitoire version 1, les deux réceptions physiques
(`received_pending`), le retour final et les deux frais retenus qui
s'additionnent au paiement du livreur en GHS. Les ID seuls ne suffisent pas.

Les clés staging passent par `--dart-define` (jamais committées ; config via
`firebase apps:sdkconfig web`). `USE_STAGING` est géré dans `pharmapp_unified/lib/main.dart`,
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

## 5b. Validation manuelle via l'UI (full test)

Prérequis posés sur staging (2026-05-21) pour une validation hands-on :

- **Sandbox activé** : `SANDBOX_ENABLED=true` (via `functions/.env.mediexchange-staging`,
  gitignored ; appliqué aux callables `sandboxCredit/Debit/AdvanceWithdrawal/SubscriptionSuccess`).
  → le crédit wallet in-app fonctionne **uniquement pour les comptes `*@promoshake.net`**.
- **Super admin** : compte `admins/{uid}` role super_admin, scopes GH+CM.
  Identifiant et mot de passe détenus **hors dépôt** par le responsable
  staging ; le mot de passe est chiffré DPAPI (utilisateur Windows courant)
  dans un dossier de son profil réservé à son seul compte, jamais dans
  `functions/.demo-backups/` ni dans `.deploy/`. Les demander au responsable staging ; ne jamais les faire
  transiter par Git ou une messagerie, ni les recopier dans un document, un
  script ou un log. L'ancien mot de passe, public dans l'historique Git depuis
  le commit `497af377` (2026-05-21), est refusé par staging ; le mot de passe
  du compte a été réinitialisé le 2026-09-26.
- **Emails de test** : utiliser `*@promoshake.net` pour toute pharmacie test
  (sinon le crédit wallet est refusé : `NOT_TEST_ACCOUNT`).

Parcours de validation (mappé sur les 8 scénarios) :

1. **S1/S2 — Inscription** : sur l'app, inscrire une pharmacie Ghana
   (`*@promoshake.net`, ville Accra). Sans licence → re-prompt `LICENSE_REQUIRED`.
   Avec licence `GH-1234` → compte créé `pending_verification`.
2. **S3 — Verify** : sur l'admin (compte super admin ci-dessus), "License Reviews" →
   verify → la pharmacie passe `verified` + trial démarre.
3. **S4 — Purchase** : 2e pharmacie Accra, ajouter de l'inventaire, créditer le
   wallet via SandboxTestingScreen, créer une medicine request, faire une offre
   depuis l'autre compte, accepter.
4. **S5 — Exchange** : request en mode exchange, offre barter, accept via le
   picker d'inventaire.
5. **S8 — Withdrawal** : depuis un wallet crédité, créer un retrait MTN GH
   (MSISDN `+23324xxxxxxx`).

Bugs cosmétiques connus (non bloquants, voir CLAUDE.md backlog) :
- **TD-REGISTRATION-POST-SUCCESS-UX** : un snackbar "Registration failed" peut
  s'afficher MÊME quand l'inscription réussit (vérifier le doc pharmacie créé).
- **TD-WALLET-CURRENCY-SERVER-SIDE** : un wallet Ghana peut naître en `XAF` si
  le client n'envoie pas `currency` (cosmétique ; corrigeable côté data).

### 5c. Boutons démo delivery (pilotés par le testeur / démoer)

L'écran **Exchange Status** (ouvert depuis une proposal `accepted`) affiche
un panneau **"Demo actions (staging only)"** qui remplace le vrai flow
courier — car il n'y a pas de courier en staging. Ce panneau tree-shake
complètement en build prod (guard `kUseStaging` du fichier partagé
`shared/lib/config/build_flags.dart`).

Boutons visibles selon le statut de la delivery :

| Status | Bouton | Callable appelée | Effet |
|---|---|---|---|
| `pending` | **Pickup** | `sandboxDeliveryAdvance` (action=pickup) | status → `picked_up`, courierId = caller uid, dans une transaction Firestore |
| `picked_up` / `in_transit` | **Delivered** | `completeExchangeDelivery` (avec bypass sandbox) | Settlement complet — crédit wallet seller (montant TOTAL, pas de coupe courier), transfert inventaire, en une transaction Firestore |
| `delivered` | (rien) | — | Fin du flow, la démo est terminée |
| `failed` / `cancelled` | **Reset delivery** | `sandboxDeliveryAdvance` (action=reset) | status → `pending`, courierId + pickedUpAt effacés dans une transaction (relecture atomique → refuse si un settlement concurrent a atteint `delivered`) |

Points importants pour le testeur :
- L'utilisateur qui clique DOIT être connecté avec l'email `*@promoshake.net`
  ET l'une des deux pharmacies du deal (buyer OU seller). Le backend refuse
  autrement avec `permission-denied`.
- Le bouton **Delivered** **court-circuite le courier fee** (pas de courier
  réel à payer) : le vendeur reçoit le montant TOTAL du deal, aucun débit
  `halfBuyer` n'est appliqué, aucun crédit courier n'est émis. La balance
  de la transaction reste équilibrée. Le gate d'activation ne dépend PAS
  de `courierId` (round-4 fix P0#1) : peu importe si le bouton Pickup a été
  cliqué avant, la sandbox math s'applique dès que l'appelant est bien un
  compte `@promoshake.net` et une pharmacie du deal.
- La delivery card se rafraîchit en temps réel (StreamBuilder Firestore)
  — pas besoin de refresh manuel entre deux clics.
- **Reset** est réservé aux statuts `failed` et `cancelled`. Tout autre
  statut (dont `delivered`, `picked_up`, `in_transit`, `pending`, inconnu)
  est refusé avec `failed-precondition`. La vérification est atomique
  dans une transaction Firestore : un settlement concurrent qui atteint
  `delivered` pendant la préparation d'un reset est observé à la relecture
  et empêche l'écriture — plus de risque de double settlement (P0#2).
- **Défense en profondeur (allowlist projet)** : la variable
  `SANDBOX_ENABLED` n'existe QUE dans `functions/.env.mediexchange-staging`
  (gitignored). En complément, `assertSandboxAllowedForProject()` refuse
  le chargement des modules demo à moins que le runtime soit :
  l'émulateur Cloud Functions (`FUNCTIONS_EMULATOR=true`), ou un projet
  listé dans `SANDBOX_ALLOWED_PROJECT_IDS` (aujourd'hui :
  `mediexchange-staging` uniquement, cf. `functions/src/lib/sandboxGate.ts`).
  Tout autre project id — prod (`mediexchange`), inconnu, ou absent —
  fait crasher le module au boot. Élargir l'allowlist doit rester une
  modification explicite en PR, pas un effet de bord.

## 6. Garde-fous

- Build **prod** = aucun flag `USE_STAGING`/`USE_EMULATOR` → pointe `mediexchange`.
- `seedStaging.mjs` refuse tout projet ne finissant pas par `-staging`.
- Secrets paiement : staging a des valeurs **dummy** ; ne jamais y copier les
  secrets prod (les webhooks paiement ne sont pas exercés sur staging).
- Coût staging : Blaze, conso quasi nulle ; supprimable si non utilisé
  (`gcloud projects delete mediexchange-staging`).
