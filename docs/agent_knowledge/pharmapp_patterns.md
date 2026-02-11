# PharmApp Patterns - Base de Connaissance

*Dernière mise à jour : 2025-10-20*

> Ce fichier documente les patterns validés et recommandés pour PharmApp. Ces patterns ont été testés et approuvés.

## 🏗️ Architecture Patterns

### Pattern : Multi-App Structure
```
pharmapp/
├── functions/           # Backend Cloud Functions
├── shared/             # Code partagé (models, utils)
├── pharmacy_app/       # App pharmacie (port 8084)
├── courier_app/        # App livreur (port 8085)
├── admin_panel/        # Panel admin (port 8086)
└── unified_app/        # App unifiée (port 8080)
```

**Quand utiliser** : Structure actuelle du projet, toutes les apps partagent `shared/`

**Avantages** :
- Code partagé réutilisable
- Séparation claire des responsabilités
- Déploiement indépendant possible

---

## 💳 Payment Patterns

### Pattern : Webhook MTN Mobile Money

**Fichier de référence** : `functions/src/index.ts` lignes 189-230

```typescript
export const momoWebhook = onRequest(async (req, res) => {
  try {
    // 1. SÉCURITÉ : Validation token
    const receivedToken = req.headers['x-callback-token'];
    if (receivedToken !== process.env.MOMO_CALLBACK_TOKEN) {
      console.error('[SECURITY] Invalid MTN webhook token');
      return res.status(401).send('Unauthorized');
    }
    
    // 2. IDEMPOTENCE : Check si déjà traité
    const providerTxId = req.body.financialTransactionId;
    const idempotencyKey = `mtn_${providerTxId}`;
    
    const idempotencyRef = admin.firestore()
      .collection('idempotency')
      .doc(idempotencyKey);
    
    const idempotencyDoc = await idempotencyRef.get();
    
    if (idempotencyDoc.exists) {
      console.log('[IDEMPOTENCY] Already processed:', idempotencyKey);
      return res.status(200).send('OK');
    }
    
    // 3. MARQUER comme en traitement
    await idempotencyRef.set({
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      provider: 'MTN',
      status: 'processing',
      providerTxId: providerTxId
    });
    
    // 4. LOGGING du webhook
    await admin.firestore().collection('webhook_logs').add({
      provider: 'MTN',
      event: req.body.status,
      providerTxId: providerTxId,
      payload: req.body,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 jours TTL
      )
    });
    
    // 5. TRAITEMENT selon le statut
    const status = req.body.status;
    
    if (status === 'SUCCESSFUL') {
      const paymentIntentId = req.body.externalId;
      
      // Mettre à jour le payment
      await admin.firestore()
        .collection('payments')
        .doc(paymentIntentId)
        .update({
          status: 'successful',
          providerTxId: providerTxId,
          completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      
      // Créditer le wallet (avec transaction)
      const paymentDoc = await admin.firestore()
        .collection('payments')
        .doc(paymentIntentId)
        .get();
      
      const { userId, amount } = paymentDoc.data()!;
      
      await creditWallet(userId, amount);
      
    } else if (status === 'FAILED') {
      const paymentIntentId = req.body.externalId;
      
      await admin.firestore()
        .collection('payments')
        .doc(paymentIntentId)
        .update({
          status: 'failed',
          failureReason: req.body.reason,
          completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    
    return res.status(200).send('OK');
    
  } catch (error) {
    console.error('[WEBHOOK_ERROR] MTN webhook failed:', error);
    return res.status(500).send('Internal Error');
  }
});
```

**Points clés** :
1. Validation token EN PREMIER
2. Check idempotence AVANT traitement
3. Logging systématique avec TTL
4. Gestion des différents statuts (SUCCESSFUL, FAILED)
5. Mise à jour wallet avec transaction atomique

**Adapter pour** : Orange Money, Airtel Money, tout autre provider

---

### Pattern : Credit Wallet (Atomique)

**Fichier de référence** : `functions/src/lib/wallet.ts` fonction `creditWallet`

