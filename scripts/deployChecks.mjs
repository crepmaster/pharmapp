/**
 * deployChecks — pure decision layer for `deploy-staging.mjs`.
 *
 * Every function takes already-collected inputs and returns a verdict. None
 * of them runs a command, reads the network or touches Firebase, so the
 * refusals can be tested exhaustively without a project, credentials or a
 * dirty tree.
 *
 * The split exists because a deployment gate is worth exactly what it
 * declines. Refusals exercised once by hand, on the day they are written,
 * quietly stop refusing.
 */

/** The only project this tooling may target. */
export const ALLOWED_PROJECT = "mediexchange-staging";

/** Phases, in the order they may legitimately run. */
export const PHASES = ["preflight", "expand", "contract", "verify"];

/**
 * The exact `functions.predeploy` this repository requires, in order.
 *
 * Compared literally rather than by substring: a hook reading
 * `npm run build --workspace=other` contains "run build" and would satisfy a
 * loose check while building the wrong thing.
 */
export const REQUIRED_PREDEPLOY = Object.freeze([
  "npm --prefix functions run build",
  "npm --prefix functions run verify:exports",
]);

/**
 * Patterns allowed in `functions.ignore`.
 *
 * An allowlist rather than a search for "lib": Firebase matches these as
 * globs, so `**`, `*`, `l*` or `**\/*.js` all exclude the compiled output
 * without containing the word. Proving a pattern safe would mean
 * reimplementing Firebase's matcher; refusing anything we did not explicitly
 * vet is the honest alternative, and adding a pattern here is a deliberate,
 * reviewable act.
 */
export const ALLOWED_FUNCTIONS_IGNORE = Object.freeze([
  "node_modules",
  ".git",
  // `*-debug.log` covers firestore-debug.log, firebase-debug.log,
  // functions-debug.log … — the emulator logs that a preflight Rules run
  // writes into the tree BEFORE the artefact is hashed. Not excluding them
  // made the hash capture a per-run log and stop being reproducible.
  "*-debug.log",
  "firebase-debug.log",
  "firebase-debug.*.log",
  ".runtimeconfig.json",
]);

/**
 * Patterns `functions.ignore` MUST contain. `node_modules`/`.git` keep the
 * upload from carrying hundreds of MB and the git history; `*-debug.log` keeps
 * the artefact hash deterministic across runs.
 */
export const REQUIRED_FUNCTIONS_IGNORE = Object.freeze(["node_modules", ".git", "*-debug.log"]);

function refuse(code, message) {
  return { ok: false, code, message };
}
const accept = (detail = {}) => ({ ok: true, ...detail });

// ---------------------------------------------------------------------------

export function checkPhase(phase) {
  if (!phase) {
    return refuse("PHASE_MISSING", `A phase is required. One of: ${PHASES.join(", ")}.`);
  }
  if (!PHASES.includes(phase)) {
    return refuse("PHASE_UNKNOWN", `Unknown phase '${phase}'. One of: ${PHASES.join(", ")}.`);
  }
  return accept({ phase });
}

export function checkProject(project) {
  if (!project) {
    return refuse("PROJECT_MISSING", "--project is required; this script never guesses a target.");
  }
  if (project !== ALLOWED_PROJECT) {
    return refuse(
      "PROJECT_FORBIDDEN",
      `Refusing to target '${project}'. This entry point only deploys ` +
        `'${ALLOWED_PROJECT}'. Production has its own reviewed path.`
    );
  }
  return accept({ project });
}

/**
 * The worktree must be spotless: modified, staged AND untracked files all
 * block. Ignored files do not, which is what makes `node_modules`, the
 * compiled `functions/lib` and the Flutter build output acceptable.
 *
 * There is deliberately no `--allow-dirty`: an escape hatch on a deployment
 * gate becomes the normal path within a week.
 */
export function checkWorktreeClean(porcelain) {
  const lines = (porcelain ?? "")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return accept();
  return refuse(
    "WORKTREE_DIRTY",
    `The worktree has ${lines.length} uncommitted change(s). Deploy from a ` +
      `clean checkout so the deployed SHA fully describes what was shipped:\n` +
      lines.map((l) => "    " + l).join("\n")
  );
}

/**
 * A detached HEAD has no branch, so there is nothing to compare against the
 * server and nothing a reviewer can pull. Refused by name rather than left
 * to fail later as a confusing "branch HEAD does not exist on the remote".
 */
