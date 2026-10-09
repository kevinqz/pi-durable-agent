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
  "AI_MODEL": "@cf/meta/llama-4-scout-17b-16e-instruct",
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
OptChat's conservative context reserve. The Llama 4 Scout example has a 131,000
token context and function calling in the [Cloudflare catalog](https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/).
Catalog support is not a claim of a completed hosted application check.

The binding uses Cloudflare's native inference service. No API key or Pi OAuth
file is copied into the application. Main replies and summaries use the same
model. ChatGPT and Claude subscriptions do not configure this binding.

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
quality, hosted availability or billing. A bounded real-provider application
flow remains part of the operational-release gate.
