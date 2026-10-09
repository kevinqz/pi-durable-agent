import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  checkDevState,
  createBackup,
  restoreBackup,
  runtimeIdentity,
  upgradeBackup,
  verifyBackup,
} from "../scripts/local-state.mjs";
import {
  canonical,
  inventory,
  lease,
  sidecar,
  sha256,
  writeJson,
} from "../scripts/state-files.mjs";

async function fixture(t) {
  const root = await fs.mkdtemp(join(tmpdir(), "pi-agent-state-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(join(root, "src"));
  await writeJson(join(root, "package.json"), {
    name: "pi-durable-agent",
    version: "fixture",
  });
  await writeJson(join(root, "package-lock.json"), {
    packages: {
      "": { version: "fixture" },
      "node_modules/runtime": { version: "1", integrity: "fixture" },
    },
  });
  await fs.writeFile(join(root, "src/worker.ts"), "// fixture runtime\n");
  await fs.writeFile(join(root, "wrangler.jsonc"), "{}\n");
  await fs.writeFile(join(root, "tsconfig.json"), "{}\n");
  const state = join(root, "live");
  const objects = join(state, "v3/do/fixture-AgentSession");
  await fs.mkdir(objects, { recursive: true });
  // Opaque fixture bytes test complete copying, not SQLite or runtime semantics.
  for (const [name, content] of Object.entries({
    "parent.sqlite": "memory and request identity",
    "parent.sqlite-wal": "pending WAL bytes",
    "parent.facets": "facet mapping",
    "parent.1.sqlite": "pending approval",
    "metadata.sqlite": "namespace metadata",
  }))
    await fs.writeFile(join(objects, name), content);
  return {
    root,
    state,
    objects,
    backup: join(root, "snapshot"),
    restored: join(root, "restored"),
  };
}

test("closed parent, WAL, facet map and facet bytes restore together into a fresh directory", async (t) => {
  const f = await fixture(t);
  const before = await inventory(f.state);
  const receipt = await createBackup(f.state, f.backup, f.root);
  assert.equal(receipt.files, 5);
  assert.equal((await verifyBackup(f.backup)).sha256, receipt.sha256);
  await restoreBackup(f.backup, f.restored, f.root);
  assert.deepEqual(await inventory(f.restored), before);
  assert.deepEqual(await inventory(f.state), before);
  await checkDevState(f.restored, f.root);
  await assert.rejects(
    restoreBackup(f.backup, f.restored, f.root),
    /new destination/,
  );
  await assert.rejects(createBackup(f.state, f.backup, f.root), {
    code: "EEXIST",
  });
  await assert.rejects(
    checkDevState(join(f.backup, "state"), f.root),
    /This is a backup/,
  );
});

test("only reviewed release contents can upgrade a complete immutable snapshot", async (t) => {
  const f = await fixture(t);
  const target = join(f.root, "target-release");
  await fs.mkdir(target);
  for (const name of [
    "src",
    "package.json",
    "package-lock.json",
    "wrangler.jsonc",
    "tsconfig.json",
  ])
    await fs.cp(join(f.root, name), join(target, name), { recursive: true });
  await fs.appendFile(join(target, "src/worker.ts"), "// next release\n");
  const pkg = JSON.parse(
    await fs.readFile(join(target, "package.json"), "utf8"),
  );
  await writeJson(
    join(target, "package.json"),
    { ...pkg, version: "fixture-next" },
    "w",
  );
  const from = await runtimeIdentity(f.root);
  const to = await runtimeIdentity(target);
  const routes = [
    { id: "fixture-upgrade", from, to, method: "unchanged-state-copy" },
  ];
  await fs.mkdir(join(target, "compatibility"));
  await writeJson(join(target, "compatibility/local-upgrades.json"), {
    format: "pi-durable-agent/local-upgrades-v1",
    routes,
  });
  await createBackup(f.state, f.backup, f.root);
  // Older v1 manifests have no buildFingerprint/environment fields.
  const oldManifest = JSON.parse(
    await fs.readFile(join(f.backup, "snapshot.json"), "utf8"),
  );
  delete oldManifest.runtime.buildFingerprint;
  delete oldManifest.runtime.environment;
  await writeJson(join(f.backup, "snapshot.json"), oldManifest, "w");
  await fs.writeFile(
    join(f.backup, "snapshot.sha256"),
    sha256(await fs.readFile(join(f.backup, "snapshot.json"))) + "\n",
  );
  const saved = await verifyBackup(f.backup);
  await assert.rejects(
    restoreBackup(f.backup, f.restored, target),
    /recorded runtime/,
  );
  assert.equal(
    (await upgradeBackup(f.backup, f.restored, f.root, target)).upgrade,
    "fixture-upgrade",
  );
  assert.deepEqual(await inventory(f.restored), await inventory(f.state));
  await checkDevState(f.restored, target);
  await assert.rejects(checkDevState(f.restored, f.root), /recorded runtime/);
  await assert.rejects(
    upgradeBackup(f.backup, f.restored, f.root, target),
    /new destination/,
  );
  assert.equal((await verifyBackup(f.backup)).sha256, saved.sha256);
  const receipt = JSON.parse(
    await fs.readFile(sidecar(f.restored, "restore.json"), "utf8"),
  );
  assert.equal(receipt.upgrade.from.fingerprint, from.fingerprint);
  assert.equal(receipt.upgrade.to.fingerprint, to.fingerprint);

  await fs.appendFile(join(target, "src/worker.ts"), "// unreviewed change\n");
  const refused = join(f.root, "refused");
  await assert.rejects(
    upgradeBackup(f.backup, refused, f.root, target),
    /No reviewed local upgrade route/,
  );
  assert.equal(await fs.stat(refused).catch(() => null), null);
  await fs.appendFile(join(f.root, "src/worker.ts"), "// wrong source\n");
  await assert.rejects(
    upgradeBackup(f.backup, refused, f.root, target),
    /source release does not match/,
  );
});

test("changed, missing, extra and manifest-tampered bytes cannot be restored", async (t) => {
  const f = await fixture(t);
  await createBackup(f.state, f.backup, f.root);
  const file = join(
    f.backup,
    "state/v3/do/fixture-AgentSession/parent.1.sqlite",
  );
  await fs.writeFile(file, "altered");
  await assert.rejects(
    restoreBackup(f.backup, f.restored, f.root),
    /checksum mismatch/,
  );
  assert.equal(await fs.stat(f.restored).catch(() => null), null);
  await fs.unlink(file);
  await assert.rejects(verifyBackup(f.backup), /checksum mismatch/);
  await fs.writeFile(file, "pending approval");
  await fs.writeFile(join(f.backup, "state/extra"), "unexpected");
  await assert.rejects(verifyBackup(f.backup), /checksum mismatch/);
  await fs.unlink(join(f.backup, "state/extra"));
  await fs.appendFile(join(f.backup, "snapshot.json"), " ");
  await assert.rejects(verifyBackup(f.backup), /manifest checksum mismatch/);
});

test("managed leases and open files block backup without interrupting their owner", async (t) => {
  const f = await fixture(t);
  await lease(await canonical(f.state), "test-owner", async () => {
    await assert.rejects(
      createBackup(f.state, f.backup, f.root),
      /Local state is locked/,
    );
  });
  const handle = await fs.open(join(f.objects, "parent.sqlite"));
  try {
    await assert.rejects(createBackup(f.state, f.backup, f.root), /open files/);
  } finally {
    await handle.close();
  }
  await createBackup(f.state, f.backup, f.root);
});

test("aliases, nested destinations and file links cannot bypass path boundaries", async (t) => {
  const f = await fixture(t);
  const alias = join(f.root, "alias");
  await fs.symlink(f.state, alias);
  await assert.rejects(
    createBackup(f.state, join(alias, "nested"), f.root),
    /non-nested/,
  );
  await fs.symlink(join(f.objects, "parent.sqlite"), join(f.state, "link"));
  await assert.rejects(
    createBackup(f.state, f.backup, f.root),
    /regular files/,
  );
});

test("unsupported runtime and incomplete operations fail before starting restored work", async (t) => {
  const f = await fixture(t);
  await createBackup(f.state, f.backup, f.root);
  await restoreBackup(f.backup, f.restored, f.root);
  await fs.appendFile(join(f.root, "src/worker.ts"), "// changed contract\n");
  await assert.rejects(
    restoreBackup(f.backup, join(f.root, "incompatible"), f.root),
    /recorded runtime/,
  );
  await assert.rejects(checkDevState(f.restored, f.root), /recorded runtime/);
  await writeJson(
    sidecar(f.restored, "restore.json"),
    { status: "incomplete" },
    "w",
  );
  await assert.rejects(
    checkDevState(f.restored, f.root),
    /restore is incomplete/,
  );
  await fs.writeFile(join(f.backup, "snapshot.pending"), "interrupted");
  await assert.rejects(verifyBackup(f.backup), /Snapshot is incomplete/);
  const lock = sidecar(f.state, "lock");
  await fs.mkdir(lock);
  await assert.rejects(
    createBackup(f.state, join(f.root, "again"), f.root),
    /Local state is locked/,
  );
  assert.ok((await fs.stat(lock)).isDirectory());
});
