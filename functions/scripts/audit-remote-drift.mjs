// READ-ONLY. No delete, no mutation, no deploy. Audit only.
//
// audit-remote-drift.mjs
// Compare the set of Cloud Functions currently deployed on a Firebase/GCP
// project against the set of functions exported from functions/src/index.ts.
//
// Purpose: surface "drift" — functions that live on the remote but are no
// longer declared locally (orphans), or declared locally but never shipped.
// Use this as a safety check before deploys or during cleanup planning.
//
// Usage:
//   node functions/scripts/audit-remote-drift.mjs [--project <id>] [--help]
//
// Flags:
//   --project <id>   GCP project ID to audit (default: mediexchange)
//   --help           Print this usage block and exit
//
// Output: plain text report with three sections
//   remote_only    deployed on GCP but NOT exported from functions/src/index.ts
//                  → entries include `runtime` and `lastDeploy` when available.
//                    `lastDeploy: unknown` is acceptable when the CLI does not
//                    expose the value; we do not chase it with per-function
//                    describe calls (kept bounded on purpose).
//   local_only     exported from index.ts but NOT deployed on the remote
//   intersection   present in both; aggregated counts per runtime are shown
//                  when they can be derived from the same JSON.
//
// Runtime interpretation:
//   - `nodejs20` on a remote_only (orphan) entry signals potential urgency
//     around the Firebase Node 20 deprecation window.
//   - `nodejs22` signals no immediate runtime urgency.
//
// Dependencies:
//   - `gcloud` CLI installed and authenticated for the target project
//   - Node.js (ESM-native), no extra npm packages
//
// Safety:
//   This script performs ONLY read operations (file read + `gcloud functions list`).
//   It never deletes, mutates, or deploys anything.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ----- CLI parsing -----
function parseArgs(argv) {
  const args = { project: "mediexchange", help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      args.help = true;
    } else if (a === "--project") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        console.error("ERROR: --project requires a value");
        process.exit(2);
      }
      args.project = v;
      i++;
    } else {
      console.error(`ERROR: unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function printHelp() {
  const help = `
audit-remote-drift.mjs — READ-ONLY audit of Cloud Function drift.

Usage:
  node functions/scripts/audit-remote-drift.mjs [--project <id>] [--help]

Flags:
  --project <id>   GCP project ID to audit (default: mediexchange)
  --help, -h       Show this help and exit

Compares the set of Cloud Functions deployed on the given GCP project
against the functions exported from functions/src/index.ts, and prints
three groups:

  remote_only    Deployed on GCP but NOT exported from index.ts.
                 Each entry includes 'runtime' and 'lastDeploy' when the
                 CLI exposes them. 'lastDeploy: unknown' is acceptable.

  local_only     Exported from index.ts but NOT deployed on the remote.

  intersection   Present in both. A small aggregate by runtime is shown
                 when it can be derived from the same JSON payload.

Runtime interpretation:
  nodejs20 on a remote_only entry = potential urgency (deprecation window).
  nodejs22                        = no immediate runtime urgency.

Safety:
  READ-ONLY. No delete, no mutation, no deploy. Audit only.
`;
  console.log(help.trim());
}

// ----- index.ts parsing -----
// We extract any identifier that is declared as an exported Cloud Function.
// Two supported patterns (plus multi-name re-exports):
//   1) export { name1, name2 } from "./path.js";
//   2) export const name = onRequest(...) / onCall(...) / any expression
// Commented lines (leading // after trim) are skipped.
function extractLocalExports(indexPath) {
  const src = readFileSync(indexPath, "utf8");
  const names = new Set();

  // Pre-strip: for each line, skip it if the trimmed line starts with //.
  // We do NOT attempt full block-comment parsing — the codebase convention
  // uses // for inline disables (e.g. `// export { cleanupTestUser } ...`).
  const lines = src.split(/\r?\n/);
  const keptLines = [];
  for (const raw of lines) {
    const trimmed = raw.trimStart();
    if (trimmed.startsWith("//")) continue;
    keptLines.push(raw);
  }
  // Rejoin so multi-line `export { a, b } from "..."` still parses.
  const cleaned = keptLines.join("\n");

  // Pattern 1: export { a, b, c as d } from "./path";
  // We capture everything inside the braces, then split on commas.
  const reBraceExport = /export\s*\{([^}]*)\}\s*from\s*["'][^"']+["']\s*;?/g;
  let m;
  while ((m = reBraceExport.exec(cleaned)) !== null) {
    const inner = m[1];
    for (const rawName of inner.split(",")) {
      // Handle `foo as bar` — export name is `bar` (what consumers see).
      const piece = rawName.trim();
      if (!piece) continue;
      const asMatch = piece.match(/^\s*\w+\s+as\s+(\w+)\s*$/);
      if (asMatch) {
        names.add(asMatch[1]);
      } else {
        const idMatch = piece.match(/^\s*(\w+)\s*$/);
        if (idMatch) names.add(idMatch[1]);
      }
    }
  }

  // Pattern 2: export const name = ...
  const reConstExport = /export\s+const\s+(\w+)\s*=/g;
  while ((m = reConstExport.exec(cleaned)) !== null) {
    names.add(m[1]);
  }

  // Pattern 3: export function name(...) — defensive, not used today
  const reFnExport = /export\s+(?:async\s+)?function\s+(\w+)\s*\(/g;
  while ((m = reFnExport.exec(cleaned)) !== null) {
    names.add(m[1]);
  }

  return names;
}

// ----- gcloud invocation -----
// On Windows `gcloud` ships as a `.cmd` shim. Since Node v20's CVE-2024-27980
// hardening, `spawnSync` refuses to execute `.cmd`/`.bat` files without
// `shell: true`. To stay safe against arg injection we still call with an
// argv array on POSIX, and ONLY enable `shell: true` when we must fall back
// to the `.cmd` shim on Windows. The projectId is validated by a strict
// allow-list before reaching this function.
function validateProjectId(projectId) {
  // GCP project IDs: 6-30 chars, lowercase letters, digits, hyphens.
  // We accept a slightly wider set defensively but still reject any shell
  // metacharacter that could be harmful when `shell: true` is used.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,62}$/.test(projectId)) {
    console.error(
      `ERROR: invalid --project value (expected [A-Za-z0-9_-]+): ${projectId}`
    );
    process.exit(2);
  }
}

