/**
 * deploy-staging — the single supported entry point for deploying staging.
 *
 * Why an entry point and not just the Firebase hook
 * -------------------------------------------------
 * `firebase.json`'s `predeploy` only runs when someone goes through the
 * Firebase CLI's deploy command. A direct `gcloud`, a partial command or a
 * different CI runner bypasses it entirely. The hook is a safety net for one
 * path; this script is the path.
 *
 * Phases, not one button
 * ----------------------
 * Firebase does not switch Functions, Rules and Hosting atomically, so a
 * single "deploy everything" is a lie: on 2026-07-21 the Rules of a change
 * went live while the callable they depended on did not, leaving staging
 * worse than before. Compatibility is a business judgement a script cannot
 * infer, so the operator states it:
 *
 *   preflight  no mutation — builds, verifies and tests locally to prove the
 *              commit is deployable
 *   expand     additive: Functions, verify online, Hosting, smoke test
 *   contract   restrictive: Rules only, once a matching expand is PROVEN
 *   verify     post-deployment checks, no mutation
 *
 * Only `preflight` is implemented. The mutating phases stay closed until this
 * entry point has been reviewed: a half-trusted deployment tool is worse than
 * none, because people believe it.
 *
 * This file is orchestration only. Verdicts live in `deployChecks.mjs`,
 * subprocess handling in `deployRunner.mjs`, mutual exclusion in
 * `deployLock.mjs` — each testable without running a deployment.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_PROJECT,
  checkPhase,
  checkProject,
  checkWorktreeClean,
  checkCommitPushed,
  checkFunctionsIgnore,
  checkPredeployHook,
  checkContractPrerequisite,
  checkNoConcurrentRun,
  checkRequiredTools,
  checkFirebaseRuntime,
  checkFirebaseCliVersion,
  checkNoGitDrift,
  concludeRelease,
  combineFailureWithRelease,
  checkHeadAttached,
  checkOriginConfigured,
  checkFunctionsSource,
  checkFunctionsMain,
  parseJsonOrRefuse,
  phaseNotImplementedVerdict,
  buildManifest,
  redactSecrets,
} from "./deployChecks.mjs";
import {
  acquireLock,
  readLock,
  releaseOwnLock,
  releaseLockManually,
} from "./deployLock.mjs";
import {
  runCommand,
  runNpm,
  probeTool,
  resolveNpmRuntime,
  resolveFirebaseCli,
} from "./deployRunner.mjs";
import { hashFunctionsArtifact, functionsIgnoreGlobs, SYMLINK_CYCLE_CODE } from "./deployArtifact.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_DIR = path.join(ROOT, ".deploy");
const LOCK = path.join(STATE_DIR, "lock.json");

// ---------------------------------------------------------------------------

const say = (line = "") => console.log(redactSecrets(String(line)));

/** UUID of the lock this run owns, if any. Only this run may release it. */
let ownedLockUuid = null;

function die(verdict) {
  let final = verdict;
  // A controlled failure releases the lock it owns; a crash cannot, and that
  // asymmetry is deliberate. If the release itself is refused, the lock stays
  // put and the operator is told — but the ORIGINAL cause keeps top billing,
  // because that is what they have to act on.
  if (ownedLockUuid) {
    const release = releaseOwnLock(LOCK, ownedLockUuid);
    ownedLockUuid = null; // attempted once; never retried, never forced
    final = combineFailureWithRelease(verdict, release);
  }
  console.error("\n❌ REFUSED [" + final.code + "]\n");
  console.error("   " + redactSecrets(final.message).split("\n").join("\n   "));
  console.error("");
  process.exit(1);
}

const must = (verdict) => (verdict.ok ? verdict : die(verdict));

/** Raw read; parsing goes through parseJsonOrRefuse so failures are refusals. */
const readText = (file) => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

