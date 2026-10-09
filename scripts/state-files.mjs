import { createHash, randomUUID } from "node:crypto";
import { createReadStream, constants } from "node:fs";
import * as fs from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { hostname } from "node:os";
import { spawnSync } from "node:child_process";

export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
export const sidecar = (path, name) =>
  join(dirname(path), `.${basename(path)}.agent-${name}`);

export async function exists(path) {
  try {
    await fs.lstat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

/** Resolve existing ancestors too, so aliases cannot bypass overlap/lock checks. */
export async function canonical(path) {
  path = resolve(path);
  try {
    return await fs.realpath(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return join(await canonical(dirname(path)), basename(path));
  }
}

export function separate(a, b) {
  const contains = (parent, child) => {
    const path = relative(parent, child);
    return (
      !path ||
      (!path.startsWith(`..${sep}`) && path !== ".." && !path.startsWith(sep))
    );
  };
  if (contains(a, b) || contains(b, a))
    throw new Error(
      "Source and destination must be separate, non-nested directories",
    );
}

export async function writeJson(path, value, flag = "wx") {
  const file = await fs.open(path, flag, 0o600);
  try {
    await file.writeFile(JSON.stringify(value, null, 2) + "\n");
    await file.sync();
  } finally {
    await file.close();
  }
}

export async function syncDirectory(path) {
  const directory = await fs.open(path, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

/** Managed dev, backup and restore share this exclusive lease. Never steal a stale lease. */
export async function lease(path, operation, fn) {
  await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const lock = sidecar(path, "lock");
  try {
    await fs.mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(
        `Local state is locked: ${lock}. Stop its owner first; after a crash, follow docs/local-recovery.md.`,
      );
    throw error;
  }
  const token = randomUUID();
  let initialized = false;
  try {
    await writeJson(join(lock, "owner.json"), {
      pid: process.pid,
      host: hostname(),
      operation,
      token,
      startedAt: new Date().toISOString(),
    });
    initialized = true;
    return await fn();
  } finally {
    // Only remove this invocation's own coordination files, never state/backups.
    const owner =
      initialized &&
      JSON.parse(await fs.readFile(join(lock, "owner.json"), "utf8"));
    if (owner.token === token) {
      await fs.unlink(join(lock, "owner.json"));
      await fs.rmdir(lock);
    }
  }
}

export function assertStopped(path) {
  if (!["darwin", "linux"].includes(process.platform))
    throw new Error("Local snapshots are supported on macOS and Linux only");
  const result = spawnSync("lsof", ["-n", "-P", "+D", path, "-Fp"], {
    encoding: "utf8",
    timeout: 15_000,
    maxBuffer: 1_000_000,
  });
  if (result.error || ![0, 1].includes(result.status) || result.stderr.trim())
    throw new Error(
      "Cannot establish that local state is closed. Install/check lsof and directory permissions; no snapshot was accepted.",
    );
  if (result.stdout.trim())
    throw new Error(
      "Local state has open files. Stop Wrangler and other readers/writers before taking or restoring a snapshot.",
    );
}

export async function inventory(root) {
  const files = [];
  let total = 0;
  async function walk(directory) {
    for (const name of (await fs.readdir(directory)).sort()) {
      const path = join(directory, name);
      const info = await fs.lstat(path);
      if (info.isDirectory()) await walk(path);
      else {
        if (!info.isFile() || info.nlink !== 1)
          throw new Error(
            "State must contain regular files and directories only; links are not supported",
          );
        total += info.size;
        if (files.length >= 10_000 || total > 1024 ** 3)
          throw new Error(
            "Local snapshot limit is 10,000 files and 1 GiB; no files were clipped",
          );
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(path)) hash.update(chunk);
        files.push({
          path: relative(root, path).split(sep).join("/"),
          bytes: info.size,
          sha256: hash.digest("hex"),
        });
      }
    }
  }
  if (!(await fs.lstat(root)).isDirectory())
    throw new Error("Expected a state directory");
  await walk(root);
  return files;
}

export function sameFiles(a, b) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(
      "Snapshot file inventory/checksum mismatch; retain the source and investigate",
    );
}

export async function copyFiles(source, destination, files) {
  const directories = new Set([destination]);
  for (const file of files) {
    const target = join(destination, file.path);
    await fs.mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await fs.copyFile(join(source, file.path), target, constants.COPYFILE_EXCL);
    await fs.chmod(target, 0o600);
    const copied = await fs.open(target, "r");
    try {
      await copied.sync();
    } finally {
      await copied.close();
    }
    for (
      let directory = dirname(target);
      directory !== destination;
      directory = dirname(directory)
    )
      directories.add(directory);
  }
  for (const directory of [...directories].sort((a, b) => b.length - a.length))
    await syncDirectory(directory);
}
