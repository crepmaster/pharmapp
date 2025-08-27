import * as logger from "firebase-functions/logger";

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
  statusCode: number;
}

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = "AppError";
  }
}

// Common validation patterns
export const validators = {
  required: (value: any, field: string): ValidationError | null => {
    if (value == null || value === "") {
      return { field, message: `${field} is required`, code: "REQUIRED" };
    }
    return null;
  },

  string: (value: any, field: string, options?: { minLength?: number; maxLength?: number }): ValidationError | null => {
    if (typeof value !== "string") {
      return { field, message: `${field} must be a string`, code: "INVALID_TYPE" };
    }
    if (options?.minLength && value.length < options.minLength) {
      return { field, message: `${field} must be at least ${options.minLength} characters`, code: "TOO_SHORT" };
    }
    if (options?.maxLength && value.length > options.maxLength) {
      return { field, message: `${field} must be at most ${options.maxLength} characters`, code: "TOO_LONG" };
    }
    return null;
  },

  number: (value: any, field: string, options?: { min?: number; max?: number; integer?: boolean }): ValidationError | null => {
    const num = Number(value);
    if (isNaN(num)) {
      return { field, message: `${field} must be a valid number`, code: "INVALID_NUMBER" };
    }
    if (options?.integer && !Number.isInteger(num)) {
      return { field, message: `${field} must be an integer`, code: "NOT_INTEGER" };
    }
    if (options?.min !== undefined && num < options.min) {
      return { field, message: `${field} must be at least ${options.min}`, code: "TOO_SMALL" };
    }
    if (options?.max !== undefined && num > options.max) {
      return { field, message: `${field} must be at most ${options.max}`, code: "TOO_LARGE" };
    }
    return null;
  },

  currency: (value: any, field: string): ValidationError | null => {
    if (typeof value !== "string") {
      return { field, message: `${field} must be a string`, code: "INVALID_TYPE" };
    }
    const validCurrencies = ["XAF", "USD", "EUR"];
    if (!validCurrencies.includes(value)) {
      return { field, message: `${field} must be one of: ${validCurrencies.join(", ")}`, code: "INVALID_CURRENCY" };
    }
    return null;
  },

  userId: (value: any, field: string): ValidationError | null => {
    if (typeof value !== "string") {
      return { field, message: `${field} must be a string`, code: "INVALID_TYPE" };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      return { field, message: `${field} can only contain letters, numbers, underscores, and hyphens`, code: "INVALID_FORMAT" };
    }
    if (value.length < 3 || value.length > 50) {
      return { field, message: `${field} must be between 3 and 50 characters`, code: "INVALID_LENGTH" };
    }
    return null;
  },

  amount: (value: any, field: string): ValidationError | null => {
    const num = Number(value);
    if (isNaN(num)) {
      return { field, message: `${field} must be a valid number`, code: "INVALID_NUMBER" };
    }
    if (num <= 0) {
      return { field, message: `${field} must be greater than 0`, code: "NON_POSITIVE" };
    }
    if (num > 10000000) { // 10M max
      return { field, message: `${field} exceeds maximum allowed amount`, code: "TOO_LARGE" };
    }
    if (num % 1 !== 0) {
      return { field, message: `${field} must be a whole number (no decimals)`, code: "NOT_INTEGER" };
    }
    return null;
  }
};

export function validateFields(data: any, rules: Record<string, (value: any, field: string) => ValidationError | null>): ValidationError[] {
  const errors: ValidationError[] = [];
  
  for (const [field, validator] of Object.entries(rules)) {
    const error = validator(data[field], field);
    if (error) {
      errors.push(error);
    }
  }
  
  return errors;
}

export function sendValidationError(res: any, errors: ValidationError[]): void {
  logger.warn("Validation failed", { errors });
  res.status(400).json({
    ok: false,
    code: "VALIDATION_ERROR",
    message: "Invalid input data",
    errors: errors.map(e => ({
      field: e.field,
      message: e.message,
      code: e.code
    }))
  });
}

export function sendError(res: any, error: AppError | Error): void {
  if (error instanceof AppError) {
    logger.warn("Application error", { code: error.code, message: error.message, details: error.details });
    res.status(error.statusCode).json({
      ok: false,
      code: error.code,
      message: error.message,
      ...(error.details && { details: error.details })
    });
  } else {
    logger.error("Unexpected error", error);
    res.status(500).json({
      ok: false,
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred"
    });
  }
}

// Business logic error types
export const BusinessErrors = {
  INSUFFICIENT_FUNDS: (detail: string) => new AppError("INSUFFICIENT_FUNDS", "Insufficient funds", 409, detail),
  WALLET_NOT_FOUND: (userId: string) => new AppError("WALLET_NOT_FOUND", `Wallet not found for user ${userId}`, 404),
  EXCHANGE_NOT_FOUND: (exchangeId: string) => new AppError("EXCHANGE_NOT_FOUND", `Exchange ${exchangeId} not found`, 404),
  EXCHANGE_INVALID_STATUS: (status: string, expected: string) => new AppError("EXCHANGE_INVALID_STATUS", `Exchange status is ${status}, expected ${expected}`, 409),
  WEBHOOK_UNAUTHORIZED: () => new AppError("WEBHOOK_UNAUTHORIZED", "Invalid webhook token", 401),
  IDEMPOTENCY_CONFLICT: () => new AppError("IDEMPOTENCY_CONFLICT", "Operation already processed", 409, { retryable: false })
};