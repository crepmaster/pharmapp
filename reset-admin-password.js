// Reset password for existing admin user
const { initializeApp } = require('firebase/app');
const { getAuth, sendPasswordResetEmail } = require('firebase/auth');

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

async function resetAdminPassword() {
  try {
    const email = 'admin@mediexchange.com';
    
    console.log('Sending password reset email...');
    await sendPasswordResetEmail(auth, email);
    
    console.log('✅ Password reset email sent successfully!');
    console.log('📧 Check email:', email);
    console.log('🔗 Use the reset link to set a new password');
    console.log('🎯 Then login at: http://localhost:8085');
    
  } catch (error) {
    console.error('❌ Error sending reset email:', error.message);
  }
  
  process.exit(0);
}

resetAdminPassword();