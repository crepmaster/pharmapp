/**
 * withdrawalAdapters — Provider-agnostic withdrawal initiation interface.
 *
 * Provides a single point of extension for wiring real mobile-money payout
 * PSPs (MTN MoMo Disbursement, Orange Money Payout, Paystack Transfers, …)
 * behind the generic `createWithdrawalRequest` callable. This sprint ships
 * only the `sandbox_stub` adapter — real adapters plug in later without
 * changing the callable's code.
 *
 * Design notes:
 *   - `initiate` is async to allow future HTTP-based adapters, but the
 *     sandbox_stub is synchronous and safe to call inside a Firestore
 *     transaction. Real async adapters MUST be invoked OUTSIDE the
 *     transaction (separate sprint — not implemented here).
 *   - `providerRef` is the external reference the PSP echoes back; we
 *     persist it on the `withdrawal_requests` doc for reconciliation.
 */

export interface WithdrawalRequestSnapshot {
  requestId: string;
  ownerType: "pharmacy" | "courier";
  ownerId: string;
  amountMinor: number;
  currencyCode: string;
  providerId: string;
  msisdn: string;
}

export interface WithdrawalAdapter {
  readonly id: string;
  /**
   * True when `initiate` performs no I/O and may safely run inside a
   * Firestore transaction. Only `sandbox_stub` is synchronous today.
   */
  readonly isSynchronous: boolean;
  initiate(request: WithdrawalRequestSnapshot): Promise<{ providerRef: string }>;
}

/**
 * sandbox_stub — deterministic, no-I/O adapter used for local/sandbox flows.
 * Generates a synthetic `providerRef` derived from the request id so the
 * value is stable across retries for the same request.
 */
export const sandboxStubAdapter: WithdrawalAdapter = {
  id: "sandbox_stub",
  isSynchronous: true,
  async initiate(request) {
    return { providerRef: `sandbox_${request.requestId}` };
  },
};

/**
 * Resolve an adapter by its id. Throws for unknown ids so misconfigurations
 * surface loudly rather than silently skipping a payout.
 */
export function getAdapter(id: string): WithdrawalAdapter {
  if (id === "sandbox_stub") return sandboxStubAdapter;
  throw new Error(`Unknown withdrawal adapter: ${id}`);
}
