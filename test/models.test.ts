import { env } from "cloudflare:workers";
import { abortAllDurableObjects, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Env, Principal } from "../src/env.js";
import { configureModels } from "../src/models.js";
import { SessionModel, modelProfile } from "../src/session-model.js";
import { SessionStore } from "../src/store.js";
import { RuntimeRecovery } from "../src/recovery.js";

const bindings = env as unknown as Env;
const modelId = "@cf/meta/llama-4-scout-17b-16e-instruct";
const owner: Principal = {
  tenant: "model-test",
  subject: "owner",
  authorizedUntil: Date.now() + 3600000,
};
const instance = () => bindings.SESSIONS.getByName(crypto.randomUUID());

test("configuration is idempotent, owner-bound, immutable and does not initialize Pi on failure", async () => {
  let stub = instance();
  expect(
    await stub.dispatch(owner, "POST", "configuration", { mode: "workers-ai" }),
  ).toMatchObject({ ok: false, status: 503 });
  await runInDurableObject(stub, (object, ctx) => {
    expect(object.lifecycle.isStarted()).toBe(false);
    expect(new SessionStore(ctx.storage.sql).meta("owner")).toBeUndefined();
  });
  const created = await stub.dispatch(owner, "POST", "configuration", {
    mode: "demo",
  });
  expect(created.ok).toBe(true);
  expect(
    await stub.dispatch(owner, "POST", "configuration", { mode: "demo" }),
  ).toEqual(created);
  expect(
    await stub.dispatch(
      { ...owner, subject: "other" },
      "POST",
      "configuration",
      { mode: "demo" },
    ),
  ).toMatchObject({ ok: false, status: 403 });
  await abortAllDurableObjects();
  stub = bindings.SESSIONS.get(stub.id);
  expect(
    await stub.dispatch(owner, "POST", "configuration", { mode: "workers-ai" }),
  ).toMatchObject({ ok: false, status: 409 });
  expect(
    await stub.dispatch({ ...owner, authorizedUntil: 0 }, "GET", "state", {}),
  ).toMatchObject({ ok: false, status: 403 });
});

test("saved real-model configuration and charged attempts survive a runtime reset", async () => {
  let stub = instance();
  const real = {
    ...bindings,
    AI: {} as Ai,
    AI_MODEL: modelId,
    MODEL_CALL_LIMIT: "2",
  };
  await runInDurableObject(stub, (object, ctx) => {
    const store = new SessionStore(ctx.storage.sql);
    const selected = new SessionModel(store, real);
    expect(selected.select("workers-ai", false)).toMatchObject({
      mode: "workers-ai",
      modelId,
      callLimit: 2,
    });
    selected.reserveCall();
    // A dispatch that never reports its outcome still consumes its reservation.
    selected.reserveCall();
    const recovery = new RuntimeRecovery(
      ctx,
      bindings,
      store,
      () => object.lifecycle.jobs,
      async () => true,
      () => selected.profile().mode,
    );
    expect(recovery.describe().restartEnabled).toBe(false);
  });
  await abortAllDurableObjects();
  stub = bindings.SESSIONS.get(stub.id);
  await runInDurableObject(stub, (_object, ctx) => {
    const store = new SessionStore(ctx.storage.sql);
    const reopened = new SessionModel(store, {
      ...real,
      MODEL_CALL_LIMIT: "500",
      AI_MODEL: "@cf/zai-org/glm-4.7-flash",
    });
    expect(reopened.profile()).toMatchObject({ modelId, callLimit: 2 });
    expect(() => reopened.reserveCall()).toThrow("2 model-call limit");
    expect(store.meta("modelCalls")).toBe("2");
  });
});

