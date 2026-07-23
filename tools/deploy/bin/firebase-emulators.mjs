/**
 * firebase-emulators — the only versioned way to reach the Firebase CLI for
 * NON-MUTATING work.
 *
 * Why capabilities instead of a passthrough
 * -----------------------------------------
 * A generic `node firebase.mjs <args…>` wrapper would forward `deploy` just as
 * happily as `emulators:exec`, which would recreate the bypass this repository
 * has just removed — a single supported deployment entry point is only true if
 * nothing else versioned can deploy. So this wrapper exposes named MODES with
 * fixed argument lists, and refuses everything else. Adding a capability is a
 * deliberate, reviewable edit to this file.
 *
 * Why a wrapper at all
 * --------------------
 * `firebase-tools` lives in `tools/deploy`, isolated from `functions` so that
 * the delivery tool cannot alter the dependency graph shipped to Cloud
 * Functions (REQ-DEP-ISO-01). Nothing may rely on a `firebase` on the PATH:
 * a global CLI is absent from every lockfile, so two machines could run the
 * same commit through different versions and neither could tell.
 *
 * Resolution is anchored to THIS FILE's location, never to the working
 * directory, so `npm run test:rules` behaves identically from the repository
 * root, from `functions/`, or from anywhere else.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = path.resolve(HERE, ".."); // tools/deploy
const REPO_ROOT = path.resolve(TOOLS_DIR, "..", "..");

/**
 * Builds an environment in which the CLI cannot read or write the operator's
 * global Firebase configuration.
 *
 * Two distinct stores, isolated differently on purpose — verified against
 * firebase-tools 15.24.0 rather than assumed:
 *
 *   configstore  → `xdgBasedir.config`, i.e. XDG_CONFIG_HOME (or ~/.config).
 *                  Holds credentials, analytics consent and preferences. Made
 *                  EPHEMERAL: a run must not depend on, nor leave traces in,
 *                  whatever the developer happens to have logged into. This is
 *                  what made the same suite pass on one machine and fail on
 *                  another.
 *
 *   emulator JARs → FIREBASE_EMULATORS_PATH (or ~/.cache/firebase/emulators).
 *                  A ~60 MB binary cache, not configuration. Pointed at a
 *                  PERSISTENT repo-local directory: making it ephemeral would
 *                  re-download the Firestore emulator on every single run and
 *                  make the gate depend on the network. It still never touches
 *                  the user-global location.
 *
 * The first run in a fresh checkout therefore downloads the emulator once.
 *
 * Sandbox lifecycle — deliberately NOT the deployment lock's
 * ----------------------------------------------------------
 * Every controlled termination removes the sandbox: success, non-zero exit,
 * signal, or a spawn that never started. Failing to remove it is reported as a
 * failure rather than swallowed, because "a controlled success cleans up what
 * is temporary" is only true if failing to clean up stops being a success.
 *
 * A hard kill of this wrapper skips that path and can leave an orphan. That is
 * accepted here, and must not be described as "left behind alongside the
 * deployment lock" — the two lifecycles genuinely differ: this wrapper can die
 * while the deployer lives on, reports the npm failure, and releases its own
 * lock, leaving a sandbox with no lock beside it. An orphan is tolerable
 * because it stays under `.deploy`, is never reused (every run mkdtemps its
 * own), never touches the user profile, and cannot make a later run succeed.
 */

/**
 * Variables the CLI must never inherit, matched case-insensitively.
 *
 * Passing the whole environment through and overriding two keys was not
 * isolation: a `DEBUG` left in the operator's shell changed the CLI's output
 * and broke a version assertion. That was the harmless symptom. The same path
 * would have carried an operator's `FIREBASE_TOKEN`, a `GCLOUD_PROJECT`
 * pointing at production, or an `*_EMULATOR_HOST` redirecting traffic — a
 * local, non-mutating gate must not silently inherit an identity, a project
 * or a capability.
 */
const FORBIDDEN_ENV = [
  (k) => k === "DEBUG",
  (k) => k.startsWith("FIREBASE_"),
  (k) => k === "GCLOUD_PROJECT",
  (k) => k.startsWith("GOOGLE_CLOUD_"),
  (k) => k.endsWith("_EMULATOR_HOST"),
  (k) => k === "EVENTARC_EMULATOR",
];

