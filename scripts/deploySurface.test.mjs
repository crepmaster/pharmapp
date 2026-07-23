/**
 * REQ-DEP-SURFACE-01 — no versioned surface can bypass the preflight gate.
 *
 * The earlier lots proved that "no SCRIPT deploys" is not enough: an agent
 * definition, a session-injected CLAUDE.md, or an authoritative document can
 * each carry a copyable `firebase deploy` that reaches production without ever
 * touching the gate. This suite discovers those surfaces dynamically — never a
 * fixed list — and fails if any active one carries a direct deployment.
 *
 * Archives and the ADR are deliberately exempt: they preserve the history of
 * what was removed, and their whole purpose is to still contain the old
 * wording under a non-executable banner.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

/**
 * Options that may sit between the binary and its verb — `firebase
 * --project=X deploy` is the same bypass as `firebase deploy --project=X`, and
 * a guard that only knows the second is trivially sidestepped.
 */
const OPT = String.raw`(?:\s+--?[\w:.=\/-]+)*`;

/**
 * A direct-deployment command that bypasses `npm run deploy:staging`.
 *
 * Each tolerates an `npx` prefix and options before the verb. Line
 * continuations are joined by `normalise()` before matching, so a command
 * split across lines with a trailing `\` is caught too.
 */
const DEPLOY_PATTERNS = [
  new RegExp(String.raw`(?:npx\s+)?\bfirebase\b${OPT}\s+(?:deploy|hosting:channel:deploy)\b`, "i"),
  // `firebase use` selects the project a subsequent direct deploy would hit.
  new RegExp(String.raw`(?:npx\s+)?\bfirebase\b${OPT}\s+use\b`, "i"),
  new RegExp(
    String.raw`(?:npx\s+)?\bgcloud\b${OPT}\s+(?:functions|run|app)${OPT}\s+deploy\b`,
    "i"
  ),
  // `--force` only in a DEPLOY context — not a tech-debt note like "`--force`
  // delete an orphan index". A forced deploy necessarily names the verb.
  new RegExp(String.raw`(?:firebase|gcloud)\b[^\n]*\bdeploy\b[^\n]*--force`, "i"),
];

/** Joins shell line-continuations so a split command reads as one line. */
const normalise = (text) => text.replace(/\\[ \t]*\r?\n[ \t]*/g, " ");

/** Recursively lists files under a root, or [] if it does not exist. */
function walk(root, keep) {
  const out = [];
  const rec = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) rec(abs);
      else if (keep(abs)) out.push(abs);
    }
  };
  rec(root);
  return out;
}

const offendersIn = (files) => {
  const bad = [];
  for (const f of files) {
    const text = normalise(fs.readFileSync(f, "utf8"));
    for (const rx of DEPLOY_PATTERNS) {
      if (rx.test(text)) bad.push(`${path.relative(REPO, f)} :: ${rx}`);
    }
  }
  return bad;
};

// ---------------------------------------------------------------------------

describe("REQ-DEP-SURFACE-01 — no active agent can deploy", () => {
  const AGENTS = path.join(REPO, ".claude", "agents");

  test("no active agent declares the firebase or gcloud tool", () => {
    // The capability itself is the surface: an agent that CAN reach the CLI is
    // one prompt-injection away from deploying, whatever its body says.
    const offenders = [];
    for (const f of walk(AGENTS, (p) => p.endsWith(".md"))) {
      const toolsLine = (fs.readFileSync(f, "utf8").match(/^tools:.*$/m) ?? [""])[0];
      if (/\bfirebase\b/.test(toolsLine) || /\bgcloud\b/.test(toolsLine)) {
        offenders.push(`${path.relative(REPO, f)}: ${toolsLine.trim()}`);
      }
    }
    assert.deepEqual(offenders, [], "an active agent still has firebase/gcloud in tools");
  });

  test("no active agent body contains a direct deployment command", () => {
    assert.deepEqual(offendersIn(walk(AGENTS, (p) => p.endsWith(".md"))), []);
  });

  test("the deployer agent is gone from .claude/agents and archived", () => {
    assert.equal(
      fs.existsSync(path.join(AGENTS, "pharmapp-deployer.md")),
      false,
      "the deployer agent is still loadable"
    );
    assert.ok(
      fs.existsSync(path.join(REPO, "docs", "archive", "pharmapp-deployer-AGENT-ARCHIVED.md")),
      "the archived deployer is missing"
    );
  });
});

