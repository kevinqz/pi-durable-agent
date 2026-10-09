import type { PendingAction } from "@cloudflare/codemode";
import { HttpError } from "./http.js";

export const CONTRACT_V1 = "notes-v1/schema-1/policy-1/codemode-0.5.3";
export type ActionState =
  | "admitted"
  | "running"
  | "pending"
  | "completed"
  | "failed"
  | "rejected"
  | "expired"
  | "unknown";
export type Action = {
  id: string;
  code: string;
  label: string;
  contract: string;
  status: ActionState;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  executionId?: string;
  pending?: PendingAction[];
  fingerprint?: string;
  approvedUntil?: number;
  approvedFingerprint?: string;
  error?: string;
  result?: unknown;
  delivered?: boolean;
  archive?: { bytes: number; sha256: string };
};

export class ActionsStore {
  constructor(private readonly storage: DurableObjectStorage) {
    storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS app_actions (id TEXT PRIMARY KEY, data TEXT NOT NULL)",
    );
    storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS app_action_archives (id TEXT NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (id, part))",
    );
    storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS app_notes (action_id TEXT NOT NULL, key TEXT NOT NULL, text TEXT NOT NULL, PRIMARY KEY(action_id, key))",
    );
  }
  get(id: string): Action | undefined {
    const row = this.storage.sql
      .exec<{ data: string }>("SELECT data FROM app_actions WHERE id = ?", id)
      .toArray()[0];
    return row ? JSON.parse(row.data) : undefined;
  }
  list(): Action[] {
    return this.storage.sql
      .exec<{ data: string }>("SELECT data FROM app_actions")
      .toArray()
      .map((r) => JSON.parse(r.data) as Action)
      .sort((a, b) => a.createdAt - b.createdAt);
  }
  put(action: Action) {
    action.updatedAt = Date.now();
    this.storage.sql.exec(
      "INSERT INTO app_actions VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
      action.id,
      JSON.stringify(action),
    );
  }
  archive(id: string, data: string): void {
    this.storage.transactionSync(() => {
      this.storage.sql.exec("DELETE FROM app_action_archives WHERE id = ?", id);
      for (let i = 0; i < data.length; i += 32_000)
        this.storage.sql.exec(
          "INSERT INTO app_action_archives VALUES (?, ?, ?)",
          id,
          i / 32_000,
          data.slice(i, i + 32_000),
        );
    });
  }
  readArchive(id: string): string | undefined {
    const parts = this.storage.sql
      .exec<{ data: string }>(
        "SELECT data FROM app_action_archives WHERE id = ? ORDER BY part",
        id,
      )
      .toArray();
    return parts.length ? parts.map((r) => r.data).join("") : undefined;
  }
  notes(): { action_id: string; key: string; text: string }[] {
    return this.storage.sql
      .exec<{ action_id: string; key: string; text: string }>(
        "SELECT * FROM app_notes ORDER BY action_id, key LIMIT 100",
      )
      .toArray();
  }
  createNote(actionId: string, key: string, text: string) {
    return this.storage.transactionSync(() => {
      const old = this.storage.sql
        .exec<{ text: string }>(
          "SELECT text FROM app_notes WHERE action_id = ? AND key = ?",
          actionId,
          key,
        )
        .toArray()[0];
      if (old && old.text !== text)
        throw new HttpError(
          409,
          "Note idempotency key already has different content",
        );
      this.storage.sql.exec(
        "INSERT OR IGNORE INTO app_notes VALUES (?, ?, ?)",
        actionId,
        key,
        text,
      );
      return { key, text, actionId };
    });
  }
}