```typescript
export async function creditWallet(
  userId: string,
  amount: number
): Promise<void> {
  await admin.firestore().runTransaction(async (transaction) => {
    const walletRef = admin.firestore().collection('wallets').doc(userId);
    const walletDoc = await transaction.get(walletRef);
    
    if (!walletDoc.exists) {
      throw new Error(`Wallet not found for user: ${userId}`);
    }
    
    // Mise à jour atomique avec increment
    transaction.update(walletRef, {
      available: admin.firestore.FieldValue.increment(amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Créer une entrée dans le ledger
    const ledgerRef = admin.firestore().collection('ledger').doc();
    transaction.set(ledgerRef, {
      userId: userId,
      type: 'credit',
      amount: amount,
      source: 'topup',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  
  console.log('[WALLET] Credited', { userId, amount });
}
```

**Points clés** :
- TOUJOURS dans une transaction
- Utiliser `FieldValue.increment()` (atomique)
- Vérifier l'existence du wallet
- Créer une entrée ledger pour traçabilité
- Logging après succès

**Similaire pour** : `debitWallet`, `holdFunds`, `releaseFunds`

---

### Pattern : Payment Intent Creation

```typescript
export const topupIntent = onCall(async (request) => {
  const { userId, amount, phone, provider } = request.data;
  
  // 1. VALIDATION
  if (!userId || !amount || !phone || !provider) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }
  
  if (amount <= 0) {
    throw new HttpsError('invalid-argument', 'Amount must be positive');
  }
  
  if (!['MTN', 'Orange'].includes(provider)) {
    throw new HttpsError('invalid-argument', 'Invalid provider');
  }
  
  // 2. CRÉER l'intent dans Firestore
  const paymentRef = admin.firestore().collection('payments').doc();
  
  await paymentRef.set({
    userId: userId,
    amount: amount,
    phone: phone,
    provider: provider,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // 3. APPELER l'API du provider
  let providerResponse;
  
  if (provider === 'MTN') {
    providerResponse = await callMTNAPI({
      amount: amount,
      phone: phone,
      externalId: paymentRef.id,
      callbackUrl: `${CLOUD_RUN_BASE_URL}/momoWebhook`
    });
  } else if (provider === 'Orange') {
    providerResponse = await callOrangeAPI({
      amount: amount,
      phone: phone,
      externalId: paymentRef.id,
      callbackUrl: `${CLOUD_RUN_BASE_URL}/orangeWebhook`
    });
  }
  
  // 4. METTRE À JOUR l'intent avec la référence provider
  await paymentRef.update({
    providerReference: providerResponse.reference,
    status: 'processing'
  });
  
  return {
    paymentId: paymentRef.id,
    providerReference: providerResponse.reference
  };
});
```

**Points clés** :
- Validation stricte des inputs
- Création intent AVANT appel API
- Callback URL avec l'endpoint du bon provider
- Mise à jour avec référence provider
- Return ID pour tracking client-side

---

## 🔄 Exchange Patterns

### Pattern : Create Exchange Hold (Split 50/50)

**Fichier de référence** : `functions/src/index.ts` fonction `createExchangeHold`

