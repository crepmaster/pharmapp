import { onRequest } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/**
 * 💳 Development Credit Function
 *
 * Credits wallet balance for development/testing purposes.
 * More permissive than sandboxCredit - allows specific development accounts.
 *
 * **DEVELOPMENT ONLY** - Should be removed before production deployment
 *
 * Allowed accounts:
 * - limbe1@gmail.com (development testing)
 * - *@promoshake.net (test accounts)
 * - test*@* (test accounts)
 *
 * Usage:
 *   POST https://europe-west1-mediexchange.cloudfunctions.net/devCredit
 *   Body: { "userId": "user-uid", "amount": 10000, "currency": "XAF" }
 *
 * @returns JSON response with wallet update results
 */
export const devCredit = onRequest({ region: 'europe-west1' }, async (req, res) => {
  // Enable CORS for local development
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.',
    });
    return;
  }

  try {
    const { userId, amount, currency = 'XAF' } = req.body;

    // Validate required parameters
    if (!userId) {
      res.status(400).json({
        success: false,
        error: 'Missing required parameter: userId',
      });
      return;
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({
        success: false,
        error: 'Invalid amount. Must be a positive number.',
      });
      return;
    }

    // Maximum credit limit: 100,000 XAF (or equivalent)
    const MAX_CREDIT = 100000;
    if (amount > MAX_CREDIT) {
      res.status(400).json({
        success: false,
        error: `Amount exceeds maximum limit of ${MAX_CREDIT} ${currency}`,
      });
      return;
    }

    const db = getFirestore();

    // Get user email to verify it's a development account
    let userEmail = '';
    try {
      const pharmacyDoc = await db.collection('pharmacies').doc(userId).get();
      const courierDoc = await db.collection('couriers').doc(userId).get();
      const adminDoc = await db.collection('admins').doc(userId).get();

      if (pharmacyDoc.exists) {
        userEmail = pharmacyDoc.data()?.email || '';
      } else if (courierDoc.exists) {
        userEmail = courierDoc.data()?.email || '';
      } else if (adminDoc.exists) {
        userEmail = adminDoc.data()?.email || '';
      }
    } catch (error: any) {
      console.error(`Error fetching user: ${error.message}`);
    }

    // Security check: Only allow development accounts
    const isDevelopmentAccount =
      userEmail === 'limbe1@gmail.com' ||
      userEmail.endsWith('@promoshake.net') ||
      userEmail.startsWith('test') ||
      userEmail.includes('09092025');

    if (!isDevelopmentAccount) {
      console.warn(`🚨 Attempt to credit non-development account: ${userEmail} (${userId})`);
      res.status(403).json({
        success: false,
        error: 'Development credit only allowed for authorized development accounts',
        code: 'NOT_DEV_ACCOUNT',
        allowedPatterns: [
          'limbe1@gmail.com',
          '*@promoshake.net',
          'test*@*',
          '*09092025*'
        ]
      });
      return;
    }

    console.log(`💳 Development credit: ${amount} ${currency} for ${userEmail} (${userId})`);

    // Get or create wallet document
    const walletRef = db.collection('wallets').doc(userId);
    const walletDoc = await walletRef.get();

    let currentBalance = 0;
    if (walletDoc.exists) {
      currentBalance = walletDoc.data()?.available || 0;
    }

    const newBalance = currentBalance + amount;

    // Update wallet balance
    await walletRef.set(
      {
        available: newBalance,
        currency: currency,
        lastUpdated: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Create ledger entry for audit trail
    await db.collection('ledger').add({
      userId: userId,
      type: 'dev_credit',
      amount: amount,
      currency: currency,
      previousBalance: currentBalance,
      newBalance: newBalance,
      description: 'Development wallet credit (testing)',
      timestamp: FieldValue.serverTimestamp(),
      metadata: {
        source: 'devCredit_function',
        userEmail: userEmail,
      },
    });

    console.log(`✓ Development credit successful: ${userEmail} balance ${currentBalance} → ${newBalance} ${currency}`);

    res.status(200).json({
      success: true,
      message: 'Development credit applied',
      data: {
        userId: userId,
        userEmail: userEmail,
        amount: amount,
        currency: currency,
        previousBalance: currentBalance,
        newBalance: newBalance,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error: any) {
    console.error(`❌ Development credit error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});
