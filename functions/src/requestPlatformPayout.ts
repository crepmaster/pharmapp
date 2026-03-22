/**
 * requestPlatformPayout — Sprint 4B / Lot 4
 *
 * Callable Firebase Function (onCall, v2) for admin users to request a payout
 * from a platform treasury to their registered payout account.
 *
 * Atomic operation (single Firestore transaction):
 *   1. Validate admin exists, is active, and has finance/super_admin access.
 *   2. Validate treasury exists, is active, and has sufficient available balance.
 *   3. Validate payout account belongs to the caller and matches the treasury tuple.
 *   4. Reserve funds: availableBalance -= amount, pendingBalance += amount.
 *   5. Create platform_payout_requests document.
 *   6. Write ledger entry (type: platform_payout_requested).
 *
 * Security:
 *   - Requires Firebase Auth (onCall enforces authentication).
 *   - Admin role validation against admins/ collection (not custom claims).
 *   - Amount must be positive and <= availableBalance.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { reservePayoutFunds } from "./lib/platformPayout.js";

const db = getFirestore();

interface RequestPayoutData {
  treasuryId: string;
  payoutAccountId: string;
  amount: number;
  note?: string;
}

export const requestPlatformPayout = onCall<RequestPayoutData>(
  { region: "europe-west1", cors: true },
  async (request) => {
    // Guard 1: authenticated
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    // Guard 2: validate input shape
    const { treasuryId, payoutAccountId, amount, note } = request.data;
    if (!treasuryId || typeof treasuryId !== "string") {
      throw new HttpsError("invalid-argument", "treasuryId is required.");
    }
    if (!payoutAccountId || typeof payoutAccountId !== "string") {
      throw new HttpsError("invalid-argument", "payoutAccountId is required.");
    }
    if (typeof amount !== "number" || amount <= 0) {
      throw new HttpsError(
        "invalid-argument",
        "amount must be a positive number."
      );
    }

    logger.info("requestPlatformPayout: starting", {
      userId,
      treasuryId,
      payoutAccountId,
      amount,
    });

    const result = await db.runTransaction(async (transaction) => {
      // ================================================================
      // PHASE 1: ALL READS
      // ================================================================

      // 1a. Admin document — verify active + finance/super_admin role.
      const adminRef = db.collection("admins").doc(userId);
      const adminSnap = await transaction.get(adminRef);
      if (!adminSnap.exists) {
        throw new HttpsError("permission-denied", "Admin profile not found.");
      }
      const adminData = adminSnap.data()!;
      if (adminData.isActive !== true) {
        throw new HttpsError("permission-denied", "Admin account is inactive.");
      }
      const role = adminData.role as string;
      const permissions = (adminData.permissions as string[]) || [];
      const hasFinanceAccess =
        role === "super_admin" || permissions.includes("view_financials");
      if (!hasFinanceAccess) {
        throw new HttpsError(
          "permission-denied",
          "Finance access required to request payouts."
        );
      }

      // 1b. Treasury document — verify exists, active, sufficient balance.
      const treasuryRef = db
        .collection("platform_treasuries")
        .doc(treasuryId);
      const treasurySnap = await transaction.get(treasuryRef);
      if (!treasurySnap.exists) {
        throw new HttpsError("not-found", "Treasury not found.");
      }
      const treasuryData = treasurySnap.data()!;
      if (treasuryData.status !== "active") {
        throw new HttpsError(
          "failed-precondition",
          "Treasury is not active."
        );
      }
      const availableBalance = (treasuryData.availableBalance as number) || 0;
      if (amount > availableBalance) {
        throw new HttpsError(
          "failed-precondition",
          `Insufficient balance. Available: ${availableBalance}, requested: ${amount}.`
        );
      }

      // 1c. Payout account — verify belongs to caller and matches treasury tuple.
      const accountRef = db
        .collection("admin_payout_accounts")
        .doc(payoutAccountId);
      const accountSnap = await transaction.get(accountRef);
      if (!accountSnap.exists) {
        throw new HttpsError("not-found", "Payout account not found.");
      }
      const accountData = accountSnap.data()!;
      if (accountData.adminUserId !== userId) {
        throw new HttpsError(
          "permission-denied",
          "Payout account does not belong to the requesting admin."
        );
      }
      if (accountData.isActive !== true) {
        throw new HttpsError(
          "failed-precondition",
          "Payout account is inactive."
        );
      }
      // Verify tuple match: account (countryCode, currencyCode) == treasury.
      const expectedTreasuryId = `${accountData.countryCode}_${accountData.currencyCode}`;
      if (expectedTreasuryId !== treasuryId) {
        throw new HttpsError(
          "invalid-argument",
          `Payout account tuple (${expectedTreasuryId}) does not match treasury (${treasuryId}).`
        );
      }

      // ================================================================
      // PHASE 2: ALL WRITES
      // ================================================================

      const requestId = db.collection("platform_payout_requests").doc().id;

      reservePayoutFunds(transaction, {
        treasuryRef,
        countryCode: accountData.countryCode as string,
        currencyCode: accountData.currencyCode as string,
        amount,
        requestId,
        adminUserId: userId,
        payoutAccountId,
        providerId: accountData.providerId as string,
        msisdn: accountData.msisdn as string,
        accountName: accountData.accountName as string,
        accountLabel: accountData.label as string,
        note: (note as string) || "",
      });

      logger.info("requestPlatformPayout: reserved", {
        requestId,
        treasuryId,
        amount,
      });

      return {
        success: true,
        requestId,
        treasuryId,
        amount,
        currency: accountData.currencyCode as string,
      };
    });

    return result;
  }
);