export function checkHeadAttached(branch) {
  if (!branch) return refuse("HEAD_UNRESOLVED", "Could not determine the current branch.");
  if (branch === "HEAD") {
    return refuse(
      "HEAD_DETACHED",
      "HEAD is detached. Deploy from a branch: a detached commit cannot be " +
        "compared to a remote ref, and nobody can check out what shipped."
    );
  }
  return accept({ branch });
}

/**
 * `origin` must exist. Everything downstream queries it by name, and a repo
 * whose remote is called something else would otherwise fail with an opaque
 * git error instead of a stated refusal.
 */
export function checkOriginConfigured(remoteNames) {
  const names = (remoteNames ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!names.includes("origin")) {
    return refuse(
      "ORIGIN_MISSING",
      `No remote named 'origin' (found: ${names.join(", ") || "none"}). ` +
        `This gate proves provenance against origin specifically.`
    );
  }
  return accept({ remotes: names });
}

/** Firebase must package the directory this repository actually builds. */
export function checkFunctionsSource(firebaseConfig) {
  const source = firebaseConfig?.functions?.source;
  if (source !== "functions") {
    return refuse(
      "FUNCTIONS_SOURCE_UNEXPECTED",
      `firebase.json functions.source is ${JSON.stringify(source)}; this gate ` +
        `only vouches for 'functions'. Every other check — predeploy, ignore, ` +
        `artefact verification — is written against that directory.`
    );
  }
  return accept({ source });
}

/**
 * `main` is what Cloud Functions loads. If it stops pointing at the compiled
 * entry point, the upload can be perfectly built and still expose nothing.
 */
export function checkFunctionsMain(functionsPackageJson) {
  const main = functionsPackageJson?.main;
  if (main !== "lib/index.js") {
    return refuse(
      "FUNCTIONS_MAIN_UNEXPECTED",
      `functions/package.json main is ${JSON.stringify(main)}, expected ` +
        `"lib/index.js". That field decides which file Cloud Functions loads; ` +
        `the artefact verification checks lib/index.js and would be vouching ` +
        `for a file nobody runs.`
    );
  }
  return accept({ main });
}

/**
 * Turns a parse failure into a refusal like any other.
 *
 * A raw `SyntaxError` escaping the gate would bypass the refusal format
 * entirely: no code, no guidance, and an exit path that skips lock cleanup.
 */
export function parseJsonOrRefuse(text, label) {
  if (typeof text !== "string") {
    return refuse("JSON_UNREADABLE", `${label} could not be read.`);
  }
  try {
    return accept({ value: JSON.parse(text) });
  } catch (e) {
    return refuse("JSON_INVALID", `${label} is not valid JSON: ${e.message}`);
  }
}

/**
 * The commit must exist ON THE SERVER.
 *
 * `remoteSha` must come from `git ls-remote`, never from the local
 * `origin/<branch>` ref: that ref is a cached snapshot and can be
 * arbitrarily old, so comparing against it proves the commit was pushed at
 * some point in the past, not that it is there now.
 */
export function checkCommitPushed({ localSha, remoteSha, branch, source }) {
  if (!localSha) return refuse("SHA_UNKNOWN", "Could not resolve HEAD.");
  if (source !== "ls-remote") {
    return refuse(
      "REMOTE_NOT_QUERIED",
      "The remote SHA was not obtained from the server. A cached ref cannot " +
        "prove the commit is pushed."
    );
  }
  if (!remoteSha) {
    return refuse(
      "REMOTE_MISSING",
      `Branch '${branch}' does not exist on the remote. Push it first: a ` +
        `deployment must be reconstructible without this machine.`
    );
  }
  if (localSha !== remoteSha) {
    return refuse(
      "COMMIT_NOT_PUSHED",
      `HEAD (${localSha.slice(0, 8)}) differs from the server's ` +
        `${branch} (${remoteSha.slice(0, 8)}). Push before deploying.`
    );
  }
  return accept({ sha: localSha, branch });
}

/**
 * Firebase archives `functions/` from disk using `functions.ignore`
 * (defaulting to node_modules and .git) and never reads `.gitignore`. That
 * is why untracking `functions/lib` is safe — and what would silently break
 * if a pattern excluding the compiled output were added, since `main` points
 * at `lib/index.js` and the upload would carry no code.
 */
