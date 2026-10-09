import { DurableObject } from "cloudflare:workers";
import { BACKGROUND_CONTEXT as BG } from "@earendil-works/chord/context";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { PiHarness, type PiHarnessOptions } from "agents/harness/pi";
import {
  Lifecycle,
  type LifecycleJobContext,
  type LifecycleJobOutcome,
} from "agents/lifecycle";
import {
  createOptChat,
  type OptChatController,
} from "optchat-durable/extension";
import { LIMITS, type Env, type Principal } from "./env.js";
import { digest, HttpError, identifier, textField } from "./http.js";
import { configureModels } from "./models.js";
import { SerialGate, SessionStore } from "./store.js";
import { Actions } from "./actions.js";
import type { ActionAdmission } from "./action-contracts.js";
import { actionTools } from "./tools.js";
import { RuntimeRecovery } from "./recovery.js";
import { createSessionExport } from "./session-export.js";
import { SessionModel } from "./session-model.js";
import type { NotesDestination } from "./notes.js";

type SessionLifecycle = Pick<Lifecycle<Env>, "jobs" | "start" | "isStarted">;
export type SessionHost = {
  harness(options: PiHarnessOptions): PiHarness;
  install(session: AgentSession): SessionLifecycle;
  beforeCall(): Promise<void>;
  guard(): Promise<void>;
  destination: NotesDestination;
};

export class AgentSession extends DurableObject<Env> {
  readonly lifecycle: SessionLifecycle;
  readonly pi: PiHarness;
  readonly actions: Actions;
  readonly recovery: RuntimeRecovery;
  private readonly store: SessionStore;
  private readonly sessionModel: SessionModel;
  private readonly gate = new SerialGate();
  private chat!: OptChatController;

  constructor(
    ctx: DurableObjectState,
    env: Env,
    private readonly host?: SessionHost,
  ) {
    super(ctx, env);
    this.store = new SessionStore(ctx.storage.sql);
    this.sessionModel = new SessionModel(this.store, env);
    this.actions = new Actions(
      ctx,
      env,
      () => this.lifecycle.jobs,
      async (id, text) => {
        await this.admitMessage(id, text, true);
      },
      host?.destination,
    );
    const tools = actionTools(this.actions);
    const options: PiHarnessOptions = {
      harness: async ({ storage, context }) => {
        const profile = this.sessionModel.profile();
        const { models, model } = configureModels(
          { ...env, MODEL_MODE: profile.mode, AI_MODEL: profile.modelId },
          () => {
            if (!host) this.sessionModel.reserveCall();
          },
          host && (() => host.beforeCall()),
        );
        const optchat = createOptChat({
          main: model,
          compactor: model,
          jobs: 2,
          viewBytes: 16_000,
          maxInputBytes: LIMITS.inputBytes,
          maxOutputTokens: 2048,
        });
        const registry = createRegistry();
        registry.install(optchat.extension);
        registry.install(tools);
        await optchat.prepare(storage, {}, context);
        const harness = await Harness.open(
          storage,
          { models, registry, settings: optchat.settings },
          context,
        );
        const conversation = await harness.root(context, {
          agent: {
            model,
            extensions: [optchat.extension, tools],
            instructions:
              "Reply in the user's language. Demo responses are explicitly simulated.",
          },
        });
        this.chat = optchat.attach(harness, conversation, context);
        return harness;
      },
    };
    this.pi = host ? host.harness(options) : new PiHarness(options);
    this.lifecycle = host
      ? host.install(this)
      : Lifecycle.install(this).use(this.pi);
    this.recovery = new RuntimeRecovery(
      ctx,
      env,
      this.store,
      () => this.lifecycle.jobs,
      async () => {
        const state = await this.chat.status();
        for (const request of state.requests)
          await this.refreshRequest(request.id);
        return (
          state.tasks === 0 &&
          this.store
            .list()
            .every((r) =>
              ["completed", "failed", "cancelled"].includes(r.status),
            ) &&
          this.actions
            .list()
            .every((a) => a.status === "pending" || a.delivered)
        );
      },
      () => this.sessionModel.profile().mode,
    );
  }

