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
 * Expand builds and publishes Functions plus both staging web targets before
 * contract can tighten Rules. Missing web configuration refuses before the
 * first remote mutation.
 *
 * This file is orchestration only. Verdicts live in `deployChecks.mjs`,
 * subprocess handling in `deployRunner.mjs`, mutual exclusion in
 * `deployLock.mjs` — each testable without running a deployment.
 */

import fs from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
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
  checkRemoteFunctions,
  checkWebSdkConfig,
  checkStagingHostingTargets,
  checkContractRecord,
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
  runFirebase,
  probeTool,
  resolveNpmRuntime,
  resolveFirebaseCli,
} from "./deployRunner.mjs";
import { hashFunctionsArtifact, functionsIgnoreGlobs, SYMLINK_CYCLE_CODE } from "./deployArtifact.mjs";
import { exportedNames } from "../functions/scripts/verifyExports.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_DIR = path.join(ROOT, ".deploy");
const LOCK = path.join(STATE_DIR, "lock.json");

function flutterRuntime() {
  const root = process.env.FLUTTER_ROOT;
  if (!root || !path.isAbsolute(root)) return null;
  const dart = path.join(root, "bin", "cache", "dart-sdk", "bin", process.platform === "win32" ? "dart.exe" : "dart");
  const snapshot = path.join(root, "bin", "cache", "flutter_tools.snapshot");
  const packages = path.join(root, "packages", "flutter_tools", ".dart_tool", "package_config.json");
  return [dart, snapshot, packages].every(fs.existsSync) ? { root, dart, snapshot, packages } : null;
}

