# Choose a model without replacing a conversation

[README](../README.md) · [Deployment](./deployment.md) · [Evidence](./validation.md)

The application starts with a simulated model. When an operator configures
Workers AI, **Model for the next session** also offers the configured real
model. Choose it and select **New session**. The new session records its model
and call allowance before Pi opens. Existing conversations keep their own
model; selecting another never rewrites their memory or approvals.

Opening the selector or creating an empty session does not request inference.
Sending a message does. OptChat's memory summaries also call the same model.
The conversation's URL remains the way to reopen it.

## Operator configuration

Use the protected environment from the [staging guide](./staging.md). In its
private configuration, add:

```jsonc
// Merge these fields into env.staging; retain Access and the other bindings.
"ai": { "binding": "AI" },
"vars": {
  "APP_ENV": "staging",
  "MODEL_MODE": "demo",
  "AI_MODEL": "@cf/openai/gpt-oss-120b",
  "MODEL_CALL_LIMIT": "12"
  // Keep the existing ACCESS_TEAM_DOMAIN and ACCESS_AUD values here.
}
```

Keep `MODEL_MODE: "demo"` when adding AI to an existing demo deployment. This
keeps untouched older conversations on their previous model and makes real
inference an explicit new-session choice. More generally, update a legacy
installation with its previous `MODEL_MODE` and `AI_MODEL` first. Its sessions
did not store a separate model profile before this increment; do not change
their default model during that upgrade. Newly recorded profiles retain their
model ID and allowance through later configuration changes and restarts.

`AI_MODEL` must be a chat model in the pinned Pi catalog with at least 65,536
context tokens. This accommodates the configured memory/input limits and
OptChat's conservative context reserve. The qualified GPT-OSS-120B model has a
128,000-token context and function calling in the [Cloudflare catalog](https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/).
The [hosted application evidence](./hosted-gpt-oss-validation.json) is separate
from catalog support. The earlier Scout trial did not qualify tool execution.

The binding uses Cloudflare's native inference service. No API key or Pi OAuth
file is copied into the application. Main replies and summaries use the same
model. ChatGPT and Claude subscriptions do not configure this binding.

### GPT-OSS input compatibility

The protected GPT-OSS-120B trial exposed an input-schema rejection before a
response was generated: this endpoint rejected an array of text parts in a
message. The host uses Pi's public `onPayload` callback to concatenate only
text-only arrays for this exact model, preserving their text order and bytes.
Other models, mixed content, roles, tool declarations and structured tool calls
retain the official adapter's representation. The stored OptChat view and
transcript are unchanged; this is a transport correction, not a memory change.

A local regression check exercises both official provider entry points with
the observed rejected shape, verifies the resulting tool declarations and
structured response, and keeps call admission and output limits in place.
It uses a simulated binding. A separate [hosted check](./hosted-gpt-oss-validation.json)
then passed structured tool use, approval, completion and assistant follow-up
within 7/12 reserved calls. No dependency internals are patched.

## Resource allowance

`MODEL_CALL_LIMIT` accepts a decimal integer from 1 to 500, defaulting to 100
for new real-model sessions. The first trial above uses 12. The selected
allowance is immutable for that session. Changing the environment does not
refill it; create a new session deliberately when another allowance is wanted.

Both provider streaming entry points reserve a call in durable storage before
dispatch and cap requested output at 2,048 tokens. Replies, summaries and
failed attempts share the same allowance. In checkpoint sessions the counter lives in the supervisor, outside the restored subtree; restoring a checkpoint does not refund it. An interrupted call whose outcome
is uncertain keeps its reservation. Input is checked against a conservative
byte allowance before dispatch. The interface shows calls reserved and the
session limit, including when the limit has been reached.

This is **not an account-wide monetary cap**. Separate sessions have separate
allowances; other Workers and model users also consume the account's resources.
Keep Access membership bounded and use Cloudflare's usage/billing monitoring.
The [Workers AI allowance and prices](https://developers.cloudflare.com/workers-ai/platform/pricing/)
are separate from the Workers subscription and from storage/request charges.

When the allowance is exhausted, no further call can be dispatched through
these provider entry points. Existing history, source search and data export
remain available. An already-approved tool result is still retained even if
there is no model allowance left for its conversational follow-up.

## API and qualification

`POST /api/checkpoint-sessions/:newSession/configuration` (or the retained legacy `/api/sessions/:newSession/configuration`) accepts
`{ "mode": "demo" }` or `{ "mode": "workers-ai" }`. The ordinary
authentication, identity isolation and same-origin checks apply. The mode can
only be selected before the session is initialized. An identical retry returns
the stored profile; a changed choice returns `409`. Unsupported configuration
does not claim an empty session. This endpoint never increases an existing
allowance or changes its owner.

Local checks exercise configuration isolation, restart persistence, immutable
model/budget selection, and the official Workers AI adapter with a simulated
binding response. They verify the output cap and rejection before dispatch
when the budget or input bound is exceeded. They do not establish live model
quality, hosted availability or billing.

The [bounded hosted Scout trial](./hosted-real-model-validation.json) reserved
10 calls, including summaries and failed attempts. Real text, a long-message
summary, original retrieval and same-build checkpoint restoration passed.
Tool-directed turns yielded empty outcomes or text resembling a tool call;
no action was admitted. The application never executes code extracted from
ordinary assistant text. This model/tool combination is not operationally
qualified. A model's documented function-calling support alone is insufficient.

**Export session data** includes bounded diagnostics from committed Pi assistant
outcomes and the session's backend fingerprint. Use those records before retrying;
an uploaded Worker version does not prove that a warm session has adopted it.
See [session code updates](./staging.md#wait-for-session-code-to-update).
