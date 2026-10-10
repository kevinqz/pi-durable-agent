import type { ProviderRequestOptions } from "@earendil-works/pi-ai";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Narrow compatibility correction for the hosted GPT-OSS input schema. */
export function workersAiPayloadHook(
  previous?: ProviderRequestOptions["onPayload"],
): NonNullable<ProviderRequestOptions["onPayload"]> {
  return async (payload, model) => {
    const input = (await previous?.(payload, model)) ?? payload;
    if (
      model.id !== "@cf/openai/gpt-oss-120b" ||
      !record(input) ||
      !Array.isArray(input.messages)
    )
      return input;
    return {
      ...input,
      messages: input.messages.map((message: unknown) => {
        if (
          !record(message) ||
          !Array.isArray(message.content) ||
          !message.content.every(
            (part: unknown) =>
              record(part) &&
              part.type === "text" &&
              typeof part.text === "string",
          )
        )
          return message;
        // Pi renders segmented text for OptChat's frozen view. The hosted
        // endpoint rejects that array form. Keep the exact text order/bytes,
        // tools and roles; never flatten non-text parts or parse text as tools.
        return {
          ...message,
          content: message.content.map((part) => part.text).join(""),
        };
      }),
    };
  };
}
