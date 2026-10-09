# Deployment and operation

[README](../README.md) · [Architecture](./architecture.md) · [Roadmap](./roadmap.md)

## Local development

`npm ci && npm run dev` runs Wrangler on loopback with persisted local SQLite and a simulated model. No Cloudflare login or remote binding is required. Do not bind this unauthenticated demo to a public interface or deploy the `local` environment. `.wrangler/`, `.dev.vars*` and credentials are excluded from source control.

The top-level Wrangler environment is disabled. `npm run build` only bundles the staging configuration with `--dry-run`; it uploads nothing. The repository has no automatic deployment workflow.

## Staging prerequisites

Staging has **not been deployed or qualified**. A deployment requires an explicitly chosen Cloudflare account, a compatible Workers/Durable Objects plan, a protected hostname, a Cloudflare Access application and an operating budget. Billing is separate from ChatGPT/Claude subscriptions. Consult the current [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) and [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) before enabling paid features.

1. Authenticate Wrangler in the account you intend to use: `npx wrangler login`.
2. Configure a staging hostname and Cloudflare Access application. Limit access to the intended users. Record its team domain and application audience.
3. Set `ACCESS_TEAM_DOMAIN` (a host such as `team.cloudflareaccess.com`) and `ACCESS_AUD` in `env.staging.vars`. Add the reviewed route/custom domain. These identifiers are configuration, not model credentials.
4. Keep `MODEL_MODE: "demo"` for the first deployment. `workers_dev` and preview URLs remain disabled. The Worker verifies Access tokens itself; absent or invalid settings fail closed.
5. Review `npm run build`, then deploy with `npm run deploy:staging`. The configured SQLite migration creates the session class. `CodemodeRuntime` is exported for runtime facets; it is not a second manually routed namespace.
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

For an update: review the lockfile diff, preserve old connector implementations, run the focused regression checks, test paused approvals and result delivery against a staging copy, then deploy. Rollback changes code; it does not undo external effects. Cross-release recovery and operational release promotion remain roadmap gates.
