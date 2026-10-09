import { Type } from "@earendil-works/pi-ai";
import {
  defineExtension,
  defineTool,
  section,
} from "@earendil-works/pi-durable";
import type { Actions } from "./actions.js";
import { digest } from "./http.js";

export function actionTools(actions: Actions) {
  return defineExtension({
    name: "companion-actions-v1",
    sections: [
      section(
        "action_rules",
        () =>
          "The codemode tool admits asynchronous work. It does not mean an action succeeded. Inspect status in the UI; a saved outcome arrives as a later turn through OptChat. Mutations require the user's approval. Sandbox network access is disabled. Only notes.list({}) and notes.create({key,text}) exist; these are session-local demo notes, not an external service. Await connector calls sequentially. Never claim completion while pending, and do not repeat an unknown action.",
      ),
    ],
    tools: [
      defineTool({
        name: "codemode",
        description:
          "Submit JavaScript to the official Cloudflare Code Mode sandbox; receive a durable action receipt. Use an async arrow function. notes.list({}) reads demo notes; notes.create({key,text}) asks the user to approve a local note.",
        parameters: Type.Object(
          {
            code: Type.String({ minLength: 1, maxLength: 16_000 }),
            label: Type.String({ minLength: 1, maxLength: 200 }),
          },
          { additionalProperties: false },
        ),
        replay: "safe",
        executionMode: "sequential",
        async execute({ code, label }, api) {
          const id = await digest(
            `${api.conversationId}:${api.taskId}:${api.callId}`,
          );
          const receipt = await actions.submit(id, code, label);
          return { content: [{ type: "text", text: JSON.stringify(receipt) }] };
        },
      }),
    ],
  });
}
