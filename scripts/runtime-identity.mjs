import * as fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { inventory, sha256 } from "./state-files.mjs";

export const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export async function runtimeIdentity(root = projectRoot) {
  const pkg = JSON.parse(await fs.readFile(join(root, "package.json"), "utf8"));
  const lockBytes = await fs.readFile(join(root, "package-lock.json"));
  const lock = JSON.parse(lockBytes);
  // App version/tooling/docs can change without changing the stored runtime.
  const dependencies = Object.entries(lock.packages)
    .filter(([path]) => path)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const environment = {
    platform: process.platform,
    architecture: process.arch,
    nodeMajor: process.versions.node.split(".")[0],
  };
  // Keep input ordering compatible with local-state-v1 snapshots.
  const inputs = {
    application: { name: pkg.name, type: pkg.type ?? "commonjs" },
    ...environment,
    source: await inventory(join(root, "src")),
    wrangler: sha256(await fs.readFile(join(root, "wrangler.jsonc"))),
    typescript: sha256(await fs.readFile(join(root, "tsconfig.json"))),
    dependencies,
  };
  const { platform, architecture, nodeMajor, ...build } = inputs;
  let revision = null;
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    /* Release archives need no Git. Content hashes remain authoritative. */
  }
  return {
    application: pkg.name,
    version: pkg.version,
    revision,
    environment,
    lockfileSha256: sha256(lockBytes),
    buildFingerprint: sha256(JSON.stringify(build)),
    fingerprint: sha256(JSON.stringify(inputs)),
  };
}

export async function resolveUpgrade(snapshot, sourceRoot, targetRoot) {
  const from = await runtimeIdentity(sourceRoot);
  const to = await runtimeIdentity(targetRoot);
  if (
    from.fingerprint !== snapshot.fingerprint ||
    from.version !== snapshot.version
  )
    throw new Error(
      "The source release does not match the snapshot runtime/configuration and local environment",
    );
  const catalog = JSON.parse(
    await fs.readFile(
      join(targetRoot, "compatibility/local-upgrades.json"),
      "utf8",
    ),
  );
  if (
    catalog.format !== "pi-durable-agent/local-upgrades-v1" ||
    !Array.isArray(catalog.routes)
  )
    throw new Error("Unsupported local upgrade catalog");
  const route = catalog.routes.find(
    (r) =>
      r.from.version === from.version &&
      r.from.buildFingerprint === from.buildFingerprint &&
      r.to.version === to.version &&
      r.to.buildFingerprint === to.buildFingerprint &&
      r.method === "unchanged-state-copy" &&
      from.application === to.application,
  );
  if (!route)
    throw new Error(
      "No reviewed local upgrade route for these exact release contents; do not bypass the check",
    );
  return { id: route.id, from, to, method: route.method };
}
