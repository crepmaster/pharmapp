/**
 * sandboxAdvanceWithdrawal — admin-only sandbox callable to advance a
 * `withdrawal_requests/{requestId}` through a terminal state.
 *
 * Three target states:
 *   - completed: held -> burn (PSP paid out)            [ledger: withdrawal_settled]
 *   - failed:    held -> available (PSP rejected)       [ledger: withdrawal_reversed, reason=failed]
 *   - reversed:  held -> available (manual reversal)    [ledger: withdrawal_reversed, reason=reversed]
 *
 * Guards:
 *   - Sandbox-only (FUNCTIONS_EMULATOR=true or SANDBOX_ENABLED=true).
 *   - Caller email must match SANDBOX_ACCOUNT_PATTERNS (mirrors the
 *     discipline applied to sandboxCredit/sandboxDebit — same test-account
 *     policy, NOT a shared import).
 *
 * Idempotency: if the request is already terminal, the callable returns
 * the current state without writes.
 *
 * NON-NEGOTIABLE: refunds MUST use `walletUnitsDebited` from the request
 * doc — never `amountMinor`. The debit used dual money conventions
 * (pharmacy ×100 vs courier raw major); the refund must use exactly the
 * same unit to restore the pre-debit balance.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

// Mirrors index.ts SANDBOX_ACCOUNT_PATTERNS — intentional duplication per
// architect directive (no new shared module for this sprint).
const SANDBOX_ACCOUNT_PATTERNS = [/^[\w.+-]+@promoshake\.net$/i];

function isSandboxAllowed(): boolean {
  return (
    process.env.FUNCTIONS_EMULATOR === "true" ||
    process.env.SANDBOX_ENABLED === "true"
  );
}

type TargetStatus = "completed" | "failed" | "reversed";

interface AdvanceInput {
  requestId: string;
  targetStatus: TargetStatus;
}

export const sandboxAdvanceWithdrawal = onCall<AdvanceInput>(
  { region: "europe-west1", cors: true },
  async (request) => {
    // ---- Environment guard ----
    if (!isSandboxAllowed()) {
      throw new HttpsError(
        "permission-denied",
        "Sandbox functions are disabled in production."
      );
    }

    // ---- Auth ----
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    // ---- Caller must be a sandbox test account ----
    let callerEmail = "";
    try {
      const userRecord = await getAuth().getUser(callerUid);
      callerEmail = String(userRecord.email ?? "").trim();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn("sandboxAdvanceWithdrawal: getUser failed", { msg });
      throw new HttpsError(
        "permission-denied",
        "Sandbox advance requires a resolvable caller identity."
      );
    }
    const isTestAccount = SANDBOX_ACCOUNT_PATTERNS.some((p) =>
      p.test(callerEmail)
    );
    if (!isTestAccount) {
      throw new HttpsError(
        "permission-denied",
        "Sandbox advance is limited to test accounts."
      );
    }

    // ---- Input validation ----
    const { requestId, targetStatus } = request.data ?? ({} as AdvanceInput);
    if (typeof requestId !== "string" || requestId.length === 0) {
      throw new HttpsError("invalid-argument", "requestId is required.");
    }
    if (
      targetStatus !== "completed" &&
      targetStatus !== "failed" &&
      targetStatus !== "reversed"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "targetStatus must be 'completed', 'failed', or 'reversed'."
      );
    }

    const requestRef = db.collection("withdrawal_requests").doc(requestId);

    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(requestRef);
      if (!snap.exists) {
        throw new HttpsError(
          "not-found",
          `withdrawal_requests/${requestId} not found.`
        );
      }
      const data = snap.data() ?? {};
      const currentStatus = data.status as string | undefined;

      // ---- Idempotent no-op on terminal ----
      if (
        currentStatus === "completed" ||
        currentStatus === "failed" ||
        currentStatus === "reversed"
      ) {
        return {
          idempotent: true as const,
          status: currentStatus,
          data,
        };
      }

      const ownerId = data.ownerId as string | undefined;
      if (!ownerId) {
        throw new HttpsError(
          "failed-precondition",
          "withdrawal request has no ownerId."
        );
      }
      // CRITICAL: refund MUST use walletUnitsDebited from the doc — NEVER amountMinor.
      // The debit used dual money conventions (pharmacy ×100 vs courier raw major),
      // so only this persisted value restores the pre-debit balance correctly.
      const walletUnitsDebited = Number(data.walletUnitsDebited);
      if (!Number.isFinite(walletUnitsDebited) || walletUnitsDebited <= 0) {
        throw new HttpsError(
          "failed-precondition",
          "withdrawal request has invalid walletUnitsDebited."
        );
      }
      const currencyCode =
        (data.currencyCode as string | undefined) ?? "XAF";
      const providerId = data.providerId as string | undefined;
      const providerRef = (data.providerRef as string | undefined) ?? null;

      const walletRef = db.collection("wallets").doc(ownerId);
      const walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          `wallet for ownerId ${ownerId} not found.`
        );
      }

      const ledgerRef = db.collection("ledger").doc();

      if (targetStatus === "completed") {
        // Held funds are burned (paid out externally).
        tx.update(walletRef, {
          held: FieldValue.increment(-walletUnitsDebited),
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.update(requestRef, {
          status: "completed",
          settledAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.set(ledgerRef, {
          type: "withdrawal_settled",
          userId: ownerId,
          amount: walletUnitsDebited, // CRITICAL: walletUnitsDebited, never amountMinor
          currency: currencyCode,
          requestId,
          providerId: providerId ?? null,
          providerRef,
          createdAt: FieldValue.serverTimestamp(),
        });
        return { idempotent: false as const, status: "completed" as const };
      }

      // failed / reversed: held -> available (refund)
      const failureReason: TargetStatus = targetStatus;
      tx.update(walletRef, {
        held: FieldValue.increment(-walletUnitsDebited),
        available: FieldValue.increment(walletUnitsDebited),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(requestRef, {
        status: targetStatus,
        failureReason,
        settledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(ledgerRef, {
        type: "withdrawal_reversed",
        userId: ownerId,
        amount: walletUnitsDebited, // CRITICAL: walletUnitsDebited, never amountMinor
        currency: currencyCode,
        requestId,
        providerId: providerId ?? null,
        providerRef,
        reason: failureReason,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { idempotent: false as const, status: targetStatus };
    });

    logger.info("sandboxAdvanceWithdrawal: done", {
      requestId,
      targetStatus,
      resolvedStatus: outcome.status,
      idempotent: outcome.idempotent,
    });

    return {
      requestId,
      status: outcome.status,
      idempotent: outcome.idempotent,
    };
  }
);
