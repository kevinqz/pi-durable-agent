import { env } from "cloudflare:workers";
import {
  abortAllDurableObjects,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { expect, test } from "vitest";
import type { Env, Principal } from "../src/env.js";

const bindings = env as unknown as Env;
const owner: Principal = {
  tenant: "actions-test",
  subject: "owner",
  authorizedUntil: Date.now() + 3600000,
};
const code =
  'async () => { const a = await notes.create({key:"one",text:"Aurora"}); const b = await notes.create({key:"one",text:"Aurora"}); return [a,b]; }';
function session() {
  return bindings.SESSIONS.get(
    bindings.SESSIONS.idFromName(crypto.randomUUID()),
  );
}
async function call(
  stub: ReturnType<typeof session>,
  path: string,
  body = {},
  principal = owner,
): Promise<any> {
  const r = await stub.dispatch(principal, "POST", path, body);
  if (!r.ok) throw Object.assign(new Error(r.error), { status: r.status });
  return JSON.parse(r.value);
}
async function pending(
  stub: ReturnType<typeof session>,
  id: string,
  script = code,
) {
  await call(stub, "actions", { id, code: script, label: "Create Aurora" });
  await runDurableObjectAlarm(stub);
  await expect
    .poll(async () => (await call(stub, "actions/inspect", { id })).status)
    .toBe("pending");
  return call(stub, "actions/inspect", { id });
}

test("official sandbox asks approval, deduplicates effects and durably delivers results", async () => {
  let stub = session();
  let action = await pending(stub, "one");
  expect(action.pending[0].args).toEqual({ key: "one", text: "Aurora" });
  const fingerprint = action.fingerprint;
  await abortAllDurableObjects();
  stub = bindings.SESSIONS.get(stub.id);
  action = await call(stub, "actions/inspect", { id: "one" });
  expect(action.fingerprint).toBe(fingerprint);
  await expect(
    call(stub, "actions/decide", {
      id: "one",
      decision: "approve",
      fingerprint: "wrong",
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    call(
      stub,
      "actions/decide",
      { id: "one", decision: "approve", fingerprint: action.fingerprint },
      { ...owner, subject: "other" },
    ),
  ).rejects.toMatchObject({ status: 403 });
  action = await call(stub, "actions/decide", {
    id: "one",
    decision: "approve",
    fingerprint: action.fingerprint,
  });
  expect(action.status).toBe("pending"); // second call needs its own concrete decision
  const outcomes = await Promise.allSettled([
    call(stub, "actions/decide", {
      id: "one",
      decision: "approve",
      fingerprint: action.fingerprint,
    }),
    call(stub, "actions/decide", {
      id: "one",
      decision: "approve",
      fingerprint: action.fingerprint,
    }),
  ]);
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  action = await call(stub, "actions/inspect", { id: "one" });
  expect(action.status).toBe("completed");
  expect(action.delivered).toBe(true);
  expect(action.archive.bytes).toBeGreaterThan(0);
  await runInDurableObject(stub, (instance) => {
    expect(instance.actions.store.notes()).toHaveLength(1);
  });
  const archive = await call(stub, "actions/archive", { id: "one" });
  expect(archive.result).toHaveLength(2);
  await runInDurableObject(stub, (instance) => {
    const saved = instance.actions.store.get("one")!;
    saved.delivered = false;
    instance.actions.store.put(saved); // crash before outbox acknowledgement
  });
  await call(stub, "actions/inspect", { id: "one" });
  const state = await stub.dispatch(owner, "GET", "state", {});
  expect(
    state.ok &&
      JSON.parse(state.value).requests.filter(
        (r: any) => r.id === "result-one",
      ),
  ).toHaveLength(1);
});

test("unknown dispatch stays inspectable and never starts a replacement execution", async () => {
  const stub = session();
  await stub.dispatch(owner, "GET", "state", {});
  await runInDurableObject(stub, (instance) => {
    instance.actions.store.put({
      id: "uncertain",
      code,
      label: "Uncertain action",
      contract: "notes-v1/schema-1/policy-1/codemode-0.5.3",
      status: "running",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });
    instance.actions.store.createNote("uncertain", "one", "Aurora"); // destination committed before runtime checkpoint
  });
  expect(
    (await call(stub, "actions/inspect", { id: "uncertain" })).status,
  ).toBe("unknown");
  expect(
    (
      await call(stub, "actions", {
        id: "uncertain",
        code,
        label: "Uncertain action",
      })
    ).status,
  ).toBe("unknown");
  await runInDurableObject(stub, (instance) => {
    expect(instance.actions.store.notes()).toHaveLength(1);
  });
});

test("rejection is final and sandbox cannot fetch external URLs", async () => {
  const stub = session();
  const action = await pending(stub, "reject");
  const rejected = await call(stub, "actions/decide", {
    id: "reject",
    decision: "reject",
    fingerprint: action.fingerprint,
  });
  expect(rejected.status).toBe("rejected");
  await runInDurableObject(stub, (instance) => {
    expect(instance.actions.store.notes()).toHaveLength(0);
  });
  await call(stub, "actions", {
    id: "network",
    label: "Blocked network",
    code: 'async () => await fetch("https://example.com")',
  });
  await runDurableObjectAlarm(stub);
  await expect
    .poll(
      async () =>
        (await call(stub, "actions/inspect", { id: "network" })).status,
    )
    .toBe("failed");
});

test("durable admissions retain their contract, including legacy jobs and unsupported versions", async () => {
  const stub = session();
  await stub.dispatch(owner, "GET", "state", {});
  await runInDurableObject(stub, async (instance) => {
    const legacy = { id: "legacy-job", code, label: "Legacy admission" };
    await instance.actions.drive(legacy);
    const saved = instance.actions.store.get(legacy.id)!;
    expect(saved.contract).toBe("notes-v1/schema-1/policy-1/codemode-0.5.3");
    expect(saved.status).toBe("pending");

    const future = {
      id: "future-job",
      code,
      label: "Future admission",
      contract: "unsupported-v2",
    };
    await instance.lifecycle.jobs.push({
      id: `action:${future.id}`,
      fn: "action",
      time: Date.now() + 3600000,
      payload: future,
    });
    await instance.actions.submit(future.id, future.code, future.label);
    await instance.actions.drive(future);
    expect(instance.actions.store.get(future.id)).toMatchObject({
      contract: future.contract,
      status: "unknown",
    });
    expect(instance.actions.store.notes()).toHaveLength(0);

    await instance.actions.submit("new-job", code, "New admission");
    expect(
      instance.lifecycle.jobs.get("action:new-job")?.payload,
    ).toMatchObject({ contract: saved.contract });
  });
});

test("expired and changed-contract approvals cannot execute; oversized results fail explicitly", async () => {
  const stub = session();
  let action = await pending(stub, "expires");
  await expect(
    call(
      stub,
      "actions/decide",
      { id: action.id, decision: "approve", fingerprint: action.fingerprint },
      { ...owner, authorizedUntil: Date.now() - 1 },
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect((await call(stub, "actions/inspect", { id: action.id })).status).toBe(
    "expired",
  );
  action = await pending(stub, "version");
  await runInDurableObject(stub, (instance) => {
    const a = instance.actions.store.get("version")!;
    a.contract = "unsupported-v2";
    instance.actions.store.put(a);
  });
  await expect(
    call(stub, "actions/decide", {
      id: action.id,
      decision: "approve",
      fingerprint: action.fingerprint,
    }),
  ).rejects.toMatchObject({ status: 409 });
  await runInDurableObject(stub, (instance) => {
    expect(instance.actions.store.notes()).toHaveLength(0);
    const saved = instance.actions.store.get("version")!;
    expect(saved.status).toBe("unknown");
    expect(saved.fingerprint).toBe(action.fingerprint);
    expect(saved.pending).toEqual(action.pending);
    saved.contract = action.contract;
    instance.actions.store.put(saved);
  });
  const retained = await call(stub, "actions/inspect", { id: "version" });
  expect(retained.status).toBe("pending");
  expect(retained.fingerprint).toBe(action.fingerprint);
  await call(stub, "actions", {
    id: "large",
    label: "Large result",
    code: 'async () => "x".repeat(300000)',
  });
  await runDurableObjectAlarm(stub);
  await expect
    .poll(
      async () => (await call(stub, "actions/inspect", { id: "large" })).status,
    )
    .toBe("failed");
  expect(
    (await call(stub, "actions/inspect", { id: "large" })).error,
  ).toContain("not retained");
});

test("the Pi extension admits a model tool call and receives its result as one follow-up", async () => {
  const stub = session();
  const submitted = await stub.dispatch(owner, "POST", "messages", {
    id: "demo",
    text: "/demo-note",
  });
  expect(submitted.ok).toBe(true);
  await runDurableObjectAlarm(stub);
  const state = async () => {
    const r = await stub.dispatch(owner, "GET", "state", {});
    if (!r.ok) throw new Error(r.error);
    return JSON.parse(r.value);
  };
  await expect.poll(async () => (await state()).actions.length).toBe(1);
  await runDurableObjectAlarm(stub);
  await expect
    .poll(async () => (await state()).actions[0].status)
    .toBe("pending");
  const action = (await state()).actions[0];
  await call(stub, "actions/decide", {
    id: action.id,
    decision: "approve",
    fingerprint: action.fingerprint,
  });
  await runDurableObjectAlarm(stub);
  await expect
    .poll(
      async () =>
        (await state()).requests.find(
          (r: any) => r.id === `result-${action.id}`,
        )?.status,
    )
    .toBe("completed");
  expect((await state()).actions[0].status).toBe("completed");
  expect(
    JSON.stringify(await call(stub, "memory/search", { query: "Aurora" })),
  ).toContain("Aurora");
});
