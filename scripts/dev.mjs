import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { canonical, lease } from "./state-files.mjs";
import { checkDevState, projectRoot } from "./local-state.mjs";
import { checkpointBuild } from "./checkpoint-build.mjs";

try {
  const { values } = parseArgs({
    options: {
      "persist-to": { type: "string", default: ".wrangler/state" },
      port: { type: "string", default: "8787" },
      help: { type: "boolean" },
    },
  });
  if (values.help)
    console.log(
      "npm run dev -- [--port 8787] [--persist-to .wrangler/state]\nRuns the local demo on loopback; state is locked while Wrangler runs.",
    );
  else {
    await checkpointBuild();
    if (
      !/^\d+$/.test(values.port) ||
      Number(values.port) < 1 ||
      Number(values.port) > 65535
    )
      throw new Error("Port must be 1..65535");
    const state = await canonical(values["persist-to"]);
    await lease(state, "dev", async () => {
      await checkDevState(state);
      await mkdir(state, { recursive: true, mode: 0o700 });
      const child = spawn(
        process.execPath,
        [
          join(projectRoot, "node_modules/wrangler/bin/wrangler.js"),
          "dev",
          "--env",
          "local",
          "--local",
          "--ip",
          "127.0.0.1",
          "--port",
          values.port,
          "--inspector-port",
          "0",
          "--persist-to",
          state,
        ],
        {
          cwd: projectRoot,
          stdio: "inherit",
          env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
        },
      );
      const stop = () => child.kill("SIGTERM");
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
      try {
        process.exitCode = await new Promise((resolve, reject) => {
          child.once("error", reject);
          child.once("exit", (code, signal) =>
            resolve(code ?? (signal ? 1 : 0)),
          );
        });
      } finally {
        process.off("SIGINT", stop);
        process.off("SIGTERM", stop);
      }
    });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
