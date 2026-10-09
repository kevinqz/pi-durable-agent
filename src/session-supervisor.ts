import { DurableObject } from "cloudflare:workers";
import { Lifecycle, type LifecycleJobContext } from "agents/lifecycle";
import { ActionsStore, CONTRACT_V1, type Action } from "./actions-store.js";
import {
  CheckpointCoordinator,
  type SessionGeneration,
} from "./checkpoint-coordinator.js";
import type { Env, Principal } from "./env.js";
import { LIMITS } from "./env.js";
import { FacetLifecycle } from "./facet-lifecycle.js";
import { HttpError, identifier, textField } from "./http.js";
import { AgentSession } from "./session.js";
import { SessionModel, type ModelProfile } from "./session-model.js";
import { SerialGate, SessionStore } from "./store.js";

export interface RecoveryEnv extends Env {
  RECOVERY_SESSIONS: DurableObjectNamespace<SessionSupervisor>;
  // The isolated recovery entrypoint requires an exact build identity. A release
  // pipeline must supply it; a version label alone does not prove compatibility.
  CHECKPOINT_RUNTIME: string;
}
type FacetProps = {
  rootId: string;
  generation: SessionGeneration;
  profile: ModelProfile;
};
const FROZEN = "supervisor:frozen";

/** Root metadata, budgets and destination receipts never participate in a rewind. */
export class SessionSupervisor extends DurableObject<RecoveryEnv> {
  readonly lifecycle = Lifecycle.install(this);
  readonly checkpoints: CheckpointCoordinator;
  private readonly gate = new SerialGate();
  private readonly store: SessionStore;
  private readonly model: SessionModel;
  private readonly destination: ActionsStore;

  constructor(ctx: DurableObjectState, env: RecoveryEnv) {
    super(ctx, env);
    this.store = new SessionStore(ctx.storage.sql);
    this.model = new SessionModel(this.store, env);
    this.destination = new ActionsStore(ctx.storage);
    this.checkpoints = new CheckpointCoordinator(
      ctx.storage,
      env.CHECKPOINT_RUNTIME,
      {
        quiesce: (generation) => this.child(generation).freeze(),
        abort: (facet) =>
          ctx.facets.abort(facet, new Error("Coordinated recovery boundary")),
        clone: (source, target) => ctx.facets.clone(source, target),
        validate: async (facet, proof) => {
          const generation = {
            facet,
            epoch: this.checkpoints.status().active.epoch + 1,
          };
          if ((await this.child(generation).freeze()) !== proof)
            throw new HttpError(
              409,
              "Restored state did not match the checkpoint evidence",
            );
        },
        activate: async (generation) => {
          await this.arm(generation);
          await this.child(generation).releaseFreeze();
        },
      },
    );
  }

  onRequest() {
    return new Response("Not found", { status: 404 });
  }

  private child(generation: SessionGeneration) {
    const props: FacetProps = {
      rootId: this.ctx.id.toString(),
      generation,
      profile: this.model.profile(),
    };
    // A Worker export with props is the native facet class mechanism. No private
    // SDK registry or Code Mode facet path is read or rewritten.
    const exports = this.ctx.exports as {
      SessionFacet: (options: {
        props: FacetProps;
      }) => DurableObjectClass<SessionFacet>;
    };
    return this.ctx.facets.get<SessionFacet>(generation.facet, () => ({
      class: exports.SessionFacet({ props }),
    }));
  }

  isGenerationActive(generation: SessionGeneration) {
    try {
      this.checkpoints.assertActive(generation);
      return true;
    } catch (error) {
      if (error instanceof HttpError) return false;
      throw error;
    }
  }

  beforeModelCall(generation: SessionGeneration) {
    this.ctx.storage.transactionSync(() => {
      this.checkpoints.assertActive(generation);
      if (this.model.profile().mode !== "demo") this.model.reserveCall();
    });
  }

  notes(generation: SessionGeneration) {
    this.checkpoints.assertActive(generation);
    return this.destination.notes();
  }

  createNote(
    generation: SessionGeneration,
    action: Action,
    key: string,
    text: string,
  ) {
    identifier(action.id, "action ID");
    identifier(key, "note key");
    textField(text, 4000, "Note");
    textField(action.code, 16_000, "Code");
    return this.ctx.storage.transactionSync(() => {
      this.checkpoints.assertActive(generation);
      if (
        action.contract !== CONTRACT_V1 ||
        action.status !== "running" ||
        !action.approvedFingerprint ||
        action.approvedFingerprint !== action.fingerprint ||
        !action.approvedUntil ||
        action.approvedUntil <= Date.now() ||
        action.expiresAt <= Date.now()
      )
        throw new HttpError(
          403,
          "Action has no current execution authorization",
        );
      const address = `destination:action:${action.id}`;
      const identity = JSON.stringify([action.contract, action.code]);
      const old = this.ctx.storage.kv.get<string>(address);
      if (old && old !== identity)
        throw new HttpError(
          409,
          "This action ID already performed an effect with different code",
        );
      const notes = this.destination.notes();
      if (
        notes.length >= 100 &&
        !notes.some((note) => note.action_id === action.id && note.key === key)
      )
        throw new HttpError(
          429,
          "This destination reached its 100-note allowance",
        );
      this.ctx.storage.kv.put(address, identity);
      return this.destination.createNote(action.id, key, text);
    });
  }

