/**
 * Tool/runtime isolation and the closed Firebase wrapper.
 *
 * These exist because of a measured incident rather than a principle: adding
 * `firebase-tools` to `functions/devDependencies` re-resolved the runtime
 * graph that ships to Cloud Functions — protobufjs 7.5.4 → 7.6.5 and seven
 * other packages, one removed outright. A delivery tool had silently changed
 * deployed code. Nothing here is theoretical.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { resolveFirebaseCli, runCommand } from "./deployRunner.mjs";
import { buildManifest } from "./deployChecks.mjs";
import {
  planInvocation,
  resolveCli,
  isolatedEnv,
  runIsolatedFirebase,
} from "../tools/deploy/bin/firebase-emulators.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const TOOLS = path.join(REPO, "tools", "deploy");
const WRAPPER = path.join(TOOLS, "bin", "firebase-emulators.mjs");

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

// ---------------------------------------------------------------------------

describe("REQ-DEP-ISO-01 — deployment tooling never touches the Functions graph", () => {
  test("functions declares no firebase-tools, at any depth of its manifest", () => {
    const pkg = readJson(path.join(REPO, "functions", "package.json"));
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      assert.equal(
        Object.hasOwn(pkg[field] ?? {}, "firebase-tools"),
        false,
        `functions/package.json ${field} declares firebase-tools`
      );
    }
  });

  test("firebase-tools is absent from the Functions lockfile entirely", () => {
    // Not just undeclared — absent as a transitive entry too, otherwise the
    // isolation would hold only until something pulled it in indirectly.
    const lock = readJson(path.join(REPO, "functions", "package-lock.json"));
    const hits = Object.keys(lock.packages).filter((k) => k.endsWith("node_modules/firebase-tools"));
    assert.deepEqual(hits, []);
  });

  test("the tooling package pins an exact version in its own lockfile", () => {
    const pkg = readJson(path.join(TOOLS, "package.json"));
    const declared = pkg.devDependencies["firebase-tools"];
    // A range would let two machines resolve different CLIs from one commit.
    assert.match(declared, /^\d+\.\d+\.\d+$/, "the version must be exact, not a range");
    const lock = readJson(path.join(TOOLS, "package-lock.json"));
    assert.equal(lock.packages["node_modules/firebase-tools"].version, declared);
    assert.equal(resolveCli(TOOLS).version, declared);
  });

  test("the runtime graph shipped to Cloud Functions is byte-identical to the base", () => {
    // The regression this whole arrangement exists to prevent. Compared
    // against the committed lockfile, which is the shape that was tested.
    const committed = execFileSync("git", ["show", "HEAD:functions/package-lock.json"], {
      cwd: REPO,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const current = fs.readFileSync(path.join(REPO, "functions", "package-lock.json"), "utf8");
    assert.equal(
      current.replace(/\r\n/g, "\n"),
      committed.replace(/\r\n/g, "\n"),
      "functions/package-lock.json drifted from its committed state"
    );
  });

  test("the CLI resolves under tools/deploy and nowhere else", () => {
    const r = resolveFirebaseCli(TOOLS);
    assert.equal(r.ok, true, r.message);
    assert.ok(r.firebaseCli.includes(path.join("tools", "deploy", "node_modules")), r.firebaseCli);

    // Resolving against functions must now fail, and say why.
    const fromFunctions = resolveFirebaseCli(path.join(REPO, "functions"));
    assert.equal(fromFunctions.ok, false);
    assert.match(fromFunctions.message, /tools\/deploy/);
  });
});

describe("REQ-DEP-ISO-02 — the tooling install is ignored, never tracked", () => {
  test("git ignores it", () => {
    const out = execFileSync(
      "git",
      ["check-ignore", "tools/deploy/node_modules/firebase-tools/package.json"],
      { cwd: REPO, encoding: "utf8" }
    );
    assert.match(out, /tools\/deploy\/node_modules/);
  });

  test("no file below it is tracked", () => {
    const tracked = execFileSync("git", ["ls-files", "tools/deploy/node_modules"], {
      cwd: REPO,
      encoding: "utf8",
    });
    assert.equal(tracked.trim(), "", "the delivery tool's tree must not enter review diffs");
  });
});

// ---------------------------------------------------------------------------

describe("REQ-CLI-LOCAL-01 — the wrapper exposes capabilities, not a passthrough", () => {
  test("both non-mutating modes are accepted, with fixed arguments", () => {
    const serve = planInvocation(["serve-functions"]);
    assert.equal(serve.ok, true);
    assert.deepEqual(serve.args, [
      "emulators:start",
      "--only",
      "functions",
      "--project=demo-pharmapp",
    ]);

    const rules = planInvocation(["test-rules"]);
    assert.equal(rules.ok, true);
    // The Rules gate now runs from an isolated sandbox (so its debug log does
    // not land in functions/), which requires an absolute --config and a
    // cwd-independent nested Jest command.
    assert.equal(rules.args[0], "emulators:exec");
    assert.deepEqual(rules.args.slice(1, 4), ["--only", "firestore"].concat("--project=demo-pharmapp-rules"));
    assert.ok(rules.args.includes("--config"), "no absolute --config passed");
    const config = rules.args[rules.args.indexOf("--config") + 1];
    assert.ok(path.isAbsolute(config) && config.endsWith("firebase.json"), config);
    const nested = rules.args[rules.args.length - 1];
    assert.match(nested, /jest\.rules\.config\.cjs/);
    assert.match(nested, /jest[\\/]bin[\\/]jest\.js/); // absolute jest binary, cwd-independent
    assert.equal(rules.cwdInSandbox, true, "test-rules must run in the sandbox");
    assert.equal(rules.cwd, null, "sandbox cwd is resolved at run time, not at plan time");
  });

  test("deploy and other mutating commands are refused as modes", () => {
    // A generic passthrough would forward these happily, recreating the
    // bypass that was just removed from functions/package.json.
    for (const forbidden of [
      "deploy",
      "functions:delete",
      "emulators:exec",
      "firestore:delete",
      "hosting:channel:deploy",
      "projects:list",
    ]) {
      const r = planInvocation([forbidden]);
      assert.equal(r.ok, false, `'${forbidden}' was accepted`);
      assert.equal(r.code, "MODE_FORBIDDEN");
    }
  });

  test("no extra argument may be smuggled onto an allowed mode", () => {
    for (const extra of [["--project=mediexchange"], ["deploy"], ["--only", "functions"], [";", "deploy"]]) {
      const r = planInvocation(["test-rules", ...extra]);
      assert.equal(r.ok, false, `extra args accepted: ${JSON.stringify(extra)}`);
      assert.equal(r.code, "ARGS_FORBIDDEN");
    }
  });

  test("a missing mode is refused rather than defaulting to anything", () => {
    assert.equal(planInvocation([]).code, "MODE_MISSING");
  });

  test("the refusal is exercised end to end, not just as a return value", async () => {
    const r = await runCommand(process.execPath, [WRAPPER, "deploy"], { cwd: REPO });
    assert.equal(r.ok, false);
    assert.match(r.message, /MODE_FORBIDDEN/);
    assert.match(r.message, /deploy:staging/); // points at the supported path
  });
});

describe("REQ-WRAP-PATH-01 — resolution is anchored to the wrapper, not the cwd", () => {
  test("the same CLI resolves from the repo root, from functions/ and from a temp dir", async () => {
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "wrap-cwd-"));
    try {
      const outputs = [];
      for (const cwd of [REPO, path.join(REPO, "functions"), elsewhere]) {
        // `--version` is not an allowed mode, so the refusal itself proves the
        // wrapper loaded and decided identically regardless of where it ran.
        const r = await runCommand(process.execPath, [WRAPPER, "serve-functions", "x"], { cwd });
        outputs.push(r.message.replace(/^.*firebase-emulators/, ""));
      }
      assert.equal(new Set(outputs).size, 1, `behaviour varied by cwd:\n${outputs.join("\n---\n")}`);
    } finally {
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  test("the locked CLI runs with the PATH emptied, in production isolation", async () => {
    // Two properties at once: nothing depends on a global `firebase` being
    // reachable (PATH is emptied), and the CLI is exercised under the SAME
    // isolation production uses. Without `isolatedEnv` this test read the
    // operator's ~/.config/configstore — which is precisely why the suite
    // passed on one machine and failed on another.
    const { cli } = resolveCli(TOOLS);
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "cli-config-"));
    try {
      const r = await runCommand(process.execPath, [cli, "--version"], {
        cwd: REPO,
        timeoutMs: 180_000,
        env: { ...isolatedEnv(process.env, sandbox), PATH: "", Path: "" },
      });
      assert.equal(r.ok, true, r.message);
      assert.equal(
        r.stdout.trim(),
        readJson(path.join(TOOLS, "package.json")).devDependencies["firebase-tools"]
      );
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------

describe("REQ-C-FB-01 — the preflight installs, verifies and runs Rules, in that order", () => {
  const src = () => fs.readFileSync(path.join(HERE, "deploy-staging.mjs"), "utf8");
  const at = (needle) => {
    const i = src().indexOf(needle);
    assert.notEqual(i, -1, `preflight does not contain: ${needle}`);
    return i;
  };

  test("both dependency trees are installed from their lockfiles", () => {
    // `npm ci` deletes node_modules and reinstalls exactly what is pinned.
    // Without it the phase proves "the tests passed on this machine", not
    // "the tests passed for this commit".
    at('["ci", "--prefix", "functions"]');
    at('["ci", "--prefix", "tools/deploy"]');
  });

  test("the Rules suite is actually invoked, not merely planned", () => {
    at('"--prefix", "functions", "run", "test:rules"');
  });

  test("installation precedes CLI resolution, which precedes every test gate", () => {
    // Resolving before installing would refuse a perfectly good checkout for
    // not having installed yet; testing before resolving would let the Rules
    // gate be skipped silently.
    const install = at('["ci", "--prefix", "tools/deploy"]');
    const resolve = at('resolveFirebaseCli(path.join(ROOT, "tools", "deploy"))');
    const version = at("checkFirebaseCliVersion({");
    const build = at('"run", "build"');
    const rules = at('"run", "test:rules"');
    assert.ok(install < resolve, "CLI resolved before tools were installed");
    assert.ok(resolve < version, "version checked before resolution");
    assert.ok(version < build, "gates run before the CLI was verified");
    assert.ok(build < rules, "Rules run before the build");
  });

  test("the Rules gate runs before the manifest is written and the lock released", () => {
    // A Rules failure must refuse the phase; `gate()` dies on failure, so
    // ordering is what guarantees nothing downstream records success.
    const rules = at('"run", "test:rules"');
    assert.ok(rules < at("buildManifest({"), "manifest written before Rules ran");
    assert.ok(rules < at("concludeRelease(release)"), "lock released before Rules ran");
  });

  test("the canonical end order is hash → drift check → manifest → release", () => {
    // The contract's ordering: nothing writes a success manifest if the hash
    // or the drift check refuses, and the lock is not released before either.
    const rules = at('"run", "test:rules"');
    const hash = at("hashFunctionsArtifact(");
    const drift = at("checkNoGitDrift({");
    const manifest = at("fs.writeFileSync(out");
    // The release call inside die() appears first in source; take the one that
    // follows the manifest, which is the success-path release.
    const successRelease = src().indexOf("releaseOwnLock(LOCK, ownedLockUuid)", manifest);
    assert.ok(rules < hash, "hash computed before Rules ran");
    assert.ok(hash < drift, "drift checked before the hash");
    assert.ok(drift < manifest, "manifest written before the drift check");
    assert.ok(manifest < successRelease, "lock released before the manifest was written");
  });

  test("the final Git check re-queries the server, not a cached ref", () => {
    // A force-push during the run is invisible to origin/<branch>; only a
    // fresh ls-remote sees it.
    const source = src();
    const drift = source.indexOf("checkNoGitDrift({");
    const finalLsRemote = source.indexOf('ls-remote", "origin"', drift - 2000);
    assert.ok(finalLsRemote !== -1 && finalLsRemote < drift, "no fresh ls-remote before the drift check");
    assert.match(source.slice(drift, drift + 400), /finalRemoteSource: "ls-remote"/);
  });

  test("the manifest carries a well-formed Functions hash and no Hosting hash", () => {
    const source = src();
    const call = source.slice(source.indexOf("buildManifest({"), source.indexOf("});", source.indexOf("buildManifest({")));
    assert.match(call, /functionsArtifactHash: artefact\.hash/);
    assert.match(call, /functionsVerified: true/);
    // Hosting is out of scope for this lot and stated, not left implied.
    assert.match(call, /hostingArtifactHash: null/);
    assert.match(call, /hostingVerified: false/);
  });

  test("the lock is acquired before any installation mutates node_modules", () => {
    assert.ok(at("acquireLock(LOCK") < at('["ci", "--prefix", "functions"]'));
  });

  test("the CLI-resolved message names tools/deploy, its actual source", () => {
    // The CLI is resolved from tools/deploy, never from functions; the
    // success line must say so rather than mislead the operator.
    const source = src();
    assert.match(source, /resolved from tools\/deploy's lockfile/);
    assert.equal(/resolved from functions' lockfile/.test(source), false);
  });
});

describe("REQ-MSG — no executable script claims the CLI comes from functions", () => {
  // A guard that DISCOVERS its inputs, not a fixed list — the earlier version
  // named six files and so would have missed a seventh added tomorrow, which
  // is exactly the recurrence this test exists to stop.
  const STALE = [/functions' lockfile/, /functions' locked dependencies/];
  const DIRS = [path.join(REPO, "scripts"), path.join(TOOLS, "bin")];

  /** Every .js/.cjs/.mjs under the given roots, recursively, tests excluded. */
  const executableScripts = () => {
    const found = [];
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) walk(abs);
        else if (/\.(c|m)?js$/.test(e.name) && !/\.test\.(c|m)?js$/.test(e.name)) found.push(abs);
      }
    };
    DIRS.forEach(walk);
    return found;
  };

  /**
   * Scans RAW text, deliberately: the stale wording is forbidden even inside a
   * comment of an executable script, because a comment that still says "from
   * functions' lockfile" misleads the next reader just the same. The ADR keeps
   * the history and is not under these roots, so it is untouched.
   */
  const offendersIn = (files) => {
    const bad = [];
    for (const f of files) {
      const text = fs.readFileSync(f, "utf8");
      for (const rx of STALE) if (rx.test(text)) bad.push(`${path.relative(REPO, f)}: ${rx}`);
    }
    return bad;
  };

  test("discovery finds the real scripts, and none carries the stale phrasing", () => {
    const files = executableScripts();
    // Sanity: discovery actually reached the two files that were corrected,
    // otherwise an empty scan would pass vacuously.
    assert.ok(
      files.some((f) => f.endsWith("deploy-staging.mjs")) &&
        files.some((f) => f.endsWith("firebase-emulators.mjs")),
      "discovery missed known executable scripts"
    );
    assert.deepEqual(offendersIn(files), [], "stale CLI-source phrasing present in an executable script");
  });

  test("a newly added script with the stale phrasing is caught by discovery", () => {
    // The property the fixed list could not have: a file that did not exist
    // when the test was written is still covered.
    const planted = path.join(REPO, "scripts", "_guard_probe_tmp.mjs");
    fs.writeFileSync(planted, "// resolved from functions' lockfile\nexport const x = 1;\n");
    try {
      const offenders = offendersIn(executableScripts());
      assert.ok(
        offenders.some((o) => o.includes("_guard_probe_tmp.mjs")),
        `dynamic discovery did not catch the planted script; offenders: ${JSON.stringify(offenders)}`
      );
    } finally {
      fs.rmSync(planted, { force: true });
    }
  });
});

