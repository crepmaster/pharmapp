/**
 * Sprint 3.2c-α.1 — minWithdrawalMinor Zero Semantics.
 *
 * Unit tests for the `resolveMinimumMinor` helper in createWithdrawalRequest.ts.
 * Proves invalid configured values degrade to the fallback table without
 * rejecting a withdrawal, while emitting a structured warn for ops.
 *
 * The file under test calls `getFirestore()` and other firebase-admin APIs
 * at module scope, so we mock the admin SDK before import — same pattern
 * as idempotency-unit.test.ts and payments-unit.test.ts in this folder.
 */
import { jest } from "@jest/globals";

// --- Firebase Admin / logger mocks (required: module scope side effects) ---
jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(() =>
          Promise.resolve({ exists: false, data: () => null })
        ),
      })),
    })),
  })),
  FieldValue: {
    serverTimestamp: jest.fn(() => "mock-timestamp"),
    increment: jest.fn((n: number) => ({ __op: "increment", n })),
  },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Import after mocks are wired.
import {
  MIN_WITHDRAWAL_MINOR_BY_CURRENCY,
  resolveMinimumMinor,
} from "../createWithdrawalRequest.js";

describe("resolveMinimumMinor — 3.2c-α.1 zero semantics", () => {
  let warnCalls: Array<{ message: string; payload: Record<string, unknown> }>;
  let warn: (message: string, payload: Record<string, unknown>) => void;

  beforeEach(() => {
    warnCalls = [];
    warn = (message, payload) => {
      warnCalls.push({ message, payload });
    };
  });

  // T1 — null/absent → fallback, no warn
  test("T1: absent config (undefined) falls back without warning", () => {
    const result = resolveMinimumMinor(undefined, "XAF", warn);
    expect(result).toBe(MIN_WITHDRAWAL_MINOR_BY_CURRENCY.XAF);
    expect(result).toBe(1000);
    expect(warnCalls).toHaveLength(0);
  });

  test("T1b: null config falls back without warning", () => {
    const result = resolveMinimumMinor(null, "GHS", warn);
    expect(result).toBe(MIN_WITHDRAWAL_MINOR_BY_CURRENCY.GHS);
    expect(warnCalls).toHaveLength(0);
  });

  // T2 — > 0 → explicit valid override, no warn
  test("T2: positive override is applied as-is, no warning", () => {
    const result = resolveMinimumMinor(2500, "XAF", warn);
    expect(result).toBe(2500);
    expect(warnCalls).toHaveLength(0);
  });

  // T3 — 0 → warn (invalid_non_positive) + fallback
  test("T3: zero config warns invalid_non_positive and falls back", () => {
    const result = resolveMinimumMinor(0, "XAF", warn);
    expect(result).toBe(MIN_WITHDRAWAL_MINOR_BY_CURRENCY.XAF);
    expect(warnCalls).toHaveLength(1);
    expect(warnCalls[0].payload).toMatchObject({
      currencyCode: "XAF",
      configuredValue: 0,
      reason: "invalid_non_positive",
    });
  });

  // T4 — < 0 → warn (invalid_non_positive) + fallback
  test("T4: negative config warns invalid_non_positive and falls back", () => {
    const result = resolveMinimumMinor(-500, "KES", warn);
    expect(result).toBe(MIN_WITHDRAWAL_MINOR_BY_CURRENCY.KES);
    expect(warnCalls).toHaveLength(1);
    expect(warnCalls[0].payload).toMatchObject({
      currencyCode: "KES",
      configuredValue: -500,
      reason: "invalid_non_positive",
    });
  });

  // T5 — NaN → warn (non_finite) + fallback
  test("T5: NaN config warns non_finite and falls back", () => {
    const result = resolveMinimumMinor(Number.NaN, "NGN", warn);
    expect(result).toBe(MIN_WITHDRAWAL_MINOR_BY_CURRENCY.NGN);
    expect(warnCalls).toHaveLength(1);
    expect(warnCalls[0].payload).toMatchObject({
      currencyCode: "NGN",
      reason: "non_finite",
    });
    expect(Number.isNaN(warnCalls[0].payload.configuredValue)).toBe(true);
  });

  // T6 — Infinity → warn (non_finite) + fallback
  test("T6: Infinity config warns non_finite and falls back", () => {
    const result = resolveMinimumMinor(
      Number.POSITIVE_INFINITY,
      "TZS",
      warn
    );
    expect(result).toBe(MIN_WITHDRAWAL_MINOR_BY_CURRENCY.TZS);
    expect(warnCalls).toHaveLength(1);
    expect(warnCalls[0].payload).toMatchObject({
      currencyCode: "TZS",
      configuredValue: Number.POSITIVE_INFINITY,
      reason: "non_finite",
    });
  });

  test("T6b: -Infinity config warns non_finite and falls back", () => {
    const result = resolveMinimumMinor(
      Number.NEGATIVE_INFINITY,
      "UGX",
      warn
    );
    expect(result).toBe(MIN_WITHDRAWAL_MINOR_BY_CURRENCY.UGX);
    expect(warnCalls).toHaveLength(1);
    expect(warnCalls[0].payload).toMatchObject({
      reason: "non_finite",
    });
  });

  // T7 — non-numeric type → warn (invalid_type) + fallback.
  // The helper takes `unknown`, so we can inject any runtime type here —
  // documented approach per sprint brief (runtime cast via `unknown`).
  test("T7: string config warns invalid_type and falls back", () => {
    const result = resolveMinimumMinor(
      "1000" as unknown,
      "XAF",
      warn
    );
    expect(result).toBe(MIN_WITHDRAWAL_MINOR_BY_CURRENCY.XAF);
    expect(warnCalls).toHaveLength(1);
    expect(warnCalls[0].payload).toMatchObject({
      currencyCode: "XAF",
      configuredValue: "1000",
      reason: "invalid_type",
    });
  });

  test("T7b: boolean config warns invalid_type and falls back", () => {
    const result = resolveMinimumMinor(true as unknown, "GHS", warn);
    expect(result).toBe(MIN_WITHDRAWAL_MINOR_BY_CURRENCY.GHS);
    expect(warnCalls).toHaveLength(1);
    expect(warnCalls[0].payload).toMatchObject({
      reason: "invalid_type",
    });
  });

  // T8 — withdrawal logic SUCCEEDS after invalid config fallback.
  // Simulates the call site's gate: amountMinor >= minimumMinor.
  test("T8: withdrawal passes when amount >= fallback after invalid config", () => {
    // Invalid config (0) triggers fallback to XAF fallback = 1000.
    const minimumMinor = resolveMinimumMinor(0, "XAF", warn);
    expect(minimumMinor).toBe(1000);

    const amountMinor = 1500; // above fallback
    const wouldReject = minimumMinor > 0 && amountMinor < minimumMinor;
    expect(wouldReject).toBe(false);
    // And a warn was emitted so ops can see the bad config.
    expect(warnCalls[0].payload.reason).toBe("invalid_non_positive");
  });

  // T9 — withdrawal REJECTED on effective minimum after fallback
  // (proves enforcement still works when amount < fallback).
  test("T9: withdrawal rejected when amount < fallback after invalid config", () => {
    const minimumMinor = resolveMinimumMinor(
      Number.NaN,
      "XAF",
      warn
    );
    expect(minimumMinor).toBe(1000);

    const amountMinor = 500; // below fallback
    const wouldReject = minimumMinor > 0 && amountMinor < minimumMinor;
    expect(wouldReject).toBe(true);
    expect(warnCalls[0].payload.reason).toBe("non_finite");
  });

  // Extra sanity: unknown currency with absent config returns 0
  // (fallback lookup misses → 0 means "no minimum enforced"). This is
  // pre-existing behavior — documented here to lock it in.
  test("unknown currency + absent config → 0 (no minimum enforced, legacy)", () => {
    const result = resolveMinimumMinor(undefined, "EUR", warn);
    expect(result).toBe(0);
    expect(warnCalls).toHaveLength(0);
  });
});
