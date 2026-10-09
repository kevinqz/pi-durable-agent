import type {
  Api,
  AssistantMessage,
  AssistantMessageEventStream,
  Model,
  Provider,
} from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";

/** Reserve at the supervisor before either streaming entry point can dispatch. */
export function guardProvider(
  provider: Provider,
  beforeCall: () => Promise<void>,
): Provider {
  const forward = (
    model: Model<Api>,
    signal: AbortSignal | undefined,
    dispatch: () => AssistantMessageEventStream,
  ) => {
    const output = createAssistantMessageEventStream();
    void (async () => {
      try {
        if (signal?.aborted) throw new Error("Model request cancelled");
        await beforeCall();
        if (signal?.aborted) throw new Error("Model request cancelled");
        for await (const event of dispatch()) output.push(event);
      } catch (error) {
        output.push({
          type: "error",
          reason: "error",
          error: admissionError(model, error),
        });
      }
    })();
    return output;
  };
  return {
    ...provider,
    stream: (model, context, options) =>
      forward(model, options?.signal, () =>
        provider.stream(model, context, options),
      ),
    streamSimple: (model, context, options) =>
      forward(model, options?.signal, () =>
        provider.streamSimple(model, context, options),
      ),
  };
}

function admissionError(model: Model<Api>, error: unknown): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    timestamp: Date.now(),
    stopReason: "error",
    errorMessage:
      error instanceof Error ? error.message : "Model admission failed",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}
