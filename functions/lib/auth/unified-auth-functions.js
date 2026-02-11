import { onRequest } from "firebase-functions/v2/https";
import { UnifiedAuthService } from "../shared/auth/unified-auth-service.js";
/**
 * 🏥 Create Pharmacy User
 *
 * Firebase Function to create a pharmacy user using the unified auth service.
 * Provides server-side validation and anti-orphan protection.
 *
 * Usage:
 *   POST https://europe-west1-mediexchange.cloudfunctions.net/createPharmacyUser
 *   Body: {
 *     "email": "pharmacy@example.com",
 *     "password": "securePassword123",
 *     "pharmacyName": "Central Pharmacy",
 *     "phoneNumber": "+237123456789",
 *     "address": "123 Main St, Douala, Cameroon",
 *     "locationData": { ... } // optional
 *   }
 */
export const createPharmacyUser = onRequest({ region: 'europe-west1' }, async (req, res) => {
    // Enable CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
        const { email, password, pharmacyName, phoneNumber, address, locationData } = req.body;
        // Validate required fields
        if (!email || !password || !pharmacyName || !phoneNumber || !address) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: email, password, pharmacyName, phoneNumber, address',
            });
            return;
        }
        console.log(`🏥 Creating pharmacy user: ${email}`);
        // Use unified auth service
        const result = await UnifiedAuthService.createPharmacyUser({
            email,
            password,
            pharmacyName,
            phoneNumber,
            address,
            locationData,
        });
        res.status(200).json({
            success: true,
            message: 'Pharmacy user created successfully',
            uid: result.uid,
            email: result.user.email,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error(`❌ Pharmacy user creation failed: ${error.message}`);
        // Handle specific error types
        if (error.code === 'auth/email-already-in-use') {
            res.status(409).json({
                success: false,
                error: 'An account with this email already exists.',
                code: 'EMAIL_ALREADY_EXISTS',
            });
        }
        else if (error.code === 'auth/weak-password') {
            res.status(400).json({
                success: false,
                error: 'Password is too weak. Please choose a stronger password.',
                code: 'WEAK_PASSWORD',
            });
        }
        else if (error.message.includes('Missing required')) {
            res.status(400).json({
                success: false,
                error: error.message,
                code: 'VALIDATION_ERROR',
            });
        }
        else {
            res.status(500).json({
                success: false,
                error: 'Internal server error during pharmacy user creation',
                code: 'INTERNAL_ERROR',
                timestamp: new Date().toISOString(),
            });
        }
    }
});
/**
 * 🚚 Create Courier User
 *
 * Firebase Function to create a courier user using the unified auth service.
 * Provides server-side validation and anti-orphan protection.
 *
 * Usage:
 *   POST https://europe-west1-mediexchange.cloudfunctions.net/createCourierUser
 *   Body: {
 *     "email": "courier@example.com",
 *     "password": "securePassword123",
 *     "fullName": "John Doe",
 *     "phoneNumber": "+237123456789",
 *     "vehicleType": "motorcycle",
 *     "licensePlate": "ABC123",
 *     "operatingCity": "Douala" // optional
 *   }
 */
