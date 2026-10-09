import { env } from "cloudflare:workers";
import {
  abortAllDurableObjects,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { describe, expect, test } from "vitest";
import type { Env, Principal } from "../src/env.js";
import worker from "../src/worker.js";
import { createOptChat } from "optchat-durable/extension";
import { BACKGROUND_CONTEXT as BG } from "@earendil-works/chord/context";

const bindings = env as unknown as Env;
const owner: Principal = {
  tenant: "test",
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
async function settled(stub: ReturnType<typeof session>, id: string) {
  await runDurableObjectAlarm(stub);
  await expect
    .poll(
      async () =>
        (await call(stub, "GET", "state")).requests.find(
          (r: any) => r.id === id,
        )?.status,
    )
    .toBe("completed");
  return call(stub, "GET", "state");
}
async function frozen(stub: ReturnType<typeof session>, id: string) {
  return runInDurableObject(stub, async (instance) => {
    const pi = await instance.pi.pi();
    const model = { provider: "faux", modelId: "local-demo" };
    const optchat = createOptChat({
      main: model,
      compactor: model,
      jobs: 2,
      viewBytes: 16000,
      maxInputBytes: 16000,
      maxOutputTokens: 2048,
    });
    return (await optchat.attach(pi, await pi.root(BG)).request(id))?.frozen;
  });
}

describe("official PiHarness + published OptChat in workerd", () => {
  test("persists duplicate admission, original source and memory across abrupt runtime reset", async () => {
    let stub = session();
    const input = {
      id: "message-1",
      text: "The project is Aurora, ticket 123.",
    };
    const receipts = await Promise.all([
      call(stub, "POST", "messages", input),
      call(stub, "POST", "messages", input),
    ]);
    expect(receipts.map((r) => r.accepted).sort()).toEqual([false, true]);
    let state = await settled(stub, input.id);
    expect(
      state.history.items.filter((m: any) => m.kind === "user"),
    ).toHaveLength(1);
    await expect
      .poll(async () => (await call(stub, "GET", "state")).memory.summarized)
      .toBeGreaterThan(0);
    await call(stub, "POST", "messages", {
      id: "message-2",
      text: "Continue with that project.",
    });
    await settled(stub, "message-2");
    const context = await frozen(stub, "message-2");
    expect(context).toContain("Aurora");
    const before = await call(stub, "GET", "state");
    await expect
      .poll(async () => (await call(stub, "GET", "state")).progress.activeTasks)
      .toBe(0);
    await abortAllDurableObjects();
    stub = bindings.SESSIONS.get(stub.id);
    state = await call(stub, "GET", "state");
    expect(await frozen(stub, "message-2")).toBe(context);
    expect(state.memory.view).toBe(before.memory.view);
    expect(state.history).toEqual(before.history);
    expect(
      JSON.stringify(
        await call(stub, "POST", "memory/search", { query: "Aurora" }),
      ),
    ).toContain("Aurora");
    await expect(
      call(stub, "POST", "messages", { ...input, text: "conflict" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  test("a durable admission job survives before OptChat receives the input", async () => {
    let stub = session();
    await call(stub, "GET", "state");
    await runInDurableObject(stub, async (instance) => {
      await instance.lifecycle.jobs.push({
        id: "request:interrupted",
        fn: "request",
        time: Date.now() + 3600000,
        payload: { id: "interrupted", text: "Recover from durable admission" },
        singleflight: true,
      });
    });
    await abortAllDurableObjects();
    stub = bindings.SESSIONS.get(stub.id);
    await call(stub, "GET", "state");
    await runInDurableObject(stub, async (instance) => {
      await instance.lifecycle.jobs.reschedule(
        "request:interrupted",
        Date.now(),
      );
    });
    const state = await settled(stub, "interrupted");
    expect(state.requests).toHaveLength(1);
  });

  test("another identity cannot inspect or submit to the same object", async () => {
    const stub = session();
    await call(stub, "GET", "state");
    await expect(
      call(stub, "GET", "state", {}, { ...owner, subject: "other" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      call(
        stub,
        "POST",
        "messages",
        { id: "x", text: "attack" },
        { ...owner, subject: "other" },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  test("fails closed outside local demo and rejects cross-origin writes", async () => {
    const unauthenticated = await worker.fetch(
      new Request("https://app.example/api/me"),
      { ...bindings, APP_ENV: "staging" },
    );
    expect(unauthenticated.status).toBe(503);
    const forgedLocal = await worker.fetch(
      new Request("https://app.example/api/me"),
      bindings,
    );
    expect(forgedLocal.status).toBe(503);
    const csrf = await worker.fetch(
      new Request("http://localhost/api/sessions/demo/messages", {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          "Content-Type": "application/json",
        },
        body: '{"id":"bad","text":"bad"}',
      }),
      bindings,
    );
    expect(csrf.status).toBe(403);
  });
});
