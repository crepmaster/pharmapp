/**
 * majorToWalletUnits — the single wallet-write conversion boundary.
 *
 * Encodes the two legacy wallet conventions that coexist in the `wallets`
 * collection: pharmacy = major×100, courier = raw major. See
 * docs/adr/audits and createWithdrawalRequest.ts for the mandate.
 */
import { majorToWalletUnits } from "../lib/moneyUnits.js";

describe("majorToWalletUnits — pharmacy (major × 100)", () => {
  test("50 GHS → 5000 wallet units", () => {
    expect(majorToWalletUnits(50, "pharmacy")).toBe(5000);
  });

  test("5000 XAF → 500000 wallet units", () => {
    expect(majorToWalletUnits(5000, "pharmacy")).toBe(500000);
  });

  test("20.50 GHS → 2050 wallet units", () => {
    expect(majorToWalletUnits(20.5, "pharmacy")).toBe(2050);
  });

  test("0 → 0", () => {
    expect(majorToWalletUnits(0, "pharmacy")).toBe(0);
  });

  test("rounds sub-cent major amounts to the nearest legacy unit", () => {
    // 20.005 × 100 = 2000.5 → 2001. Documents the Math.round policy.
    expect(majorToWalletUnits(20.005, "pharmacy")).toBe(2001);
  });
});

describe("majorToWalletUnits — courier (raw major)", () => {
  test("50 GHS → 50 wallet units", () => {
    expect(majorToWalletUnits(50, "courier")).toBe(50);
  });

  test("5000 XAF → 5000 wallet units", () => {
    expect(majorToWalletUnits(5000, "courier")).toBe(5000);
  });

  test("preserves non-integer major for 2-decimal currencies", () => {
    // Courier wallets store raw major, non-integer allowed.
    expect(majorToWalletUnits(20.5, "courier")).toBe(20.5);
  });

  test("0 → 0", () => {
    expect(majorToWalletUnits(0, "courier")).toBe(0);
  });
});

describe("majorToWalletUnits — invalid input is refused, never coerced", () => {
  test("negative amount throws", () => {
    expect(() => majorToWalletUnits(-1, "pharmacy")).toThrow();
    expect(() => majorToWalletUnits(-1, "courier")).toThrow();
  });

  test("NaN throws", () => {
    expect(() => majorToWalletUnits(NaN, "pharmacy")).toThrow();
  });

  test("Infinity throws", () => {
    expect(() => majorToWalletUnits(Infinity, "pharmacy")).toThrow();
    expect(() => majorToWalletUnits(-Infinity, "courier")).toThrow();
  });

  test("non-number throws", () => {
    expect(() => majorToWalletUnits("50" as never, "pharmacy")).toThrow();
    expect(() => majorToWalletUnits(undefined as never, "courier")).toThrow();
  });

  test("unknown ownerType throws — no silent default", () => {
    expect(() => majorToWalletUnits(50, "admin" as never)).toThrow();
    expect(() => majorToWalletUnits(50, "" as never)).toThrow();
  });
});
