/**
 * deployLock — mutual exclusion for deployments.
 *
 * Separate from `deployChecks.mjs` because acquisition touches the
 * filesystem and cannot be a pure verdict: the decision and the claim have
 * to happen in ONE operation, or two processes both observe an absent lock
 * and both proceed.
 *
 * `wx` is what makes that atomic — the OS refuses to create a file that
 * already exists, so exactly one caller wins the race. A read-then-write
 * would leave a window in which the second process overwrites the first
 * one's claim and two deployments interleave Functions and Rules.
 *
 * Ownership is a UUID, not a pid. Pids are reused by the operating system,
 * so a stale lock can name a pid that now belongs to an unrelated live
 * process — and an operator checking "is 4242 still running?" would get a
 * misleading yes. The UUID identifies the RUN, and only the run that minted
 * it may delete its own lock.
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

function refuse(code, message) {
  return { ok: false, code, message };
}

/** Fields a well-formed lock must carry. */
const REQUIRED_FIELDS = ["uuid", "phase", "pid", "hostname", "gitSha", "startedAtMs"];

export function readLock(lockPath) {
  if (!fs.existsSync(lockPath)) return null;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    // Unreadable must still block — never treated as absent.
    return { malformed: true, reason: "unparseable" };
  }
  const missing = REQUIRED_FIELDS.filter(
    (f) => parsed?.[f] === undefined || parsed?.[f] === null || parsed?.[f] === ""
  );
  if (missing.length || !Number.isFinite(Number(parsed.startedAtMs))) {
    // An incomplete lock is as untrustworthy as an unparseable one: we cannot
    // say who holds it, so we cannot say it is safe to remove.
    return { malformed: true, reason: `missing ${missing.join(", ") || "valid startedAtMs"}` };
  }
  return parsed;
}

function describe(lock) {
  if (!lock) return "none";
  if (lock.malformed) return `malformed (${lock.reason})`;
  return (
    `phase '${lock.phase}', uuid ${lock.uuid}, pid ${lock.pid}, ` +
    `host ${lock.hostname}, sha ${String(lock.gitSha).slice(0, 8)}`
  );
}

/**
 * Claims the lock atomically. Returns a verdict; never throws on contention.
 * On success the verdict carries the `uuid` the caller must present to
 * release it.
 */
export function acquireLock(lockPath, { phase, pid, hostname, gitSha, nowMs, uuid = randomUUID() }) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const payload =
    JSON.stringify({ uuid, phase, pid, hostname, gitSha, startedAtMs: nowMs }, null, 2) + "\n";
  try {
    // `wx` = create-exclusive: fails with EEXIST rather than overwriting.
    fs.writeFileSync(lockPath, payload, { flag: "wx" });
    return { ok: true, acquired: true, uuid };
  } catch (e) {
    if (e && e.code === "EEXIST") {
      const holder = readLock(lockPath);
      const age =
        holder && !holder.malformed && Number.isFinite(Number(holder.startedAtMs))
          ? `${Math.round((nowMs - Number(holder.startedAtMs)) / 1000)}s ago`
          : "at an unknown time";
      return refuse(
        "DEPLOY_IN_PROGRESS",
        `Another deployment claimed the lock first — ${describe(holder)}, ` +
          `started ${age}.`
      );
    }
    return refuse("LOCK_UNWRITABLE", `Could not create the lock: ${e.message}`);
  }
}

/**
 * Releases a lock the caller owns.
 *
 * Re-reads before deleting and compares the UUID: between acquisition and
 * release the file may have been replaced by a manual recovery, and deleting
 * it then would silently strip a different run's protection.
 *
 * A controlled failure releases the lock; a crash cannot, which is
 * deliberate — an abandoned lock is a question for a human, not something to
 * clear on a timer.
 */
export function releaseOwnLock(lockPath, uuid) {
  const lock = readLock(lockPath);
  if (!lock) return { ok: true, released: false, reason: "already absent" };
  if (lock.malformed) {
    return refuse(
      "RELEASE_LOCK_MALFORMED",
      "The lock file changed and can no longer be read; refusing to delete a " +
        "file whose owner is unknown."
    );
  }
  if (lock.uuid !== uuid) {
    return refuse(
      "RELEASE_NOT_OWNER",
      `This run holds ${uuid} but the lock is now held by ${lock.uuid}. ` +
        `Leaving it untouched.`
    );
  }
  fs.rmSync(lockPath, { force: true });
  return { ok: true, released: true };
}

/**
 * Manual recovery. Requires the operator to name the exact UUID.
 *
 * Printing the owner and deleting in the same breath is how someone kills a
 * live deployment by reflex. Naming the UUID forces them to have read what
 * they are about to destroy — and a UUID, unlike a pid, cannot be guessed or
 * accidentally correct.
 */
export function releaseLockManually(lockPath, { confirmUuid } = {}) {
  const lock = readLock(lockPath);
  if (!lock) return { ok: true, released: false, message: "No deployment lock present." };

  if (lock.malformed) {
    if (confirmUuid !== "malformed") {
      return refuse(
        "RELEASE_NEEDS_CONFIRMATION",
        `The lock file exists but is ${lock.reason}, so its owner is unknown.\n` +
          `Once you are certain no deployment is running, clear it with ` +
          `\`--release-lock --confirm-uuid=malformed\`.`
      );
    }
    fs.rmSync(lockPath, { force: true });
    return { ok: true, released: true, lock };
  }

  if (confirmUuid === undefined) {
    return refuse(
      "RELEASE_NEEDS_CONFIRMATION",
      `Lock held by ${describe(lock)}.\n` +
        `If that run is really dead, release it with ` +
        `\`--release-lock --confirm-uuid=${lock.uuid}\`.`
    );
  }
  if (String(confirmUuid) !== String(lock.uuid)) {
    return refuse(
      "RELEASE_UUID_MISMATCH",
      `--confirm-uuid=${confirmUuid} does not match the holder (${lock.uuid}). ` +
        `Refusing: you may be looking at a different run than the one you mean ` +
        `to clear.`
    );
  }
  fs.rmSync(lockPath, { force: true });
  return { ok: true, released: true, lock };
}
