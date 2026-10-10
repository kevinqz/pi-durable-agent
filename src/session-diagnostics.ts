import type { Context } from "@earendil-works/chord";
import type { Conversation } from "@earendil-works/pi-durable";

/** Read committed provider outcomes without requesting inference or raw prompts. */
export async function sessionDiagnostics(
  conversation: Conversation,
  context: Context,
) {
  const page = await conversation.entries({}, 100, undefined, context);
  return {
    scope: "assistant outcomes within the newest 100 Pi entries",
    olderEntriesOmitted: !!page.next,
    responses: page.items.flatMap((entry) =>
      entry.kind !== "pi.assistant"
        ? []
        : (entry.model ?? []).flatMap((message) =>
            message.role !== "assistant"
              ? []
              : [
                  {
                    entryId: entry.id,
                    timestamp: message.timestamp,
                    provider: message.provider,
                    model: message.model,
                    stopReason: message.stopReason,
                    rawStopReason: message.rawStopReason ?? null,
                    error: message.errorMessage?.slice(0, 4000) ?? null,
                    errorTruncated: (message.errorMessage?.length ?? 0) > 4000,
                    contentTypes: message.content.map((part) => part.type),
                    usage: message.usage,
                  },
                ],
          ),
    ),
  };
}