function spawnGcloud(args) {
  const baseOpts = {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  };
  // POSIX: direct call, no shell.
  if (process.platform !== "win32") {
    return spawnSync("gcloud", args, baseOpts);
  }
  // Windows: try the bare name (in case a PowerShell alias or wrapper
  // resolves it), then the .cmd shim via shell. We only fall through to
  // shell mode after the direct call fails with ENOENT or EINVAL.
  const direct = spawnSync("gcloud", args, baseOpts);
  if (!direct.error) return direct;
  if (direct.error.code !== "ENOENT" && direct.error.code !== "EINVAL") {
    return direct;
  }
  return spawnSync("gcloud.cmd", args, { ...baseOpts, shell: true });
}

function fetchRemoteFunctions(projectId) {
  const result = spawnGcloud([
    "functions",
    "list",
    `--project=${projectId}`,
    "--format=json",
  ]);

  if (result.error) {
    console.error(`ERROR: failed to spawn gcloud: ${result.error.message}`);
    console.error("Is the gcloud CLI installed and on PATH?");
    process.exit(3);
  }
  if (result.status !== 0) {
    console.error(`ERROR: gcloud exited with code ${result.status}`);
    if (result.stderr) console.error(result.stderr.trim());
    process.exit(result.status ?? 3);
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout || "[]");
  } catch (err) {
    console.error("ERROR: failed to parse gcloud JSON output");
    console.error(err.message);
    process.exit(4);
  }

  if (!Array.isArray(parsed)) {
    console.error("ERROR: gcloud output was not a JSON array");
    process.exit(4);
  }

  // Each record exposes:
  //   - `name` (full resource path) OR just the function id
  //   - `runtime` lives at the top level for GEN_1, under
  //     `buildConfig.runtime` for GEN_2. We check both.
  //   - `updateTime` (ISO timestamp) — used for lastDeploy best-effort
  //   - `state` (e.g. 'ACTIVE')
  //   - `environment` ('GEN_1' | 'GEN_2')
  const records = parsed.map((fn) => {
    const fullName = String(fn.name ?? "");
    // Strip any "projects/.../functions/" prefix to get the bare function id.
    const bare = fullName.includes("/") ? fullName.split("/").pop() : fullName;
    const runtime = fn.runtime ?? fn.buildConfig?.runtime ?? "unknown";
    return {
      name: bare,
      runtime,
      lastDeploy: fn.updateTime ?? "unknown",
      state: fn.state ?? "unknown",
      environment: fn.environment ?? "unknown",
    };
  });

  return records;
}