/**
 * EVERY Markdown file in the repository, minus explicit exemptions.
 *
 * Scoping this to `docs/**` + `CLAUDE.md` was a real hole: the root
 * `README.md` and `pharmapp_unified/README.md` both document deployment and
 * both sat outside it. Discovery is now repo-wide and the exemptions are
 * stated, so a dangerous command in any other Markdown is caught.
 */
/**
 * Not documents at all — never discovered, never exempted-with-banner.
 *
 * Every entry matches a PATH COMPONENT, never a bare substring. `/node_modules/`
 * without the separators would also swallow an active document merely NAMED
 * after it — `docs/node_modules_migration_notes.md` — which would then be
 * neither scanned nor subject to the banner rule: invisible, not exempted.
 * This is the strictest of the three categories, so it must be the tightest.
 */
const NOT_DOCUMENTS = [
  /[\\/]node_modules[\\/]/,
  /[\\/]\.git[\\/]/,
  /[\\/]\.dart_tool[\\/]/,
  /[\\/]build[\\/]/,
];

/**
 * Named exemptions: historical records allowed to KEEP a forbidden command,
 * on the condition — enforced below — that they carry an explicit
 * non-executable banner.
 *
 * `flutter-backup/` is deliberately NOT here any more: its `.txt` restoration
 * guides prescribed rules and functions deployments without an explicit
 * project, and presented themselves as procedures to follow. They are now
 * bannered like any other archive.
 */
const EXEMPT = [
  /[\\/]docs[\\/]archive[\\/]/, // archives keep the history, under banners
  /[\\/]docs[\\/]adr[\\/]/, // the ADR records what was removed
  /[\\/]CLAUDE-ARCHIVE\.md$/, // declared archive, referenced from active docs
  // Path component, not substring — same reason as NOT_DOCUMENTS above. A bare
  // /flutter-backup/ would also exempt an active `docs/flutter-backup-plan.md`,
  // downgrading it from "must not contain a command" to "must carry a banner".
  /[\\/]flutter-backup[\\/]/, // historical restoration snapshot — banner required
  /[\\/]\.claude[\\/]agents[\\/]/, // agents are checked separately, above
];

/**
 * Documentation is not only Markdown. Restoration guides live in `.txt`, and
 * a `firebase deploy` is exactly as copyable there.
 */
const isDoc = (p) => /\.(md|txt)$/i.test(p);
const allDocs = () => walk(REPO, (p) => isDoc(p) && !NOT_DOCUMENTS.some((rx) => rx.test(p)));
const activeDocs = () => allDocs().filter((p) => !EXEMPT.some((rx) => rx.test(p)));

/** The phrase every non-executable banner must carry. */
const BANNER_MARKER = /NE PAS EXÉCUTER/;

