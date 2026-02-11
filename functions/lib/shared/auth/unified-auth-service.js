import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
/**
 * 🔐 Unified Authentication Service
 *
 * Single source of truth for all authentication logic across PharmApp.
 * Provides anti-orphan protection and consistent user creation.
 * Used by Firebase Functions and ensures business rule enforcement.
 */
export class UnifiedAuthService {
    static auth = getAuth();
    static db = getFirestore();
    /**
     * Create a new user with profile data and anti-orphan protection
     * This is the core method that prevents code duplication
     */
    static async createUserWithProfile(params) {
        const { userType, email, password, profileData } = params;
        let userRecord = null;
        try {
            console.log(`🔐 UnifiedAuth: Starting ${userType} creation for ${this.hashEmail(email)}`);
            // Step 1: Create Firebase Auth user
            userRecord = await this.auth.createUser({
                email,
                password,
                emailVerified: false,
            });
            console.log(`✅ Firebase Auth user created - UID: ${userRecord.uid}`);
            // Step 2: Add unified subscription fields
            const completeProfileData = {
                ...profileData,
                email,
                createdAt: FieldValue.serverTimestamp(),
                // Unified subscription initialization for all user types
                hasActiveSubscription: false,
                subscriptionStatus: 'pendingPayment',
                subscriptionPlan: null,
                subscriptionStartDate: null,
                subscriptionEndDate: null,
            };
            // Step 3: Create profile in appropriate Firestore collection
            const collectionName = this.getCollectionName(userType);
            await this.db.collection(collectionName).doc(userRecord.uid).set(completeProfileData);
            console.log(`✅ ${userType} profile created successfully in ${collectionName}`);
            // Step 4: Initialize wallet for the new user
            await this.initializeUserWallet(userRecord.uid, userType);
            console.log(`💰 Wallet initialized for ${userType} user: ${userRecord.uid}`);
            return { uid: userRecord.uid, user: userRecord };
        }
        catch (error) {
            console.error(`❌ ${userType} creation failed: ${error.message}`);
            // 🧹 ANTI-ORPHAN: Delete Firebase Auth user if Firestore creation failed
            if (userRecord?.uid) {
                try {
                    console.log('🧹 Cleaning up orphan Firebase Auth user...');
                    await this.auth.deleteUser(userRecord.uid);
                    console.log('✅ Orphan user cleaned up successfully');
                }
                catch (cleanupError) {
                    console.error(`⚠️ Failed to cleanup orphan user: ${cleanupError.message}`);
                }
            }
            throw error;
        }
    }
    /**
     * Create pharmacy user with specific validation
     */
    static async createPharmacyUser(params) {
        // Validate pharmacy-specific fields
        this.validatePharmacyData(params);
        const profileData = {
            email: params.email,
            pharmacyName: params.pharmacyName,
            phoneNumber: params.phoneNumber,
            address: params.address,
            role: 'pharmacy',
            isActive: true,
            ...(params.locationData && { locationData: params.locationData }),
        };
        return this.createUserWithProfile({
            userType: 'pharmacy',
            email: params.email,
            password: params.password,
            profileData,
        });
    }
    /**
     * Create courier user with specific validation
     */
    static async createCourierUser(params) {
        // Validate courier-specific fields
        this.validateCourierData(params);
        const profileData = {
            email: params.email,
            fullName: params.fullName,
            phoneNumber: params.phoneNumber,
            vehicleType: params.vehicleType,
            licensePlate: params.licensePlate,
            operatingCity: params.operatingCity || '',
            serviceZones: [],
            role: 'courier',
            isActive: true,
            isAvailable: false,
            rating: 0.0,
            totalDeliveries: 0,
        };
        return this.createUserWithProfile({
            userType: 'courier',
            email: params.email,
            password: params.password,
            profileData,
        });
    }
    /**
     * Create admin user with specific validation
     */
    static async createAdminUser(params) {
        // Validate admin-specific fields
        this.validateAdminData(params);
        const adminRole = params.role || 'admin';
        const profileData = {
            fullName: params.fullName,
            role: adminRole,
            isActive: true,
            permissions: adminRole === 'super_admin' ? ['all'] : ['basic'],
        };
        return this.createUserWithProfile({
            userType: 'admin',
            email: params.email,
            password: params.password,
            profileData,
        });
    }
    /**
     * Validate pharmacy creation data
     */
    static validatePharmacyData(params) {
        const required = ['email', 'password', 'pharmacyName', 'phoneNumber', 'address'];
        for (const field of required) {
            if (!params[field] || params[field].trim() === '') {
                throw new Error(`Missing required pharmacy field: ${field}`);
            }
        }
        // Validate email format
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.email)) {
            throw new Error('Invalid email format');
        }
        // Validate password strength
        if (params.password.length < 6) {
            throw new Error('Password must be at least 6 characters long');
        }
    }
    /**
     * Validate courier creation data
     */
    static validateCourierData(params) {
        const required = ['email', 'password', 'fullName', 'phoneNumber', 'vehicleType', 'licensePlate'];
        for (const field of required) {
            if (!params[field] || params[field].trim() === '') {
                throw new Error(`Missing required courier field: ${field}`);
            }
        }
        // Validate email format
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.email)) {
            throw new Error('Invalid email format');
        }
        // Validate password strength
        if (params.password.length < 6) {
            throw new Error('Password must be at least 6 characters long');
        }
    }
    /**
     * Validate admin creation data
     */
    static validateAdminData(params) {
        const required = ['email', 'password', 'fullName'];
        for (const field of required) {
            if (!params[field] || params[field].trim() === '') {
                throw new Error(`Missing required admin field: ${field}`);
            }
        }
        // Validate email format
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.email)) {
            throw new Error('Invalid email format');
        }
        // Validate password strength
        if (params.password.length < 6) {
            throw new Error('Password must be at least 6 characters long');
        }
        // Validate admin role
        if (params.role && !['admin', 'super_admin'].includes(params.role)) {
            throw new Error('Invalid admin role. Must be "admin" or "super_admin"');
        }
    }
    /**
     * Get Firestore collection name for user type
     */
    static getCollectionName(userType) {
        const collections = {
            pharmacy: 'pharmacies',
            courier: 'couriers',
            admin: 'admins',
        };
        return collections[userType];
    }
    /**
     * Hash email for logging (privacy protection)
     */
    static hashEmail(email) {
        // Simple hash for logging (privacy protection)
        let hash = 0;
        for (let i = 0; i < email.length; i++) {
            const char = email.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16).substring(0, 8);
    }
    /**
     * Initialize wallet for newly created user
     */
    static async initializeUserWallet(userId, userType) {
        try {
            // Create wallet document with zero balance
            const walletData = {
                userId,
                userType,
                available: 0,
                held: 0,
                currency: 'XAF', // African market default
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            };
            await this.db.collection('wallets').doc(userId).set(walletData);
            console.log(`💰 Wallet initialized for ${userType} user ${userId} with 0 XAF balance`);
        }
        catch (error) {
            console.error(`⚠️ Wallet initialization failed for user ${userId}: ${error.message}`);
            // Don't throw - wallet creation failure shouldn't block user registration
            // The getWallet endpoint will auto-create if missing
        }
    }
    /**
     * Clean up orphaned user (utility method)
     */
    static async cleanupOrphanUser(email) {
        const actions = [];
        try {
            // Find user by email
            const userRecord = await this.auth.getUserByEmail(email);
            const uid = userRecord.uid;
            // Delete from Firestore collections
            const collections = ['pharmacies', 'couriers', 'admins'];
            for (const collection of collections) {
                const doc = await this.db.collection(collection).doc(uid).get();
                if (doc.exists) {
                    await doc.ref.delete();
                    actions.push(`Deleted from ${collection}`);
                }
            }
            // Clean up related data
            const inventoryQuery = await this.db.collection('pharmacy_inventory')
                .where('pharmacyId', '==', uid)
                .get();
            if (!inventoryQuery.empty) {
                const batch = this.db.batch();
                inventoryQuery.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                actions.push(`Deleted ${inventoryQuery.size} inventory items`);
            }
            // Clean up wallet
            const walletDoc = await this.db.collection('wallets').doc(uid).get();
            if (walletDoc.exists) {
                await walletDoc.ref.delete();
                actions.push('Deleted wallet');
            }
            // Delete from Firebase Auth
            await this.auth.deleteUser(uid);
            actions.push('Deleted Firebase Auth user');
            return {
                success: true,
                message: `Cleanup completed for: ${email}`,
                actions,
            };
        }
        catch (error) {
            if (error.code === 'auth/user-not-found') {
                return {
                    success: true,
                    message: `User not found: ${email} (already clean)`,
                    actions: ['No cleanup needed'],
                };
            }
            throw error;
        }
    }
}
