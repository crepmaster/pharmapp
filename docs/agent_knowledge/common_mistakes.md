# Common Mistakes PharmApp - Base de Connaissance

*Dernière mise à jour : 2025-10-20*

> Ce fichier documente les erreurs récurrentes détectées dans le projet. Il est mis à jour automatiquement par l'agent Reviewer après chaque review.

## 📊 Statistiques

- **Total erreurs documentées** : 1
- **Erreurs critiques** : 0
- **Erreurs récurrentes (>2 fois)** : 0

---

## 🎯 Type Safety

### Erreur : Utilisation de méthodes String sur des enums
**Fréquence** : 🔴 NOUVELLE (1ère détection)
**Première détection** : 2025-10-20 dans pharmacy_app/lib/services/auth_service.dart ligne 102
**Sévérité** : 🟡 IMPORTANTE

**Problème** :
Les enums Dart n'ont pas de méthodes de String comme `.isNotEmpty`. Tenter d'utiliser ces méthodes sur un enum cause une erreur de compilation. Les enums doivent être vérifiés avec `!= null` et convertis en string avec `.name` pour la sérialisation.

**Mauvais pattern** :
```dart
// ❌ Erreur de compilation
if (paymentPreferences.country.isNotEmpty) 'country': paymentPreferences.country,
// Country est un enum, pas une String
```

**Bon pattern** :
```dart
// ✅ Correct - Check null et conversion .name
if (paymentPreferences.country != null) 'country': paymentPreferences.country!.name,
// Vérifie null, puis convertit l'enum en string avec .name
```

**Analyse détaillée** :
1. `paymentPreferences.country` est de type `Country?` (enum nullable)
2. Les enums n'ont PAS de méthode `.isNotEmpty` (c'est pour String/List/Map)
3. La vérification correcte pour un enum nullable est `!= null`
4. La conversion enum → string se fait avec `.name` (propriété standard Dart)
5. Le non-null assertion `!` est sûr après avoir vérifié `!= null`

**Checklist prévention** :
- [ ] Toujours vérifier le type avant d'utiliser des méthodes
- [ ] Enums nullable : utiliser `!= null`, pas `.isNotEmpty`
- [ ] Pour sérialiser un enum : utiliser `.name` ou `.toString()`
- [ ] Utiliser l'IDE pour auto-complétion (évite les méthodes incorrectes)
- [ ] Activer Dart analyzer (détecte ces erreurs à la compilation)

**Impact** :
- Erreur de compilation (bloque le build)
- Empêche le test et le déploiement
- Facile à détecter (compile-time, pas runtime)

**Détecté dans** :
- 2025-10-20 - pharmacy_app/lib/services/auth_service.dart ligne 102 - Vérification country dans signUpWithPaymentPreferences

**Note** : Cette erreur est attrapée par le compilateur Dart, ce qui est une bonne chose. Elle démontre que le système de types fonctionne correctement et empêche les bugs runtime.

---

## 🔐 Webhook Security

### Erreur : Oubli de validation des tokens webhooks
**Fréquence** : 🔴 TEMPLATE - À DOCUMENTER
**Première détection** : [Date] dans [fichier]
**Sévérité** : ⚠️ CRITIQUE

**Problème** :
Les webhooks (MTN, Orange, etc.) doivent TOUJOURS valider le token d'authentification avant de traiter le payload. Sans cette validation, n'importe qui peut envoyer des webhooks et créer de faux paiements.

**Mauvais pattern** :
```typescript
export const orangeWebhook = onRequest(async (req, res) => {
  const body = req.body;
  // ❌ Traitement direct sans validation
  await processPayment(body);
});
```

**Bon pattern** :
```typescript
export const orangeWebhook = onRequest(async (req, res) => {
  // ✅ Validation du token en PREMIER
  const receivedToken = req.headers['x-callback-token'];
  if (receivedToken !== process.env.ORANGE_CALLBACK_TOKEN) {
    console.error('[SECURITY] Invalid Orange webhook token');
    return res.status(401).send('Unauthorized');
  }
  
  const body = req.body;
  // Traitement sécurisé
  await processPayment(body);
});
```

**Checklist prévention** :
- [ ] Validation du token en premier (avant toute logique)
- [ ] Log de sécurité si token invalide
- [ ] Return 401 Unauthorized si non autorisé
- [ ] Utiliser process.env pour le token attendu

**Impact** :
- Faille de sécurité majeure
- Possibilité de créer de faux paiements
- Manipulation des wallets utilisateurs

**Détecté dans** :
- [À compléter lors de la première détection]

---

## 💰 Idempotency

### Erreur : Absence de vérification d'idempotence
**Fréquence** : 🔴 TEMPLATE - À DOCUMENTER
**Première détection** : [Date] dans [fichier]
**Sévérité** : ⚠️ CRITIQUE

**Problème** :
Les webhooks peuvent être envoyés plusieurs fois par le provider (retry en cas de timeout). Sans idempotence, un même paiement peut être crédité plusieurs fois.

