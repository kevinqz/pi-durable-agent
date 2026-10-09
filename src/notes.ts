import { CodemodeConnector } from "@cloudflare/codemode";
import { ActionsStore, CONTRACT_V1, type Action } from "./actions-store.js";
import { identifier, textField } from "./http.js";

export interface NotesDestination {
  list(): unknown;
  create(action: Action, key: string, text: string): unknown;
}

/** A synthetic, session-local destination. No external service credentials. */
export class NotesV1 extends CodemodeConnector {
  constructor(
    ctx: DurableObjectState,
    private readonly store: ActionsStore,
    private readonly actionId: string,
    private readonly destination?: NotesDestination,
  ) {
    super(ctx, {});
  }
  name() {
    return "notes";
  }
  protected instructions() {
    return "Session-local demo notes. Read with list({}). create({key,text}) needs approval; use a stable key and await calls sequentially.";
  }
  protected tools() {
    return {
      list: {
        description: "Read up to 100 demo notes in this session.",
        inputSchema: {
          type: "object" as const,
          properties: {},
          additionalProperties: false,
        },
        execute: (args: unknown) => {
          this.object(args, []);
          return this.destination
            ? this.destination.list()
            : this.store.notes();
        },
      },
      create: {
        description:
          "Create one demo note after user approval. Same action + key returns the recorded note; changed content is rejected.",
        requiresApproval: true,
        inputSchema: {
          type: "object" as const,
          properties: {
            key: { type: "string" as const, maxLength: 96 },
            text: { type: "string" as const, maxLength: 4000 },
          },
          required: ["key", "text"],
          additionalProperties: false,
        },
        execute: (args: unknown) => {
          const input = this.object(args, ["key", "text"]);
          const key = identifier(input.key, "note key");
          const text = textField(input.text, 4000, "Note");
          const action = this.store.get(this.actionId);
          if (
            !action ||
            action.contract !== CONTRACT_V1 ||
            action.status !== "running" ||
            !action.approvedUntil ||
            action.approvedUntil <= Date.now()
          )
            throw new Error("Action has no current execution authorization");
          // The runtime also checks its recorded method and exact arguments on
          // replay. This destination supplies the separate effect deduplication.
          return this.destination
            ? this.destination.create(action, key, text)
            : this.store.createNote(this.actionId, key, text);
        },
      },
    };
  }
  private object(value: unknown, keys: string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Expected an object");
    if (Object.keys(value).some((k) => !keys.includes(k)))
      throw new Error("Unknown argument");
    return value as Record<string, unknown>;
  }
}
