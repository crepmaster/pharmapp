/**
 * Lot B — integration tests for the executor and the lock.
 *
 * Unlike the pure suite, these touch the filesystem and spawn processes. They
 * work exclusively in a temp directory: a test that could delete the real
 * `.deploy/lock.json` would be capable of unblocking a live deployment.
 *
 * The concurrency case spawns actual processes. Two functions calling
 * `acquireLock` in sequence inside one process would prove nothing about a
 * race — the whole question is what the OS does when two writers arrive at
 * the same instant.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  boundOutput,
  runCommand,
  runNpm,
  runFirebase,
  probeTool,
  runPipeline,
  resolveNpmRuntime,
  resolveFirebaseCli,
  MAX_OUTPUT_BYTES,
} from "./deployRunner.mjs";
import {
  acquireLock,
  readLock,
  releaseOwnLock,
  releaseLockManually,
} from "./deployLock.mjs";
import { concludeRelease } from "./deployChecks.mjs";
import { isolatedEnv } from "../tools/deploy/bin/firebase-emulators.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// A child process must import by file:// URL: on Windows, `import "C:/…"`
// is not a valid specifier and Node refuses it.
const LOCK_MODULE_URL = pathToFileURL(path.join(HERE, "deployLock.mjs")).href;
let dir;
let lockPath;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-runner-"));
  lockPath = path.join(dir, "lock.json");
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

const REPO = path.resolve(HERE, "..");

/**
 * Strips comments before scanning source, so that DOCUMENTING the Windows
 * shim problem does not look like committing it. A test that cannot tell
 * prose from code would force the explanation out of the file.
 */
