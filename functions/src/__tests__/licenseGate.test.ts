/**
 * Sprint 2a F-LICENSE — `licenseGate` unit tests.
 *
 * Covers the 11 scenarios from the architect's brief
 * (`docs/orchestrator_sprints/SPRINT_2A_LICENSE_BACKEND_TASK.md`,
 * "Writer" step 9) on the pure `evaluateLicenseGate` decision
 * function. The async `assertLicenseAllowsMarketplace` wrapper is
 * intentionally not retested here — its behavior is mechanical (read
 * Firestore → call `evaluateLicenseGate` → throw on deny) and would
 * require a heavy admin-SDK mock for marginal coverage.
 *
 * Mock pattern reuses the one from
 * `createWithdrawalRequest-min-resolution.test.ts` so module-scope
 * `getFirestore()` side effects do not blow up at import time.
 */
import { jest } from "@jest/globals";

jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({})),
  FieldValue: {
    serverTimestamp: jest.fn(() => "mock-timestamp"),
    delete: jest.fn(() => "mock-delete"),
  },
  Timestamp: {
    fromMillis: jest.fn((ms: number) => ({
      toMillis: () => ms,
      toDate: () => new Date(ms),
    })),
  },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

import { evaluateLicenseGate } from "../lib/licenseGate.js";

const NOW = new Date("2026-05-12T12:00:00.000Z");
const PAST = new Date("2026-05-10T12:00:00.000Z"); // 2 days before NOW
const FUTURE = new Date("2026-06-10T12:00:00.000Z"); // ~30 days after NOW

function ts(date: Date) {
  return { toMillis: () => date.getTime() };
}

