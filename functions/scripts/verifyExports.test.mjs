/**
 * Tests for the deployment barrier itself.
 *
 * A guard that cannot fail guards nothing. These prove each check actually
 * refuses the state it exists to catch — the manual demonstrations that
 * justified this script would otherwise vanish with the session.
 *
 * Run with Node's built-in runner (`node --test`) rather than Jest: the
 * barrier is plain ESM by design — it must run before anything is compiled,
 * so it cannot depend on the TypeScript build it is verifying.
 *
 * Every case uses a throwaway fixture under the OS temp directory. The
 * barrier must never mutate the real `src` or `lib`: doing so would corrupt
 * the tree it exists to protect.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyArtefact, exportedNames } from "./verifyExports.mjs";

let root;

function makeFixture() {
  const srcDir = path.join(root, "src");
  const libDir = path.join(root, "lib");
  fs.mkdirSync(srcDir, { recursive: true });
  fs.mkdirSync(libDir, { recursive: true });
  fs.mkdirSync(path.join(srcDir, "__tests__"), { recursive: true });

  fs.writeFileSync(
    path.join(srcDir, "index.ts"),
    'export { alpha } from "./alpha.js";\nexport { beta } from "./beta.js";\n'
  );
  fs.writeFileSync(path.join(srcDir, "alpha.ts"), "export const alpha = 1;\n");
  fs.writeFileSync(path.join(srcDir, "beta.ts"), "export const beta = 2;\n");

  fs.writeFileSync(
    path.join(libDir, "index.js"),
    'export { alpha } from "./alpha.js";\nexport { beta } from "./beta.js";\n'
  );
  fs.writeFileSync(path.join(libDir, "alpha.js"), "export const alpha = 1;\n");
  fs.writeFileSync(path.join(libDir, "beta.js"), "export const beta = 2;\n");

  // The build happened after the sources were written.
  const later = new Date(Date.now() + 5000);
  for (const f of ["index.js", "alpha.js", "beta.js"]) {
    fs.utimesSync(path.join(libDir, f), later, later);
  }
  return { srcDir, libDir };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "verify-exports-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("verifyArtefact — the coherent case", () => {
  test("a complete, freshly built artefact passes", () => {
    const { srcDir, libDir } = makeFixture();
    const r = verifyArtefact({ srcDir, libDir });
    assert.deepEqual(r.problems, []);
    assert.equal(r.ok, true);
    assert.equal(r.exports, 2);
  });
});

describe("verifyArtefact — each failure mode is caught", () => {
  test("FRESHNESS: a source newer than lib fails, and names the file", () => {
    // The exact shape of the 2026-07-21 incident.
    const { srcDir, libDir } = makeFixture();
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(srcDir, "alpha.ts"), future, future);

    const r = verifyArtefact({ srcDir, libDir });
    assert.equal(r.ok, false);
    assert.match(r.problems.join("\n"), /FRESHNESS/);
    assert.match(r.problems.join("\n"), /alpha\.ts/);
  });

  test("EXPORTS: a symbol missing from lib/index.js fails, and names it", () => {
    const { srcDir, libDir } = makeFixture();
    fs.writeFileSync(
      path.join(libDir, "index.js"),
      'export { alpha } from "./alpha.js";\n' // beta never compiled
    );
    const r = verifyArtefact({ srcDir, libDir });
    assert.equal(r.ok, false);
    assert.match(r.problems.join("\n"), /EXPORTS/);
    assert.match(r.problems.join("\n"), /beta/);
  });

  test("RESOLVE: a re-exported module that does not exist fails", () => {
    const { srcDir, libDir } = makeFixture();
    fs.rmSync(path.join(libDir, "beta.js"));
    const r = verifyArtefact({ srcDir, libDir });
    assert.equal(r.ok, false);
    assert.match(r.problems.join("\n"), /RESOLVE/);
    assert.match(r.problems.join("\n"), /\.\/beta\.js/);
  });

  test("MISSING: no lib/index.js at all fails loudly", () => {
    const { srcDir, libDir } = makeFixture();
    fs.rmSync(path.join(libDir, "index.js"));
    const r = verifyArtefact({ srcDir, libDir });
    assert.equal(r.ok, false);
    assert.match(r.problems[0], /MISSING/);
  });
});

describe("verifyArtefact — what must NOT trigger a failure", () => {
  test("editing a test file after the build is not a stale build", () => {
    // Tests are not emitted in the deployed shape. Counting them would make
    // the barrier cry wolf on every test change, and a barrier that cries
    // wolf gets bypassed.
    const { srcDir, libDir } = makeFixture();
    const testFile = path.join(srcDir, "__tests__", "alpha.test.ts");
    fs.writeFileSync(testFile, "test('x', () => {});\n");
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(testFile, future, future);

    const r = verifyArtefact({ srcDir, libDir });
    assert.deepEqual(r.problems, []);
    assert.equal(r.ok, true);
  });
});

describe("exportedNames — the parser the checks rely on", () => {
  test("reads re-exports, aliases and direct declarations", () => {
    const names = exportedNames(
      [
        'export { a, b as c } from "./x.js";',
        "export const d = 1;",
        "export function e() {}",
        "export class F {}",
      ].join("\n")
    );
    assert.deepEqual([...names].sort(), ["F", "a", "c", "d", "e"]);
  });
});