  private arm(
    generation: SessionGeneration,
    time = Date.now() + LIMITS.heartbeatMs,
  ) {
    return this.lifecycle.jobs.push({
      id: `generation:${generation.epoch}`,
      fn: "generation",
      time,
      payload: generation,
      singleflight: true,
      recoveryLoop: true,
    });
  }

  async wake(generation: SessionGeneration, time?: number) {
    // Pi may finish a best-effort wake after its subtree has been retired. This
    // acknowledgement cannot admit work for a stale or temporarily frozen copy.
    if (!this.isGenerationActive(generation)) return;
    if (time !== undefined && (!Number.isSafeInteger(time) || time < 0))
      throw new Error("Invalid child wake time");
    await this.arm(
      generation,
      Math.min(
        time ?? Date.now() + LIMITS.heartbeatMs,
        Date.now() + LIMITS.heartbeatMs,
      ),
    );
  }

  async dispatch(
    principal: Principal,
    method: string,
    path: string,
    body: Record<string, unknown>,
  ) {
    try {
      return {
        ok: true as const,
        value: JSON.stringify(
          await this.gate.run(async () => {
            if (principal.authorizedUntil <= Date.now())
              throw new HttpError(403, "Authorization expired");
            const existed = this.store.meta("owner") !== undefined;
            this.ctx.storage.transactionSync(() => {
              this.store.bind(principal);
              if (method === "POST" && path === "configuration")
                this.model.select(body.mode, existed);
              else this.model.profile();
            });
            if (method === "POST" && path === "configuration")
              return this.model.profile();
            await this.lifecycle.start();
            if (method === "GET" && path === "checkpoints")
              return this.recoveryState();
            if (
              method === "POST" &&
              [
                "checkpoints/create",
                "checkpoints/restore",
                "checkpoints/resume",
                "checkpoints/cancel",
              ].includes(path)
            ) {
              const id = identifier(body.id, "Recovery operation ID");
              const checkpointId =
                path === "checkpoints/restore"
                  ? identifier(body.checkpointId, "Checkpoint ID")
                  : id;
              if (
                path === "checkpoints/create" ||
                path === "checkpoints/restore"
              ) {
                const existing = this.checkpoints.checkAdmission(
                  id,
                  path === "checkpoints/create" ? "backup" : "restore",
                  checkpointId,
                );
                if (!existing) {
                  const generation = this.checkpoints.status().active;
                  await this.arm(generation);
                  const prepared =
                    await this.child(generation).prepareCheckpoint();
                  if (!prepared.ready) throw new HttpError(409, prepared.error);
                }
              }
              if (
                path === "checkpoints/resume" ||
                path === "checkpoints/cancel"
              ) {
                const existing = this.checkpoints.operation(id);
                if (!existing)
                  throw new HttpError(404, "Unknown recovery operation");
                if (
                  path === "checkpoints/cancel" &&
                  existing.phase === "activating"
                )
                  throw new HttpError(
                    409,
                    "Activation must finish; resume this operation",
                  );
              }
              // The root recovery wake is durable before the journal can freeze input.
              await this.lifecycle.jobs.push({
                id: `checkpoint:${id}`,
                fn: "checkpoint",
                time: Date.now() + 1000,
                payload: { id, cancel: path === "checkpoints/cancel" },
                singleflight: true,
                recoveryLoop: true,
              });
              this.ctx.storage.kv.put(`checkpoint:attempts:${id}`, 0);
              if (path === "checkpoints/create")
                return this.checkpoints.beginBackup(id);
              if (path === "checkpoints/restore")
                return this.checkpoints.beginRestore(id, checkpointId);
              const operation = this.checkpoints.operation(id);
              if (!operation)
                throw new HttpError(404, "Unknown recovery operation");
              return operation;
            }
            const generation = this.checkpoints.status().active;
            this.checkpoints.assertActive(generation);
            await this.arm(generation);
            const result = await this.child(generation).dispatch(
              principal,
              method,
              path,
              body,
            );
            if (!result.ok) throw new HttpError(result.status, result.error);
            const value = JSON.parse(result.value);
            if (method === "GET" && path === "state") {
              value.capabilities.coordinatedCheckpoint = true;
              value.recovery = this.recoveryState();
              value.progress.modelCalls = Number(
                this.store.meta("modelCalls") ?? 0,
              );
              value.runtime.restartEnabled = false;
            }
            return value;
          }),
        ),
      };
    } catch (error) {
      if (error instanceof HttpError)
        return {
          ok: false as const,
          error: error.message,
          status: error.status,
        };
      throw error;
    }
  }

