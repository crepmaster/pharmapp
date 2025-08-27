import { topupIntent } from '../index.js';
import { testEnv, db } from './setup.js';
import { FieldValue } from 'firebase-admin/firestore';

describe('Payment Functions', () => {
  describe('topupIntent', () => {
    const createMockRequest = (body: any, method = 'POST', contentType = 'application/json') => ({
      method,
      headers: { 'content-type': contentType },
      body
    });

    const createMockResponse = () => {
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis()
      };
      return res;
    };

    test('should create payment intent successfully', async () => {
      const req = createMockRequest({
        userId: 'test_user_123',
        method: 'mtn_momo',
        amount: 1000,
        currency: 'XAF'
      });
      const res = createMockResponse();

      // Call the function directly since it's an HTTP function
      await topupIntent(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: expect.any(String),
          status: 'pending'
        })
      );

      // Verify payment document was created
      const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
      const paymentId = jsonCall.paymentId;
      
      const paymentDoc = await db.collection('payments').doc(paymentId).get();
      expect(paymentDoc.exists).toBe(true);
      
      const paymentData = paymentDoc.data();
      expect(paymentData).toMatchObject({
        userId: 'test_user_123',
        method: 'mtn_momo',
        amount: 1000,
        currency: 'XAF',
        status: 'pending'
      });
    });

    test('should reject non-POST requests', async () => {
      const req = createMockRequest({}, 'GET');
      const res = createMockResponse();

      await topupIntent(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.send).toHaveBeenCalledWith('method not allowed');
    });

    test('should reject non-JSON content type', async () => {
      const req = createMockRequest({}, 'POST', 'text/plain');
      const res = createMockResponse();

      await topupIntent(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(415);
      expect(res.send).toHaveBeenCalledWith('use application/json');
    });

    test('should validate required fields', async () => {
      const req = createMockRequest({
        // Missing userId, method, amount
        currency: 'XAF'
      });
      const res = createMockResponse();

      await topupIntent(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          code: 'VALIDATION_ERROR',
          errors: expect.arrayContaining([
            expect.objectContaining({ field: 'userId', code: 'REQUIRED' }),
            expect.objectContaining({ field: 'method', code: 'REQUIRED' }),
            expect.objectContaining({ field: 'amount', code: 'REQUIRED' })
          ])
        })
      );
    });

    test('should validate payment method', async () => {
      const req = createMockRequest({
        userId: 'test_user_123',
        method: 'invalid_method',
        amount: 1000,
        currency: 'XAF'
      });
      const res = createMockResponse();

      await topupIntent(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({ 
              field: 'method', 
              code: 'INVALID_METHOD',
              message: expect.stringContaining('mtn_momo, orange_money')
            })
          ])
        })
      );
    });

    test('should validate userId format', async () => {
      const req = createMockRequest({
        userId: 'invalid@user.id',
        method: 'mtn_momo',
        amount: 1000,
        currency: 'XAF'
      });
      const res = createMockResponse();

      await topupIntent(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({ 
              field: 'userId', 
              code: 'INVALID_FORMAT'
            })
          ])
        })
      );
    });

    test('should validate amount', async () => {
      const req = createMockRequest({
        userId: 'test_user_123',
        method: 'mtn_momo',
        amount: -100,
        currency: 'XAF'
      });
      const res = createMockResponse();

      await topupIntent(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({ 
              field: 'amount', 
              code: 'NON_POSITIVE'
            })
          ])
        })
      );
    });

    test('should default currency to XAF', async () => {
      const req = createMockRequest({
        userId: 'test_user_123',
        method: 'orange_money',
        amount: 500
        // currency not provided
      });
      const res = createMockResponse();

      await topupIntent(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(201);

      const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
      const paymentId = jsonCall.paymentId;
      
      const paymentDoc = await db.collection('payments').doc(paymentId).get();
      const paymentData = paymentDoc.data();
      expect(paymentData?.currency).toBe('XAF');
    });

    test('should handle msisdn field', async () => {
      const req = createMockRequest({
        userId: 'test_user_123',
        method: 'mtn_momo',
        amount: 1000,
        currency: 'XAF',
        msisdn: '+237123456789'
      });
      const res = createMockResponse();

      await topupIntent(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(201);

      const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
      const paymentId = jsonCall.paymentId;
      
      const paymentDoc = await db.collection('payments').doc(paymentId).get();
      const paymentData = paymentDoc.data();
      expect(paymentData?.msisdn).toBe('+237123456789');
    });
  });
});