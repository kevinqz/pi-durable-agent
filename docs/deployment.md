# Deployment and operation

[README](../README.md) · [Architecture](./architecture.md) · [Roadmap](./roadmap.md)

## Local development

`npm ci && npm run dev` runs Wrangler on loopback with persisted local SQLite and a simulated model. No Cloudflare login or remote binding is required. Do not bind this unauthenticated demo to a public interface or deploy the `local` environment. `.wrangler/`, `.dev.vars*` and credentials are excluded from source control.

The top-level Wrangler environment is disabled. `npm run build` only bundles the staging configuration with `--dry-run`; it uploads nothing. The repository has no automatic deployment workflow.

## Staging prerequisites

A private demo staging instance has been deployed and its anonymous-access gate checked; authenticated application and recovery qualification remain open. Follow the [staging walkthrough](./staging.md) for the exact provisioning order and private configuration. The complete application requires a Cloudflare account with **Workers Paid**, a protected hostname and a Cloudflare Access application. Dynamic Workers (the `LOADER` binding used by Code Mode) require that paid plan even when model replies are simulated. As checked on 2026-10-09, Workers Paid starts at **US$5 per account per month**, with additional usage charges. The base price is not a spending ceiling. See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [Dynamic Workers pricing](https://developers.cloudflare.com/dynamic-workers/pricing/).

The subscription enables the isolated code execution used by Code Mode. Durable Objects supply persistent state, and Access supplies authentication; Dynamic Workers alone do not provide either guarantee. Our integration composes these services with Pi and OptChat. The included demo connector only creates session-local notes: paying for hosting does not install email, calendar or other external integrations. Real model inference is configured and billed separately from ChatGPT/Claude subscriptions. Review [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) and [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) for the chosen workload.

An existing Cloudflare account can be used. A custom domain is optional: Cloudflare can protect a `workers.dev` hostname with [Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/). This repository leaves all public routes disabled until authentication is configured. Account activation, payment and hosted qualification do not block local development or the [local release-upgrade workflow](./local-upgrades.md).

1. Authenticate Wrangler in the account you intend to use, with the [scopes required for this path](./staging.md#1-connect-your-account).
2. Create the staging Worker with public endpoints disabled, then configure Cloudflare Access for it. Use a dedicated custom hostname or protect the Worker and its `workers.dev` hostname. Limit access to the intended users. Record its team domain and application audience.
3. Create the ignored `wrangler.staging.local.jsonc` copy described in the walkthrough. Set `ACCESS_TEAM_DOMAIN` (a host such as `team.cloudflareaccess.com`) and `ACCESS_AUD` in `env.staging.vars`. Add the reviewed custom route, or explicitly enable `workers_dev` in staging for the protected hostname. These identifiers are configuration, not model credentials.
4. Keep `MODEL_MODE: "demo"` for the first deployment and preview URLs disabled. For a custom route, keep `workers_dev` disabled too. The Worker verifies Access tokens itself; absent or invalid settings fail closed. Review expected usage and the account's billing controls before deploying.
5. Review a dry-run build of the private configuration, then deploy using `npx wrangler deploy --config wrangler.staging.local.jsonc --env staging`. The configured SQLite migration creates the session class. `CodemodeRuntime` is exported for runtime facets; it is not a second manually routed namespace. The original `npm run deploy:staging` uses the closed bootstrap configuration.
6. Exercise chat, source retrieval, approve/reject, reload, restart and cross-user denial on staging. Record the exact revision, configuration and observed outcomes before declaring A4 complete.

The Agents Pi adapter and the Workers AI provider surface are beta. Compatibility here is the exact lockfile matrix, not an assertion that every future version works.

## Optional real model

The implementation supports the official `agents/models/pi-ai` adapter. Add an `ai` binding named `AI` in the staging environment, choose a supported `AI_MODEL` ID, and set `MODEL_MODE` to `workers-ai`. Main answers and memory summaries currently use that same model. Start a **new session** when changing the model configuration; OptChat checks its stored configuration before reopening existing work.

No real model is enabled or called by the default development/CI configuration. Do not copy local Pi OAuth files into the app, repository or Worker secrets. This host does not accept those credentials. Configure any future provider through its own documented hosted API and explicit budget.

The host caps simple-stream model output at 2,048 tokens and reserves at most 500 real model calls per session, including summary calls and failed attempts. It also checks a conservative context byte allowance before dispatch. These input/action caps and the executor timeout limit workload shape; they are not a monetary billing cap. Set account-level monitoring/limits, restrict Access membership, and review the actual model's context/output limits before enabling it. The live model path is implemented but unqualified.

## Observe and recover

The authenticated session state reports active tasks, scheduled wakes, oldest pending age, pending approvals, unknown actions, retained output bytes and Pi's usage accounting. These are functional local counters, not a complete cost dashboard. Failures log categories rather than credentials or raw model payloads.

- **Disconnected:** reload the same session URL. Accepted work is addressed by durable IDs.
- **Pending approval:** review the current operation and fingerprint; stale decisions conflict. Expired approvals cannot execute.
- **Unknown action:** use **Inspect saved outcome**. It never replays the mutation. If still unknown, reconcile its action ID with the destination's recorded effect before deciding on any replacement.
- **Configuration/schema mismatch:** restore the matching application/dependency configuration. Do not remove the schema marker to bypass a compatibility failure.
- **Limits reached:** retain the session and start a new one. Automatic destructive pruning is not implemented.

## Backups and updates

Use the [local backup/restore commands](./local-recovery.md) with Wrangler stopped. They copy the complete persistence directory, including the parent object and Code Mode facets, verify checksums and restore into a fresh destination. The managed launcher coordinates access and checks restored-runtime compatibility. A transcript or output archive is not a restorable snapshot. Cloudflare staging still needs its own coordinated backup/restore procedure and an observed restore in a separate destination.

Do not rewind only Pi or only the Code Mode runtime after an effect: the other system and the destination may already have advanced. Keep the application stopped for any controlled restore and reconcile external effects separately. No hosted restore endpoint, agent self-update, automatic rollback or destructive retention job is exposed in this preview.

For a local update, follow the [reviewed release route](./local-upgrades.md). For a hosted update: review the lockfile diff, preserve old connector implementations, run the focused regression checks, test paused approvals and result delivery against a staging copy, then deploy. Rollback changes code; it does not undo external effects. Hosted cross-release recovery and operational release promotion remain roadmap gates.
