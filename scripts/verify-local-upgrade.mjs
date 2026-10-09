import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { projectRoot, runtimeIdentity } from "./runtime-identity.mjs";

// The baseline is the exact preceding public preview, never a moving branch.
const BASELINE = "3eb63101c0a8f222b506f771b3c5ec064f88fa53";
const { values } = parseArgs({ options: { from: { type: "string" } } });
const directory = await fs.mkdtemp(join(tmpdir(), "pi-agent-upgrade-release-"));
const baseline = join(directory, "baseline");
await fs.mkdir(baseline);
if (values.from) {
  // Copy only release inputs. Never import credentials, local state or user files.
  const from = resolve(values.from);
  for (const entry of [
    "src",
    "public",
    "package.json",
    "package-lock.json",
    "wrangler.jsonc",
    "tsconfig.json",
  ])
    await fs.cp(join(from, entry), join(baseline, entry), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
} else {
  let archive;
  try {
    archive = execFileSync("git", ["archive", BASELINE], {
      cwd: projectRoot,
      maxBuffer: 10_000_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error(
      "Retain/fetch v0.1.0-dev.2 first, or run npm run test:upgrade -- --from /path/to/its/extracted/source. The runner does not download code.",
    );
  }
  execFileSync("tar", ["-xf", "-", "-C", baseline], { input: archive });
}
const catalog = JSON.parse(
  await fs.readFile(
    join(projectRoot, "compatibility/local-upgrades.json"),
    "utf8",
  ),
);
const from = await runtimeIdentity(baseline);
const to = await runtimeIdentity();
assert.ok(
  catalog.routes.some(
    (r) =>
      r.from.version === from.version &&
      r.from.buildFingerprint === from.buildFingerprint &&
      r.to.version === to.version &&
      r.to.buildFingerprint === to.buildFingerprint,
  ),
  "Release contents must match the reviewed compatibility route",
);
const dependencies = async (root) =>
  Object.entries(
    JSON.parse(await fs.readFile(join(root, "package-lock.json"), "utf8"))
      .packages,
  ).filter(([path]) => path);
assert.deepEqual(
  await dependencies(baseline),
  await dependencies(projectRoot),
  "This fixture reuses installed dependencies only for an identical lockfile dependency graph",
);
// Reuse the unchanged dependencies without a second install or network access.
await fs.symlink(
  join(projectRoot, "node_modules"),
  join(baseline, "node_modules"),
);
const child = spawn(
  process.execPath,
  ["scripts/verify-local-recovery.mjs", "--from", baseline],
  { cwd: projectRoot, stdio: "inherit" },
);
const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
}
console.log(`Baseline source retained at ${baseline}`);
