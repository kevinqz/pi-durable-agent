import * as fs from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  projectRoot,
  resolveUpgrade,
  runtimeIdentity,
} from "./runtime-identity.mjs";
export { projectRoot, runtimeIdentity } from "./runtime-identity.mjs";
import {
  assertStopped,
  canonical,
  copyFiles,
  exists,
  inventory,
  lease,
  sameFiles,
  separate,
  sha256,
  sidecar,
  syncDirectory,
  writeJson,
} from "./state-files.mjs";

const FORMAT = "pi-durable-agent/local-state-v1";

async function requireStateDirectory(state) {
  if (!(await fs.lstat(join(state, "v3/do")).catch(() => null))?.isDirectory())
    throw new Error(
      "Select a Wrangler state directory containing v3/do, not a checkout or transcript directory",
    );
}

function stateLayout(files) {
  if (
    !files.some(
      (f) =>
        /^v3\/do\/[^/]+\/[^/]+\.sqlite$/.test(f.path) &&
        !f.path.endsWith("/metadata.sqlite"),
    )
  )
    throw new Error("No populated Wrangler v3 Durable Object state found");
}

export async function checkDevState(state, root = projectRoot) {
  if (
    (await exists(join(dirname(state), "snapshot.json"))) ||
    (await exists(join(dirname(state), "snapshot.pending")))
  )
    throw new Error(
      "This is a backup. Restore it to a separate directory before starting Wrangler",
    );
  const receipt = sidecar(state, "restore.json");
  if (await exists(receipt)) {
    const restored = JSON.parse(await fs.readFile(receipt, "utf8"));
    if (restored.status !== "complete")
      throw new Error(
        "This restore is incomplete; use a new destination and a verified backup",
      );
    if (restored.fingerprint !== (await runtimeIdentity(root)).fingerprint)
      throw new Error(
        "Restored state requires its recorded runtime/configuration. Use that revision or the reviewed local upgrade workflow.",
      );
  }
}

