# Common Mistakes PharmApp - Base de Connaissance

*Dernière mise à jour : 2025-10-24*

> Ce fichier documente les erreurs récurrentes détectées dans le projet. Il est mis à jour automatiquement par l'agent Reviewer après chaque review.

## 📊 Statistiques

- **Total erreurs documentées** : 3
- **Erreurs critiques** : 2
- **Erreurs récurrentes (>2 fois)** : 0

---

## 🎭 BLoC State Management

### Erreur : Gestion incomplète des états BLoC (CRITICAL)
**Fréquence** : 🔴 RÉCURRENTE (Détectée 2025-10-24)
**Première détection** : 2025-10-24 dans pharmapp_unified/lib/screens/auth/unified_login_screen.dart lignes 40-62
**Sévérité** : ⚠️ CRITIQUE

**Problème** :
**BEST PRACTICE FONDAMENTALE**: Lorsqu'un BlocListener ou BlocConsumer écoute un état asynchrone (authentication, payment, etc.), il DOIT TOUJOURS gérer à la fois:
- ✅ Le cas de SUCCÈS (ex: `Authenticated`)
- ✅ Le cas d'ÉCHEC (ex: `AuthError`)

Ne gérer que le cas d'erreur et ignorer le succès crée des situations où l'utilisateur se retrouve bloqué après une opération réussie.

**Mauvais pattern** :
```dart
// ❌ NE GÈRE QUE LES ERREURS - L'utilisateur reste bloqué après succès
body: BlocConsumer<UnifiedAuthBloc, UnifiedAuthState>(
  listener: (context, state) {
    if (state is AuthError) {
      // Affiche erreur
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(state.error), backgroundColor: Colors.red),
      );
    }
    // ❌ MANQUE: Que faire si state is Authenticated ???
  },
  builder: (context, state) { /* ... */ },
)
```

**Bon pattern** :
```dart
// ✅ GÈRE SUCCÈS ET ÉCHEC - Navigation complète
body: BlocConsumer<UnifiedAuthBloc, UnifiedAuthState>(
  listener: (context, state) {
    if (state is Authenticated) {
      // ✅ Cas de SUCCÈS: Navigation vers dashboard
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(
          builder: (_) => RoleRouter(
            userType: state.userType,
            userData: state.userData,
          ),
        ),
        (route) => false, // Clear navigation stack
      );
    } else if (state is AuthError) {
      // ✅ Cas d'ÉCHEC: Affichage erreur
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(state.error), backgroundColor: Colors.red),
      );
    }
    // ✅ COMPLET: Les deux cas sont gérés
  },
  builder: (context, state) { /* ... */ },
)
```

**Analyse détaillée** :
1. Un BLoC émet différents états selon le résultat d'une opération asynchrone
2. Le listener doit prévoir TOUS les états possibles, pas seulement les erreurs
3. Pattern à vérifier systématiquement : `if (state is SuccessState) {} else if (state is ErrorState) {}`
4. Ignorer l'état de succès = UX cassée (utilisateur bloqué sans feedback)
5. Vérifier la cohérence entre screens similaires (login vs registration)

**Checklist prévention** :
- [ ] **TOUJOURS** gérer les cas de succès ET d'échec dans BlocListener/BlocConsumer
- [ ] Vérifier que CHAQUE écran d'authentification gère `Authenticated` state
- [ ] Vérifier que CHAQUE écran d'authentification gère `AuthError` state
- [ ] Vérifier que CHAQUE écran de paiement gère `PaymentSuccess` ET `PaymentError`
- [ ] Pattern systématique : `if (success) {} else if (error) {}`
- [ ] Vérifier la consistance entre screens similaires (login, registration, password reset)

**Impact** :
- **UX catastrophique**: Utilisateur bloqué après succès sans feedback
- **Bug critique**: Fonctionnalité complètement cassée
- **Détection**: Tests manuels nécessaires (pas détecté par compilateur)
- **Correction**: Simple (ajouter le cas de succès) mais critique

**Détecté dans** :
- **2025-10-24** - `pharmapp_unified/lib/screens/auth/unified_login_screen.dart` lignes 40-48
  - Contexte: Login screen ne gérait que `AuthError`, pas `Authenticated`
  - Conséquence: Utilisateurs authentifiés restaient bloqués sur l'écran de login
  - Fix: Ajout de navigation explicite dans le cas `Authenticated`
  - Commit: "🔧 FIX: Login navigation - Add Authenticated state handling"

**Note critique** : Cette erreur n'a pas été détectée par le code reviewer lors de la première review du fichier registration. Le reviewer doit maintenant SYSTÉMATIQUEMENT vérifier ce pattern grâce à cette documentation et à la checklist mise à jour.

---

### Erreur : Double navigation sur même état BLoC (CRITICAL - REGRESSION)
**Fréquence** : 🔴 RÉCURRENTE (Détectée 2025-10-25)
**Première détection** : 2025-10-25 dans pharmapp_unified/lib/screens/auth/unified_login_screen.dart lignes 41-53
**Sévérité** : ⚠️ CRITIQUE

**Problème** :
**ARCHITECTURE FONDAMENTALE**: Dans une application Flutter avec BLoC, il ne doit exister QU'UN SEUL point de navigation pour chaque état.

