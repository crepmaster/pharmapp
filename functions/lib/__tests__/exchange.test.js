import { jest } from '@jest/globals';
// Mock Firebase Admin for exchange tests
const mockTransaction = {
    get: jest.fn(),
    set: jest.fn(),
    update: jest.fn(),
    create: jest.fn()
};
const mockDb = {
    collection: jest.fn(() => ({
        doc: jest.fn(() => ({
            set: jest.fn(),
            get: jest.fn(),
            id: 'mock-doc-id'
        }))
    })),
    runTransaction: jest.fn((fn) => fn(mockTransaction))
};
jest.mock('firebase-admin/firestore', () => ({
    getFirestore: jest.fn(() => mockDb),
    FieldValue: {
        serverTimestamp: jest.fn(() => 'mock-timestamp'),
        increment: jest.fn((value) => ({ increment: value }))
    }
}));
// Import after mocking
import { cancelExchangeTx } from '../lib/exchange.js';
describe('Exchange Functions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('cancelExchangeTx', () => {
        test('should cancel active exchange and return funds', async () => {
            const exchangeId = 'exchange123';
            const mockExchange = {
                status: 'hold_active',
                aId: 'user_a',
                bId: 'user_b',
                holds: { a: 250, b: 250 },
                currency: 'XAF'
            };
            const mockWalletA = { held: 250, available: 1000 };
            const mockWalletB = { held: 250, available: 500 };
            // Mock Firestore responses
            mockTransaction.get
                .mockResolvedValueOnce({ exists: true, data: () => mockExchange }) // exchange
                .mockResolvedValueOnce({ data: () => mockWalletA }) // wallet A
                .mockResolvedValueOnce({ data: () => mockWalletB }); // wallet B
            await cancelExchangeTx(exchangeId);
            // Verify transaction calls
            expect(mockTransaction.get).toHaveBeenCalledTimes(3);
            expect(mockTransaction.update).toHaveBeenCalledTimes(3); // 2 wallets + 1 exchange
            expect(mockTransaction.set).toHaveBeenCalledTimes(2); // 2 ledger entries
            // Verify wallet updates (held -> available)
            expect(mockTransaction.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
                held: { increment: -250 },
                available: { increment: 250 }
            }));
            // Verify exchange status update
            expect(mockTransaction.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
                status: 'canceled',
                cancelReason: 'expired'
            }));
        });
        test('should handle custom cancellation reason', async () => {
            const exchangeId = 'exchange123';
            const customReason = 'user_requested';
            const mockExchange = {
                status: 'hold_active',
                aId: 'user_a',
                bId: 'user_b',
                holds: { a: 100, b: 150 },
                currency: 'XAF'
            };
            const mockWalletA = { held: 100, available: 500 };
            const mockWalletB = { held: 150, available: 300 };
            mockTransaction.get
                .mockResolvedValueOnce({ exists: true, data: () => mockExchange })
                .mockResolvedValueOnce({ data: () => mockWalletA })
                .mockResolvedValueOnce({ data: () => mockWalletB });
            await cancelExchangeTx(exchangeId, customReason);
            // Verify custom reason is used
            expect(mockTransaction.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
                cancelReason: customReason
            }));
            // Verify ledger entries include reason
            expect(mockTransaction.set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
                reason: customReason,
                type: 'hold_release'
            }));
        });
        test('should throw error if exchange not found', async () => {
            const exchangeId = 'nonexistent';
            mockTransaction.get.mockResolvedValueOnce({ exists: false });
            await expect(cancelExchangeTx(exchangeId)).rejects.toThrow('exchange not found');
        });
        test('should do nothing if exchange not in hold_active status', async () => {
            const exchangeId = 'exchange123';
            const mockExchange = {
                status: 'completed', // Not hold_active
                aId: 'user_a',
                bId: 'user_b'
            };
            mockTransaction.get.mockResolvedValueOnce({
                exists: true,
                data: () => mockExchange
            });
            await cancelExchangeTx(exchangeId);
            // Should only read the exchange, no updates
            expect(mockTransaction.get).toHaveBeenCalledTimes(1);
            expect(mockTransaction.update).not.toHaveBeenCalled();
            expect(mockTransaction.set).not.toHaveBeenCalled();
        });
        test('should throw error if held amounts mismatch', async () => {
            const exchangeId = 'exchange123';
            const mockExchange = {
                status: 'hold_active',
                aId: 'user_a',
                bId: 'user_b',
                holds: { a: 250, b: 250 },
                currency: 'XAF'
            };
            const mockWalletA = { held: 200, available: 1000 }; // Insufficient held
            const mockWalletB = { held: 250, available: 500 };
            mockTransaction.get
                .mockResolvedValueOnce({ exists: true, data: () => mockExchange })
                .mockResolvedValueOnce({ data: () => mockWalletA })
                .mockResolvedValueOnce({ data: () => mockWalletB });
            await expect(cancelExchangeTx(exchangeId)).rejects.toThrow('held mismatch');
        });
        test('should handle missing wallet data gracefully', async () => {
            const exchangeId = 'exchange123';
            const mockExchange = {
                status: 'hold_active',
                aId: 'user_a',
                bId: 'user_b',
                holds: { a: 250, b: 250 },
                currency: 'XAF'
            };
            const mockWalletA = null; // Wallet doesn't exist
            const mockWalletB = { held: 250, available: 500 };
            mockTransaction.get
                .mockResolvedValueOnce({ exists: true, data: () => mockExchange })
                .mockResolvedValueOnce({ data: () => mockWalletA })
                .mockResolvedValueOnce({ data: () => mockWalletB });
            await expect(cancelExchangeTx(exchangeId)).rejects.toThrow('held mismatch');
        });
        test('should handle edge case with zero holds', async () => {
            const exchangeId = 'exchange123';
            const mockExchange = {
                status: 'hold_active',
                aId: 'user_a',
                bId: 'user_b',
                holds: { a: 0, b: 0 }, // Zero holds
                currency: 'XAF'
            };
            const mockWalletA = { held: 0, available: 1000 };
            const mockWalletB = { held: 0, available: 500 };
            mockTransaction.get
                .mockResolvedValueOnce({ exists: true, data: () => mockExchange })
                .mockResolvedValueOnce({ data: () => mockWalletA })
                .mockResolvedValueOnce({ data: () => mockWalletB });
            await cancelExchangeTx(exchangeId);
            // Should still process but with zero amounts
            expect(mockTransaction.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
                held: { increment: -0 },
                available: { increment: 0 }
            }));
        });
    });
});
