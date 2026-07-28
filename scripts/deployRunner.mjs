/**
 * deployRunner — subprocess execution for the deployment gate.
 *
 * The Windows problem, and why this module does not have it
 * ---------------------------------------------------------
 * npm and the Firebase CLI ship on Windows as `.cmd` shims. Node has refused
 * to spawn `.bat`/`.cmd` without a shell since the CVE-2024-27980 fix, so
 * "resolve npm.cmd" and "never use shell: true" cannot both hold — proven:
 * `execFileSync("npm.cmd", ["--version"], {shell:false})` fails EINVAL.
 *
 * The way out is to stop launching the shims. Both CLIs are JavaScript
 * programs, so they run under the Node binary already executing this file:
 *
 *     node <npm-cli.js>      --prefix functions ci
 *     node <firebase-cli.js> --version
 *
 * That satisfies every constraint at once — no shell, no interpolation, argv
 * arrays, identical on Windows and Linux, and timeouts we control.
 *
 * Where a shell still legitimately appears
 * ----------------------------------------
 * This module creates no shell command. npm itself may use one to run the
 * scripts declared in `package.json`; those are constant, versioned strings
 * with no user data or secret interpolated into them. `test:rules` nests a
 * command that way and is audited as such.
 *
 * Timeouts, and why this runner is asynchronous
 * ---------------------------------------------
 * Measured on Windows, a descendant's fate depends on how it was started:
 *
 *   detached: false → dies with the parent (libuv puts it in a job object)
 *   detached: true  → SURVIVES
 *
 * The second case is the one that left a Firestore emulator holding port 8080
 * after the run that started it had gone. Reaching it requires killing the
 * tree while the parent is still alive: once the parent is dead the tree is
 * no longer enumerable and `taskkill /T` reports "process not found".
 *
 * `spawnSync`'s own timeout kills the direct child before we regain control,
 * so it can never satisfy that. Hence `spawn` plus our own timer, which fires
 * on a LIVE process — the reason `runCommand` returns a promise.
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Maximum bytes of captured output surfaced in a failure. */
export const MAX_OUTPUT_BYTES = 4000;

/** Trims captured output to the tail, which is where failures explain themselves. */
export function boundOutput(text, max = MAX_OUTPUT_BYTES) {
  const s = String(text ?? "");
  if (s.length <= max) return s;
  return `… [${s.length - max} bytes omitted] …\n` + s.slice(-max);
}

function refuse(code, message) {
  return { ok: false, code, message };
}

// ---------------------------------------------------------------------------
// Runtime resolution
// ---------------------------------------------------------------------------

const JS_ENTRY = /\.(c?js|mjs)$/i;

/**
 * REQ-B-EXEC-01 — locates npm's own JavaScript entry point.
 *
 * `npm_execpath` is set by npm when it runs a script, and points at the real
 * `npm-cli.js` whatever the installation layout (nvm, volta, Corepack, a
 * plain install). Nothing is reconstructed by hand: guessing a path is how a
 * tool works on one machine and not the next.
 *
 * Its absence means the script was launched directly rather than through
 * `npm run deploy:staging`, bypassing the expected bootstrap — refused
 * rather than worked around.
 */
export function resolveNpmRuntime(env = process.env, exists = fs.existsSync) {
  const raw = env?.npm_execpath;
  if (!raw) {
    return refuse(
      "NPM_RUNTIME_UNRESOLVED",
      "npm_execpath is not set, which means this script was not launched " +
        "through npm. Run `npm run deploy:staging -- <phase> --project=…` so " +
        "the npm runtime is resolved by npm itself rather than guessed."
    );
  }
  if (!path.isAbsolute(raw)) {
    return refuse(
      "NPM_RUNTIME_UNRESOLVED",
      `npm_execpath is not absolute (${raw}); refusing to resolve it against ` +
        `an ambient working directory.`
    );
  }
  if (!JS_ENTRY.test(raw)) {
    return refuse(
      "NPM_RUNTIME_UNRESOLVED",
      `npm_execpath points at ${raw}, which is not a JavaScript entry point. ` +
        `A .cmd or .bat shim cannot be run without a shell.`
    );
  }
  if (!exists(raw)) {
    return refuse("NPM_RUNTIME_UNRESOLVED", `npm_execpath points at ${raw}, which does not exist.`);
  }
  return { ok: true, npmCli: raw };
}

