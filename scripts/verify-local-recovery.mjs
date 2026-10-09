import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { startLocalServer, until } from "./local-server.mjs";
import { sha256 } from "./state-files.mjs";
import {
  createBackup,
  projectRoot,
  restoreBackup,
  upgradeBackup,
  runtimeIdentity,
  verifyBackup,
} from "./local-state.mjs";

const { values } = parseArgs({ options: { from: { type: "string" } } });
const sourceRoot = values.from ? resolve(values.from) : projectRoot;
const crossRelease = sourceRoot !== projectRoot;
const directory = await fs.mkdtemp(join(tmpdir(), "pi-agent-recovery-"));
const source = join(directory, "source");
const backup = join(directory, "backup");
const restored = join(directory, "restored");
let server;

try {
  server = await startLocalServer(source, directory, sourceRoot);
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
  let completedBefore;
  if (crossRelease) {
    // Retain both a completed runtime and a separate pending approval.
    await initialCall("actions", {
      id: "before-read",
      label: "Read before upgrade",
      code: "async () => await notes.list({})",
    });
    completedBefore = await until(
      () => initialCall("actions/inspect", { id: "before-read" }),
      (a) => a.status === "completed",
    );
    await until(
      () => initialCall("state"),
      (s) =>
        s.requests.find((r) => r.id === "result-before-read")?.status ===
          "completed" && s.progress.activeTasks === 0,
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
    createBackup(source, join(directory, "live-refusal"), sourceRoot),
    /Local state is locked|open files/,
  );
  await server.stop();
  server = undefined;
  const saved = await createBackup(source, backup, sourceRoot);
  if (crossRelease) {
    await assert.rejects(
      restoreBackup(backup, join(directory, "unreviewed-restore")),
      /recorded runtime/,
    );
    await upgradeBackup(backup, restored, sourceRoot);
  } else await restoreBackup(backup, restored);
  server = await startLocalServer(restored, directory);
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
  assert.equal(current.contract, pending.contract);
  if (crossRelease) {
    const retained = await call("actions/inspect", { id: "before-read" });
    assert.deepEqual(retained, completedBefore);
    // The versioned destination implementation is retained byte-for-byte.
    assert.equal(
      sha256(await fs.readFile(join(sourceRoot, "src/notes.ts"))),
      sha256(await fs.readFile(join(projectRoot, "src/notes.ts"))),
    );
  }
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
  if (crossRelease) {
    server = await startLocalServer(restored, directory);
    const reopened = await server.call("state");
    assert.equal(
      reopened.requests.filter((r) => r.id === `result-${action.id}`).length,
      1,
    );
    assert.equal(
      reopened.requests.filter((r) => r.id === "result-before-read").length,
      1,
    );
    assert.equal(
      (await server.call("actions/inspect", { id: action.id })).status,
      "completed",
    );
    await server.call("messages", {
      id: "after-upgrade",
      text: "Continue after the update: recall Aurora ticket 318.",
    });
    await until(
      () => server.call("state"),
      (s) =>
        s.requests.find((r) => r.id === "after-upgrade")?.status ===
          "completed" && s.progress.activeTasks === 0,
    );
    await server.stop();
    server = undefined;
  }
  assert.equal((await verifyBackup(backup)).sha256, saved.sha256);
  const evidence = {
    date: new Date().toISOString(),
    kind: crossRelease
      ? "local-cross-release-upgrade"
      : "local-offline-backup-restore",
    shutdown: "graceful",
    crossRelease,
    targetRuntime: await runtimeIdentity(),
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
      ...(crossRelease
        ? {
            ordinaryRestoreRefusedRuntimeChange: true,
            completedActionPreserved: true,
            connectorV1BytesPreserved: true,
            restartedTargetWithoutDuplicateDelivery: true,
            newConversationTurnCompleted: true,
          }
        : {}),
    },
    external: { cloudflareDeployment: false, paidModelCalls: 0 },
  };
  await fs.writeFile(
    join(directory, "evidence.json"),
    JSON.stringify(evidence, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(
    `Local ${crossRelease ? "upgrade" : "restore"} passed. Private fixture and evidence retained at ${directory}`,
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (server) await server.stop();
}