/**
 * Reproduces Firebase's basename glob match for one pattern (minimatch
 * matchBase over the bounded allowlist), so the gate can assert that no
 * configured pattern would drop the compiled output.
 */
function ignoreMatchesBasename(glob, basename) {
  const rx =
    "^" +
    String(glob)
      .split("")
      .map((ch) =>
        ch === "*" ? "[^/]*" : ch === "?" ? "[^/]" : /[.+^${}()|[\]\\]/.test(ch) ? "\\" + ch : ch
      )
      .join("") +
    "$";
  return new RegExp(rx).test(basename);
}

export function checkFunctionsIgnore(firebaseConfig) {
  const ignore = firebaseConfig?.functions?.ignore;
  // An explicit list is now MANDATORY: the default (node_modules, .git only)
  // does not exclude emulator debug logs, so a Rules-then-hash preflight
  // captured a non-deterministic firestore-debug.log and the hash stopped
  // being reproducible. The configuration must state the exclusion.
  if (ignore === undefined) {
    return refuse(
      "FUNCTIONS_IGNORE_MISSING",
      `firebase.json functions.ignore is absent. It must be explicit and include ` +
        `${REQUIRED_FUNCTIONS_IGNORE.join(", ")} — the default list omits *-debug.log, ` +
        `which makes the artefact hash non-reproducible.`
    );
  }
  if (!Array.isArray(ignore)) {
    return refuse("FUNCTIONS_IGNORE_INVALID", "firebase.json functions.ignore must be an array.");
  }
  const patterns = ignore.map((p) => String(p));

  const dupes = patterns.filter((p, i) => patterns.indexOf(p) !== i);
  if (dupes.length) {
    return refuse(
      "FUNCTIONS_IGNORE_DUPLICATE",
      `functions.ignore contains duplicate pattern(s): ${[...new Set(dupes)].join(", ")}.`
    );
  }

  const absent = REQUIRED_FUNCTIONS_IGNORE.filter((m) => !patterns.includes(m));
  if (absent.length) {
    return refuse(
      "FUNCTIONS_IGNORE_INCOMPLETE",
      `A custom functions.ignore replaces the default list, so it must still ` +
        `exclude ${absent.join(" and ")}. Missing node_modules/.git ships the git ` +
        `history; missing *-debug.log makes the artefact hash non-reproducible.`
    );
  }

  const unvetted = patterns.filter((p) => !ALLOWED_FUNCTIONS_IGNORE.includes(p));
  if (unvetted.length) {
    return refuse(
      "FUNCTIONS_IGNORE_UNRECOGNISED",
      `functions.ignore contains pattern(s) this gate cannot prove safe: ` +
        `${unvetted.join(", ")}.\n` +
        `Firebase matches these as globs, so a broad pattern excludes ` +
        `lib/index.js without mentioning it. Allowed: ` +
        `${ALLOWED_FUNCTIONS_IGNORE.join(", ")}.`
    );
  }

  // Defence in depth: even an allowlisted pattern must not, in fact, match the
  // compiled output that `main` points at.
  const excludesLib = patterns.filter(
    (p) => ignoreMatchesBasename(p, "lib") || ignoreMatchesBasename(p, "index.js")
  );
  if (excludesLib.length) {
    return refuse(
      "FUNCTIONS_IGNORE_EXCLUDES_LIB",
      `functions.ignore pattern(s) ${excludesLib.join(", ")} would exclude the ` +
        `compiled output (lib/), leaving the upload with no code.`
    );
  }
  return accept({ ignore });
}

/** `predeploy` must be exactly the build-then-verify pair, in that order. */
export function checkPredeployHook(firebaseConfig) {
  const hooks = firebaseConfig?.functions?.predeploy;
  if (!Array.isArray(hooks) || hooks.length === 0) {
    return refuse(
      "PREDEPLOY_MISSING",
      "firebase.json functions.predeploy must build and verify before packaging."
    );
  }
  const normalised = hooks.map((h) => String(h).trim().replace(/\s+/g, " "));
  const expected = [...REQUIRED_PREDEPLOY];
  const same =
    normalised.length === expected.length && normalised.every((h, i) => h === expected[i]);
  if (!same) {
    return refuse(
      "PREDEPLOY_MISMATCH",
      `functions.predeploy must be exactly, in order:\n` +
        expected.map((e) => "    " + e).join("\n") +
        `\n  found:\n` +
        normalised.map((e) => "    " + e).join("\n")
    );
  }
  return accept({ hooks: normalised });
}

