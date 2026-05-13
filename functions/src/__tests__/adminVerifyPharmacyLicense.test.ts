/**
 * Sprint 3 — Tests for `adminVerifyPharmacyLicense` integration with
 * `startTrialForPharmacy`.
 *
 * Sprint 2a delivered the callable itself (license status transitions
 * + RBAC + reason capture). The Sprint 3 wire-up adds : on the
 * `licenseStatus -> 'verified'` transition, the helper
 * `startTrialForPharmacy` is invoked so the 30-day trial begins.
 *
 * Coverage matrix :
 *   - action='verify' → startTrialForPharmacy called with the pharmacy uid.
 *   - action='reject' → startTrialForPharmacy NOT called.
 *   - action='correction_needed' → startTrialForPharmacy NOT called.
 *   - action='verify' + helper returns `{started:false, already_active}`
 *     → callable still resolves OK (idempotence proven end-to-end).
 *   - action='verify' + helper throws → callable still resolves OK
 *     (trial failure must not undo the licence-verify decision).
 */
import { jest } from "@jest/globals";

const mockAdminGet = jest.fn() as jest.MockedFunction<() => Promise<unknown>>;
const mockPharmacyGet =
  jest.fn() as jest.MockedFunction<() => Promise<unknown>>;
const mockPharmacyUpdate = jest.fn() as jest.MockedFunction<
  (data: Record<string, unknown>) => Promise<unknown>
>;

const mockCollection = jest.fn((name: string) => {
  if (name === "admins") {
    return { doc: jest.fn(() => ({ get: mockAdminGet })) };
  }
  if (name === "pharmacies") {
    return {
      doc: jest.fn(() => ({
        get: mockPharmacyGet,
        update: mockPharmacyUpdate,
      })),
    };
  }
  throw new Error(`Unexpected collection: ${name}`);
});

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({ collection: mockCollection })),
  FieldValue: {
    serverTimestamp: jest.fn(() => "mock-ts"),
    delete: jest.fn(() => "mock-delete"),
  },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock the helper so we can observe its invocation pattern.
const mockStartTrial = jest.fn() as jest.MockedFunction<
  (db: unknown, uid: string) => Promise<{ started: boolean; reason: string }>
>;
jest.mock("../lib/startTrialForPharmacy.js", () => ({
  startTrialForPharmacy: mockStartTrial,
}));

import functionsTest from "firebase-functions-test";
const testFns = functionsTest();

import { adminVerifyPharmacyLicense } from "../adminVerifyPharmacyLicense.js";
const wrapped = testFns.wrap(adminVerifyPharmacyLicense);

afterAll(() => testFns.cleanup());

beforeEach(() => {
  mockAdminGet.mockReset();
  mockPharmacyGet.mockReset();
  mockPharmacyUpdate.mockReset();
  mockPharmacyUpdate.mockResolvedValue(undefined);
  mockStartTrial.mockReset();
  // Default : super_admin so we don't have to set countryScopes each time.
  mockAdminGet.mockResolvedValue({
    exists: true,
    data: () => ({ role: "super_admin" }),
  });
  // Default pharmacy doc.
  mockPharmacyGet.mockResolvedValue({
    exists: true,
    data: () => ({ countryCode: "CM" }),
  });
});

function callerReq(input: Record<string, unknown>): unknown {
  return { auth: { uid: "super-admin-uid" }, data: input };
}

describe("Sprint 3 — adminVerifyPharmacyLicense × startTrialForPharmacy wire-up", () => {
  test("action='verify' triggers startTrialForPharmacy with the pharmacy uid", async () => {
    mockStartTrial.mockResolvedValueOnce({ started: true, reason: "started" });

    const res = (await wrapped(
      callerReq({ pharmacyId: "ghana-1", action: "verify" }) as any
    )) as { ok: boolean; licenseStatus: string; trialStarted: boolean };

    expect(res.ok).toBe(true);
    expect(res.licenseStatus).toBe("verified");
    expect(res.trialStarted).toBe(true);
    expect(mockStartTrial).toHaveBeenCalledTimes(1);
    expect(mockStartTrial.mock.calls[0][1]).toBe("ghana-1");
  });

  test("action='reject' does NOT trigger the trial helper", async () => {
    await wrapped(
      callerReq({
        pharmacyId: "ghana-2",
        action: "reject",
        reason: "wrong number",
      }) as any
    );
    expect(mockStartTrial).not.toHaveBeenCalled();
  });

  test("action='correction_needed' does NOT trigger the trial helper", async () => {
    await wrapped(
      callerReq({
        pharmacyId: "ghana-3",
        action: "correction_needed",
        reason: "scan illisible",
      }) as any
    );
    expect(mockStartTrial).not.toHaveBeenCalled();
  });

  test("action='verify' on already-trial pharmacy → helper no-op, callable still OK", async () => {
    // The pharmacy is already on a trial (e.g. admin clicked verify
    // twice). Helper returns `{started:false, reason:'already_active'}`.
    // The callable must still succeed — idempotence end-to-end.
    mockStartTrial.mockResolvedValueOnce({
      started: false,
      reason: "already_active",
    });

    const res = (await wrapped(
      callerReq({ pharmacyId: "double-verify", action: "verify" }) as any
    )) as { ok: boolean; trialStarted: boolean };

    expect(res.ok).toBe(true);
    expect(res.trialStarted).toBe(false);
    expect(mockStartTrial).toHaveBeenCalledTimes(1);
  });

  test("action='verify' + helper THROWS → callable still resolves (trial failure does not undo verify)", async () => {
    mockStartTrial.mockRejectedValueOnce(new Error("transaction conflict"));

    const res = (await wrapped(
      callerReq({ pharmacyId: "trial-broken", action: "verify" }) as any
    )) as { ok: boolean; licenseStatus: string; trialStarted: boolean };

    expect(res.ok).toBe(true);
    expect(res.licenseStatus).toBe("verified");
    // trialStarted=false because the helper threw and we swallowed it.
    expect(res.trialStarted).toBe(false);
    // Critical : the licence update still happened before the trial
    // attempt. We just couldn't extend the side-effect.
    expect(mockPharmacyUpdate).toHaveBeenCalledTimes(1);
  });
});
