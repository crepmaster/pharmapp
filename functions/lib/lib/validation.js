import * as logger from "firebase-functions/logger";
export class AppError extends Error {
    code;
    statusCode;
    details;
    constructor(code, message, statusCode = 500, details) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.name = "AppError";
    }
}
// Common validation patterns
export const validators = {
    required: (value, field) => {
        if (value == null || value === "") {
            return { field, message: `${field} is required`, code: "REQUIRED" };
        }
        return null;
    },
    string: (value, field, options) => {
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
    number: (value, field, options) => {
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
    currency: (value, field) => {
        if (typeof value !== "string") {
            return { field, message: `${field} must be a string`, code: "INVALID_TYPE" };
        }
        const validCurrencies = ["XAF", "USD", "EUR"];
        if (!validCurrencies.includes(value)) {
            return { field, message: `${field} must be one of: ${validCurrencies.join(", ")}`, code: "INVALID_CURRENCY" };
        }
        return null;
    },
    userId: (value, field) => {
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
    amount: (value, field) => {
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
export function validateFields(data, rules) {
    const errors = [];
    for (const [field, validator] of Object.entries(rules)) {
        const error = validator(data[field], field);
        if (error) {
            errors.push(error);
        }
    }
    return errors;
}
export function sendValidationError(res, errors) {
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
export function sendError(res, error) {
    if (error instanceof AppError) {
        logger.warn("Application error", { code: error.code, message: error.message, details: error.details });
        res.status(error.statusCode).json({
            ok: false,
            code: error.code,
            message: error.message,
            ...(error.details && { details: error.details })
        });
    }
    else {
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
    INSUFFICIENT_FUNDS: (detail) => new AppError("INSUFFICIENT_FUNDS", "Insufficient funds", 409, detail),
    WALLET_NOT_FOUND: (userId) => new AppError("WALLET_NOT_FOUND", `Wallet not found for user ${userId}`, 404),
    EXCHANGE_NOT_FOUND: (exchangeId) => new AppError("EXCHANGE_NOT_FOUND", `Exchange ${exchangeId} not found`, 404),
    EXCHANGE_INVALID_STATUS: (status, expected) => new AppError("EXCHANGE_INVALID_STATUS", `Exchange status is ${status}, expected ${expected}`, 409),
    WEBHOOK_UNAUTHORIZED: () => new AppError("WEBHOOK_UNAUTHORIZED", "Invalid webhook token", 401),
    IDEMPOTENCY_CONFLICT: () => new AppError("IDEMPOTENCY_CONFLICT", "Operation already processed", 409, { retryable: false }),
    USER_NOT_FOUND: (userId) => new AppError("USER_NOT_FOUND", `User ${userId} not found`, 404),
    SUBSCRIPTION_REQUIRED: (action) => new AppError("SUBSCRIPTION_REQUIRED", `Active subscription required for ${action}`, 403),
    PLAN_UPGRADE_REQUIRED: (currentPlan, requiredPlan) => new AppError("PLAN_UPGRADE_REQUIRED", `${requiredPlan} plan required (current: ${currentPlan})`, 403)
};