describe("REQ-HASH — the manifest only records a hash on success", () => {
  test("buildManifest defaults are unverified and hashless", () => {
    // If any gate dies, no manifest is written at all; but the builder's
    // defaults must also never claim verification that did not happen.
    const m = buildManifest({ phase: "preflight", gitSha: "abc", branch: "x", timestamp: "t" });
    assert.equal(m.functionsArtifactHash, null);
    assert.equal(m.functionsVerified, false);
    assert.equal(m.authoritative, false);
  });

  test("a success manifest carries the hash in the declared shape", () => {
    const m = buildManifest({
      phase: "preflight",
      gitSha: "abc",
      branch: "x",
      functionsArtifactHash: "sha256:" + "a".repeat(64),
      functionsVerified: true,
      timestamp: "t",
    });
    assert.match(m.functionsArtifactHash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(m.functionsVerified, true);
    assert.equal(m.hostingArtifactHash, null);
    assert.equal(m.hostingVerified, false);
  });
});

describe("REQ-C-FB-01 — the Firebase run touches no global user state", () => {
  test("the configuration store is redirected away from the user profile", () => {
    // configstore resolves through XDG_CONFIG_HOME (or ~/.config). Left alone,
    // a run depends on whatever the developer happens to be logged into —
    // which is why one machine reported 138/138 and another 135/138.
    const env = isolatedEnv({ PATH: "/usr/bin" }, "/tmp/sandbox-config");
    assert.equal(env.XDG_CONFIG_HOME, "/tmp/sandbox-config");
  });

  test("emulator binaries are cached inside the repository, never in ~/.cache", () => {
    // A ~60 MB binary cache is not configuration. Making it ephemeral would
    // re-download the Firestore emulator on every run and put the gate at the
    // mercy of the network — so it is repo-local and persistent instead.
    const env = isolatedEnv({}, "/tmp/x");
    assert.ok(env.FIREBASE_EMULATORS_PATH.includes(path.join(".deploy", "emulators")));
    // Not "outside the home directory" — this repository lives under it, so
    // that assertion would prove nothing. What matters is that the CLI's
    // user-global default is not the one in effect.
    const userGlobalDefault = path.join(os.homedir(), ".cache", "firebase", "emulators");
    assert.notEqual(env.FIREBASE_EMULATORS_PATH, userGlobalDefault);
    assert.ok(env.FIREBASE_EMULATORS_PATH.startsWith(REPO), "cache escaped the repository");
  });

  test("the rest of the environment is passed through untouched", () => {
    const env = isolatedEnv({ PATH: "/usr/bin", CUSTOM: "kept" }, "/tmp/x");
    assert.equal(env.CUSTOM, "kept");
    assert.equal(env.PATH, "/usr/bin");
  });

});

describe("REQ-CLI-LOCAL-01 — the child inherits no Firebase or Google identity", () => {
  // Passing the whole environment through and overriding two keys was not
  // isolation. A stray `DEBUG` changed the CLI's output and broke a version
  // assertion — the harmless symptom of a path that would equally have
  // carried FIREBASE_TOKEN or a GCLOUD_PROJECT pointing at production.
  const SANDBOX = path.join("/tmp", "sandbox");
  const hostile = {
    PATH: "/usr/bin",
    Path: "/usr/bin",
    SystemRoot: "C:\\Windows",
    TEMP: "/tmp",
    JAVA_HOME: "/opt/java",
    HTTPS_PROXY: "http://proxy:8080",
    CI: "true",
    npm_execpath: "/npm/npm-cli.js",
    ORDINARY: "kept",
    DEBUG: "*",
    FIREBASE_TOKEN: "1//super-secret-refresh-token",
    FIREBASE_CONFIG: '{"projectId":"mediexchange"}',
    FIREBASE_CLI_EXPERIMENTS: "webframeworks",
    FIREBASE_DEPLOY_AGENT: "someone",
    GCLOUD_PROJECT: "mediexchange",
    GOOGLE_CLOUD_PROJECT: "mediexchange",
    GOOGLE_APPLICATION_CREDENTIALS: "/home/operator/adc.json",
    CLOUDSDK_CONFIG: "/home/operator/.config/gcloud",
    FIRESTORE_EMULATOR_HOST: "evil:9999",
    PUBSUB_EMULATOR_HOST: "evil:9998",
    EVENTARC_EMULATOR: "evil:9997",
    XDG_CONFIG_HOME: "/home/operator/.config",
    FIREBASE_EMULATORS_PATH: "/home/operator/.cache/firebase/emulators",
  };
  const env = () => isolatedEnv(hostile, SANDBOX);

  test("1 — ordinary variables and PATH survive", () => {
    // A stricter allowlist would break the nested Jest command, which relies
    // on the PATH npm prepared to find `jest`.
    const e = env();
    for (const k of ["PATH", "Path", "SystemRoot", "TEMP", "JAVA_HOME", "HTTPS_PROXY", "npm_execpath", "ORDINARY"]) {
      assert.equal(e[k], hostile[k], `${k} was dropped`);
    }
  });

  test("2 — CI is neither forced nor removed", () => {
    // Firebase uses it to word its download notice; deciding it here would
    // change behaviour this gate has no business deciding.
    assert.equal(env().CI, "true");
    assert.equal(Object.hasOwn(isolatedEnv({ PATH: "/x" }, SANDBOX), "CI"), false);
  });

  test("3 — every forbidden family is removed", () => {
    const e = env();
    for (const k of [
      "DEBUG",
      "FIREBASE_TOKEN",
      "FIREBASE_CONFIG",
      "FIREBASE_CLI_EXPERIMENTS",
      "FIREBASE_DEPLOY_AGENT",
      "GCLOUD_PROJECT",
      "GOOGLE_CLOUD_PROJECT",
      "FIRESTORE_EMULATOR_HOST",
      "PUBSUB_EMULATOR_HOST",
      "EVENTARC_EMULATOR",
    ]) {
      assert.equal(e[k], undefined, `${k} reached the child`);
    }
  });

  test("4 — alternative Windows casing is removed too", () => {
    // Windows environment lookup is case-insensitive; a plain object is not.
    // Setting the canonical name would otherwise leave the inherited casing
    // sitting beside it, still visible to the child.
    const e = isolatedEnv(
      {
        PATH: "/x",
        Debug: "*",
        Firebase_Token: "leak",
        GCloud_Project: "mediexchange",
        Firestore_Emulator_Host: "evil:1",
        Google_Application_Credentials: "/home/operator/adc.json",
        CloudSdk_Config: "/home/operator/.config/gcloud",
      },
      SANDBOX
    );
    for (const k of ["Debug", "Firebase_Token", "GCloud_Project", "Firestore_Emulator_Host", "Google_Application_Credentials", "CloudSdk_Config"]) {
      assert.equal(e[k], undefined, `${k} survived in its alternative casing`);
    }
  });

  test("5 — the wrapper's own values override anything inherited", () => {
    const e = env();
    assert.equal(e.XDG_CONFIG_HOME, SANDBOX);
    assert.notEqual(e.FIREBASE_EMULATORS_PATH, hostile.FIREBASE_EMULATORS_PATH);
    assert.ok(e.FIREBASE_EMULATORS_PATH.includes(path.join(".deploy", "emulators")));
  });

  test("6 — gcloud configuration is redirected into the sandbox", () => {
    // Dropping CLOUDSDK_CONFIG is not enough: Google's client libraries then
    // fall back to the operator's global gcloud configuration.
    const e = env();
    assert.ok(e.CLOUDSDK_CONFIG.startsWith(SANDBOX), e.CLOUDSDK_CONFIG);
    assert.equal(e.CLOUDSDK_CONFIG.includes("operator"), false);
  });

  test("7 — Application Default Credentials point at a file that does not exist", () => {
    // So a capability claiming to be local that suddenly authenticates fails
    // loudly, instead of reaching a real project with the operator's identity.
    const e = env();
    assert.ok(e.GOOGLE_APPLICATION_CREDENTIALS.startsWith(SANDBOX));
    assert.equal(fs.existsSync(e.GOOGLE_APPLICATION_CREDENTIALS), false);
  });

  test("8 — the env the child actually receives carries no secret", async () => {
    // Asserting on isolatedEnv's return value is not enough: what matters is
    // the `options.env` handed to spawn.
    let seen = null;
    const spawnFn = (_cmd, _args, options) => {
      seen = options.env;
      const handlers = {};
      queueMicrotask(() => handlers.exit?.(0, null));
      return { on: (evt, fn) => (handlers[evt] = fn) };
    };
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "envcap-"));
    await runIsolatedFirebase({
      plan: { ok: true, mode: "x", args: [], cwd: REPO },
      cliPath: "/fake/firebase.js",
      stateDir,
      spawnFn,
      env: hostile,
    });
    fs.rmSync(stateDir, { recursive: true, force: true });

    assert.ok(seen, "spawn never received an environment");
    const leaked = Object.entries(seen).filter(
      ([, v]) => typeof v === "string" && (v.includes("super-secret") || v.includes("operator"))
    );
    assert.deepEqual(leaked, [], `secrets reached the child: ${JSON.stringify(leaked)}`);
    assert.equal(seen.FIREBASE_TOKEN, undefined);
    assert.equal(seen.GCLOUD_PROJECT, undefined);
    assert.equal(seen.DEBUG, undefined);
    assert.equal(seen.PATH, "/usr/bin");
  });
});

