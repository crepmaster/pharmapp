/**
 * Semantic currency support — `checkCurrencyConfigured` (pure) and
 * `checkCurrencySupported` (I/O).
 *
 * Companion to the syntactic `validators.currency` tests in
 * validation.test.ts. The split is the point: shape is checked by the
 * validator, platform support is checked here against system_config, so
 * onboarding a market never requires a code change.
 *
 * Scope limit (deliberate, documented): these helpers answer "does the
 * platform operate in this currency?" — NOT "is this currency the right
 * one for this owner's country?". The owner-consistency check depends on
 * the generic wallet-owner resolver and lands in a follow-up commit.
 */

import {
  checkCurrencyConfigured,
  checkCurrencySupported,
  currencyRefusalHttpStatus,
} from "../lib/currencyResolver.js";

const SYSCONFIG = {
  currencies: {
    XAF: { code: "XAF", enabled: true, decimals: 0 },
    GHS: { code: "GHS", enabled: true, decimals: 2 },
    XOF: { code: "XOF", enabled: true, decimals: 0 },
    KES: { code: "KES", enabled: false, decimals: 2 }, // configured but off
    NGN: { code: "NGN", decimals: 2 },                 // no `enabled` field
    TZS: { code: "TZS", enabled: "true", decimals: 2 }, // string, not boolean
    ZMW: { code: "ZMW", enabled: 1, decimals: 2 },      // truthy, not boolean
  },
};

describe("checkCurrencyConfigured (pure)", () => {
  test("accepts currencies configured and explicitly enabled", () => {
    for (const code of ["XAF", "GHS", "XOF"]) {
      expect(checkCurrencyConfigured(SYSCONFIG, code)).toEqual({ ok: true });
    }
  });

  test("refuses an entry whose `enabled` flag is missing", () => {
    // Absence is not proof of activation. An ambiguous entry must not
    // authorise money movement — ops migrates it instead.
    expect(checkCurrencyConfigured(SYSCONFIG, "NGN")).toEqual({
      ok: false,
      reason: "invalid_configuration",
    });
  });

  test("refuses an entry whose `enabled` flag is not a boolean", () => {
    // "true" and 1 are truthy in JS: a loose check would activate them.
    for (const code of ["TZS", "ZMW"]) {
      expect(checkCurrencyConfigured(SYSCONFIG, code)).toEqual({
        ok: false,
        reason: "invalid_configuration",
      });
    }
  });

  test("refuses a well-formed code absent from system_config", () => {
    // ZZZ passes the syntactic validator by design — it must die here.
    expect(checkCurrencyConfigured(SYSCONFIG, "ZZZ")).toEqual({
      ok: false,
      reason: "not_configured",
    });
  });

  test("refuses a configured but disabled currency", () => {
    expect(checkCurrencyConfigured(SYSCONFIG, "KES")).toEqual({
      ok: false,
      reason: "disabled",
    });
  });

  test("fails closed when system_config is missing or malformed", () => {
    expect(checkCurrencyConfigured(undefined, "XAF")).toEqual({
      ok: false,
      reason: "config_unavailable",
    });
    expect(checkCurrencyConfigured(null, "XAF")).toEqual({
      ok: false,
      reason: "config_unavailable",
    });
    expect(checkCurrencyConfigured({}, "XAF")).toEqual({
      ok: false,
      reason: "config_unavailable",
    });
    expect(
      checkCurrencyConfigured({ currencies: "nope" } as never, "XAF")
    ).toEqual({ ok: false, reason: "config_unavailable" });
  });

  test("refuses empty / non-string codes", () => {
    for (const bad of ["", null, undefined]) {
      expect(checkCurrencyConfigured(SYSCONFIG, bad as never)).toEqual({
        ok: false,
        reason: "not_configured",
      });
    }
  });

  test("is case-sensitive — lowercase is not silently upcased", () => {
    // The syntactic validator already rejects lowercase; this asserts the
    // semantic layer does not quietly repair a code either.
    expect(checkCurrencyConfigured(SYSCONFIG, "ghs")).toEqual({
      ok: false,
      reason: "not_configured",
    });
  });
});

describe("checkCurrencySupported (I/O)", () => {
  function dbReturning(snap: unknown) {
    return {
      collection: () => ({ doc: () => ({ get: async () => snap }) }),
    } as never;
  }

  test("accepts an enabled currency from a live system_config", async () => {
    const db = dbReturning({ exists: true, data: () => SYSCONFIG });
    await expect(checkCurrencySupported(db, "GHS")).resolves.toEqual({
      ok: true,
    });
  });

  test("fails closed when the system_config document is absent", async () => {
    const db = dbReturning({ exists: false, data: () => undefined });
    const result = await checkCurrencySupported(db, "XAF");
    expect(result).toMatchObject({ ok: false, reason: "config_unavailable" });
  });

  test("fails closed when Firestore throws, and surfaces the cause for logging", async () => {
    const db = {
      collection: () => ({
        doc: () => ({
          get: async () => {
            const err = new Error("deadline exceeded") as Error & { code?: number };
            err.code = 4;
            throw err;
          },
        }),
      }),
    } as never;
    const result = await checkCurrencySupported(db, "XAF");
    expect(result).toMatchObject({ ok: false, reason: "config_unavailable" });
    // The original failure must reach server logs, never the client.
    if (!result.ok) {
      expect(result.cause?.message).toBe("deadline exceeded");
      expect(result.cause?.code).toBe(4);
    }
  });

  test("refuses an unconfigured code read from a live config", async () => {
    const db = dbReturning({ exists: true, data: () => SYSCONFIG });
    await expect(checkCurrencySupported(db, "ZZZ")).resolves.toEqual({
      ok: false,
      reason: "not_configured",
    });
  });
});

describe("currencyRefusalHttpStatus", () => {
  test("maps an unreadable config to 503 so clients retry", () => {
    // A transient Firestore outage is not the caller's fault: answering
    // 422 would tell the client its input is permanently wrong.
    expect(currencyRefusalHttpStatus("config_unavailable")).toBe(503);
  });

  test("maps currency-specific refusals to 422", () => {
    expect(currencyRefusalHttpStatus("not_configured")).toBe(422);
    expect(currencyRefusalHttpStatus("disabled")).toBe(422);
    expect(currencyRefusalHttpStatus("invalid_configuration")).toBe(422);
  });
});
