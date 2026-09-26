import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { hashSourceZip, localHostingFiles, compareHostingFiles, compareFunctionRevisions,
  resolvedFunctionSource } from "./deployRemoteProof.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");

function zipFile(name, data, method = 8) {
  const bytes = Buffer.from(data);
  const packed = method === 8 ? deflateRawSync(bytes) : bytes;
  const filename = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(bytes.length, 22);
  local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(bytes.length, 24);
  central.writeUInt16LE(filename.length, 28);
  const first = Buffer.concat([local, filename, packed]);
  const directory = Buffer.concat([central, filename]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(first.length, 16);
  return Buffer.concat([first, directory, end]);
}

describe("deployed Function source archive", () => {
  test("hashes the uncompressed packaged file set, regardless of ZIP compression", () => {
    const canonical = `lib/index.js\0${sha("export const health = 1;")}`;
    const expected = `sha256:${sha(canonical)}`;
    assert.equal(hashSourceZip(zipFile("lib/index.js", "export const health = 1;", 8)).hash, expected);
    assert.equal(hashSourceZip(zipFile("lib/index.js", "export const health = 1;", 0)).hash, expected);
  });
  test("refuses path traversal and a corrupt archive", () => {
    assert.throws(() => hashSourceZip(zipFile("../escape", "bad")), /unsafe/);
    assert.throws(() => hashSourceZip(Buffer.from("not a ZIP")), /no directory/);
  });
});

describe("deployed Hosting file set", () => {
  test("requires every build file to match the remote gzip SHA256", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hosting-proof-"));
    try {
      fs.writeFileSync(path.join(dir, "index.html"), "<html>demo</html>");
      fs.writeFileSync(path.join(dir, "main.dart.js"), "compiled bundle");
      fs.writeFileSync(path.join(dir, ".last_build_id"), "ignored");
      const local = localHostingFiles(dir);
      assert.deepEqual(Object.keys(local).sort(), ["/index.html", "/main.dart.js"]);
      const remote = Object.entries(local).map(([file, hash]) => ({ path: file, hash }));
      remote.push({ path: "/__/firebase/init.js", hash: "managed" });
      assert.equal(compareHostingFiles(local, remote).fileCount, 2);
      assert.throws(() => compareHostingFiles(local, remote.filter((file) => file.path !== "/main.dart.js")), /file set differs/);
      assert.throws(() => compareHostingFiles(local, remote.map((file) => file.path === "/main.dart.js" ? { ...file, hash: "wrong" } : file)), /main\.dart\.js/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test("contract refuses changed Function revision or source generation", () => {
  const original = [{ name: "health", revision: "rev-1", uri: "https://example.test/health",
    source: { bucket: "source", object: "health.zip", generation: "1" }, sandboxEnabled: "true" }];
  assert.equal(compareFunctionRevisions(original, structuredClone(original)), true);
  assert.throws(() => compareFunctionRevisions(original, [{ ...original[0], revision: "rev-2" }]), /revision changed/);
  assert.throws(() => compareFunctionRevisions(original, [{ ...original[0], source: { ...original[0].source, generation: "2" } }]), /revision changed/);
  assert.throws(() => compareFunctionRevisions(original, [{ ...original[0], sandboxEnabled: "false" }]), /revision changed/);
});

test("Function source attestation resolves generation 0 from successful build provenance", () => {
  const configured = { bucket: "source-bucket", object: "health.zip", generation: "0" };
  assert.deepEqual(resolvedFunctionSource({ source: { storageSource: configured },
    sourceProvenance: { resolvedStorageSource: { ...configured, generation: "123" } } }),
  { ...configured, generation: "123" });
  assert.throws(() => resolvedFunctionSource({ source: { storageSource: configured } }), /immutable source generation/);
  assert.throws(() => resolvedFunctionSource({ source: { storageSource: configured },
    sourceProvenance: { resolvedStorageSource: { ...configured, bucket: "other", generation: "123" } } }),
  /provenance differs/);
});
