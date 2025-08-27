import { 
  validators, 
  validateFields, 
  BusinessErrors, 
  AppError,
  sendValidationError,
  sendError 
} from '../lib/validation.js';

describe('Validators', () => {
  describe('required validator', () => {
    test('should pass for valid values', () => {
      expect(validators.required('test', 'field')).toBeNull();
      expect(validators.required(0, 'field')).toBeNull();
      expect(validators.required(false, 'field')).toBeNull();
    });

    test('should fail for null/undefined/empty', () => {
      const error = validators.required(null, 'testField');
      expect(error).toEqual({
        field: 'testField',
        message: 'testField is required',
        code: 'REQUIRED'
      });

      expect(validators.required(undefined, 'field')).toBeTruthy();
      expect(validators.required('', 'field')).toBeTruthy();
    });
  });

  describe('string validator', () => {
    test('should pass for valid strings', () => {
      expect(validators.string('test', 'field')).toBeNull();
      expect(validators.string('hello world', 'field', { minLength: 5, maxLength: 20 })).toBeNull();
    });

    test('should fail for non-strings', () => {
      const error = validators.string(123, 'field');
      expect(error?.code).toBe('INVALID_TYPE');
    });

    test('should validate length constraints', () => {
      const tooShort = validators.string('hi', 'field', { minLength: 5 });
      expect(tooShort?.code).toBe('TOO_SHORT');

      const tooLong = validators.string('very long string', 'field', { maxLength: 5 });
      expect(tooLong?.code).toBe('TOO_LONG');
    });
  });

  describe('number validator', () => {
    test('should pass for valid numbers', () => {
      expect(validators.number(123, 'field')).toBeNull();
      expect(validators.number('456', 'field')).toBeNull();
      expect(validators.number(42.5, 'field')).toBeNull();
    });

    test('should fail for invalid numbers', () => {
      const error = validators.number('not-a-number', 'field');
      expect(error?.code).toBe('INVALID_NUMBER');
    });

    test('should validate integer constraint', () => {
      expect(validators.number(42, 'field', { integer: true })).toBeNull();
      
      const error = validators.number(42.5, 'field', { integer: true });
      expect(error?.code).toBe('NOT_INTEGER');
    });

    test('should validate min/max constraints', () => {
      const tooSmall = validators.number(5, 'field', { min: 10 });
      expect(tooSmall?.code).toBe('TOO_SMALL');

      const tooLarge = validators.number(20, 'field', { max: 15 });
      expect(tooLarge?.code).toBe('TOO_LARGE');
    });
  });

  describe('currency validator', () => {
    test('should pass for valid currencies', () => {
      expect(validators.currency('XAF', 'field')).toBeNull();
      expect(validators.currency('USD', 'field')).toBeNull();
      expect(validators.currency('EUR', 'field')).toBeNull();
    });

    test('should fail for invalid currencies', () => {
      const error = validators.currency('GBP', 'field');
      expect(error?.code).toBe('INVALID_CURRENCY');
      expect(error?.message).toContain('XAF, USD, EUR');
    });

    test('should fail for non-string currencies', () => {
      const error = validators.currency(123, 'field');
      expect(error?.code).toBe('INVALID_TYPE');
    });
  });

  describe('userId validator', () => {
    test('should pass for valid user IDs', () => {
      expect(validators.userId('user123', 'field')).toBeNull();
      expect(validators.userId('user_id', 'field')).toBeNull();
      expect(validators.userId('user-id-123', 'field')).toBeNull();
    });

    test('should fail for invalid format', () => {
      const error = validators.userId('user@domain.com', 'field');
      expect(error?.code).toBe('INVALID_FORMAT');
    });

    test('should fail for invalid length', () => {
      const tooShort = validators.userId('ab', 'field');
      expect(tooShort?.code).toBe('INVALID_LENGTH');

      const tooLong = validators.userId('a'.repeat(51), 'field');
      expect(tooLong?.code).toBe('INVALID_LENGTH');
    });
  });

  describe('amount validator', () => {
    test('should pass for valid amounts', () => {
      expect(validators.amount(100, 'field')).toBeNull();
      expect(validators.amount('500', 'field')).toBeNull();
      expect(validators.amount(1000000, 'field')).toBeNull();
    });

    test('should fail for non-positive amounts', () => {
      const zero = validators.amount(0, 'field');
      expect(zero?.code).toBe('NON_POSITIVE');

      const negative = validators.amount(-100, 'field');
      expect(negative?.code).toBe('NON_POSITIVE');
    });

    test('should fail for decimal amounts', () => {
      const decimal = validators.amount(100.50, 'field');
      expect(decimal?.code).toBe('NOT_INTEGER');
    });

    test('should fail for amounts too large', () => {
      const tooLarge = validators.amount(20000000, 'field');
      expect(tooLarge?.code).toBe('TOO_LARGE');
    });

    test('should fail for invalid numbers', () => {
      const invalid = validators.amount('not-a-number', 'field');
      expect(invalid?.code).toBe('INVALID_NUMBER');
    });
  });
});