/**
 * REQ-B-EXEC-02 / REQ-DEP-ISO-01 — locates the Firebase CLI inside the
 * repository's own locked dependencies.
 *
 * Two separate reasons constrain where it may live:
 *
 * A globally installed CLI is invisible to the lockfile, so two machines
 * could deploy the same commit through different Firebase versions and
 * neither could tell. Hence: local only.
 *
 * And it must NOT live in `functions`. Installing it there was measured to
 * re-resolve the runtime graph that ships to Cloud Functions — protobufjs
 * 7.5.4 → 7.6.5 plus seven other packages, one dropped — meaning an upgrade
 * of the delivery tool would silently change deployed code. Hence:
 * `tools/deploy`, which has its own lockfile and is never uploaded.
 *
 * Resolution happens AFTER `npm ci`, never before — refusing at bootstrap
 * would reject a perfectly good checkout for not yet having installed.
 */
export function resolveFirebaseCli(
  toolsDir,
  { exists = fs.existsSync, readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8")) } = {}
) {
  const pkgDir = path.join(toolsDir, "node_modules", "firebase-tools");
  const pkgJson = path.join(pkgDir, "package.json");
  if (!exists(pkgJson)) {
    return refuse(
      "FIREBASE_CLI_NOT_LOCAL",
      `firebase-tools is not installed under ${path.relative(process.cwd(), pkgDir)}. ` +
        `Run \`npm ci --prefix tools/deploy\`. A global CLI is not accepted: it ` +
        `is absent from the lockfile, so the version used to deploy a commit ` +
        `would differ between machines. It must not be installed under ` +
        `functions/ either — that would couple the delivery tool to the ` +
        `dependency graph shipped to Cloud Functions.`
    );
  }
  let manifest;
  try {
    manifest = readJson(pkgJson);
  } catch (e) {
    return refuse("FIREBASE_CLI_UNREADABLE", `firebase-tools package.json is unreadable: ${e.message}`);
  }
  const rel = manifest?.bin?.firebase ?? manifest?.main;
  if (!rel) {
    return refuse("FIREBASE_CLI_UNREADABLE", "firebase-tools declares no bin/firebase entry point.");
  }
  const entry = path.join(pkgDir, rel);
  if (!exists(entry)) {
    return refuse("FIREBASE_CLI_UNREADABLE", `firebase-tools entry point ${rel} does not exist.`);
  }
  return { ok: true, firebaseCli: entry, version: manifest.version ?? null };
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Terminates a LIVE process and its descendants.
 *
 * Must be called while the target still exists: once it is gone, Windows can
 * no longer enumerate the tree and a detached descendant becomes unreachable.
 *
 * `taskkill` is a real executable and a POSIX group kill is a syscall, so no
 * shell is involved either way.
 */
export function killTree(pid, platform = process.platform, sync = spawnSync) {
  if (!pid) return;
  try {
    if (platform === "win32") {
      sync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      // The child was made a group leader below, so the negative pid reaches
      // every descendant that has not deliberately started its own session.
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    // Best effort: the tree may already be gone.
  }
}

/**
 * Runs a command and resolves to a verdict rather than throwing.
 *
 * Asynchronous by necessity, not by taste: see the module header. The timer
 * has to fire while the process is still alive for the tree kill to reach a
 * detached descendant.
 *
 * @param redact applied to captured output AND to the displayed command line —
 *               a failing `--dart-define=STAGING_API_KEY=…` would otherwise
 *               print the key in the message meant to report it safely.
 */
export function runCommand(
  cmd,
  args,
  { cwd, env, timeoutMs = 300_000, redact = (x) => x, platform = process.platform } = {}
) {
  if (!Array.isArray(args)) {
    throw new TypeError("runCommand: args must be an array — never a joined string.");
  }
  const shown = redact(`${cmd} ${args.join(" ")}`);

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, {
        cwd,
        env,
        shell: false, // never; see the module header
        stdio: ["ignore", "pipe", "pipe"],
        // POSIX: make the child a process-group leader so a timeout can
        // signal the whole group. On Windows libuv's job object already
        // cascades to attached children, and `taskkill /T` covers the rest.
        detached: platform !== "win32",
      });
    } catch (e) {
      return resolve(refuse("COMMAND_UNRUNNABLE", `\`${shown}\` could not be started: ${e.message}`));
    }

    // Keep only the tail: a runaway log must not exhaust memory before it
    // gets the chance to be truncated for display.
    const CAP = MAX_OUTPUT_BYTES * 4;
    let out = "";
    let err = "";
    const keepTail = (s) => (s.length > CAP ? s.slice(-CAP) : s);
    child.stdout.on("data", (d) => (out = keepTail(out + d)));
    child.stderr.on("data", (d) => (err = keepTail(err + d)));

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid, platform); // while it is still alive — the point
    }, timeoutMs);

    const settle = (verdict) => {
      clearTimeout(timer);
      resolve(verdict);
    };

    child.on("error", (e) =>
      settle(refuse("COMMAND_UNRUNNABLE", `\`${shown}\` could not be started: ${e.message}`))
    );

    child.on("close", (status) => {
      const captured = boundOutput(redact(out + err));
      if (timedOut) {
        return settle({
          ok: false,
          code: "COMMAND_TIMEOUT",
          command: shown,
          timedOut: true,
          message: `\`${shown}\` exceeded ${timeoutMs} ms; the process tree was killed.`,
        });
      }
      if (status !== 0) {
        return settle({
          ok: false,
          code: "COMMAND_FAILED",
          command: shown,
          timedOut: false,
          message: `\`${shown}\` failed (exit ${status}).\n\n${captured}`,
        });
      }
      settle({ ok: true, stdout: redact(out).trim(), captured });
    });
  });
}