/**
 * A local manifest is a CACHE, never a proof.
 *
 * `.deploy/` is gitignored and machine-local: an `expand` run in CI leaves
 * nothing another workstation can read, and a file on disk can simply be
 * written by hand. Authorising `contract` on that basis would let
 * restrictive rules ship on the strength of a text file.
 *
 * This check therefore only ever REFUSES. Until an authoritative remote
 * record exists (a staging document, a CI artefact, a release), `contract`
 * stays closed.
 */
/**
 * Turns the lock-release verdict into the run's conclusion.
 *
 * A refused release must never be swallowed. Between acquisition and release
 * the lock file can be replaced by a manual recovery or corrupted; in both
 * cases `releaseOwnLock` correctly declines to delete a file it no longer
 * owns — and a run that then printed "preflight passed" would tell the
 * operator the opposite of what happened: the gates passed, but a lock is
 * still sitting there that will block the next run.
 */
export function concludeRelease(release) {
  if (release?.ok) return accept({ released: release.released === true });
  return refuse(
    release?.code ?? "RELEASE_FAILED",
    `Every gate passed, but the deployment lock could not be released.\n` +
      `${release?.message ?? "No verdict was returned."}\n\n` +
      `This run is NOT reported as successful. The lock is still in place and ` +
      `will block the next run until someone establishes who owns it and ` +
      `clears it with \`--release-lock --confirm-uuid=…\`.`
  );
}

/**
 * Merges a failed release into an existing refusal WITHOUT displacing it.
 *
 * The original refusal is why the run stopped and is what the operator needs
 * to act on; the release failure is a second, separate fact. Overwriting the
 * first with the second would hide the actual cause behind its consequence.
 */
export function combineFailureWithRelease(original, release) {
  if (!release || release.ok) return original;
  return {
    ok: false,
    code: original.code, // the original cause keeps the verdict's identity
    message:
      `${original.message}\n\n` +
      `Additionally, the deployment lock could not be released ` +
      `(${release.code ?? "RELEASE_FAILED"}): ${release.message ?? ""}\n` +
      `It has been left in place rather than force-removed.`,
  };
}

export function checkContractPrerequisite({ phase }) {
  if (phase !== "contract") return accept();
  return refuse(
    "CONTRACT_NEEDS_REMOTE_PROOF",
    "The 'contract' phase tightens rules and removes old paths. Authorising " +
      "it requires proof that a matching 'expand' really shipped and was " +
      "verified — and the local .deploy/ manifest cannot provide that: it is " +
      "machine-local, gitignored, and writable by hand.\n" +
      "Choose an authoritative store (staging document, CI artefact, release) " +
      "before this phase is enabled."
  );
}

/**
 * The refusal returned for a phase that performs mutations and is not wired.
 *
 * A pure function rather than an inline string because this exact wording has
 * already been "corrected" twice without the change reaching the file: a
 * silent no-op in an editing step left the message recommending the very
 * bypass it must forbid. Visual review missed it both times. Extracted so a
 * test can assert what it must NOT say.
 */
export function phaseNotImplementedVerdict(phase) {
  return refuse(
    "PHASE_NOT_IMPLEMENTED",
    `Phase '${phase}' performs mutations and is intentionally not wired yet.\n` +
      `Every gate above passed, so the commit is admissible — but mutations ` +
      `stay CLOSED until this entry point has been reviewed.\n\n` +
      `Do not route around this gate. Bypassing it is what put restrictive ` +
      `rules live while the callable replacing the forbidden write had not ` +
      `shipped. An exceptional deployment requires the manual procedure, run ` +
      `by someone who has audited it, and recorded afterwards.`
  );
}

/**
 * Concurrency is fail-closed: the presence of a lock refuses, full stop.
 *
 * This is the EARLY check, so a contended run fails before doing any work.
 * It is not the mutual-exclusion mechanism — that is `acquireLock`'s
 * exclusive create in deployLock.mjs, which is what actually settles a race.
 *
 * No automatic staleness window. A legitimate deployment can exceed any
 * threshold we would pick, and letting a second run proceed on a timer is
 * how two deployments interleave Functions and Rules. A crashed run is
 * cleared deliberately, by an operator who has seen who owned it.
 */
