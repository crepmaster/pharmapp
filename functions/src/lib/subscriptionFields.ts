/**
 * subscriptionFields — the `pharmacies/{uid}` fields that decide whether a
 * pharmacy has an active subscription, and which therefore must never be
 * writable by the client.
 *
 * Why this exists (SEC-001, confirmed by emulator probe 2026-07-20)
 * -----------------------------------------------------------------
 * These fields are read as AUTHORITY by both layers:
 *
 *   - `hasActiveSubscription()` in firestore.rules — 8 call sites,
 *     including `allow create` on business collections;
 *   - `getValidSubscription()` in subscriptionValidators.ts, the
 *     server-side paywall check;
 *   - `shouldStartTrial()` in startTrialForPharmacy.ts, which uses
 *     `subscriptionStartDate` as the trace enforcing "one trial ever".
 *
 * Until this constant existed, `isValidPharmacyData` only checked their
 * TYPES (`is bool`, `is string`) and never their provenance, so a pharmacy
 * could grant itself an active subscription by writing on its own
 * document. Having a server-side check bought nothing: the server read the
 * same client-controlled field.
 *
 * Legitimate producers are all Admin SDK (createPharmacyRegistration,
 * startTrialForPharmacy, adminVerifyPharmacyLicense,
 * sandboxSubscriptionSuccess, devSubscription) and bypass rules entirely.
 * No client write path produces them — verified across pharmapp_unified,
 * shared and admin_panel.
 *
 * Mirrors the `PROTECTED_LICENSE_FIELDS` pattern (Sprint 2A.2): this list
 * is the single source of truth, `firestore.rules` restates it manually,
 * and a drift guard test asserts the two stay in sync.
 *
 * `as const` + `readonly` so callers can `.includes()` against literal
 * unions without TypeScript widening.
 */
export const PROTECTED_SUBSCRIPTION_FIELDS = [
  "hasActiveSubscription",
  "subscriptionStatus",
  "subscriptionEndDate",
  "subscriptionPlan",
  "subscriptionStartDate",
] as const;

export type ProtectedSubscriptionField =
  (typeof PROTECTED_SUBSCRIPTION_FIELDS)[number];
