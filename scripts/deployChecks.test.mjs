/**
 * Tests for the deployment gate's decision layer.
 *
 * Weighted deliberately towards refusals: a gate is worth exactly what it
 * declines. Each case names the incident or the failure mode it prevents, so
 * a future reader can tell whether a rule is still earning its place.
 *
 * Pure functions only — no project, no credentials, no git, no network.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ALLOWED_PROJECT,
  PHASES,
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
  PHASE_REQUIRED_FIREBASE,
  concludeRelease,
  combineFailureWithRelease,
  PHASE_REQUIRED_TOOLS,
  checkHeadAttached,
  checkOriginConfigured,
  checkFunctionsSource,
  checkFunctionsMain,
  parseJsonOrRefuse,
  phaseNotImplementedVerdict,
  normaliseToolVersion,
  buildManifest,
  redactSecrets,
  ALLOWED_FUNCTIONS_IGNORE,
  REQUIRED_PREDEPLOY,
} from "./deployChecks.mjs";

describe("phase", () => {
  test("accepts each declared phase", () => {
    for (const p of PHASES) assert.equal(checkPhase(p).ok, true);
  });
  test("refuses an absent phase rather than defaulting to one", () => {
    assert.equal(checkPhase(undefined).code, "PHASE_MISSING");
  });
  test("refuses an unknown phase", () => {
    assert.equal(checkPhase("deploy-everything").code, "PHASE_UNKNOWN");
  });
});

describe("project", () => {
  test("accepts staging", () => {
    assert.equal(checkProject(ALLOWED_PROJECT).ok, true);
  });
  test("refuses production explicitly", () => {
    // The repository already contains a script hardcoded to the production
    // project. This entry point must never become a second one.
    const r = checkProject("mediexchange");
    assert.equal(r.code, "PROJECT_FORBIDDEN");
    assert.match(r.message, /mediexchange-staging/);
  });
  test("refuses a missing project rather than guessing", () => {
    assert.equal(checkProject(undefined).code, "PROJECT_MISSING");
  });
});

describe("worktree cleanliness", () => {
  test("an empty status passes", () => {
    assert.equal(checkWorktreeClean("").ok, true);
    assert.equal(checkWorktreeClean("\n  \n").ok, true);
  });

  test("a modified tracked file blocks", () => {
    const r = checkWorktreeClean(" M CLAUDE.md\n");
    assert.equal(r.code, "WORKTREE_DIRTY");
    assert.match(r.message, /CLAUDE\.md/);
  });

  test("an untracked file blocks too", () => {
    // `--untracked-files=all` is what makes a stray script block the deploy;
    // otherwise an unreviewed file could ship inside the functions package.
    assert.equal(checkWorktreeClean("?? scripts/tmp.mjs\n").code, "WORKTREE_DIRTY");
  });

  test("a staged change blocks", () => {
    assert.equal(checkWorktreeClean("M  functions/src/index.ts\n").code, "WORKTREE_DIRTY");
  });

  test("the refusal lists every offending path", () => {
    const r = checkWorktreeClean(" M a.ts\n?? b.mjs\nD  c.js\n");
    for (const f of ["a.ts", "b.mjs", "c.js"]) assert.match(r.message, new RegExp(f));
  });
});

describe("commit is pushed — proven against the server, not a cached ref", () => {
  const sha = "17197d9ed7c928b62cdd49687c0baf8915de8c99";
  const base = { localSha: sha, branch: "main", source: "ls-remote" };

  test("accepts a HEAD that matches the server", () => {
    assert.equal(checkCommitPushed({ ...base, remoteSha: sha }).ok, true);
  });

  test("refuses a SHA that did not come from ls-remote", () => {
    // The local origin/<branch> ref is a snapshot and can be arbitrarily
    // stale; comparing against it proves the commit was pushed at some point,
    // not that the server has it now.
    const r = checkCommitPushed({ ...base, remoteSha: sha, source: "local-ref" });
    assert.equal(r.code, "REMOTE_NOT_QUERIED");
  });

  test("refuses when the source is unspecified", () => {
    assert.equal(
      checkCommitPushed({ localSha: sha, remoteSha: sha, branch: "main" }).code,
      "REMOTE_NOT_QUERIED"
    );
  });

  test("refuses when the branch does not exist on the remote", () => {
    assert.equal(
      checkCommitPushed({ ...base, remoteSha: null, branch: "chore/x" }).code,
      "REMOTE_MISSING"
    );
  });

  test("refuses when local is ahead of the server", () => {
    assert.equal(
      checkCommitPushed({ ...base, remoteSha: "a".repeat(40) }).code,
      "COMMIT_NOT_PUSHED"
    );
  });
});

describe("functions.ignore — explicit, and *-debug.log mandatory", () => {
  // The minimal valid list. `*-debug.log` is now required so the emulator logs
  // a Rules-then-hash preflight produces cannot enter the artefact hash.
  const REQUIRED = ["node_modules", ".git", "*-debug.log"];

  test("the required minimal list is accepted", () => {
    assert.equal(checkFunctionsIgnore({ functions: { ignore: [...REQUIRED] } }).ok, true);
  });

  test("an absent ignore is now REFUSED, not treated as a safe default", () => {
    // The regression that broke reproducibility: the default list omits
    // *-debug.log, so firestore-debug.log entered the hash.
    const r = checkFunctionsIgnore({ functions: { source: "functions" } });
    assert.equal(r.ok, false);
    assert.equal(r.code, "FUNCTIONS_IGNORE_MISSING");
    assert.match(r.message, /\*-debug\.log/);
  });

  test("omitting *-debug.log is refused as incomplete", () => {
    const r = checkFunctionsIgnore({ functions: { ignore: ["node_modules", ".git"] } });
    assert.equal(r.code, "FUNCTIONS_IGNORE_INCOMPLETE");
    assert.match(r.message, /\*-debug\.log/);
  });

  test("omitting node_modules or .git is still refused", () => {
    assert.equal(
      checkFunctionsIgnore({ functions: { ignore: [".git", "*-debug.log"] } }).code,
      "FUNCTIONS_IGNORE_INCOMPLETE"
    );
    assert.equal(
      checkFunctionsIgnore({ functions: { ignore: ["node_modules", "*-debug.log"] } }).code,
      "FUNCTIONS_IGNORE_INCOMPLETE"
    );
  });

  test("a duplicate pattern is refused", () => {
    assert.equal(
      checkFunctionsIgnore({ functions: { ignore: [...REQUIRED, "node_modules"] } }).code,
      "FUNCTIONS_IGNORE_DUPLICATE"
    );
  });

  test("an unaudited extra pattern is refused, even if harmless-looking", () => {
    for (const p of ["dist", "*.map", "coverage", "src/**"]) {
      assert.equal(
        checkFunctionsIgnore({ functions: { ignore: [...REQUIRED, p] } }).code,
        "FUNCTIONS_IGNORE_UNRECOGNISED",
        `pattern ${p}`
      );
    }
  });

  test("a pattern that would exclude lib/ is refused by the dedicated check", () => {
    // If a lib-excluding glob were ever added to the allowlist by mistake, this
    // second check still catches it: it matches the actual basenames.
    const r = checkFunctionsIgnore({
      functions: { ignore: [...REQUIRED, "lib"] },
    });
    // 'lib' is unvetted, so UNRECOGNISED fires first — but a lib-matching glob
    // that WAS allowlisted would hit FUNCTIONS_IGNORE_EXCLUDES_LIB. Prove the
    // dedicated matcher directly.
    assert.ok(["FUNCTIONS_IGNORE_UNRECOGNISED", "FUNCTIONS_IGNORE_EXCLUDES_LIB"].includes(r.code));
  });

  test("a file that merely resembles the log pattern is NOT what *-debug.log excludes", () => {
    // `*-debug.log` excludes `firestore-debug.log` but not `debugger.ts` or
    // `lib` — sanity that the required pattern is narrow. (Verified via the
    // artefact hasher tests; here we only confirm the list is accepted.)
    assert.equal(checkFunctionsIgnore({ functions: { ignore: [...REQUIRED] } }).ok, true);
  });

  test("a non-array ignore is refused rather than coerced", () => {
    assert.equal(
      checkFunctionsIgnore({ functions: { ignore: "lib" } }).code,
      "FUNCTIONS_IGNORE_INVALID"
    );
  });

  test("the real firebase.json satisfies the invariant", () => {
    const cfg = JSON.parse(
      fs.readFileSync(new URL("../firebase.json", import.meta.url), "utf8")
    );
    assert.equal(checkFunctionsIgnore(cfg).ok, true, "the repo's firebase.json is non-conformant");
    assert.ok(cfg.functions.ignore.includes("*-debug.log"));
  });
});

describe("predeploy hook — exact commands, exact order", () => {
  const good = { functions: { predeploy: [...REQUIRED_PREDEPLOY] } };

  test("the exact pair passes", () => {
    assert.equal(checkPredeployHook(good).ok, true);
  });

  test("extra whitespace is tolerated, meaning is not", () => {
    assert.equal(
      checkPredeployHook({
        functions: { predeploy: ["  npm  --prefix functions   run build ", REQUIRED_PREDEPLOY[1]] },
      }).ok,
      true
    );
  });

  test("no predeploy at all is refused", () => {
    // The state the repository was in when a stale artefact shipped.
    assert.equal(checkPredeployHook({ functions: {} }).code, "PREDEPLOY_MISSING");
  });

  test("a command that merely CONTAINS 'run build' is refused", () => {
    // Substring matching would accept this while it builds another package.
    assert.equal(
      checkPredeployHook({
        functions: { predeploy: ["npm run build --workspace=other", REQUIRED_PREDEPLOY[1]] },
      }).code,
      "PREDEPLOY_MISMATCH"
    );
  });

  test("verifying before building is refused", () => {
    // It would inspect the PREVIOUS artefact and pass while shipping the new
    // one unchecked.
    assert.equal(
      checkPredeployHook({ functions: { predeploy: [...REQUIRED_PREDEPLOY].reverse() } }).code,
      "PREDEPLOY_MISMATCH"
    );
  });

  test("an extra command is refused", () => {
    assert.equal(
      checkPredeployHook({ functions: { predeploy: [...REQUIRED_PREDEPLOY, "rm -rf /"] } })
        .code,
      "PREDEPLOY_MISMATCH"
    );
  });

  test("a missing command is refused", () => {
    assert.equal(
      checkPredeployHook({ functions: { predeploy: [REQUIRED_PREDEPLOY[0]] } }).code,
      "PREDEPLOY_MISMATCH"
    );
  });
});

describe("contract — a local manifest is never proof", () => {
  test("non-contract phases are unaffected", () => {
    assert.equal(checkContractPrerequisite({ phase: "expand" }).ok, true);
    assert.equal(checkContractPrerequisite({ phase: "preflight" }).ok, true);
  });

  test("contract is refused even with a perfect local manifest", () => {
    // .deploy/ is machine-local, gitignored and writable by hand. An expand
    // run in CI leaves nothing another workstation can read, and a forged
    // file would authorise restrictive rules. The phase stays closed until
    // an authoritative remote record exists.
    const r = checkContractPrerequisite({
      phase: "contract",
      sha: "abc123",
      manifests: [
        { phase: "expand", gitSha: "abc123", functionsVerified: true, hostingVerified: true },
      ],
    });
    assert.equal(r.code, "CONTRACT_NEEDS_REMOTE_PROOF");
    assert.match(r.message, /writable by hand/);
  });
});

describe("concurrency — fail-closed, no automatic staleness", () => {
  const now = 1_000_000_000;

  test("no lock passes", () => {
    assert.equal(checkNoConcurrentRun(null, now).ok, true);
    assert.equal(checkNoConcurrentRun(undefined, now).ok, true);
  });

  test("a fresh lock blocks and names its owner", () => {
    const r = checkNoConcurrentRun(
      { phase: "expand", pid: 42, owner: "ci-runner-3", startedAtMs: now - 5000 },
      now
    );
    assert.equal(r.code, "DEPLOY_IN_PROGRESS");
    assert.match(r.message, /ci-runner-3/);
    assert.match(r.message, /release-lock/);
  });

  test("an OLD lock still blocks — a real deploy can outlast any timer", () => {
    // The previous version ignored locks after 30 minutes, which would let a
    // second run interleave Functions and Rules with a deployment still
    // running.
    const r = checkNoConcurrentRun(
      { phase: "expand", pid: 42, startedAtMs: now - 6 * 60 * 60 * 1000 },
      now
    );
    assert.equal(r.code, "DEPLOY_IN_PROGRESS");
  });

  test("a malformed lock is refused, not treated as abandoned", () => {
    for (const bad of [{}, { pid: 1 }, { phase: "expand" }, "garbage", 42,
                       { phase: "expand", pid: 1, startedAtMs: "soon" }]) {
      assert.equal(checkNoConcurrentRun(bad, now).code, "LOCK_MALFORMED",
        `lock ${JSON.stringify(bad)}`);
    }
  });
});

describe("required tools", () => {
  test("preflight needs node, npm and java before anything is installed", () => {
    // Java is here because the Firestore Rules suite runs inside preflight.
    assert.equal(checkRequiredTools("preflight", { node: "1", npm: "1", java: "1" }).ok, true);
    assert.equal(checkRequiredTools("preflight", {}).code, "TOOL_MISSING");
  });

  test("no phase demands firebase at bootstrap", () => {
    // It lives in functions/node_modules and does not exist until `npm ci`
    // has run. Requiring it here would reject a good checkout for the sole
    // crime of not having installed yet — it is checked at its own moment.
    for (const phase of Object.keys(PHASE_REQUIRED_TOOLS)) {
      assert.equal(
        PHASE_REQUIRED_TOOLS[phase].includes("firebase"),
        false,
        `${phase} demands firebase before installation`
      );
    }
  });

  test("expand needs node, npm and flutter", () => {
    const r = checkRequiredTools("expand", { node: "1", npm: "10.0.0" });
    assert.equal(r.code, "TOOL_MISSING");
    assert.match(r.message, /flutter/);
  });

  test("a missing tool refuses instead of being recorded as 'not found'", () => {
    const r = checkRequiredTools("verify", { node: "1", npm: null });
    assert.equal(r.code, "TOOL_MISSING");
    assert.match(r.message, /not enough/);
  });
});

describe("REQ-B-LOCK-01 — a refused lock release cannot be reported as success", () => {
  test("a successful release concludes the run", () => {
    assert.equal(concludeRelease({ ok: true, released: true }).ok, true);
  });

  test("a refused release refuses the run and keeps the refusal's code", () => {
    // The gates passing does not make the run a success: a lock is still
    // sitting there and will block the next one.
    const r = concludeRelease({ ok: false, code: "RELEASE_NOT_OWNER", message: "held by X" });
    assert.equal(r.ok, false);
    assert.equal(r.code, "RELEASE_NOT_OWNER");
    assert.match(r.message, /NOT reported as successful/);
    assert.match(r.message, /--release-lock --confirm-uuid=/);
  });

  test("a missing verdict is treated as a failure, not as success", () => {
    // `undefined` must never fall through to the success path.
    assert.equal(concludeRelease(undefined).ok, false);
    assert.equal(concludeRelease(null).code, "RELEASE_FAILED");
  });

  test("a failed release never displaces the original refusal", () => {
    // The original cause is what the operator has to act on; the release
    // failure is a second, separate fact.
    const original = { ok: false, code: "COMMAND_FAILED", message: "tests failed" };
    const r = combineFailureWithRelease(original, {
      ok: false,
      code: "RELEASE_LOCK_MALFORMED",
      message: "unreadable",
    });
    assert.equal(r.code, "COMMAND_FAILED"); // identity preserved
    assert.match(r.message, /tests failed/);
    assert.match(r.message, /RELEASE_LOCK_MALFORMED/);
    assert.match(r.message, /left in place/);
  });

  test("a successful release leaves the original refusal untouched", () => {
    const original = { ok: false, code: "COMMAND_FAILED", message: "tests failed" };
    assert.equal(combineFailureWithRelease(original, { ok: true, released: true }), original);
    assert.equal(combineFailureWithRelease(original, undefined), original);
  });
});

describe("REQ-DRIFT — the final Git check catches anything that moved mid-run", () => {
  const stable = {
    initialSha: "17197d9ed7c928b62cdd49687c0baf8915de8c99",
    initialBranch: "chore/deploy-integrity",
    initialRemoteSha: "17197d9ed7c928b62cdd49687c0baf8915de8c99",
    finalStatus: "",
    finalSha: "17197d9ed7c928b62cdd49687c0baf8915de8c99",
    finalBranch: "chore/deploy-integrity",
    finalRemoteSha: "17197d9ed7c928b62cdd49687c0baf8915de8c99",
    finalRemoteSource: "ls-remote",
  };

  test("an unchanged repository passes", () => {
    assert.equal(checkNoGitDrift(stable).ok, true);
  });

  test("a file written into the tree during a gate is caught", () => {
    // A long build or a test writing an unexpected file: the initial clean
    // check passed, but the tree no longer matches what was tested.
    const r = checkNoGitDrift({ ...stable, finalStatus: "?? functions/generated.js\n" });
    assert.equal(r.code, "GIT_DRIFT_WORKTREE");
    assert.match(r.message, /generated\.js/);
  });

  test("a concurrent commit with a clean tree is caught", () => {
    // The worktree is spotless, but HEAD advanced — the dangerous case a
    // status check alone would miss.
    const r = checkNoGitDrift({ ...stable, finalSha: "b".repeat(40) });
    assert.equal(r.code, "GIT_DRIFT_HEAD");
  });

  test("a branch switch is caught", () => {
    assert.equal(checkNoGitDrift({ ...stable, finalBranch: "main" }).code, "GIT_DRIFT_BRANCH");
  });

  test("HEAD becoming detached is caught", () => {
    assert.equal(checkNoGitDrift({ ...stable, finalBranch: "HEAD" }).code, "GIT_DRIFT_DETACHED");
  });

  test("a force-push over the branch during the run is caught", () => {
    // Local HEAD and the tree are untouched, but the server moved. Only a
    // fresh ls-remote sees this.
    const r = checkNoGitDrift({ ...stable, finalRemoteSha: "c".repeat(40) });
    assert.equal(r.code, "GIT_DRIFT_REMOTE_MOVED");
  });

  test("the branch vanishing from the remote is caught", () => {
    assert.equal(checkNoGitDrift({ ...stable, finalRemoteSha: null }).code, "GIT_DRIFT_REMOTE_MISSING");
  });

  test("a remote SHA not re-queried from the server is refused", () => {
    // A cached ref cannot detect a force-push, so accepting one would defeat
    // the check.
    assert.equal(
      checkNoGitDrift({ ...stable, finalRemoteSource: "cached" }).code,
      "GIT_DRIFT_REMOTE_NOT_QUERIED"
    );
  });

  test("an unreadable final observation refuses fail-closed, never passes", () => {
    for (const missing of ["finalStatus", "finalSha", "finalBranch"]) {
      const r = checkNoGitDrift({ ...stable, [missing]: null });
      assert.equal(r.ok, false, `${missing}=null passed`);
      assert.equal(r.code, "GIT_DRIFT_UNREADABLE");
    }
  });
});

describe("REQ-B-EXEC-02 — the Firebase runtime is checked after installation", () => {
  const local = { ok: true, firebaseCli: "/repo/functions/node_modules/firebase-tools/lib/bin/firebase.js", version: "15.24.0" };
  const absent = { ok: false, code: "FIREBASE_CLI_NOT_LOCAL", message: "not installed" };

  test("REQ-C-FB-01 — preflight now REQUIRES the local CLI", () => {
    // This assertion is the tripwire that used to assert the opposite. The
    // exemption held only while preflight ran neither `npm ci` nor the Rules
    // suite. It now drives the Firestore emulator through this CLI, so an
    // absent CLI would mean the Rules gate never ran while the phase still
    // reported success — the exact shape of failure this tooling exists to
    // prevent.
    const r = checkFirebaseRuntime("preflight", absent);
    assert.equal(r.ok, false);
    assert.equal(r.code, "FIREBASE_CLI_NOT_LOCAL");
    assert.equal(checkFirebaseRuntime("preflight", local).ok, true);
  });

  test("no phase is exempt from the local CLI any more", () => {
    for (const phase of PHASES) {
      assert.equal(
        PHASE_REQUIRED_FIREBASE.includes(phase),
        true,
        `${phase} would accept an absent Firebase CLI`
      );
    }
  });

  test("every mutating phase requires the locked local CLI", () => {
    for (const phase of ["expand", "contract", "verify"]) {
      assert.equal(checkFirebaseRuntime(phase, local).ok, true, phase);
      const r = checkFirebaseRuntime(phase, absent);
      assert.equal(r.ok, false, phase);
      assert.equal(r.code, "FIREBASE_CLI_NOT_LOCAL");
      assert.match(r.message, /locked dependencies/);
    }
  });

  test("the refusal names tools/deploy, not functions — the CLI lives there", () => {
    // The CLI resolves from tools/deploy; saying "functions' locked
    // dependencies" pointed the operator at the wrong place to fix it.
    const r = checkFirebaseRuntime("expand", absent);
    assert.match(r.message, /tools\/deploy's locked dependencies/);
    assert.equal(/functions' locked dependencies/.test(r.message), false);
  });

  // Three levels must agree — the manifest DECLARES, the lockfile RECORDS
  // (that is what `npm ci` installs), and node_modules holds what will
  // actually run. Comparing only the first and last would miss a lockfile
  // that disagrees with its own manifest.
  const agreed = { declaredVersion: "15.24.0", lockedVersion: "15.24.0", installedVersion: "15.24.0" };

  test("all three levels agreeing is the only accepted state", () => {
    assert.equal(checkFirebaseCliVersion(agreed).ok, true);
    assert.equal(checkFirebaseCliVersion(agreed).version, "15.24.0");
  });

  test("a range instead of an exact declaration is refused", () => {
    // A caret would let two machines resolve different CLIs from one commit.
    for (const declared of ["^15.24.0", "~15.24.0", "latest", "", undefined, null]) {
      assert.equal(
        checkFirebaseCliVersion({ ...agreed, declaredVersion: declared }).code,
        "FIREBASE_CLI_UNPINNED",
        `accepted declaration ${JSON.stringify(declared)}`
      );
    }
  });

  test("a lockfile that disagrees with its manifest is refused", () => {
    // `npm ci` installs the LOCKFILE's version, so a diverging declaration is
    // merely a comment — and the gate would be vouching for the wrong number.
    const r = checkFirebaseCliVersion({ ...agreed, lockedVersion: "15.20.0" });
    assert.equal(r.code, "FIREBASE_CLI_LOCK_MISMATCH");
    assert.match(r.message, /15\.24\.0/);
    assert.match(r.message, /15\.20\.0/);
  });

  test("a lockfile with no firebase-tools entry is refused", () => {
    assert.equal(
      checkFirebaseCliVersion({ ...agreed, lockedVersion: undefined }).code,
      "FIREBASE_CLI_LOCK_UNREADABLE"
    );
  });

  test("an installation that differs from the lockfile is refused", () => {
    // npm ci normally prevents this, but a gate must prove what it announces
    // rather than trust that another tool was run.
    const r = checkFirebaseCliVersion({ ...agreed, installedVersion: "15.25.1" });
    assert.equal(r.code, "FIREBASE_CLI_VERSION_MISMATCH");
    assert.match(r.message, /15\.25\.1/);
    assert.match(r.message, /npm ci --prefix tools\/deploy/);
  });

  test("an installation declaring no version is refused, never assumed fine", () => {
    assert.equal(
      checkFirebaseCliVersion({ ...agreed, installedVersion: null }).code,
      "FIREBASE_CLI_UNREADABLE"
    );
  });

  test("a phase that requires it refuses when resolution failed for any reason", () => {
    // The refusal must carry the resolver's own code, so an unreadable
    // install is not reported as a missing one.
    const r = checkFirebaseRuntime("contract", { ok: false, code: "FIREBASE_CLI_UNREADABLE", message: "bad" });
    assert.equal(r.code, "FIREBASE_CLI_UNREADABLE");
  });
});

describe("tool version normalisation", () => {
  test("extracts a bare semver from a banner", () => {
    assert.equal(normaliseToolVersion("Flutter 3.24.1 • channel stable", "flutter"), "3.24.1");
    assert.equal(normaliseToolVersion("v22.14.0", "node"), "22.14.0");
    assert.equal(normaliseToolVersion("14.2.0-canary.1", "npm"), "14.2.0-canary.1");
    // The banner case that made the previous parser record the OLD version.
    assert.equal(
      normaliseToolVersion(["Update available 13.0.0 -> 15.18.0", "15.18.0"].join("\n"), "firebase"),
      "15.18.0"
    );
  });

  test("anything unrecognisable becomes null rather than travelling verbatim", () => {
    // Version output is arbitrary subprocess text; storing it raw would let
    // anything — including a leaked key — reach the manifest.
    assert.equal(normaliseToolVersion("AIzaSyDUMMYDUMMYDUMMYDUMMYDUMMYDU", "npm"), null);
    assert.equal(normaliseToolVersion(undefined, "npm"), null);
    assert.equal(normaliseToolVersion({ toString: () => "1.2.3" }, "npm"), null);
  });
});

describe("manifest — a local cache that says so", () => {
  const base = {
    phase: "preflight",
    gitSha: "abc",
    branch: "main",
    timestamp: "2026-07-21T18:00:00.000Z",
  };

  test("records the identity of what was inspected", () => {
    const m = buildManifest(base);
    assert.equal(m.project, "mediexchange-staging");
    assert.equal(m.gitSha, "abc");
    assert.equal(m.functionsVerified, false);
  });

  test("declares itself non-authoritative in the document", () => {
    // So nothing downstream — including a future contract phase — can treat
    // a file on disk as evidence that something shipped.
    assert.equal(buildManifest(base).authoritative, false);
  });

  test("tool versions are normalised, not copied verbatim", () => {
    const m = buildManifest({
      ...base,
      toolVersions: {
        node: "v22.14.0",
        npm: "10.9.2",
        firebase: "Update available 13.0.0 -> 15.18.0",
        flutter: "Flutter 3.24.1 • channel stable",
      },
    });
    assert.equal(m.toolVersions.node, "22.14.0");
    assert.equal(m.toolVersions.flutter, "3.24.1");
  });

  test("an unexpected field cannot reach the file", () => {
    const m = buildManifest({ ...base, apiKey: "AIzaSyDUMMYDUMMYDUMMYDUMMYDUMMYDU" });
    assert.equal(JSON.stringify(m).includes("AIza"), false);
  });

  test("a secret hidden in a version string does not survive", () => {
    // The previous version copied toolVersions straight through, so this
    // string would have landed in the manifest.
    const m = buildManifest({
      ...base,
      toolVersions: { npm: "AIzaSyDUMMYDUMMYDUMMYDUMMYDUMMYDU" },
    });
    assert.equal(m.toolVersions.npm, null);
    assert.equal(JSON.stringify(m).includes("AIza"), false);
  });
});

describe("secret redaction", () => {
  test("redacts an API key anywhere in a line", () => {
    const out = redactSecrets("key=AIzaSyDUMMYDUMMYDUMMYDUMMYDUMMYDUMMY tail");
    assert.equal(out.includes("AIzaSy"), false);
    assert.match(out, /REDACTED_API_KEY/);
  });
  test("redacts dart-define values carrying a key or a token", () => {
    const out = redactSecrets("--dart-define=STAGING_API_KEY=supersecretvalue");
    assert.equal(out.includes("supersecretvalue"), false);
  });
  test("leaves ordinary output untouched", () => {
    const line = "Deploy complete! 50 functions in europe-west1";
    assert.equal(redactSecrets(line), line);
  });
});

// ===========================================================================
// Lot A — contract identifiers
//
// Each test names the requirement it discharges (REQ-A-nn), so the matrix
// "requirement → code → test" can be rebuilt from the suite alone rather
// than from a document that drifts.
// ===========================================================================

describe("REQ-A-01 — a detached HEAD is refused by name", () => {
  test("an attached branch passes", () => {
    assert.equal(checkHeadAttached("chore/deploy-integrity").ok, true);
  });
  test("HEAD detached is refused explicitly", () => {
    // Otherwise it surfaces later as a confusing "branch HEAD does not exist
    // on the remote", which points the operator at the wrong problem.
    assert.equal(checkHeadAttached("HEAD").code, "HEAD_DETACHED");
  });
  test("an unresolvable branch is refused", () => {
    assert.equal(checkHeadAttached("").code, "HEAD_UNRESOLVED");
    assert.equal(checkHeadAttached(null).code, "HEAD_UNRESOLVED");
  });
});

describe("REQ-A-02 — origin must exist", () => {
  test("origin among the remotes passes", () => {
    assert.equal(checkOriginConfigured("origin\nupstream\n").ok, true);
  });
  test("no remote at all is refused", () => {
    assert.equal(checkOriginConfigured("").code, "ORIGIN_MISSING");
    assert.equal(checkOriginConfigured(null).code, "ORIGIN_MISSING");
  });
  test("a differently named remote is refused, and the message lists what exists", () => {
    const r = checkOriginConfigured("github\n");
    assert.equal(r.code, "ORIGIN_MISSING");
    assert.match(r.message, /github/);
  });
});

describe("REQ-A-03 — functions.source is the directory this gate vouches for", () => {
  test("'functions' passes", () => {
    assert.equal(checkFunctionsSource({ functions: { source: "functions" } }).ok, true);
  });
  test("any other source is refused", () => {
    // Every other check — predeploy, ignore, artefact — is written against
    // functions/. Vouching for a different directory would be a lie.
    for (const s of ["backend", "./functions", undefined, ""]) {
      assert.equal(
        checkFunctionsSource({ functions: { source: s } }).code,
        "FUNCTIONS_SOURCE_UNEXPECTED",
        `source ${JSON.stringify(s)}`
      );
    }
  });
});

describe("REQ-A-04 — package main must be the verified entry point", () => {
  test("lib/index.js passes", () => {
    assert.equal(checkFunctionsMain({ main: "lib/index.js" }).ok, true);
  });
  test("any other main is refused", () => {
    // The artefact barrier verifies lib/index.js. If `main` points elsewhere,
    // the upload can be perfectly built and still expose nothing.
    for (const m of ["index.js", "lib/main.js", "./lib/index.js", undefined]) {
      assert.equal(
        checkFunctionsMain({ main: m }).code,
        "FUNCTIONS_MAIN_UNEXPECTED",
        `main ${JSON.stringify(m)}`
      );
    }
  });
});

describe("REQ-A-05 — JSON failures are refusals, not exceptions", () => {
  test("valid JSON yields its value", () => {
    const r = parseJsonOrRefuse('{"a":1}', "test.json");
    assert.equal(r.ok, true);
    assert.deepEqual(r.value, { a: 1 });
  });
  test("malformed JSON is a structured refusal naming the file", () => {
    // A raw SyntaxError would skip the refusal format entirely — no code, no
    // guidance, and an exit path that never releases the lock.
    const r = parseJsonOrRefuse("{ nope", "firebase.json");
    assert.equal(r.code, "JSON_INVALID");
    assert.match(r.message, /firebase\.json/);
  });
  test("an unreadable file is a refusal, not a crash", () => {
    assert.equal(parseJsonOrRefuse(null, "functions/package.json").code, "JSON_UNREADABLE");
  });
});

describe("REQ-A-06 — required tools are per phase", () => {
  test("preflight requires java", () => {
    // The Firestore Rules suite runs inside preflight and boots the emulator.
    const r = checkRequiredTools("preflight", { node: "1", npm: "10.0.0" });
    assert.equal(r.code, "TOOL_MISSING");
    assert.match(r.message, /java/);
  });
  test("preflight does NOT require flutter", () => {
    // Nothing in preflight builds Hosting; requiring it would fail machines
    // that can legitimately run this phase.
    assert.equal(checkRequiredTools("preflight", { node: "1", npm: "1", java: "1" }).ok, true);
  });
  test("expand still requires flutter", () => {
    assert.match(checkRequiredTools("expand", { node: "1", npm: "1" }).message, /flutter/);
  });
});

describe("REQ-A-07 — a closed phase must never advertise a bypass", () => {
  const verdict = phaseNotImplementedVerdict("expand");

  test("carries the stable refusal code", () => {
    assert.equal(verdict.code, "PHASE_NOT_IMPLEMENTED");
    assert.equal(verdict.ok, false);
  });

  test("states that the phase is closed", () => {
    assert.match(verdict.message, /CLOSED/);
    assert.match(verdict.message, /not wired yet/);
  });

  test("names no tool the operator could reach for instead", () => {
    // The whole point. Two earlier attempts to remove this recommendation
    // never reached the file, and a visual review passed both times.
    for (const forbidden of [/firebase deploy/i, /Firebase CLI/i, /gcloud/i]) {
      assert.equal(forbidden.test(verdict.message), false, `mentions ${forbidden}`);
    }
  });

  test("suggests no workaround phrasing", () => {
    for (const forbidden of [/meanwhile/i, /instead/i, /in the meantime/i,
                             /you can still/i, /workaround/i]) {
      assert.equal(forbidden.test(verdict.message), false, `suggests ${forbidden}`);
    }
  });

  test("points at the audited manual procedure", () => {
    assert.match(verdict.message, /manual procedure/);
    assert.match(verdict.message, /audited/);
  });

  test("names the phase it refused", () => {
    assert.match(phaseNotImplementedVerdict("contract").message, /'contract'/);
  });
});
