# PharmApp Coding Guidelines

*Dernière mise à jour : 2025-10-20*

## 🎯 Principes Généraux

### Code Quality
- **Lisibilité avant optimisation** : Le code doit être compréhensible par un humain
- **DRY (Don't Repeat Yourself)** : Factoriser le code répétitif
- **KISS (Keep It Simple, Stupid)** : Privilégier les solutions simples
- **YAGNI (You Aren't Gonna Need It)** : Ne pas implémenter de fonctionnalités "au cas où"

### Documentation
- Commenter les décisions complexes, pas le code évident
- Documenter les "pourquoi", pas les "comment"
- Maintenir les commentaires à jour avec le code

## 🏗️ Architecture PharmApp

### Structure du Projet
```
pharmapp/
├── functions/              # Cloud Functions (backend)
│   ├── src/
│   │   ├── index.ts       # Endpoints HTTP
│   │   ├── scheduled.ts   # Tâches planifiées
│   │   └── lib/           # Utilitaires
│   └── package.json
├── shared/                 # Code partagé entre apps
│   └── lib/
├── pharmacy_app/           # App pharmacie (Flutter)
├── courier_app/            # App livreur (Flutter)
├── admin_panel/            # Panel admin (Flutter)
└── unified_app/            # App unifiée (Flutter)
```

### Régions et Configuration
- **Cloud Functions** : `europe-west1`
- **Timezone** : `Africa/Douala` (Cameroun)
- **Node Version** : 20 (ES Modules)
- **Firebase Project** : mediexchange

## 🔥 Firebase Best Practices

### Firestore

#### 1. Transactions OBLIGATOIRES pour Opérations Critiques
```typescript
// ✅ BON - Avec transaction
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

// ❌ MAUVAIS - Sans transaction (race condition possible)
const walletDoc = await admin.firestore().collection('wallets').doc(userId).get();
const currentBalance = walletDoc.data()!.available;
if (currentBalance >= amount) {
  await admin.firestore().collection('wallets').doc(userId).update({
    available: currentBalance - amount
  });
}
```

**Quand utiliser les transactions** :
- ✅ Toute opération sur `wallets` (balance disponible/bloquée)
- ✅ Création d'`exchanges` avec hold de fonds
- ✅ Mise à jour de `payments` suite à webhook
- ✅ Toute opération impliquant plusieurs documents liés

#### 2. Utiliser FieldValue.serverTimestamp()
```typescript
// ✅ BON - Timestamp serveur
{
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp()
}

// ❌ MAUVAIS - Timestamp client (peut être manipulé)
{
  createdAt: new Date(),
  updatedAt: Date.now()
}
```

#### 3. FieldValue.increment() pour Compteurs
```typescript
// ✅ BON - Atomic increment
transaction.update(walletRef, {
  available: admin.firestore.FieldValue.increment(amount)
});

// ❌ MAUVAIS - Race condition
const current = doc.data()!.available;
transaction.update(walletRef, {
  available: current + amount
});
```

#### 4. Nommage des Collections
- **Pluriel** : `wallets`, `payments`, `exchanges`
- **Snake_case** : `webhook_logs`, `idempotency_keys`
- **Pas de majuscules** dans les noms de collections

### Cloud Functions

#### 1. Gestion des Erreurs
```typescript
// ✅ BON - Gestion complète des erreurs
export const myFunction = onRequest(async (req, res) => {
  try {
    // Validation input
    if (!req.body.userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }
    
    // Logique métier
    const result = await processUser(req.body.userId);
    
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('Error in myFunction:', error);
    
    // Ne pas exposer les détails techniques en production
    return res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ❌ MAUVAIS - Pas de gestion d'erreur
export const myFunction = onRequest(async (req, res) => {
  const result = await processUser(req.body.userId); // Peut crasher
  return res.status(200).json(result);
});
```

#### 2. Validation des Entrées
```typescript
// ✅ BON - Validation stricte
function validatePaymentIntent(data: any): PaymentIntent {
  if (!data.userId || typeof data.userId !== 'string') {
    throw new Error('Invalid userId');
  }
  if (!data.amount || typeof data.amount !== 'number' || data.amount <= 0) {
    throw new Error('Invalid amount');
  }
  if (!data.phone || !/^\d{9}$/.test(data.phone)) {
    throw new Error('Invalid phone number');
  }
  
  return {
    userId: data.userId,
    amount: data.amount,
    phone: data.phone
  };
}

// ❌ MAUVAIS - Pas de validation
function processPayment(data: any) {
  // Utilisation directe sans validation
  return createPayment(data.userId, data.amount);
}
```

#### 3. Logging Approprié
```typescript
// ✅ BON - Logs structurés
console.log('[PAYMENT] Processing payment', {
  userId: userId,
  amount: amount,
  provider: 'MTN',
  timestamp: new Date().toISOString()
});

console.error('[PAYMENT_ERROR] Payment failed', {
  userId: userId,
  error: error.message,
  stack: error.stack
});

// ❌ MAUVAIS - Logs non structurés
console.log('processing payment for user ' + userId);
console.log(error); // Objet complet, pas lisible
```

#### 4. Timeout et Retry
```typescript
// ✅ BON - Configuration timeout
export const longRunningTask = onRequest({
  timeoutSeconds: 300, // 5 minutes
  memory: '512MB'
}, async (req, res) => {
  // ...
});

// Pour tâches planifiées
export const scheduledTask = onSchedule({
  schedule: 'every 6 hours',
  timeZone: 'Africa/Douala',
  retryConfig: {
    retryCount: 3,
    minBackoffSeconds: 60
  }
}, async (context) => {
  // ...
});
```

## 💳 Paiements Mobile Money

### Webhook Security

#### 1. TOUJOURS Valider le Token en Premier
```typescript
// ✅ BON - Validation immédiate
export const momoWebhook = onRequest(async (req, res) => {
  const receivedToken = req.headers['x-callback-token'];
  
  if (receivedToken !== process.env.MOMO_CALLBACK_TOKEN) {
    console.error('[SECURITY] Invalid MTN webhook token');
    return res.status(401).send('Unauthorized');
  }
  
  // Reste de la logique...
});

// ❌ MAUVAIS - Validation après traitement
export const momoWebhook = onRequest(async (req, res) => {
  const body = req.body;
  await processPayment(body); // DANGEREUX
  
  if (req.headers['x-callback-token'] !== process.env.MOMO_CALLBACK_TOKEN) {
    return res.status(401).send('Unauthorized');
  }
});
```

#### 2. Idempotence avec Provider Transaction ID
```typescript
// ✅ BON - Idempotence correcte
const providerTxId = req.body.financialTransactionId; // ID MTN
const idempotencyKey = `mtn_${providerTxId}`;

const idempotencyRef = admin.firestore()
  .collection('idempotency')
  .doc(idempotencyKey);

const idempotencyDoc = await idempotencyRef.get();

if (idempotencyDoc.exists) {
  console.log('[IDEMPOTENCY] Already processed:', idempotencyKey);
  return res.status(200).send('OK'); // Déjà traité
}

// Marquer comme traité AVANT le traitement
await idempotencyRef.set({
  processedAt: admin.firestore.FieldValue.serverTimestamp(),
  provider: 'MTN',
  status: 'processing'
});

// Traiter le paiement...

// ❌ MAUVAIS - Pas d'idempotence
export const momoWebhook = onRequest(async (req, res) => {
  // Traitement direct sans check de doublon
  await creditWallet(userId, amount);
  return res.status(200).send('OK');
});
```

#### 3. Logging des Webhooks
```typescript
// ✅ BON - Log complet avec TTL
await admin.firestore().collection('webhook_logs').add({
  provider: 'MTN',
  event: 'payment_success',
  providerTxId: req.body.financialTransactionId,
  payload: req.body,
  processedAt: admin.firestore.FieldValue.serverTimestamp(),
  expiresAt: admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 jours
  )
});
```

### Payment States
```typescript
type PaymentStatus = 
  | 'pending'      // En attente de paiement utilisateur
  | 'processing'   // Traitement en cours
  | 'successful'   // Paiement réussi
  | 'failed'       // Paiement échoué
  | 'expired';     // Expiré (timeout)

// Transitions valides :
// pending → processing → successful
// pending → processing → failed
// pending → expired
```

## 🔄 Système d'Exchange P2P

### Exchange States
```typescript
type ExchangeStatus = 
  | 'hold_active'  // Fonds bloqués, échange en cours
  | 'completed'    // Exchange terminé avec succès
  | 'canceled'     // Exchange annulé, fonds retournés
  | 'expired';     // Expiré après 6h

// Transitions :
// hold_active → completed (via exchangeCapture)
// hold_active → canceled (via exchangeCancel)
// hold_active → expired (via scheduled job)
```

### Hold Logic
```typescript
// ✅ BON - Hold avec split 50/50 des frais coursier
const courierFee = 1000; // XAF
const sellerHold = courierFee / 2;
const buyerHold = courierFee / 2;

await admin.firestore().runTransaction(async (transaction) => {
  // Vérifier fonds suffisants
  const sellerWallet = await transaction.get(sellerWalletRef);
  const buyerWallet = await transaction.get(buyerWalletRef);
  
  if (sellerWallet.data()!.available < sellerHold) {
    throw new Error('Seller insufficient funds');
  }
  if (buyerWallet.data()!.available < buyerHold) {
    throw new Error('Buyer insufficient funds');
  }
  
  // Bloquer les fonds
  transaction.update(sellerWalletRef, {
    available: admin.firestore.FieldValue.increment(-sellerHold),
    held: admin.firestore.FieldValue.increment(sellerHold)
  });
  
  transaction.update(buyerWalletRef, {
    available: admin.firestore.FieldValue.increment(-buyerHold),
    held: admin.firestore.FieldValue.increment(buyerHold)
  });
  
  // Créer l'exchange
  transaction.set(exchangeRef, {
    sellerId: sellerId,
    buyerId: buyerId,
    courierId: courierId,
    courierFee: courierFee,
    sellerHold: sellerHold,
    buyerHold: buyerHold,
    status: 'hold_active',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 6 * 60 * 60 * 1000) // 6 heures
    )
  });
});
```

## 📱 Flutter Best Practices

### State Management
```dart
// ✅ BON - Gestion d'état claire
class RegisterScreen extends StatefulWidget {
  @override
  _RegisterScreenState createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  bool _isLoading = false;
  String? _errorMessage;
  
  Future<void> _register() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    
    try {
      await _authService.register(...);
      // Navigation après succès
      Navigator.pushReplacement(context, ...);
    } catch (e) {
      setState(() {
        _errorMessage = e.toString();
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }
  
  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Center(child: CircularProgressIndicator());
    }
    
    return Column(
      children: [
        if (_errorMessage != null)
          Text(_errorMessage!, style: TextStyle(color: Colors.red)),
        // ... reste du UI
      ],
    );
  }
}
```

### Error Handling
```dart
// ✅ BON - Messages d'erreur user-friendly
try {
  await FirebaseAuth.instance.signInWithEmailAndPassword(
    email: email,
    password: password
  );
} on FirebaseAuthException catch (e) {
  String message;
  switch (e.code) {
    case 'user-not-found':
      message = 'Aucun compte avec cet email';
      break;
    case 'wrong-password':
      message = 'Mot de passe incorrect';
      break;
    case 'invalid-email':
      message = 'Email invalide';
      break;
    default:
      message = 'Erreur de connexion: ${e.message}';
  }
  // Afficher message à l'utilisateur
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(message))
  );
}
```

### Firebase Integration
```dart
// ✅ BON - Écoute de stream avec gestion d'état
StreamBuilder<DocumentSnapshot>(
  stream: FirebaseFirestore.instance
    .collection('wallets')
    .doc(userId)
    .snapshots(),
  builder: (context, snapshot) {
    if (snapshot.hasError) {
      return Text('Erreur: ${snapshot.error}');
    }
    
    if (snapshot.connectionState == ConnectionState.waiting) {
      return CircularProgressIndicator();
    }
    
    if (!snapshot.hasData || !snapshot.data!.exists) {
      return Text('Wallet introuvable');
    }
    
    final wallet = snapshot.data!.data() as Map<String, dynamic>;
    final balance = wallet['available'] ?? 0;
    
    return Text('Balance: $balance XAF');
  },
)
```

## 🔐 Sécurité

### Variables d'Environnement
```typescript
// ✅ BON - Utilisation de variables d'environnement
const momoApiKey = process.env.MTN_MOMO_API_KEY;
const momoCallbackToken = process.env.MOMO_CALLBACK_TOKEN;

if (!momoApiKey) {
  throw new Error('MTN_MOMO_API_KEY not configured');
}

// ❌ MAUVAIS - Clés en dur
const momoApiKey = 'abcd1234efgh5678'; // JAMAIS FAIRE ÇA
```

### Firestore Security Rules
```javascript
// ✅ BON - Rules strictes
match /wallets/{walletId} {
  // Les clients ne peuvent QUE lire leur propre wallet
  allow read: if request.auth != null && request.auth.uid == walletId;
  // Les écritures SEULEMENT via Cloud Functions
  allow write: if false;
}

match /payments/{paymentId} {
  // Les clients peuvent créer des payment intents
  allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
  // Lecture limitée à leurs propres payments
  allow read: if request.auth != null && resource.data.userId == request.auth.uid;
  // Modifications SEULEMENT via Cloud Functions (webhooks)
  allow update, delete: if false;
}

// ❌ MAUVAIS - Trop permissif
match /wallets/{walletId} {
  allow read, write: if request.auth != null; // Permet modifications client!
}
```

### Sensitive Data
```typescript
// ✅ BON - Ne pas logger les données sensibles
console.log('[PAYMENT] Processing', {
  userId: userId,
  amount: amount,
  provider: 'MTN'
  // Ne PAS logger: phone, tokens, API keys
});

// ❌ MAUVAIS - Log de données sensibles
console.log('[PAYMENT]', {
  phone: '677123456', // PII
  apiKey: process.env.MTN_API_KEY, // Secret
  body: req.body // Peut contenir des secrets
});
```

## 📊 Performance

### Firestore Queries
```typescript
// ✅ BON - Indexation et pagination
const query = admin.firestore()
  .collection('exchanges')
  .where('sellerId', '==', userId)
  .where('status', '==', 'hold_active')
  .orderBy('createdAt', 'desc')
  .limit(20);

// Créer l'index composite dans firestore.indexes.json

// ❌ MAUVAIS - Récupérer tout
const allExchanges = await admin.firestore()
  .collection('exchanges')
  .get(); // Récupère TOUS les documents
```

### Batching
```typescript
// ✅ BON - Batch writes
const batch = admin.firestore().batch();

exchanges.forEach(exchange => {
  const ref = admin.firestore().collection('exchanges').doc(exchange.id);
  batch.update(ref, { status: 'expired' });
});

await batch.commit();

// ❌ MAUVAIS - Writes individuels
for (const exchange of exchanges) {
  await admin.firestore()
    .collection('exchanges')
    .doc(exchange.id)
    .update({ status: 'expired' });
}
```

## 🧪 Testing

### Unit Tests
```typescript
// ✅ BON - Tests isolés avec mocks
import { describe, it, expect, vi } from 'vitest';

describe('creditWallet', () => {
  it('should credit wallet with correct amount', async () => {
    const mockTransaction = {
      get: vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({ available: 5000, held: 0 })
      }),
      update: vi.fn()
    };
    
    await creditWallet('user123', 1000, mockTransaction);
    
    expect(mockTransaction.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        available: expect.anything() // FieldValue.increment(1000)
      })
    );
  });
});
```

### Integration Tests
```typescript
// ✅ BON - Tests avec Firebase Emulator
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const app = initializeApp({ projectId: 'demo-test' });
const db = getFirestore(app);
connectFirestoreEmulator(db, 'localhost', 8080);

// Tests avec vraie Firestore (emulator)
```

## 📝 Git Workflow

### Commit Messages
```bash
# ✅ BON - Messages descriptifs
git commit -m "feat(webhook): Add Orange Money webhook handler with idempotency"
git commit -m "fix(wallet): Prevent negative balance in creditWallet"
git commit -m "refactor(exchange): Extract hold logic to separate function"

# ❌ MAUVAIS - Messages vagues
git commit -m "fix bug"
git commit -m "updates"
git commit -m "wip"
```

### Branch Naming
```bash
# ✅ BON
feature/orange-webhook
bugfix/wallet-negative-balance
refactor/exchange-hold-logic

# ❌ MAUVAIS
dev
fix
test-branch
```

## 🎨 Code Style

### TypeScript
```typescript
// ✅ BON - Types explicites
interface PaymentIntent {
  userId: string;
  amount: number;
  phone: string;
  provider: 'MTN' | 'Orange';
}

function createPaymentIntent(data: PaymentIntent): Promise<string> {
  // ...
}

// ❌ MAUVAIS - Any partout
function createPaymentIntent(data: any): any {
  // ...
}
```

### Naming Conventions
```typescript
// ✅ BON
const MAX_RETRY_ATTEMPTS = 3; // Constantes en UPPER_SNAKE_CASE
const userId = 'user123'; // Variables en camelCase
class PaymentService {} // Classes en PascalCase
interface WalletData {} // Interfaces en PascalCase
type PaymentStatus = 'pending' | 'successful'; // Types en PascalCase

// ❌ MAUVAIS
const max_retry = 3; // Mélange de conventions
const UserID = 'user123'; // PascalCase pour variable
class paymentService {} // camelCase pour classe
```

## 📚 Documentation Code

### Fonctions Importantes
```typescript
/**
 * Credits a user's wallet with the specified amount.
 * 
 * This function MUST be called within a Firestore transaction to ensure
 * ACID properties and prevent race conditions.
 * 
 * @param userId - The user's wallet ID
 * @param amount - Amount to credit (must be positive)
 * @param transaction - Active Firestore transaction
 * @throws {Error} If wallet doesn't exist or amount is negative
 * 
 * @example
 * await admin.firestore().runTransaction(async (transaction) => {
 *   await creditWallet('user123', 1000, transaction);
 * });
 */
async function creditWallet(
  userId: string,
  amount: number,
  transaction: admin.firestore.Transaction
): Promise<void> {
  // ...
}
```

## ⚡ Checklist Finale

Avant de soumettre du code, vérifier :

### Backend (Cloud Functions)
- [ ] Gestion d'erreur complète (try/catch)
- [ ] Validation des entrées
- [ ] Logs structurés avec contexte
- [ ] Transactions Firestore pour opérations critiques
- [ ] Variables d'environnement pour secrets
- [ ] Idempotence pour webhooks
- [ ] Types TypeScript explicites
- [ ] Documentation des fonctions importantes

### Frontend (Flutter)
- [ ] Gestion des états de chargement
- [ ] Messages d'erreur user-friendly
- [ ] Pas de données sensibles en clair
- [ ] Navigation cohérente
- [ ] Responsive design

### Sécurité
- [ ] Pas de secrets en dur
- [ ] Validation tokens webhooks
- [ ] Firestore rules restrictives
- [ ] Pas de PII dans les logs

### Performance
- [ ] Queries indexées
- [ ] Pagination pour listes
- [ ] Batch writes quand possible
- [ ] Timeouts configurés

---

**Rappelez-vous** : La qualité du code est plus importante que la vitesse. Prenez le temps de bien faire les choses dès la première fois.
