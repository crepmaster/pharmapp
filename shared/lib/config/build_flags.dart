/// Build-time flags injected via `--dart-define`.
///
/// One place to consult from anywhere in the codebase. Adding a `main.dart`
/// or a widget-side conditional that scans for `bool.fromEnvironment(...)`
/// creates yet another shadow copy that will drift. Import from here instead.
///
/// The values are `const` so the compiler tree-shakes any branch guarded by
/// a flag that resolves to `false` at build time. Prod builds (no flag set)
/// therefore ship with none of the staging/emulator demo code paths.
library build_flags;

/// True when the build was launched with `--dart-define=USE_EMULATOR=true`.
/// Used by main.dart wiring and `AuthenticatedHttpService.functionsBaseUrl`
/// to route Firebase Auth / Firestore / Functions to the local emulator.
const bool kUseEmulator = bool.fromEnvironment('USE_EMULATOR');

/// True when the build was launched with `--dart-define=USE_STAGING=true`.
/// Points Firebase to the `mediexchange-staging` project (via the paired
/// `STAGING_*` dart-defines) AND surfaces demo-only UI (Pickup/Delivered
/// buttons on the delivery card, Sandbox top-up bypass, etc.).
const bool kUseStaging = bool.fromEnvironment('USE_STAGING');