/** A git query that must succeed, converted to a refusal when it does not. */
async function git(args, { tolerant = false } = {}) {
  const r = await runCommand("git", args, { cwd: ROOT, timeoutMs: 60_000, redact: redactSecrets });
  if (r.ok) return r.stdout;
  if (tolerant) return null;
  die({ code: "GIT_FAILED", message: r.message });
}

/**
 * Tools available BEFORE anything is installed.
 *
 * npm is not probed by name: on Windows `npm` is a `.cmd` shim that Node
 * refuses to spawn without a shell. What matters is npm's own JavaScript,
 * which npm itself hands us through `npm_execpath` — see `resolveNpmRuntime`.
 *
 * Firebase is deliberately absent here: it lives in `tools/deploy`, isolated
 * from the Functions dependency graph, and does not exist until that package
 * has been installed. It gets its own moment below.
 */
function detectBootstrapTools(npmCli) {
  return {
    node: process.version,
    npm: probeTool(process.execPath, [npmCli, "--version"], { cwd: ROOT, redact: redactSecrets }),
    // Java backs the Firestore Rules emulator, which preflight runs. It
    // prints its version on stderr, which is why probeTool reads both.
    java: probeTool("java", ["-version"], { cwd: ROOT, redact: redactSecrets }),
    // Flutter is deliberately NOT probed: preflight builds no Hosting, so
    // requiring it would fail machines that can legitimately run this phase.
  };
}

// ---- release-lock subcommand ----------------------------------------------

const argv = process.argv.slice(2);

if (argv.includes("--release-lock")) {
  const confirm = argv.find((a) => a.startsWith("--confirm-uuid="));
  const verdict = releaseLockManually(LOCK, {
    confirmUuid: confirm ? confirm.split("=")[1] : undefined,
  });
  if (!verdict.ok) die(verdict);
  say(verdict.released ? "Deployment lock released." : verdict.message);
  process.exit(0);
}

// ---- gates -----------------------------------------------------------------

const phase = argv.find((a) => !a.startsWith("-"));
const project = (argv.find((a) => a.startsWith("--project=")) ?? "").split("=")[1];

must(checkPhase(phase));
must(checkProject(project));

say(`\n▸ deploy-staging — phase '${phase}' on ${ALLOWED_PROJECT}\n`);

must(checkNoConcurrentRun(readLock(LOCK), Date.now()));

// npm's own JavaScript, handed to us by npm. Its absence means this script
// was launched directly rather than through `npm run deploy:staging`, which
// bypasses the bootstrap the rest of this file assumes.
const { npmCli } = must(resolveNpmRuntime());

const tools = detectBootstrapTools(npmCli);
must(checkRequiredTools(phase, tools));
say("  ✓ bootstrap tools present (node, npm runtime, java)");

must(checkWorktreeClean(await git(["status", "--porcelain", "--untracked-files=all"])));
say("  ✓ worktree clean");

const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
must(checkHeadAttached(branch));
must(checkOriginConfigured(await git(["remote"], { tolerant: true })));

// The remote SHA comes from the SERVER, not from the cached origin/<branch>
// ref, which can be arbitrarily stale.
const localSha = await git(["rev-parse", "HEAD"]);
const lsRemote = await git(["ls-remote", "origin", `refs/heads/${branch}`], { tolerant: true });
const remoteSha = lsRemote ? lsRemote.split(/\s+/)[0] : null;
must(checkCommitPushed({ localSha, remoteSha, branch, source: "ls-remote" }));
say(`  ✓ ${branch} @ ${localSha.slice(0, 8)} confirmed on the server`);

const firebaseConfig = must(
  parseJsonOrRefuse(readText(path.join(ROOT, "firebase.json")), "firebase.json")
).value;
must(checkFunctionsSource(firebaseConfig));
must(checkFunctionsIgnore(firebaseConfig));
must(checkPredeployHook(firebaseConfig));
say("  ✓ firebase.json packages and verifies the right artefact");

const functionsPkg = must(
  parseJsonOrRefuse(
    readText(path.join(ROOT, "functions", "package.json")),
    "functions/package.json"
  )
).value;
must(checkFunctionsMain(functionsPkg));
say("  ✓ package main points at the verified entry point");

