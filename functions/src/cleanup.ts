import { onRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * 🧹 Cleanup Test User
 *
 * Removes a test user from Firebase Authentication and all associated Firestore data.
 * Useful for cleaning up test accounts after testing.
 *
 * Security: Only allows cleanup of emails containing "test" or ending with @promoshake.net
 *
 * Usage:
 *   GET/POST https://europe-west1-mediexchange.cloudfunctions.net/cleanupTestUser?email=test@example.com
 *   Or POST with body: { "email": "test@example.com" }
 *
 * @returns JSON response with cleanup results
 */
export const cleanupTestUser = onRequest({ region: 'europe-west1' }, async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    // Get email from query parameter or request body
    const email = (req.query.email as string) || req.body?.email;

    if (!email) {
      res.status(400).json({
        success: false,
        error: 'Email parameter is required',
      });
      return;
    }

    // Security: Only allow cleanup of test accounts
    const isTestAccount = email.includes('test') ||
                          email.endsWith('@promoshake.net') ||
                          email.includes('09092025');

    if (!isTestAccount) {
      console.warn(`🚨 Attempt to cleanup non-test account: ${email}`);
      res.status(403).json({
        success: false,
        error: 'Only test accounts can be cleaned up (must contain "test", "09092025", or end with @promoshake.net)',
      });
      return;
    }

    console.log(`🧹 Starting cleanup for test user: ${email}`);

    const auth = getAuth();
    const db = getFirestore();

    const deletedCollections: string[] = [];
    let userRecord = null;

    // Step 1: Get user by email
    try {
      userRecord = await auth.getUserByEmail(email);
      console.log(`✓ Found user: ${userRecord.uid}`);
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        console.log('⚠️ User not found in Authentication');
      } else {
        throw error;
      }
    }

    // Step 2: Delete Firestore documents if user exists
    if (userRecord) {
      const uid = userRecord.uid;

      // Delete from pharmacies collection
      try {
        await db.collection('pharmacies').doc(uid).delete();
        deletedCollections.push('pharmacies');
        console.log('✓ Deleted from pharmacies');
      } catch (error: any) {
        console.log(`⚠️ No pharmacy doc: ${error.message}`);
      }

      // Delete from couriers collection
      try {
        await db.collection('couriers').doc(uid).delete();
        deletedCollections.push('couriers');
        console.log('✓ Deleted from couriers');
      } catch (error: any) {
        console.log(`⚠️ No courier doc: ${error.message}`);
      }

      // Delete from admins collection
      try {
        await db.collection('admins').doc(uid).delete();
        deletedCollections.push('admins');
        console.log('✓ Deleted from admins');
      } catch (error: any) {
        console.log(`⚠️ No admin doc: ${error.message}`);
      }

      // Delete from wallets collection
      try {
        await db.collection('wallets').doc(uid).delete();
        deletedCollections.push('wallets');
        console.log('✓ Deleted from wallets');
      } catch (error: any) {
        console.log(`⚠️ No wallet doc: ${error.message}`);
      }

      // Delete user's inventory items
      try {
        const inventorySnapshot = await db.collection('pharmacy_inventory')
          .where('pharmacyId', '==', uid)
          .get();

        if (!inventorySnapshot.empty) {
          const batch = db.batch();
          inventorySnapshot.docs.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          deletedCollections.push(`pharmacy_inventory (${inventorySnapshot.size} items)`);
          console.log(`✓ Deleted ${inventorySnapshot.size} inventory items`);
        }
      } catch (error: any) {
        console.log(`⚠️ No inventory items: ${error.message}`);
      }

      // Delete user's exchange proposals
      try {
        const proposalsSnapshot = await db.collection('exchange_proposals')
          .where('pharmacyId', '==', uid)
          .get();

        if (!proposalsSnapshot.empty) {
          const batch = db.batch();
          proposalsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          deletedCollections.push(`exchange_proposals (${proposalsSnapshot.size} items)`);
          console.log(`✓ Deleted ${proposalsSnapshot.size} proposals`);
        }
      } catch (error: any) {
        console.log(`⚠️ No proposals: ${error.message}`);
      }

      // Delete ledger entries (for audit trail, consider keeping in production)
      try {
        const ledgerSnapshot = await db.collection('ledger')
          .where('userId', '==', uid)
          .limit(100)
          .get();

        if (!ledgerSnapshot.empty) {
          const batch = db.batch();
          ledgerSnapshot.docs.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          deletedCollections.push(`ledger (${ledgerSnapshot.size} entries)`);
          console.log(`✓ Deleted ${ledgerSnapshot.size} ledger entries`);
        }
      } catch (error: any) {
        console.log(`⚠️ No ledger entries: ${error.message}`);
      }

      // Step 3: Delete from Authentication
      try {
        await auth.deleteUser(uid);
        console.log('✓ Deleted from Firebase Authentication');
      } catch (error: any) {
        console.error(`❌ Failed to delete from Authentication: ${error.message}`);
        throw error;
      }
    }

    res.status(200).json({
      success: true,
      message: 'Test user cleanup completed',
      email,
      uid: userRecord?.uid || 'not-found',
      deletedCollections,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error(`❌ Cleanup error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});