  // Only the authenticated outer Worker has the namespace binding. No HTTP bypass.
  onRequest(): Response {
    return new Response("Not found", { status: 404 });
  }

  async dispatch(
    principal: Principal,
    method: string,
    path: string,
    body: Record<string, unknown>,
  ): Promise<
    { ok: true; value: string } | { ok: false; error: string; status: number }
  > {
    try {
      return {
        ok: true,
        value: JSON.stringify(await this.route(principal, method, path, body)),
      };
    } catch (error) {
      if (error instanceof HttpError)
        return { ok: false, error: error.message, status: error.status };
      throw error;
    }
  }

  private async route(
    principal: Principal,
    method: string,
    path: string,
    body: Record<string, unknown>,
  ) {
    if (principal.authorizedUntil <= Date.now())
      throw new HttpError(403, "Authorization expired");
    await this.host?.guard();
    const existed = this.store.meta("owner") !== undefined;
    if (method === "POST" && path === "configuration")
      return this.ctx.storage.transactionSync(() => {
        this.store.bind(principal);
        return this.sessionModel.select(body.mode, existed);
      });
    this.ctx.storage.transactionSync(() => {
      this.store.bind(principal);
      this.sessionModel.profile();
    });
    await this.lifecycle.start();
    if (method === "GET" && path === "state") return this.snapshot();
    if (method === "GET" && path === "history") return this.chat.history();
    if (method === "POST" && path === "exports/session")
      return createSessionExport(
        () => this.snapshot(),
        (cursor) => this.chat.history(cursor),
        (id) => this.actions.store.readArchive(id),
      );
    if (method === "POST" && path === "recovery/restart") {
      if (this.host)
        throw new HttpError(404, "Use the supervisor recovery controls");
      return this.recovery.request(
        identifier(body.activationId, "activation ID"),
        principal.authorizedUntil,
      );
    }
    if (method === "POST" && path === "actions")
      return this.actions.submit(
        identifier(body.id),
        textField(body.code, 16_000, "Code"),
        textField(body.label, 200, "Label"),
      );
    if (method === "POST" && path === "actions/inspect")
      return this.actions.inspect(identifier(body.id));
    if (method === "POST" && path === "actions/decide") {
      if (body.decision !== "approve" && body.decision !== "reject")
        throw new HttpError(400, "Invalid decision");
      return this.actions.decide(
        identifier(body.id),
        body.decision,
        textField(body.fingerprint, 128, "Fingerprint"),
        principal.authorizedUntil,
      );
    }
    if (method === "POST" && path === "actions/archive") {
      const data = this.actions.store.readArchive(identifier(body.id));
      if (!data) throw new HttpError(404, "No retained archive");
      return JSON.parse(data);
    }
    if (method === "POST" && path === "messages") {
      const id = identifier(body.id, "request ID");
      if (id.startsWith("result-"))
        throw new HttpError(400, "Request ID uses a reserved delivery prefix");
      const text = textField(body.text, LIMITS.inputBytes, "Message");
      return this.admitMessage(id, text);
    }
    if (method === "POST" && path === "cancel") {
      return this.gate.run(async () => {
        const id = identifier(body.id);
        await this.refreshRequest(id);
        const row = this.store.get(id);
        if (!row) throw new HttpError(404, "Unknown request");
        if (["completed", "failed", "cancelled"].includes(row.status))
          return { id, status: row.status };
        const request = await this.chat.request(id);
        if (request) {
          await this.chat.cancel(id);
          await this.refreshRequest(id);
        } else this.store.update(id, "cancelled");
        // Keep a wake for already spawned work. Never remove its only alarm here.
        return { id, status: this.store.get(id)!.status };
      });
    }
    if (method === "POST" && path === "memory/search")
      return this.chat.search(textField(body.query, 512, "Query"));
    throw new HttpError(404, "Unknown operation");
  }