/** Runs an npm script through npm's own JavaScript, never through a shim. */
export function runNpm(npmCli, args, opts = {}) {
  return runCommand(process.execPath, [npmCli, ...args], opts);
}

/** Runs the repository-local Firebase CLI through Node. */
export function runFirebase(firebaseCli, args, opts = {}) {
  return runCommand(process.execPath, [firebaseCli, ...args], opts);
}

/**
 * REQ-B-EXEC-03 — probes a tool's version, reading stdout AND stderr.
 *
 * `java -version` prints to stderr; a probe reading only stdout reports Java
 * as missing on a machine where the Rules emulator runs fine.
 */
export function probeTool(cmd, args, { redact = (x) => x, cwd } = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    timeout: 15_000,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.error) return null; // binary genuinely not runnable
  const said = redact(`${r.stdout ?? ""}\n${r.stderr ?? ""}`).trim();
  return said.length > 0 ? said : null;
}

/**
 * Runs an ordered pipeline, stopping at the first failure.
 *
 * Returns the named result of every gate that ran, so the manifest records
 * what was actually proven rather than a single boolean.
 */
export async function runPipeline(steps, { onStep = () => {} } = {}) {
  const results = [];
  for (const step of steps) {
    onStep(step.label, "start");
    const r = await step.run();
    results.push({ label: step.label, ok: r.ok, code: r.code ?? null });
    onStep(step.label, r.ok ? "pass" : "fail");
    if (!r.ok) return { ok: false, results, failure: { label: step.label, ...r } };
  }
  return { ok: true, results };
}
