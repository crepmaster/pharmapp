/**
 * Sprint 3 — Tests for `startTrialForPharmacy`.
 *
 * Coverage matrix :
 *
 *   Pure helpers
 *     - shouldStartTrial : trial / active → false, anything else → true.
 *     - computeTrialEndDate : exact 30j ; custom N days.
 *
 *   Async transactional helper (with a fake transaction layer)
 *     - missing pharmacy doc → `{ started:false, reason:'pharmacy_not_found' }`.
 *     - `subscriptionStatus: 'pendingPayment'` → starts trial, writes
 *       hasActiveSubscription / status / start / end.
 *     - `subscriptionStatus: 'trial_pending_license'` → starts trial
 *       (this is the canonical license-verify flow).
 *     - `subscriptionStatus: 'trial'` → no-op, `reason:'already_active'`.
 *     - `subscriptionStatus: 'active'` → no-op, `reason:'already_active'`.
 *     - Custom `trialDurationDays` is honoured.
 */
import { jest } from "@jest/globals";

interface FakeDocSnap {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

const fakeGet = jest.fn() as jest.MockedFunction<
  (ref: unknown) => Promise<FakeDocSnap>
>;
const fakeUpdate = jest.fn() as jest.MockedFunction<
  (ref: unknown, data: Record<string, unknown>) => void
>;

const fakePharmacyRef = { __ref: "pharmacies/uid" };
const fakeDb = {
  collection: jest.fn(() => ({
    doc: jest.fn(() => fakePharmacyRef),
  })),
  runTransaction: jest.fn(
    async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      return await fn({
        get: fakeGet,
        update: fakeUpdate,
      });
    }
  ),
};

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

jest.mock("firebase-admin/firestore", () => ({
  Timestamp: {
    fromDate: jest.fn((d: Date) => ({ __ts: d.getTime() })),
  },
  FieldValue: {
    serverTimestamp: jest.fn(() => "server-ts"),
  },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

import {
  computeTrialEndDate,
  shouldStartTrial,
  startTrialForPharmacy,
} from "../lib/startTrialForPharmacy.js";

beforeEach(() => {
  fakeGet.mockReset();
  fakeUpdate.mockReset();
});

describe("shouldStartTrial — pure", () => {
  test('subscriptionStatus="trial" → no-op (false)', () => {
    expect(shouldStartTrial({ subscriptionStatus: "trial" })).toBe(false);
  });
  test('subscriptionStatus="active" → no-op (false)', () => {
    expect(shouldStartTrial({ subscriptionStatus: "active" })).toBe(false);
  });
  test('subscriptionStatus="pendingPayment" → start (true)', () => {
    expect(shouldStartTrial({ subscriptionStatus: "pendingPayment" })).toBe(
      true
    );
  });
  test('subscriptionStatus="trial_pending_license" → start (true)', () => {
    expect(
      shouldStartTrial({ subscriptionStatus: "trial_pending_license" })
    ).toBe(true);
  });
  test("subscriptionStatus missing/null → start (true)", () => {
    expect(shouldStartTrial({})).toBe(true);
    expect(shouldStartTrial({ subscriptionStatus: null })).toBe(true);
  });
  test('unknown status (e.g. "expired") → start (true) — defensive', () => {
    expect(shouldStartTrial({ subscriptionStatus: "expired" })).toBe(true);
  });
});

describe("computeTrialEndDate — pure", () => {
  test("default 30 days", () => {
    const start = new Date("2026-05-13T12:00:00.000Z");
    const end = computeTrialEndDate(start);
    expect(end.toISOString()).toBe("2026-06-12T12:00:00.000Z");
  });
  test("custom N days honoured", () => {
    const start = new Date("2026-05-13T12:00:00.000Z");
    const end = computeTrialEndDate(start, 7);
    expect(end.toISOString()).toBe("2026-05-20T12:00:00.000Z");
  });
});

describe("startTrialForPharmacy — transactional, idempotent", () => {
  test("missing pharmacy doc → pharmacy_not_found, no write", async () => {
    fakeGet.mockResolvedValueOnce({ exists: false, data: () => undefined });
    const res = await startTrialForPharmacy(fakeDb as any, "uid-missing");
    expect(res).toEqual({ started: false, reason: "pharmacy_not_found" });
    expect(fakeUpdate).not.toHaveBeenCalled();
  });

  test('pendingPayment → writes trial fields, started=true', async () => {
    fakeGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ subscriptionStatus: "pendingPayment" }),
    });
    const res = await startTrialForPharmacy(fakeDb as any, "uid-1");
    expect(res).toEqual({ started: true, reason: "started" });
    expect(fakeUpdate).toHaveBeenCalledTimes(1);
    const [, payload] = fakeUpdate.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(payload.hasActiveSubscription).toBe(true);
    expect(payload.subscriptionStatus).toBe("trial");
    expect(payload.subscriptionPlan).toBe("basic");
    expect(payload.subscriptionStartDate).toBeDefined();
    expect(payload.subscriptionEndDate).toBeDefined();
  });

  test('trial_pending_license → starts the trial', async () => {
    // Canonical license-verify flow : a mandatory-country pharmacy was
    // sitting on `trial_pending_license` ; the admin just verified the
    // licence, and `adminVerifyPharmacyLicense` calls us.
    fakeGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ subscriptionStatus: "trial_pending_license" }),
    });
    const res = await startTrialForPharmacy(fakeDb as any, "uid-mandatory");
    expect(res).toEqual({ started: true, reason: "started" });
    expect(fakeUpdate).toHaveBeenCalledTimes(1);
  });

  test('already trial → no-op, started=false, reason=already_active', async () => {
    fakeGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ subscriptionStatus: "trial" }),
    });
    const res = await startTrialForPharmacy(fakeDb as any, "uid-running");
    expect(res).toEqual({ started: false, reason: "already_active" });
    expect(fakeUpdate).not.toHaveBeenCalled();
  });

  test('already active → no-op (double-verify or paid-then-reverify)', async () => {
    fakeGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ subscriptionStatus: "active" }),
    });
    const res = await startTrialForPharmacy(fakeDb as any, "uid-paid");
    expect(res).toEqual({ started: false, reason: "already_active" });
    expect(fakeUpdate).not.toHaveBeenCalled();
  });

  test("custom trialDurationDays propagates into the end date", async () => {
    fakeGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ subscriptionStatus: "pendingPayment" }),
    });
    const before = Date.now();
    await startTrialForPharmacy(fakeDb as any, "uid-2", {
      trialDurationDays: 7,
    });
    const after = Date.now();
    const [, payload] = fakeUpdate.mock.calls[0] as [unknown, Record<string, unknown>];
    const start = (payload.subscriptionStartDate as { __ts: number }).__ts;
    const end = (payload.subscriptionEndDate as { __ts: number }).__ts;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(end - start).toBe(sevenDaysMs);
    expect(start).toBeGreaterThanOrEqual(before);
    expect(start).toBeLessThanOrEqual(after);
  });
});