**Mauvais pattern** :
```typescript
export const momoWebhook = onRequest(async (req, res) => {
  // ❌ Pas de check de doublon
  const userId = req.body.userId;
  const amount = req.body.amount;
  
  await creditWallet(userId, amount);
  return res.status(200).send('OK');
});
```

**Bon pattern** :
```typescript
export const momoWebhook = onRequest(async (req, res) => {
  const providerTxId = req.body.financialTransactionId;
  const idempotencyKey = `mtn_${providerTxId}`;
  
  // ✅ Vérifier si déjà traité
  const idempotencyRef = admin.firestore()
    .collection('idempotency')
    .doc(idempotencyKey);
  
  const idempotencyDoc = await idempotencyRef.get();
  
  if (idempotencyDoc.exists) {
    console.log('[IDEMPOTENCY] Already processed:', idempotencyKey);
    return res.status(200).send('OK');
  }
  
  // Marquer comme traité AVANT le traitement
  await idempotencyRef.set({
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
    provider: 'MTN',
    status: 'processing'
  });
  
  // Traiter le paiement
  await creditWallet(userId, amount);
  
  return res.status(200).send('OK');
});
```

**Checklist prévention** :
- [ ] Utiliser le provider transaction ID comme clé d'idempotence
- [ ] Vérifier l'existence de la clé AVANT tout traitement
- [ ] Créer l'entrée d'idempotence AVANT de traiter
- [ ] Return 200 même si déjà traité (pour éviter retry du provider)

**Impact** :
- Doublons de paiements
- Balance utilisateur incorrecte
- Perte de confiance/argent

**Détecté dans** :
- [À compléter lors de la première détection]

---

## 🔄 Firebase Transactions

### Erreur : Opérations wallet sans transaction
**Fréquence** : 🔴 TEMPLATE - À DOCUMENTER
**Première détection** : [Date] dans [fichier]
**Sévérité** : ⚠️ CRITIQUE

**Problème** :
Les opérations sur les wallets (crédit, débit, hold) DOIVENT être wrappées dans des Firebase transactions pour éviter les race conditions et garantir la cohérence des données.

**Mauvais pattern** :
```typescript
// ❌ Race condition possible
async function debitWallet(userId: string, amount: number) {
  const walletDoc = await admin.firestore()
    .collection('wallets')
    .doc(userId)
    .get();
  
  const currentBalance = walletDoc.data()!.available;
  
  if (currentBalance >= amount) {
    await admin.firestore()
      .collection('wallets')
      .doc(userId)
      .update({
        available: currentBalance - amount
      });
  } else {
    throw new Error('Insufficient funds');
  }
}
```

**Bon pattern** :
```typescript
// ✅ Atomique et safe
async function debitWallet(userId: string, amount: number) {
  await admin.firestore().runTransaction(async (transaction) => {
    const walletRef = admin.firestore().collection('wallets').doc(userId);
    const walletDoc = await transaction.get(walletRef);
    
    if (!walletDoc.exists) {
      throw new Error('Wallet not found');
    }
    
    const currentBalance = walletDoc.data()!.available;
    
    if (currentBalance < amount) {
      throw new Error('Insufficient funds');
    }
    
    transaction.update(walletRef, {
      available: admin.firestore.FieldValue.increment(-amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
}
```

**Checklist prévention** :
- [ ] Toute opération sur `wallets` doit être dans runTransaction()
- [ ] Utiliser FieldValue.increment() pour les modifications de balance
- [ ] Vérifier l'existence du document dans la transaction
- [ ] Valider les fonds suffisants dans la transaction

**Impact** :
- Race conditions (deux débits simultanés)
- Balance négative possible
- Incohérences de données

**Détecté dans** :
- [À compléter lors de la première détection]

---

## 🎯 Validation des Entrées

### Erreur : Absence de validation des inputs
**Fréquence** : 🟡 TEMPLATE - À DOCUMENTER
**Première détection** : [Date] dans [fichier]
**Sévérité** : 🟡 IMPORTANTE

**Problème** :
Les endpoints Cloud Functions doivent TOUJOURS valider les entrées avant traitement pour éviter les erreurs et les abus.

**Mauvais pattern** :
```typescript
// ❌ Pas de validation
export const createPayment = onRequest(async (req, res) => {
  const userId = req.body.userId;
  const amount = req.body.amount;
  
  // Utilisation directe sans validation
  const payment = await processPayment(userId, amount);
  return res.status(200).json(payment);
});
```

**Bon pattern** :
```typescript
// ✅ Validation complète
export const createPayment = onRequest(async (req, res) => {
  try {
    // Validation userId
    if (!req.body.userId || typeof req.body.userId !== 'string') {
      return res.status(400).json({ error: 'Invalid userId' });
    }
    
    // Validation amount
    const amount = parseFloat(req.body.amount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    
    // Validation phone
    const phone = req.body.phone?.toString().trim();
    if (!phone || !/^\d{9}$/.test(phone)) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }
    
    const payment = await processPayment(req.body.userId, amount, phone);
    return res.status(200).json(payment);
  } catch (error) {
    console.error('Error in createPayment:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
```