function hashDirectory(dir) {
  const hash = createHash("sha256");
  let count = 0;
  function walk(base, rel = "") {
    for (const entry of fs.readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const name = path.posix.join(rel, entry.name);
      const full = path.join(base, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Hosting symlink refused: ${name}`);
      if (entry.isDirectory()) walk(full, name);
      else if (entry.isFile()) {
        hash.update(name).update("\0").update(fs.readFileSync(full)).update("\0");
        count += 1;
      }
    }
  }
  walk(dir);
  if (count === 0) throw new Error(`Empty Hosting build: ${dir}`);
  return `sha256:${hash.digest("hex")}`;
}

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
    flutter: flutterRuntime()?.root ?? null,
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
const firebaseRc = must(parseJsonOrRefuse(readText(path.join(ROOT, ".firebaserc")), ".firebaserc")).value;
must(checkStagingHostingTargets(firebaseRc, firebaseConfig));
say("  ✓ firebase.json packages and verifies the right artefact");

const functionsPkg = must(
  parseJsonOrRefuse(
    readText(path.join(ROOT, "functions", "package.json")),
    "functions/package.json"
  )
).value;
must(checkFunctionsMain(functionsPkg));
say("  ✓ package main points at the verified entry point");

// ---- phase bodies ----------------------------------------------------------

if (phase !== "preflight" && process.env.FIRESTORE_EMULATOR_HOST) {
  die({ code: "EMULATOR_FORBIDDEN", message: "Remote staging phases refuse FIRESTORE_EMULATOR_HOST." });
}

const acquired = must(
  acquireLock(LOCK, {
    phase,
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

let hosting = null;
if (phase === "expand") {
  const runtime = flutterRuntime();
  if (!runtime) die({ code: "FLUTTER_RUNTIME_MISSING", message: "Set FLUTTER_ROOT to an installed Flutter SDK with its cached Dart tool." });
  const sites = [
    { name: "app", dir: "pharmapp_unified", prefix: "STAGING_APP", url: "https://mediexchange-staging.web.app/" },
    { name: "admin", dir: "admin_panel", prefix: "STAGING_ADMIN", url: "https://mediexchange-staging-admin.web.app/" },
  ];
  hosting = [];
  for (const site of sites) {
    const configFile = path.join(ROOT, site.dir, "lib", "firebase_options.dart");
    if (!fs.existsSync(configFile)) die({ code: "WEB_CONFIG_MISSING", message: `${site.dir}/lib/firebase_options.dart is required for a staging web build.` });
    const values = ["API_KEY", "APP_ID", "SENDER_ID"].map((key) => process.env[`${site.prefix}_${key}`]);
    if (values.some((value) => !value || !String(value).trim())) {
      die({ code: "WEB_STAGING_CONFIG_MISSING", message: `${site.prefix}_API_KEY, _APP_ID and _SENDER_ID must be set.` });
    }
    if (!/^1:\d+:web:[a-fA-F0-9]+$/.test(values[1]) || !/^\d+$/.test(values[2]) ||
        values[1].split(":")[1] !== values[2]) {
      die({ code: "WEB_STAGING_CONFIG_INVALID", message: `${site.prefix} App ID and sender ID do not agree.` });
    }
    const sdk = await runFirebase(firebase.firebaseCli,
      ["apps:sdkconfig", "web", values[1], "--project", ALLOWED_PROJECT, "--json"],
      // Keep the API key in memory for comparison, but never surface the
      // command's output on failure or in a manifest.
      { cwd: ROOT, timeoutMs: 120_000, redact: (value) => value });
    if (!sdk.ok) die({ code: sdk.code, message: `${site.name} staging SDK config could not be read.` });
    must(checkWebSdkConfig({
      response: must(parseJsonOrRefuse(sdk.stdout, `${site.name} staging SDK config`)).value,
      apiKey: values[0], appId: values[1], senderId: values[2],
    }));
    for (const assets of site.name === "app" ? ["assets/images", "assets/icons"] : ["assets/images"]) {
      if (!fs.existsSync(path.join(ROOT, site.dir, assets))) {
        die({ code: "WEB_ASSET_MISSING", message: `${site.dir}/${assets} is required by pubspec.yaml.` });
      }
    }
    const cwd = path.join(ROOT, site.dir);
    const flutterArgs = [
      `--packages=${runtime.packages}`, runtime.snapshot,
    ];
    const env = { ...process.env, FLUTTER_ROOT: runtime.root };
    const pub = await runCommand(runtime.dart, [...flutterArgs, "pub", "get"], { cwd, env, timeoutMs: 900_000, redact: redactSecrets });
    if (!pub.ok) die({ code: pub.code, message: `${site.name} pub get: ${pub.message}` });
    const build = await runCommand(runtime.dart, [...flutterArgs, "build", "web", "--release",
      "--dart-define=USE_STAGING=true",
      `--dart-define=STAGING_API_KEY=${values[0]}`,
      `--dart-define=STAGING_APP_ID=${values[1]}`,
      `--dart-define=STAGING_SENDER_ID=${values[2]}`,
      `--dart-define=STAGING_PROJECT_ID=${ALLOWED_PROJECT}`,
    ], { cwd, env, timeoutMs: 1_200_000, redact: redactSecrets });
    if (!build.ok) die({ code: build.code, message: `${site.name} web build: ${build.message}` });
    const outDir = path.join(cwd, "build", "web");
    const index = path.join(outDir, "index.html");
    if (!fs.existsSync(index)) die({ code: "WEB_BUILD_EMPTY", message: `${site.name} build produced no index.html.` });
    hosting.push({ ...site, outDir, artifactHash: hashDirectory(outDir), indexHash: createHash("sha256").update(fs.readFileSync(index)).digest("hex") });
    say(`  ✓ ${site.name} web build hashed`);
  }
}

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

if (phase !== "preflight") {
  const rulesHash = `sha256:${createHash("sha256").update(fs.readFileSync(path.join(ROOT, "firestore.rules"))).digest("hex")}`;
  const expectedNames = [...exportedNames(readText(path.join(ROOT, "functions", "lib", "index.js")) ?? "")].sort();
  if (expectedNames.length === 0) die({ code: "FUNCTIONS_EXPORTS_EMPTY", message: "No compiled Functions exports found." });

  // Admin SDK is resolved from the separately installed Functions tree. A
  // machine-local manifest is never used to authorise contract: the record
  // is read from the real staging project under ADC, never an emulator.
  const fromFunctions = createRequire(path.join(ROOT, "functions", "package.json"));
  const { initializeApp, applicationDefault, getApps } = fromFunctions("firebase-admin/app");
  const { getFirestore, FieldValue } = fromFunctions("firebase-admin/firestore");
  if (getApps().length === 0) initializeApp({ credential: applicationDefault(), projectId: ALLOWED_PROJECT });
  const proofRef = getFirestore().collection("deployment_proofs").doc("staging-functions-expand");

  async function remoteInventory() {
    const r = await runFirebase(firebase.firebaseCli, ["functions:list", "--project", ALLOWED_PROJECT, "--json"], {
      cwd: ROOT, timeoutMs: 120_000, redact: redactSecrets,
    });
    if (!r.ok) die({ code: r.code, message: `remote Functions inventory: ${r.message}` });
    const parsed = must(parseJsonOrRefuse(r.stdout, "remote Functions inventory")).value;
    must(checkRemoteFunctions({ response: parsed, expectedNames }));
    return parsed;
  }

  async function remoteHealth() {
    const endpoint = `https://europe-west1-${ALLOWED_PROJECT}.cloudfunctions.net/health`;
    let response;
    try { response = await fetch(endpoint, { signal: AbortSignal.timeout(20_000) }); }
    catch (e) { die({ code: "HEALTH_UNREACHABLE", message: `Staging health is unreachable: ${e.message}` }); }
    if (!response.ok || (await response.text()).trim() !== "ok") {
      die({ code: "HEALTH_FAILED", message: `Staging health returned HTTP ${response.status} or an unexpected body.` });
    }
  }

  async function remoteHosting(site, expectedIndexHash) {
    let response;
    try { response = await fetch(site.url, { signal: AbortSignal.timeout(20_000), cache: "no-store" }); }
    catch (e) { die({ code: "HOSTING_UNREACHABLE", message: `${site.name} Hosting is unreachable: ${e.message}` }); }
    if (!response.ok) die({ code: "HOSTING_FAILED", message: `${site.name} Hosting returned HTTP ${response.status}.` });
    const actual = createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
    if (actual !== expectedIndexHash) {
      die({ code: "HOSTING_MISMATCH", message: `${site.name} remote index.html differs from the staging build.` });
    }
  }

  async function remoteProof() {
    let snap;
    try { snap = await proofRef.get(); }
    catch (e) { die({ code: "REMOTE_PROOF_UNREADABLE", message: `Cannot read staging proof: ${e.message}` }); }
    return snap.exists ? snap.data() : null;
  }

  async function firebaseMutation(label, only) {
    // All arguments are fixed, versioned and explicitly target staging. The
    // pinned local CLI runs under Node, with no shell or global Firebase shim.
    const r = await runFirebase(firebase.firebaseCli,
      ["deploy", "--only", only, "--project", ALLOWED_PROJECT, "--non-interactive"],
      { cwd: ROOT, timeoutMs: 1_800_000, redact: redactSecrets });
    if (!r.ok) die({ code: r.code, message: `${label}: ${r.message}` });
    say(`  ✓ ${label}`);
  }

  if (phase === "expand") {
    // Index creation can precede Functions safely; a failure stops before
    // the callable deployment and no contract proof is written.
    await firebaseMutation("Firestore indexes", "firestore:indexes");
    await firebaseMutation("Functions", "functions");
    // The Firebase predeploy hook rebuilds. Ensure the payload after it is
    // byte-for-byte the one whose tests and hash passed above.
    const shippedHash = hashFunctionsArtifact(path.join(ROOT, "functions"), functionsIgnoreGlobs(firebaseConfig)).hash;
    if (shippedHash !== artefact.hash) die({ code: "ARTIFACT_DRIFT", message: "Functions payload changed during deployment; no expand proof written." });
    await remoteInventory();
    await remoteHealth();
    for (const site of hosting) {
      if (hashDirectory(site.outDir) !== site.artifactHash) {
        die({ code: "HOSTING_ARTIFACT_DRIFT", message: `${site.name} build changed before deployment.` });
      }
      await firebaseMutation(`${site.name} Hosting`, `hosting:${site.name}`);
      await remoteHosting(site, site.indexHash);
    }
    must(checkNoGitDrift({
      initialSha: localSha, initialBranch: branch, initialRemoteSha: remoteSha,
      finalStatus: await git(["status", "--porcelain", "--untracked-files=all"]),
      finalSha: await git(["rev-parse", "HEAD"]),
      finalBranch: await git(["rev-parse", "--abbrev-ref", "HEAD"]),
      finalRemoteSha: (await git(["ls-remote", "origin", `refs/heads/${branch}`], { tolerant: true }))?.split(/\s+/)[0] ?? null,
      finalRemoteSource: "ls-remote",
    }));
    try {
      await proofRef.set({
        project: ALLOWED_PROJECT, phase: "expand", status: "verified",
        gitSha: localSha, branch, functionsArtifactHash: artefact.hash,
        hostingArtifactHashes: Object.fromEntries(hosting.map((site) => [site.name, site.artifactHash])),
        hostingIndexHashes: Object.fromEntries(hosting.map((site) => [site.name, site.indexHash])),
        functionNames: expectedNames, verifiedAt: new Date().toISOString(),
        writtenAt: FieldValue.serverTimestamp(),
      });
    } catch (e) { die({ code: "REMOTE_PROOF_WRITE_FAILED", message: `Functions expanded, but staging proof could not be written: ${e.message}` }); }
    must(checkContractPrerequisite({ phase: "contract", proof: await remoteProof(), gitSha: localSha, functionsArtifactHash: artefact.hash }));
    say("  ✓ authoritative expand proof recorded in staging Firestore");
  } else {
    const proof = await remoteProof();
    must(checkContractPrerequisite({ phase: "contract", proof, gitSha: localSha, functionsArtifactHash: artefact.hash }));
    await remoteInventory();
    await remoteHealth();
    for (const site of [
      { name: "app", url: "https://mediexchange-staging.web.app/" },
      { name: "admin", url: "https://mediexchange-staging-admin.web.app/" },
    ]) {
      const indexHash = proof?.hostingIndexHashes?.[site.name];
      if (!/^[0-9a-f]{64}$/.test(String(indexHash ?? ""))) {
        die({ code: "HOSTING_PROOF_INCOMPLETE", message: `${site.name} Hosting index hash absent from remote expand proof.` });
      }
      await remoteHosting(site, indexHash);
    }
    if (phase === "contract") {
      await firebaseMutation("Firestore Rules", "firestore:rules");
      try {
        await proofRef.update({
          contract: { gitSha: localSha, rulesHash, verifiedAt: new Date().toISOString() },
          contractedAt: FieldValue.serverTimestamp(),
        });
      } catch (e) { die({ code: "CONTRACT_PROOF_WRITE_FAILED", message: `Rules deployed, but the staging contract record could not be written: ${e.message}` }); }
    } else {
      must(checkContractRecord({ proof, gitSha: localSha, rulesHash }));
    }
  }

  const release = releaseOwnLock(LOCK, ownedLockUuid);
  ownedLockUuid = null;
  must(concludeRelease(release));
  say(`\n✅ ${phase} passed — ${localSha.slice(0, 8)} on ${ALLOWED_PROJECT}.`);
  process.exit(0);
}

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
