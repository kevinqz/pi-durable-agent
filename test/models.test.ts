import { env } from "cloudflare:workers";
import { abortAllDurableObjects, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Env, Principal } from "../src/env.js";
import { configureModels } from "../src/models.js";
import { SessionModel, modelProfile } from "../src/session-model.js";
import { SessionStore } from "../src/store.js";
import { RuntimeRecovery } from "../src/recovery.js";
import type { TranscriptContext } from "@earendil-works/pi-ai";
import { workersAiPayloadHook } from "../src/workers-ai-payload.js";

const bindings = env as unknown as Env;
const modelId = "@cf/meta/llama-4-scout-17b-16e-instruct";
const owner: Principal = {
  tenant: "model-test",
  subject: "owner",
  authorizedUntil: Date.now() + 3600000,
};
const instance = () => bindings.SESSIONS.getByName(crypto.randomUUID());

test("GPT-OSS receives exact flattened text and native tools through both official adapter entry points", async () => {
  const dispatched: any[] = [];
  const code = 'async () => await notes.create({key:"fixture",text:"Fixture"})';
  const ai = {
    async run(_model: string, input: any) {
      dispatched.push(input);
      if (input.messages.some((message: any) => Array.isArray(message.content)))
        throw new Error("Bad input: content array not in string");
      return Response.json({
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  id: "native-call",
                  type: "function",
                  function: {
                    name: "codemode",
                    arguments: JSON.stringify({ code, label: "Fixture" }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });
    },
  } as unknown as Ai;
  let reservations = 0;
  const { models, model: ref } = configureModels(
    {
      ...bindings,
      MODEL_MODE: "workers-ai",
      AI: ai,
      AI_MODEL: "@cf/openai/gpt-oss-120b",
    },
    () => {},
    async () => {
      reservations++;
    },
  );
  const model = models.getModel(ref.provider, ref.modelId)!;
  const context: TranscriptContext = {
    messages: [
      {
        role: "system",
        content: "Keep instructions.",
        timestamp: 0,
        toolsAdded: [
          {
            name: "codemode",
            description: "Request an approved action.",
            parameters: {
              type: "object",
              properties: {
                code: { type: "string" },
                label: { type: "string" },
              },
              required: ["code", "label"],
            },
          },
        ],
      },
      {
        role: "user",
        content: [
          { type: "text", text: "<chat>\nAurora 🌱\n</chat>\n\n" },
          { type: "text", text: "Create a note." },
        ],
        timestamp: 1,
      },
    ],
  };
  const before = structuredClone(context);
  for (const method of ["stream", "streamSimple"] as const) {
    const outcome = await models[method](model, context, {
      maxTokens: 10_000,
      onPayload: async (payload: any) => ({ ...payload, temperature: 0.2 }),
    }).result();
    expect(outcome.stopReason).toBe("toolUse");
    expect(outcome.content).toContainEqual(
      expect.objectContaining({
        type: "toolCall",
        name: "codemode",
        arguments: { code, label: "Fixture" },
      }),
    );
  }
  expect(reservations).toBe(2);
  expect(dispatched).toHaveLength(2);
  for (const input of dispatched) {
    expect(input.messages).toEqual([
      { role: "system", content: "Keep instructions." },
      { role: "user", content: "<chat>\nAurora 🌱\n</chat>\n\nCreate a note." },
    ]);
    expect(input.tools[0]).toMatchObject({
      type: "function",
      function: { name: "codemode" },
    });
    expect(input.max_tokens).toBe(2048);
    expect(input.temperature).toBe(0.2);
  }
  expect(context).toEqual(before);
  const mixed = {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Keep" },
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,AA==" },
          },
        ],
      },
    ],
  };
  expect(await workersAiPayloadHook()(mixed, model)).toEqual(mixed);
  const scout = models.getModel("cloudflare", modelId)!;
  const segmented = {
    messages: [{ role: "user", content: [{ type: "text", text: "Keep" }] }],
  };
  expect(await workersAiPayloadHook()(segmented, scout)).toBe(segmented);
});

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

test("empty provider completions fail without retrying or losing usage on either stream API", async () => {
  let attempts = 0;
  const ai = {
    async run() {
      return new Response(
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: {"response":"","usage":{"prompt_tokens":10,"completion_tokens":0,"total_tokens":10}}\n\ndata: [DONE]\n\n',
        { headers: { "content-type": "text/event-stream" } },
      );
    },
  } as unknown as Ai;
  const { models, model: ref } = configureModels(
    { ...bindings, MODEL_MODE: "workers-ai", AI: ai, AI_MODEL: modelId },
    () => {
      attempts++;
    },
  );
  const model = models.getModel(ref.provider, ref.modelId)!;
  const context: TranscriptContext = {
    messages: [
      { role: "user", content: "Use the tool", timestamp: Date.now() },
    ],
  };
  for (const method of ["stream", "streamSimple"] as const) {
    const stream = models[method](model, context);
    const events = [];
    for await (const event of stream) events.push(event.type);
    expect(events.at(-1)).toBe("error");
    expect(events).not.toContain("done");
    expect(await stream.result()).toMatchObject({
      stopReason: "error",
      errorMessage: "The model returned no text or tool call.",
      usage: { input: 10, output: 0, totalTokens: 10 },
    });
  }
  expect(attempts).toBe(2);
});

test("the official adapter retains native tool-only responses through the asynchronous guard", async () => {
  const code = 'async () => await notes.create({key:"fixture",text:"Fixture"})';
  const ai = {
    async run() {
      return new Response(
        `data: ${JSON.stringify({ tool_calls: [{ name: "codemode", arguments: { code, label: "Fixture" } }] })}\n\ndata: [DONE]\n\n`,
        { headers: { "content-type": "text/event-stream" } },
      );
    },
  } as unknown as Ai;
  let reservations = 0;
  const { models, model: ref } = configureModels(
    { ...bindings, MODEL_MODE: "workers-ai", AI: ai, AI_MODEL: modelId },
    () => {},
    async () => {
      reservations++;
    },
  );
  const model = models.getModel(ref.provider, ref.modelId)!;
  for (const method of ["stream", "streamSimple"] as const) {
    const result = await models[method](model, {
      messages: [
        { role: "user", content: "Create a note", timestamp: Date.now() },
      ],
    }).result();
    expect(result.stopReason).toBe("toolUse");
    expect(result.content).toEqual([
      expect.objectContaining({
        type: "toolCall",
        name: "codemode",
        arguments: { code, label: "Fixture" },
      }),
    ]);
  }
  expect(reservations).toBe(2);
});