**Checklist prévention** :
- [ ] Valider tous les champs requis (présence + type)
- [ ] Valider les formats (email, phone, etc.)
- [ ] Valider les ranges (montants positifs, limites, etc.)
- [ ] Return 400 avec message clair si validation échoue

**Impact** :
- Erreurs runtime
- Données invalides dans Firestore
- Expérience utilisateur dégradée

**Détecté dans** :
- [À compléter lors de la première détection]

---

## 📱 Flutter UI

### Erreur : Absence de gestion des états de chargement
**Fréquence** : 🟡 TEMPLATE - À DOCUMENTER
**Première détection** : [Date] dans [fichier]
**Sévérité** : 🟡 IMPORTANTE

**Problème** :
Les opérations asynchrones (Firebase calls, API calls) doivent afficher un indicateur de chargement pour informer l'utilisateur.

**Mauvais pattern** :
```dart
// ❌ Pas d'indicateur de chargement
Future<void> _login() async {
  try {
    await FirebaseAuth.instance.signInWithEmailAndPassword(
      email: _emailController.text,
      password: _passwordController.text
    );
    Navigator.pushReplacement(context, ...);
  } catch (e) {
    // Afficher erreur
  }
}
```

**Bon pattern** :
```dart
// ✅ Avec états de chargement
bool _isLoading = false;

Future<void> _login() async {
  setState(() => _isLoading = true);
  
  try {
    await FirebaseAuth.instance.signInWithEmailAndPassword(
      email: _emailController.text,
      password: _passwordController.text
    );
    Navigator.pushReplacement(context, ...);
  } catch (e) {
    // Afficher erreur
  } finally {
    if (mounted) {
      setState(() => _isLoading = false);
    }
  }
}

@override
Widget build(BuildContext context) {
  if (_isLoading) {
    return Center(child: CircularProgressIndicator());
  }
  
  return Form(...);
}
```

**Checklist prévention** :
- [ ] Variable `_isLoading` pour tracker l'état
- [ ] setState() avant et après l'opération async
- [ ] Afficher CircularProgressIndicator pendant le chargement
- [ ] Utiliser finally pour garantir le reset de l'état

**Impact** :
- UX dégradée (utilisateur ne sait pas si ça charge)
- Double-click possible (bouton cliqué 2x)
- Confusion utilisateur

**Détecté dans** :
- [À compléter lors de la première détection]

---

## 🎨 Code Style

### Erreur : Utilisation de `any` en TypeScript
**Fréquence** : 💡 TEMPLATE - À DOCUMENTER
**Première détection** : [Date] dans [fichier]
**Sévérité** : 💡 MINEURE

**Problème** :
L'utilisation de `any` désactive les vérifications TypeScript et rend le code moins sûr.

**Mauvais pattern** :
```typescript
// ❌ Type any
function processData(data: any): any {
  return data.userId;
}
```

**Bon pattern** :
```typescript
// ✅ Types explicites
interface PaymentData {
  userId: string;
  amount: number;
  phone: string;
}

function processData(data: PaymentData): string {
  return data.userId;
}
```

**Checklist prévention** :
- [ ] Définir des interfaces pour les structures de données
- [ ] Utiliser des types union pour les valeurs limitées
- [ ] Préférer `unknown` à `any` si le type est vraiment inconnu
- [ ] Activer `strict` mode dans tsconfig.json

**Impact** :
- Perte des bénéfices de TypeScript
- Erreurs non détectées à la compilation
- Maintenance difficile

**Détecté dans** :
- [À compléter lors de la première détection]

---

## 📝 Instructions pour Mise à Jour

### Pour l'Agent Reviewer

Quand vous détectez une erreur récurrente ou nouvelle :

1. **Déterminer la catégorie** (Sécurité, Validation, Performance, etc.)
2. **Créer une nouvelle section** si l'erreur n'existe pas encore
3. **Mettre à jour la fréquence** si l'erreur existe déjà
4. **Ajouter dans "Détecté dans"** avec date et fichier
5. **Mettre à jour les statistiques** en haut du fichier

### Template pour Nouvelle Erreur

```markdown
## [Catégorie]

### Erreur : [Titre descriptif]
**Fréquence** : [🔴 NOUVELLE / 🟠 RÉCURRENTE (X fois) / 🟡 OCCASIONNELLE]
**Première détection** : [Date] dans [fichier] ligne [X]
**Dernière détection** : [Date] dans [fichier] ligne [X]
**Sévérité** : [⚠️ CRITIQUE / 🟡 IMPORTANTE / 💡 MINEURE]

**Problème** :
[Description claire du problème]

**Mauvais pattern** :
```[langage]
[Code incorrect]
```

**Bon pattern** :
```[langage]
[Code correct]
```

**Checklist prévention** :
- [ ] [Action 1]
- [ ] [Action 2]

**Impact** :
- [Conséquence 1]
- [Conséquence 2]

**Détecté dans** :
- [Date] - [fichier] ligne [X] - [contexte]
```

---

**Note** : Ce fichier est vivant et doit être enrichi continuellement. Chaque erreur documentée ici permet d'améliorer la qualité du code futur.