describe("REQ-DEP-SURFACE-01 — no active document carries a direct deployment", () => {
  test("discovery reaches every documentation root, not just docs/", () => {
    const docs = activeDocs().map((p) => path.relative(REPO, p));
    for (const known of [
      "CLAUDE.md",
      "README.md", // was outside the old scan
      path.join("pharmapp_unified", "README.md"), // modified by this lot, was outside
      path.join("docs", "release", "STAGING_WORKFLOW.md"),
    ]) {
      assert.ok(docs.includes(known), `discovery missed ${known}`);
    }
    assert.ok(docs.length > 20, `implausibly few documents discovered: ${docs.length}`);
  });

  test("no active document contains a literal direct-deploy command", () => {
    assert.deepEqual(offendersIn(activeDocs()), [], "an active document still carries a direct deployment");
  });

  test("the archive is exempt and still holds the history", () => {
    // Proves the exemption is real: the archived deployer keeps its old
    // commands, and the guard does not fail on them.
    const archived = path.join(REPO, "docs", "archive", "pharmapp-deployer-AGENT-ARCHIVED.md");
    assert.match(fs.readFileSync(archived, "utf8"), /firebase deploy/);
    assert.deepEqual(offendersIn(activeDocs()), []); // still green despite the archive
  });

  test("exclusions match a path COMPONENT, not a name that merely contains it", () => {
    // `docs/node_modules_migration_notes.md` is an active document. A
    // substring exclusion would make it invisible: not scanned as active, and
    // not subject to the banner rule either — the worst of both categories.
    const planted = path.join(REPO, "docs", "node_modules_migration_notes.md");
    const plantedExempt = path.join(REPO, "docs", "flutter-backup-plan.md");
    fs.writeFileSync(planted, "# notes\n\nfirebase deploy --only functions\n");
    fs.writeFileSync(plantedExempt, "# plan\n\nfirebase deploy --only hosting\n");
    try {
      const active = activeDocs().map((p) => path.relative(REPO, p));
      assert.ok(
        active.includes(path.join("docs", "node_modules_migration_notes.md")),
        "a document merely NAMED node_modules was excluded from the scan"
      );
      assert.ok(
        active.includes(path.join("docs", "flutter-backup-plan.md")),
        "a document merely NAMED flutter-backup was wrongly exempted"
      );
      const offenders = offendersIn(activeDocs());
      assert.ok(offenders.some((o) => o.includes("node_modules_migration_notes")));
      assert.ok(offenders.some((o) => o.includes("flutter-backup-plan")));
    } finally {
      fs.rmSync(planted, { force: true });
      fs.rmSync(plantedExempt, { force: true });
    }
  });

  test("the real node_modules directory is still excluded", () => {
    // Tightening the boundary must not start dragging dependency trees in.
    const all = allDocs().map((p) => path.relative(REPO, p));
    const inDeps = all.filter((p) => p.split(path.sep).includes("node_modules"));
    assert.deepEqual(inDeps, [], `dependency documents were pulled into the scan: ${inDeps.length}`);
    assert.ok(all.length > 100, `implausibly few documents discovered: ${all.length}`);
  });

  test("discovery covers .txt as well as .md", () => {
    // Restoration guides live in .txt, and a copyable deployment is just as
    // dangerous there. Scanning Markdown only left them invisible.
    const all = allDocs().map((p) => path.relative(REPO, p));
    assert.ok(
      all.some((p) => p.endsWith(".txt")),
      "no .txt file discovered — the scan is Markdown-only again"
    );
    assert.ok(
      all.includes(path.join("flutter-backup", "FLUTTER_BACKUP_SUMMARY.txt")),
      "flutter-backup is no longer being discovered at all"
    );
  });
});

describe("REQ-DOC-BANNER — an exempted file keeping a forbidden command must say so", () => {
  /**
   * The exemption is a privilege, not a blind spot. A file allowed to retain a
   * `firebase deploy` must state, in its own opening lines, that it is not to
   * be executed — otherwise a reader meets a copyable production command with
   * nothing telling them it is forbidden. That was exactly the state of the
   * flutter-backup restoration guides and of CLAUDE-ARCHIVE.md.
   */
  const exemptedDocs = () => allDocs().filter((p) => EXEMPT.some((rx) => rx.test(p)));

  test("every exempted file that still carries a forbidden command has the banner", () => {
    const offenders = [];
    for (const f of exemptedDocs()) {
      const text = normalise(fs.readFileSync(f, "utf8"));
      const carries = DEPLOY_PATTERNS.some((rx) => rx.test(text));
      if (!carries) continue; // nothing forbidden inside: no banner owed
      // The banner must be at the TOP, not buried somewhere in the body.
      if (!BANNER_MARKER.test(text.slice(0, 2000))) {
        offenders.push(path.relative(REPO, f));
      }
    }
    assert.deepEqual(offenders, [], "an exempted file hides a forbidden command with no banner");
  });

  test("the check is meaningful — some exempted files really do carry commands", () => {
    // Without this, the test above would pass vacuously if discovery broke.
    const carrying = exemptedDocs().filter((f) => {
      const t = normalise(fs.readFileSync(f, "utf8"));
      return DEPLOY_PATTERNS.some((rx) => rx.test(t));
    });
    assert.ok(carrying.length >= 5, `only ${carrying.length} exempted files carry commands`);
    const rels = carrying.map((p) => path.relative(REPO, p));
    assert.ok(rels.includes("CLAUDE-ARCHIVE.md"));
    assert.ok(rels.some((p) => p.includes("flutter-backup")));
  });

  test("a planted exempted file without a banner is caught", () => {
    const planted = path.join(REPO, "docs", "archive", "_banner_probe_tmp.md");
    fs.writeFileSync(planted, "# probe\n\nfirebase deploy --only functions\n");
    try {
      const offenders = [];
      for (const f of exemptedDocs()) {
        const text = normalise(fs.readFileSync(f, "utf8"));
        if (!DEPLOY_PATTERNS.some((rx) => rx.test(text))) continue;
        if (!BANNER_MARKER.test(text.slice(0, 2000))) offenders.push(path.relative(REPO, f));
      }
      assert.ok(
        offenders.some((o) => o.includes("_banner_probe_tmp")),
        `an unbannered archive escaped the check; offenders: ${JSON.stringify(offenders)}`
      );
    } finally {
      fs.rmSync(planted, { force: true });
    }
  });
});

