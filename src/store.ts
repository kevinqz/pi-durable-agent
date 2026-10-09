import { HttpError } from "./http.js";
import { LIMITS, type Principal } from "./env.js";

export type RequestRow = {
  id: string;
  text: string;
  status: string;
  created_at: number;
  updated_at: number;
  error: string | null;
  task_id: number | null;
};

/** Application metadata only. Pi and OptChat own their own tables and memory. */
export class SessionStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(
      "CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    const version = this.meta("schema");
    if (version && version !== "1")
      throw new Error(`Unsupported application schema ${version}`);
    sql.exec(`CREATE TABLE IF NOT EXISTS app_requests (
      id TEXT PRIMARY KEY, text TEXT NOT NULL, status TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      task_id INTEGER, error TEXT)`);
    this.setMeta("schema", "1");
  }
  meta(key: string): string | undefined {
    return this.sql
      .exec<{ value: string }>("SELECT value FROM app_meta WHERE key = ?", key)
      .toArray()[0]?.value;
  }
  setMeta(key: string, value: string): void {
    this.sql.exec(
      "INSERT INTO app_meta VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      value,
    );
  }
  bind(principal: Principal): void {
    const key = JSON.stringify([principal.tenant, principal.subject]);
    const existing = this.meta("owner");
    if (existing && existing !== key)
      throw new HttpError(403, "This session belongs to another identity");
    if (!existing) this.setMeta("owner", key);
  }
  get(id: string): RequestRow | undefined {
    return this.sql
      .exec<RequestRow>("SELECT * FROM app_requests WHERE id = ?", id)
      .toArray()[0];
  }
  list(): RequestRow[] {
    return this.sql
      .exec<RequestRow>("SELECT * FROM app_requests ORDER BY created_at, id")
      .toArray();
  }
  checkAdmission(id: string, text: string, internal = false): void {
    const existing = this.get(id);
    if (existing) {
      if (existing.text !== text)
        throw new HttpError(
          409,
          "This request ID already belongs to different text",
        );
      return;
    }
    const rows = this.list();
    // Reserve one delivery slot for each of the at most 100 admitted actions.
    const limit = internal
      ? LIMITS.requestsPerSession
      : LIMITS.requestsPerSession - 100;
    if (rows.length >= limit)
      throw new HttpError(
        429,
        "Session limit reached; retain this session and start a new one",
      );
    if (
      !internal &&
      rows.filter(
        (r) =>
          !r.id.startsWith("result-") &&
          !["completed", "failed", "cancelled"].includes(r.status),
      ).length >= LIMITS.pendingRequests
    )
      throw new HttpError(429, "Wait for a pending request to finish");
  }
  admit(id: string, text: string): void {
    this.sql.exec(
      "INSERT OR IGNORE INTO app_requests (id, text, status, created_at, updated_at) VALUES (?, ?, 'admitted', ?, ?)",
      id,
      text,
      Date.now(),
      Date.now(),
    );
  }
  update(
    id: string,
    status: string,
    taskId?: number,
    error: string | null = null,
  ): void {
    const old = this.get(id);
    if (
      old &&
      old.status === status &&
      old.task_id === (taskId ?? old.task_id) &&
      old.error === error
    )
      return;
    this.sql.exec(
      "UPDATE app_requests SET status = ?, updated_at = ?, task_id = COALESCE(?, task_id), error = ? WHERE id = ?",
      status,
      Date.now(),
      taskId ?? null,
      error,
      id,
    );
  }
}

/** Serializes application admissions across awaits; durable jobs own recovery. */
export class SerialGate {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
