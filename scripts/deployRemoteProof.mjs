/** Read-only remote release inspection for the staging deployer. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync, inflateRawSync } from "node:zlib";

const PROJECT = "mediexchange-staging";
const REGION = "europe-west1";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Hash the exact files in a Cloud Functions source ZIP, without extracting it. */
export function hashSourceZip(bytes) {
  const zip = Buffer.from(bytes);
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("Function source ZIP has no directory");
  const count = zip.readUInt16LE(end + 10);
  const offset = zip.readUInt32LE(end + 16);
  if (count === 0xffff || offset === 0xffffffff) throw new Error("Zip64 source archive is unsupported");
  const files = [];
  const seen = new Set();
  let p = offset;
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("Function source ZIP directory is corrupt");
    const flags = zip.readUInt16LE(p + 8);
    const method = zip.readUInt16LE(p + 10);
    const compressed = zip.readUInt32LE(p + 20);
    const uncompressed = zip.readUInt32LE(p + 24);
    const nameLength = zip.readUInt16LE(p + 28);
    const extraLength = zip.readUInt16LE(p + 30);
    const commentLength = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLength).toString("utf8");
    p += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").includes("..") || seen.has(name)) {
      throw new Error("Function source ZIP has an unsafe or duplicate path");
    }
    seen.add(name);
    if ((flags & 1) !== 0 || ![0, 8].includes(method) || zip.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error("Function source ZIP uses unsupported encryption or compression");
    }
    const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const source = zip.subarray(dataStart, dataStart + compressed);
    const content = method === 8 ? inflateRawSync(source) : source;
    if (content.length !== uncompressed) throw new Error("Function source ZIP entry size differs");
    files.push({ path: name, sha256: sha(content) });
  }
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return {
    hash: `sha256:${sha(files.map((file) => `${file.path}\0${file.sha256}`).join("\n"))}`,
    fileCount: files.length,
  };
}

