import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createBackup,
  projectRoot,
  restoreBackup,
  verifyBackup,
} from "./local-state.mjs";

const directory = await fs.mkdtemp(join(tmpdir(), "pi-agent-recovery-"));
const source = join(directory, "source");
const backup = join(directory, "backup");
const restored = join(directory, "restored");
let server;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(read, done) {
  const deadline = Date.now() + 20_000;
  do {
    const result = await read();
    if (done(result)) return result;
    await pause(100);
  } while (Date.now() < deadline);
  throw new Error("Timed out waiting for the local recovery fixture");
}

async function start(state) {
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
    ["scripts/dev.mjs", "--port", String(port), "--persist-to", state],
    {
      cwd: projectRoot,
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

try {
  server = await start(source);
  const initialCall = server.call;
  for (const [id, text] of [
    [
      "before-1",
      "Recovery fixture: Aurora ticket 318, retain this exact original.",
    ],
    ["before-2", "Remember the preceding Aurora ticket."],
  ]) {
    await initialCall("messages", { id, text });
    await until(
      () => initialCall("state"),
      (s) =>
        s.requests.find((r) => r.id === id)?.status === "completed" &&
        s.progress.activeTasks === 0,
    );
  }
  const action = {
    id: "restore-pending",
    label: "Retain this approval across backup",
    code: 'async () => { const first = await notes.create({key:"recovery",text:"Aurora restore proof"}); const again = await notes.create({key:"recovery",text:"Aurora restore proof"}); return [first, again]; }',
  };
  await initialCall("actions", action);
  const pending = await until(
    () => initialCall("actions/inspect", { id: action.id }),
    (a) => a.status === "pending",
  );
  const before = await initialCall("state");
  await assert.rejects(
    createBackup(source, join(directory, "live-refusal")),
    /Local state is locked/,
  );
  await server.stop();
  server = undefined;
  const saved = await createBackup(source, backup);
  await restoreBackup(backup, restored);
  server = await start(restored);
  const call = server.call;
  const after = await call("state");
  assert.deepEqual(after.history, before.history);
  assert.equal(after.memory.view, before.memory.view);
  // Recovery wakes can update reconciliation timestamps without changing identity.
  const identities = (rows) =>
    rows.map(({ updated_at, ...identity }) => identity);
  assert.deepEqual(identities(after.requests), identities(before.requests));
  let current = await call("actions/inspect", { id: action.id });
  assert.equal(current.fingerprint, pending.fingerprint);
  assert.deepEqual(current.pending, pending.pending);
  assert.match(
    JSON.stringify(await call("memory/search", { query: "Aurora ticket 318" })),
    /Recovery fixture: Aurora ticket 318/,
  );
  let decisions = 0;
  while (current.status === "pending" && decisions < 2) {
    assert.equal(current.code, action.code);
    current = await call("actions/decide", {
      id: action.id,
      decision: "approve",
      fingerprint: current.fingerprint,
    });
    decisions++;
  }
  assert.equal(decisions, 2); // Each tool occurrence needs its own exact approval.
  assert.equal(current.status, "completed");
  assert.deepEqual(current.result[0], current.result[1]);
  const delivered = await until(
    () => call("state"),
    (s) =>
      s.requests.find((r) => r.id === `result-${action.id}`)?.status ===
        "completed" && s.progress.activeTasks === 0,
  );
  assert.equal(
    delivered.requests.filter((r) => r.id === `result-${action.id}`).length,
    1,
  );
  assert.equal((await call("actions", action)).status, "completed");
  await call("actions", {
    id: "inspect-notes",
    label: "Read restored note receipts",
    code: "async () => await notes.list({})",
  });
  const notes = await until(
    () => call("actions/inspect", { id: "inspect-notes" }),
    (a) => a.status === "completed",
  );
  assert.equal(notes.result.length, 1);
  assert.equal(notes.result[0].text, "Aurora restore proof");
  await server.stop();
  server = undefined;
  assert.equal((await verifyBackup(backup)).sha256, saved.sha256);
  const evidence = {
    date: new Date().toISOString(),
    kind: "local-offline-backup-restore",
    shutdown: "graceful",
    crossRelease: false,
    runtime: (await verifyBackup(backup)).manifest.runtime,
    snapshot: { files: saved.files, bytes: saved.bytes, sha256: saved.sha256 },
    observed: {
      liveBackupRefused: true,
      historyPreserved: true,
      memoryViewPreserved: true,
      requestIdentitiesPreserved: true,
      pendingApprovalPreserved: true,
      originalRetrieved: true,
      approvalDecisions: decisions,
      destinationNotes: notes.result.length,
      resultDeliveryReceipts: 1,
      immutableBackupVerifiedAfterRun: true,
    },
    external: { cloudflareDeployment: false, paidModelCalls: 0 },
  };
  await fs.writeFile(
    join(directory, "evidence.json"),
    JSON.stringify(evidence, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(
    `Local restore passed. Private fixture and evidence retained at ${directory}`,
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (server) await server.stop();
}
