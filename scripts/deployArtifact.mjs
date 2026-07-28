/**
 * deployArtifact — a deterministic identity for the Functions payload.
 *
 * What this hashes, and why exactly this
 * --------------------------------------
 * Not `lib/index.js`, and not a tarball. A tarball carries mtimes and an
 * archive order, so the same source would hash differently twice — useless for
 * proving "this is the code that was tested". The hash must be over the SET of
 * files Firebase would actually upload, by content, independent of enumeration
 * order, absolute location and filesystem metadata.
 *
 * The inclusion rule is Firebase's own, read from
 * `firebase-tools/lib/deploy/functions/prepareFunctionsUpload.js` rather than
 * guessed:
 *
 *   ignore = config.functions.ignore || ["node_modules", ".git"]
 *   ignore.push("firebase-debug.log", "firebase-debug.*.log",
 *               ".runtimeconfig.json")
 *
 * matched with `minimatch(path, glob, {matchBase: true, dot: true})`. `matchBase`
 * makes a slashless pattern match the BASENAME at any depth, so a nested
 * `node_modules` is excluded too. Critically, `prepareFunctionsUpload` does NOT
 * pass `supportGitIgnore`, so `.gitignore` is never consulted — `functions/lib`
 * is packaged despite being gitignored. That is the whole reason a Git-clean
 * check cannot stand in for this hash: the payload contains files git ignores.
 *
 * The five default patterns are exactly `ALLOWED_FUNCTIONS_IGNORE`, and
 * `checkFunctionsIgnore` refuses any config outside that allowlist — so the
 * exclusion set is bounded to slashless patterns, and a faithful basename
 * matcher for them is sufficient. A slash pattern would need real minimatch;
 * the gate forbids one from ever appearing.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { ALLOWED_FUNCTIONS_IGNORE } from "./deployChecks.mjs";

/** The three patterns Firebase always appends, on top of the configured set. */
const ALWAYS_IGNORED = Object.freeze([
  "firebase-debug.log",
  "firebase-debug.*.log",
  ".runtimeconfig.json",
]);

/**
 * The effective ignore globs for a given firebase.json, mirroring
 * prepareFunctionsUpload exactly: the configured list (or the default), plus
 * the always-appended three.
 */
export function functionsIgnoreGlobs(firebaseConfig) {
  const configured = firebaseConfig?.functions?.ignore ?? ["node_modules", ".git"];
  return [...configured, ...ALWAYS_IGNORED];
}

/**
 * Faithful basename matcher for the bounded pattern set. `*` → any run of
 * non-slash characters, `?` → one; every other glob metacharacter among these
 * patterns is a literal. Applied to a basename, which never contains a slash.
 */
function basenameMatchesAny(basename, globs) {
  return globs.some((glob) => {
    const rx =
      "^" +
      glob
        .split("")
        .map((ch) => {
          if (ch === "*") return "[^/]*";
          if (ch === "?") return "[^/]";
          return /[.+^${}()|[\]\\]/.test(ch) ? "\\" + ch : ch;
        })
        .join("") +
      "$";
    return new RegExp(rx).test(basename);
  });
}

/** SHA-256 of a file's exact bytes. No mode, no mtime — content only. */
function hashFileContent(absPath, readFileSync) {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

/** Structured code for a walk that would loop forever on a symlink cycle. */
export const SYMLINK_CYCLE_CODE = "FUNCTIONS_ARTIFACT_SYMLINK_CYCLE";

/**
 * Thrown, not returned: a cycle aborts the walk before any file list exists,
 * so there is no partial result to hand back. The orchestrator turns this into
 * a structured refusal.
 */
export class SymlinkCycleError extends Error {
  constructor(relPath, resolved) {
    super(
      `A symlink cycle would make the Functions walk loop forever: '${relPath}' ` +
        `resolves to '${resolved}', already open on the current branch. Refusing ` +
        `rather than hashing part of the tree or hanging.`
    );
    this.code = SYMLINK_CYCLE_CODE;
    this.relPath = relPath;
  }
}

/**
 * Walks `functionsDir` and returns the packaged files as a sorted list of
 * `{ path, sha256 }`, paths relative to `functionsDir` with forward slashes.
 *
 * Sorting makes the result independent of directory enumeration order; the
 * relative, normalised path makes it independent of where the checkout lives;
 * hashing content (not the archive) makes it independent of mtimes.
 */
export function collectPackagedFiles(
  functionsDir,
  globs,
  {
    readdirSync = fs.readdirSync,
    statSync = fs.statSync,
    readFileSync = fs.readFileSync,
    realpathSync = fs.realpathSync,
  } = {}
) {
  const files = [];
  const rel = (abs) => path.relative(functionsDir, abs).split(path.sep).join("/");

  /**
   * `ancestors` is the stack of resolved (realpath) directories currently open
   * on THIS branch of the walk — not a global visited set. That distinction is
   * deliberate: a global set would wrongly drop a second alias pointing at a
   * directory already seen on another branch, whereas Firebase packages the
   * files under both relative paths. A per-branch ancestor stack only fires
   * when a directory resolves to one of its own ancestors — the actual cycle.
   */
  const walk = (absDir, ancestors) => {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      // Basename exclusion at every level: a matched directory is never
      // descended into, a matched file never recorded.
      if (basenameMatchesAny(entry.name, globs)) continue;
      const abs = path.join(absDir, entry.name);
      // statSync FOLLOWS symlinks, on purpose: prepareFunctionsUpload.js walks
      // the Functions source without `ignoreSymlinks`, so Firebase itself
      // classifies a symlink by its target and packages what it points at —
      // including targets outside functions/. Skipping links would make this
      // hash omit files that actually deploy. (The `ignoreSymlinks: true`
      // branch exists only for archiveDirectory.js — Hosting/extensions.)
      const st = statSync(abs);
      if (st.isDirectory()) {
        const resolved = realpathSync(abs);
        if (ancestors.includes(resolved)) {
          throw new SymlinkCycleError(rel(abs), resolved);
        }
        walk(abs, [...ancestors, resolved]);
      } else if (st.isFile()) {
        files.push({ path: rel(abs), sha256: hashFileContent(abs, readFileSync) });
      }
    }
  };
  walk(functionsDir, [realpathSync(functionsDir)]);
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return files;
}

/**
 * The artefact hash: SHA-256 over the canonical serialisation of the sorted
 * `{path, sha256}` list.
 *
 * Because the path is part of each hashed record, a rename changes the hash
 * even when content is untouched; because the list is the whole set, an add or
 * delete changes it; because each record carries the content digest, an edit
 * changes it. An excluded file never enters the set, so it cannot change it.
 */
export function hashFunctionsArtifact(functionsDir, globs, io = {}) {
  const files = collectPackagedFiles(functionsDir, globs, io);
  const canonical = files.map((f) => `${f.path}\0${f.sha256}`).join("\n");
  const hash = createHash("sha256").update(canonical).digest("hex");
  return { hash: `sha256:${hash}`, fileCount: files.length, files };
}
