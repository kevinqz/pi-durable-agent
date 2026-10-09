import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { createBackup, restoreBackup, verifyBackup } from "./local-state.mjs";

try {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      state: { type: "string", default: ".wrangler/state" },
      to: { type: "string" },
      help: { type: "boolean" },
    },
  });
  const [command, backup] = positionals;
  if (values.help || !command)
    console.log(
      "Local state (stop Wrangler first):\n  npm run state -- backup --to .local-backups/demo\n  npm run state -- verify .local-backups/demo\n  npm run state -- restore .local-backups/demo --to .local-restores/demo\n  npm run dev -- --persist-to .local-restores/demo\n\nbackup accepts --state PATH. Snapshots are private, local, unencrypted data; see docs/local-recovery.md.",
    );
  else if (command === "backup" && positionals.length === 1 && values.to)
    console.log(
      JSON.stringify(
        await createBackup(resolve(values.state), resolve(values.to)),
        null,
        2,
      ),
    );
  else if (command === "verify" && positionals.length === 2 && !values.to) {
    const result = await verifyBackup(resolve(backup));
    console.log(
      JSON.stringify(
        {
          verified: true,
          files: result.manifest.files.length,
          runtime: result.manifest.runtime,
          sha256: result.sha256,
        },
        null,
        2,
      ),
    );
  } else if (command === "restore" && positionals.length === 2 && values.to)
    console.log(
      JSON.stringify(
        await restoreBackup(resolve(backup), resolve(values.to)),
        null,
        2,
      ),
    );
  else throw new Error("Invalid arguments; run npm run state -- --help");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
