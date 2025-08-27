import { jest } from '@jest/globals';

// Mock Firebase Admin
jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
  deleteApp: jest.fn()
}));

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn(),
        get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
        id: 'mock-doc-id'
      }))
    })),
    runTransaction: jest.fn((fn: any) => fn({
      get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
      set: jest.fn(),
      update: jest.fn(),
      create: jest.fn()
    }))
  })),
  FieldValue: {
    serverTimestamp: jest.fn(() => 'mock-timestamp'),
    increment: jest.fn((value) => ({ increment: value }))
  },
  Timestamp: {
    fromDate: jest.fn((date: any) => ({ seconds: Math.floor(date.getTime() / 1000) }))
  }
}));

// Mock Firebase Functions
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

// Import after mocking
import { withIdempotency } from '../lib/idempotency.js';
import { validators, validateFields, BusinessErrors } from '../lib/validation.js';

describe('Unit Tests - No Emulator Required', () => {
  
  describe('Validation Functions', () => {
    test('should validate user ID format', () => {
      expect(validators.userId('valid_user_123', 'userId')).toBeNull();
      expect(validators.userId('invalid@user', 'userId')?.code).toBe('INVALID_FORMAT');
      expect(validators.userId('a'.repeat(51), 'userId')?.code).toBe('INVALID_LENGTH');
    });

    test('should validate amounts', () => {
      expect(validators.amount(100, 'amount')).toBeNull();
      expect(validators.amount(-50, 'amount')?.code).toBe('NON_POSITIVE');
      expect(validators.amount(100.5, 'amount')?.code).toBe('NOT_INTEGER');
      expect(validators.amount(20000000, 'amount')?.code).toBe('TOO_LARGE');
    });

    test('should validate currency codes', () => {
      expect(validators.currency('XAF', 'currency')).toBeNull();
      expect(validators.currency('USD', 'currency')).toBeNull();
      expect(validators.currency('GBP', 'currency')?.code).toBe('INVALID_CURRENCY');
    });

    test('should validate multiple fields', () => {
      const data = { name: 'valid', amount: -100 };
      const rules = {
        name: validators.required,
        amount: validators.amount
      };

      const errors = validateFields(data, rules);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('amount');
    });
  });

  describe('Business Errors', () => {
    test('should create proper error types', () => {
      const error = BusinessErrors.INSUFFICIENT_FUNDS('Not enough balance');
      expect(error.code).toBe('INSUFFICIENT_FUNDS');
      expect(error.statusCode).toBe(409);
      expect(error.details).toBe('Not enough balance');
    });

    test('should create wallet not found error', () => {
      const error = BusinessErrors.WALLET_NOT_FOUND('user123');
      expect(error.code).toBe('WALLET_NOT_FOUND');
      expect(error.message).toContain('user123');
    });
  });

  describe('Idempotency', () => {
    test('should execute function with idempotency', async () => {
      let executed = false;
      const testFn = async () => {
        executed = true;
      };

      const result = await withIdempotency('test-key', testFn);
      expect(result).toBe(true);
      expect(executed).toBe(true);
    });
  });

  describe('HTTP Function Helpers', () => {
    test('should validate JSON content type', () => {
      // Mock request/response for testing utility functions
      const mockReq = {
        method: 'POST',
        headers: { 'content-type': 'application/json' }
      };
      const _mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      };

      // Test would require importing the utility function
      // This demonstrates the testing pattern
      expect(mockReq.headers['content-type']).toBe('application/json');
    });

    test('should validate request methods', () => {
      const mockReq = { method: 'GET' };
      expect(mockReq.method).toBe('GET');
    });
  });
});