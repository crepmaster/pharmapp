/**
 * Platform Treasury Helper — Sprint 3A / Lot 3
 *
 * Reusable helper for crediting platform treasuries within Firestore transactions.
 * Implements the treasury model defined in:
 *   CONTRACT_ADMIN_MASTER_DATA_AND_TREASURY_V1 §6.2 and §6.4
 *
 * Usage contract:
 *   - All Firestore reads must be performed by the CALLER before invoking this helper
 *     (Firestore transaction constraint: reads before writes).
 *   - The caller passes the treasury DocumentSnapshot so this helper can decide
 *     whether to set (auto-provision) or update (increment).
 *   - This helper never calls transaction.get() — it only writes.
 */

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import type {
  Transaction,
  DocumentReference,
  DocumentSnapshot,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

export interface TreasuryCreditParams {
  /** Firestore DocumentReference for the treasury (read by caller). */
  treasuryRef: DocumentReference;
  /** Snapshot obtained by the caller before the write phase. */
  treasurySnapshot: DocumentSnapshot;
  /** ISO 3166-1 alpha-2, e.g. "CM". */
  countryCode: string;
  /** ISO 4217, e.g. "XAF". */
  currencyCode: string;
  /** Amount to credit. Must be positive. */
  amount: number;
  /** Revenue source type — "subscription" for Lot 3, extensible for future lots. */
  sourceType: "subscription" | string;
  /** Opaque reference identifying the originating payment or event. */
  sourceId: string;
}

/**
 * Credits a platform treasury atomically within an existing Firestore transaction.
 *
 * - If the treasury document does not exist, provisions it with the minimal schema
 *   defined in §6.2 of the contract (availableBalance, pendingBalance,
 *   totalCollected, totalWithdrawn, lastPayoutAt, status, updatedAt).
 * - If it exists, increments availableBalance and totalCollected only.
 * - Always writes one ledger entry of type `platform_subscription_revenue` (§6.4).
 */
export function creditPlatformTreasury(
  transaction: Transaction,
  params: TreasuryCreditParams
): void {
  const {
    treasuryRef,
    treasurySnapshot,
    countryCode,
    currencyCode,
    amount,
    sourceType,
    sourceId,
  } = params;

  const treasuryId = `${countryCode}_${currencyCode}`;

  if (treasurySnapshot.exists) {
    // Treasury already exists — increment balances only.
    transaction.update(treasuryRef, {
      availableBalance: FieldValue.increment(amount),
      totalCollected: FieldValue.increment(amount),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    // Treasury absent — auto-provision with full minimal schema (§6.2).
    transaction.set(treasuryRef, {
      id: treasuryId,
      countryCode,
      currencyCode,
      status: "active",
      availableBalance: amount,
      pendingBalance: 0,
      totalCollected: amount,
      totalWithdrawn: 0,
      lastPayoutAt: null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByAdminId: null,
    });
  }

  // Ledger entry — §6.4 of contract.
  const ledgerRef = db.collection("ledger").doc();
  transaction.set(ledgerRef, {
    type: "platform_subscription_revenue",
    treasuryId,
    countryCode,
    currency: currencyCode,
    amount,
    sourceType,
    sourceId,
    from: "external",
    to: "platform_treasury",
    createdAt: FieldValue.serverTimestamp(),
  });

  logger.info(
    `creditPlatformTreasury: +${amount} ${currencyCode} → ${treasuryId}`,
    { sourceType, sourceId }
  );
}
