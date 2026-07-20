/**
 * Sandbox gate — single source of truth for the two staging-only bypass
 * mechanisms used by demo/test callables.
 *
 *   1. `isSandboxEnabled()` : reads `process.env.SANDBOX_ENABLED`. This flag
 *      is set exclusively on the staging functions env (`functions/.env.mediexchange-staging`,
 *      gitignored). Prod (`mediexchange`) never carries it.
 *
 *   2. `SANDBOX_ACCOUNT_PATTERNS` : the email patterns that identify a test
 *      account (currently only `*@promoshake.net` per the initial design).
 *      Kept here so that a future addition (e.g. adding a second demo
 *      domain) touches one file, not five.
 *
 *   3. `isSandboxAccountEmail(email)` : boolean check against the list.
 *
 *   4. `isSandboxDemoCaller({email})` : full gate = env active AND email is a
 *      test account. This is the guard the demo callables use (top-up
 *      bypass, delivery pickup, completeExchangeDelivery courier bypass).
 *
 *   5. `assertSandboxAllowedForProject()` : hard defensive check that refuses
 *      to activate any sandbox behaviour when the deploy target looks like
 *      production. Even if someone accidentally sets `SANDBOX_ENABLED=true`
 *      in the prod env, this throws before any wallet / delivery mutation
 *      happens. Call it at module-load time in any callable that relies on
 *      sandbox behaviour.
 *
 * Round-3 optimisation #2 + #4 (sandbox pattern DRY + defence in depth).
 */

/** Email suffixes accepted as staging test accounts. */
export const SANDBOX_ACCOUNT_PATTERNS: readonly RegExp[] = [
  /^[\w.+-]+@promoshake\.net$/i,
];

/** True iff the `SANDBOX_ENABLED` env var is set on this function's env. */
export function isSandboxEnabled(): boolean {
  return process.env.SANDBOX_ENABLED === "true";
}

/** True iff `email` matches any `SANDBOX_ACCOUNT_PATTERNS` entry. */
export function isSandboxAccountEmail(email: string | undefined | null): boolean {
  if (typeof email !== "string" || email.length === 0) return false;
  return SANDBOX_ACCOUNT_PATTERNS.some((p) => p.test(email));
}

/**
 * Full demo-caller gate: env active AND email is a recognised test account.
 * Used by the demo callables that let a pharmacy play courier or that
 * short-circuit external HTTP calls.
 */
export function isSandboxDemoCaller(args: { email: string | undefined | null }): boolean {
  return isSandboxEnabled() && isSandboxAccountEmail(args.email);
}

/**
 * Prod project IDs that must NEVER see sandbox behaviour, no matter what
 * env var is set. The check compares against `GCLOUD_PROJECT` (set by the
 * Firebase runtime) so a bad `.env` in prod cannot open the demo path.
 */
export const PROD_PROJECT_IDS: readonly string[] = ["mediexchange"];

/**
 * Refuses to activate any sandbox path when the runtime looks like prod.
 * Throws an ordinary `Error` — callers should invoke it at module-load
 * time so a misconfigured deploy fails fast instead of at request time.
 */
export function assertSandboxAllowedForProject(): void {
  if (!isSandboxEnabled()) return; // nothing to guard
  const projectId = process.env.GCLOUD_PROJECT ?? "";
  if (PROD_PROJECT_IDS.includes(projectId)) {
    throw new Error(
      `SANDBOX_ENABLED=true detected on production project '${projectId}'. ` +
        `Refusing to load sandbox behaviour. Remove SANDBOX_ENABLED from ` +
        `functions env before deploying to prod.`
    );
  }
}