// ----- Report -----
function renderReport({ projectId, localExports, remoteRecords }) {
  const remoteByName = new Map();
  for (const rec of remoteRecords) remoteByName.set(rec.name, rec);

  const remoteNames = new Set(remoteByName.keys());

  const intersection = [];
  const localOnly = [];
  for (const name of localExports) {
    if (remoteNames.has(name)) intersection.push(name);
    else localOnly.push(name);
  }

  const remoteOnly = [];
  for (const name of remoteNames) {
    if (!localExports.has(name)) remoteOnly.push(name);
  }

  intersection.sort();
  localOnly.sort();
  remoteOnly.sort();

  // Runtime aggregate for intersection
  const intersectionByRuntime = new Map();
  for (const name of intersection) {
    const rt = remoteByName.get(name)?.runtime ?? "unknown";
    intersectionByRuntime.set(rt, (intersectionByRuntime.get(rt) ?? 0) + 1);
  }

  const lines = [];
  lines.push("========================================================");
  lines.push(` Cloud Functions drift audit — project: ${projectId}`);
  lines.push(" READ-ONLY. No delete, no mutation, no deploy.");
  lines.push("========================================================");
  lines.push("");
  lines.push(`Summary:`);
  lines.push(`  local exports     : ${localExports.size}`);
  lines.push(`  remote deployed   : ${remoteRecords.length}`);
  lines.push(`  intersection      : ${intersection.length}`);
  lines.push(`  remote_only       : ${remoteOnly.length}`);
  lines.push(`  local_only        : ${localOnly.length}`);
  lines.push("");

  // Intersection aggregate
  if (intersection.length > 0) {
    const parts = [];
    for (const [rt, count] of [...intersectionByRuntime.entries()].sort()) {
      parts.push(`${count} on ${rt}`);
    }
    lines.push(`Intersection runtime breakdown: ${parts.join(", ")}`);
    lines.push("");
  }

  // remote_only (the ones that matter most — potential orphans)
  lines.push("--------------------------------------------------------");
  lines.push(" remote_only  (deployed, NOT exported from index.ts)");
  lines.push("--------------------------------------------------------");
  if (remoteOnly.length === 0) {
    lines.push("  (none)");
  } else {
    for (const name of remoteOnly) {
      const rec = remoteByName.get(name);
      const rt = rec?.runtime ?? "unknown";
      const ld = rec?.lastDeploy ?? "unknown";
      const st = rec?.state ?? "unknown";
      const env = rec?.environment ?? "unknown";
      lines.push(`  - ${name}`);
      lines.push(`      runtime     : ${rt}`);
      lines.push(`      lastDeploy  : ${ld}`);
      lines.push(`      state       : ${st}`);
      lines.push(`      environment : ${env}`);
    }
  }
  lines.push("");

  // local_only
  lines.push("--------------------------------------------------------");
  lines.push(" local_only  (exported from index.ts, NOT deployed)");
  lines.push("--------------------------------------------------------");
  if (localOnly.length === 0) {
    lines.push("  (none)");
  } else {
    for (const name of localOnly) {
      lines.push(`  - ${name}`);
    }
  }
  lines.push("");

  // intersection
  lines.push("--------------------------------------------------------");
  lines.push(" intersection  (present in both)");
  lines.push("--------------------------------------------------------");
  if (intersection.length === 0) {
    lines.push("  (none)");
  } else {
    for (const name of intersection) {
      const rt = remoteByName.get(name)?.runtime ?? "unknown";
      lines.push(`  - ${name}  [${rt}]`);
    }
  }
  lines.push("");

  lines.push("Interpretation:");
  lines.push("  nodejs20 on a remote_only entry = potential urgency");
  lines.push("    (Firebase Node 20 deprecation window).");
  lines.push("  nodejs22                         = no immediate urgency.");
  lines.push("  'lastDeploy: unknown' is acceptable when the CLI does");
  lines.push("  not expose the value. No per-function describe loop.");
  lines.push("");

  return lines.join("\n");
}

// ----- Main -----
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  validateProjectId(args.project);

  // Resolve index.ts relative to this script:
  //   functions/scripts/audit-remote-drift.mjs  -> ../src/index.ts
  const indexPath = resolve(__dirname, "..", "src", "index.ts");

  let localExports;
  try {
    localExports = extractLocalExports(indexPath);
  } catch (err) {
    console.error(`ERROR: failed to read ${indexPath}`);
    console.error(err.message);
    process.exit(5);
  }

  const remoteRecords = fetchRemoteFunctions(args.project);

  const report = renderReport({
    projectId: args.project,
    localExports,
    remoteRecords,
  });

  console.log(report);
}

main();