/** Names the wrapper decides itself; any inherited casing is dropped first. */
const IMPOSED_ENV = ["XDG_CONFIG_HOME", "FIREBASE_EMULATORS_PATH", "CLOUDSDK_CONFIG", "GOOGLE_APPLICATION_CREDENTIALS"];

export function isolatedEnv(baseEnv = process.env, configDir) {
  const env = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    const k = key.toUpperCase();
    // Windows environment lookup is case-insensitive, but a plain object is
    // not: setting `GOOGLE_APPLICATION_CREDENTIALS` would leave an inherited
    // `Google_Application_Credentials` sitting beside it, still visible to the
    // child. So every casing is removed before the decided values go in.
    if (FORBIDDEN_ENV.some((deny) => deny(k)) || IMPOSED_ENV.includes(k)) continue;
    env[key] = value;
  }

  // `PATH`, `SystemRoot`, `TEMP`, `JAVA_HOME`, proxy settings, npm's own
  // variables and `CI` all survive: the nested Jest command relies on the PATH
  // npm prepared, Java backs the emulator, and `CI` only adjusts how the CLI
  // words its download notice — forcing or removing it would change behaviour
  // this gate has no business deciding.
  env.XDG_CONFIG_HOME = configDir;
  env.FIREBASE_EMULATORS_PATH = path.join(REPO_ROOT, ".deploy", "emulators");
  // Google's client libraries fall back to the global gcloud configuration
  // when CLOUDSDK_CONFIG is unset, so dropping the variable is not enough —
  // it has to be pointed somewhere harmless.
  env.CLOUDSDK_CONFIG = path.join(configDir, "gcloud");
  // Deliberately a path that does not exist. Application Default Credentials
  // then resolve to nothing: a capability claiming to be local that suddenly
  // tries to authenticate fails loudly instead of reaching a real project with
  // the operator's identity.
  env.GOOGLE_APPLICATION_CREDENTIALS = path.join(configDir, "no-google-credentials.json");
  return env;
}

/**
 * The complete set of things this wrapper can do.
 *
 * `cwd` is stated explicitly rather than inherited: the Firebase CLI locates
 * `firebase.json` by walking up from the working directory, and the Jest
 * config named below is resolved relative to it too. Leaving either to the
 * caller's shell would make the same command mean different things.
 */
const MODES = Object.freeze({
  "serve-functions": {
    // The project is stated, never inferred. `.firebaserc` declares no
    // `default` alias, the configstore is now ephemeral, and GCLOUD_PROJECT is
    // stripped from the environment — so anything unstated would either fail
    // or, worse, resolve to whatever the machine last selected. `demo-` is
    // what makes the emulator refuse to touch a real project.
    args: ["emulators:start", "--only", "functions", "--project=demo-pharmapp"],
    cwd: () => path.join(REPO_ROOT, "functions"),
  },
  "test-rules": {
    args: [
      "emulators:exec",
      "--only",
      "firestore",
      "--project=demo-pharmapp-rules",
      // Run by the Firebase CLI through a shell. That is the audited
      // boundary: a constant, versioned string with no caller input in it.
      "jest --config jest.rules.config.cjs",
    ],
    cwd: () => path.join(REPO_ROOT, "functions"),
  },
});

function fail(message) {
  console.error(`\n❌ firebase-emulators: ${message}\n`);
  process.exit(1);
}