  async onJob({ job }: LifecycleJobContext): Promise<LifecycleJobOutcome> {
    await this.host?.guard();
    if (job.fn === "restart-demo-session") {
      await this.recovery.drive(
        job.payload as Parameters<RuntimeRecovery["drive"]>[0],
      );
      return;
    }
    if (job.fn === "action")
      return this.actions.drive(job.payload as ActionAdmission);
    if (job.fn !== "request") return;
    return this.gate.run(async () => {
      const { id, text } = job.payload as { id: string; text: string };
      this.store.admit(id, text);
      if (this.store.get(id)?.status !== "cancelled") {
        const { taskId } = await this.chat.enqueue(text, id);
        this.store.update(id, "running", Number(taskId));
        await this.refreshRequest(id);
      }
      const active = (await (await this.pi.pi()).inspect(BG)).tasks;
      if (active.length)
        return { rescheduleAt: Date.now() + LIMITS.heartbeatMs };
    });
  }

  private admitMessage(id: string, text: string, internal = false) {
    return this.gate.run(async () => {
      this.store.checkAdmission(id, text, internal);
      const job = this.lifecycle.jobs.get(`request:${id}`);
      if (job && (job.payload as { text: string }).text !== text)
        throw new HttpError(409, "Request ID conflict");
      if (this.store.get(id)) return { id, accepted: false };
      // Durable wake + original input precede admission to OptChat. The job can
      // replay enqueue safely even if a crash loses this HTTP response.
      await this.lifecycle.jobs.push({
        id: `request:${id}`,
        fn: "request",
        time: Date.now(),
        payload: { id, text },
        singleflight: true,
        recoveryLoop: true,
      });
      this.store.admit(id, text);
      return { id, accepted: true };
    });
  }

  private async refreshRequest(id: string) {
    const request = await this.chat.request(id);
    if (!request) return;
    const task = request.task
      ? await this.chat.harness.getTask(request.task, BG)
      : undefined;
    const outcome =
      task?.state.status === "terminal" ? task.state.outcome : undefined;
    const status =
      outcome?.status === "faulted"
        ? "failed"
        : request.status === "done"
          ? "completed"
          : request.status;
    const error =
      outcome?.status === "faulted"
        ? outcome.error.message
        : (request.error ?? null);
    this.store.update(
      id,
      status,
      request.task ? Number(request.task) : undefined,
      error,
    );
  }

  private async snapshot() {
    const state = await this.chat.status();
    for (const request of state.requests) await this.refreshRequest(request.id);
    const rows = this.store.list();
    return {
      mode: this.sessionModel.profile().mode,
      model: this.sessionModel.profile(),
      schema: 1,
      capabilities: { sessionDataExport: true },
      runtime: this.recovery.describe(),
      memory: state.memory,
      history: await this.chat.history(),
      requests: rows,
      actions: this.actions.list(),
      progress: {
        activeTasks: state.tasks,
        durableWakes: this.lifecycle.jobs.list().length,
        modelCalls: Number(this.store.meta("modelCalls") ?? 0),
        modelCallLimit: this.sessionModel.profile().callLimit,
        pendingApprovals: this.actions
          .list()
          .filter((a) => a.status === "pending").length,
        unknownActions: this.actions
          .list()
          .filter((a) => a.status === "unknown").length,
        archiveBytes: this.actions
          .list()
          .reduce((sum, a) => sum + (a.archive?.bytes ?? 0), 0),
        oldestPendingMs: rows
          .filter(
            (r) => !["completed", "failed", "cancelled"].includes(r.status),
          )
          .reduce((age, r) => Math.max(age, Date.now() - r.created_at), 0),
      },
      usage: state.usage,
    };
  }

  /** Maintenance-only evidence. The caller must fence admission before entering. */
  async checkpointProof(): Promise<string> {
    await this.lifecycle.start();
    const state = await this.chat.status();
    for (const request of state.requests) await this.refreshRequest(request.id);
    if (
      state.tasks ||
      this.store
        .list()
        .some((r) => !["completed", "failed", "cancelled"].includes(r.status))
    )
      throw new HttpError(409, "Wait for messages and summaries to finish");
    const { payload } = await createSessionExport(
      () => this.snapshot(),
      (cursor) => this.chat.history(cursor),
      (id) => this.actions.store.readArchive(id),
    );
    const { startedAt: _start, completedAt: _end, ...retained } = payload;
    return digest(
      JSON.stringify({
        retained,
        memory: state,
        executions: await this.actions.checkpointEvidence(),
      }),
    );
  }
}
