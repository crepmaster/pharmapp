import { HttpsError } from "firebase-functions/v2/https";
import { majorToWalletUnits } from "./moneyUnits.js";

export const MAX_COMPETING_PROPOSALS = 100;

export interface PendingCompetingProposal {
  id: string;
  data: Record<string, unknown>;
}

export interface CompetingProposalReleasePlan {
  proposals: PendingCompetingProposal[];
  walletUnits: Map<string, number>;
  inventoryUnits: Map<string, number>;
}

function positiveSafeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function addSafe(map: Map<string, number>, id: string, amount: number): void {
  const sum = (map.get(id) ?? 0) + amount;
  if (!Number.isSafeInteger(sum) || sum < 0) {
    throw new HttpsError("failed-precondition", "Competing proposal reservations exceed a safe limit.");
  }
  map.set(id, sum);
}

/** Validate and aggregate all releases before any transaction write. */
export function planCompetingProposalReleases(
  snapshots: PendingCompetingProposal[],
  acceptedProposalId: string,
  inventoryItemId: string,
  sellerId: string
): CompetingProposalReleasePlan {
  const proposals = snapshots.filter((snapshot) => snapshot.id !== acceptedProposalId);
  if (proposals.length > MAX_COMPETING_PROPOSALS) {
    throw new HttpsError("failed-precondition", "Too many pending proposals for this lot; resolve some before acceptance.");
  }
  const walletUnits = new Map<string, number>();
  const inventoryUnits = new Map<string, number>();
  for (const { data } of proposals) {
    const details = data.details as Record<string, unknown> | undefined;
    const reservations = data.reservations as Record<string, unknown> | undefined;
    const buyerId = data.fromPharmacyId;
    if (data.status !== "pending" || data.inventoryItemId !== inventoryItemId ||
        data.toPharmacyId !== sellerId || typeof buyerId !== "string" || !buyerId ||
        !details || !reservations) {
      throw new HttpsError("failed-precondition", "A competing proposal is inconsistent; acceptance was not applied.");
    }
    if (details.type === "purchase") {
      if (!positiveSafeNumber(reservations.walletReserved) ||
          reservations.inventoryReserved != null) {
        throw new HttpsError("failed-precondition", "A purchase reservation is invalid; acceptance was not applied.");
      }
      const units = majorToWalletUnits(reservations.walletReserved, "pharmacy");
      if (!Number.isSafeInteger(units) || units <= 0) {
        throw new HttpsError("failed-precondition", "A purchase reservation is invalid; acceptance was not applied.");
      }
      addSafe(walletUnits, buyerId, units);
    } else if (details.type === "exchange") {
      const returnLotId = details.exchangeInventoryItemId;
      if (typeof returnLotId !== "string" || !returnLotId ||
          !Number.isSafeInteger(reservations.inventoryReserved) ||
          !positiveSafeNumber(reservations.inventoryReserved) ||
          reservations.walletReserved != null) {
        throw new HttpsError("failed-precondition", "An exchange reservation is invalid; acceptance was not applied.");
      }
      addSafe(inventoryUnits, returnLotId, reservations.inventoryReserved);
    } else {
      throw new HttpsError("failed-precondition", "A competing proposal has an unknown type; acceptance was not applied.");
    }
  }
  return { proposals, walletUnits, inventoryUnits };
}