  private recoveryState() {
    const catalog = this.checkpoints.status();
    return {
      generation: catalog.active.epoch,
      busy: catalog.busy ? this.checkpoints.operation(catalog.busy) : undefined,
      checkpoints: this.checkpoints
        .checkpoints()
        .map(({ id, createdAt, runtime }) => ({ id, createdAt, runtime })),
      operations: catalog.operations,
      restores: catalog.restores,
      scope: "same-object-facet-subtree",
    };
  }

  async onJob({ job, attempt }: LifecycleJobContext) {
    return this.gate.run(async () => {
      if (job.fn === "checkpoint") {
        const { id, cancel } = job.payload as { id: string; cancel: boolean };
        if (!this.checkpoints.operation(id)) return;
        const attemptsKey = `checkpoint:attempts:${id}`;
        const attempts =
          (this.ctx.storage.kv.get<number>(attemptsKey) ?? 0) + 1;
        this.ctx.storage.kv.put(attemptsKey, attempts);
        if (attempts > 3) return;
        // Bounded automatic retries. A persisted failed phase remains inspectable
        // and resumable; no busy loop and no destructive fallback is used.
        try {
          if (cancel) await this.checkpoints.cancel(id);
          else await this.checkpoints.advance(id);
        } catch {
          if (attempts < 3)
            return { rescheduleAt: Date.now() + LIMITS.heartbeatMs };
        }
        return;
      }
      if (job.fn !== "generation") return;
      const generation = job.payload as SessionGeneration;
      const catalog = this.checkpoints.status();
      if (
        catalog.busy ||
        catalog.active.epoch !== generation.epoch ||
        catalog.active.facet !== generation.facet
      )
        return;
      await this.arm(generation);
      const child = this.child(generation);
      await child.drive(attempt);
      const background = child.waitBackground();
      this.lifecycle.trackAlarmWork(background);
      await background;
      const next = await child.nextWake();
      // arm() supersedes this callback's old lease; explicitly replace/cancel that
      // new intent after the child has committed all dispatched queue mutations.
      if (next === undefined)
        await this.lifecycle.jobs.cancel(`generation:${generation.epoch}`);
      else await this.arm(generation, Math.max(Date.now() + 10, next));
    });
  }
}

/** Session subtree. Only its parent has a reference; direct HTTP is never served. */
export class SessionFacet extends AgentSession {
  private readonly bridge: FacetLifecycle;
  private maintenance = false;

  constructor(ctx: DurableObjectState, env: RecoveryEnv) {
    const props = ctx.props as FacetProps;
    if (!props?.rootId || !props.generation || !props.profile)
      throw new Error("Missing supervisor context");
    const parent = env.RECOVERY_SESSIONS.get(
      env.RECOVERY_SESSIONS.idFromString(props.rootId),
    );
    let startup: () => Promise<void>;
    const guard = async () => {
      if (ctx.storage.kv.get(FROZEN))
        throw new HttpError(409, "Session is frozen for recovery");
      if (!(await parent.isGenerationActive(props.generation)))
        throw new HttpError(
          409,
          "Session generation is frozen or no longer active",
        );
    };
    const bridge: FacetLifecycle = new FacetLifecycle(
      ctx,
      props.generation.facet,
      () => parent.wake(props.generation, bridge.nextTime()),
      () => startup(),
    );
    super(
      ctx,
      {
        ...env,
        MODEL_MODE: props.profile.mode,
        AI_MODEL: props.profile.modelId,
        MODEL_CALL_LIMIT: String(props.profile.callLimit),
      },
      {
        harness: (options) => bridge.harness(options),
        install: (session) => {
          bridge.attach((context) => session.onJob(context));
          return bridge;
        },
        guard,
        beforeCall: async () => {
          await guard();
          await parent.beforeModelCall(props.generation);
        },
        destination: {
          list: () => parent.notes(props.generation),
          create: (action, key, text) =>
            parent.createNote(props.generation, action, key, text),
        },
      },
    );
    this.bridge = bridge;
    startup = async () => {
      if (!this.maintenance) await guard();
    };
  }

  drive(attempt: number) {
    return this.bridge.drive(attempt);
  }
  waitBackground() {
    return this.bridge.waitBackground();
  }
  nextWake() {
    return this.bridge.nextTime();
  }

  async prepareCheckpoint() {
    // Refuse busy work before the root freezes provider admission. A maintenance
    // request must not itself turn an otherwise healthy running turn into an error.
    try {
      await this.checkpointProof();
      return { ready: true as const };
    } catch (error) {
      if (error instanceof HttpError)
        return { ready: false as const, error: error.message };
      throw error;
    }
  }

  async freeze() {
    this.ctx.storage.kv.put(FROZEN, true);
    this.maintenance = true;
    try {
      return await this.checkpointProof();
    } finally {
      this.maintenance = false;
    }
  }

  releaseFreeze() {
    this.ctx.storage.kv.delete(FROZEN);
  }
}
