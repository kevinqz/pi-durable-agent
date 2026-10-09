import { HttpError, identifier, textField } from "./http.js";
import { SerialGate } from "./store.js";

export type SessionGeneration = { facet: string; epoch: number };
export type Checkpoint = {
  id: string;
  facet: string;
  runtime: string;
  proof: string;
  createdAt: number;
};
export type CheckpointOperation = {
  id: string;
  runtime: string;
  kind: "backup" | "restore";
  checkpointId: string;
  source: SessionGeneration;
  target: string;
  phase:
    | "quiescing"
    | "copying"
    | "validating"
    | "activating"
    | "done"
    | "cancelled";
  proof?: string;
  createdAt: number;
  failures: number;
};
type Catalog = {
  version: 1;
  active: SessionGeneration;
  busy?: string;
  lastOperation?: string;
  operations: number;
  restores: number;
};

/**
 * Host boundary, not a storage serializer. Only the supervisor may implement it.
 * quiesce must refuse busy work or durably freeze it before returning a proof.
 * validate must inspect an inactive candidate without inference or tool effects.
 * activate only releases the leaf and durably arms its wake; public admission and
 * destination effects remain fenced until the catalog commits completion.
 * All three callbacks must tolerate a lost reply and the same operation's retry.
 */
export interface CheckpointDriver {
  quiesce(source: SessionGeneration): Promise<string>;
  abort(facet: string): void;
  clone(source: string, destination: string): void;
  validate(candidate: string, proof: string): Promise<void>;
  activate(generation: SessionGeneration): Promise<void>;
}

const CATALOG = "checkpoint:catalog";
const operationKey = (id: string) => `checkpoint:operation:${id}`;
const snapshotKey = (id: string) => `checkpoint:snapshot:${id}`;

/**
 * Supervisor journal for native facet snapshots. Contains application metadata
 * only; Pi and Code Mode data are copied by the platform, never rewritten here.
 * The host must authenticate callers, fence every dispatch/effect with assertActive,
 * and persist a Lifecycle wake before admitting an operation. This module is not
 * an independently deployable backup endpoint.
 */
