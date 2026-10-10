# Deployment and operation

[README](../README.md) · [Architecture](./architecture.md) · [Roadmap](./roadmap.md)

## Local development

`npm ci && npm run dev` runs Wrangler on loopback with persisted local SQLite and a simulated model. No Cloudflare login or remote binding is required. Do not bind this unauthenticated demo to a public interface or deploy the `local` environment. `.wrangler/`, `.dev.vars*` and credentials are excluded from source control.

The top-level Wrangler environment is disabled. `npm run build` only bundles the staging configuration with `--dry-run`; it uploads nothing. The repository has no automatic deployment workflow.

## Staging prerequisites

The [qualified scope](./validation.md) includes protected demo operation, reviewed backend updates, bounded resets, coordinated restoration, three native interruption boundaries, second-identity isolation and a [GPT-OSS tool/approval/completion flow](./hosted-gpt-oss-validation.json). Follow the [staging walkthrough](./staging.md) for provisioning and private configuration. The complete application requires a Cloudflare account with **Workers Paid**, a protected hostname and a Cloudflare Access application. Dynamic Workers (the `LOADER` binding used by Code Mode) require that paid plan even with simulated replies. As checked on 2026-10-09, Workers Paid starts at **US$5 per account per month**, with additional usage charges; that base price is not a spending ceiling. See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [Dynamic Workers pricing](https://developers.cloudflare.com/dynamic-workers/pricing/).

The subscription enables the isolated code execution used by Code Mode. Durable Objects supply persistent state, and Access supplies authentication; Dynamic Workers alone do not provide either guarantee. Our integration composes these services with Pi and OptChat. The included demo connector only creates session-local notes: paying for hosting does not install email, calendar or other external integrations. Real model inference is configured and billed separately from ChatGPT/Claude subscriptions. Review [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) and [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) for the chosen workload.

An existing Cloudflare account can be used. A custom domain is optional: Cloudflare can protect a `workers.dev` hostname with [Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/). This repository leaves all public routes disabled until authentication is configured. Account activation, payment and hosted qualification do not block local development or the [local release-upgrade workflow](./local-upgrades.md).

1. Authenticate Wrangler in the account you intend to use, with the [scopes required for this path](./staging.md#1-connect-your-account).
2. Create the staging Worker with public endpoints disabled, then configure Cloudflare Access for it. Use a dedicated custom hostname or protect the Worker and its `workers.dev` hostname. Limit access to the intended users. Record its team domain and application audience.
3. Create the ignored `wrangler.staging.local.jsonc` copy described in the walkthrough. Set `ACCESS_TEAM_DOMAIN` (a host such as `team.cloudflareaccess.com`) and `ACCESS_AUD` in `env.staging.vars`. Add the reviewed custom route, or explicitly enable `workers_dev` in staging for the protected hostname. These identifiers are configuration, not model credentials.
4. Keep `MODEL_MODE: "demo"` for the first deployment and preview URLs disabled. For a custom route, keep `workers_dev` disabled too. The Worker verifies Access tokens itself; absent or invalid settings fail closed. Review expected usage and the account's billing controls before deploying.
5. Review a dry-run build of the private configuration, then deploy using `npx wrangler deploy --config wrangler.staging.local.jsonc --env staging`. Keep the original `v1` migration and append `v2`, which creates `SessionSupervisor` for the new `RECOVERY_SESSIONS` binding. Retain `SESSIONS` for older URLs. `SessionFacet` and `CodemodeRuntime` are exported facet classes, not additional manually routed namespaces. The original `npm run deploy:staging` uses the closed bootstrap configuration.
6. Exercise chat, source retrieval, approve/reject, reload, restart and cross-user denial on staging. Record the exact revision, configuration and observed outcomes before declaring A4 complete.

The Agents Pi adapter and the Workers AI provider surface are beta. Compatibility here is the exact lockfile matrix, not an assertion that every future version works.

## Optional real model

The implementation supports the official `agents/models/pi-ai` adapter. Add an `ai` binding named `AI` in the staging environment, choose a supported `AI_MODEL` ID, and set a bounded `MODEL_CALL_LIMIT`. Keep `MODEL_MODE: "demo"` when upgrading an existing demo deployment. The interface then offers the real model for a **new session**; each session pins its model and allowance before Pi opens. Main answers and memory summaries use that same model. Follow the [model-selection and upgrade instructions](./models.md).

No real model is enabled or called by the default development/CI configuration. Do not copy local Pi OAuth files into the app, repository or Worker secrets. This host does not accept those credentials. Configure any future provider through its own documented hosted API and explicit budget.

The host caps both provider streaming entry points at 2,048 output tokens and reserves a configurable 1–500 real model calls per session, including summary calls and failed attempts. New real-model sessions default to 100 calls; use a smaller allowance for the first trial. It also checks a conservative context byte allowance before dispatch. These input/action caps and the executor timeout limit workload shape; they are not a monetary billing cap. Set account-level monitoring/limits, restrict Access membership, and review the actual model's context/output limits before enabling it. The live model path has partial [hosted evidence](./hosted-real-model-validation.json); structured tool use is not yet qualified.

## Observe and recover

Use [native on-demand profiling](./profiling.md) to investigate CPU and
allocation costs in the hosted Worker or a specific Durable Object. The
tracked configuration uploads source maps; existing private copies need the
same setting before their next deployment. Profiling complements the session
counters and recovery receipts.

The authenticated session state reports active tasks, scheduled wakes, oldest pending age, pending approvals, unknown actions, retained output bytes and Pi's usage accounting. These are functional local counters, not a complete cost dashboard. Failures log categories rather than credentials or raw model payloads.

- **Disconnected:** reload the same session URL. Accepted work is addressed by durable IDs.
- **Pending approval:** review the current operation and fingerprint; stale decisions conflict. Expired approvals cannot execute.
- **Unknown action:** use **Inspect saved outcome**. It never replays the mutation. If still unknown, reconcile its action ID with the destination's recorded effect before deciding on any replacement.
- **Configuration/schema mismatch:** restore the matching application/dependency configuration. Do not remove the schema marker to bypass a compatibility failure.
- **Legacy demo recovery check:** open **Session diagnostics** to see the runtime version and activation. The owner can request a bounded process reset while work is idle; [the guide](./hosted-recovery.md) explains its receipts and limits. It does not rewind storage or authorize a replacement action.
- **Limits reached:** retain the session and start a new one. Automatic destructive pruning is not implemented.

## Backups and updates

Use the [local backup/restore commands](./local-recovery.md) with Wrangler stopped. They copy the complete persistence directory, including the parent object and Code Mode facets, verify checksums and restore into a fresh destination. The managed launcher coordinates access and checks restored-runtime compatibility. A transcript or output archive is not a restorable snapshot. New sessions have a separate [coordinated checkpoint procedure](./coordinated-recovery.md) that copies the active facet subtree and restores into a fresh sibling. A protected hosted demo flow and three private native interruption checks have passed. See the procedure for exact evidence and limits; the [GPT-OSS trial](./hosted-gpt-oss-validation.json) separately covers a real action and same-build restoration.

Do not rewind only Pi or only the Code Mode runtime after an effect: the other system and destination may already have advanced. The coordinated protocol fences new-session work while copying and retains effects and consumption outside the restored subtree. Stop Wrangler for offline file backups. Neither mechanism advertises portable cloud recovery from root deletion, agent self-update, automatic rollback or destructive retention.

For a local update, follow the [reviewed release route](./local-upgrades.md). For a hosted update: review the lockfile diff, preserve old connector implementations, run the focused regression checks, test paused approvals and result delivery against a staging copy, then deploy. Rollback changes code; it does not undo external effects. The exact dev.1 → dev.2 hosted route is observed in the [recovery evidence](./hosted-recovery-validation.json). Changed dependencies/connectors and restoration across backend builds still require separate qualification.
