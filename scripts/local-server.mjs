import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { projectRoot } from "./runtime-identity.mjs";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function until(read, done) {
  const deadline = Date.now() + 20_000;
  do {
    const result = await read();
    if (done(result)) return result;
    await pause(100);
  } while (Date.now() < deadline);
  throw new Error("Timed out waiting for the local recovery fixture");
}

export async function startLocalServer(state, directory, root = projectRoot) {
  const reservation = createServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const port = reservation.address().port;
  await new Promise((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    root === projectRoot
      ? ["scripts/dev.mjs", "--port", String(port), "--persist-to", state]
      : [
          join(root, "node_modules/wrangler/bin/wrangler.js"),
          "dev",
          "--env",
          "local",
          "--local",
          "--ip",
          "127.0.0.1",
          "--port",
          String(port),
          "--inspector-port",
          "0",
          "--persist-to",
          state,
        ],
    {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        CI: "true",
        WRANGLER_SEND_METRICS: "false",
        WRANGLER_LOG_PATH: join(directory, "wrangler.log"),
      },
    },
  );
  let output = "";
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      output = (output + chunk).slice(-8000);
    });
  const exited = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
  const handle = {
    async call(path, body) {
      const response = await fetch(
        `${base}/api/sessions/recovery-proof/${path}`,
        body
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {},
      );
      const value = await response.json();
      assert.ok(response.ok, JSON.stringify(value));
      return value;
    },
    async stop() {
      if (child.exitCode === null) child.kill("SIGTERM");
      let timer;
      try {
        await Promise.race([
          exited,
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error(`Local server did not stop; retain ${directory}`),
                ),
              10_000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
  try {
    await until(async () => {
      if (child.exitCode !== null) throw new Error(output);
      return fetch(`${base}/api/me`)
        .then((r) => r.ok)
        .catch(() => false);
    }, Boolean);
    return handle;
  } catch (error) {
    await handle.stop();
    throw error;
  }
}