test("real-model configuration rejects invalid budgets and incompatible catalog entries", () => {
  const real = { ...bindings, AI: {} as Ai, AI_MODEL: modelId };
  for (const limit of ["0", "501", "1.5", "-1", "NaN", "1e2", " 2"])
    expect(() =>
      modelProfile({ ...real, MODEL_CALL_LIMIT: limit }, "workers-ai"),
    ).toThrow("MODEL_CALL_LIMIT");
  for (const id of [
    "@cf/unknown",
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    "anthropic/claude",
  ])
    expect(() =>
      modelProfile({ ...real, AI_MODEL: id }, "workers-ai"),
    ).toThrow();
});

test("the official Workers AI adapter observes pre-dispatch budget and output bounds on both stream APIs", async () => {
  const dispatched: Array<{ model: string; input: any }> = [];
  const ai = {
    async run(model: string, input: any) {
      dispatched.push({ model, input });
      return Response.json({
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Local provider fixture" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
      });
    },
  } as unknown as Ai;
  let attempts = 0;
  const { models, model: reference } = configureModels(
    { ...bindings, MODEL_MODE: "workers-ai", AI: ai, AI_MODEL: modelId },
    () => {
      if (attempts >= 2) throw new Error("fixture call budget exhausted");
      attempts++;
    },
  );
  const model = models.getModel(reference.provider, reference.modelId)!;
  const context = {
    messages: [
      { role: "user" as const, content: "Hello", timestamp: Date.now() },
    ],
  };
  for (const method of ["streamSimple", "stream"] as const) {
    const result = await models[method](model, context, {
      maxTokens: 10000,
    }).result();
    expect(result.stopReason).toBe("stop");
    expect(result.usage.totalTokens).toBe(14);
  }
  expect(dispatched).toHaveLength(2);
  expect(
    dispatched.every(
      (call) => call.model === modelId && call.input.max_tokens === 2048,
    ),
  ).toBe(true);
  expect(await models.streamSimple(model, context).result()).toMatchObject({
    stopReason: "error",
    errorMessage: expect.stringContaining("budget exhausted"),
  });
  expect(
    await models
      .stream(model, {
        messages: [
          { role: "user", content: "x".repeat(150000), timestamp: Date.now() },
        ],
      })
      .result(),
  ).toMatchObject({
    stopReason: "error",
    errorMessage: expect.stringContaining("byte allowance"),
  });
  const other = models.getModel("cloudflare", "@cf/zai-org/glm-4.7-flash")!;
  expect(await models.streamSimple(other, context).result()).toMatchObject({
    stopReason: "error",
    errorMessage: expect.stringContaining("configured model"),
  });
  expect(dispatched).toHaveLength(2);
});

test("supervisor admission completes before either provider stream dispatches and denies without spending", async () => {
  let dispatched = 0;
  const ai = {
    async run() {
      dispatched++;
      return Response.json({
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "fixture" },
            finish_reason: "stop",
          },
        ],
      });
    },
  } as unknown as Ai;
  let release!: () => void;
  let deny = false;
  let reservations = 0;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { models, model: ref } = configureModels(
    { ...bindings, MODEL_MODE: "workers-ai", AI: ai, AI_MODEL: modelId },
    () => {},
    async () => {
      if (deny) throw new Error("Fixture generation is frozen");
      reservations++;
      await ready;
    },
  );
  const model = models.getModel(ref.provider, ref.modelId)!;
  const context = {
    messages: [
      { role: "user" as const, content: "hello", timestamp: Date.now() },
    ],
  };
  const streams = [
    models.stream(model, context),
    models.streamSimple(model, context),
  ];
  expect(dispatched).toBe(0);
  await expect.poll(() => reservations).toBe(2);
  expect(dispatched).toBe(0);
  release();
  for (const stream of streams)
    expect((await stream.result()).stopReason).toBe("stop");
  expect(dispatched).toBe(2);
  deny = true;
  for (const method of ["stream", "streamSimple"] as const)
    expect(await models[method](model, context).result()).toMatchObject({
      stopReason: "error",
      errorMessage: expect.stringContaining("frozen"),
    });
  expect(dispatched).toBe(2);
  expect(reservations).toBe(2);
});