describe("REQ-PROJECT-EXPLICIT-01 — serve-functions names its project", () => {
  test("the emulator is pinned to a demo project, never an inferred one", () => {
    // `.firebaserc` has no `default` alias, the configstore is ephemeral and
    // GCLOUD_PROJECT is stripped — anything unstated would fail, or resolve to
    // whatever the machine last selected.
    const plan = planInvocation(["serve-functions"]);
    assert.deepEqual(plan.args, [
      "emulators:start",
      "--only",
      "functions",
      "--project=demo-pharmapp",
    ]);
  });

  test("every mode names a demo project, never staging or production", () => {
    for (const mode of ["serve-functions", "test-rules"]) {
      const projectArgs = planInvocation([mode]).args.filter((a) => a.startsWith("--project="));
      assert.equal(projectArgs.length, 1, `${mode} states no project`);
      assert.match(projectArgs[0], /^--project=demo-/, `${mode} targets ${projectArgs[0]}`);
    }
  });

  test("a caller cannot replace the project", () => {
    assert.equal(planInvocation(["serve-functions", "--project=mediexchange"]).code, "ARGS_FORBIDDEN");
  });
});

describe("REQ-CLI-LOCAL-01 — sandbox cleanup is fail-closed, proven by behaviour", () => {
  // Asserting that the source contains `rmSync` proves nothing about what
  // happens when it throws. These drive the real function with injected
  // dependencies, because a cleanup failure and a spawn failure cannot be
  // provoked reliably with real permissions.
  const PLAN = { ok: true, mode: "test-rules", args: ["--version"], cwd: process.cwd() };

  /** A child that emits the outcome we want, on the next tick. */
  const fakeSpawn = (emit) => () => {
    const handlers = {};
    queueMicrotask(() => emit(handlers));
    return { on: (evt, fn) => (handlers[evt] = fn) };
  };
  const exits = (status, signal = null) => fakeSpawn((h) => h.exit?.(status, signal));
  const errors = (message) => fakeSpawn((h) => h.error?.(new Error(message)));

  /** Records how often cleanup ran, and can be made to fail. */
  const rmSpy = ({ fail: shouldFail = false } = {}) => {
    const calls = [];
    const rm = (p) => {
      calls.push(p);
      if (shouldFail) throw new Error("EBUSY: directory in use");
    };
    return { rm, calls };
  };

  const run = (spawnFn, rm) =>
    runIsolatedFirebase({
      plan: PLAN,
      cliPath: "/fake/firebase.js",
      stateDir: fs.mkdtempSync(path.join(os.tmpdir(), "wrap-state-")),
      spawnFn,
      rm,
      env: { PATH: "" },
    });

  test("1 — success with successful cleanup is a success", async () => {
    const spy = rmSpy();
    const v = await run(exits(0), spy.rm);
    assert.equal(v.ok, true);
    assert.equal(v.exitCode, 0);
    assert.equal(v.cleanup.ok, true);
  });

  test("2 — success with REFUSED cleanup is NOT a success", async () => {
    // The finding: the command could succeed, the sandbox survive, and the
    // wrapper still exit 0 — a preflight announcing success over residue.
    const spy = rmSpy({ fail: true });
    const v = await run(exits(0), spy.rm);
    assert.equal(v.ok, false);
    assert.equal(v.code, "FIREBASE_SANDBOX_CLEANUP_FAILED");
    assert.notEqual(v.exitCode, 0);
    assert.match(v.message, /EBUSY/);
  });

  test("3 — a non-zero CLI exit keeps its own exit code", async () => {
    const v = await run(exits(7), rmSpy().rm);
    assert.equal(v.ok, false);
    assert.equal(v.code, "FIREBASE_CLI_FAILED");
    assert.equal(v.exitCode, 7); // preserved, not flattened to 1
  });

  test("4 — a non-zero exit plus failed cleanup keeps the CLI as the primary cause", async () => {
    // A Rules failure hidden behind a housekeeping error is exactly the kind
    // of misreport this tooling exists to prevent.
    const v = await run(exits(7), rmSpy({ fail: true }).rm);
    assert.equal(v.code, "FIREBASE_CLI_FAILED");
    assert.equal(v.exitCode, 7);
    assert.match(v.message, /exited with code 7/); // primary
    assert.match(v.message, /sandbox also survived/); // secondary
  });

  test("5 — a spawn error is reported as such", async () => {
    const v = await run(errors("ENOENT"), rmSpy().rm);
    assert.equal(v.ok, false);
    assert.equal(v.code, "FIREBASE_CLI_SPAWN_FAILED");
    assert.equal(v.exitCode, 1);
  });

  test("6 — a spawn error plus failed cleanup keeps the spawn error primary", async () => {
    const v = await run(errors("ENOENT"), rmSpy({ fail: true }).rm);
    assert.equal(v.code, "FIREBASE_CLI_SPAWN_FAILED");
    assert.match(v.message, /ENOENT/);
    assert.match(v.message, /sandbox also survived/);
  });

  test("7 — a signalled child is a failure, not a success", async () => {
    const v = await run(exits(null, "SIGKILL"), rmSpy().rm);
    assert.equal(v.ok, false);
    assert.equal(v.code, "FIREBASE_CLI_SIGNALLED");
    assert.match(v.message, /SIGKILL/);
  });

  test("8 — cleanup runs exactly once even when both events fire", async () => {
    const spy = rmSpy();
    // 'error' then 'exit': a real failing spawn emits both.
    const both = fakeSpawn((h) => {
      h.error?.(new Error("ENOENT"));
      h.exit?.(1, null);
    });
    await run(both, spy.rm);
    assert.equal(spy.calls.length, 1, `cleanup ran ${spy.calls.length} times`);
  });

  test("9 — exactly one verdict is produced when both events fire", async () => {
    const both = fakeSpawn((h) => {
      h.error?.(new Error("ENOENT"));
      h.exit?.(0, null);
    });
    const v = await run(both, rmSpy().rm);
    // The first event wins; a later 'exit(0)' must not turn it into a success.
    assert.equal(v.code, "FIREBASE_CLI_SPAWN_FAILED");
  });

  test("11 — an indeterminate child outcome is never a success", async () => {
    // `exit(null, null)` used to take the failure branch with
    // `exitCode: status` — i.e. null — and `process.exit(null)` reads as 0.
    // An unknown outcome reported as success is the worst possible default.
    const v = await run(exits(null, null), rmSpy().rm);
    assert.equal(v.ok, false);
    assert.equal(v.code, "FIREBASE_CLI_EXIT_UNKNOWN");
    assert.equal(v.exitCode, 1);
    assert.notEqual(v.exitCode, 0);
    assert.equal(typeof v.exitCode, "number");
  });

  test("12 — an indeterminate outcome with failed cleanup stays the primary cause", async () => {
    const v = await run(exits(null, null), rmSpy({ fail: true }).rm);
    assert.equal(v.code, "FIREBASE_CLI_EXIT_UNKNOWN");
    assert.equal(v.exitCode, 1);
    assert.match(v.message, /sandbox also survived/);
  });

  test("13 — a sandbox that cannot be created yields a verdict, not an exception", async () => {
    // Letting mkdir throw would escape the verdict shape: a stack trace
    // instead of a code, and a caller with nothing to branch on.
    const boom = () => {
      throw new Error("EACCES: permission denied");
    };
    for (const [label, injected] of [
      ["mkdir", { mkdir: boom }],
      ["mkdtemp", { mkdtemp: boom }],
    ]) {
      const v = await runIsolatedFirebase({
        plan: PLAN,
        cliPath: "/fake/firebase.js",
        stateDir: path.join(os.tmpdir(), "never-created"),
        spawnFn: exits(0),
        env: { PATH: "" },
        ...injected,
      });
      assert.equal(v.ok, false, `${label} failure was not reported`);
      assert.equal(v.code, "FIREBASE_SANDBOX_CREATE_FAILED", label);
      assert.equal(v.exitCode, 1, label);
      assert.match(v.message, /EACCES/, label);
      // Nothing was created, so nothing is owed a removal.
      assert.equal(v.cleanup.attempted, false, label);
      assert.equal(v.configDir, null, label);
    }
  });

  test("14 — no removal is attempted when no sandbox exists", async () => {
    const spy = rmSpy();
    await runIsolatedFirebase({
      plan: PLAN,
      cliPath: "/fake/firebase.js",
      stateDir: path.join(os.tmpdir(), "never-created"),
      spawnFn: exits(0),
      rm: spy.rm,
      mkdtemp: () => {
        throw new Error("EACCES");
      },
      env: { PATH: "" },
    });
    assert.deepEqual(spy.calls, [], "removal was attempted on a sandbox that never existed");
  });

  test("15 — an unusable child object is a spawn failure, and still cleans up", async () => {
    // A child without `on`, or whose `on` throws, must not escape the verdict
    // shape — and the sandbox already exists by then, so it is owed a removal.
    const noOn = () => ({});
    const throwingOn = () => ({
      on: () => {
        throw new Error("handler registration failed");
      },
    });
    for (const [label, spawnFn] of [["missing on()", noOn], ["throwing on()", throwingOn]]) {
      const spy = rmSpy();
      const v = await run(spawnFn, spy.rm);
      assert.equal(v.code, "FIREBASE_CLI_SPAWN_FAILED", label);
      assert.equal(v.exitCode, 1, label);
      assert.equal(spy.calls.length, 1, `${label}: cleanup ran ${spy.calls.length} times`);
    }
  });

  test("16 — an unusable child with failed cleanup keeps the spawn error primary", async () => {
    const v = await run(() => ({}), rmSpy({ fail: true }).rm);
    assert.equal(v.code, "FIREBASE_CLI_SPAWN_FAILED");
    assert.match(v.message, /sandbox also survived/);
  });

  test("10 — the sandbox is really gone after a controlled success", async () => {
    // Real filesystem, real removal — no injection here.
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "wrap-state-"));
    const v = await runIsolatedFirebase({
      plan: PLAN,
      cliPath: "/fake/firebase.js",
      stateDir,
      spawnFn: exits(0),
      env: { PATH: "" },
    });
    assert.equal(v.ok, true);
    assert.equal(fs.existsSync(v.configDir), false, "sandbox survived a successful run");
    assert.deepEqual(fs.readdirSync(stateDir), []);
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  test("cleaning the sandbox never touches the emulator cache beside it", async () => {
    // They are siblings under .deploy; removing one must not take the other,
    // or every run would re-download ~60 MB.
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "wrap-state-"));
    const cache = path.join(stateDir, "emulators");
    fs.mkdirSync(cache);
    fs.writeFileSync(path.join(cache, "emulator.jar"), "binary");
    await runIsolatedFirebase({
      plan: PLAN,
      cliPath: "/fake/firebase.js",
      stateDir,
      spawnFn: exits(0),
      env: { PATH: "" },
    });
    assert.equal(fs.existsSync(path.join(cache, "emulator.jar")), true);
    fs.rmSync(stateDir, { recursive: true, force: true });
  });
});