Lorsque DEUX BlocListeners/BlocBuilders tentent de naviguer sur le même état (ex: `Authenticated`), cela crée une **race condition** où:
1. Le premier listener déclenche la navigation
2. Le second listener tente aussi de naviguer
3. Le widget est déjà en cours de navigation = **conflit**
4. Résultat: Navigation bloquée, utilisateur coincé sur l'écran

**Mauvais pattern (DOUBLE NAVIGATION)** :
```dart
// ❌ FICHIER 1: main.dart
home: BlocBuilder<UnifiedAuthBloc, UnifiedAuthState>(
  builder: (context, state) {
    if (state is Authenticated) {
      // ❌ PREMIÈRE navigation
      return RoleRouter(userType: state.userType, userData: state.userData);
    }
    return const AppSelectionScreen();
  },
)

// ❌ FICHIER 2: unified_login_screen.dart
body: BlocConsumer<UnifiedAuthBloc, UnifiedAuthState>(
  listener: (context, state) {
    if (state is Authenticated) {
      // ❌ DEUXIÈME navigation (CONFLIT!)
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => RoleRouter(...)),
        (route) => false,
      );
    }
  },
```

**Résultat catastrophique**:
- User logs in successfully
- Both main.dart AND unified_login_screen.dart try to navigate
- Navigation conflict: user stuck on login screen
- User must press back button to see they're actually logged in
- **UX COMPLÈTEMENT CASSÉE**

**Bon pattern (NAVIGATION CENTRALISÉE)** :
```dart
// ✅ FICHIER 1: main.dart (SEUL POINT DE NAVIGATION)
home: BlocBuilder<UnifiedAuthBloc, UnifiedAuthState>(
  builder: (context, state) {
    if (state is Authenticated) {
      // ✅ Navigation CENTRALISÉE dans main.dart
      return RoleRouter(userType: state.userType, userData: state.userData);
    }
    return const AppSelectionScreen();
  },
)

// ✅ FICHIER 2: unified_login_screen.dart (PAS DE NAVIGATION)
body: BlocConsumer<UnifiedAuthBloc, UnifiedAuthState>(
  listener: (context, state) {
    // ✅ Seuls les EFFETS SECONDAIRES ici (erreurs, snackbars)
    // ✅ PAS DE NAVIGATION - c'est le rôle de main.dart
    if (state is AuthError) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(state.error), backgroundColor: Colors.red),
      );
    }
  },
```

**Règle d'or : UN SEUL POINT DE NAVIGATION PAR ÉTAT**

**Checklist prévention** :
- [ ] **VÉRIFIER** : main.dart a un BlocBuilder qui gère la navigation globale
- [ ] **VÉRIFIER** : Les écrans individuels (login, register) NE naviguent PAS sur Authenticated
- [ ] **RÈGLE** : Si main.dart navigue sur `Authenticated`, aucun écran ne doit le faire
- [ ] **PATTERN** : Écrans = effets secondaires (erreurs) ; main.dart = navigation
- [ ] **TEST** : Après login, vérifier que la navigation vers dashboard est automatique et immédiate
- [ ] **RÉGRESSION** : Quand on ajoute une feature, NE PAS toucher au flux d'authentification sauf si explicitement requis

**Impact** :
- **UX catastrophique**: Utilisateur coincé sur écran de login après succès
- **Bug critique**: Navigation complètement cassée
- **Régression**: Introduction du bug en ajoutant une feature non liée (sandbox testing)
- **Frustration utilisateur**: "i thought that issue was solved. why anytime we add a new feature you change something in the login process?"

**Détecté dans** :
- **2025-10-25** - Session sandbox testing screen implementation
  - **Contexte**: Ajout d'une feature sandbox SANS rapport avec authentification
  - **Erreur**: Navigation `Authenticated` ajoutée dans unified_login_screen.dart alors qu'elle existait déjà dans main.dart
  - **Symptôme**: Login réussit mais user reste coincé sur login screen, doit cliquer "back" pour voir dashboard
  - **Conséquence**: Régression critique sur fonctionnalité de base
  - **Citation utilisateur**: "you were supposed only to add the sandbox and now we have a regression"
  - **Commit de régression**: Introduction de la double navigation dans login screen
  - **Fix**: Suppression de la navigation dans unified_login_screen.dart, conservation uniquement dans main.dart
  - **Commit de fix**: Restauration à l'état du commit ff5b968 (login screen sans navigation)

**Comment éviter cette régression** :
1. **NE JAMAIS** modifier les écrans d'authentification sauf si la tâche le requiert explicitement
2. **TOUJOURS** vérifier git history avant de modifier un écran d'auth (git show HEAD:fichier.dart)
3. **VÉRIFIER** que main.dart gère déjà la navigation avant d'en ajouter dans un écran
4. **TESTER** le flow complet de login après chaque modification (même non liée)
5. **DOCUMENTER** : Si vous ajoutez une feature X, ne touchez PAS aux features A, B, C

**Apprentissage clé** :
> "Quand on ajoute une nouvelle feature (sandbox testing), on ne doit JAMAIS modifier le code d'authentification existant sauf si explicitement demandé. Cette régression est survenue en ajoutant du code de navigation dans login screen alors que la tâche était uniquement d'ajouter un écran de sandbox testing."

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
