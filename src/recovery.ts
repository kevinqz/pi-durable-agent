import type { LifecycleJobs } from "agents/lifecycle";
import type { Env } from "./env.js";
import { HttpError, identifier } from "./http.js";
import { SerialGate, SessionStore } from "./store.js";

export const RUNTIME_RELEASE = "0.1.0-dev.5";
const RESTART_LIMIT = 10;
const JOB_PREFIX = "recovery:";

type Restart = {
  activationId: string;
  ordinal: number;
  requestedAt: number;
  authorizedUntil: number;
  status: "scheduled" | "aborting" | "busy" | "expired" | "already_restarted";
  firedAt?: number;
};

/** Bounded, owner-authorized fault injection for demo sessions only. */
export class RuntimeRecovery {
  readonly activationId = crypto.randomUUID();
  readonly startedAt = Date.now();
  private readonly gate = new SerialGate();

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
    private readonly store: SessionStore,
    private readonly jobs: () => LifecycleJobs,
    private readonly isIdle: () => Promise<boolean>,
    private readonly modelMode: () => Env["MODEL_MODE"] = () => env.MODEL_MODE,
  ) {}

  private get enabled() {
    return (
      this.modelMode() === "demo" &&
      ["local", "staging"].includes(this.env.APP_ENV)
    );
  }

  private read(id: string): Restart | undefined {
    const saved = this.store.meta(`${JOB_PREFIX}${id}`);
    return saved ? JSON.parse(saved) : undefined;
  }

  private save(record: Restart) {
    this.ctx.storage.transactionSync(() => {
      this.store.setMeta(
        `${JOB_PREFIX}${record.activationId}`,
        JSON.stringify(record),
      );
      this.store.setMeta("recovery:last", record.activationId);
      this.store.setMeta(
        "recovery:count",
        String(Math.max(record.ordinal, this.count())),
      );
    });
  }

  private count() {
    return Number(this.store.meta("recovery:count") ?? 0);
  }

  describe() {
    const lastId = this.store.meta("recovery:last");
    const last = lastId ? this.read(lastId) : undefined;
    return {
      release: RUNTIME_RELEASE,
      activationId: this.activationId,
      startedAt: this.startedAt,
      restartEnabled: this.enabled,
      restartCount: this.count(),
      restartLimit: RESTART_LIMIT,
      lastRestart: last && {
        ...last,
        status:
          last.status === "aborting" && last.activationId !== this.activationId
            ? "recovered"
            : last.status,
      },
    };
  }

  request(activationId: string, authorizedUntil: number) {
    return this.gate.run(async () => {
      if (!this.enabled) throw new HttpError(404, "Demo recovery is disabled");
      identifier(activationId, "activation ID");
      if (authorizedUntil <= Date.now())
        throw new HttpError(403, "Authorization expired");
      // An uncertain HTTP reply is retried against the same activation, never a new one.
      const saved = this.read(activationId);
      if (saved && !["busy", "expired"].includes(saved.status))
        return this.describe();
      if (activationId !== this.activationId)
        throw new HttpError(
          409,
          "The session already restarted; refresh its state",
        );
      if (this.count() >= RESTART_LIMIT)
        throw new HttpError(429, "This demo session reached its restart limit");
      if (!(await this.isIdle()))
        throw new HttpError(
          409,
          "Wait for active work and result delivery to finish",
        );
      const record: Restart = {
        activationId,
        ordinal: this.count() + 1,
        requestedAt: Date.now(),
        authorizedUntil: Math.min(authorizedUntil, Date.now() + 30_000),
        status: "scheduled",
      };
      // The job carries the entire admission if a crash loses the local receipt.
      await this.jobs().push({
        id: `${JOB_PREFIX}${activationId}`,
        fn: "restart-demo-session",
        time: Date.now() + 1000,
        payload: record,
        singleflight: true,
        recoveryLoop: true,
      });
      this.save(record);
      return this.describe();
    });
  }

  drive(payload: Restart) {
    return this.gate.run(() => this.reset(payload));
  }

  private async reset(payload: Restart) {
    if (!this.enabled) return;
    const record = this.read(payload.activationId) ?? payload;
    // The persisted marker makes retries and alarm redelivery harmless.
    if (record.status !== "scheduled") return;
    if (record.activationId !== this.activationId)
      record.status = "already_restarted";
    else if (record.authorizedUntil <= Date.now()) record.status = "expired";
    else if (!(await this.isIdle())) record.status = "busy";
    else {
      record.status = "aborting";
      record.firedAt = Date.now();
    }
    this.save(record);
    if (record.status !== "aborting") return;
    await this.ctx.storage.sync();
    // Deliberately do not close Pi or drain its in-memory resources first.
    // No database rewind, deletion, replay or new execution is requested.
    this.ctx.abort("Owner-requested demo session reset", { retryAlarm: false });
  }
}
