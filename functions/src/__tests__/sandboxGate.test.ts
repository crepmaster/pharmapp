/**
 * sandboxGate — unit tests.
 *
 * Covers the round-4 allowlist rewrite (P1#2):
 *   - assertSandboxAllowedForProject uses an explicit allowlist, not a
 *     prod-only denylist. Absent / unknown project ids are refused when
 *     SANDBOX_ENABLED=true.
 *   - Project id is resolved from GCLOUD_PROJECT with GOOGLE_CLOUD_PROJECT
 *     as fallback (covers both gen1 and gen2 Cloud Functions runtimes).
 *   - FUNCTIONS_EMULATOR=true is always allowed (unit tests + local dev).
 */
import { jest } from "@jest/globals";
import {
  SANDBOX_ACCOUNT_PATTERNS,
  SANDBOX_ALLOWED_PROJECT_IDS,
  assertSandboxAllowedForProject,
  isFunctionsEmulator,
  isSandboxAccountEmail,
  isSandboxDemoCaller,
  isSandboxEnabled,
  resolveProjectId,
} from "../lib/sandboxGate.js";

const SNAPSHOT = {
  SANDBOX_ENABLED: process.env.SANDBOX_ENABLED,
  GCLOUD_PROJECT: process.env.GCLOUD_PROJECT,
  GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
  FUNCTIONS_EMULATOR: process.env.FUNCTIONS_EMULATOR,
};

function restore(key: keyof typeof SNAPSHOT): void {
  const v = SNAPSHOT[key];
  if (v === undefined) delete process.env[key];
  else process.env[key] = v;
}

