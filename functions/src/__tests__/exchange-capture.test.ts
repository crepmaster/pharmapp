import { jest } from '@jest/globals';

// Mock Firebase Admin for exchange capture tests
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
  runTransaction: jest.fn((fn: any) => fn(mockTransaction))
};

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => mockDb),
  FieldValue: {
    serverTimestamp: jest.fn(() => 'mock-timestamp'),
    increment: jest.fn((value) => ({ increment: value }))
  }
}));

jest.mock('firebase-functions/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('firebase-functions/params', () => ({
  defineSecret: jest.fn(() => ({
    value: jest.fn(() => 'mock-secret-value')
  }))
}));

jest.mock('firebase-functions/v2/https', () => ({
  onRequest: jest.fn(() => jest.fn())
}));

// Mock the idempotency utility
jest.mock('../lib/idempotency.js', () => ({
  withIdempotency: jest.fn((key: any, fn: any) => fn())
}));

// Import after mocking
import { exchangeCapture } from '../index.js';

describe('Exchange Capture Enhanced Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockRequest = (body: any) => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body
  });

  const createMockResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis()
  });

  describe('Courier Fee Only (Original Logic)', () => {
    test('should handle courier fee payment without sale transaction', async () => {
      const req = createMockRequest({
        exchangeId: 'exchange123',
        courierId: 'courier_1'
      });
      const res = createMockResponse();

      const mockExchange = {
        status: 'hold_active',
        aId: 'user_a',
        bId: 'user_b',
        holds: { a: 250, b: 250 },
        currency: 'XAF',
        courierFee: 500
      };

      const mockWalletA = { held: 250, available: 1000 };
      const mockWalletB = { held: 250, available: 500 };
      const mockCourierWallet = { exists: false };

      (mockTransaction.get as any)
        .mockResolvedValueOnce({ exists: true, data: () => mockExchange }) // exchange
        .mockResolvedValueOnce({ data: () => mockWalletA }) // wallet A
        .mockResolvedValueOnce({ data: () => mockWalletB }) // wallet B
        .mockResolvedValueOnce(mockCourierWallet); // courier wallet

      await exchangeCapture(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true, status: "completed" });

      // Verify courier receives the total held amount (500)
      expect(mockTransaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          available: { increment: 500 }
        })
      );

      // Verify ledger entries - should have 3 entries for courier fee only
      expect(mockTransaction.set).toHaveBeenCalledTimes(4); // 3 ledger + 1 courier wallet init
    });
  });

  describe('Pharmaceutical Sale Transaction (Enhanced Logic)', () => {
    test('should handle complete pharmaceutical exchange with sale transaction', async () => {
      const req = createMockRequest({
        exchangeId: 'exchange123',
        courierId: 'courier_1',
        saleAmount: 10000,
        sellerId: 'pharmacy_a',
        buyerId: 'pharmacy_b'
      });
      const res = createMockResponse();

      const mockExchange = {
        status: 'hold_active',
        aId: 'user_a',
        bId: 'user_b',
        holds: { a: 250, b: 250 },
        currency: 'XAF',
        courierFee: 500
      };

      const mockWalletA = { held: 250, available: 1000 };
      const mockWalletB = { held: 250, available: 500 };
      const mockCourierWallet = { exists: false };
      const mockBuyerWallet = { available: 15000 }; // Has enough for the purchase
      const mockSellerWallet = { exists: false };

      (mockTransaction.get as any)
        .mockResolvedValueOnce({ exists: true, data: () => mockExchange }) // exchange
        .mockResolvedValueOnce({ data: () => mockWalletA }) // wallet A
        .mockResolvedValueOnce({ data: () => mockWalletB }) // wallet B
        .mockResolvedValueOnce(mockCourierWallet) // courier wallet
        .mockResolvedValueOnce({ data: () => mockBuyerWallet }) // buyer wallet
        .mockResolvedValueOnce(mockSellerWallet); // seller wallet

      await exchangeCapture(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true, status: "completed" });

      // Verify buyer pays the sale amount
      expect(mockTransaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          available: { increment: -10000 }
        })
      );

      // Verify seller receives the sale amount
      expect(mockTransaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          available: { increment: 10000 }
        })
      );

      // Verify courier receives the courier fee (500)
      expect(mockTransaction.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          available: { increment: 500 }
        })
      );

      // Verify ledger entries - should have 5 entries (3 courier + 2 sale)
      expect(mockTransaction.set).toHaveBeenCalledTimes(7); // 5 ledger + 1 courier wallet init + 1 seller wallet init
    });

    test('should reject sale when buyer has insufficient funds', async () => {
      const req = createMockRequest({
        exchangeId: 'exchange123',
        courierId: 'courier_1',
        saleAmount: 10000,
        sellerId: 'pharmacy_a',
        buyerId: 'pharmacy_b'
      });
      const res = createMockResponse();

      const mockExchange = {
        status: 'hold_active',
        aId: 'user_a',
        bId: 'user_b',
        holds: { a: 250, b: 250 },
        currency: 'XAF',
        courierFee: 500
      };

      const mockWalletA = { held: 250, available: 1000 };
      const mockWalletB = { held: 250, available: 500 };
      const mockCourierWallet = { exists: false };
      const mockBuyerWallet = { available: 5000 }; // Not enough for 10000 purchase

      (mockTransaction.get as any)
        .mockResolvedValueOnce({ exists: true, data: () => mockExchange })
        .mockResolvedValueOnce({ data: () => mockWalletA })
        .mockResolvedValueOnce({ data: () => mockWalletB })
        .mockResolvedValueOnce(mockCourierWallet)
        .mockResolvedValueOnce({ data: () => mockBuyerWallet });

      await exchangeCapture(req as any, res as any);

      // Should return error response
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          code: 'INSUFFICIENT_FUNDS'
        })
      );
    });

    test('should validate that seller and buyer are different', async () => {
      const req = createMockRequest({
        exchangeId: 'exchange123',
        courierId: 'courier_1',
        saleAmount: 10000,
        sellerId: 'same_user',
        buyerId: 'same_user' // Same as seller
      });
      const res = createMockResponse();

      await exchangeCapture(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          code: 'EXCHANGE_INVALID_STATUS'
        })
      );
    });
  });

  describe('Validation', () => {
    test('should require both seller and buyer when saleAmount > 0', async () => {
      const req = createMockRequest({
        exchangeId: 'exchange123',
        courierId: 'courier_1',
        saleAmount: 10000,
        sellerId: 'pharmacy_a'
        // buyerId missing
      });
      const res = createMockResponse();

      await exchangeCapture(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          code: 'VALIDATION_ERROR',
          errors: expect.arrayContaining([
            expect.objectContaining({
              field: 'buyerId',
              code: 'REQUIRED_FOR_SALE'
            })
          ])
        })
      );
    });

    test('should reject negative saleAmount', async () => {
      const req = createMockRequest({
        exchangeId: 'exchange123',
        courierId: 'courier_1',
        saleAmount: -1000
      });
      const res = createMockResponse();

      await exchangeCapture(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          code: 'VALIDATION_ERROR',
          errors: expect.arrayContaining([
            expect.objectContaining({
              field: 'saleAmount',
              code: 'INVALID_AMOUNT'
            })
          ])
        })
      );
    });
  });
});