```typescript
export const createExchangeHold = onCall(async (request) => {
  const { sellerId, buyerId, courierId, productPrice } = request.data;
  
  // 1. VALIDATION
  if (!sellerId || !buyerId || !courierId) {
    throw new HttpsError('invalid-argument', 'Missing participants');
  }
  
  if (!productPrice || productPrice <= 0) {
    throw new HttpsError('invalid-argument', 'Invalid product price');
  }
  
  // 2. CALCUL DES FRAIS
  const courierFee = 1000; // XAF - à adapter selon la logique métier
  const sellerHold = courierFee / 2;
  const buyerHold = courierFee / 2;
  
  // 3. TRANSACTION ATOMIQUE
  const exchangeRef = admin.firestore().collection('exchanges').doc();
  
  await admin.firestore().runTransaction(async (transaction) => {
    // Récupérer les wallets
    const sellerWalletRef = admin.firestore().collection('wallets').doc(sellerId);
    const buyerWalletRef = admin.firestore().collection('wallets').doc(buyerId);
    
    const sellerWallet = await transaction.get(sellerWalletRef);
    const buyerWallet = await transaction.get(buyerWalletRef);
    
    if (!sellerWallet.exists || !buyerWallet.exists) {
      throw new Error('Wallet not found');
    }
    
    // Vérifier fonds suffisants
    const sellerAvailable = sellerWallet.data()!.available;
    const buyerAvailable = buyerWallet.data()!.available;
    
    if (sellerAvailable < sellerHold) {
      throw new HttpsError('failed-precondition', 'Seller insufficient funds');
    }
    
    if (buyerAvailable < buyerHold) {
      throw new HttpsError('failed-precondition', 'Buyer insufficient funds');
    }
    
    // Bloquer les fonds (available → held)
    transaction.update(sellerWalletRef, {
      available: admin.firestore.FieldValue.increment(-sellerHold),
      held: admin.firestore.FieldValue.increment(sellerHold),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    transaction.update(buyerWalletRef, {
      available: admin.firestore.FieldValue.increment(-buyerHold),
      held: admin.firestore.FieldValue.increment(buyerHold),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Créer l'exchange
    transaction.set(exchangeRef, {
      sellerId: sellerId,
      buyerId: buyerId,
      courierId: courierId,
      productPrice: productPrice,
      courierFee: courierFee,
      sellerHold: sellerHold,
      buyerHold: buyerHold,
      status: 'hold_active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 6 * 60 * 60 * 1000) // 6 heures
      )
    });
    
    // Ledger entries
    const ledgerRefSeller = admin.firestore().collection('ledger').doc();
    transaction.set(ledgerRefSeller, {
      userId: sellerId,
      type: 'hold',
      amount: sellerHold,
      source: 'exchange',
      exchangeId: exchangeRef.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    const ledgerRefBuyer = admin.firestore().collection('ledger').doc();
    transaction.set(ledgerRefBuyer, {
      userId: buyerId,
      type: 'hold',
      amount: buyerHold,
      source: 'exchange',
      exchangeId: exchangeRef.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  
  return {
    exchangeId: exchangeRef.id,
    courierFee: courierFee,
    sellerHold: sellerHold,
    buyerHold: buyerHold
  };
});
```

**Points clés** :
- Split 50/50 des frais coursier entre seller et buyer
- Vérification fonds suffisants DANS la transaction
- Atomicité : soit tout réussit, soit rien
- Expiration à 6 heures
- Ledger entries pour traçabilité

---

### Pattern : Exchange Capture (Compléter l'échange)

```typescript
export const exchangeCapture = onCall(async (request) => {
  const { exchangeId } = request.data;
  
  if (!exchangeId) {
    throw new HttpsError('invalid-argument', 'Missing exchangeId');
  }
  
  await admin.firestore().runTransaction(async (transaction) => {
    const exchangeRef = admin.firestore().collection('exchanges').doc(exchangeId);
    const exchangeDoc = await transaction.get(exchangeRef);
    
    if (!exchangeDoc.exists) {
      throw new Error('Exchange not found');
    }
    
    const exchange = exchangeDoc.data()!;
    
    if (exchange.status !== 'hold_active') {
      throw new HttpsError('failed-precondition', `Cannot capture exchange with status: ${exchange.status}`);
    }
    
    // Récupérer les wallets
    const sellerWalletRef = admin.firestore().collection('wallets').doc(exchange.sellerId);
    const buyerWalletRef = admin.firestore().collection('wallets').doc(exchange.buyerId);
    const courierWalletRef = admin.firestore().collection('wallets').doc(exchange.courierId);
    
    const sellerWallet = await transaction.get(sellerWalletRef);
    const buyerWallet = await transaction.get(buyerWalletRef);
    const courierWallet = await transaction.get(courierWalletRef);
    
    if (!sellerWallet.exists || !buyerWallet.exists || !courierWallet.exists) {
      throw new Error('Wallet not found');
    }
    
    // Retirer les fonds bloqués des participants
    transaction.update(sellerWalletRef, {
      held: admin.firestore.FieldValue.increment(-exchange.sellerHold),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    transaction.update(buyerWalletRef, {
      held: admin.firestore.FieldValue.increment(-exchange.buyerHold),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Créditer le coursier avec le total des frais
    const totalFee = exchange.sellerHold + exchange.buyerHold;
    transaction.update(courierWalletRef, {
      available: admin.firestore.FieldValue.increment(totalFee),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Marquer l'exchange comme complété
    transaction.update(exchangeRef, {
      status: 'completed',
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Ledger entries
    const ledgerRefCourier = admin.firestore().collection('ledger').doc();
    transaction.set(ledgerRefCourier, {
      userId: exchange.courierId,
      type: 'credit',
      amount: totalFee,
      source: 'exchange_fee',
      exchangeId: exchangeId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  
  return { success: true };
});
```