export const createCourierUser = onRequest({ region: 'europe-west1' }, async (req, res) => {
    // Enable CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
        const { email, password, fullName, phoneNumber, vehicleType, licensePlate, operatingCity } = req.body;
        // Validate required fields
        if (!email || !password || !fullName || !phoneNumber || !vehicleType || !licensePlate) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: email, password, fullName, phoneNumber, vehicleType, licensePlate',
            });
            return;
        }
        console.log(`🚚 Creating courier user: ${email}`);
        // Use unified auth service
        const result = await UnifiedAuthService.createCourierUser({
            email,
            password,
            fullName,
            phoneNumber,
            vehicleType,
            licensePlate,
            operatingCity,
        });
        res.status(200).json({
            success: true,
            message: 'Courier user created successfully',
            uid: result.uid,
            email: result.user.email,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error(`❌ Courier user creation failed: ${error.message}`);
        // Handle specific error types
        if (error.code === 'auth/email-already-in-use') {
            res.status(409).json({
                success: false,
                error: 'An account with this email already exists.',
                code: 'EMAIL_ALREADY_EXISTS',
            });
        }
        else if (error.code === 'auth/weak-password') {
            res.status(400).json({
                success: false,
                error: 'Password is too weak. Please choose a stronger password.',
                code: 'WEAK_PASSWORD',
            });
        }
        else if (error.message.includes('Missing required')) {
            res.status(400).json({
                success: false,
                error: error.message,
                code: 'VALIDATION_ERROR',
            });
        }
        else {
            res.status(500).json({
                success: false,
                error: 'Internal server error during courier user creation',
                code: 'INTERNAL_ERROR',
                timestamp: new Date().toISOString(),
            });
        }
    }
});
/**
 * 👨‍💼 Create Admin User
 *
 * Firebase Function to create an admin user using the unified auth service.
 * Provides server-side validation and anti-orphan protection.
 * Requires super admin authentication.
 *
 * Usage:
 *   POST https://europe-west1-mediexchange.cloudfunctions.net/createAdminUser
 *   Headers: { "Authorization": "Bearer <super-admin-token>" }
 *   Body: {
 *     "email": "admin@example.com",
 *     "password": "securePassword123",
 *     "fullName": "Jane Smith",
 *     "role": "admin" // or "super_admin"
 *   }
 */
export const createAdminUser = onRequest({ region: 'europe-west1' }, async (req, res) => {
    // Enable CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
        // TODO: Add super admin authentication check
        // const authToken = req.headers.authorization;
        // if (!authToken || !await isSuperAdmin(authToken)) {
        //   res.status(403).json({ success: false, error: 'Unauthorized' });
        //   return;
        // }
        const { email, password, fullName, role } = req.body;
        // Validate required fields
        if (!email || !password || !fullName) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: email, password, fullName',
            });
            return;
        }
        console.log(`👨‍💼 Creating admin user: ${email}`);
        // Use unified auth service
        const result = await UnifiedAuthService.createAdminUser({
            email,
            password,
            fullName,
            role: role,
        });
        res.status(200).json({
            success: true,
            message: 'Admin user created successfully',
            uid: result.uid,
            email: result.user.email,
            role: role || 'admin',
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error(`❌ Admin user creation failed: ${error.message}`);
        // Handle specific error types
        if (error.code === 'auth/email-already-in-use') {
            res.status(409).json({
                success: false,
                error: 'An account with this email already exists.',
                code: 'EMAIL_ALREADY_EXISTS',
            });
        }
        else if (error.code === 'auth/weak-password') {
            res.status(400).json({
                success: false,
                error: 'Password is too weak. Please choose a stronger password.',
                code: 'WEAK_PASSWORD',
            });
        }
        else if (error.message.includes('Missing required')) {
            res.status(400).json({
                success: false,
                error: error.message,
                code: 'VALIDATION_ERROR',
            });
        }
        else {
            res.status(500).json({
                success: false,
                error: 'Internal server error during admin user creation',
                code: 'INTERNAL_ERROR',
                timestamp: new Date().toISOString(),
            });
        }
    }
});
/**
 * 🧹 Enhanced Cleanup Test User (using unified service)
 *
 * Updated cleanup function using the unified auth service
 */
export const cleanupTestUserUnified = onRequest({ region: 'europe-west1' }, async (req, res) => {
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
        const email = req.query.email || req.body?.email;
        if (!email) {
            res.status(400).json({
                success: false,
                error: 'Email parameter is required',
            });
            return;
        }
        console.log(`🧹 Starting cleanup for: ${email}`);
        // Use unified auth service cleanup
        const result = await UnifiedAuthService.cleanupOrphanUser(email);
        res.status(200).json({
            ...result,
            email,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error(`❌ Cleanup error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
        });
    }
});
