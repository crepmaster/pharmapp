/**
 * Tests for the Functions artefact hash.
 *
 * Built on a synthetic tree so the properties are provable in isolation: same
 * content in a different directory hashes the same, every kind of mutation
 * changes it, and an excluded file never does.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createRequire } from "node:module";

import {
  hashFunctionsArtifact,
  collectPackagedFiles,
  functionsIgnoreGlobs,
  SYMLINK_CYCLE_CODE,
  SymlinkCycleError,
} from "./deployArtifact.mjs";

const require = createRequire(import.meta.url);

/** Whether this machine can create symlinks (Windows may forbid it). */
function symlinksSupported() {
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), "symprobe-"));
  try {
    fs.symlinkSync(path.join(probe, "t"), path.join(probe, "l"));
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(probe, { recursive: true, force: true });
  }
}
const SYMLINKS = symlinksSupported();

const GLOBS = functionsIgnoreGlobs({ functions: { source: "functions" } });

let a;
let b;
beforeEach(() => {
  a = fs.mkdtempSync(path.join(os.tmpdir(), "artefact-a-"));
  b = fs.mkdtempSync(path.join(os.tmpdir(), "artefact-b-"));
});
afterEach(() => {
  fs.rmSync(a, { recursive: true, force: true });
  fs.rmSync(b, { recursive: true, force: true });
});

/** Writes a nested file, creating parents. */
const put = (root, rel, content) => {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
};

/** A representative packaged tree: built output, source, manifest. */
const seed = (root) => {
  put(root, "package.json", '{"main":"lib/index.js"}');
  put(root, "lib/index.js", "exports.x = 1;");
  put(root, "lib/nested/util.js", "module.exports = {};");
  put(root, "src/index.ts", "export const x = 1;");
};

describe("the effective ignore set mirrors Firebase's own", () => {
  test("default config yields node_modules, .git and the three appended patterns", () => {
    assert.deepEqual(functionsIgnoreGlobs({}), [
      "node_modules",
      ".git",
      "firebase-debug.log",
      "firebase-debug.*.log",
      ".runtimeconfig.json",
    ]);
  });

  test("a configured ignore list is honoured, with the three still appended", () => {
    const globs = functionsIgnoreGlobs({ functions: { ignore: ["node_modules", ".git", "lib"] } });
    assert.ok(globs.includes("lib"));
    assert.ok(globs.includes(".runtimeconfig.json"));
  });
});

describe("REQ-HASH — the hash is content, not location or metadata", () => {
  test("identical trees in different directories hash the same", () => {
    seed(a);
    seed(b);
    assert.equal(hashFunctionsArtifact(a, GLOBS).hash, hashFunctionsArtifact(b, GLOBS).hash);
  });

  test("the hash has the declared shape", () => {
    seed(a);
    assert.match(hashFunctionsArtifact(a, GLOBS).hash, /^sha256:[0-9a-f]{64}$/);
  });

  test("mtimes do not affect the hash", () => {
    seed(a);
    const before = hashFunctionsArtifact(a, GLOBS).hash;
    const old = new Date("2000-01-01T00:00:00Z");
    fs.utimesSync(path.join(a, "lib/index.js"), old, old);
    assert.equal(hashFunctionsArtifact(a, GLOBS).hash, before);
  });

  test("enumeration order does not affect the hash", () => {
    // Create the two trees with the files added in opposite order; the sort
    // inside collectPackagedFiles must erase the difference.
    put(a, "z.js", "z");
    put(a, "a.js", "a");
    put(a, "m.js", "m");
    put(b, "a.js", "a");
    put(b, "m.js", "m");
    put(b, "z.js", "z");
    assert.equal(hashFunctionsArtifact(a, GLOBS).hash, hashFunctionsArtifact(b, GLOBS).hash);
  });
});

describe("REQ-HASH — every packaged-file mutation is detected", () => {
  test("editing a file changes the hash", () => {
    seed(a);
    const before = hashFunctionsArtifact(a, GLOBS).hash;
    fs.writeFileSync(path.join(a, "lib/index.js"), "exports.x = 2;");
    assert.notEqual(hashFunctionsArtifact(a, GLOBS).hash, before);
  });

  test("adding a file changes the hash", () => {
    seed(a);
    const before = hashFunctionsArtifact(a, GLOBS).hash;
    put(a, "lib/extra.js", "// new");
    assert.notEqual(hashFunctionsArtifact(a, GLOBS).hash, before);
  });

  test("deleting a file changes the hash", () => {
    seed(a);
    const before = hashFunctionsArtifact(a, GLOBS).hash;
    fs.rmSync(path.join(a, "lib/nested/util.js"));
    assert.notEqual(hashFunctionsArtifact(a, GLOBS).hash, before);
  });

  test("renaming a file changes the hash, even with identical content", () => {
    // The path is part of each hashed record precisely so a move is not
    // invisible: a file that lands under a different name deploys differently.
    seed(a);
    const before = hashFunctionsArtifact(a, GLOBS).hash;
    fs.renameSync(path.join(a, "lib/index.js"), path.join(a, "lib/main.js"));
    assert.notEqual(hashFunctionsArtifact(a, GLOBS).hash, before);
  });
});