export function checkNoConcurrentRun(lock, nowMs) {
  if (lock === null || lock === undefined) return accept();
  const malformed =
    typeof lock !== "object" ||
    !lock.pid ||
    !lock.phase ||
    !Number.isFinite(Number(lock.startedAtMs));
  if (malformed) {
    return refuse(
      "LOCK_MALFORMED",
      "A deployment lock exists but cannot be read. Refusing rather than " +
        "assuming it is abandoned. Inspect and clear it with " +
        "`npm run deploy:staging -- --release-lock`."
    );
  }
  const ageS = Math.round((nowMs - Number(lock.startedAtMs)) / 1000);
  return refuse(
    "DEPLOY_IN_PROGRESS",
    `A deployment is in progress: phase '${lock.phase}', pid ${lock.pid}, ` +
      `owner ${lock.owner ?? "unknown"}, started ${ageS}s ago.\n` +
      `If that run is dead, release it explicitly with ` +
      `\`npm run deploy:staging -- --release-lock\`.`
  );
}

/**
 * A phase may only run when the tools it actually uses are present.
 *
 * `preflight` needs `firebase` and `java` because the Firestore Rules suite
 * runs inside its pipeline and boots the emulator. It does NOT need Flutter:
 * nothing in preflight builds Hosting, so requiring — or even probing — it
 * would fail machines that can legitimately run this phase.
 */
/**
 * Tools each phase needs BEFORE any installation has run.
 *
 * Firebase is deliberately absent: it lives in `functions/node_modules` and
 * therefore does not exist until `npm ci` has run. Demanding it at bootstrap
 * would reject a perfectly good checkout for the sole crime of not having
 * installed yet. It is checked at its own moment — see
 * `checkFirebaseRuntime` — once the install gate has passed.
 */
export const PHASE_REQUIRED_TOOLS = Object.freeze({
  preflight: ["node", "npm", "java"],
  expand: ["node", "npm", "flutter"],
  contract: ["node", "npm"],
  verify: ["node", "npm"],
});

/**
 * Phases whose Firebase CLI must come from the repository's own lockfile,
 * verified AFTER installation.
 *
 * `REQ-C-FB-01` — SATISFIED. `preflight` was exempt only while the pipeline
 * ran neither `npm ci` nor the Rules suite. It now installs `tools/deploy` and
 * drives the Firestore emulator through this very CLI, so an absent CLI is no
 * longer a harmless gap: it would mean the Rules gate never ran, while the
 * phase still reported success.
 */
export const PHASE_REQUIRED_FIREBASE = Object.freeze([
  "preflight",
  "expand",
  "contract",
  "verify",
]);

/**
 * The CLI on disk must be the version the lockfile pins.
 *
 * Resolution proves a CLI exists in the right place; it does not prove it is
 * the reviewed one. `node_modules` can be edited, partially installed, or left
 * over from a previous branch — and a Rules suite passing under a different
 * Firebase version proves nothing about the version that will deploy.
 */
export function checkFirebaseCliVersion({ declaredVersion, lockedVersion, installedVersion }) {
  // 1. The declaration must be an exact version, not a range: a caret would
  //    let two machines resolve different CLIs from the same commit.
  if (!declaredVersion || !/^\d+\.\d+\.\d+$/.test(String(declaredVersion))) {
    return refuse(
      "FIREBASE_CLI_UNPINNED",
      `tools/deploy/package.json declares firebase-tools as ` +
        `${JSON.stringify(declaredVersion ?? null)}; an exact version is required.`
    );
  }
  // 2. The lockfile is what `npm ci` actually installs. A package.json that
  //    disagrees with it means the two commands would produce different trees.
  if (!lockedVersion) {
    return refuse(
      "FIREBASE_CLI_LOCK_UNREADABLE",
      "tools/deploy/package-lock.json records no firebase-tools entry, so " +
        "nothing pins what `npm ci` would install."
    );
  }
  if (lockedVersion !== declaredVersion) {
    return refuse(
      "FIREBASE_CLI_LOCK_MISMATCH",
      `tools/deploy/package.json pins ${declaredVersion} but its lockfile ` +
        `records ${lockedVersion}. Regenerate the lockfile: \`npm ci\` installs ` +
        `the lockfile's version, so the declaration would be a comment.`
    );
  }
  // 3. What is on disk is what will actually run. `npm ci` normally refuses an
  //    inconsistency, but a gate must prove what it announces rather than
  //    trust another tool to have been run.
  if (!installedVersion) {
    return refuse(
      "FIREBASE_CLI_UNREADABLE",
      "The installed firebase-tools declares no version, so it cannot be " +
        "matched against the lockfile."
    );
  }
  if (installedVersion !== lockedVersion) {
    return refuse(
      "FIREBASE_CLI_VERSION_MISMATCH",
      `The installed Firebase CLI is ${installedVersion} but tools/deploy pins ` +
        `${lockedVersion}. Refusing rather than vouching for a run made with a ` +
        `CLI nobody reviewed. Reinstall with \`npm ci --prefix tools/deploy\`.`
    );
  }
  return accept({ version: installedVersion });
}

