import { HttpsError } from "firebase-functions/v2/https";

/** Validate client price assertions and return the server-computed major total. */
export function assertPurchasePrice(
  quantity: unknown,
  pricePerUnit: unknown,
  suppliedTotal: unknown,
  decimals: number
): { unitPrice: number; totalPrice: number } {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 2) {
    throw new HttpsError("failed-precondition", "Unsupported currency precision for pharmacy wallets.");
  }
  if (!Number.isSafeInteger(quantity) || (quantity as number) <= 0) {
    throw new HttpsError("invalid-argument", "Purchase quantity must be a positive integer.");
  }

  const factor = 10 ** decimals;
  const toExactMinor = (value: unknown, label: string): number => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new HttpsError("invalid-argument", `${label} must be a positive amount.`);
    }
    const scaled = value * factor;
    const rounded = Math.round(scaled);
    if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 1e-7) {
      throw new HttpsError("invalid-argument", `${label} exceeds currency precision.`);
    }
    return rounded;
  };

  const unitMinor = toExactMinor(pricePerUnit, "pricePerUnit");
  const suppliedMinor = toExactMinor(suppliedTotal, "totalPrice");
  const totalMinor = unitMinor * (quantity as number);
  if (!Number.isSafeInteger(totalMinor)) {
    throw new HttpsError("invalid-argument", "Purchase total is too large.");
  }
  if (suppliedMinor !== totalMinor) {
    throw new HttpsError("invalid-argument", "totalPrice must equal quantity × pricePerUnit.", {
      code: "PURCHASE_TOTAL_MISMATCH",
    });
  }
  return { unitPrice: unitMinor / factor, totalPrice: totalMinor / factor };
}
