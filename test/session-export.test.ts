import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { BACKGROUND_CONTEXT as BG } from "@earendil-works/chord/context";
import { AssistantEntry, UserEntry } from "@earendil-works/pi-durable";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { expect, test } from "vitest";
import type { Env, Principal } from "../src/env.js";
import { createSessionExport } from "../src/session-export.js";
import { digest } from "../src/http.js";

const bindings = env as unknown as Env;
const owner: Principal = {
  tenant: "export-test",
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
  body = {},
  principal = owner,
): Promise<any> {
  const result = await stub.dispatch(
    principal,
    path === "state" ? "GET" : "POST",
    path,
    body,
  );
  if (!result.ok)
    throw Object.assign(new Error(result.error), { status: result.status });
  return JSON.parse(result.value);
}
async function idle(stub: ReturnType<typeof session>) {
  await runDurableObjectAlarm(stub);
  await expect
    .poll(async () => {
      const state = await call(stub, "state");
      return (
        state.progress.activeTasks === 0 &&
        state.requests.every((r: any) =>
          ["completed", "failed", "cancelled"].includes(r.status),
        )
      );
    })
    .toBe(true);
}

test("exports every public history page in order without changing the session, and binds access to its owner", async () => {
  const stub = session();
  await call(stub, "messages", { id: "first", text: "Aurora export: ação 🌱" });
  await idle(stub);
  // Public Pi entries make a multi-page fixture without hundreds of model turns.
  await runInDurableObject(stub, async (instance) => {
    const pi = await instance.pi.pi();
    const root = await pi.root(BG);
    await root.commit(async (tx) => {
      for (let i = 0; i < 105; i++)
        await tx.appendEntry(UserEntry, root.id, {
          model: [
            {
              role: "user",
              content: `page fixture ${i}`,
              timestamp: Date.now(),
            },
          ],
        });
    }, BG);
  });
  const before = await call(stub, "state");
  expect(before.history.next).toBeDefined();
  const archive = await call(stub, "exports/session");
  expect(archive.payload.history.complete).toBe(true);
  expect(
    archive.payload.history.items
      .map((m: any) => m.text)
      .filter((t: string) => t.startsWith("page fixture ")),
  ).toEqual(Array.from({ length: 105 }, (_, i) => `page fixture ${i}`));
  expect(archive.payload.history.items[0].text).toBe("Aurora export: ação 🌱");
  expect(archive.payload.history.messageCount).toBe(107);
  expect(archive.payload.memory).toEqual(before.memory);
  expect(archive.integrity.sha256).toBe(
    await digest(JSON.stringify(archive.payload)),
  );
  expect(archive.payload.restorable).toBe(false);
  const after = await call(stub, "state");
  expect(after.requests).toEqual(before.requests);
  expect(after.history).toEqual(before.history);
  expect(after.memory).toEqual(before.memory);
  await expect(
    call(stub, "exports/session", {}, { ...owner, subject: "other" }),
  ).rejects.toMatchObject({ status: 403 });
});

test("retains pending and completed Code Mode output with exact bytes and references", async () => {
  const stub = session();
  await call(stub, "actions", {
    id: "note",
    label: "Export fixture",
    code: 'async () => await notes.create({key:"export",text:"Ação 🌱"})',
  });
  await runDurableObjectAlarm(stub);
  await expect
    .poll(
      async () => (await call(stub, "actions/inspect", { id: "note" })).status,
    )
    .toBe("pending");
  const pending = await call(stub, "exports/session");
  expect(pending.payload.actions[0].status).toBe("pending");
  expect(pending.payload.coverage.approvalAuthority).toBe(false);
  const action = pending.payload.actions[0];
  await call(stub, "actions/decide", {
    id: "note",
    decision: "approve",
    fingerprint: action.fingerprint,
  });
  await idle(stub);
  const result = await call(stub, "exports/session");
  expect(result.payload.actions[0].status).toBe("completed");
  expect(result.payload.retainedOutputs).toHaveLength(1);
  const output = result.payload.retainedOutputs[0];
  expect(output.text).toContain("Ação 🌱");
  expect(output.bytes).toBe(new TextEncoder().encode(output.text).byteLength);
  expect(output.sha256).toBe(await digest(output.text));
  expect(output.recordedReferenceVerified).toBe(true);
  expect(
    result.payload.requests.filter((r: any) => r.id === "result-note"),
  ).toHaveLength(1);
  await runInDurableObject(stub, (instance) =>
    expect(instance.actions.store.notes()).toHaveLength(1),
  );
});