afterEach(() => {
  (Object.keys(SNAPSHOT) as (keyof typeof SNAPSHOT)[]).forEach(restore);
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// isSandboxEnabled
// ---------------------------------------------------------------------------

describe("isSandboxEnabled", () => {
  test("true only when SANDBOX_ENABLED='true' (strict string match)", () => {
    process.env.SANDBOX_ENABLED = "true";
    expect(isSandboxEnabled()).toBe(true);
  });

  test.each(["false", "1", "TRUE", "yes", "", undefined])(
    "false when SANDBOX_ENABLED=%p",
    (raw) => {
      if (raw === undefined) delete process.env.SANDBOX_ENABLED;
      else process.env.SANDBOX_ENABLED = raw;
      expect(isSandboxEnabled()).toBe(false);
    }
  );
});

// ---------------------------------------------------------------------------
// isSandboxAccountEmail
// ---------------------------------------------------------------------------

describe("isSandboxAccountEmail", () => {
  test.each([
    "test@promoshake.net",
    "test.user@promoshake.net",
    "test+demo@promoshake.net",
    "TEST@PROMOSHAKE.NET",
    "a-b_c@promoshake.net",
  ])("accepts %s", (email) => {
    expect(isSandboxAccountEmail(email)).toBe(true);
  });

  test.each([
    "test@gmail.com",
    "test@promoshake.com", // wrong TLD
    "test@notpromoshake.net", // wrong domain
    "@promoshake.net", // no local part
    "test@",
    "",
    null,
    undefined,
    "text with spaces@promoshake.net",
  ])("rejects %p", (email) => {
    expect(isSandboxAccountEmail(email as string | null | undefined)).toBe(
      false
    );
  });

  test("SANDBOX_ACCOUNT_PATTERNS is a frozen readonly list of RegExp", () => {
    expect(SANDBOX_ACCOUNT_PATTERNS.length).toBeGreaterThan(0);
    SANDBOX_ACCOUNT_PATTERNS.forEach((p) => expect(p).toBeInstanceOf(RegExp));
  });
});

// ---------------------------------------------------------------------------
// isSandboxDemoCaller
// ---------------------------------------------------------------------------

describe("isSandboxDemoCaller", () => {
  test("true only when env active AND email is a sandbox account", () => {
    process.env.SANDBOX_ENABLED = "true";
    expect(isSandboxDemoCaller({ email: "test@promoshake.net" })).toBe(true);
  });

  test("false when env off, even with sandbox email", () => {
    delete process.env.SANDBOX_ENABLED;
    expect(isSandboxDemoCaller({ email: "test@promoshake.net" })).toBe(false);
  });

  test("false when env on but email is not a sandbox account", () => {
    process.env.SANDBOX_ENABLED = "true";
    expect(isSandboxDemoCaller({ email: "user@gmail.com" })).toBe(false);
  });

  test("false when env on but email is null/undefined", () => {
    process.env.SANDBOX_ENABLED = "true";
    expect(isSandboxDemoCaller({ email: null })).toBe(false);
    expect(isSandboxDemoCaller({ email: undefined })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveProjectId
// ---------------------------------------------------------------------------

describe("resolveProjectId", () => {
  test("prefers GCLOUD_PROJECT when both are set", () => {
    process.env.GCLOUD_PROJECT = "from-gcloud";
    process.env.GOOGLE_CLOUD_PROJECT = "from-google-cloud";
    expect(resolveProjectId()).toBe("from-gcloud");
  });

  test("falls back to GOOGLE_CLOUD_PROJECT when GCLOUD_PROJECT is absent", () => {
    delete process.env.GCLOUD_PROJECT;
    process.env.GOOGLE_CLOUD_PROJECT = "from-google-cloud";
    expect(resolveProjectId()).toBe("from-google-cloud");
  });

  test("returns null when both are absent", () => {
    delete process.env.GCLOUD_PROJECT;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    expect(resolveProjectId()).toBeNull();
  });

  test("returns null when GCLOUD_PROJECT is empty string", () => {
    process.env.GCLOUD_PROJECT = "";
    delete process.env.GOOGLE_CLOUD_PROJECT;
    expect(resolveProjectId()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isFunctionsEmulator
// ---------------------------------------------------------------------------

describe("isFunctionsEmulator", () => {
  test("true when FUNCTIONS_EMULATOR='true'", () => {
    process.env.FUNCTIONS_EMULATOR = "true";
    expect(isFunctionsEmulator()).toBe(true);
  });

  test("false otherwise", () => {
    delete process.env.FUNCTIONS_EMULATOR;
    expect(isFunctionsEmulator()).toBe(false);
    process.env.FUNCTIONS_EMULATOR = "1";
    expect(isFunctionsEmulator()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assertSandboxAllowedForProject — allowlist matrix (P1#2)
// ---------------------------------------------------------------------------

describe("assertSandboxAllowedForProject (allowlist)", () => {
  test("no-op when SANDBOX_ENABLED is off (irrelevant which project)", () => {
    delete process.env.SANDBOX_ENABLED;
    process.env.GCLOUD_PROJECT = "mediexchange"; // prod id
    expect(() => assertSandboxAllowedForProject()).not.toThrow();
  });

  test("allowed when FUNCTIONS_EMULATOR=true (any/no project)", () => {
    process.env.SANDBOX_ENABLED = "true";
    process.env.FUNCTIONS_EMULATOR = "true";
    delete process.env.GCLOUD_PROJECT;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    expect(() => assertSandboxAllowedForProject()).not.toThrow();
  });

  test("allowed when project id ∈ SANDBOX_ALLOWED_PROJECT_IDS (via GCLOUD_PROJECT)", () => {
    process.env.SANDBOX_ENABLED = "true";
    delete process.env.FUNCTIONS_EMULATOR;
    process.env.GCLOUD_PROJECT = "mediexchange-staging";
    expect(() => assertSandboxAllowedForProject()).not.toThrow();
  });

  test("allowed when project id ∈ SANDBOX_ALLOWED_PROJECT_IDS (via GOOGLE_CLOUD_PROJECT fallback)", () => {
    process.env.SANDBOX_ENABLED = "true";
    delete process.env.FUNCTIONS_EMULATOR;
    delete process.env.GCLOUD_PROJECT;
    process.env.GOOGLE_CLOUD_PROJECT = "mediexchange-staging";
    expect(() => assertSandboxAllowedForProject()).not.toThrow();
  });

  test("REFUSED when SANDBOX_ENABLED=true and project id is prod (mediexchange)", () => {
    process.env.SANDBOX_ENABLED = "true";
    delete process.env.FUNCTIONS_EMULATOR;
    process.env.GCLOUD_PROJECT = "mediexchange";
    expect(() => assertSandboxAllowedForProject()).toThrow(/mediexchange/);
  });

  test("REFUSED when SANDBOX_ENABLED=true and project id is unknown", () => {
    process.env.SANDBOX_ENABLED = "true";
    delete process.env.FUNCTIONS_EMULATOR;
    process.env.GCLOUD_PROJECT = "some-other-project";
    expect(() => assertSandboxAllowedForProject()).toThrow(
      /some-other-project/
    );
  });

  test("REFUSED (fail-closed) when SANDBOX_ENABLED=true and project id is absent", () => {
    process.env.SANDBOX_ENABLED = "true";
    delete process.env.FUNCTIONS_EMULATOR;
    delete process.env.GCLOUD_PROJECT;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    expect(() => assertSandboxAllowedForProject()).toThrow(/<unknown>/);
  });

  test("staging project id is present in the allowlist constant", () => {
    expect(SANDBOX_ALLOWED_PROJECT_IDS).toContain("mediexchange-staging");
    expect(SANDBOX_ALLOWED_PROJECT_IDS).not.toContain("mediexchange");
  });
});