describe("REQ-HASH — excluded files never affect the hash", () => {
  test("node_modules at the root is ignored", () => {
    seed(a);
    const before = hashFunctionsArtifact(a, GLOBS).hash;
    put(a, "node_modules/left-pad/index.js", "module.exports = () => {};");
    assert.equal(hashFunctionsArtifact(a, GLOBS).hash, before);
  });

  test("a NESTED node_modules is ignored too (matchBase semantics)", () => {
    // Firebase matches the basename at any depth; a package's own vendored
    // deps must not enter the hash any more than the top-level ones.
    seed(a);
    const before = hashFunctionsArtifact(a, GLOBS).hash;
    put(a, "lib/vendor/node_modules/x/i.js", "x");
    assert.equal(hashFunctionsArtifact(a, GLOBS).hash, before);
  });

  test(".git, debug logs and .runtimeconfig.json are ignored", () => {
    seed(a);
    const before = hashFunctionsArtifact(a, GLOBS).hash;
    put(a, ".git/HEAD", "ref: refs/heads/main");
    put(a, "firebase-debug.log", "noise");
    put(a, "firebase-debug.42.log", "more noise"); // matches firebase-debug.*.log
    put(a, ".runtimeconfig.json", "{}");
    assert.equal(hashFunctionsArtifact(a, GLOBS).hash, before);
  });

  test("a file that merely resembles an excluded name is still hashed", () => {
    // `node_modules_backup` is not `node_modules`; excluding it would drop a
    // real payload file. Proves the matcher anchors, not substring-matches.
    seed(a);
    const before = hashFunctionsArtifact(a, GLOBS).hash;
    put(a, "lib/node_modules_notes.js", "// a real source file");
    assert.notEqual(hashFunctionsArtifact(a, GLOBS).hash, before);
  });
});

describe("REQ-HASH — symlinks are followed, exactly as Firebase Functions does", () => {
  // prepareFunctionsUpload walks the source WITHOUT ignoreSymlinks, so Firebase
  // classifies a link by its target and packages what it points at. Skipping
  // links would make the hash omit files that actually deploy. These tests use
  // firebase-tools' own readdirRecursive as the oracle wherever they can.
  const oracle = SYMLINKS
    ? require("../tools/deploy/node_modules/firebase-tools/lib/fsAsync.js").readdirRecursive
    : null;

  const fbSet = async (root) =>
    (await oracle({ path: root, ignoreStrings: [] }))
      .map((f) => path.relative(root, f.name).split(path.sep).join("/"))
      .sort();
  const mySet = (root) => collectPackagedFiles(root, []).map((f) => f.path).sort();

  test("a symlink to a file is included under the link's path", { skip: !SYMLINKS }, async () => {
    put(a, "real.js", "content");
    fs.symlinkSync(path.join(a, "real.js"), path.join(a, "link.js"));
    const set = mySet(a);
    assert.ok(set.includes("link.js"), "the link was not followed");
    assert.ok(set.includes("real.js"));
    assert.deepEqual(set, await fbSet(a)); // identical to Firebase
  });

  test("a symlink to a directory is walked recursively", { skip: !SYMLINKS }, async () => {
    put(a, "target/inside.js", "x");
    put(a, "target/deep/more.js", "y");
    fs.symlinkSync(path.join(a, "target"), path.join(a, "linkdir"), "dir");
    const set = mySet(a);
    assert.ok(set.includes("linkdir/inside.js"));
    assert.ok(set.includes("linkdir/deep/more.js"));
    assert.deepEqual(set, await fbSet(a));
  });

  test("two aliases to the same target are BOTH included (not deduped)", { skip: !SYMLINKS }, async () => {
    // The reason for a per-branch ancestor stack rather than a global visited
    // set: a global set would drop the second alias, but Firebase packages the
    // files under both relative paths.
    put(a, "shared/x.js", "x");
    fs.symlinkSync(path.join(a, "shared"), path.join(a, "aliasA"), "dir");
    fs.symlinkSync(path.join(a, "shared"), path.join(a, "aliasB"), "dir");
    const set = mySet(a);
    assert.ok(set.includes("aliasA/x.js"));
    assert.ok(set.includes("aliasB/x.js"));
    assert.ok(set.includes("shared/x.js"));
    assert.deepEqual(set, await fbSet(a));
  });

  test("a symlink escaping functions/ is still followed (Firebase would send it)", { skip: !SYMLINKS }, () => {
    put(b, "outside.js", "external payload");
    fs.symlinkSync(path.join(b, "outside.js"), path.join(a, "linked-outside.js"));
    assert.ok(mySet(a).includes("linked-outside.js"));
  });

  test("a DIRECT cycle is refused fast, with a structured code", { skip: !SYMLINKS }, () => {
    put(a, "real.js", "x");
    // a/loop -> a
    fs.symlinkSync(a, path.join(a, "loop"), "dir");
    assert.throws(
      () => collectPackagedFiles(a, []),
      (e) => e.code === SYMLINK_CYCLE_CODE && /loop/.test(e.relPath)
    );
  });

  test("an INDIRECT cycle is refused too", { skip: !SYMLINKS }, () => {
    // a/one/two -> a/one
    put(a, "one/file.js", "x");
    fs.symlinkSync(path.join(a, "one"), path.join(a, "one", "two"), "dir");
    assert.throws(() => collectPackagedFiles(a, []), (e) => e.code === SYMLINK_CYCLE_CODE);
  });
});