describe('validateFields', () => {
  test('should validate multiple fields', () => {
    const data = { name: '', age: 'abc', email: 'test@example.com' };
    const rules = {
      name: validators.required,
      age: (v: any, f: string) => validators.number(v, f, { integer: true }),
      email: validators.required
    };

    const errors = validateFields(data, rules);
    
    expect(errors).toHaveLength(2);
    expect(errors.find((e: any) => e.field === 'name')?.code).toBe('REQUIRED');
    expect(errors.find((e: any) => e.field === 'age')?.code).toBe('INVALID_NUMBER');
  });

  test('should return empty array for valid data', () => {
    const data = { userId: 'test123', amount: 500 };
    const rules = {
      userId: validators.userId,
      amount: validators.amount
    };

    const errors = validateFields(data, rules);
    expect(errors).toHaveLength(0);
  });
});

describe('BusinessErrors', () => {
  test('should create proper error instances', () => {
    const error = BusinessErrors.INSUFFICIENT_FUNDS('Not enough money');
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('INSUFFICIENT_FUNDS');
    expect(error.statusCode).toBe(409);
    expect(error.details).toBe('Not enough money');
  });

  test('should create wallet not found error', () => {
    const error = BusinessErrors.WALLET_NOT_FOUND('user123');
    expect(error.code).toBe('WALLET_NOT_FOUND');
    expect(error.statusCode).toBe(404);
    expect(error.message).toContain('user123');
  });

  test('should create exchange not found error', () => {
    const error = BusinessErrors.EXCHANGE_NOT_FOUND('exchange123');
    expect(error.code).toBe('EXCHANGE_NOT_FOUND');
    expect(error.statusCode).toBe(404);
    expect(error.message).toContain('exchange123');
  });

  test('should create exchange invalid status error', () => {
    const error = BusinessErrors.EXCHANGE_INVALID_STATUS('canceled', 'hold_active');
    expect(error.code).toBe('EXCHANGE_INVALID_STATUS');
    expect(error.statusCode).toBe(409);
    expect(error.message).toContain('canceled');
    expect(error.message).toContain('hold_active');
  });

  test('should create webhook unauthorized error', () => {
    const error = BusinessErrors.WEBHOOK_UNAUTHORIZED();
    expect(error.code).toBe('WEBHOOK_UNAUTHORIZED');
    expect(error.statusCode).toBe(401);
  });
});

describe('Error response functions', () => {
  let mockRes: any;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  test('sendValidationError should format validation errors', () => {
    const errors = [
      { field: 'name', message: 'Name is required', code: 'REQUIRED' },
      { field: 'age', message: 'Age must be a number', code: 'INVALID_NUMBER' }
    ];

    sendValidationError(mockRes, errors);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Invalid input data',
      errors: errors
    });
  });

  test('sendError should handle AppError', () => {
    const error = new AppError('TEST_ERROR', 'Test message', 422, { extra: 'data' });

    sendError(mockRes, error);

    expect(mockRes.status).toHaveBeenCalledWith(422);
    expect(mockRes.json).toHaveBeenCalledWith({
      ok: false,
      code: 'TEST_ERROR',
      message: 'Test message',
      details: { extra: 'data' }
    });
  });

  test('sendError should handle generic Error', () => {
    const error = new Error('Generic error');

    sendError(mockRes, error);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    });
  });
});