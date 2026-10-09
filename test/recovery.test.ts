import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Env, Principal } from "../src/env.js";
import { RuntimeRecovery } from "../src/recovery.js";
import { SessionStore } from "../src/store.js";

const bindings = env as unknown as Env;
const owner: Principal = {
  tenant: "recovery-test",
  subject: "owner",
  authorizedUntil: Date.now() + 3600000,
};
function session() {
  return bindings.SESSIONS.get(
    bindings.SESSIONS.idFromName(crypto.randomUUID()),
  );
}
async function call(
  stub: ReturnType<typeof session>,
  path: string,
  body?: object,
  principal = owner,
): Promise<any> {
  const response = await stub.dispatch(
    principal,
    body ? "POST" : "GET",
    path,
    body ?? {},
  );
  if (!response.ok)
    throw Object.assign(new Error(response.error), { status: response.status });
  return JSON.parse(response.value);
}

test("owner-requested platform abort preserves memory, a pending facet and single result delivery", async () => {
  let stub = session();
  await call(stub, "messages", {
    id: "source",
    text: "Restart fixture: preserve cedar 417.",
  });
  await runDurableObjectAlarm(stub);
  await expect
    .poll(async () => {
      const state = await call(stub, "state");
      return (
        state.requests[0]?.status === "completed" &&
        state.progress.activeTasks === 0
      );
    })
    .toBe(true);
  await call(stub, "actions", {
    id: "pending",
    label: "Restart note",
    code: 'async () => await notes.create({key:"restart",text:"Cedar 417"})',
  });
  await runDurableObjectAlarm(stub);
  await expect
    .poll(
      async () =>
        (await call(stub, "actions/inspect", { id: "pending" })).status,
    )
    .toBe("pending");
  const before = await call(stub, "state");
  const input = { activationId: before.runtime.activationId };
  const admitted = await call(stub, "recovery/restart", input);
  expect(admitted.lastRestart.status).toBe("scheduled");
  expect((await call(stub, "recovery/restart", input)).restartCount).toBe(1);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  // ctx.abort deliberately invalidates this invocation. The durable evidence
  // below, not an ignored exception, proves the requested reset took place.
  await runDurableObjectAlarm(stub).catch(() => undefined);
  stub = bindings.SESSIONS.get(stub.id);
  const after = await call(stub, "state");
  expect(after.runtime.activationId).not.toBe(before.runtime.activationId);
  expect(after.runtime.lastRestart.status).toBe("recovered");
  expect(after.runtime.lastRestart.firedAt).toBeGreaterThan(0);
  expect(after.history).toEqual(before.history);
  expect(after.memory.view).toBe(before.memory.view);
  const pending = await call(stub, "actions/inspect", { id: "pending" });
  expect(pending.fingerprint).toBe(before.actions[0].fingerprint);
  expect(pending.pending).toEqual(before.actions[0].pending);
  expect((await call(stub, "recovery/restart", input)).restartCount).toBe(1);
  await call(stub, "actions/decide", {
    id: "pending",
    decision: "approve",
    fingerprint: pending.fingerprint,
  });
  await expect
    .poll(
      async () =>
        (await call(stub, "state")).requests.find(
          (r: any) => r.id === "result-pending",
        )?.status,
    )
    .toBe("completed");
  const result = await call(stub, "state");
  expect(
    result.requests.filter((r: any) => r.id === "result-pending"),
  ).toHaveLength(1);
  expect(
    (await call(stub, "memory/search", { query: "cedar 417" })).matches.length,
  ).toBeGreaterThan(0);
  await runInDurableObject(stub, (instance) => {
    expect(instance.actions.store.notes()).toHaveLength(1);
  });
});

test("restart authorization, environment and idle gates fail without arming a reset", async () => {
  const stub = session();
  const state = await call(stub, "state");
  const input = { activationId: state.runtime.activationId };
  await expect(
    call(stub, "recovery/restart", input, { ...owner, subject: "other" }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    call(stub, "recovery/restart", input, { ...owner, authorizedUntil: 0 }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    call(stub, "recovery/restart", { activationId: "stale" }),
  ).rejects.toMatchObject({ status: 409 });
  await runInDurableObject(stub, async (instance, ctx) => {
    const store = new SessionStore(ctx.storage.sql);
    for (const configuration of [
      { ...bindings, APP_ENV: "production" as const },
      { ...bindings, APP_ENV: "disabled" as const },
      { ...bindings, MODEL_MODE: "workers-ai" as const },
    ]) {
      const recovery = new RuntimeRecovery(
        ctx,
        configuration,
        store,
        () => instance.lifecycle.jobs,
        async () => true,
      );
      await expect(
        recovery.request(recovery.activationId, owner.authorizedUntil),
      ).rejects.toMatchObject({ status: 404 });
    }
    const busy = new RuntimeRecovery(
      ctx,
      bindings,
      store,
      () => instance.lifecycle.jobs,
      async () => false,
    );
    await expect(
      busy.request(busy.activationId, owner.authorizedUntil),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      instance.lifecycle.jobs
        .list()
        .filter((j) => j.fn === "restart-demo-session"),
    ).toHaveLength(0);
    expect(store.meta("recovery:count")).toBeUndefined();
  });
});
