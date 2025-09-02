// Simple admin creation using Firebase CLI authentication
const { initializeApp } = require('firebase/app');
const { getAuth, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, setDoc, serverTimestamp } = require('firebase/firestore');

// Firebase config for the mediexchange project (web config from admin panel)
const firebaseConfig = {
  apiKey: 'AIzaSyCcsUpbSHE4RHy8JKA3nm-91KKeju8B5Ko',
  appId: '1:850077575356:web:67c7130629f17dd57708b9',
  messagingSenderId: '850077575356',
  projectId: 'mediexchange',
  authDomain: 'mediexchange.firebaseapp.com',
  storageBucket: 'mediexchange.firebasestorage.app'
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function createAdminUser() {
  try {
    const email = 'admin@mediexchange.com';
    const password = 'Admin123!';
    
    console.log('Creating admin user...');
    
    // Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    console.log('✅ Firebase Auth user created:', user.uid);
    
    // Create admin document in Firestore
    const adminData = {
      email: email,
      displayName: 'Admin User',
      role: 'super_admin',
      isActive: true,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      permissions: [
        'manage_pharmacies',
        'manage_subscriptions', 
        'verify_payments',
        'view_financials',
        'manage_admins',
        'system_settings'
      ]
    };
    
    await setDoc(doc(db, 'admins', user.uid), adminData);
    
    console.log('✅ Admin document created in Firestore');
    console.log('\n🎉 Admin user created successfully!');
    console.log('📧 Email:', email);
    console.log('🔑 Password:', password);
    console.log('🔗 Admin Panel: http://localhost:8085');
    console.log('\n⚠️  You can now login to the admin panel!');
    
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    if (error.code === 'auth/email-already-in-use') {
      console.log('📝 Admin user already exists, just need to create Firestore document...');
      // Just create the Firestore document with a known UID
      // In production, you'd get the actual UID from Auth
    }
  }
  
  process.exit(0);
}

createAdminUser();