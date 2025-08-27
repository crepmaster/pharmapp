describe('Jest Setup Test', () => {
  test('should run basic test', () => {
    expect(2 + 2).toBe(4);
  });

  test('should handle async operations', async () => {
    const promise = Promise.resolve('test');
    await expect(promise).resolves.toBe('test');
  });
});