function code(file) {
  return fs
    .readFileSync(path.join(HERE, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const DEPLOY_SOURCES = [
  "deployRunner.mjs",
  "deployChecks.mjs",
  "deployLock.mjs",
  "deploy-staging.mjs",
  "../tools/deploy/bin/firebase-emulators.mjs",
];

describe("REQ-B-EXEC-01 — CLIs run under Node, never through a Windows shim", () => {
  test("no source path enables a shell", async () => {
    // Node has refused to spawn .cmd/.bat without a shell since the
    // CVE-2024-27980 fix, so "resolve npm.cmd" and "never use shell: true"
    // cannot both hold. The way out is to launch neither.
    for (const f of DEPLOY_SOURCES) {
      assert.equal(/shell\s*:\s*true/.test(code(f)), false, `${f} enables a shell`);
      assert.equal(/\bcmd\.exe\b/.test(code(f)), false, `${f} invokes cmd.exe`);
    }
  });

  test("every executable actually spawned is Node itself or a native binary", async () => {
    // Grepping for the string ".cmd" would flag the refusal MESSAGE that
    // explains why shims are rejected — punishing the explanation rather
    // than the defect. What matters is the first argument of each spawn.
    const SPAWNERS = /(?<!function\s)\b(?:runCommand|runNpm|runFirebase|probeTool|spawn|spawnSync|sync|execFile|execFileSync|exec|execSync)\s*\(\s*([^,)\n]+)/g;
    // Node itself, plus native executables that need no shim on any platform.
    const ALLOWED = new Set([
      "process.execPath",
      "cmd", // the parameter runCommand/probeTool forward to spawn
      '"taskkill"',
      '"git"',
      '"java"',
      "npmCli",
      "firebaseCli",
    ]);
    const offenders = [];
    for (const f of DEPLOY_SOURCES) {
      for (const m of code(f).matchAll(SPAWNERS)) {
        const first = m[1].trim();
        if (!ALLOWED.has(first)) offenders.push(`${f}: ${first}`);
      }
    }
    assert.deepEqual(offenders, [], `spawns something other than Node or a native binary`);
  });

  test("args must be an array — a joined string is a programming error", async () => {
    // Accepting a string is how argument injection starts.
    assert.throws(() => runCommand("node", "-e 1"), TypeError);
  });

  test("a missing npm_execpath is refused, not guessed around", async () => {
    // Its absence means the script was not launched through `npm run`, so the
    // expected bootstrap was bypassed.
    const r = resolveNpmRuntime({}, () => true);
    assert.equal(r.ok, false);
    assert.equal(r.code, "NPM_RUNTIME_UNRESOLVED");
    assert.match(r.message, /npm run deploy:staging/);
  });

  test("a relative npm_execpath is refused", async () => {
    // Resolving it against an ambient cwd would run whatever happens to sit
    // at that path in the directory we were called from.
    const r = resolveNpmRuntime({ npm_execpath: "node_modules/npm/bin/npm-cli.js" }, () => true);
    assert.equal(r.code, "NPM_RUNTIME_UNRESOLVED");
    assert.match(r.message, /absolute/);
  });

  test("an npm_execpath that does not exist is refused", async () => {
    const r = resolveNpmRuntime({ npm_execpath: path.join(dir, "nope.js") }, fs.existsSync);
    assert.equal(r.code, "NPM_RUNTIME_UNRESOLVED");
    assert.match(r.message, /does not exist/);
  });

  test("an npm_execpath pointing at a shim is refused", async () => {
    // This is the exact value that cannot be executed without a shell.
    const r = resolveNpmRuntime({ npm_execpath: "C:\\Program Files\\nodejs\\npm.cmd" }, () => true);
    assert.equal(r.code, "NPM_RUNTIME_UNRESOLVED");
    assert.match(r.message, /not a JavaScript entry point/);
  });

  test("the REAL npm runs under Node on this platform", async () => {
    // The point of the whole arbitration. This suite runs through
    // `npm run test:deploy`, so npm_execpath must be present — if it is not,
    // that is a finding, not a reason to skip.
    const resolved = resolveNpmRuntime();
    assert.equal(
      resolved.ok,
      true,
      "npm_execpath is absent, so this case cannot run. Invoke the suite as " +
        "`npm run test:deploy` — the same way the preflight gate invokes it. " +
        "Skipping instead would report green for a case that never executed."
    );
    const r = await runNpm(resolved.npmCli, ["--version"], { cwd: REPO, timeoutMs: 120_000 });
    assert.equal(r.ok, true, r.message);
    assert.match(r.stdout, /^\d+\.\d+\.\d+/);
  });
});

describe("REQ-B-EXEC-02 — the Firebase CLI comes from the lockfile", () => {
  // Isolation itself (why tools/deploy and not functions) is proven in
  // deployIsolation.test.mjs; here we only care that resolution works.
  const TOOLS = path.join(REPO, "tools", "deploy");

  test("it resolves inside the tooling package's installed dependencies", async () => {
    const r = resolveFirebaseCli(TOOLS);
    assert.equal(r.ok, true, r.message);
    assert.ok(
      r.firebaseCli.includes(path.join("tools", "deploy", "node_modules", "firebase-tools")),
      `resolved outside the tooling package: ${r.firebaseCli}`
    );
  });

  test("an absent local install is refused rather than falling back to a global CLI", async () => {
    const r = resolveFirebaseCli(dir); // empty temp dir, no node_modules
    assert.equal(r.ok, false);
    assert.equal(r.code, "FIREBASE_CLI_NOT_LOCAL");
    assert.match(r.message, /lockfile/);
  });

  test("the local CLI runs under Node with the PATH emptied", async () => {
    // Proves no global `firebase` is involved: with an empty PATH a shim
    // lookup could not possibly succeed.
    const { firebaseCli } = resolveFirebaseCli(TOOLS);
    // Isolated exactly as production isolates it: without this the CLI reads
    // the operator's ~/.config/configstore and the suite's result depends on
    // whose machine it runs on.
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "cli-config-"));
    try {
      const r = await runFirebase(firebaseCli, ["--version"], {
        cwd: REPO,
        timeoutMs: 180_000,
        env: { ...isolatedEnv(process.env, sandbox), PATH: "", Path: "" },
      });
      assert.equal(r.ok, true, r.message);
      assert.match(r.stdout, /\d+\.\d+\.\d+/);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test("the running CLI is the version the lockfile pins", async () => {
    const locked = JSON.parse(
      fs.readFileSync(path.join(TOOLS, "package-lock.json"), "utf8")
    ).packages["node_modules/firebase-tools"];
    const declared = JSON.parse(
      fs.readFileSync(path.join(TOOLS, "package.json"), "utf8")
    ).devDependencies["firebase-tools"];
    // An exact pin, not a range: a caret would let two machines deploy the
    // same commit through different CLI versions.
    assert.match(declared, /^\d+\.\d+\.\d+$/);
    assert.equal(locked.version, declared);
    assert.equal(locked.dev, true);
    assert.equal(resolveFirebaseCli(TOOLS).version, declared);
  });
});

describe("REQ-B-EXEC-04 — arguments reach the process literally", () => {
  const echoArgs = ["-e", "process.stdout.write(JSON.stringify(process.argv.slice(1)))"];

  test("spaces and shell metacharacters survive untouched", async () => {
    const hostile = [
      "a b c",
      "x & echo INJECTED",
      "$(echo INJECTED)",
      "`echo INJECTED`",
      '"; echo INJECTED; #',
      "%PATH%",
      "|| echo INJECTED",
    ];
    const r = await runCommand(process.execPath, [...echoArgs, ...hostile]);
    assert.equal(r.ok, true, r.message);
    assert.deepEqual(JSON.parse(r.stdout), hostile);
  });

  test("no secondary command can be injected through an argument", async () => {
    // If any of these had been interpreted, "INJECTED" would appear as
    // command OUTPUT rather than as a literal argument value.
    const r = await runCommand(process.execPath, [
      "-e",
      "process.stdout.write('ARGC=' + (process.argv.length - 1))",
      "& echo INJECTED",
      "; echo INJECTED",
    ]);
    assert.equal(r.ok, true, r.message);
    assert.equal(r.stdout, "ARGC=2");
  });
});

describe("REQ-B-02 — a command that fails returns a verdict, never throws", () => {
  test("a non-zero exit is reported with its output", async () => {
    const r = await runCommand(process.execPath, [
      "-e",
      "process.stderr.write('boom'); process.exit(3)",
    ]);
    assert.equal(r.ok, false);
    assert.equal(r.code, "COMMAND_FAILED");
    assert.match(r.message, /boom/);
  });

  test("captured output is redacted before it can be surfaced", async () => {
    const r = await runCommand(process.execPath, [
      "-e",
      "process.stderr.write('key=AIzaSyDUMMYDUMMYDUMMYDUMMYDUMMYDU'); process.exit(1)",
    ], { redact: (t) => t.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED]") });
    assert.equal(r.message.includes("AIzaSy"), false);
    assert.match(r.message, /REDACTED/);
  });

  test("output is bounded so a runaway log cannot flood the terminal", async () => {
    const huge = "x".repeat(MAX_OUTPUT_BYTES * 3);
    const bounded = boundOutput(huge);
    assert.ok(bounded.length < huge.length);
    assert.match(bounded, /bytes omitted/);
  });
});

/** Synchronous sleep: these assertions are about wall-clock survival. */
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

describe("REQ-B-03 — every command is time-bounded", () => {
  test("a timeout kills a DETACHED descendant, not just the direct child", async () => {
    // Measured on Windows: an ATTACHED child dies with its parent through
    // libuv's job object, but a DETACHED one survives. That second case is
    // how a Firestore emulator kept holding port 8080 after the run that
    // started it had gone, so it is the case worth testing — an attached
    // grandchild would pass even with the tree kill removed.
    //
    // Reaching it requires killing while the parent is still alive: once it
    // is dead the tree is no longer enumerable. Hence the async runner.
    const marker = path.join(dir, "grandchild-alive.log");
    const grandchild =
      `setInterval(() => require('fs').appendFileSync(${JSON.stringify(marker)}, 'x'), 50);` +
      // Safety net so a failing assertion cannot leak a process indefinitely.
      `setTimeout(() => process.exit(0), 20000);`;
    const parent = path.join(dir, "parent.mjs");
    fs.writeFileSync(
      parent,
      [
        `import { spawn } from "node:child_process";`,
        `const c = spawn(process.execPath, ["-e", ${JSON.stringify(grandchild)}], {`,
        `  stdio: "ignore", detached: true,`, // escapes libuv's job object
        `});`,
        `c.unref();`,
        `setTimeout(() => {}, 60000);`, // parent hangs, like a stuck emulator run
      ].join("\n")
    );

    const r = await runCommand(process.execPath, [parent], { timeoutMs: 2500 });
    assert.equal(r.code, "COMMAND_TIMEOUT");
    assert.match(r.message, /process tree was killed/);

    sleep(400); // give any survivor time to keep writing
    const afterKill = fs.statSync(marker).size;
    assert.ok(afterKill > 0, "the grandchild never wrote; the test proves nothing");
    sleep(900);
    assert.equal(
      fs.statSync(marker).size,
      afterKill,
      "the detached grandchild outlived the timeout — the tree was not terminated"
    );
  });

  test("a hanging command is killed and named as a timeout", async () => {
    // A gate that can hang forever is a gate nobody waits for.
    const r = await runCommand(process.execPath, ["-e", "setTimeout(()=>{}, 60000)"], {
      timeoutMs: 300,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "COMMAND_TIMEOUT");
    assert.equal(r.timedOut, true);
    assert.match(r.message, /exceeded 300 ms/);
  });
});

describe("REQ-B-04 — probing reads stderr as well as stdout", () => {
  test("a tool that reports its version on stderr is detected", async () => {
    // `java -version` does exactly this; the previous probe read stdout only
    // and concluded Java was absent on a machine that has it.
    const said = probeTool(process.execPath, [
      "-e",
      "process.stderr.write('openjdk version \"21.0.1\"'); process.exit(1)",
    ]);
    assert.ok(said && said.includes("21.0.1"), `probe returned ${said}`);
  });

  test("REQ-B-EXEC-03 — the real Java is detected from its stderr banner", async () => {
    // Java is a native executable, so it needs no shim and no shell. It backs
    // the Rules emulator that preflight runs; a probe reading stdout only
    // reported it as missing on a machine where the emulator works.
    const said = probeTool("java", ["-version"]);
    assert.ok(said, "java was not detected; preflight would refuse to run here");
    assert.match(said, /version/i);
  });

  test("a genuinely missing binary returns null", async () => {
    assert.equal(probeTool("definitely-not-a-real-binary-xyz", ["--version"]), null);
  });
});

describe("REQ-B-05 — a pipeline stops at the first failure", () => {
  test("later steps do not run once one fails", async () => {
    const ran = [];
    const step = (label, ok) => ({
      label,
      run: () => {
        ran.push(label);
        return ok ? { ok: true } : { ok: false, code: "X", message: "no" };
      },
    });
    const r = await runPipeline([step("a", true), step("b", false), step("c", true)]);
    assert.equal(r.ok, false);
    assert.deepEqual(ran, ["a", "b"]); // "c" never ran
    assert.equal(r.failure.label, "b");
  });

  test("a successful pipeline records every gate by name", async () => {
    const r = await runPipeline([
      { label: "one", run: () => ({ ok: true }) },
      { label: "two", run: () => ({ ok: true }) },
    ]);
    assert.equal(r.ok, true);
    assert.deepEqual(r.results.map((x) => x.label), ["one", "two"]);
  });
});

// ---------------------------------------------------------------------------

const lockArgs = (over = {}) => ({
  phase: "preflight",
  pid: process.pid,
  hostname: os.hostname(),
  gitSha: "17197d9ed7c928b62cdd49687c0baf8915de8c99",
  nowMs: Date.now(),
  ...over,
});

describe("REQ-B-06 — the lock carries an identity", () => {
  test("acquisition records uuid, phase, pid, host, sha and timestamp", async () => {
    const r = acquireLock(lockPath, lockArgs());
    assert.equal(r.ok, true);
    const written = readLock(lockPath);
    for (const f of ["uuid", "phase", "pid", "hostname", "gitSha", "startedAtMs"]) {
      assert.ok(written[f], `missing ${f}`);
    }
    assert.equal(written.uuid, r.uuid);
  });

  test("an incomplete lock reads as malformed, not as usable", async () => {
    // Half a lock tells us nothing about who holds it, so it cannot be
    // treated as safe to remove.
    fs.writeFileSync(lockPath, JSON.stringify({ phase: "preflight", pid: 1 }));
    assert.equal(readLock(lockPath).malformed, true);
  });

  test("an unparseable lock reads as malformed", async () => {
    fs.writeFileSync(lockPath, "not json at all");
    assert.equal(readLock(lockPath).malformed, true);
  });
});

describe("REQ-B-07 — a real race produces exactly one winner", () => {
  test("eight processes contend, one acquires", async () => {
    // Sequential calls inside one process would prove nothing: the question
    // is what the OS does when writers arrive at the same instant. `wx` is
    // what settles it.
    const child = path.join(dir, "contend.mjs");
    fs.writeFileSync(
      child,
      [
        `import { acquireLock } from ${JSON.stringify(LOCK_MODULE_URL)};`,
        `const r = acquireLock(process.argv[2], {`,
        `  phase: "preflight", pid: process.pid, hostname: "h",`,
        `  gitSha: "deadbeef", nowMs: Date.now(),`,
        `});`,
        `process.stdout.write(r.ok ? "WON" : "LOST:" + r.code);`,
      ].join("\n")
    );

    const outcomes = Array.from({ length: 8 }, () =>
      execFileSync(process.execPath, [child, lockPath], { encoding: "utf8" })
    );

    const winners = outcomes.filter((o) => o === "WON");
    const losers = outcomes.filter((o) => o.startsWith("LOST:DEPLOY_IN_PROGRESS"));
    assert.equal(winners.length, 1, `outcomes: ${outcomes.join(", ")}`);
    assert.equal(losers.length, 7);
  });

  test("the loser is told who holds the lock", async () => {
    acquireLock(lockPath, lockArgs({ phase: "expand" }));
    const second = acquireLock(lockPath, lockArgs());
    assert.equal(second.code, "DEPLOY_IN_PROGRESS");
    assert.match(second.message, /expand/);
    assert.match(second.message, /uuid/);
  });

  test("a second acquisition never overwrites the first", async () => {
    const first = acquireLock(lockPath, lockArgs());
    acquireLock(lockPath, lockArgs());
    assert.equal(readLock(lockPath).uuid, first.uuid);
  });
});

describe("REQ-B-08 — only the owning run releases its own lock", () => {
  test("the owner releases successfully", async () => {
    const { uuid } = acquireLock(lockPath, lockArgs());
    assert.equal(releaseOwnLock(lockPath, uuid).released, true);
    assert.equal(fs.existsSync(lockPath), false);
  });

  test("a run that does not own the lock leaves it alone", async () => {
    // Between acquisition and release the file may have been replaced by a
    // manual recovery; deleting it then would strip another run's protection.
    acquireLock(lockPath, lockArgs());
    const r = releaseOwnLock(lockPath, "some-other-uuid");
    assert.equal(r.code, "RELEASE_NOT_OWNER");
    assert.equal(fs.existsSync(lockPath), true);
  });

  test("releasing an absent lock is a no-op, not an error", async () => {
    assert.equal(releaseOwnLock(lockPath, "x").ok, true);
  });
});

describe("REQ-B-09 — manual recovery requires naming the exact UUID", () => {
  test("without confirmation it refuses and shows the holder", async () => {
    const { uuid } = acquireLock(lockPath, lockArgs());
    const r = releaseLockManually(lockPath);
    assert.equal(r.code, "RELEASE_NEEDS_CONFIRMATION");
    assert.match(r.message, new RegExp(uuid));
    assert.equal(fs.existsSync(lockPath), true);
  });

  test("a wrong UUID refuses", async () => {
    acquireLock(lockPath, lockArgs());
    const r = releaseLockManually(lockPath, { confirmUuid: "00000000-0000-0000-0000-000000000000" });
    assert.equal(r.code, "RELEASE_UUID_MISMATCH");
    assert.equal(fs.existsSync(lockPath), true);
  });

  test("the exact UUID releases", async () => {
    const { uuid } = acquireLock(lockPath, lockArgs());
    assert.equal(releaseLockManually(lockPath, { confirmUuid: uuid }).released, true);
    assert.equal(fs.existsSync(lockPath), false);
  });

  test("a malformed lock needs an explicit acknowledgement of that fact", async () => {
    fs.writeFileSync(lockPath, "garbage");
    assert.equal(releaseLockManually(lockPath).code, "RELEASE_NEEDS_CONFIRMATION");
    assert.equal(
      releaseLockManually(lockPath, { confirmUuid: "malformed" }).released,
      true
    );
  });
});

describe("REQ-B-LOCK-01 — tampering between acquisition and release is caught", () => {
  test("a lock replaced by another run is not deleted, and the run fails", () => {
    // A manual recovery may have replaced the file while the gates ran.
    // Deleting it then would strip a DIFFERENT run's protection, and
    // announcing success would hide that a lock is still standing.
    const { uuid } = acquireLock(lockPath, lockArgs());
    fs.rmSync(lockPath);
    const other = acquireLock(lockPath, lockArgs({ phase: "expand" }));

    const release = releaseOwnLock(lockPath, uuid);
    assert.equal(release.code, "RELEASE_NOT_OWNER");

    const conclusion = concludeRelease(release);
    assert.equal(conclusion.ok, false, "the run reported success over a failed release");
    assert.match(conclusion.message, /NOT reported as successful/);

    // The other run's lock survived intact.
    assert.equal(fs.existsSync(lockPath), true);
    assert.equal(readLock(lockPath).uuid, other.uuid);
  });

  test("a lock corrupted mid-run is not deleted, and the run fails", () => {
    const { uuid } = acquireLock(lockPath, lockArgs());
    fs.writeFileSync(lockPath, "{ truncated");

    const release = releaseOwnLock(lockPath, uuid);
    assert.equal(release.code, "RELEASE_LOCK_MALFORMED");
    assert.equal(concludeRelease(release).ok, false);
    // Its owner is unknown, so it cannot be declared safe to remove.
    assert.equal(fs.existsSync(lockPath), true);
  });

  test("an untouched lock releases and the run concludes normally", () => {
    // The control case: without it, the two above would pass even if
    // `concludeRelease` refused unconditionally.
    const { uuid } = acquireLock(lockPath, lockArgs());
    const conclusion = concludeRelease(releaseOwnLock(lockPath, uuid));
    assert.equal(conclusion.ok, true);
    assert.equal(fs.existsSync(lockPath), false);
  });
});

describe("REQ-B-10 — a crash leaves the lock behind", () => {
  test("a killed process does not clean up after itself", async () => {
    // Deliberate: an abandoned lock is a question for a human. Clearing it on
    // a timer is how two deployments end up interleaving.
    const child = path.join(dir, "crash.mjs");
    fs.writeFileSync(
      child,
      [
        `import { acquireLock } from ${JSON.stringify(LOCK_MODULE_URL)};`,
        `acquireLock(process.argv[2], { phase: "preflight", pid: process.pid,`,
        `  hostname: "h", gitSha: "deadbeef", nowMs: Date.now() });`,
        `process.kill(process.pid, "SIGKILL");`,
      ].join("\n")
    );
    try {
      execFileSync(process.execPath, [child, lockPath], { stdio: "ignore" });
    } catch {
      // expected: the child kills itself
    }
    assert.equal(fs.existsSync(lockPath), true);
    assert.ok(readLock(lockPath).uuid);
  });
});
