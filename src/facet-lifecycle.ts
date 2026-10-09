import { PiHarness, type PiHarnessOptions } from "agents/harness/pi";
import type {
  LifecycleJob,
  LifecycleJobContext,
  LifecycleJobOutcome,
  LifecycleJobPushOptions,
  LifecycleJobs,
  LifecycleServices,
} from "agents/lifecycle";
import { SerialGate } from "./store.js";

type Intent = { revision: string; job: LifecycleJob };
type Owner = "host" | "pi-harness";
const PREFIX = "facet-lifecycle:job:";
const key = (owner: Owner, id: string) => `${PREFIX}${owner}:${id}`;

/** Only the exported, protected Lifecycle service aperture is specialized. */
class FacetPiHarness extends PiHarness {
  constructor(
    options: PiHarnessOptions,
    private readonly services: LifecycleServices,
  ) {
    super(options);
  }
  protected override get lifecycle(): LifecycleServices {
    return this.services;
  }
  protected override get lifecycleServices(): LifecycleServices {
    return this.services;
  }
}

/**
 * A deliberately bounded Pi/host job bridge, not a replacement for Lifecycle.
 * The root owns the official Lifecycle, physical alarm, lease and reset breaker.
 * It must persist a recovery wake BEFORE every child invocation, including start.
 * Jobs live with the child so a native subtree clone includes their durable intent.
 * Unsupported queue policies fail explicitly; sockets and routes are not exposed.
 */
