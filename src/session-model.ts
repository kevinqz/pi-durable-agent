import type { Env } from "./env.js";
import { HttpError } from "./http.js";
import type { SessionStore } from "./store.js";
import { CLOUDFLARE_WORKERS_AI_MODELS } from "@earendil-works/pi-ai/providers/cloudflare-workers-ai.models";

export type ModelProfile = {
  version: 1;
  mode: Env["MODEL_MODE"];
  modelId: string;
  callLimit: number;
};

/** Configuration is pinned before Pi opens; selecting a model never rewrites a conversation. */
export function modelProfile(
  env: Env,
  mode: unknown = env.MODEL_MODE,
): ModelProfile {
  if (mode === "demo")
    return { version: 1, mode, modelId: "local-demo", callLimit: 0 };
  if (mode !== "workers-ai") throw new HttpError(400, "Unsupported model mode");
  if (!env.AI || !env.AI_MODEL?.startsWith("@cf/"))
    throw new HttpError(503, "Workers AI is not configured on this deployment");
  const model = Object.values(CLOUDFLARE_WORKERS_AI_MODELS).find(
    (entry) => entry.id === env.AI_MODEL,
  );
  if (!model || model.type !== "chat" || model.contextWindow < 65_536)
    throw new HttpError(
      503,
      "Choose a catalog chat model with at least 65,536 context tokens for this memory configuration",
    );
  const value = env.MODEL_CALL_LIMIT ?? "100";
  if (!/^[1-9][0-9]*$/.test(value) || Number(value) > 500)
    throw new Error("MODEL_CALL_LIMIT must be an integer from 1 to 500");
  return { version: 1, mode, modelId: env.AI_MODEL, callLimit: Number(value) };
}

export class SessionModel {
  constructor(
    private readonly store: SessionStore,
    private readonly env: Env,
  ) {}

  private saved(): ModelProfile | undefined {
    const raw = this.store.meta("modelProfile");
    if (!raw) return;
    const profile = JSON.parse(raw) as ModelProfile;
    if (
      profile.version !== 1 ||
      !["demo", "workers-ai"].includes(profile.mode) ||
      typeof profile.modelId !== "string" ||
      !Number.isInteger(profile.callLimit) ||
      profile.callLimit < 0 ||
      profile.callLimit > 500 ||
      (profile.mode === "demo" &&
        (profile.modelId !== "local-demo" || profile.callLimit !== 0)) ||
      (profile.mode === "workers-ai" &&
        (!profile.modelId.startsWith("@cf/") || profile.callLimit < 1))
    )
      throw new Error(
        "Unsupported stored model profile; retain the matching runtime",
      );
    return profile;
  }

  profile(): ModelProfile {
    const saved = this.saved();
    if (saved) return saved;
    const profile = modelProfile(this.env);
    // Existing deployments must first update with their previous MODEL_MODE and
    // AI_MODEL. Once recorded, later default changes cannot switch this session.
    this.store.setMeta("modelProfile", JSON.stringify(profile));
    return profile;
  }

  select(mode: unknown, existed: boolean): ModelProfile {
    const saved = this.saved();
    if (saved && saved.mode === mode) return saved;
    if (saved || existed)
      throw new HttpError(
        409,
        "This session already has a model; start a new session to choose another",
      );
    const profile = modelProfile(this.env, mode);
    this.store.setMeta("modelProfile", JSON.stringify(profile));
    return profile;
  }

  reserveCall() {
    const profile = this.profile();
    const calls = Number(this.store.meta("modelCalls") ?? 0);
    if (!Number.isSafeInteger(calls) || calls < 0)
      throw new Error("Invalid saved model-call counter");
    if (calls >= profile.callLimit)
      throw new Error(
        `Session reached its ${profile.callLimit} model-call limit. Saved data remains available.`,
      );
    // Synchronous durable reservation precedes provider dispatch. Failed calls
    // and uncertain outcomes keep their reservation, including after a restart.
    this.store.setMeta("modelCalls", String(calls + 1));
  }
}
