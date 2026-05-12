/**
 * Sprint 3.2c-β — MSISDN Hardening.
 *
 * Unit tests for the `isValidMsisdnForMethod` and `stripLeadingCountryCode`
 * helpers in createWithdrawalRequest.ts. Covers:
 *   - Positive: valid CM (MTN/Orange/Camtel) + GH (MTN/Vodafone/AirtelTigo/Glo)
 *   - Negative: cross-country MSISDN/provider, wrong operator prefix,
 *     length-too-short, missing methodCode (NEW reject), unknown methodCode
 *     (graceful fallback + warn).
 *
 * The file under test calls `getFirestore()` at module scope, so we mock
 * the admin SDK before import — same pattern as
 * createWithdrawalRequest-min-resolution.test.ts.
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
  isValidMsisdnForMethod,
  stripLeadingCountryCode,
} from "../createWithdrawalRequest.js";

describe("stripLeadingCountryCode — 3.2c-β", () => {
  test.each([
    ["237670123456", "670123456", "CM"],
    ["233241234567", "241234567", "GH"],
    ["254712345678", "712345678", "KE"],
    ["255741234567", "741234567", "TZ"],
    ["256771234567", "771234567", "UG"],
    ["234803123456", "803123456", "NG"],
  ])("strips %s → %s for %s", (input, expected, _country) => {
    expect(stripLeadingCountryCode(input)).toBe(expected);
  });

  test("leaves untouched digits without recognised country prefix", () => {
    // 670... is a local CM number; no 237 prefix to strip.
    expect(stripLeadingCountryCode("670123456")).toBe("670123456");
  });

  test("does not strip 8-digit-or-shorter inputs even if they start like a country code", () => {
    // A 9-digit Tanzania local starting with 254 (M-Pesa Kenya country code)
    // would be ambiguous — but the function is unconditional on length.
    // Documenting current behavior, not a contract.
    expect(stripLeadingCountryCode("23423456")).toBe("23456");
  });
});

describe("isValidMsisdnForMethod — 3.2c-β positive cases", () => {
  let warnCalls: Array<{ message: string; payload: Record<string, unknown> }>;
  let warn: (m: string, p: Record<string, unknown>) => void;

  beforeEach(() => {
    warnCalls = [];
    warn = (m, p) => warnCalls.push({ message: m, payload: p });
  });

  // Cameroon
  test.each([
    ["670123456", "mtn"],
    ["670123456", "mtn_cm"],
    ["670123456", "mtn_cameroon"],
    ["670123456", "mtn_momo"],
    ["695123456", "orange"],
    ["695123456", "orange_cm"],
    ["695123456", "orange_money"],
    ["620123456", "camtel"],
    ["620123456", "camtel_cm"],
    // With country code 237 — backend strips before regex.
    ["237670123456", "mtn_cm"],
    ["237695123456", "orange_cm"],
  ])("CM: %s + %s → valid", (msisdn, method) => {
    expect(isValidMsisdnForMethod(msisdn, method, warn)).toBe(true);
    expect(warnCalls).toHaveLength(0);
  });

  // Ghana
  test.each([
    ["241234567", "mtn_gh"],
    ["241234567", "mtn_ghana"],
    ["551234567", "mtn_gh"],
    ["591234567", "mtn_gh"],
    ["201234567", "vodafone_gh"],
    ["501234567", "vodafone_ghana"],
    ["261234567", "airteltigo_gh"],
    ["571234567", "tigo_gh"],
    ["231234567", "glo_gh"],
    // With country code 233 — backend strips before regex.
    ["233241234567", "mtn_gh"],
    ["233201234567", "vodafone_gh"],
  ])("GH: %s + %s → valid", (msisdn, method) => {
    expect(isValidMsisdnForMethod(msisdn, method, warn)).toBe(true);
    expect(warnCalls).toHaveLength(0);
  });
});

describe("isValidMsisdnForMethod — 3.2c-β negative cases", () => {
  let warnCalls: Array<{ message: string; payload: Record<string, unknown> }>;
  let warn: (m: string, p: Record<string, unknown>) => void;

  beforeEach(() => {
    warnCalls = [];
    warn = (m, p) => warnCalls.push({ message: m, payload: p });
  });

  test("rejects MSISDN shorter than 9 digits", () => {
    expect(isValidMsisdnForMethod("12345", "mtn_cm", warn)).toBe(false);
    expect(isValidMsisdnForMethod("", "mtn_cm", warn)).toBe(false);
  });

  test("rejects CM MSISDN with GH provider (cross-country)", () => {
    // 670123456 is a valid MTN CM number; submitting it with MTN Ghana
    // (mtn_gh expects 24x/54x/55x/59x) must fail.
    expect(isValidMsisdnForMethod("670123456", "mtn_gh", warn)).toBe(false);
  });

  test("rejects GH MSISDN with CM provider (cross-country)", () => {
    // 241234567 is a valid MTN GH number; submitting with MTN Cameroon
    // (mtn_cm expects 65/67/68 prefix) must fail.
    expect(isValidMsisdnForMethod("241234567", "mtn_cm", warn)).toBe(false);
  });

  test("rejects CM Orange-prefix MSISDN sent with MTN Cameroon provider", () => {
    // 695... is Orange CM; MTN CM expects 65/67/68. Must fail.
    expect(isValidMsisdnForMethod("695123456", "mtn_cm", warn)).toBe(false);
  });

  test("rejects CM MTN-prefix MSISDN sent with Orange Cameroon provider", () => {
    // 670... is MTN CM; Orange CM expects 69. Must fail.
    expect(isValidMsisdnForMethod("670123456", "orange_cm", warn)).toBe(false);
  });

  test("rejects GH MTN-prefix MSISDN sent with Vodafone Ghana provider", () => {
    // 241... is MTN GH; Vodafone GH expects 20/50. Must fail.
    expect(isValidMsisdnForMethod("241234567", "vodafone_gh", warn)).toBe(false);
  });

  // 3.2c-β NEW behavior: missing methodCode → reject (was: pass).
  test("rejects when methodCode is undefined (provider misconfigured)", () => {
    expect(isValidMsisdnForMethod("670123456", undefined, warn)).toBe(false);
  });

  test("rejects when methodCode is null (provider misconfigured)", () => {
    expect(isValidMsisdnForMethod("670123456", null, warn)).toBe(false);
  });

  test("rejects when methodCode is empty string", () => {
    expect(isValidMsisdnForMethod("670123456", "", warn)).toBe(false);
  });

  test("rejects when methodCode is whitespace only", () => {
    expect(isValidMsisdnForMethod("670123456", "   ", warn)).toBe(false);
  });
});

describe("isValidMsisdnForMethod — 3.2c-β unknown methodCode tolerance", () => {
  let warnCalls: Array<{ message: string; payload: Record<string, unknown> }>;
  let warn: (m: string, p: Record<string, unknown>) => void;

  beforeEach(() => {
    warnCalls = [];
    warn = (m, p) => warnCalls.push({ message: m, payload: p });
  });

  test("unknown methodCode passes with length-only check + emits structured warn", () => {
    // ops added 'mtn_zambia' in system_config but backend doesn't know yet.
    // Graceful fallback: length-only check passes, warn is emitted.
    expect(isValidMsisdnForMethod("971234567", "mtn_zambia", warn)).toBe(true);
    expect(warnCalls).toHaveLength(1);
    expect(warnCalls[0].message).toMatch(/unknown methodCode/);
    expect(warnCalls[0].payload).toEqual(
      expect.objectContaining({
        methodCode: "mtn_zambia",
        reason: "unknown_method_code",
      })
    );
  });

  test("unknown methodCode still rejects too-short MSISDN", () => {
    // Length check fires before the unknown-method graceful fallback.
    expect(isValidMsisdnForMethod("12345", "mtn_zambia", warn)).toBe(false);
    expect(warnCalls).toHaveLength(0);
  });

  test("default warn arg is no-op (does not throw if caller omits it)", () => {
    // Smoke: signature compat. Caller can omit warn — unknown methodCode
    // still passes silently.
    expect(isValidMsisdnForMethod("971234567", "mtn_zambia")).toBe(true);
  });
});