/** Resolves the locked CLI from this repository, never from the PATH. */
export function resolveCli(toolsDir = TOOLS_DIR) {
  const pkgDir = path.join(toolsDir, "node_modules", "firebase-tools");
  const manifestPath = path.join(pkgDir, "package.json");
  if (!fs.existsSync(manifestPath)) {
    return {
      ok: false,
      code: "FIREBASE_CLI_NOT_LOCAL",
      message:
        `firebase-tools is not installed in tools/deploy. Run ` +
        `\`npm ci --prefix tools/deploy\`. A global CLI is not used: it is ` +
        `absent from every lockfile, so the version could differ per machine.`,
    };
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const rel = manifest?.bin?.firebase;
  if (!rel) {
    return { ok: false, code: "FIREBASE_CLI_UNREADABLE", message: "firebase-tools declares no bin." };
  }
  return { ok: true, cli: path.join(pkgDir, rel), version: manifest.version };
}

/**
 * Turns argv into a resolved plan, or a refusal. Exported so the refusals can
 * be tested without launching an emulator.
 */
export function planInvocation(argv) {
  const [mode, ...rest] = argv;
  if (!mode) {
    return {
      ok: false,
      code: "MODE_MISSING",
      message: `A mode is required. One of: ${Object.keys(MODES).join(", ")}.`,
    };
  }
  if (!Object.hasOwn(MODES, mode)) {
    return {
      ok: false,
      code: "MODE_FORBIDDEN",
      message:
        `Refusing '${mode}'. This wrapper exposes a closed set of ` +
        `non-mutating capabilities (${Object.keys(MODES).join(", ")}) so that ` +
        `no versioned script can trigger a deployment. Deployments go through ` +
        `\`npm run deploy:staging\`.`,
    };
  }
  if (rest.length > 0) {
    return {
      ok: false,
      code: "ARGS_FORBIDDEN",
      message:
        `Mode '${mode}' takes no extra arguments, but received ` +
        `${JSON.stringify(rest)}. Arbitrary passthrough would turn this ` +
        `wrapper back into a general-purpose CLI.`,
    };
  }
  return { ok: true, mode, args: MODES[mode].args, cwd: MODES[mode].cwd() };
}


/** Prefix of the per-run configuration sandbox. Never reused between runs. */
export const SANDBOX_PREFIX = "firebase-config-";

/**
 * Runs a planned mode in an isolated configuration sandbox and returns a
 * verdict — it never exits the process itself.
 *
 * The decision lives here, not inside callbacks followed by `process.exit`,
 * for two reasons. The interesting cases (a spawn that never starts, a cleanup
 * that fails after a successful command) cannot be provoked reliably with real
 * permissions, so they need injectable `spawnFn`/`rm`. And a verdict that only
 * exists as an exit code cannot be asserted on.
 *
 * Contract:
 *
 *   CLI outcome     cleanup    verdict
 *   ------------    -------    ---------------------------------------------
 *   success         ok         success
 *   success         failed     FIREBASE_SANDBOX_CLEANUP_FAILED
 *   non-zero/signal ok         the CLI failure, exit code preserved
 *   non-zero/signal failed     the CLI failure, cleanup as SECONDARY note
 *   spawn error     ok         FIREBASE_CLI_SPAWN_FAILED
 *   spawn error     failed     FIREBASE_CLI_SPAWN_FAILED + cleanup note
 *
 * A cleanup failure never becomes a success, and never displaces the CLI's own
 * failure — that is the operator's actual problem, and a Rules failure hidden
 * behind a housekeeping error is exactly the kind of misreport this tooling
 * exists to prevent.
 */
export function runIsolatedFirebase({
  plan,
  cliPath,
  stateDir,
  env = process.env,
  spawnFn = spawn,
  rm = fs.rmSync,
  mkdtemp = fs.mkdtempSync,
  mkdir = fs.mkdirSync,
}) {
  // Sandbox creation is part of the contract, not a precondition assumed to
  // hold. Letting mkdir/mkdtemp throw would escape the verdict shape entirely:
  // a stack trace instead of a code, and a caller with nothing to branch on.
  let configDir;
  try {
    mkdir(stateDir, { recursive: true });
    configDir = mkdtemp(path.join(stateDir, SANDBOX_PREFIX));
  } catch (e) {
    return Promise.resolve({
      ok: false,
      code: "FIREBASE_SANDBOX_CREATE_FAILED",
      message:
        `The isolated configuration sandbox could not be created under ` +
        `${stateDir}: ${e.message}. Refusing to run the CLI with the ` +
        `operator's own Firebase configuration.`,
      exitCode: 1,
      signal: null,
      configDir: null,
      // Nothing was created, so nothing is owed a removal — and claiming an
      // attempt would misreport what happened.
      cleanup: { attempted: false, ok: true, error: null },
    });
  }

  return new Promise((resolve) => {
    let settled = false;

    /** Cleanup runs exactly once, and the verdict is produced exactly once. */
    const finish = ({ status = null, signal = null, spawnError = null }) => {
      if (settled) return; // 'error' and 'exit' may both fire
      settled = true;

      let cleanupError = null;
      try {
        rm(configDir, { recursive: true, force: true });
      } catch (e) {
        cleanupError = e;
      }
      const cleanup = { attempted: true, ok: !cleanupError, error: cleanupError?.message ?? null };
      const residue =
        `\nIts configuration sandbox also survived (${cleanup.error}); remove ` +
        `${configDir} before the next run.`;

      if (spawnError) {
        return resolve({
          ok: false,
          code: "FIREBASE_CLI_SPAWN_FAILED",
          message:
            `The Firebase CLI could not be started: ${spawnError.message}` +
            (cleanupError ? residue : ""),
          exitCode: 1,
          signal: null,
          configDir,
          cleanup,
        });
      }

      if (signal) {
        return resolve({
          ok: false,
          code: "FIREBASE_CLI_SIGNALLED",
          message: `The Firebase CLI was terminated by ${signal}.` + (cleanupError ? residue : ""),
          exitCode: 1,
          signal,
          configDir,
          cleanup,
        });
      }

      // Neither a status nor a signal: the child's outcome is unknown. Left as
      // `exitCode: status`, this produced `process.exit(null)` — which Node
      // treats as 0. An indeterminate state must never read as success.
      if (status === null || status === undefined) {
        return resolve({
          ok: false,
          code: "FIREBASE_CLI_EXIT_UNKNOWN",
          message:
            `The Firebase CLI ended without reporting an exit code or a signal, ` +
            `so its outcome cannot be established. Refusing rather than assuming ` +
            `success.` + (cleanupError ? residue : ""),
          exitCode: 1,
          signal: null,
          configDir,
          cleanup,
        });
      }

      if (status !== 0) {
        return resolve({
          ok: false,
          code: "FIREBASE_CLI_FAILED",
          message: `The Firebase CLI exited with code ${status}.` + (cleanupError ? residue : ""),
          // The CLI's own exit code survives: it is the primary cause.
          exitCode: status,
          signal: null,
          configDir,
          cleanup,
        });
      }

      if (cleanupError) {
        return resolve({
          ok: false,
          code: "FIREBASE_SANDBOX_CLEANUP_FAILED",
          message:
            `The command succeeded but its configuration sandbox could not be ` +
            `removed (${cleanup.error}). Reporting failure rather than a success ` +
            `that leaves temporary state behind: ${configDir}`,
          exitCode: 1,
          signal: null,
          configDir,
          cleanup,
        });
      }

      resolve({ ok: true, code: null, message: null, exitCode: 0, signal: null, configDir, cleanup });
    };

    try {
      const child = spawnFn(process.execPath, [cliPath, ...plan.args], {
        cwd: plan.cwd,
        stdio: "inherit",
        shell: false,
        env: isolatedEnv(env, configDir),
      });
      // A spawn that never starts has a different contract from a process that
      // ran and exited; without this handler it would surface as an unhandled
      // error event and skip cleanup entirely. Registration is inside the try
      // because a child without a usable `on` would otherwise throw here,
      // outside the verdict shape and after the sandbox already exists.
      child.on("error", (spawnError) => finish({ spawnError }));
      child.on("exit", (status, signal) => finish({ status, signal }));
    } catch (e) {
      finish({ spawnError: e });
    }
  });
}

// --- entry point ------------------------------------------------------------
// Guarded so the module can be imported by tests without executing anything.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const plan = planInvocation(process.argv.slice(2));
  if (!plan.ok) fail(`[${plan.code}] ${plan.message}`);

  const resolved = resolveCli();
  if (!resolved.ok) fail(`[${resolved.code}] ${resolved.message}`);

  const verdict = await runIsolatedFirebase({
    plan,
    cliPath: resolved.cli,
    stateDir: path.join(REPO_ROOT, ".deploy"),
  });
  if (!verdict.ok) console.error(`\n❌ firebase-emulators: [${verdict.code}] ${verdict.message}\n`);
  process.exit(verdict.exitCode);
}