/** Firebase Hosting hashes gzip(level=9) bytes, not the uncompressed file. */
export function localHostingFiles(dir) {
  const files = {};
  const walk = (base, rel = "") => {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "firebase.json") continue;
      const next = path.posix.join(rel, entry.name);
      const full = path.join(base, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Hosting symlink refused: ${next}`);
      if (entry.isDirectory()) walk(full, next);
      else if (entry.isFile()) files[`/${next}`] = sha(gzipSync(fs.readFileSync(full), { level: 9 }));
    }
  };
  walk(dir);
  if (!Object.hasOwn(files, "/index.html") || !Object.hasOwn(files, "/main.dart.js")) {
    throw new Error("Hosting build lacks index.html or main.dart.js");
  }
  return files;
}

export function compareHostingFiles(local, remote) {
  const actual = Object.fromEntries(remote
    .filter((file) => !file.path.startsWith("/__/firebase/"))
    .map((file) => [file.path, file.hash]));
  const wanted = Object.keys(local).sort();
  const got = Object.keys(actual).sort();
  if (JSON.stringify(wanted) !== JSON.stringify(got)) {
    throw new Error(`Hosting file set differs: local ${wanted.length}, remote ${got.length}`);
  }
  for (const name of wanted) {
    if (actual[name] !== local[name]) throw new Error(`Hosting file differs: ${name}`);
  }
  return { fileCount: wanted.length, hash: `sha256:${sha(wanted.map((name) => `${name}\0${local[name]}`).join("\n"))}` };
}

/** Use the source of the successful build; a configured generation of 0 means latest. */
export function resolvedFunctionSource(buildConfig) {
  const configured = buildConfig?.source?.storageSource;
  const provenance = buildConfig?.sourceProvenance?.resolvedStorageSource;
  if (provenance && configured &&
      (provenance.bucket !== configured.bucket || provenance.object !== configured.object)) {
    throw new Error("Function source provenance differs from configured source");
  }
  const source = provenance ?? configured;
  if (!source?.bucket || !source?.object ||
      !/^[1-9]\d*$/.test(String(source?.generation ?? ""))) {
    throw new Error("Function has no immutable source generation");
  }
  return { bucket: source.bucket, object: source.object, generation: String(source.generation) };
}

export function remoteClient(credential) {
  async function request(url, { json = true } = {}) {
    const token = await credential.getAccessToken();
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Remote read failed: HTTP ${response.status} for ${new URL(url).pathname}`);
    return json ? response.json() : Buffer.from(await response.arrayBuffer());
  }
  const hostingBase = "https://firebasehosting.googleapis.com/v1beta1";
  return {
    async functionSource(name) {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) throw new Error("Invalid Function name");
      const fn = await request(`https://cloudfunctions.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/functions/${name}`);
      const source = resolvedFunctionSource(fn.buildConfig);
      if (fn.name !== `projects/${PROJECT}/locations/${REGION}/functions/${name}` ||
          fn.state !== "ACTIVE" || fn.buildConfig?.runtime !== "nodejs22" ||
          !fn.serviceConfig?.revision || !/^https:\/\//.test(fn.serviceConfig?.uri ?? "")) {
        throw new Error(`Function ${name} has no verifiable source revision`);
      }
      return { name, revision: fn.serviceConfig.revision, updateTime: fn.updateTime,
        uri: fn.serviceConfig.uri, source,
        sandboxEnabled: fn.serviceConfig.environmentVariables?.SANDBOX_ENABLED ?? null };
    },
    async sourceZip(source) {
      const bucket = encodeURIComponent(source.bucket);
      const object = encodeURIComponent(source.object);
      const generation = encodeURIComponent(source.generation);
      return request(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${object}?alt=media&generation=${generation}`, { json: false });
    },
    async bucketVersioning(bucket) {
      if (!/^[A-Za-z0-9._-]+$/.test(bucket)) throw new Error("Invalid Function source bucket");
      const info = await request(`https://storage.googleapis.com/storage/v1/b/${bucket}?fields=versioning`);
      if (info.versioning?.enabled !== true) throw new Error(`Function source bucket ${bucket} does not retain previous generations`);
      return true;
    },
    async hosting(site) {
      if (!["mediexchange-staging", "mediexchange-staging-admin"].includes(site)) throw new Error("Unexpected Hosting site");
      const channel = await request(`${hostingBase}/projects/${PROJECT}/sites/${site}/channels/live`);
      const version = channel.release?.version?.name?.replace(/^projects\/[^/]+\//, "");
      if (!version?.startsWith(`sites/${site}/versions/`)) throw new Error(`Hosting ${site} has no live version`);
      const files = [];
      let page = "";
      do {
        const response = await request(`${hostingBase}/${version}/files?pageSize=1000${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`);
        files.push(...(response.files ?? []));
        page = response.nextPageToken ?? "";
      } while (page);
      return { site, version, files };
    },
    async rules() {
      const releaseName = `projects/${PROJECT}/releases/cloud.firestore`;
      const release = await request(`https://firebaserules.googleapis.com/v1/${releaseName}`);
      if (release.name !== releaseName || !release.rulesetName?.startsWith(`projects/${PROJECT}/rulesets/`)) {
        throw new Error("Firestore Rules release is unreadable");
      }
      const ruleset = await request(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
      const files = ruleset.source?.files ?? [];
      if (files.length !== 1 || files[0].name !== "firestore.rules") throw new Error("Unexpected Firestore Rules source shape");
      return { release: releaseName, ruleset: release.rulesetName, content: files[0].content };
    },
  };
}

/** Compare every deployed Function's immutable source generation with the tested payload. */
export async function inspectFunctionSet(client, names, expectedHash = null, backupDir = null) {
  const result = [];
  if (backupDir) fs.mkdirSync(backupDir, { recursive: true });
  for (let i = 0; i < names.length; i += 4) {
    const batch = await Promise.all(names.slice(i, i + 4).map(async (name) => {
      const metadata = await client.functionSource(name);
      if (expectedHash && metadata.sandboxEnabled !== "true") {
        throw new Error(`Function ${name} does not run with staging SANDBOX_ENABLED=true`);
      }
      const archive = await client.sourceZip(metadata.source);
      const artifact = hashSourceZip(archive);
      if (expectedHash && artifact.hash !== expectedHash) throw new Error(`Function ${name} source differs from tested payload`);
      if (backupDir) fs.writeFileSync(path.join(backupDir, `${name}.zip`), archive);
      return { ...metadata, artifactHash: artifact.hash, fileCount: artifact.fileCount,
        archiveSha256: sha(archive) };
    }));
    result.push(...batch);
  }
  return result.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

/** Detect a redeploy or runtime configuration change between expand and contract. */
export function compareFunctionRevisions(expanded, live) {
  if (!Array.isArray(expanded) || !Array.isArray(live) || expanded.length !== live.length) {
    throw new Error("Staging Function inventory changed since expand");
  }
  const before = new Map(expanded.map((fn) => [fn.name, fn]));
  for (const fn of live) {
    const prior = before.get(fn.name);
    if (!prior || prior.revision !== fn.revision || prior.uri !== fn.uri ||
        prior.source?.bucket !== fn.source?.bucket ||
        prior.source?.object !== fn.source?.object ||
        String(prior.source?.generation) !== String(fn.source?.generation) ||
        prior.sandboxEnabled !== fn.sandboxEnabled) {
      throw new Error(`Function ${fn.name} revision changed since expand`);
    }
  }
  return true;
}

export async function inspectHosting(client, site, localDir = null) {
  const live = await client.hosting(site);
  if (live.files.some((file) => file.status !== "ACTIVE")) throw new Error(`Hosting ${site} contains files not active`);
  const remoteMap = Object.fromEntries(live.files
    .filter((file) => !file.path.startsWith("/__/firebase/"))
    .map((file) => [file.path, file.hash]));
  if (!Object.hasOwn(remoteMap, "/index.html") || !Object.hasOwn(remoteMap, "/main.dart.js")) {
    throw new Error(`Hosting ${site} live release lacks the web bundle`);
  }
  const attestation = compareHostingFiles(localDir ? localHostingFiles(localDir) : remoteMap, live.files);
  return { site, version: live.version, files: live.files.length,
    artifactHash: attestation.hash };
}

export async function inspectRules(client, localRules = null) {
  const live = await client.rules();
  if (localRules !== null && live.content !== localRules) throw new Error("Active Firestore Rules source differs from the tested file");
  return { release: live.release, ruleset: live.ruleset, hash: `sha256:${sha(live.content)}` };
}