export async function createBackup(
  statePath,
  destinationPath,
  root = projectRoot,
) {
  const state = await canonical(statePath);
  const destination = await canonical(destinationPath);
  separate(state, destination);
  return lease(state, "backup", async () => {
    await checkDevState(state, root);
    await requireStateDirectory(state);
    assertStopped(state);
    const files = await inventory(state);
    stateLayout(files);
    const runtime = await runtimeIdentity(root);
    await fs.mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    await fs.mkdir(destination, { mode: 0o700 }); // Never replace an existing backup.
    await fs.writeFile(
      join(destination, "snapshot.pending"),
      "Incomplete snapshot\n",
      { flag: "wx", mode: 0o600 },
    );
    await fs.mkdir(join(destination, "state"), { mode: 0o700 });
    await copyFiles(state, join(destination, "state"), files);
    assertStopped(state);
    sameFiles(files, await inventory(state));
    sameFiles(files, await inventory(join(destination, "state")));
    if (runtime.fingerprint !== (await runtimeIdentity(root)).fingerprint)
      throw new Error("Runtime files changed during backup");
    const manifest = {
      format: FORMAT,
      createdAt: new Date().toISOString(),
      scope: "complete-local-wrangler-state",
      runtime,
      files,
    };
    await writeJson(join(destination, "snapshot.json"), manifest);
    const digest = sha256(
      await fs.readFile(join(destination, "snapshot.json")),
    );
    await fs.writeFile(join(destination, "snapshot.sha256"), digest + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    const checksumFile = await fs.open(
      join(destination, "snapshot.sha256"),
      "r",
    );
    try {
      await checksumFile.sync();
    } finally {
      await checksumFile.close();
    }
    await fs.unlink(join(destination, "snapshot.pending"));
    await syncDirectory(destination);
    await syncDirectory(dirname(destination));
    return {
      destination,
      files: files.length,
      bytes: files.reduce((n, f) => n + f.bytes, 0),
      sha256: digest,
    };
  });
}

export async function verifyBackup(path) {
  const backup = await canonical(path);
  if (await exists(join(backup, "snapshot.pending")))
    throw new Error(
      "Snapshot is incomplete; keep the original state and create a new backup",
    );
  const info = await fs.lstat(join(backup, "snapshot.json"));
  if (!info.isFile() || info.size > 4_000_000)
    throw new Error("Invalid snapshot manifest");
  if (!(await fs.lstat(join(backup, "snapshot.sha256"))).isFile())
    throw new Error("Snapshot checksum must be a regular file");
  const raw = await fs.readFile(join(backup, "snapshot.json"));
  const digest = sha256(raw);
  if (
    (await fs.readFile(join(backup, "snapshot.sha256"), "utf8")).trim() !==
    digest
  )
    throw new Error("Snapshot manifest checksum mismatch");
  const manifest = JSON.parse(raw);
  if (
    manifest.format !== FORMAT ||
    !Array.isArray(manifest.files) ||
    !/^[a-f0-9]{64}$/.test(manifest.runtime?.fingerprint)
  )
    throw new Error("Unsupported snapshot format");
  if ((await fs.lstat(join(backup, "state"))).isSymbolicLink())
    throw new Error("Snapshot state must not be a link");
  await requireStateDirectory(join(backup, "state"));
  const files = await inventory(join(backup, "state"));
  stateLayout(files);
  sameFiles(manifest.files, files);
  return { backup, manifest, sha256: digest };
}

export async function restoreBackup(
  backupPath,
  destinationPath,
  root = projectRoot,
) {
  return restore(backupPath, destinationPath, root);
}

export async function upgradeBackup(
  backupPath,
  destinationPath,
  sourceRoot,
  root = projectRoot,
) {
  if (!sourceRoot)
    throw new Error("An upgrade requires the retained source release");
  return restore(backupPath, destinationPath, root, sourceRoot);
}

async function restore(backupPath, destinationPath, root, sourceRoot) {
  const backup = await canonical(backupPath);
  const destination = await canonical(destinationPath);
  separate(backup, destination);
  return lease(join(backup, "state"), "restore-source", async () => {
    assertStopped(join(backup, "state"));
    const verified = await verifyBackup(backup);
    const runtime = await runtimeIdentity(root);
    const upgrade = sourceRoot
      ? await resolveUpgrade(verified.manifest.runtime, sourceRoot, root)
      : undefined;
    if (
      !upgrade &&
      runtime.fingerprint !== verified.manifest.runtime.fingerprint
    )
      throw new Error(
        "Snapshot requires its recorded runtime/configuration. Restore with that revision or use the reviewed local upgrade workflow.",
      );
    return lease(destination, "restore-destination", async () => {
      if (
        (await exists(destination)) ||
        (await exists(sidecar(destination, "restore.json")))
      )
        throw new Error(
          "Restore requires a new destination; existing data is never overwritten",
        );
      const receipt = {
        status: "incomplete",
        fingerprint: runtime.fingerprint,
        snapshotSha256: verified.sha256,
        ...(upgrade ? { upgrade } : {}),
      };
      await writeJson(sidecar(destination, "restore.json"), receipt);
      await fs.mkdir(destination, { mode: 0o700 });
      await copyFiles(
        join(backup, "state"),
        destination,
        verified.manifest.files,
      );
      sameFiles(verified.manifest.files, await inventory(destination));
      if ((await verifyBackup(backup)).sha256 !== verified.sha256)
        throw new Error("Snapshot changed during restore");
      assertStopped(join(backup, "state"));
      if (runtime.fingerprint !== (await runtimeIdentity(root)).fingerprint)
        throw new Error("Target runtime changed during restore");
      await writeJson(
        sidecar(destination, "restore.json"),
        {
          ...receipt,
          status: "complete",
          restoredAt: new Date().toISOString(),
        },
        "w",
      );
      await syncDirectory(dirname(destination));
      return {
        destination,
        files: verified.manifest.files.length,
        snapshotSha256: verified.sha256,
        ...(upgrade ? { upgrade: upgrade.id } : {}),
      };
    });
  });
}