must(checkContractPrerequisite({ phase }));

// ---- phase bodies ----------------------------------------------------------

if (phase !== "preflight") die(phaseNotImplementedVerdict(phase));

const acquired = must(
  acquireLock(LOCK, {
    phase: "preflight",
    pid: process.pid,
    hostname: os.hostname(),
    gitSha: localSha,
    nowMs: Date.now(),
  })
);
ownedLockUuid = acquired.uuid;

say("\n  local gates (no mutation, nothing leaves this machine)");

/**
 * Runs one npm gate through npm's own JavaScript, reporting a verdict and
 * stopping the pipeline on failure.
 *
 * The scripts these invoke are declared in `package.json`; npm may use a
 * shell to run them, and that is the boundary: those command strings are
 * constant and versioned, with no user data or secret interpolated into
 * them. `test:rules` nests such a command and is audited on that basis.
 */
async function gate(label, npmArgs, timeoutMs) {
  process.stdout.write(`  … ${label}`);
  const r = await runNpm(npmCli, npmArgs, { cwd: ROOT, timeoutMs, redact: redactSecrets });
  process.stdout.write(`\r  ${r.ok ? "✓" : "✗"} ${label}\n`);
  if (!r.ok) die({ code: r.code, message: `${label}: ${r.message}` });
  return r;
}

// Dependencies come from the lockfiles, not from whatever happens to be on
// disk. `npm ci` deletes node_modules and reinstalls exactly what is pinned —
// that is the difference between "the tests passed here" and "the tests
// passed for this commit". The two trees install separately and deliberately:
// the delivery tooling must never share a dependency graph with the code
// being shipped.
await gate("install functions (npm ci)", ["ci", "--prefix", "functions"], 900_000);
await gate("install tooling (npm ci)", ["ci", "--prefix", "tools/deploy"], 900_000);

// Second detection moment: the Firebase CLI only exists once tools/deploy has
// been installed, so it is resolved here rather than at bootstrap. It comes
// from tools/deploy, never from functions — installing it there was measured
// to shift the runtime graph shipped to Cloud Functions.
//
// REQ-C-FB-01: preflight now drives the Firestore emulator through this CLI,
// so its absence is no longer harmless. It would mean the Rules gate never
// ran while the phase still reported success.
const firebase = resolveFirebaseCli(path.join(ROOT, "tools", "deploy"));
must(checkFirebaseRuntime(phase, firebase));
say(`  ✓ Firebase CLI ${firebase.version} resolved from tools/deploy's lockfile`);

// Resolution proves a CLI is present; only this comparison proves it is the
// reviewed one. A Rules suite passing under an unpinned CLI says nothing about
// the version that will eventually deploy.
// Three levels must agree: what the manifest DECLARES, what the lockfile
// RECORDS (that is what `npm ci` installs), and what is INSTALLED on disk.
// Comparing only the first and last would miss a lockfile that disagrees with
// its own manifest.
const toolsPkg = must(
  parseJsonOrRefuse(
    readText(path.join(ROOT, "tools", "deploy", "package.json")),
    "tools/deploy/package.json"
  )
).value;
const toolsLock = must(
  parseJsonOrRefuse(
    readText(path.join(ROOT, "tools", "deploy", "package-lock.json")),
    "tools/deploy/package-lock.json"
  )
).value;
must(
  checkFirebaseCliVersion({
    declaredVersion: toolsPkg?.devDependencies?.["firebase-tools"],
    lockedVersion: toolsLock?.packages?.["node_modules/firebase-tools"]?.version,
    installedVersion: firebase.version,
  })
);
say("  ✓ CLI version agrees across manifest, lockfile and installation");