/**
 * REQ-B-EXEC-02 — the Firebase CLI a phase will use must be the locked, local
 * one. A globally installed CLI is invisible to the lockfile, so two machines
 * could deploy the same commit through different Firebase versions and
 * neither could tell.
 */
export function checkFirebaseRuntime(phase, resolution) {
  if (!PHASE_REQUIRED_FIREBASE.includes(phase)) return accept({ required: false });
  if (!resolution?.ok) {
    return refuse(
      resolution?.code ?? "FIREBASE_CLI_NOT_LOCAL",
      `Phase '${phase}' deploys through the Firebase CLI, which must come from ` +
        `tools/deploy's locked dependencies.\n${resolution?.message ?? ""}`.trim()
    );
  }
  return accept({ required: true, version: resolution.version ?? null });
}

export function checkRequiredTools(phase, available) {
  const required = PHASE_REQUIRED_TOOLS[phase] ?? [];
  const missing = required.filter((t) => !available?.[t]);
  if (missing.length) {
    return refuse(
      "TOOL_MISSING",
      `Phase '${phase}' requires ${missing.join(", ")}, which ${
        missing.length > 1 ? "are" : "is"
      } not available. Recording "not found" in a manifest is not enough — ` +
        `the phase cannot do its job.`
    );
  }
  return accept({ required });
}

/**
 * Reduces a `--version` banner to a bare semver.
 *
 * Version output is arbitrary text from a subprocess; storing it verbatim
 * would let anything travel into the manifest. Only a recognisable version
 * number survives; anything else becomes null.
 */
export function normaliseToolVersion(raw, tool) {
  if (typeof raw !== "string") return null;
  const SEMVER = /\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.\-]+)?/;

  // Flutter announces itself; take the version it names, not the first
  // number in a banner that also mentions Dart and a framework revision.
  if (tool === "flutter") {
    const m = raw.match(new RegExp(String.raw`Flutter\s+(${SEMVER.source})`));
    return m ? m[1] : null;
  }

  // npm and firebase print their version on a line of its own. Taking the
  // first semver anywhere would read "Update available 13.0.0 -> 15.18.0"
  // as 13.0.0 and record a version that is not the one installed.
  for (const line of raw.split("\n").map((l) => l.trim())) {
    const m = line.match(new RegExp(`^v?(${SEMVER.source})$`));
    if (m) return m[1];
  }
  return null;
}

/**
 * Builds the manifest. Fields are fixed here and `toolVersions` is
 * normalised to bare semvers, so a caller cannot smuggle arbitrary text —
 * and therefore a secret — into a written file.
 *
 * `authoritative: false` is recorded in the document itself: this is a local
 * cache, and nothing downstream may treat it as evidence.
 */
/**
 * The final anti-drift check: nothing about the repository moved between the
 * initial validation and the end of the run.
 *
 * The initial gates prove the commit was clean and pushed when preflight
 * STARTED. Everything since — installs, a build, four test suites, the Rules
 * emulator — could have raced a concurrent commit, a branch switch, a stray
 * editor save, or a force-push on the server. Re-checking closes that window.
 *
 * Fail-closed throughout: a null field means a git command failed or its
 * output was unreadable, and an unverifiable state must refuse, never pass.
 * The remote SHA must come from a FRESH `git ls-remote`, never the cached
 * `origin/<branch>` ref, for the same reason the initial check did.
 */
