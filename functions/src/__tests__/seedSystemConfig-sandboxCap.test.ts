/**
 * E2c — data-integrity guard for the sandbox credit cap in the seed config.
 *
 * `sandboxCredit` (functions/src/index.ts) refuses credit when
 * `system_config.currencies[code].sandboxMaxCreditMajor` is missing or not a
 * positive integer. This test asserts the SEED that provisions
 * system_config carries a valid cap for every currency, so a future edit
 * that drops or mistypes the field fails here rather than silently breaking
 * sandbox funding during a demo.
 *
 * Reads the seed as TEXT (same approach as the license drift-guard) so the
 * test needs no module-resolution / .d.ts for the .mjs script, and so it
 * pins the field to the exact currency block it belongs to.
 */
import fs from "fs";
import path from "path";

const seedPath = path.resolve(__dirname, "../../scripts/lib/seedSystemConfig.mjs");
const seed = fs.readFileSync(seedPath, "utf8");

/** Extract the object literal body of a named currency entry. */
function currencyBlock(code: string): string {
  const m = seed.match(new RegExp(`${code}:\\s*\\{([\\s\\S]*?)\\}`));
  expect(m).not.toBeNull();
  return m![1];
}

describe("seedSystemConfig — sandboxMaxCreditMajor", () => {
  test("exactly two currencies carry the cap (XAF, GHS)", () => {
    const count = (seed.match(/sandboxMaxCreditMajor:/g) ?? []).length;
    expect(count).toBe(2);
  });

  test("XAF cap is the agreed positive integer 100000", () => {
    const m = currencyBlock("XAF").match(/sandboxMaxCreditMajor:\s*(\d+)/);
    expect(m).not.toBeNull();
    const cap = Number(m![1]);
    expect(Number.isInteger(cap)).toBe(true);
    expect(cap).toBe(100000);
  });

  test("GHS cap is the agreed positive integer 2000", () => {
    const m = currencyBlock("GHS").match(/sandboxMaxCreditMajor:\s*(\d+)/);
    expect(m).not.toBeNull();
    const cap = Number(m![1]);
    expect(Number.isInteger(cap)).toBe(true);
    expect(cap).toBe(2000);
  });

  test("the cap is never zero or negative in the seed", () => {
    for (const m of seed.matchAll(/sandboxMaxCreditMajor:\s*(-?\d+)/g)) {
      expect(Number(m[1])).toBeGreaterThan(0);
    }
  });
});