test("exports committed model failures without another inference or copying response text into diagnostics", async () => {
  const stub = session();
  await call(stub, "state");
  await runInDurableObject(stub, async (instance) => {
    const pi = await instance.pi.pi();
    const root = await pi.root(BG);
    await root.commit(
      (tx) =>
        tx.appendEntry(AssistantEntry, root.id, {
          model: [
            fauxAssistantMessage("Private response text", {
              stopReason: "error",
              errorMessage: "Recorded provider failure",
            }),
          ],
        }),
      BG,
    );
  });
  const before = await call(stub, "state");
  const archive = await call(stub, "exports/session");
  expect(archive.payload.application.backendRuntime).toMatch(/^[a-f0-9]{64}$/);
  expect(archive.payload.modelDiagnostics.responses).toEqual([
    expect.objectContaining({
      stopReason: "error",
      error: "Recorded provider failure",
      contentTypes: ["text"],
    }),
  ]);
  expect(JSON.stringify(archive.payload.modelDiagnostics)).not.toContain(
    "Private response text",
  );
  expect(archive.payload.usage).toEqual(before.usage);
  expect((await call(stub, "state")).history).toEqual(before.history);
  expect(archive.integrity.sha256).toBe(
    await digest(JSON.stringify(archive.payload)),
  );
});

const empty = (): Awaited<
  ReturnType<Parameters<typeof createSessionExport>[0]>
> => ({
  mode: "demo",
  schema: 1,
  runtime: { release: "test" },
  memory: {},
  history: { items: [] },
  requests: [],
  actions: [],
  usage: {},
  progress: { activeTasks: 0 },
});
test("refuses active or changing data rather than emitting an inconsistent archive", async () => {
  const state = empty();
  state.progress.activeTasks = 1;
  await expect(
    createSessionExport(
      async () => state,
      async () => ({ items: [] }),
      () => undefined,
    ),
  ).rejects.toMatchObject({ status: 409 });
  state.progress.activeTasks = 0;
  await expect(
    createSessionExport(
      async () => structuredClone(state),
      async () => {
        state.memory = { changed: true };
        return { items: [] };
      },
      () => undefined,
    ),
  ).rejects.toMatchObject({ status: 409 });
});
test("refuses corrupt or missing retained output", async () => {
  const state = empty();
  state.actions.push({
    id: "bad",
    status: "completed",
    delivered: true,
    archive: { bytes: 2, sha256: await digest("ok") },
  } as any);
  for (const text of [undefined, "no"])
    await expect(
      createSessionExport(
        async () => state,
        async () => ({ items: [] }),
        () => text,
      ),
    ).rejects.toMatchObject({ status: 409 });
});
test("bounds oversized data and non-advancing pagination without partial output", async () => {
  const state = empty();
  await expect(
    createSessionExport(
      async () => state,
      async () =>
        ({
          items: [
            {
              entryId: "x",
              kind: "user",
              text: "x".repeat(8_000_001),
              timestamp: 0,
            },
          ],
        }) as any,
      () => undefined,
    ),
  ).rejects.toMatchObject({ status: 413 });
  await expect(
    createSessionExport(
      async () => state,
      async () => ({ items: [], next: { stuck: true } }) as any,
      () => undefined,
    ),
  ).rejects.toMatchObject({ status: 409 });
});
