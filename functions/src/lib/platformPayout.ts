/**
 * Platform Payout Helper — Sprint 4B / Lot 4
 *
 * Write-only helpers for payout balance operations within Firestore transactions.
 * Mirrors the design of platformTreasury.ts (caller reads, helper writes).
 *
 * Contract: CONTRACT_ADMIN_MASTER_DATA_AND_TREASURY_V1 §6.2 / §6.4.
 *
 * Balance transitions:
 *   request:   availableBalance -= amount, pendingBalance += amount
 *   completed: pendingBalance -= amount, totalWithdrawn += amount, lastPayoutAt = now
 *   failed:    pendingBalance -= amount, availableBalance += amount
 */

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import type {
  Transaction,
  DocumentReference,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

// ---------------------------------------------------------------------------
// REQUEST — reserve funds from available → pending
// ---------------------------------------------------------------------------

export interface PayoutReserveParams {
  treasuryRef: DocumentReference;
  countryCode: string;
  currencyCode: string;
  amount: number;
  requestId: string;
  adminUserId: string;
  payoutAccountId: string;
  providerId: string;
  msisdn: string;
  accountName: string;
  accountLabel: string;
  note: string;
}

/**
 * Reserves payout funds: availableBalance -= amount, pendingBalance += amount.
 * Creates the payout request document and a ledger entry.
 * Must be called inside an active Firestore transaction.
 */
export function reservePayoutFunds(
  transaction: Transaction,
  params: PayoutReserveParams
): void {
  const {
    treasuryRef,
    countryCode,
    currencyCode,
    amount,
    requestId,
    adminUserId,
    payoutAccountId,
    providerId,
    msisdn,
    accountName,
    accountLabel,
    note,
  } = params;

  const treasuryId = `${countryCode}_${currencyCode}`;

  // Update treasury balances.
  transaction.update(treasuryRef, {
    availableBalance: FieldValue.increment(-amount),
    pendingBalance: FieldValue.increment(amount),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Create payout request document.
  const requestRef = db.collection("platform_payout_requests").doc(requestId);
  transaction.set(requestRef, {
    adminUserId,
    treasuryId,
    countryCode,
    currencyCode,
    amount,
    payoutAccountId,
    providerId,
    msisdn,
    accountName,
    accountLabel,
    status: "requested",
    note: note || "",
    externalReference: null,
    failureReason: null,
    requestedByAdminId: adminUserId,
    resolvedByAdminId: null,
    requestedAt: FieldValue.serverTimestamp(),
    resolvedAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Ledger entry.
  const ledgerRef = db.collection("ledger").doc();
  transaction.set(ledgerRef, {
    type: "platform_payout_requested",
    treasuryId,
    countryCode,
    currency: currencyCode,
    amount,
    payoutRequestId: requestId,
    adminUserId,
    from: "platform_treasury",
    to: "pending_payout",
    createdAt: FieldValue.serverTimestamp(),
  });

  logger.info(
    `reservePayoutFunds: -${amount} ${currencyCode} from ${treasuryId} → pending`,
    { requestId, adminUserId }
  );
}

// ---------------------------------------------------------------------------
// COMPLETE — settle payout: pending → withdrawn
// ---------------------------------------------------------------------------

export interface PayoutCompleteParams {
  treasuryRef: DocumentReference;
  requestRef: DocumentReference;
  countryCode: string;
  currencyCode: string;
  amount: number;
  requestId: string;
  adminUserId: string;
  resolvedByAdminId: string;
  externalReference: string;
}

export function completePayoutFunds(
  transaction: Transaction,
  params: PayoutCompleteParams
): void {
  const {
    treasuryRef,
    requestRef,
    countryCode,
    currencyCode,
    amount,
    requestId,
    adminUserId,
    resolvedByAdminId,
    externalReference,
  } = params;

  const treasuryId = `${countryCode}_${currencyCode}`;

  transaction.update(treasuryRef, {
    pendingBalance: FieldValue.increment(-amount),
    totalWithdrawn: FieldValue.increment(amount),
    lastPayoutAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  transaction.update(requestRef, {
    status: "completed",
    externalReference: externalReference || null,
    resolvedByAdminId,
    resolvedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const ledgerRef = db.collection("ledger").doc();
  transaction.set(ledgerRef, {
    type: "platform_payout_completed",
    treasuryId,
    countryCode,
    currency: currencyCode,
    amount,
    payoutRequestId: requestId,
    adminUserId,
    resolvedByAdminId,
    externalReference: externalReference || null,
    from: "pending_payout",
    to: "external",
    createdAt: FieldValue.serverTimestamp(),
  });

  logger.info(
    `completePayoutFunds: ${amount} ${currencyCode} from ${treasuryId} → external`,
    { requestId, resolvedByAdminId }
  );
}

// ---------------------------------------------------------------------------
// FAIL — reverse reservation: pending → available
// ---------------------------------------------------------------------------

export interface PayoutFailParams {
  treasuryRef: DocumentReference;
  requestRef: DocumentReference;
  countryCode: string;
  currencyCode: string;
  amount: number;
  requestId: string;
  adminUserId: string;
  resolvedByAdminId: string;
  failureReason: string;
}

export function failPayoutFunds(
  transaction: Transaction,
  params: PayoutFailParams
): void {
  const {
    treasuryRef,
    requestRef,
    countryCode,
    currencyCode,
    amount,
    requestId,
    adminUserId,
    resolvedByAdminId,
    failureReason,
  } = params;

  const treasuryId = `${countryCode}_${currencyCode}`;

  transaction.update(treasuryRef, {
    pendingBalance: FieldValue.increment(-amount),
    availableBalance: FieldValue.increment(amount),
    updatedAt: FieldValue.serverTimestamp(),
  });

  transaction.update(requestRef, {
    status: "failed",
    failureReason,
    resolvedByAdminId,
    resolvedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const ledgerRef = db.collection("ledger").doc();
  transaction.set(ledgerRef, {
    type: "platform_payout_failed",
    treasuryId,
    countryCode,
    currency: currencyCode,
    amount,
    payoutRequestId: requestId,
    adminUserId,
    resolvedByAdminId,
    failureReason,
    from: "pending_payout",
    to: "platform_treasury",
    createdAt: FieldValue.serverTimestamp(),
  });

  logger.info(
    `failPayoutFunds: +${amount} ${currencyCode} back to ${treasuryId}`,
    { requestId, resolvedByAdminId, failureReason }
  );
}
