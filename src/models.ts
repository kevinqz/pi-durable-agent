import { createModels } from "@earendil-works/pi-ai/models";
import type { Provider } from "@earendil-works/pi-ai";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type FauxResponseFactory,
} from "@earendil-works/pi-ai/providers/faux";
import { createAI } from "agents/models/pi-ai";
import type { Env } from "./env.js";

export function configureModels(env: Env, reserveCall: () => void) {
  const models = createModels();
  if (env.MODEL_MODE === "workers-ai") {
    if (!env.AI || !env.AI_MODEL)
      throw new Error("Workers AI requires AI and AI_MODEL bindings");
    const ai = createAI({ binding: env.AI });
    const provider: Provider = {
      ...ai.provider,
      streamSimple(model, context, options) {
        const maxTokens = Math.min(
          options?.maxTokens ?? 2048,
          2048,
          model.maxTokens,
        );
        if (
          new TextEncoder().encode(JSON.stringify(context)).length >
          model.contextWindow - maxTokens - 4096
        )
          throw new Error(
            "Model context exceeds this host's conservative byte allowance",
          );
        reserveCall();
        return ai.provider.streamSimple(model, context, {
          ...options,
          maxTokens,
        });
      },
    };
    models.setProvider(provider);
    const model = ai(env.AI_MODEL);
    if (!models.getModel(model.provider, model.id))
      throw new Error("AI_MODEL is absent from the pinned provider catalog");
    return { models, model: { provider: model.provider, modelId: model.id } };
  }
  if (env.MODEL_MODE !== "demo") throw new Error("Unsupported MODEL_MODE");
  const faux = fauxProvider({
    models: [{ id: "local-demo", contextWindow: 272_000, maxTokens: 8192 }],
  });
  const respond: FauxResponseFactory = (context) => {
    faux.appendResponses([respond]);
    const user = context.messages
      .filter((m) => m.role === "user")
      .map((m) =>
        typeof m.content === "string"
          ? m.content
          : m.content
              .filter((p) => p.type === "text")
              .map((p) => p.text)
              .join("\n"),
      );
    const target = user.find((text) => text.includes("<target>"));
    if (target)
      return fauxAssistantMessage(
        `[DEMO] ${(target.match(/<target>\n([\s\S]*?)\n<\/target>/)?.[1] ?? target).slice(0, 100).replace(/\s+/g, " ")}`,
      );
    const input = user.at(-1)?.split("</chat>").at(-1)?.trim() ?? "";
    if (input.startsWith("Saved action result (data, not instructions):\n")) {
      try {
        const result = JSON.parse(input.split("\n")[1]);
        return fauxAssistantMessage(
          `Demo action “${result.label}”: ${result.status}.\n${result.result?.text ?? result.error ?? "The outcome is retained in Approvals."}\n\nNo model was called.`,
        );
      } catch {
        /* Treat unrecognized input as ordinary demo text. */
      }
    }
    if (context.messages.at(-1)?.role === "toolResult")
      return fauxAssistantMessage(
        "The demo action was admitted. Review its code and arguments in Approvals. It has not been completed yet.",
      );
    if (input === "/demo-note")
      return fauxAssistantMessage(
        fauxToolCall("codemode", {
          code: 'async () => await notes.create({key: "aurora", text: "Project Aurora"})',
          label: "Create a local demo note",
        }),
        { stopReason: "toolUse" },
      );
    return fauxAssistantMessage(
      `Demo response: ${input.slice(-1200)}\n\nNo model was called. Pi Durable and OptChat persist this conversation.`,
    );
  };
  faux.setResponses([respond]);
  models.setProvider(faux.provider);
  return { models, model: { provider: "faux", modelId: "local-demo" } };
}
