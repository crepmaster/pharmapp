/**
 * resolvePlatformPayout — Sprint 4B / Lot 4
 *
 * Callable Firebase Function (onCall, v2) to mark a payout request as
 * "completed" or "failed".
 *
 * Atomic operation (single Firestore transaction):
 *   completed: pendingBalance -= amount, totalWithdrawn += amount, lastPayoutAt = now
 *   failed:    pendingBalance -= amount, availableBalance += amount
 *
 * Security:
 *   - Requires Firebase Auth.
 *   - Caller must be active admin with finance access or super_admin.
 *   - Only requests in status "requested" can be resolved.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  completePayoutFunds,
  failPayoutFunds,
} from "./lib/platformPayout.js";

const db = getFirestore();

interface ResolvePayoutData {
  requestId: string;
  resolution: "completed" | "failed";
  externalReference?: string;
  failureReason?: string;
}

export const resolvePlatformPayout = onCall<ResolvePayoutData>(
  { region: "europe-west1", cors: true },
  async (request) => {
    // Guard 1: authenticated
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    // Guard 2: validate input
    const { requestId, resolution, externalReference, failureReason } =
      request.data;
    if (!requestId || typeof requestId !== "string") {
      throw new HttpsError("invalid-argument", "requestId is required.");
    }
    if (resolution !== "completed" && resolution !== "failed") {
      throw new HttpsError(
        "invalid-argument",
        "resolution must be 'completed' or 'failed'."
      );
    }
    if (resolution === "failed" && (!failureReason || !failureReason.trim())) {
      throw new HttpsError(
        "invalid-argument",
        "failureReason is required when resolution is 'failed'."
      );
    }

    logger.info("resolvePlatformPayout: starting", {
      userId,
      requestId,
      resolution,
    });

    const result = await db.runTransaction(async (transaction) => {
      // ================================================================
      // PHASE 1: ALL READS
      // ================================================================

      // 1a. Admin — verify active + finance/super_admin.
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
          "Finance access required to resolve payouts."
        );
      }

      // V2D: scope check will be applied after reading the request (need countryCode).

      // 1b. Payout request — must exist and be in "requested" status.
      const requestRef = db
        .collection("platform_payout_requests")
        .doc(requestId);
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists) {
        throw new HttpsError("not-found", "Payout request not found.");
      }
      const requestData = requestSnap.data()!;
      if (requestData.status !== "requested") {
        throw new HttpsError(
          "failed-precondition",
          `Request is already '${requestData.status}', cannot resolve.`
        );
      }

      // 1c. Treasury — must exist (it was written when the request was created).
      const treasuryId = requestData.treasuryId as string;
      const treasuryRef = db
        .collection("platform_treasuries")
        .doc(treasuryId);
      const treasurySnap = await transaction.get(treasuryRef);
      if (!treasurySnap.exists) {
        throw new HttpsError(
          "internal",
          "Treasury document missing — data inconsistency."
        );
      }

      const amount = requestData.amount as number;
      const countryCode = requestData.countryCode as string;
      const currencyCode = requestData.currencyCode as string;
      const adminUserId = requestData.adminUserId as string;

      // V2D: scope check for non-super_admin.
      if (role !== "super_admin") {
        const countryScopes =
          (adminData.countryScopes as string[] | undefined) || [];
        if (countryScopes.length === 0) {
          throw new HttpsError(
            "failed-precondition",
            "Admin has no country scope configured. Contact super admin."
          );
        }
        if (!countryScopes.includes(countryCode)) {
          throw new HttpsError(
            "permission-denied",
            `Payout request for '${countryCode}' is outside your country scope.`
          );
        }
      }

      // ================================================================
      // PHASE 2: ALL WRITES
      // ================================================================

      if (resolution === "completed") {
        completePayoutFunds(transaction, {
          treasuryRef,
          requestRef,
          countryCode,
          currencyCode,
          amount,
          requestId,
          adminUserId,
          resolvedByAdminId: userId,
          externalReference: (externalReference as string) || "",
        });
      } else {
        failPayoutFunds(transaction, {
          treasuryRef,
          requestRef,
          countryCode,
          currencyCode,
          amount,
          requestId,
          adminUserId,
          resolvedByAdminId: userId,
          failureReason: (failureReason as string).trim(),
        });
      }

      logger.info("resolvePlatformPayout: resolved", {
        requestId,
        resolution,
        amount,
        treasuryId,
      });

      return {
        success: true,
        requestId,
        resolution,
        treasuryId,
        amount,
        currency: currencyCode,
      };
    });

    return result;
  }
);
