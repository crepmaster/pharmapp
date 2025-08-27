import { initializeApp, deleteApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import functionsTest from 'firebase-functions-test';

// Initialize Firebase Functions Test SDK
export const testEnv = functionsTest();

// Test database instance
export let db: FirebaseFirestore.Firestore;

// Mock Firebase Admin initialization for tests
beforeAll(async () => {
  // Clear any existing apps
  const apps = getApps();
  apps.forEach(app => deleteApp(app));
  
  // Set emulator environment variables
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
  
  // Initialize Firebase Admin with test configuration
  const app = initializeApp({
    projectId: 'test-project'
  });
  
  db = getFirestore(app);
});

afterEach(async () => {
  // Clean up test data after each test
  if (db) {
    const collections = ['payments', 'wallets', 'exchanges', 'ledger', 'idempotency', 'webhook_logs'];
    
    for (const collectionName of collections) {
      const snapshot = await db.collection(collectionName).get();
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      if (snapshot.docs.length > 0) {
        await batch.commit();
      }
    }
  }
});

afterAll(() => {
  // Cleanup
  testEnv.cleanup();
  const apps = getApps();
  apps.forEach(app => deleteApp(app));
});