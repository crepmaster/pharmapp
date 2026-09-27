import { planCompetingProposalReleases, MAX_COMPETING_PROPOSALS } from "../lib/competingProposalReleases.js";

const lotId = "seller-lot";
const sellerId = "seller";
const accepted = {
  id: "winner",
  data: { status: "pending", inventoryItemId: lotId, toPharmacyId: sellerId,
    fromPharmacyId: "winner-buyer", details: { type: "purchase" },
    reservations: { walletReserved: 10, inventoryReserved: null } },
};
const purchase = (id: string, buyer = "buyer", amount = 12) => ({
  id,
  data: { status: "pending", inventoryItemId: lotId, toPharmacyId: sellerId,
    fromPharmacyId: buyer, details: { type: "purchase" },
    reservations: { walletReserved: amount, inventoryReserved: null } },
});
const exchange = (id: string, returnLot = "return-lot", amount = 3) => ({
  id,
  data: { status: "pending", inventoryItemId: lotId, toPharmacyId: sellerId,
    fromPharmacyId: "buyer", details: { type: "exchange", exchangeInventoryItemId: returnLot },
    reservations: { walletReserved: null, inventoryReserved: amount } },
});

describe("competing proposal release plan", () => {
  test("excludes winner and aggregates repeated wallet and return-lot holds", () => {
    const plan = planCompetingProposalReleases(
      [accepted, purchase("p1"), purchase("p2", "buyer", 5),
        exchange("e1"), exchange("e2", "return-lot", 4)],
      "winner", lotId, sellerId
    );
    expect(plan.proposals.map((p) => p.id)).toEqual(["p1", "p2", "e1", "e2"]);
    expect(plan.walletUnits.get("buyer")).toBe(1700);
    expect(plan.inventoryUnits.get("return-lot")).toBe(7);
    expect(plan.walletUnits.has("winner-buyer")).toBe(false);
  });

  test("refuses over-limit results before a partial release can be planned", () => {
    const losers = Array.from({ length: MAX_COMPETING_PROPOSALS + 1 }, (_, i) => purchase(`p${i}`));
    expect(() => planCompetingProposalReleases([accepted, ...losers], "winner", lotId, sellerId))
      .toThrow(/too many pending/i);
  });

  test.each([
    [{ ...purchase("p"), data: { ...purchase("p").data, toPharmacyId: "other" } }, "inconsistent"],
    [{ ...purchase("p"), data: { ...purchase("p").data,
      reservations: { walletReserved: 0, inventoryReserved: null } } }, "purchase reservation"],
    [{ ...exchange("e"), data: { ...exchange("e").data,
      reservations: { walletReserved: null, inventoryReserved: -1 } } }, "exchange reservation"],
  ])("refuses corrupt reservation without a release plan", (loser, message) => {
    expect(() => planCompetingProposalReleases([accepted, loser], "winner", lotId, sellerId))
      .toThrow(new RegExp(message, "i"));
  });
});
