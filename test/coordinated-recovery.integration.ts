import { env } from "cloudflare:workers";
import {
  abortAllDurableObjects,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { expect, test } from "vitest";
import type { RecoveryEnv } from "../src/session-supervisor.js";
import type { Principal } from "../src/env.js";
import { SessionStore } from "../src/store.js";

const bindings = env as unknown as RecoveryEnv;
const session = () => bindings.RECOVERY_SESSIONS.getByName(crypto.randomUUID());
const owner: Principal = {
  tenant: "recovery-test",
  subject: "owner",
  authorizedUntil: Date.now() + 3600_000,
};
type Stub = ReturnType<typeof session>;
async function call(
  stub: Stub,
  method: string,
  path: string,
  body = {},
  principal = owner,
): Promise<any> {
  const result = await stub.dispatch(principal, method, path, body);
  if (!result.ok)
    throw Object.assign(new Error(result.error), { status: result.status });
  return JSON.parse(result.value);
}
async function drive(stub: Stub) {
  await runInDurableObject(stub, async (object) => {
    for (const job of object.lifecycle.jobs.list())
      await object.lifecycle.jobs.reschedule(job.id, Date.now());
  });
  await runDurableObjectAlarm(stub);
}
async function idle(stub: Stub) {
  await expect
    .poll(
      async () => {
        await drive(stub);
        const state = await call(stub, "GET", "state");
        return (
          state.progress.activeTasks === 0 &&
          state.requests.every((r: any) =>
            ["completed", "failed", "cancelled"].includes(r.status),
          )
        );
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  return call(stub, "GET", "state");
}
async function recover(
  stub: Stub,
  path: "create" | "restore",
  body: Record<string, string>,
) {
  await call(stub, "POST", `checkpoints/${path}`, body);
  await drive(stub);
  const status = await call(stub, "GET", "checkpoints");
  expect(status.busy).toBeUndefined();
  return status;
}

test("full session checkpoint restores native Pi and Code Mode while destination effects remain outside the rewind", async () => {
  let stub = session();
  await call(stub, "POST", "configuration", { mode: "demo" });
  await call(stub, "POST", "messages", {
    id: "source",
    text: "Remember Aurora recovery fixture 719.",
  });
  await idle(stub);
  await call(stub, "POST", "actions", {
    id: "note",
    label: "Recovery note",
    code: 'async () => await notes.create({key:"aurora", text:"Aurora recovery fixture 719"})',
  });
  await drive(stub);
  const before = await call(stub, "GET", "state");
  expect(before.actions[0].status).toBe("pending");
  await recover(stub, "create", { id: "before-effect" });
  // Synthetic charged-attempt fixture; no AI binding or model request exists in
  // this environment. The provider guard is qualified separately with a local spy.
  await runInDurableObject(stub, (_object, ctx) =>
    new SessionStore(ctx.storage.sql).setMeta("modelCalls", "7"),
  );
  await call(stub, "POST", "actions/decide", {
    id: "note",
    decision: "approve",
    fingerprint: before.actions[0].fingerprint,
  });
  await idle(stub);
  expect(await stub.notes({ facet: "session:initial", epoch: 0 })).toHaveLength(
    1,
  );
  const restored = await recover(stub, "restore", {
    id: "restore",
    checkpointId: "before-effect",
  });
  expect(restored.generation).toBe(1);
  const after = await call(stub, "GET", "state");
  expect(after.history).toEqual(before.history);
  expect(after.memory).toEqual(before.memory);
  expect(after.actions[0]).toEqual(before.actions[0]);
  expect(after.progress.modelCalls).toBe(7);
  expect(
    await stub.isGenerationActive({ facet: "session:initial", epoch: 0 }),
  ).toBe(false);
  await abortAllDurableObjects();
  stub = bindings.RECOVERY_SESSIONS.get(stub.id);
  expect((await call(stub, "GET", "state")).actions[0]).toEqual(
    before.actions[0],
  );
  await call(stub, "POST", "actions/decide", {
    id: "note",
    decision: "approve",
    fingerprint: before.actions[0].fingerprint,
  });
  const completed = await idle(stub);
  expect(completed.actions[0].status).toBe("completed");
  expect(
    completed.requests.filter((r: any) => r.id === "result-note"),
  ).toHaveLength(1);
  expect(
    await stub.notes({ facet: "session:restored:restore", epoch: 1 }),
  ).toHaveLength(1);
  expect(
    JSON.stringify(
      await call(stub, "POST", "memory/search", { query: "Aurora" }),
    ),
  ).toContain("719");
});

test("checkpoint admission freezes input and enforces the same authenticated owner", async () => {
  let stub = session();
  await call(stub, "GET", "state");
  await expect(
    call(stub, "POST", "checkpoints/restore", {
      id: "missing",
      checkpointId: "missing",
    }),
  ).rejects.toMatchObject({ status: 404 });
  await runInDurableObject(stub, (object) =>
    expect(object.lifecycle.jobs.get("checkpoint:missing")).toBeUndefined(),
  );
  await expect(
    call(
      stub,
      "POST",
      "checkpoints/create",
      { id: "bad" },
      { ...owner, subject: "other" },
    ),
  ).rejects.toMatchObject({ status: 403 });
  await call(stub, "POST", "checkpoints/create", { id: "one" });
  await expect(
    call(stub, "POST", "messages", {
      id: "blocked",
      text: "Should remain unadmitted",
    }),
  ).rejects.toMatchObject({ status: 409 });
  await abortAllDurableObjects();
  stub = bindings.RECOVERY_SESSIONS.get(stub.id);
  expect((await call(stub, "GET", "checkpoints")).busy.phase).toBe("quiescing");
  await drive(stub);
  expect((await call(stub, "GET", "checkpoints")).checkpoints).toHaveLength(1);
  expect((await call(stub, "GET", "state")).requests).toHaveLength(0);
});
