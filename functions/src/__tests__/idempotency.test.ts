import { withIdempotency } from '../lib/idempotency.js';
import { db } from './setup.js';

describe('Idempotency', () => {
  const testKey = 'test-key-123';

  test('should execute function on first call', async () => {
    let executed = false;
    const mockFn = jest.fn(async () => {
      executed = true;
    });

    const result = await withIdempotency(testKey, mockFn);

    expect(result).toBe(true);
    expect(executed).toBe(true);
    expect(mockFn).toHaveBeenCalledTimes(1);

    // Verify idempotency record was created
    const doc = await db.collection('idempotency').doc(testKey).get();
    expect(doc.exists).toBe(true);
  });

  test('should not execute function on subsequent calls with same key', async () => {
    const mockFn = jest.fn(async () => {
      throw new Error('Should not be called');
    });

    // Create idempotency record first
    await db.collection('idempotency').doc(testKey).set({
      at: new Date()
    });

    const result = await withIdempotency(testKey, mockFn);

    expect(result).toBe(false);
    expect(mockFn).not.toHaveBeenCalled();
  });

  test('should handle different keys independently', async () => {
    const key1 = 'key-1';
    const key2 = 'key-2';
    
    let count = 0;
    const mockFn = jest.fn(async () => {
      count++;
    });

    const result1 = await withIdempotency(key1, mockFn);
    const result2 = await withIdempotency(key2, mockFn);

    expect(result1).toBe(true);
    expect(result2).toBe(true);
    expect(mockFn).toHaveBeenCalledTimes(2);
    expect(count).toBe(2);
  });

  test('should handle concurrent calls with same key', async () => {
    let executionCount = 0;
    const mockFn = jest.fn(async () => {
      executionCount++;
      // Add small delay to simulate work
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    // Execute multiple concurrent calls with same key
    const promises = [
      withIdempotency(testKey, mockFn),
      withIdempotency(testKey, mockFn),
      withIdempotency(testKey, mockFn)
    ];

    const results = await Promise.all(promises);

    // Only one should have executed
    const successCount = results.filter((r: any) => r === true).length;
    expect(successCount).toBe(1);
    expect(executionCount).toBe(1);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });
});