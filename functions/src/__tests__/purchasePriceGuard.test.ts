import { assertPurchasePrice } from "../lib/purchasePriceGuard.js";

describe("purchase proposal monetary precision", () => {
  test("GHS two decimals: server computes 3 × 1.25", () => {
    expect(assertPurchasePrice(3, 1.25, 3.75, 2)).toEqual({
      unitPrice: 1.25,
      totalPrice: 3.75,
    });
  });

  test("XAF zero decimals: server computes 3 × 125", () => {
    expect(assertPurchasePrice(3, 125, 375, 0)).toEqual({
      unitPrice: 125,
      totalPrice: 375,
    });
  });

  test.each([
    ["GHS mismatched total", 3, 1.25, 3.74, 2],
    ["XAF fractional unit", 3, 125.5, 376.5, 0],
    ["GHS excess precision", 3, 1.005, 3.015, 2],
    ["zero quantity", 0, 1, 1, 2],
    ["negative price", 1, -1, -1, 2],
    ["missing unit price", 1, undefined, 10, 2],
  ])("rejects %s", (_name, quantity, unitPrice, total, decimals) => {
    expect(() => assertPurchasePrice(quantity, unitPrice, total, decimals as number))
      .toThrow();
  });
});