export class CheckpointCoordinator {
  private readonly gate = new SerialGate();
  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly runtime: string,
    private readonly driver: CheckpointDriver,
  ) {
    textField(runtime, 256, "Checkpoint runtime identity");
    if (!storage.kv.get(CATALOG))
      storage.kv.put<Catalog>(CATALOG, {
        version: 1,
        active: { facet: "session:initial", epoch: 0 },
        operations: 0,
        restores: 0,
      });
    this.catalog();
  }

  private catalog(): Catalog {
    const value = this.storage.kv.get<Catalog>(CATALOG)!;
    if (
      value.version !== 1 ||
      !Number.isSafeInteger(value.active?.epoch) ||
      value.active.epoch < 0
    )
      throw new Error(
        "Unsupported checkpoint catalog; retain the matching runtime",
      );
    return value;
  }

  status() {
    return this.catalog();
  }
  operation(id: string) {
    return this.storage.kv.get<CheckpointOperation>(
      operationKey(identifier(id)),
    );
  }
  checkpoints(): Checkpoint[] {
    return [
      ...this.storage.kv.list<Checkpoint>({ prefix: "checkpoint:snapshot:" }),
    ].map(([, value]) => value);
  }

  assertActive(generation: SessionGeneration) {
    const catalog = this.catalog();
    if (
      catalog.active.facet !== generation.facet ||
      catalog.active.epoch !== generation.epoch
    )
      throw new HttpError(409, "This session generation is no longer active");
    if (catalog.busy)
      throw new HttpError(409, "Session is frozen for a recovery operation");
  }

  beginBackup(id: string) {
    return this.begin(id, "backup", id);
  }
  beginRestore(id: string, checkpointId: string) {
    return this.begin(id, "restore", checkpointId);
  }

  /** Read-only admission check before the host allocates a durable wake. */
  checkAdmission(
    id: string,
    kind: CheckpointOperation["kind"],
    checkpointId: string,
  ) {
    identifier(id);
    identifier(checkpointId, "Checkpoint ID");
    const old = this.operation(id);
    if (old) {
      if (old.kind !== kind || old.checkpointId !== checkpointId)
        throw new HttpError(409, "Recovery operation ID conflict");
      return old;
    }
    const catalog = this.catalog();
    if (catalog.busy)
      throw new HttpError(409, "Another recovery operation is pending");
    if (catalog.operations >= 24)
      throw new HttpError(429, "Recovery operation allowance exhausted");
    if (kind === "backup" && this.checkpoints().length >= 3)
      throw new HttpError(
        429,
        "Retain the existing checkpoints; the three-checkpoint allowance is full",
      );
    if (kind === "restore") {
      this.snapshot(checkpointId);
      if (catalog.restores >= 8)
        throw new HttpError(429, "Restore allowance exhausted");
    }
  }

  private begin(
    id: string,
    kind: CheckpointOperation["kind"],
    checkpointId: string,
  ) {
    return this.storage.transactionSync(() => {
      const old = this.checkAdmission(id, kind, checkpointId);
      if (old) return old;
      const catalog = this.catalog();
      if (kind === "restore") catalog.restores++;
      const operation: CheckpointOperation = {
        id,
        runtime: this.runtime,
        kind,
        checkpointId,
        source: catalog.active,
        target: kind === "backup" ? `snapshot:${id}` : `session:restored:${id}`,
        phase: "quiescing",
        createdAt: Date.now(),
        failures: 0,
      };
      catalog.operations++;
      catalog.busy = id;
      catalog.lastOperation = id;
      this.storage.kv.put(CATALOG, catalog);
      this.save(operation);
      return operation;
    });
  }

  private snapshot(id: string) {
    const snapshot = this.storage.kv.get<Checkpoint>(snapshotKey(id));
    if (!snapshot) throw new HttpError(404, "Unknown completed checkpoint");
    if (snapshot.runtime !== this.runtime)
      throw new HttpError(
        409,
        "Checkpoint requires its matching runtime; no implicit migration is allowed",
      );
    return snapshot;
  }
  private save(operation: CheckpointOperation) {
    this.storage.kv.put(operationKey(operation.id), operation);
  }
  private pending(id: string) {
    const operation = this.operation(id);
    if (!operation) throw new HttpError(404, "Unknown recovery operation");
    if (operation.runtime !== this.runtime)
      throw new HttpError(
        409,
        "Recovery operation requires its matching runtime",
      );
    if (
      !["done", "cancelled"].includes(operation.phase) &&
      this.catalog().busy !== id
    )
      throw new Error("Recovery journal and active operation disagree");
    return operation;
  }

  advance(id: string) {
    return this.gate.run(async () => {
      const operation = this.pending(id);
      if (["done", "cancelled"].includes(operation.phase)) return operation;
      try {
        if (operation.phase === "quiescing") {
          const proof = await this.driver.quiesce(operation.source);
          operation.proof = textField(proof, 16_000, "Checkpoint proof");
          operation.phase = "copying";
          this.save(operation);
        }
        if (operation.phase === "copying") {
          // The destination is owned by this operation and has never been active.
          // A retry can replace a partial copy only while its source is frozen.
          this.driver.abort(operation.source.facet);
          const source =
            operation.kind === "backup"
              ? operation.source.facet
              : this.snapshot(operation.checkpointId).facet;
          this.driver.clone(source, operation.target);
          operation.phase =
            operation.kind === "backup" ? "activating" : "validating";
          this.storage.transactionSync(() => {
            if (operation.kind === "backup")
              this.storage.kv.put<Checkpoint>(
                snapshotKey(operation.checkpointId),
                {
                  id: operation.checkpointId,
                  facet: operation.target,
                  runtime: this.runtime,
                  proof: operation.proof!,
                  createdAt: Date.now(),
                },
              );
            this.save(operation);
          });
        }
        if (operation.phase === "validating") {
          const snapshot = this.snapshot(operation.checkpointId);
          await this.driver.validate(operation.target, snapshot.proof);
          this.driver.abort(operation.target);
          this.storage.transactionSync(() => {
            const catalog = this.catalog();
            catalog.active = {
              facet: operation.target,
              epoch: operation.source.epoch + 1,
            };
            operation.phase = "activating";
            this.storage.kv.put(CATALOG, catalog);
            this.save(operation);
          });
        }
        if (operation.phase === "activating") {
          await this.driver.activate(this.catalog().active);
          this.storage.transactionSync(() => {
            const catalog = this.catalog();
            delete catalog.busy;
            operation.phase = "done";
            this.storage.kv.put(CATALOG, catalog);
            this.save(operation);
          });
        }
        return operation;
      } catch (error) {
        // A failed/uncertain copy is never advertised as a usable generation.
        // Persist the exact phase; the host reports a category, not raw payloads.
        operation.failures++;
        this.save(operation);
        throw error;
      }
    });
  }

  cancel(id: string) {
    return this.gate.run(async () => {
      const operation = this.pending(id);
      if (["done", "cancelled"].includes(operation.phase)) return operation;
      if (operation.phase === "activating")
        throw new HttpError(
          409,
          "Activation must finish; retain both copies and retry the existing operation",
        );
      this.driver.abort(operation.target);
      await this.driver.activate(operation.source);
      this.storage.transactionSync(() => {
        const catalog = this.catalog();
        delete catalog.busy;
        operation.phase = "cancelled";
        this.storage.kv.put(CATALOG, catalog);
        this.save(operation);
      });
      return operation;
    });
  }
}
