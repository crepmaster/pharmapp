/**
 * verifyExports — deployment barrier. Read-only, exits non-zero on failure.
 *
 * Why this exists
 * ---------------
 * On 2026-07-21 a deploy shipped a `functions/lib` that was 1h44 older than
 * `functions/src`. Firebase packages from `main: "lib/index.js"`, so the
 * stale artefact went live: a brand-new callable simply did not exist in
 * production traffic, while the Firestore rules that depended on it — which
 * deploy from a source file, not from `lib` — did. Staging was left in a
 * state strictly worse than before the deploy.
 *
 * Nothing detected it. The build was a human convention, and the convention
 * failed on its first real occasion.
 *
 * Worse, `functions/lib` is committed: a FRESH CLONE of this repository
 * carries an artefact missing 2 exports and 29 of the modules its own index
 * re-exports. Building is not an optimisation here — it is the only thing
 * that makes the checkout deployable at all.
 *
 * Three checks, each mapping to one way that failure can happen:
 *
 *   1. EXPORTS   — every symbol `src/index.ts` exports must be exported by
 *                  `lib/index.js`. Catches "the new function was never
 *                  compiled".
 *   2. RESOLVE   — every module `lib/index.js` re-exports must exist on
 *                  disk. Catches a half-written or partially cleaned build.
 *   3. FRESHNESS — no source `.ts` may be newer than the newest emitted
 *                  `.js`. Catches "someone edited after building".
 *
 * FRESHNESS is a short-term guard, not the durable guarantee: timestamps
 * survive neither a copy nor a checkout faithfully. The real answer is
 * `prebuild` wiping `lib` plus untracking it, so the only `lib` that can
 * exist is one this build just produced.
 *
 * Deliberately NOT importing the compiled module: loading it runs
 * module-level side effects (Firestore handles,
 * `assertSandboxAllowedForProject`) and would fail for reasons unrelated to
 * packaging. That second proof — that the artefact actually initialises —
 * belongs to the post-deploy smoke test, not here.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Collects `export { a, b } from "..."` and `export const a` names. */
export function exportedNames(source) {
  const names = new Set();
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const raw of m[1].split(",")) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  for (const m of source.matchAll(
    /export\s+(?:declare\s+)?(?:const|function|class|async function)\s+([A-Za-z0-9_$]+)/g
  )) {
    names.add(m[1]);
  }
  return names;
}

/** Recursively lists files with `ext`, skipping tests and node_modules. */
export function walk(dir, ext, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Tests are not emitted in the deployed shape, so editing one must not
      // look like a stale build.
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      walk(full, ext, acc);
    } else if (entry.name.endsWith(ext)) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Runs the three checks against an arbitrary src/lib pair.
 *
 * Parameterised so the tests can exercise it on throwaway fixtures. A barrier
 * whose own tests had to mutate the real `src` or `lib` would be unusable in
 * CI and would corrupt the very tree it exists to protect.
 *
 * @returns {{ok: boolean, problems: string[], exports: number, emitted: number}}
 */
export function verifyArtefact({ srcDir, libDir, freshnessSlackMs = 1000 }) {
  const problems = [];
  const libIndex = path.join(libDir, "index.js");

  if (!fs.existsSync(libIndex)) {
    return {
      ok: false,
      exports: 0,
      emitted: 0,
      problems: [
        "MISSING: lib/index.js does not exist — the build did not run. " +
          "Firebase packages `main: lib/index.js`; deploying now would ship nothing.",
      ],
    };
  }

  const srcIndex = fs.readFileSync(path.join(srcDir, "index.ts"), "utf8");
  const libIndexSource = fs.readFileSync(libIndex, "utf8");

  // 1. exports
  const wanted = exportedNames(srcIndex);
  const got = exportedNames(libIndexSource);
  const missing = [...wanted].filter((n) => !got.has(n)).sort();
  if (missing.length) {
    problems.push(
      `EXPORTS: ${missing.length} symbol(s) exported by src/index.ts are absent ` +
        `from the compiled lib/index.js: ${missing.join(", ")}`
    );
  }

  // 2. resolvable modules
  for (const m of libIndexSource.matchAll(/from\s+"(\.[^"]+)"/g)) {
    if (!fs.existsSync(path.resolve(libDir, m[1]))) {
      problems.push(
        `RESOLVE: lib/index.js re-exports "${m[1]}" but that file does not exist.`
      );
    }
  }

  // 3. freshness
  const srcFiles = walk(srcDir, ".ts");
  const libFiles = walk(libDir, ".js");
  if (libFiles.length === 0) {
    problems.push("FRESHNESS: lib contains no emitted JavaScript.");
  } else {
    const newestLib = libFiles.reduce(
      (a, f) => Math.max(a, fs.statSync(f).mtimeMs),
      0
    );
    const stale = srcFiles
      .filter((f) => fs.statSync(f).mtimeMs > newestLib + freshnessSlackMs)
      .map((f) => path.relative(srcDir, f))
      .sort();
    if (stale.length) {
      problems.push(
        `FRESHNESS: source edited after the last build — ${stale.join(", ")}`
      );
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    exports: wanted.size,
    emitted: libFiles.length,
  };
}

// ---- CLI -------------------------------------------------------------------

const invokedDirectly =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  const FUNCTIONS = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  );
  const result = verifyArtefact({
    srcDir: path.join(FUNCTIONS, "src"),
    libDir: path.join(FUNCTIONS, "lib"),
  });

  if (!result.ok) {
    console.error(
      "\n❌ Deployment barrier: the compiled artefact does not match the source.\n"
    );
    for (const p of result.problems) console.error("  " + p + "\n");
    console.error("Run `npm run build` in functions/, then deploy again.\n");
    process.exit(1);
  }
  console.log(
    `✅ Artefact verified: ${result.exports} exports present, ` +
      `${result.emitted} emitted files, build not stale.`
  );
  process.exit(0);
}