**Points clés** :
- Vérifier le statut de l'exchange AVANT capture
- Retirer les held funds des participants
- Créditer le coursier avec le total
- Marquer comme completed
- Ledger pour traçabilité

---

### Pattern : Exchange Cancel (Annuler et retourner les fonds)

```typescript
export const exchangeCancel = onCall(async (request) => {
  const { exchangeId } = request.data;
  
  if (!exchangeId) {
    throw new HttpsError('invalid-argument', 'Missing exchangeId');
  }
  
  await admin.firestore().runTransaction(async (transaction) => {
    const exchangeRef = admin.firestore().collection('exchanges').doc(exchangeId);
    const exchangeDoc = await transaction.get(exchangeRef);
    
    if (!exchangeDoc.exists) {
      throw new Error('Exchange not found');
    }
    
    const exchange = exchangeDoc.data()!;
    
    if (exchange.status !== 'hold_active') {
      throw new HttpsError('failed-precondition', `Cannot cancel exchange with status: ${exchange.status}`);
    }
    
    // Récupérer les wallets
    const sellerWalletRef = admin.firestore().collection('wallets').doc(exchange.sellerId);
    const buyerWalletRef = admin.firestore().collection('wallets').doc(exchange.buyerId);
    
    // Retourner les fonds bloqués (held → available)
    transaction.update(sellerWalletRef, {
      held: admin.firestore.FieldValue.increment(-exchange.sellerHold),
      available: admin.firestore.FieldValue.increment(exchange.sellerHold),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    transaction.update(buyerWalletRef, {
      held: admin.firestore.FieldValue.increment(-exchange.buyerHold),
      available: admin.firestore.FieldValue.increment(exchange.buyerHold),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Marquer l'exchange comme annulé
    transaction.update(exchangeRef, {
      status: 'canceled',
      canceledAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Ledger entries
    const ledgerRefSeller = admin.firestore().collection('ledger').doc();
    transaction.set(ledgerRefSeller, {
      userId: exchange.sellerId,
      type: 'release',
      amount: exchange.sellerHold,
      source: 'exchange_cancel',
      exchangeId: exchangeId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    const ledgerRefBuyer = admin.firestore().collection('ledger').doc();
    transaction.set(ledgerRefBuyer, {
      userId: exchange.buyerId,
      type: 'release',
      amount: exchange.buyerHold,
      source: 'exchange_cancel',
      exchangeId: exchangeId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  
  return { success: true };
});
```

**Points clés** :
- Vérifier le statut AVANT cancel
- Retourner les fonds (held → available)
- Marquer comme canceled
- Ledger pour traçabilité

---

## ⏰ Scheduled Jobs Pattern

### Pattern : Expire Old Holds

**Fichier de référence** : `functions/src/scheduled.ts`

