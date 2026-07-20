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
 *      to activate sandbox behaviour outside an explicit allowlist. Even if
 *      `SANDBOX_ENABLED=true` slips into a prod (or unknown) env, this throws
 *      at module load. Fail-closed: an absent or unknown project ID with
 *      `SANDBOX_ENABLED=true` is refused. The allowlist is intentionally
 *      tight — expanding it should be a deliberate PR change.
 *
 * Round-3 optimisation #2 + #4 (sandbox pattern DRY + defence in depth).
 * Round-4 tightening (P1#2): denylist -> allowlist per architect review.
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
 * Project IDs where sandbox behaviour is permitted. Explicit allowlist —
 * anything not here is refused when `SANDBOX_ENABLED=true`. Add a new entry
 * only in a deliberate PR (never as a side effect of another change).
 */
export const SANDBOX_ALLOWED_PROJECT_IDS: readonly string[] = [
  "mediexchange-staging",
];

/**
 * Resolves the Firebase project id from the runtime env. Prefers
 * `GCLOUD_PROJECT` (legacy) then `GOOGLE_CLOUD_PROJECT` (modern) so both
 * gen1 and gen2 Cloud Functions runtimes are covered. Returns `null` when
 * neither is set (unit-test env, foreign runner, misconfigured deploy).
 */
export function resolveProjectId(): string | null {
  const raw = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
  if (typeof raw !== "string" || raw.length === 0) return null;
  return raw;
}

/** True iff the runtime is a Cloud Functions emulator (local/CI). */
export function isFunctionsEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === "true";
}

/**
 * Refuses to activate any sandbox path unless the runtime matches an
 * explicit allowlist. Policy:
 *   - `SANDBOX_ENABLED` off  → nothing to guard, no-op.
 *   - emulator (FUNCTIONS_EMULATOR=true) → allowed (test env by definition).
 *   - project id ∈ `SANDBOX_ALLOWED_PROJECT_IDS` → allowed.
 *   - project id absent or not in allowlist → THROW.
 * Callers should invoke this at module-load time so a misconfigured deploy
 * crashes fast instead of at request time.
 */
export function assertSandboxAllowedForProject(): void {
  if (!isSandboxEnabled()) return; // nothing to guard
  if (isFunctionsEmulator()) return;
  const projectId = resolveProjectId();
  if (projectId !== null && SANDBOX_ALLOWED_PROJECT_IDS.includes(projectId)) {
    return;
  }
  throw new Error(
    `SANDBOX_ENABLED=true refused on project '${projectId ?? "<unknown>"}'. ` +
      `Sandbox is only permitted on: ${SANDBOX_ALLOWED_PROJECT_IDS.join(", ")} ` +
      `or in the Functions emulator. Remove SANDBOX_ENABLED from the env, ` +
      `or add the project to SANDBOX_ALLOWED_PROJECT_IDS in a deliberate PR.`
  );
}
