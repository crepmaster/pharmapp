# PharmApp Review Checklist

*Dernière mise à jour : 2025-10-20*

> Checklist complète pour l'agent Reviewer. Cocher les items pertinents selon le type de code reviewé.

## 🔒 Sécurité (TOUJOURS vérifier)

### Authentification & Authorization
- [ ] Pas de secrets (API keys, tokens) en dur dans le code
- [ ] Variables d'environnement utilisées pour les credentials
- [ ] Firestore Security Rules restrictives (pas de write client sur collections sensibles)
- [ ] Validation des tokens pour les webhooks (MTN, Orange, etc.)

### Data Protection
- [ ] Pas de PII (personally identifiable information) dans les logs
- [ ] Validation stricte des inputs utilisateur
- [ ] Sanitization des données avant stockage
- [ ] Pas d'exposition de stack traces en production

### Firebase Security
- [ ] Collections `payments`, `wallets`, `webhook_logs`, `ledger`, `exchanges`, `idempotency` ne sont pas writables par les clients
- [ ] Auth rules: les utilisateurs ne peuvent lire que leurs propres données
- [ ] Pas de `allow write: if request.auth != null` trop permissif

## 💳 Paiements Mobile Money

### Webhooks
- [ ] Validation du token AVANT tout traitement
- [ ] Header `x-callback-token` vérifié contre env variable
- [ ] Return 401 si token invalide
- [ ] Log de sécurité si tentative non autorisée

### Idempotence
- [ ] Provider transaction ID utilisé comme clé d'idempotence
- [ ] Check de doublon AVANT traitement
- [ ] Création de l'entrée `idempotency` AVANT traitement
- [ ] Return 200 si déjà traité (pour éviter retry du provider)
- [ ] Format clé: `${provider}_${providerTxId}`

### Transaction Integrity
- [ ] Mise à jour wallet wrappée dans Firebase transaction
- [ ] Vérification fonds suffisants DANS la transaction
- [ ] Utilisation de `FieldValue.increment()` (pas de read-then-write)
- [ ] Atomicité garantie (soit tout réussit, soit rien)

### Logging
- [ ] Webhook payload logged dans `webhook_logs` avec TTL 30 jours
- [ ] Provider, event, providerTxId, timestamp inclus
- [ ] Logs structurés (JSON) avec contexte suffisant

### Status Handling
- [ ] Gestion de `SUCCESSFUL` / `FAILED` / autres statuts provider
- [ ] Mise à jour correcte du payment intent
- [ ] Gestion des cas d'erreur (timeout, rejected, etc.)

## 🔄 Exchange P2P System

### Exchange Hold
- [ ] Split 50/50 des frais coursier entre seller et buyer
- [ ] Vérification fonds suffisants pour les deux parties
- [ ] Atomic: bloquer seller + bloquer buyer + créer exchange
- [ ] Fields: `sellerHold`, `buyerHold`, `courierFee`, `status`, `expiresAt`
- [ ] Expiration à 6 heures (timestamp correct)
- [ ] Ledger entries créées pour traçabilité

### Exchange Capture
- [ ] Vérification status `hold_active` AVANT capture
- [ ] Retrait des fonds held des participants
- [ ] Crédit du coursier avec le total des frais
- [ ] Mise à jour status vers `completed`
- [ ] Ledger entry pour le coursier

### Exchange Cancel
- [ ] Vérification status `hold_active` AVANT cancel
- [ ] Retour des fonds (held → available) pour seller ET buyer
- [ ] Mise à jour status vers `canceled`
- [ ] Ledger entries pour les deux participants