describe("evaluateLicenseGate — Sprint 2a F-LICENSE", () => {
  // ---- Country NOT requiring license -------------------------------------
  describe("country not requiring license", () => {
    test("country=null → allow (country_not_required)", () => {
      const result = evaluateLicenseGate({}, null, NOW);
      expect(result.decision).toBe("allow");
      expect(result.reason).toBe("country_not_required");
    });

    test("country.licenseRequired=false → allow", () => {
      const result = evaluateLicenseGate(
        { licenseStatus: "rejected" }, // even rejected pharmacies pass when country opt-out
        { licenseRequired: false },
        NOW
      );
      expect(result.decision).toBe("allow");
      expect(result.reason).toBe("country_not_required");
    });

    test("country.licenseRequired absent → allow (defensive default)", () => {
      const result = evaluateLicenseGate({}, {}, NOW);
      expect(result.decision).toBe("allow");
      expect(result.reason).toBe("country_not_required");
    });
  });

  // ---- Country requiring license -----------------------------------------
  describe("country requiring license", () => {
    const required = { licenseRequired: true };

    test("verified → allow", () => {
      const r = evaluateLicenseGate({ licenseStatus: "verified" }, required, NOW);
      expect(r.decision).toBe("allow");
      expect(r.reason).toBe("verified");
    });

    test("pending_verification → deny (not_verified)", () => {
      const r = evaluateLicenseGate(
        { licenseStatus: "pending_verification" },
        required,
        NOW
      );
      expect(r.decision).toBe("deny");
      expect(r.reason).toBe("not_verified");
    });

    test("rejected → deny", () => {
      const r = evaluateLicenseGate({ licenseStatus: "rejected" }, required, NOW);
      expect(r.decision).toBe("deny");
      expect(r.reason).toBe("not_verified");
    });

    test("correction_needed → deny", () => {
      const r = evaluateLicenseGate(
        { licenseStatus: "correction_needed" },
        required,
        NOW
      );
      expect(r.decision).toBe("deny");
      expect(r.reason).toBe("not_verified");
    });

    test("expired → deny", () => {
      const r = evaluateLicenseGate({ licenseStatus: "expired" }, required, NOW);
      expect(r.decision).toBe("deny");
      expect(r.reason).toBe("not_verified");
    });

    test("not_required (set on pharmacy but country requires it = misconfig) → deny", () => {
      // Defensive: the country flag wins. A pharmacy marked not_required
      // in a country that does require one MUST be denied so the gate
      // doesn't drift on a stale per-pharmacy override.
      const r = evaluateLicenseGate(
        { licenseStatus: "not_required" },
        required,
        NOW
      );
      expect(r.decision).toBe("deny");
      expect(r.reason).toBe("not_verified");
    });

    test("missing licenseStatus on a required country → deny", () => {
      // Backfill never ran for this pharmacy → fail closed.
      const r = evaluateLicenseGate({}, required, NOW);
      expect(r.decision).toBe("deny");
      expect(r.reason).toBe("not_verified");
    });
  });

  // ---- Grace period semantics --------------------------------------------
  describe("grace period semantics", () => {
    const required = { licenseRequired: true };

    test("grace_period with future end → allow (grace_active)", () => {
      const r = evaluateLicenseGate(
        { licenseStatus: "grace_period", licenseGraceEndsAt: ts(FUTURE) },
        required,
        NOW
      );
      expect(r.decision).toBe("allow");
      expect(r.reason).toBe("grace_active");
    });

    test("grace_period with past end → deny (grace_expired)", () => {
      const r = evaluateLicenseGate(
        { licenseStatus: "grace_period", licenseGraceEndsAt: ts(PAST) },
        required,
        NOW
      );
      expect(r.decision).toBe("deny");
      expect(r.reason).toBe("grace_expired");
    });

    test("grace_period with no licenseGraceEndsAt → deny (treated as expired)", () => {
      const r = evaluateLicenseGate(
        { licenseStatus: "grace_period" },
        required,
        NOW
      );
      expect(r.decision).toBe("deny");
      expect(r.reason).toBe("grace_expired");
    });

    test("grace_period with epoch number (not Timestamp object) — future", () => {
      const r = evaluateLicenseGate(
        { licenseStatus: "grace_period", licenseGraceEndsAt: FUTURE.getTime() },
        required,
        NOW
      );
      expect(r.decision).toBe("allow");
      expect(r.reason).toBe("grace_active");
    });

    test("grace_period with epoch number — past", () => {
      const r = evaluateLicenseGate(
        { licenseStatus: "grace_period", licenseGraceEndsAt: PAST.getTime() },
        required,
        NOW
      );
      expect(r.decision).toBe("deny");
      expect(r.reason).toBe("grace_expired");
    });

    test("grace_period with broken toMillis (throws) → deny (treated as expired)", () => {
      const r = evaluateLicenseGate(
        {
          licenseStatus: "grace_period",
          licenseGraceEndsAt: {
            toMillis: () => {
              throw new Error("boom");
            },
          },
        },
        required,
        NOW
      );
      expect(r.decision).toBe("deny");
      expect(r.reason).toBe("grace_expired");
    });

    test("grace_period with non-numeric toMillis return → deny", () => {
      const r = evaluateLicenseGate(
        {
          licenseStatus: "grace_period",
          // @ts-expect-error testing runtime defence
          licenseGraceEndsAt: { toMillis: () => "not-a-number" },
        },
        required,
        NOW
      );
      expect(r.decision).toBe("deny");
      expect(r.reason).toBe("grace_expired");
    });
  });

  // ---- Defensive / unknown values ----------------------------------------
  describe("defensive parsing", () => {
    const required = { licenseRequired: true };

    test("unknown licenseStatus value → deny", () => {
      // The LicenseStatus type accepts arbitrary strings at runtime
      // (typed as `LicenseStatus | string | null`) precisely to absorb
      // Firestore docs that drift; the gate must still deny.
      const r = evaluateLicenseGate(
        { licenseStatus: "totally_made_up" },
        required,
        NOW
      );
      expect(r.decision).toBe("deny");
      expect(r.reason).toBe("not_verified");
    });

    test("null licenseStatus → deny", () => {
      const r = evaluateLicenseGate({ licenseStatus: null }, required, NOW);
      expect(r.decision).toBe("deny");
    });
  });
});
