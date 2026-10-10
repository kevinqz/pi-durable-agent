# Hosted updates and demo recovery

[Staging setup](./staging.md) · [Evidence and limits](./validation.md) · [Local backups](./local-recovery.md)

The **0.1.0-dev.1 → 0.1.0-dev.2** staging check preserved an existing conversation and pending Code Mode approval through a backend deployment. A subsequent owner-requested process reset preserved the same operation. It could then be approved and its retained result delivered to the conversation. See the [recorded observations](./hosted-recovery-validation.json).

This qualifies that specific backend change with unchanged dependencies, storage schema, model configuration and `NotesV1` connector. It does not establish compatibility with an arbitrary dependency update, a coordinated database restore or a crash during an external effect.

## Repeat the bounded check

This historical reset procedure applies to legacy session URLs (`#<id>`). New `#c1:<id>` sessions use the [checkpoint interface](./coordinated-recovery.md), with protected hosted demo and real-model restoration, three native interruption checks and separate second-identity evidence. See [current qualification](./validation.md).

Use a separate synthetic legacy session in your Access-protected **demo** staging environment.

1. Send a distinctive message and retrieve it with **Find original messages**. Select **Try a demo approval** and leave the operation pending. Record its execution ID, sequence, code, arguments, connector contract and expiry.
2. Deploy the reviewed target using your private staging configuration. Keep the same session URL. Cloudflare rolls out Worker and Durable Object code with [eventual consistency](https://developers.cloudflare.com/durable-objects/platform/known-issues/#code-updates): a successful deployment can temporarily coexist with a session running the preceding version.
3. Wait for **Session diagnostics** to show the target runtime. On the dev.1 baseline this panel is absent. Recheck the conversation and the exact pending operation before proceeding.
4. With active work finished, record the activation ID and select **Restart this test session** once. The server schedules a short-lived, authorized Lifecycle job. That job persists its reset marker, flushes storage and calls the native `ctx.abort()` without first draining or closing Pi.
5. Wait for a different activation ID and **Last restart: recovered**. Retrieve the original message again. The same pending approval must remain available with its original expiry; the reset does not extend authorization.
6. Approve that operation once. Inspect **View retained output**, check its single result-delivery request and follow-up, and send another message. Reload the same URL and verify the outcome remains recorded.

The staging check used an authenticated browser. It compared the visible operation fields; it did not independently read destination row counts or the approval fingerprint. The focused local tests check the fingerprint, one destination row, duplicate decisions and delivery identities directly.

## Recovery control contract

The control is enabled only when the session's saved model profile is `demo` and `APP_ENV` is `local` or `staging`. It is absent in real-model sessions and production configurations, including when a real-model session was selected on a deployment whose default remains demo. It requires the session owner's authenticated identity, same-origin request handling and the exact current activation ID.

`POST /api/sessions/:session/recovery/restart` accepts `{ "activationId": "the-current-activation" }`. The session state reports `runtime.release`, `activationId`, `startedAt`, the restart limit/count and the last receipt. An activation identifies an in-memory parent-object instance, not a database version or an individual Code Mode facet.

- At most ten reset admissions are allowed per session. Busy or expired jobs also consume an admission; no automatic retry extends that budget.
- Admission and execution both require idle conversation processing and completed result delivery. A pending approval is permitted. This is fault injection for a synthetic session, not an exclusive maintenance lock against another client starting work.
- The job's authority expires after at most 30 seconds or when the caller's authorization expires, whichever comes first.
- A retry against an already recorded activation returns its receipt; it does not reset the new activation. A stale, unrecorded activation conflicts.
- `scheduled` means the job is admitted. `aborting` is persisted before the abort. `recovered` requires both that marker and a different observed activation. `already_restarted` means another restart happened before the job fired; it is not proof of the requested fault injection. `busy` and `expired` mean no injected reset occurred.
- Lifecycle may retain a recovery job until its interrupted lease is reconciled. Scheduled-wake counts can temporarily remain nonzero after the session reconnects. Repeated delivery sees the saved marker and does not abort again.

This reset retains storage. It neither deletes nor rewinds data, and it does not start a replacement Code Mode execution. The hosted observation establishes a forced **parent process** reset while an approval is paused. It does not independently prove every facet's eviction, machine failure, regional recovery or hibernation billing behavior.

## Why hosted backup/restore remains separate

The application has state in the parent Durable Object and in Code Mode facets. Cloudflare documents [SQLite point-in-time recovery](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#point-in-time-recovery-api) for an individual database, while [facets have their own isolated databases](https://developers.cloudflare.com/dynamic-workers/usage/durable-object-facets/). Restoring only one side after an effect can leave approvals, execution history and delivery receipts at different points.

The legacy root-session layout has no qualified application-wide restore path. The `snapshot()` and snapshot-object restore methods in the reviewed [workerd source](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/actor-state.h) are gated by `workerdExperimental`; they are not part of this pinned stable storage interface. A separate native-facet composition has now demonstrated a supported platform copy primitive, described below. The application does not enable that experimental flag, reach into Code Mode's private facet internals or present a transcript export as a restorable backup.

The later [coordinated checkpoint composition](./coordinated-recovery.md) supplies the same-object recovery boundary that was missing from this historical reset increment. It clones the session and nested executor state, validates a separate target and retains root-owned effects and consumption. It has exact pending-approval restoration evidence, while arbitrary failure windows and root/account loss remain outside scope. A code rollback is not a data restore.

### Native facet checkpoint investigation — 2026-10-09

A local, isolated prototype tried placing the unchanged dev.2 `AgentSession` inside a supervisor facet, intending to clone its complete subtree into a new destination. The first synthetic message failed during Lifecycle startup with `Facets currently cannot set alarms.` No clone or restore was reached, and no hosted resource or user session was involved.

This is narrower than saying facet cloning is unavailable: `ctx.facets.clone` is exposed in the pinned stable Workers types. The obstruction is composing this PiHarness/Lifecycle instance inside a facet. Cloudflare's [sub-agent documentation](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/agents/runtime/execution/sub-agents.mdx) explains that the root owns the physical alarm; the Agents scheduler routes sub-agent work through that root. The pinned Lifecycle configuration does not expose an alarm-delegation adapter for nesting this application unchanged. Adopting such a layout would require a supported integration and its own recovery proof, not a private-method patch.

The public Code Mode 0.5.3 API also provides no transferable execution checkpoint/import contract. Its internal runtime accessor and private facet naming are not integration points for this application. At that stage, a separate coordinated boundary was still needed to preserve pending operation identities and destination reconciliation. The later [checkpoint composition](./coordinated-recovery.md) supplies that boundary through native same-parent subtree cloning. These observations do not prove that all possible architectures are impossible.

The separately implemented [session data export](./session-export.md) gives users a readable copy now. It deliberately records `restorable: false`; the later checkpoint composition supplies a separate same-object restore path.

### Root-owned alarms and a successful native subtree probe

A subsequent composition supplied PiHarness's exported Lifecycle service contract while leaving the actual Lifecycle alarm in the root object. This avoided the facet alarm limitation without modifying SDK source. A private hosted fixture then cloned a quiescent Pi/OptChat session with a nested Code Mode executor, preserving history, memory, request identities and a pending approval. A forced restart of the copied subtree retained its next approval step; two approved occurrences with the same key produced one fixture note. The original source remained unchanged.

The [hosted evidence](./hosted-facet-checkpoint-validation.json) records 14 requests, zero paid model calls and its exact scope. It does not validate a production backup service. The [application integration](./coordinated-recovery.md) adds a durable recovery journal, generation fencing and root-owned budget/effect records and has separate local runtime evidence. The subsequent [application evidence](./coordinated-recovery.md#hosted-evidence-and-remaining-work) records the broader protected workflow and its remaining limits.