describe("REQ-HASH — cycle detection is provable without symlink privileges", () => {
  // A fully injected filesystem, so the termination guarantee holds on every
  // machine, not only where real symlinks can be created. It also proves the
  // walk stops after a BOUNDED number of reads rather than looping.
  //
  // Model: root contains dir "a"; "a" contains dir "b"; realpath("a/b")
  // resolves back to realpath("a") — a cycle. Every access is counted.
  const buildCyclicIo = () => {
    const R = { "/fn": ["a"], "/fn/a": ["b"], "/fn/a/b": ["x"] };
    const reads = { readdir: 0, stat: 0 };
    const dirent = (name, isDir) => ({
      name,
      isSymbolicLink: () => false,
      isDirectory: () => isDir,
      isFile: () => !isDir,
    });
    return {
      reads,
      io: {
        readdirSync: (p) => {
          reads.readdir++;
          if (reads.readdir > 1000) throw new Error("INFINITE LOOP — walk did not terminate");
          const names = R[p.split(path.sep).join("/")] ?? [];
          return names.map((n) => dirent(n, n !== "x"));
        },
        statSync: (p) => {
          reads.stat++;
          const rel = p.split(path.sep).join("/");
          return { isDirectory: () => rel.endsWith("a") || rel.endsWith("b"), isFile: () => rel.endsWith("x") };
        },
        // The cycle: functions root, "a" and "a/b" all resolve to the same
        // real directory.
        realpathSync: (p) => {
          const rel = p.split(path.sep).join("/");
          if (rel.endsWith("/a/b") || rel.endsWith("/a")) return "/real/a";
          return "/real/root";
        },
        readFileSync: () => Buffer.from(""),
      },
    };
  };

  test("an injected cycle throws the structured error and never loops", () => {
    const { io, reads } = buildCyclicIo();
    assert.throws(
      () => collectPackagedFiles("/fn", [], io),
      (e) => e instanceof SymlinkCycleError && e.code === SYMLINK_CYCLE_CODE
    );
    // Terminated quickly: a loop would have blown the 1000-read guard.
    assert.ok(reads.readdir < 10, `walk did ${reads.readdir} readdir calls before stopping`);
  });

  test("hashFunctionsArtifact propagates the cycle rather than returning a partial hash", () => {
    const { io } = buildCyclicIo();
    assert.throws(() => hashFunctionsArtifact("/fn", [], io), (e) => e.code === SYMLINK_CYCLE_CODE);
  });
});

describe("collectPackagedFiles — the record behind the hash", () => {
  test("paths are relative and forward-slashed, and the list is sorted", () => {
    seed(a);
    const files = collectPackagedFiles(a, GLOBS);
    const paths = files.map((f) => f.path);
    assert.deepEqual(paths, [...paths].sort());
    for (const p of paths) {
      assert.equal(path.isAbsolute(p), false, `${p} is absolute`);
      assert.equal(p.includes("\\"), false, `${p} contains a backslash`);
    }
    assert.ok(paths.includes("lib/nested/util.js"));
  });
});
