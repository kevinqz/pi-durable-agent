import type { OptChatController } from "optchat-durable/extension";
import type { Actions } from "./actions.js";
import type { RequestRow } from "./store.js";
import { digest, HttpError } from "./http.js";

export const EXPORT_FORMAT = "pi-durable-agent/session-export-v1";
export const MAX_EXPORT_BYTES = 8_000_000;
const MAX_HISTORY_PAGES = 100;
const size = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

type Snapshot = {
  mode: string;
  schema: number;
  runtime: { release: string; backend?: string };
  memory: unknown;
  history: Awaited<ReturnType<OptChatController["history"]>>;
  requests: RequestRow[];
  actions: ReturnType<Actions["list"]>;
  usage: unknown;
  progress: { activeTasks: number };
};

function retainedState(state: Snapshot) {
  if (
    state.progress.activeTasks ||
    state.requests.some(
      (r) => !["completed", "failed", "cancelled"].includes(r.status),
    ) ||
    state.actions.some(
      (a) => !["pending", "unknown"].includes(a.status) && !a.delivered,
    )
  )
    throw new HttpError(
      409,
      "Wait for active work and result delivery before exporting",
    );
  return {
    application: {
      name: "pi-durable-agent",
      version: state.runtime.release,
      backendRuntime: state.runtime.backend,
      modelMode: state.mode,
      schema: state.schema,
    },
    memory: state.memory,
    requests: state.requests,
    actions: state.actions,
    usage: state.usage,
    // A changing transcript head also invalidates a capture between requests.
    head: state.history,
  };
}

/** Read-only data export through public history pagination, never a runtime checkpoint. */
export async function createSessionExport(
  snapshot: () => Promise<Snapshot>,
  history: OptChatController["history"],
  archive: (id: string) => string | undefined,
  diagnostics?: () => Promise<unknown>,
) {
  const startedAt = new Date().toISOString();
  const before = retainedState(await snapshot());
  const revision = await digest(JSON.stringify(before));
  let budget = size(before);
  function account(value: unknown) {
    budget += size(value);
    if (budget > MAX_EXPORT_BYTES)
      throw new HttpError(
        413,
        "Export exceeds the 8 MB limit; nothing was truncated or deleted",
      );
  }

  const pages: Awaited<ReturnType<typeof history>>["items"][] = [];
  const cursors = new Set<string>();
  let cursor: Parameters<typeof history>[0];
  for (;;) {
    if (pages.length >= MAX_HISTORY_PAGES)
      throw new HttpError(
        413,
        "Export exceeds the history page limit; no partial archive was created",
      );
    const page = await history(cursor);
    account(page.items);
    pages.push(page.items);
    if (!page.next) break;
    const key = JSON.stringify(page.next);
    if (cursors.has(key))
      throw new HttpError(
        409,
        "History pagination did not advance; export stopped",
      );
    cursors.add(key);
    cursor = page.next;
  }

  const outputs = [];
  for (const action of before.actions) {
    const text = archive(action.id);
    if (text === undefined) {
      if (action.archive)
        throw new HttpError(
          409,
          "A retained action output is missing; export stopped",
        );
      continue;
    }
    // Keep the exact recorded serialization, including non-terminal pause output.
    const bytes = new TextEncoder().encode(text).byteLength;
    const sha256 = await digest(text);
    if (
      action.archive &&
      (action.archive.sha256 !== sha256 || action.archive.bytes !== bytes)
    )
      throw new HttpError(
        409,
        "A retained action output failed its integrity check",
      );
    const output = {
      actionId: action.id,
      statusAtExport: action.status,
      text,
      bytes,
      sha256,
      recordedReferenceVerified: action.archive ? true : null,
    };
    account(output);
    outputs.push(output);
  }
  const modelDiagnostics = await diagnostics?.();
  if (modelDiagnostics !== undefined) account(modelDiagnostics);
  const after = retainedState(await snapshot());
  if ((await digest(JSON.stringify(after))) !== revision)
    throw new HttpError(
      409,
      "The session changed during export; try again after it settles",
    );

  // Pi scans newest pages first; the public controller normalizes each page in
  // chronological order. Reverse pages, not messages within a page.
  const items = pages.reverse().flat();
  const { head: _head, ...data } = before;
  const payload = {
    kind: "session-data-archive",
    restorable: false,
    startedAt,
    completedAt: new Date().toISOString(),
    ...data,
    history: { complete: true, messageCount: items.length, items },
    retainedOutputs: outputs,
    ...(modelDiagnostics === undefined ? {} : { modelDiagnostics }),
    coverage: {
      history:
        "all retained messages normalized by the public OptChat history API",
      memory: "current memory view and counters",
      actions: "application records and retained executor output",
      ...(modelDiagnostics === undefined
        ? {}
        : {
            modelDiagnostics:
              "provider outcomes within the newest 100 Pi entries; no raw prompts or response text",
          }),
      runtimeCheckpoint: false,
      approvalAuthority: false,
    },
  };
  const result = {
    format: EXPORT_FORMAT,
    payload,
    integrity: {
      algorithm: "SHA-256",
      encoding: "UTF-8 JSON.stringify(payload)",
      sha256: await digest(JSON.stringify(payload)),
    },
  };
  if (size(result) > MAX_EXPORT_BYTES)
    throw new HttpError(
      413,
      "Export exceeds the 8 MB limit; no partial archive was created",
    );
  return result;
}
