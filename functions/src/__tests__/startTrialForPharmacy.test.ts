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
  test('subscriptionStatus="trial" → no-op (already_active)', () => {
    expect(shouldStartTrial({ subscriptionStatus: "trial" })).toEqual({
      start: false,
      reason: "already_active",
    });
  });
  test('subscriptionStatus="active" → no-op (already_active)', () => {
    expect(shouldStartTrial({ subscriptionStatus: "active" })).toEqual({
      start: false,
      reason: "already_active",
    });
  });
  test('subscriptionStatus="pendingPayment" + no start date → start', () => {
    expect(shouldStartTrial({ subscriptionStatus: "pendingPayment" })).toEqual({
      start: true,
    });
  });
  test('subscriptionStatus="trial_pending_license" + no start date → start (canonical license-verify flow)', () => {
    expect(
      shouldStartTrial({ subscriptionStatus: "trial_pending_license" })
    ).toEqual({ start: true });
  });
  test("subscriptionStatus missing/null + no start date → start", () => {
    expect(shouldStartTrial({})).toEqual({ start: true });
    expect(shouldStartTrial({ subscriptionStatus: null })).toEqual({
      start: true,
    });
  });

  // Sprint 3 architect HIGH finding (2026-05-14) :
  // the invariant "one trial per pharmacy, ever" must be enforced via
  // a positive trace (subscriptionStartDate set), not only via the
  // current subscriptionStatus. A pharmacy whose status is `expired`
  // (or `cancelled`, or any future post-trial label) but has a past
  // subscriptionStartDate has already consumed its 30-day quota and
  // MUST NOT be granted a second trial.

  test('subscriptionStatus="expired" + NO start date → start (defensive — no past trial recorded)', () => {
    // Defensive baseline : if somehow the status is "expired" but no
    // subscriptionStartDate was ever written, we have no evidence the
    // trial was consumed. The helper grants the trial — this is the
    // safer behaviour for the pharmacy in case of data loss.
    expect(shouldStartTrial({ subscriptionStatus: "expired" })).toEqual({
      start: true,
    });
  });

  test('subscriptionStatus="expired" + subscriptionStartDate set → no-op (trial_already_consumed)', () => {
    expect(
      shouldStartTrial({
        subscriptionStatus: "expired",
        subscriptionStartDate: { toMillis: () => 1700000000000 },
      })
    ).toEqual({ start: false, reason: "trial_already_consumed" });
  });

  test('any past status with subscriptionStartDate set → trial_already_consumed', () => {
    // Future-proofing : whatever post-trial label appears later
    // (cancelled, terminated, churned, …), the start-date trace is
    // enough to short-circuit.
    for (const status of ["expired", "cancelled", "terminated", "unknown"]) {
      expect(
        shouldStartTrial({
          subscriptionStatus: status,
          subscriptionStartDate: 1700000000000,
        })
      ).toEqual({ start: false, reason: "trial_already_consumed" });
    }
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

  // Sprint 3 architect HIGH finding (2026-05-14) :
  // an expired pharmacy with a past subscriptionStartDate must NOT be
  // granted a fresh trial when the admin re-verifies its licence (e.g.
  // pharmacy got verified → trial → expired → admin re-verifies after
  // a renewal). The pharmacy already consumed its quota.

  test('expired + past subscriptionStartDate → no-op, reason=trial_already_consumed', async () => {
    fakeGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        subscriptionStatus: "expired",
        subscriptionStartDate: { toMillis: () => 1700000000000 },
      }),
    });
    const res = await startTrialForPharmacy(fakeDb as any, "uid-consumed");
    expect(res).toEqual({
      started: false,
      reason: "trial_already_consumed",
    });
    expect(fakeUpdate).not.toHaveBeenCalled();
  });

  test('unknown status + past subscriptionStartDate → no-op, reason=trial_already_consumed (future-proofing)', async () => {
    fakeGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        subscriptionStatus: "cancelled",
        subscriptionStartDate: 1700000000000,
      }),
    });
    const res = await startTrialForPharmacy(fakeDb as any, "uid-cancelled");
    expect(res).toEqual({
      started: false,
      reason: "trial_already_consumed",
    });
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