```typescript
export const expireOldHolds = onSchedule({
  schedule: 'every 6 hours',
  timeZone: 'Africa/Douala',
  retryConfig: {
    retryCount: 3,
    minBackoffSeconds: 60
  }
}, async (context) => {
  console.log('[SCHEDULED] Starting expireOldHolds job');
  
  const now = admin.firestore.Timestamp.now();
  
  // Trouver les exchanges expirés
  const expiredExchanges = await admin.firestore()
    .collection('exchanges')
    .where('status', '==', 'hold_active')
    .where('expiresAt', '<=', now)
    .limit(100) // Batch de 100
    .get();
  
  console.log(`[SCHEDULED] Found ${expiredExchanges.size} expired exchanges`);
  
  // Traiter chaque exchange expiré
  for (const exchangeDoc of expiredExchanges.docs) {
    try {
      await admin.firestore().runTransaction(async (transaction) => {
        const exchange = exchangeDoc.data();
        
        // Récupérer les wallets
        const sellerWalletRef = admin.firestore().collection('wallets').doc(exchange.sellerId);
        const buyerWalletRef = admin.firestore().collection('wallets').doc(exchange.buyerId);
        
        // Retourner les fonds
        transaction.update(sellerWalletRef, {
          held: admin.firestore.FieldValue.increment(-exchange.sellerHold),
          available: admin.firestore.FieldValue.increment(exchange.sellerHold)
        });
        
        transaction.update(buyerWalletRef, {
          held: admin.firestore.FieldValue.increment(-exchange.buyerHold),
          available: admin.firestore.FieldValue.increment(exchange.buyerHold)
        });
        
        // Marquer comme expiré
        transaction.update(exchangeDoc.ref, {
          status: 'expired',
          expiredAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });
      
      console.log(`[SCHEDULED] Expired exchange: ${exchangeDoc.id}`);
    } catch (error) {
      console.error(`[SCHEDULED] Error expiring ${exchangeDoc.id}:`, error);
    }
  }
  
  console.log('[SCHEDULED] Finished expireOldHolds job');
});
```

