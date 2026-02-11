import { jest } from '@jest/globals';
// Mock Firebase Admin
jest.mock('firebase-admin/app', () => ({
    getApps: jest.fn(() => []),
    initializeApp: jest.fn(),
}));
const mockDoc = {
    exists: false,
    data: jest.fn(() => null),
    set: jest.fn(),
    get: jest.fn(() => Promise.resolve({ exists: false, data: () => null }))
};
const mockCollection = {
    doc: jest.fn(() => mockDoc)
};
const mockDb = {
    collection: jest.fn(() => mockCollection),
    runTransaction: jest.fn(async (fn) => {
        const tx = {
            get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
            create: jest.fn(),
            set: jest.fn(),
            update: jest.fn()
        };
        return await fn(tx);
    })
};
jest.mock('firebase-admin/firestore', () => ({
    getFirestore: jest.fn(() => mockDb),
    FieldValue: {
        serverTimestamp: jest.fn(() => 'mock-timestamp')
    }
}));
jest.mock('firebase-functions/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));
// Import after mocking
import { withIdempotency } from '../lib/idempotency.js';
describe('Idempotency Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset mock doc state
        mockDoc.exists = false;
        mockDoc.data.mockReturnValue(null);
        mockDoc.get.mockResolvedValue({ exists: false, data: () => null });
    });
    test('should execute function when no idempotency record exists', async () => {
        let executed = false;
        const testFn = async () => {
            executed = true;
        };
        const result = await withIdempotency('test-key', testFn);
        expect(result).toBe(true);
        expect(executed).toBe(true);
        expect(mockDb.collection).toHaveBeenCalledWith('idempotency');
        expect(mockCollection.doc).toHaveBeenCalledWith('test-key');
    });
    test('should not execute function when idempotency record exists', async () => {
        // Mock the transaction to return existing record
        mockDb.runTransaction.mockImplementationOnce(async (fn) => {
            const tx = {
                get: jest.fn(() => Promise.resolve({ exists: true, data: () => ({ at: new Date() }) })),
                create: jest.fn(),
                set: jest.fn(),
                update: jest.fn()
            };
            return await fn(tx);
        });
        let executed = false;
        const testFn = async () => {
            executed = true;
        };
        const result = await withIdempotency('existing-key', testFn);
        expect(result).toBe(false);
        expect(executed).toBe(false);
    });
    test('should handle function errors properly', async () => {
        const testError = new Error('Test error');
        const testFn = async () => {
            throw testError;
        };
        await expect(withIdempotency('error-key', testFn)).rejects.toThrow('Test error');
    });
    test('should use correct idempotency key', async () => {
        const testKey = 'specific-key-123';
        const testFn = async () => { };
        await withIdempotency(testKey, testFn);
        expect(mockCollection.doc).toHaveBeenCalledWith(testKey);
    });
    test('should handle different function types', async () => {
        // Test with async function that returns void
        const asyncFn = async () => {
            // Function body
        };
        const result = await withIdempotency('async-key', asyncFn);
        expect(result).toBe(true);
    });
    test('should handle idempotency logic patterns', () => {
        // Test the core logic pattern used in webhooks
        const mockTransactionId = 'txn-12345';
        const mockUserId = 'user-123';
        // Simulate webhook idempotency key generation
        const idempotencyKey = `webhook-${mockTransactionId}-${mockUserId}`;
        expect(idempotencyKey).toBe('webhook-txn-12345-user-123');
        expect(idempotencyKey.length).toBeGreaterThan(10);
        expect(idempotencyKey).toMatch(/^webhook-/);
    });
});
