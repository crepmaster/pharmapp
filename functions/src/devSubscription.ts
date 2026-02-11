/**
 * Development helper function to grant trial subscriptions for testing
 * ONLY works with test accounts (gmail.com, promoshake.net, test*)
 *
 * Usage: POST https://europe-west1-mediexchange.cloudfunctions.net/devSubscription
 * Body: { "pharmacyId": "..." }
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize admin if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export const devSubscription = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    const { pharmacyId } = req.body;

    if (!pharmacyId) {
      res.status(400).json({ error: 'Missing pharmacyId in request body' });
      return;
    }

    // Get pharmacy document
    const pharmacyDoc = await db.collection('pharmacies').doc(pharmacyId).get();

    if (!pharmacyDoc.exists) {
      res.status(404).json({ error: 'Pharmacy not found' });
      return;
    }

    const pharmacyData = pharmacyDoc.data();
    const email = pharmacyData?.email || '';

    // Security check: Only allow test accounts
    const testPatterns = [
      /@gmail\.com$/i,
      /@promoshake\.net$/i,
      /^test/i,
      /@test\./i,
    ];

    const isTestAccount = testPatterns.some(pattern => pattern.test(email));

    if (!isTestAccount) {
      res.status(403).json({
        error: 'devSubscription only works with test accounts (gmail.com, promoshake.net, test*)',
        email: email,
      });
      return;
    }

    // Create 30-day trial subscription
    const now = admin.firestore.Timestamp.now();
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 30);

    const trialSubscription = {
      planId: 'trial',
      planName: 'Trial Plan',
      status: 'active',
      startDate: now,
      endDate: admin.firestore.Timestamp.fromDate(trialEndDate),
      isTrial: true,
      currency: 'XAF',
      amount: 0,
      isYearly: false,
      autoRenew: false,
      createdAt: now,
      updatedAt: now,
    };

    // Update pharmacy document with trial subscription
    // Set both the subscription object AND the individual fields for backward compatibility
    await db.collection('pharmacies').doc(pharmacyId).update({
      subscription: trialSubscription,
      subscriptionStatus: 'trial',
      subscriptionPlan: 'trial',
      subscriptionEndDate: admin.firestore.Timestamp.fromDate(trialEndDate),
      updatedAt: now,
    });

    functions.logger.info(`Trial subscription granted to ${email} (${pharmacyId})`);

    res.status(200).json({
      success: true,
      message: 'Trial subscription granted',
      pharmacyId: pharmacyId,
      email: email,
      trialEndsAt: trialEndDate.toISOString(),
      daysRemaining: 30,
    });

  } catch (error: any) {
    functions.logger.error('Error granting trial subscription:', error);
    res.status(500).json({
      error: 'Failed to grant trial subscription',
      details: error.message,
    });
  }
});