await gate("functions build", ["--prefix", "functions", "run", "build"], 600_000);
await gate("artefact verification", ["--prefix", "functions", "run", "verify:exports"], 60_000);
await gate("functions test suite", ["--prefix", "functions", "test"], 900_000);
await gate("barrier self-test", ["--prefix", "functions", "run", "test:barrier"], 120_000);
// The gate must also test its own deployment logic before calling a commit
// deployable — otherwise it vouches for everything except itself.
await gate("deploy gate self-test", ["run", "test:deploy"], 300_000);
// Firestore Rules are the half of the security model no backend test covers.
// They run through the closed wrapper, on the CLI just verified above, in a
// configuration sandbox that neither reads nor writes the operator's global
// Firebase state.
await gate("firestore rules suite", ["--prefix", "functions", "run", "test:rules"], 900_000);

// --- artefact identity ------------------------------------------------------
// Computed AFTER the last build and every test, over exactly the file set
// Firebase would package (its own ignore rules, read from source). This is the
// payload the passing tests actually vouch for.
let artefact;
try {
  artefact = hashFunctionsArtifact(
    path.join(ROOT, "functions"),
    functionsIgnoreGlobs(firebaseConfig)
  );
} catch (e) {
  // A symlink cycle is a structured refusal: no partial hash, no manifest, and
  // the lock is released by the normal failure path in die(). Any other error
  // is genuinely unexpected — let it crash so the lock is kept for a human.
  if (e && e.code === SYMLINK_CYCLE_CODE) die({ code: e.code, message: e.message });
  throw e;
}
say(`  ✓ Functions payload hashed — ${artefact.fileCount} files, ${artefact.hash.slice(0, 22)}…`);

// --- final anti-drift check -------------------------------------------------
// Independent of the initial gates and run LAST, after everything that could
// have touched the tree. The remote is re-queried from the server, not read
// from a cached ref, so a force-push during the run is caught.
const finalStatus = await git(["status", "--porcelain", "--untracked-files=all"]);
const finalSha = await git(["rev-parse", "HEAD"]);
const finalBranch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
const finalLsRemote = await git(["ls-remote", "origin", `refs/heads/${branch}`], { tolerant: true });
const finalRemoteSha = finalLsRemote ? finalLsRemote.split(/\s+/)[0] : null;
must(
  checkNoGitDrift({
    initialSha: localSha,
    initialBranch: branch,
    initialRemoteSha: remoteSha,
    finalStatus,
    finalSha,
    finalBranch,
    finalRemoteSha,
    finalRemoteSource: "ls-remote",
  })
);
say("  ✓ no Git drift — tree, HEAD, branch and remote unchanged since the start");

// --- manifest ---------------------------------------------------------------
// Written ONLY now: neither the hash step nor the drift check has died, so the
// payload is identified and the repository has not moved. `functionsVerified`
// is true because build, verify:exports and the test suites all passed above.
// Hosting is out of this lot, stated explicitly rather than left implied.
const manifest = buildManifest({
  phase: "preflight",
  gitSha: finalSha,
  branch,
  functionsArtifactHash: artefact.hash,
  functionsVerified: true,
  hostingArtifactHash: null,
  hostingVerified: false,
  toolVersions: { ...tools, firebase: firebase.ok ? firebase.version : null },
  timestamp: new Date().toISOString(),
});
const out = path.join(STATE_DIR, `manifest-preflight-${localSha.slice(0, 8)}.json`);
fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");

// The release is a gate like any other, and it runs AFTER the hash and the
// drift check — the lock must not be released while those could still refuse.
// If the lock was replaced or corrupted between acquisition and here,
// `releaseOwnLock` declines to delete a file it no longer owns, and announcing
// "preflight passed" over that refusal would tell the operator the opposite.
const release = releaseOwnLock(LOCK, ownedLockUuid);
// Cleared whatever the outcome: the attempt has been made, and `die` must
// neither retry it nor report the same failure twice.
ownedLockUuid = null;
must(concludeRelease(release));

say(`\n✅ preflight passed — ${localSha.slice(0, 8)} is deployable.`);
say(`   Manifest (local cache, NOT proof): ${path.relative(ROOT, out)}`);
say("   No mutation was performed.\n");
process.exit(0);