### Scheduled Expiry
- [ ] Job cron configuré pour `every 6 hours`
- [ ] Timezone `Africa/Douala`
- [ ] Query avec where + limit (pagination)
- [ ] Transaction pour chaque exchange expiré
- [ ] Error handling (un échec n'arrête pas les autres)

## 🏗️ Architecture & Code Quality

### TypeScript
- [ ] Types explicites (pas de `any`)
- [ ] Interfaces définies pour les structures de données
- [ ] Types union pour les valeurs limitées (status, provider, etc.)
- [ ] Return types explicites sur les fonctions

### Error Handling
- [ ] Try/catch sur toutes les opérations async critiques
- [ ] Erreurs loggées avec contexte (userId, amount, etc.)
- [ ] Messages d'erreur user-friendly (pas de stack traces)
- [ ] HttpsError avec codes appropriés (invalid-argument, failed-precondition, etc.)
- [ ] Return status codes appropriés (200, 400, 401, 500)

### Validation
- [ ] Tous les inputs utilisateur validés (présence + type + format)
- [ ] Montants: vérifier positifs
- [ ] IDs: vérifier non vides et format correct
- [ ] Phone: vérifier format (9 chiffres)
- [ ] Email: vérifier format valide

### Transactions Firestore
- [ ] Opérations wallet TOUJOURS dans `runTransaction()`
- [ ] Opérations exchange TOUJOURS dans `runTransaction()`
- [ ] Get documents DANS la transaction (pas avant)
- [ ] Vérifications (exists, balance) DANS la transaction

### Logging
- [ ] Logs structurés avec JSON ou objets
- [ ] Contexte suffisant (userId, amount, provider, etc.)
- [ ] Prefixes clairs: `[PAYMENT]`, `[WALLET]`, `[EXCHANGE]`, `[SECURITY]`
- [ ] Pas de données sensibles (API keys, tokens, full phone numbers)
- [ ] Séparation logs info vs error

## 📱 Flutter Frontend

### State Management
- [ ] Variables d'état claires (`_isLoading`, `_errorMessage`)
- [ ] `setState()` appelé avant et après opérations async
- [ ] Check `mounted` avant `setState()` dans finally
- [ ] États de chargement gérés (CircularProgressIndicator)

### Error Handling
- [ ] Try/catch sur toutes les opérations Firebase
- [ ] Messages d'erreur user-friendly
- [ ] `FirebaseAuthException` catchée séparément
- [ ] Switch sur `e.code` pour messages personnalisés
- [ ] SnackBar ou AlertDialog pour afficher les erreurs

### Firebase Integration
- [ ] StreamBuilder pour real-time updates
- [ ] Gestion des états: `hasError`, `waiting`, `hasData`, `!exists`
- [ ] Subscription cleanup dans `dispose()`
- [ ] Pas de lecture Firestore dans build() (utiliser StreamBuilder)

### Navigation
- [ ] Navigation après succès complet (pas au milieu)
- [ ] `pushReplacement` pour remplacer (login → home)
- [ ] `push` pour ajouter (home → detail)
- [ ] Routes nommées utilisées

### UI/UX
- [ ] Loading indicators visibles
- [ ] Messages d'erreur clairs
- [ ] Boutons disabled pendant loading
- [ ] Responsive design (Column + Expanded si nécessaire)

## 🔥 Firebase Best Practices

### Firestore Operations
- [ ] `FieldValue.serverTimestamp()` pour timestamps
- [ ] `FieldValue.increment()` pour compteurs
- [ ] Pas de `new Date()` ou `Date.now()` (manipulation possible)
- [ ] Collections en pluriel et snake_case
- [ ] Document IDs générés par Firestore (`.doc()`) sauf si spécifique

### Queries
- [ ] Indexes composites créés si nécessaire
- [ ] `.limit()` utilisé pour pagination
- [ ] `.orderBy()` avant `.startAfter()` pour pagination
- [ ] Pas de `.get()` sur toute une collection sans limit

### Batch Operations
- [ ] Batch writes pour modifications multiples
- [ ] Transaction pour operations liées (wallet + ledger)
- [ ] Limite de 500 operations par batch

## ⏰ Scheduled Functions

### Configuration
- [ ] Schedule correct (cron syntax ou every X hours)
- [ ] Timezone spécifiée (`Africa/Douala`)
- [ ] Retry config appropriée (retryCount, minBackoffSeconds)
- [ ] Timeout suffisant (timeoutSeconds)

### Implementation
- [ ] Pagination (limit sur queries)
- [ ] Error handling par item (loop continue si un échec)
- [ ] Logging détaillé (start, count, finish)
- [ ] Idempotence (peut être relancé sans effet de bord)

## 📊 Performance

### Queries
- [ ] Indexes créés pour queries composites
- [ ] Pagination implémentée pour listes longues
- [ ] Pas de query full collection scan

### Functions
- [ ] Timeout approprié (défaut 60s, peut aller à 540s)
- [ ] Memory appropriée (default 256MB, augmenter si nécessaire)
- [ ] Cold start minimisé (imports optimisés)

### Batch Operations
- [ ] Batch writes plutôt que boucle d'updates
- [ ] Parallélisation avec Promise.all() quand possible
- [ ] Limite de batch respectée (500 operations)

## 🧪 Testing

### Test Coverage
- [ ] Cas nominaux testés
- [ ] Cas d'erreur testés (fonds insuffisants, wallet inexistant, etc.)
- [ ] Edge cases testés (montant 0, IDs invalides, etc.)

### Test Data
- [ ] Utilisation de test accounts (09092025@promoshake.net)
- [ ] Pas de tests en production
- [ ] Emulator utilisé pour dev/test

## 📝 Documentation

### Code Comments
- [ ] Fonctions importantes documentées (JSDoc/DartDoc)
- [ ] Décisions non évidentes expliquées
- [ ] TODOs marqués si applicable
- [ ] Références aux patterns dans `pharmapp_patterns.md`

### Commit Messages
- [ ] Message descriptif (feat/fix/refactor)
- [ ] Contexte suffisant pour comprendre le changement

## 🎨 Code Style

### Naming
- [ ] Constantes: UPPER_SNAKE_CASE
- [ ] Variables: camelCase
- [ ] Classes: PascalCase
- [ ] Fichiers: snake_case
- [ ] Noms descriptifs (pas de `x`, `temp`, `data`)

### Structure
- [ ] Imports groupés et organisés
- [ ] Fonctions courtes (<50 lignes idéalement)
- [ ] Pas de code dupliqué (DRY)
- [ ] Séparation des concerns (business logic séparée de I/O)

## ✅ Checklist Finale

Avant de soumettre la review, vérifier:

- [ ] Tous les items CRITIQUES (Sécurité, Paiements) sont cochés
- [ ] Items importants pour le type de code sont cochés
- [ ] Au moins 3 items par catégorie majeure
- [ ] Aucune faille de sécurité majeure
- [ ] Aucune opération wallet/exchange sans transaction
- [ ] Documentation suffisante

---

## 📊 Scoring Suggestions

**CRITIQUE (❌ Blocker)** : Sécurité, Webhooks, Transactions
**IMPORTANT (⚠️ Must fix)** : Validation, Error handling, Logging
**MINEURE (💡 Should fix)** : Code style, Documentation, Performance

**Threshold pour Approval** :
- 0 CRITIQUE
- <3 IMPORTANT
- MINEURE: acceptable sans limite

---

**Note**: Cette checklist évolue. Si un nouveau pattern ou erreur récurrente émerge, mettre à jour cette checklist ET `common_mistakes.md`.