export class FacetLifecycle {
  private readonly gate = new SerialGate();
  private starting?: Promise<void>;
  private status: "zero" | "starting" | "started" = "zero";
  private inJob = false;
  private readonly background = new Set<Promise<unknown>>();
  private pi?: PiHarness;
  private onJob?: (
    context: LifecycleJobContext,
  ) => Promise<LifecycleJobOutcome | void>;
  readonly jobs: LifecycleJobs;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly name: string,
    private readonly wake: () => Promise<void>,
    private readonly guard: () => Promise<void>,
  ) {
    this.jobs = this.scope("host");
  }

  harness(options: PiHarnessOptions): PiHarness {
    if (this.pi) throw new Error("Pi is already attached to this facet");
    const unavailable = () => {
      throw new Error(
        "This facet supports Pi jobs only; no socket or route transport",
      );
    };
    this.pi = new FacetPiHarness(options, {
      name: this.name,
      className: "SessionFacet",
      storage: this.ctx.storage,
      ready: () =>
        this.status === "starting" ? Promise.resolve() : this.start(),
      status: () => this.status,
      jobs: this.scope("pi-harness"),
      trackAlarmWork: (work) => {
        if (!this.inJob) return false;
        this.background.add(work);
        void work.then(
          () => this.background.delete(work),
          () => this.background.delete(work),
        );
        return true;
      },
      runInHostContext: async (fn) => fn(),
      events: { emit: () => {} },
      sockets: { accept: unavailable, get: unavailable },
      routes: { source: undefined, to: unavailable, toRoot: unavailable },
    });
    return this.pi;
  }

  attach(onJob: NonNullable<FacetLifecycle["onJob"]>) {
    if (this.onJob) throw new Error("A host is already attached to this facet");
    this.onJob = onJob;
  }

  start(): Promise<void> {
    if (!this.starting) {
      if (!this.pi || !this.onJob)
        throw new Error("Facet composition is incomplete");
      this.starting = this.ctx.blockConcurrencyWhile(async () => {
        await this.guard();
        this.status = "starting";
        await this.pi!.onStart({ props: undefined });
        this.status = "started";
      });
    }
    return this.starting;
  }

  isStarted() {
    return this.status === "started";
  }

  private rows(owner?: Owner): Intent[] {
    return [
      ...this.ctx.storage.kv.list<Intent>({
        prefix: owner ? `${PREFIX}${owner}:` : PREFIX,
      }),
    ]
      .map(([, row]) => row)
      .sort(
        (a, b) => a.job.time - b.job.time || a.job.id.localeCompare(b.job.id),
      );
  }

  private scope(owner: Owner): LifecycleJobs {
    const read = (id: string) =>
      this.ctx.storage.kv.get<Intent>(key(owner, id));
    return {
      push: async (options) => {
        this.validate(options);
        const id = options.id ?? crypto.randomUUID();
        const old = read(id);
        if (!old && this.rows().length >= 256)
          throw new Error(
            "Facet job allowance exhausted; retain existing work",
          );
        const job: LifecycleJob = {
          id,
          capability: owner,
          fn: options.fn,
          time: options.time,
          payload:
            options.payload === undefined
              ? undefined
              : JSON.parse(JSON.stringify(options.payload)),
          retry: undefined,
          singleflight: options.singleflight ?? false,
          exclusive: false,
          recoveryLoop: options.recoveryLoop ?? false,
          createdAt: old?.job.createdAt ?? Math.floor(Date.now() / 1000),
        };
        // This durable intent precedes the RPC. The root's pre-armed wake covers
        // a crash or a lost reply between this write and the notification.
        this.ctx.storage.kv.put<Intent>(key(owner, id), {
          job,
          revision: crypto.randomUUID(),
        });
        await this.wake();
        return job;
      },
      get: (id) => read(id)?.job,
      list: () => this.rows(owner).map((row) => row.job),
      cancel: async (id) => {
        const removed = this.ctx.storage.kv.delete(key(owner, id));
        await this.wake();
        return removed;
      },
      reschedule: async (id, time) => {
        this.time(time);
        const old = read(id);
        if (!old) return false;
        this.ctx.storage.kv.put<Intent>(key(owner, id), {
          job: { ...old.job, time },
          revision: crypto.randomUUID(),
        });
        await this.wake();
        return true;
      },
      rearm: this.wake,
    };
  }

  private time(value: number) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error("Invalid facet job time");
  }

  private validate(options: LifecycleJobPushOptions) {
    this.time(options.time);
    if (
      options.retry !== undefined ||
      options.hungTimeoutSeconds !== undefined ||
      options.exclusive
    )
      throw new Error(
        "Facet job retry, lease and exclusivity policies belong to the root Lifecycle",
      );
    if (
      !options.fn ||
      options.fn.length > 128 ||
      (options.id !== undefined && (!options.id || options.id.length > 256))
    )
      throw new Error("Invalid facet job identity");
    if (
      new TextEncoder().encode(JSON.stringify(options.payload) ?? "").length >
      64_000
    )
      throw new Error("Facet job payload is too large");
  }

  nextTime(): number | undefined {
    return this.rows()[0]?.job.time;
  }

  /** Bounded dispatch. A same-ID write supersedes an older callback's outcome. */
  drive(attempt: number): Promise<number | undefined> {
    return this.gate.run(async () => {
      await this.guard();
      await this.start();
      for (let count = 0; count < 8; count++) {
        const row = this.rows().find((row) => row.job.time <= Date.now());
        if (!row) break;
        await this.guard();
        let outcome: LifecycleJobOutcome | void;
        this.inJob = true;
        try {
          const context = { job: row.job, attempt };
          outcome = await (row.job.capability === "pi-harness"
            ? this.pi!.onJob(context)
            : this.onJob!(context));
        } finally {
          this.inJob = false;
        }
        const address = key(row.job.capability as Owner, row.job.id);
        const current = this.ctx.storage.kv.get<Intent>(address);
        if (current?.revision !== row.revision) continue;
        if (!outcome) this.ctx.storage.kv.delete(address);
        else {
          const time = outcome === "yield" ? Date.now() : outcome.rescheduleAt;
          this.time(time);
          this.ctx.storage.kv.put<Intent>(address, {
            revision: crypto.randomUUID(),
            job: { ...row.job, time },
          });
        }
      }
      return this.nextTime();
    });
  }

  /** The root tracks this RPC promise with its official trackAlarmWork(). */
  async waitBackground(): Promise<void> {
    await Promise.all([...this.background]);
  }
}
