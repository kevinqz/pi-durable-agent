import type { AgentSession } from "./session.js";
import type { SessionSupervisor } from "./session-supervisor.js";

export interface Env {
  SESSIONS: DurableObjectNamespace<AgentSession>;
  RECOVERY_SESSIONS?: DurableObjectNamespace<SessionSupervisor>;
  ASSETS: Fetcher;
  LOADER: WorkerLoader;
  APP_ENV: "local" | "staging" | "production" | "disabled";
  MODEL_MODE: "demo" | "workers-ai";
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  AI?: Ai;
  AI_MODEL?: string;
  MODEL_CALL_LIMIT?: string;
}

export type Principal = {
  tenant: string;
  subject: string;
  authorizedUntil: number;
};
export const LIMITS = Object.freeze({
  inputBytes: 16_000,
  bodyBytes: 32_000,
  pendingRequests: 16,
  requestsPerSession: 1000,
  heartbeatMs: 30_000,
  approvalTtlMs: 60 * 60 * 1000,
});