describe("REQ-DEP-SURFACE-01 — the guard catches a newly added surface", () => {
  test("an active doc planted with a deploy command is detected, then cleaned up", () => {
    const planted = path.join(REPO, "docs", "release", "_surface_probe_tmp.md");
    fs.writeFileSync(planted, "# probe\n\nfirebase deploy --only functions --project=mediexchange\n");
    try {
      const docs = walk(path.join(REPO, "docs"), (p) => p.endsWith(".md")).filter(
        (p) => !p.includes(`${path.sep}archive${path.sep}`) && !p.includes(`${path.sep}adr${path.sep}`)
      );
      const offenders = offendersIn(docs);
      assert.ok(
        offenders.some((o) => o.includes("_surface_probe_tmp.md")),
        `dynamic discovery missed the planted document; offenders: ${JSON.stringify(offenders)}`
      );
    } finally {
      fs.rmSync(planted, { force: true });
    }
  });

  test("an active agent planted with the firebase tool is detected, then cleaned up", () => {
    const planted = path.join(REPO, ".claude", "agents", "_probe_agent_tmp.md");
    fs.writeFileSync(planted, "---\nname: probe\ntools: git, firebase\n---\n\nbody\n");
    try {
      const toolsLines = walk(path.join(REPO, ".claude", "agents"), (p) => p.endsWith(".md")).map((f) => ({
        f,
        line: (fs.readFileSync(f, "utf8").match(/^tools:.*$/m) ?? [""])[0],
      }));
      const caught = toolsLines.some((x) => x.f.includes("_probe_agent_tmp") && /\bfirebase\b/.test(x.line));
      assert.ok(caught, "dynamic discovery missed the planted agent");
    } finally {
      fs.rmSync(planted, { force: true });
    }
  });
});