describe("REQ-CLI-LOCAL-01 — a real run of runIsolatedFirebase leaves nothing behind", () => {
  test("the real CLI, real spawn and real filesystem, end to end", async () => {
    // The previous version of this test ran `node firebase.js --version`
    // directly and then asserted `.deploy` was empty. It never entered
    // runIsolatedFirebase, never created a sandbox under the state directory,
    // and never exercised the cleanup — so the assertion was true without
    // testing the property it named.
    //
    // `--version` is passed as a plan literal rather than added as a public
    // wrapper MODE: the closed capability set must not grow to suit a test.
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-state-"));
    const cache = path.join(stateDir, "emulators");
    fs.mkdirSync(cache);
    fs.writeFileSync(path.join(cache, "emulator.jar"), "binary");

    const userConfig = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
    const before = fs.existsSync(userConfig) ? fs.statSync(userConfig) : null;

    try {
      const verdict = await runIsolatedFirebase({
        plan: { ok: true, mode: "version-probe", args: ["--version"], cwd: REPO },
        cliPath: resolveCli(TOOLS).cli,
        stateDir,
      });

      assert.equal(verdict.ok, true, `${verdict.code}: ${verdict.message}`);
      assert.equal(verdict.exitCode, 0);
      // The sandbox was genuinely created under the state directory…
      assert.ok(
        verdict.configDir.startsWith(stateDir),
        `sandbox created outside the state directory: ${verdict.configDir}`
      );
      assert.ok(path.basename(verdict.configDir).startsWith("firebase-config-"));
      // …and is genuinely gone.
      assert.equal(fs.existsSync(verdict.configDir), false, "sandbox survived a real run");
      assert.equal(verdict.cleanup.ok, true);
      // The neighbouring cache is untouched: otherwise every run would
      // re-download the emulator.
      assert.equal(fs.readFileSync(path.join(cache, "emulator.jar"), "utf8"), "binary");
      assert.deepEqual(fs.readdirSync(stateDir), ["emulators"]);

      // Output is not asserted: the CLI may emit a MOTD or a download notice
      // depending on its environment. The version itself is already proven by
      // the manifest/lockfile/installation comparison.
      const after = fs.existsSync(userConfig) ? fs.statSync(userConfig) : null;
      assert.equal(
        before?.mtimeMs ?? null,
        after?.mtimeMs ?? null,
        "the run touched the operator's Firebase configuration"
      );
    } finally {
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });
});

describe("REQ-CONFIG-SINGLE-01 — exactly one Firebase configuration may target a project", () => {
  const trackedConfigs = () =>
    execFileSync("git", ["ls-files", "*firebase.json", "**/firebase.json"], {
      cwd: REPO,
      encoding: "utf8",
    })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((f) => !f.includes("node_modules/"));

  test("only the root firebase.json is tracked", () => {
    // A second config is not a stylistic duplicate: firebase-tools picks the
    // CLOSEST one walking up from the working directory, so a copy under an
    // app directory silently becomes authoritative for anyone standing there.
    // The one that existed shipped 13 protected collections instead of 30 and
    // 2 indexes instead of 15 — to production.
    assert.deepEqual(trackedConfigs(), ["firebase.json"]);
  });

  test("the deleted duplicates are gone from the worktree, not merely untracked", () => {
    for (const f of [
      "pharmapp_unified/firebase.json",
      "pharmapp_unified/firestore.rules",
      "pharmapp_unified/firestore.indexes.json",
    ]) {
      assert.equal(fs.existsSync(path.join(REPO, f)), false, `${f} still exists on disk`);
    }
  });

  test("no alternative rules or indexes file is tracked anywhere", () => {
    // The config is only half the hazard; the rules and indexes it points at
    // are the payload.
    const stray = execFileSync(
      "git",
      ["ls-files", "*firestore.rules", "**/firestore.rules", "*firestore.indexes.json", "**/firestore.indexes.json"],
      { cwd: REPO, encoding: "utf8" }
    )
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((f) => !f.includes("node_modules/"));
    assert.deepEqual(stray.sort(), ["firestore.indexes.json", "firestore.rules"]);
  });

  test("the root config is the one the deployer actually reads", () => {
    // REQ-CONFIG-ROOT-01: the deployer resolves ROOT from its own file
    // location, not from the caller's cwd.
    const src = fs.readFileSync(path.join(HERE, "deploy-staging.mjs"), "utf8");
    assert.match(src, /path\.join\(ROOT, "firebase\.json"\)/);
    assert.match(src, /const ROOT = path\.resolve\(path\.dirname\(fileURLToPath\(import\.meta\.url\)\)/);
  });

  test("a hostile secondary config is REFUSED by the gate, not silently accepted", async () => {
    // Defence in depth: even if such a config were somehow fed to the gate,
    // every structural check must decline it. This is the exact shape of the
    // one that was deleted — Firestore-only, no functions section.
    const { checkFunctionsSource, checkPredeployHook, checkFunctionsIgnore } = await import(
      "./deployChecks.mjs"
    );
    const hostile = { firestore: { rules: "firestore.rules", indexes: "firestore.indexes.json" } };

    assert.equal(checkFunctionsSource(hostile).ok, false);
    assert.equal(checkFunctionsSource(hostile).code, "FUNCTIONS_SOURCE_UNEXPECTED");
    assert.equal(checkPredeployHook(hostile).ok, false);

    // And a config that merely LOOKS right but points elsewhere is refused too.
    const decoy = { functions: { source: "pharmapp_unified", predeploy: [] } };
    assert.equal(checkFunctionsSource(decoy).ok, false);
  });
});

describe("REQ-CLI-SINGLE-01 — nothing versioned can trigger a deployment", () => {
  /** Comments may discuss deployment; executable lines may not perform it. */
  const stripComments = (s) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/^\s*#.*$/gm, "");

  const DEPLOY_PATTERNS = [
    /\bfirebase\s+deploy\b/i,
    /\bgcloud\s+functions\s+deploy\b/i,
    /\bgcloud\s+run\s+deploy\b/i,
    /\bfirebase\s+hosting:channel:deploy\b/i,
  ];

  const tracked = (args) =>
    execFileSync("git", ["ls-files", ...args], { cwd: REPO, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((f) => !f.startsWith("docs/") && !f.includes("node_modules/"));

  test("no package.json script deploys", () => {
    const offenders = [];
    for (const file of tracked(["*package.json", "**/package.json"])) {
      const scripts = readJson(path.join(REPO, file)).scripts ?? {};
      for (const [name, body] of Object.entries(scripts)) {
        if (DEPLOY_PATTERNS.some((p) => p.test(body))) offenders.push(`${file} → ${name}: ${body}`);
      }
    }
    assert.deepEqual(offenders, [], "a versioned script can deploy without passing the gate");
  });

  test("functions declares no deploy script at all", () => {
    // It used to be `firebase deploy --only functions`: one command, no gate.
    assert.equal(readJson(path.join(REPO, "functions", "package.json")).scripts.deploy, undefined);
  });

  test("no executable script file deploys", () => {
    const offenders = [];
    const files = tracked(["*.mjs", "*.cjs", "*.sh", "*.ps1", "*.bat", "*.cmd", "*.yml", "*.yaml"])
      // The guard and the closed-phase test necessarily quote these patterns
      // in order to forbid them; excluding them keeps the guard from firing
      // on its own statement of what it forbids.
      .filter((f) => !f.endsWith(".test.mjs"));
    for (const file of files) {
      const src = stripComments(fs.readFileSync(path.join(REPO, file), "utf8"));
      if (DEPLOY_PATTERNS.some((p) => p.test(src))) offenders.push(file);
    }
    assert.deepEqual(offenders, [], "an executable script can deploy without passing the gate");
  });

  test("the guard actually detects a deployment call", () => {
    // Without this, every assertion above would pass on a broken regex.
    const sample = 'run("firebase deploy --only functions")';
    assert.ok(DEPLOY_PATTERNS.some((p) => p.test(stripComments(sample))));
    assert.equal(DEPLOY_PATTERNS.some((p) => p.test(stripComments("// firebase deploy"))), false);
  });
});