export function checkNoGitDrift({
  initialSha,
  initialBranch,
  initialRemoteSha,
  finalStatus,
  finalSha,
  finalBranch,
  finalRemoteSha,
  finalRemoteSource,
}) {
  // Any unreadable final observation is a refusal, not a pass.
  if (finalStatus === null || finalStatus === undefined) {
    return refuse("GIT_DRIFT_UNREADABLE", "The final `git status` could not be read; refusing fail-closed.");
  }
  if (!finalSha) {
    return refuse("GIT_DRIFT_UNREADABLE", "The final HEAD could not be resolved; refusing fail-closed.");
  }
  if (!finalBranch) {
    return refuse("GIT_DRIFT_UNREADABLE", "The final branch could not be resolved; refusing fail-closed.");
  }

  const dirty = String(finalStatus)
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  if (dirty.length) {
    return refuse(
      "GIT_DRIFT_WORKTREE",
      `The worktree changed during preflight — ${dirty.length} entr(y/ies) that ` +
        `were not there at the start:\n` +
        dirty.map((l) => "    " + l).join("\n") +
        `\nA long-running gate wrote into the tree; the tested state no longer matches disk.`
    );
  }
  if (finalBranch === "HEAD") {
    return refuse(
      "GIT_DRIFT_DETACHED",
      "HEAD became detached during preflight; the deployed commit can no longer be named by a branch."
    );
  }
  if (finalBranch !== initialBranch) {
    return refuse(
      "GIT_DRIFT_BRANCH",
      `The branch changed during preflight: started on '${initialBranch}', now on '${finalBranch}'.`
    );
  }
  if (finalSha !== initialSha) {
    return refuse(
      "GIT_DRIFT_HEAD",
      `HEAD moved during preflight: ${String(initialSha).slice(0, 8)} → ` +
        `${String(finalSha).slice(0, 8)}. A commit landed while the gates ran, ` +
        `so what was tested is not what HEAD now points at.`
    );
  }
  // The remote must be re-queried from the server. A cached ref would let a
  // force-push during the run go unnoticed.
  if (finalRemoteSource !== "ls-remote") {
    return refuse(
      "GIT_DRIFT_REMOTE_NOT_QUERIED",
      "The final remote SHA was not re-queried from the server; a cached ref cannot detect a force-push."
    );
  }
  if (!finalRemoteSha) {
    return refuse(
      "GIT_DRIFT_REMOTE_MISSING",
      "The branch no longer resolves on the remote; it was moved or deleted during preflight."
    );
  }
  if (finalRemoteSha !== initialRemoteSha) {
    return refuse(
      "GIT_DRIFT_REMOTE_MOVED",
      `The remote ref moved during preflight: ${String(initialRemoteSha).slice(0, 8)} → ` +
        `${String(finalRemoteSha).slice(0, 8)}. Someone pushed over the branch; the ` +
        `commit this run validated is no longer what the server holds.`
    );
  }
  return accept({ sha: finalSha, branch: finalBranch });
}

export function buildManifest({
  phase,
  gitSha,
  branch,
  functionsArtifactHash = null,
  hostingArtifactHash = null,
  functionsVerified = false,
  hostingVerified = false,
  toolVersions = {},
  timestamp,
}) {
  const versions = {};
  for (const tool of ["node", "npm", "firebase", "flutter"]) {
    versions[tool] = normaliseToolVersion(toolVersions?.[tool], tool);
  }
  return {
    project: ALLOWED_PROJECT,
    authoritative: false,
    phase,
    gitSha,
    branch,
    functionsArtifactHash,
    hostingArtifactHash,
    functionsVerified,
    hostingVerified,
    toolVersions: versions,
    timestamp,
  };
}

/** Anything resembling a credential must never reach a log or a manifest. */
export function redactSecrets(text) {
  if (typeof text !== "string") return text;
  return text
    .replace(/AIza[0-9A-Za-z_\-]{20,}/g, "[REDACTED_API_KEY]")
    .replace(/\b\d{10,}:[A-Za-z0-9_\-]{20,}\b/g, "[REDACTED_APP_ID]")
    .replace(/(--dart-define=[A-Z_]*(?:KEY|SECRET|TOKEN|ID)=)\S+/g, "$1[REDACTED]")
    .replace(/("?(?:apiKey|appId|messagingSenderId)"?\s*[:=]\s*)"[^"]+"/gi, '$1"[REDACTED]"');
}