describe("REQ-PROJECT-EXPLICIT-01 — every quoted preflight names its project", () => {
  /**
   * Finds each `npm run deploy:staging …` invocation in the active docs and
   * returns its arguments. Reading only CLAUDE.md was not enough: a doc could
   * introduce `npm run deploy:staging -- preflight` with no project, or a
   * different one, and stay green.
   */
  const invocations = () => {
    const found = [];
    for (const f of activeDocs()) {
      const text = normalise(fs.readFileSync(f, "utf8"));
      for (const m of text.matchAll(/npm run deploy:staging([^\n`]*)/g)) {
        found.push({ file: path.relative(REPO, f), args: m[1].trim() });
      }
    }
    return found;
  };

  test("the canonical invocation appears and is discovered", () => {
    const all = invocations();
    assert.ok(all.length > 0, "no preflight invocation found in the active documentation");
    assert.ok(
      all.some((i) => i.file === "CLAUDE.md"),
      "CLAUDE.md no longer documents the sanctioned command"
    );
  });

  test("each invocation is preflight, with exactly one --project, staging only", () => {
    const offenders = [];
    for (const { file, args } of invocations()) {
      // A bare `npm run deploy:staging` with no arguments at all is a
      // reference in prose, not a prescribed command.
      if (args === "" || args.startsWith("`")) continue;

      const projects = [...args.matchAll(/--project=([\w-]+)/g)].map((m) => m[1]);
      if (!/(^|\s)--\s+preflight(\s|$)/.test(args)) {
        offenders.push(`${file}: phase is not exactly 'preflight' → "${args}"`);
      }
      if (projects.length !== 1) {
        offenders.push(`${file}: expected exactly one --project, got ${projects.length} → "${args}"`);
      } else if (projects[0] !== "mediexchange-staging") {
        offenders.push(`${file}: targets ${projects[0]}, not mediexchange-staging`);
      }
      // No argument may smuggle in a phase that is not implemented.
      for (const closed of ["expand", "contract", "verify"]) {
        if (new RegExp(String.raw`(^|\s)${closed}(\s|$)`).test(args)) {
          offenders.push(`${file}: names the closed phase '${closed}' → "${args}"`);
        }
      }
    }
    assert.deepEqual(offenders, [], "a documented preflight invocation is unsafe");
  });

  test("a planted invocation without a project is caught", () => {
    const planted = path.join(REPO, "docs", "release", "_preflight_probe_tmp.md");
    fs.writeFileSync(planted, "# probe\n\n    npm run deploy:staging -- preflight\n");
    try {
      const bad = invocations().filter((i) => i.file.includes("_preflight_probe_tmp"));
      assert.equal(bad.length, 1, "discovery missed the planted invocation");
      assert.equal(/--project=/.test(bad[0].args), false);
    } finally {
      fs.rmSync(planted, { force: true });
    }
  });

  test("a planted invocation targeting production is caught", () => {
    const planted = path.join(REPO, "docs", "release", "_preflight_prod_probe_tmp.md");
    fs.writeFileSync(planted, "    npm run deploy:staging -- preflight --project=mediexchange\n");
    try {
      const bad = invocations().find((i) => i.file.includes("_preflight_prod_probe_tmp"));
      assert.ok(bad, "discovery missed the planted production invocation");
      assert.match(bad.args, /--project=mediexchange(?!-staging)/);
    } finally {
      fs.rmSync(planted, { force: true });
    }
  });
});

describe("REQ-DEP-SURFACE-01 — evasive command forms are still caught", () => {
  const caught = (text) => {
    const t = normalise(text);
    return DEPLOY_PATTERNS.some((rx) => rx.test(t));
  };

  test("an option placed BEFORE the verb is caught", () => {
    assert.ok(caught("firebase --project=mediexchange deploy --only functions"));
    assert.ok(caught("gcloud --project=mediexchange functions deploy fn"));
  });

  test("an npx prefix is caught", () => {
    assert.ok(caught("npx firebase deploy --only functions"));
  });

  test("a command split over lines with a continuation is caught", () => {
    assert.ok(caught("firebase \\\n  deploy --only functions"));
    assert.ok(caught("firebase \\\n  --project=x \\\n  deploy"));
  });

  test("a forced deploy is caught", () => {
    assert.ok(caught("firebase deploy --only functions --force"));
  });

  test("innocent text is NOT caught — the guard must not cry wolf", () => {
    // Prose about deployment, a tech-debt `--force` note, and unrelated
    // Firebase verbs must all pass, or the guard gets disabled by attrition.
    assert.equal(caught("Deployments go through the single supported entry point."), false);
    assert.equal(caught("décider re-add source ou `--force` delete"), false);
    assert.equal(caught("firebase apps:sdkconfig web --project=mediexchange-staging"), false);
    assert.equal(caught("npm run deploy:staging -- preflight --project=mediexchange-staging"), false);
  });

  test("a planted .txt with a dangerous instruction is caught", () => {
    // The blind spot that closed this lot: `flutter-backup/*.txt` prescribed
    // rules and functions deployments without an explicit project, and the
    // Markdown-only scan never saw them.
    const planted = path.join(REPO, "docs", "release", "_txt_probe_tmp.txt");
    fs.writeFileSync(planted, "RESTORE STEPS\n\n  firebase deploy --only firestore:rules\n");
    try {
      const offenders = offendersIn(activeDocs());
      assert.ok(
        offenders.some((o) => o.includes("_txt_probe_tmp.txt")),
        `a .txt instruction escaped the guard; offenders: ${JSON.stringify(offenders)}`
      );
    } finally {
      fs.rmSync(planted, { force: true });
    }
  });

  test("a planted document using an evasive form is caught end to end", () => {
    const planted = path.join(REPO, "docs", "release", "_evasive_probe_tmp.md");
    fs.writeFileSync(planted, "```bash\nnpx firebase \\\n  --project=mediexchange \\\n  deploy --only functions\n```\n");
    try {
      const offenders = offendersIn(activeDocs());
      assert.ok(
        offenders.some((o) => o.includes("_evasive_probe_tmp")),
        `evasive form escaped the guard; offenders: ${JSON.stringify(offenders)}`
      );
    } finally {
      fs.rmSync(planted, { force: true });
    }
  });
});