**Points clés** :
- Schedule avec timezone `Africa/Douala`
- Retry configuration (3 tentatives)
- Query avec where + limit (pagination)
- Transaction pour chaque exchange
- Logging détaillé
- Error handling par exchange (un échec n'arrête pas les autres)

---

## 📱 Flutter Patterns

### Pattern : Firebase Auth Registration

```dart
Future<void> register({
  required String email,
  required String password,
  required String pharmacyName,
}) async {
  try {
    // 1. Créer le compte Firebase Auth
    final userCredential = await FirebaseAuth.instance
        .createUserWithEmailAndPassword(
      email: email,
      password: password,
    );
    
    final userId = userCredential.user!.uid;
    
    // 2. Créer le document pharmacy dans Firestore
    await FirebaseFirestore.instance
        .collection('pharmacies')
        .doc(userId)
        .set({
      'email': email,
      'pharmacyName': pharmacyName,
      'country': selectedCountry,
      'paymentProvider': selectedProvider,
      'createdAt': FieldValue.serverTimestamp(),
    });
    
    // 3. Créer le wallet
    await FirebaseFirestore.instance
        .collection('wallets')
        .doc(userId)
        .set({
      'available': 0,
      'held': 0,
      'createdAt': FieldValue.serverTimestamp(),
    });
    
    // 4. Navigation après succès
    Navigator.pushReplacementNamed(context, '/home');
    
  } on FirebaseAuthException catch (e) {
    // Gérer les erreurs Auth
    String message;
    switch (e.code) {
      case 'email-already-in-use':
        message = 'Un compte existe déjà avec cet email';
        break;
      case 'weak-password':
        message = 'Le mot de passe est trop faible';
        break;
      case 'invalid-email':
        message = 'Email invalide';
        break;
      default:
        message = 'Erreur d\'inscription: ${e.message}';
    }
    throw Exception(message);
  } catch (e) {
    throw Exception('Erreur d\'inscription: $e');
  }
}
```

**Points clés** :
- Création Auth AVANT Firestore
- userId depuis Auth
- Créer tous les documents nécessaires (pharmacy, wallet)
- Gestion erreurs FirebaseAuthException
- Navigation après succès complet

---

### Pattern : Wallet Balance Display (Real-time)

```dart
class WalletBalanceWidget extends StatelessWidget {
  final String userId;
  
  const WalletBalanceWidget({required this.userId});
  
  @override
  Widget build(BuildContext context) {
    return StreamBuilder<DocumentSnapshot>(
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
        final available = wallet['available'] ?? 0;
        final held = wallet['held'] ?? 0;
        
        return Column(
          children: [
            Text(
              'Balance Disponible',
              style: TextStyle(fontSize: 14, color: Colors.grey),
            ),
            Text(
              '$available XAF',
              style: TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.bold,
              ),
            ),
            if (held > 0)
              Text(
                'Bloqué: $held XAF',
                style: TextStyle(fontSize: 12, color: Colors.orange),
              ),
          ],
        );
      },
    );
  }
}
```

**Points clés** :
- StreamBuilder pour updates real-time
- Gestion complète des états (error, loading, no data)
- Affichage du held si présent
- Formatting clair

---

## 🧪 Testing Patterns

### Pattern : Test Webhook avec PowerShell

**Fichier de référence** : `scripts/test-cloudrun.ps1`

```powershell
# Test MTN Webhook Success
function Test-MTNWebhookSuccess {
    $body = @{
        financialTransactionId = "MTN_TX_$(Get-Random)"
        externalId = $paymentId
        status = "SUCCESSFUL"
        amount = 1000
        currency = "XAF"
        payer = @{
            partyIdType = "MSISDN"
            partyId = "677123456"
        }
    } | ConvertTo-Json
    
    $response = Invoke-WebRequest `
        -Uri "$CLOUD_RUN_URL/momoWebhook" `
        -Method POST `
        -Headers @{
            "Content-Type" = "application/json"
            "X-Callback-Token" = $env:MOMO_CALLBACK_TOKEN
        } `
        -Body $body
    
    Write-Host "MTN Webhook Response: $($response.StatusCode)"
}
```

**Points clés** :
- Transaction ID unique (Get-Random)
- Headers avec token
- Body JSON avec structure provider
- Vérifier le status code

---

## 🔒 Security Patterns

### Pattern : Environment Variables

```typescript
// .env (local development)
MTN_MOMO_API_KEY=xxxxx
MOMO_CALLBACK_TOKEN=xxxxx
ORANGE_API_KEY=xxxxx
ORANGE_CALLBACK_TOKEN=xxxxx

// Firebase Functions (production)
// Utiliser Firebase Config:
firebase functions:config:set mtn.api_key="xxxxx"
firebase functions:config:set mtn.callback_token="xxxxx"

// Dans le code
const momoApiKey = process.env.MTN_MOMO_API_KEY || functions.config().mtn.api_key;
```

**Points clés** :
- Jamais de secrets dans le code
- .env pour local (git ignored)
- Firebase config pour production
- Fallback avec ||

---

## 📝 Documentation Pattern

### Pattern : Function Documentation

```typescript
/**
 * Credits a user's wallet with the specified amount.
 * 
 * This function MUST be called within a Firestore transaction to ensure
 * atomicity and prevent race conditions.
 * 
 * @param userId - The wallet owner's user ID
 * @param amount - Amount to credit (XAF, must be positive)
 * @param transaction - Active Firestore transaction context
 * 
 * @throws {Error} If wallet doesn't exist
 * @throws {Error} If amount is negative or zero
 * 
 * @example
 * await admin.firestore().runTransaction(async (transaction) => {
 *   await creditWallet('user123', 1000, transaction);
 * });
 * 
 * @see debitWallet For the reverse operation
 * @see https://firebase.google.com/docs/firestore/manage-data/transactions
 */
export async function creditWallet(
  userId: string,
  amount: number,
  transaction: admin.firestore.Transaction
): Promise<void> {
  // Implementation...
}
```

**Points clés** :
- Description claire de la fonction
- Warnings importants (MUST, etc.)
- @param avec types et contraintes
- @throws pour les erreurs possibles
- @example avec usage concret
- @see pour références

---

**Note** : Ces patterns sont validés et testés. Toujours s'y référer avant d'implémenter des fonctionnalités similaires.
