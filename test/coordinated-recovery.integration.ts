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
import worker from "../src/worker.js";
import build from "../src/generated/checkpoint-build.json";
import type { PriorSessionFacet } from "./fixtures/recovery-worker.js";

const bindings = env as unknown as RecoveryEnv;
const session = () => bindings.RECOVERY_SESSIONS.getByName(crypto.randomUUID());
const owner: Principal = {
  tenant: "recovery-test",
  subject: "owner",
  authorizedUntil: Date.now() + 3600_000,
};
type Stub = ReturnType<typeof session>;
const generations = new Map<string, number>();
async function call(
  stub: Stub,
  method: string,
  path: string,
  body = {},
  principal = owner,
): Promise<any> {
  const result = await stub.dispatch(principal, method, path, {
    expectedGeneration: generations.get(stub.id.toString()) ?? 0,
    ...body,
  });
  if (!result.ok)
    throw Object.assign(new Error(result.error), { status: result.status });
  const value = JSON.parse(result.value);
  const generation = value.recovery?.generation ?? value.generation;
  if (generation !== undefined) generations.set(stub.id.toString(), generation);
  return value;
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

test("polling does not postpone scheduled work or starve an action", async () => {
  const stub = session();
  await call(stub, "POST", "configuration", { mode: "demo" });
  await call(stub, "GET", "state");
  // A future deadline isolates polling from an alarm legitimately advancing it.
  const due = Date.now() + 5000;
  await runInDurableObject(stub, (object) =>
    object.lifecycle.jobs.reschedule("generation:0", due),
  );
  for (let read = 0; read < 3; read++) {
    await call(stub, "GET", "state");
    const next = await runInDurableObject(
      stub,
      (object) => object.lifecycle.jobs.get("generation:0")!.time,
    );
    expect(next).toBeLessThanOrEqual(due);
  }
  await call(stub, "POST", "actions", {
    id: "polling-note",
    label: "Polling fixture",
    code: 'async () => await notes.create({key:"polling",text:"Fixture"})',
  });
  // Use the admitted alarm as-is: forcing its timestamp would hide starvation.
  await runDurableObjectAlarm(stub);
  const state = await call(stub, "GET", "state");
  expect(state.actions[0].status).toBe("pending");
});

test("a warm previous-build facet drains before a native code reload preserves its pending approval", async () => {
  const stub = session();
  await call(stub, "POST", "messages", {
    id: "update-source",
    text: "Remember runtime update 853.",
  });
  await idle(stub);
  await call(stub, "POST", "actions", {
    id: "update-note",
    label: "Pending across a code update",
    code: 'async () => await notes.create({key:"update",text:"Runtime update 853"})',
  });
  await drive(stub);
  const before = await call(stub, "GET", "state");
  expect(before.actions[0].status).toBe("pending");
  await runInDurableObject(stub, async (object, ctx) => {
    const generation = object.checkpoints.status().active;
    ctx.facets.abort(generation.facet, new Error("Install prior-code fixture"));
    const exports = ctx.exports as unknown as {
      PriorSessionFacet(options: {
        props: unknown;
      }): DurableObjectClass<PriorSessionFacet>;
    };
    const prior = ctx.facets.get<PriorSessionFacet>(generation.facet, () => ({
      class: exports.PriorSessionFacet({
        props: {
          rootId: ctx.id.toString(),
          generation,
          profile: before.model,
        },
      }),
    }));
    await prior.setBusyForUpdateTest(true);
    // Emulate the root's fresh in-memory cache after deployment, without changing
    // any persisted application data or patching a framework implementation.
    (
      object as unknown as { verifiedRuntimes: Set<string> }
    ).verifiedRuntimes.clear();
  });
  const busy = await call(stub, "GET", "state");
  expect(busy.runtime.codeUpdatePending).toBe(true);
  expect(
    (await call(stub, "POST", "cancel", { id: "update-source" })).status,
  ).toBe("completed");
  await expect(
    call(stub, "POST", "messages", { id: "blocked", text: "Do not admit" }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    call(stub, "POST", "checkpoints/create", { id: "blocked-checkpoint" }),
  ).rejects.toMatchObject({ status: 409 });
  await runInDurableObject(stub, async (object, ctx) => {
    const old = ctx.facets.get<PriorSessionFacet>(
      object.checkpoints.status().active.facet,
      () => {
        throw new Error("Expected the old warm facet");
      },
    );
    await old.setBusyForUpdateTest(false);
  });
  const after = await call(stub, "GET", "state");
  expect(after.runtime).toMatchObject({
    backend: build.sha256,
    expectedBackend: build.sha256,
    codeUpdatePending: false,
  });
  expect(after.history).toEqual(before.history);
  expect(after.memory).toEqual(before.memory);
  expect(after.actions).toEqual(before.actions);
  expect(after.requests.some((r: any) => r.id === "blocked")).toBe(false);
  await call(stub, "POST", "actions/decide", {
    id: "update-note",
    decision: "approve",
    fingerprint: after.actions[0].fingerprint,
  });
  const done = await idle(stub);
  expect(done.actions[0].status).toBe("completed");
  expect(await stub.notes({ facet: "session-initial", epoch: 0 })).toHaveLength(
    1,
  );
});

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
  expect(await stub.notes({ facet: "session-initial", epoch: 0 })).toHaveLength(
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
  await expect(
    call(stub, "POST", "actions/decide", {
      id: "note",
      decision: "approve",
      fingerprint: before.actions[0].fingerprint,
      expectedGeneration: 0,
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await stub.isGenerationActive({ facet: "session-initial", epoch: 0 }),
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
    await stub.notes({ facet: "session-restored-restore", epoch: 1 }),
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

test("HTTP routing keeps legacy URLs separate from checkpoint sessions and requires the visible generation", async () => {
  const id = crypto.randomUUID();
  const request = (area: string, path: string, body?: object) =>
    worker.fetch(
      new Request(
        `http://localhost/api/${area}/${id}/${path}`,
        body
          ? {
              method: "POST",
              headers: {
                "content-type": "application/json",
                origin: "http://localhost",
              },
              body: JSON.stringify(body),
            }
          : undefined,
      ),
      bindings,
    );
  const legacy = (await (await request("sessions", "state")).json()) as any;
  const current = (await (
    await request("checkpoint-sessions", "state")
  ).json()) as any;
  expect(legacy.capabilities.coordinatedCheckpoint).toBeUndefined();
  expect(current.capabilities.coordinatedCheckpoint).toBe(true);
  expect(current.recovery.generation).toBe(0);
  expect(
    (
      await request("checkpoint-sessions", "messages", {
        id: "stale",
        text: "Refuse unseen state",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await request("checkpoint-sessions", "messages", {
        id: "current",
        text: "Saved on the new session only",
        expectedGeneration: 0,
      })
    ).status,
  ).toBe(202);
  expect(
    ((await (await request("sessions", "state")).json()) as any).requests,
  ).toHaveLength(0);
});
