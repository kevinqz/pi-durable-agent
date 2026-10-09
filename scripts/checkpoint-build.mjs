import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { inventory, sha256 } from "./state-files.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const relative = "generated/checkpoint-build.json";

export async function checkpointBuild({ check = false } = {}) {
  const lock = JSON.parse(
    await readFile(join(root, "package-lock.json"), "utf8"),
  );
  const parsed = ts.parseConfigFileTextToJson(
    "wrangler.jsonc",
    await readFile(join(root, "wrangler.jsonc"), "utf8"),
  );
  if (parsed.error) throw new Error("Invalid tracked Wrangler configuration");
  const input = {
    format: "pi-durable-agent/checkpoint-runtime-v1",
    source: (await inventory(join(root, "src"))).filter(
      (entry) => entry.path !== relative,
    ),
    dependencies: Object.entries(lock.packages)
      .filter(([path]) => path)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    compatibility: {
      date: parsed.config.compatibility_date,
      flags: parsed.config.compatibility_flags,
    },
  };
  const value = { format: input.format, sha256: sha256(JSON.stringify(input)) };
  const bytes = JSON.stringify(value, null, 2) + "\n";
  const destination = join(root, "src", relative);
  const old = await readFile(destination, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  if (old !== bytes) {
    if (check)
      throw new Error(
        "Checkpoint runtime identity is stale. Run npm run runtime:update after reviewing the source changes.",
      );
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await checkpointBuild({ check: process.argv.includes("--check") });
}
