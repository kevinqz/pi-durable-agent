# Validation and limits

[README](../README.md) · [Roadmap](./roadmap.md)

Local validation on **2026-10-09** uses the installed release artifact of OptChat, the official Cloudflare test plugin and its Workers runtime. No paid model calls or remote Cloudflare resources are involved.

| Component                | Pinned version                                     |
| ------------------------ | -------------------------------------------------- |
| OptChat Durable          | 0.4.0 release tarball; lockfile integrity recorded |
| Pi Durable, Pi AI, Chord | 1.1.0                                              |
| Cloudflare Agents        | 0.28.0                                             |
| Cloudflare Code Mode     | 0.5.3                                              |
| Wrangler                 | 4.149.0                                            |
| Cloudflare Vitest plugin | 1.4.0                                              |
| Vitest                   | 4.1.0                                              |
| Local Node               | 22.23.1                                            |

## Focused checks

`npm test` contains **32 tests** covering:

- Duplicate/conflicting request IDs, original-source retrieval, frozen context and memory after an abrupt local object reset.
- A saved admission job interrupted before OptChat receives the input.
- Identity isolation, hosted configuration failing closed, and cross-origin rejection.
- Real JWT signature verification plus wrong issuer, wrong audience, expired and tampered tokens using a local signing fixture.
- The official Code Mode sandbox, exact approval fingerprints, rejection, two simultaneous approvals, one deduplicated note and a recoverable delivery acknowledgement.
- Recovery of a paused approval after resetting the local parent object and runtime facets.
- An uncertain dispatch/effect checkpoint that remains unknown and cannot create another execution.
- Expired authorization, changed connector contract, oversized output and denied sandbox network access.
- The complete Pi tool → Code Mode → approval → OptChat follow-up → source-retrieval path.
- Contract-pinned durable admissions, legacy V1 jobs and unsupported contracts remaining inspectable without reopening their facets through a different implementation.
- A real `ctx.abort()` scheduled through Lifecycle, a changed activation and recovered receipt, preserved history/memory/pending approval fingerprint, one note/result afterward and harmless retry of the previous activation.
- Demo recovery denial for wrong owners, expired authorization, stale activations, active work and disabled/production/real-model configurations.
- Immutable, owner-bound model selection before Pi starts, atomic failed configuration and idempotent retries.
- Durable call reservations after a reset, invalid model/allowance refusal and disabled demo reset for a real-model session.
- Empty streamed model outcomes fail without retry or lost usage; native tool-only responses survive the asynchronous admission guard on both streaming entry points.
- Both streaming entry points of the official Workers AI adapter using a simulated binding, bounded output, context checks and rejection before provider dispatch.

Five of these tests cover session export: public history pagination, owner isolation, a real pending/completed Code Mode output, data integrity, concurrent changes and bounded failure behavior. `npm run test:export` checks the separate offline verifier. See the [export scope](./session-export.md#validation-scope).

The original runtime-reset tests use Cloudflare's `abortAllDurableObjects` test helper and obtains fresh stubs afterward. It resets in-memory instances while retaining storage. The effect-before-checkpoint and delivery-before-ack windows are **seeded durable states**; they are not evidence of a real external service being killed at that exact instruction. The one qualified mutation is the local notes destination.

The browser flow has also been exercised against Wrangler locally: submit the demo command, see the pending exact code/arguments, approve the note, and observe the completed action and its follow-up message. The default UI labels the simulated model as **Demo model**, whether the real runtimes are running locally or on Cloudflare.

Type checking, formatting and the staging **dry-run** bundle are the other release-preview checks. CI runs the same local checks. There is no giant benchmark suite or model-quality/cache-hit experiment in this delivery gate.

## Local backup/restore increment

The new [coordinated-recovery composition](./coordinated-recovery.md) has seven journal/evidence checks within `npm test` and four native application integration checks in `npm run test:checkpoints`. A fifth model-control check verifies that asynchronous supervisor authorization precedes either provider stream. The [dev.5 product integration record](./product-checkpoints-local-validation.json) records the current local checks and exact source hashes. The integration suite also prevents polling from postponing an admitted wake, executes a newly admitted action without forcing its job timestamp, exercises the actual HTTP router and rejects an approval submitted from the previous generation. The [local browser record](./checkpoint-ui-local-validation.json) covers the new controls and post-restore search. These are local synthetic checks. The narrower [hosted facet probe](./hosted-facet-checkpoint-validation.json) establishes the native copying primitive only; it does not close the production recovery gate.

The [hosted interruption fixture](./hosted-journal-interruptions-validation.json) exercises three native root-abort boundaries using the unchanged application source in a private subclass. Alarm-driven recovery retained the exact pending approval, with one destination row and one delivery receipt counted after reapproval. The [independent installation record](./independent-archive-install-validation.json) covers fresh dependencies from the local cache, an archive without Git, a demo conversation and a validated checkpoint. Neither record qualifies real inference or a second Access identity.

The corrected hosted flow is recorded separately in [hosted checkpoint restoration](./hosted-checkpoint-restore-validation.json). It preserves the exact approval after source completion and returns the same note receipt on reapproval. The initial colon-name failure and its cancellation are retained in [the failing-build record](./hosted-product-checkpoints-dev5-validation.json); [the native comparison](./hosted-facet-name-validation.json) explains why the correction uses simple facet names and validates copies before announcing success. The current local upgrade record identifies the corrected backend.

The [recovery evidence](./local-recovery-validation.json) records a separate same-runtime local application check using `npm run test:recovery`. The launcher refuses backup while the managed server is running. After a **graceful shutdown**, the tool copies and verifies the complete persistence directory and restores it into a fresh directory. The restored app retains the history, memory view, request/task identities, exact pending approval and original retrieval. Two separately approved calls with the same note key produce one destination note and one action-result delivery receipt. The original backup remains checksum-identical after the restored app runs.

`npm run test:state` contains six focused file/operation checks for complete parent/WAL/facet copying, corruption and missing/extra files, live/open-file rejection, linked/nested paths, incompatible runtimes, reviewed release routes and incomplete operations. These opaque file fixtures do not substitute for the separate application reopening proof. Normal reconciliation timestamps may advance during startup.

That same-runtime increment did not change the preview's runtime/dependency source. The [recovery guide](./local-recovery.md) states the supported OS/Node/runtime boundaries and interruption procedure. Its historical evidence is **not** an abrupt-crash experiment, cross-release qualification or Cloudflare-hosted backup.

## Local cross-release increment

The [upgrade evidence](./local-upgrade-validation.json) records an actual **0.1.0-dev.0 → 0.1.0-dev.1** local application flow. The baseline source is the published commit `ae43bf61ba915b2f19c95b78daa88f3bea1ee05b`, extracted into a temporary directory. The target changes admission-contract handling; it is not a version-only relabel. The full locked dependency graph, application schema, OptChat configuration and `NotesV1` source bytes remain unchanged.

`npm run test:upgrade` creates conversations and both a completed action and a pending approval on the old runtime. After graceful shutdown, ordinary restore refuses the changed runtime. The explicit reviewed route copies the complete state into a new directory. The new runtime preserves history, memory view, request/task identities, completed action data, the exact pending approval and original retrieval. Two independently approved occurrences create one note and one delivery receipt for that action. Another target restart retains those receipts and accepts a new conversation turn. The source backup remains checksum-identical.

CI runs this cross-release application flow instead of repeating the same-runtime application flow. The file/route checks still cover ordinary restore. The runner makes no downloads or paid calls; a source archive can be supplied if the baseline Git history is absent. See [the guide](./local-upgrades.md) for the exact route and commands.

The recorded Git revision identifies the checkout base at validation time and may precede uncommitted changes; the source/configuration/dependency fingerprints and verification-script hashes identify the tested contents. This evidence covers macOS/arm64 with Node 22; CI independently exercises Linux/x64 with Node 22. It does not qualify changed dependency graphs, downgrades, external connectors or hosted deployment.

The [dev.1 → dev.2 evidence](./local-upgrade-dev2-validation.json) repeats this application flow from published dev.1 commit `9c3d3d1d4871de561fd477d2b5445cf24ec8bf8a` into the runtime adding bounded demo recovery. Dependencies and connector semantics remain identical. This route and its evidence remain retained.

The [dev.2 → dev.3 evidence](./local-upgrade-dev3-validation.json) qualifies the release adding session data export, starting at published dev.2 commit `3eb63101c0a8f222b506f771b3c5ec064f88fa53`. Dependencies, schema and the connector remain unchanged. This route and its evidence remain retained.

The [dev.3 → dev.4 evidence](./local-upgrade-dev4-validation.json) qualifies the release adding persisted model profiles and call allowances, starting at published dev.3 commit `fe540ad25246961b9cd047eeb20696d8fc91b56e`. The existing demo conversation retains its model, memory, completed action and exact pending approval. The dependency graph, SQL schema and connector remain unchanged. This historical route remains retained. This demo fixture does not establish a cross-release update of a legacy real-model session.

The [dev.4 → dev.5 evidence](./local-upgrade-dev5-validation.json) qualifies the release adding a separate checkpoint namespace and recovery interface, starting at published dev.4 commit `90815ac513714a3227c4b3d82dbe06a928b2c590`. Existing session URLs retain their original namespace, connector bytes and exact pending approval. The test also proves original retrieval, one destination effect, one result delivery and continued conversation after another target restart. `npm run test:upgrade` now exercises this route. New checkpoint sessions have separate native integration and browser evidence; this update fixture does not convert old sessions or qualify cross-build checkpoint restoration.

The [provider-outcome update evidence](./local-upgrade-model-outcomes-validation.json) repeats the dev.4 → dev.5 route for the current provider guard, wake scheduling and source-map configuration. The legacy connector, stored schemas and dependency graph remain unchanged; the prior checkpoint-preview route and evidence are retained. This is a local demo update, not cross-build checkpoint restoration.

## Model selection increment

The [model control evidence](./model-controls-validation.json) separates local runtime checks from live inference. Four focused tests use the official provider adapter with a simulated `Ai.run` response. They cover saved configuration, durable allowances and bounds without calling a paid model. An additional browser check used a local Wrangler application with a remote AI binding: selecting Workers AI created a new empty session displaying the expected model and **0/12** reserved calls, with demo-only actions and reset controls absent. Opening the page made no model call.

The browser check establishes configuration and display behavior. It does not qualify a provider response, model-directed tool use, real summaries or hosted persistence. Those remain part of the first operational release gate. The [model guide](./models.md) explains the per-session limit and its distinction from account billing.

## Hosted staging increments

A private staging Worker was deployed on **2026-10-09** using Workers Paid, the existing Zero Trust Free organization and a Worker-level Access application. A dedicated exact-email Allow policy uses six-hour sessions and the existing One-time PIN provider. HttpOnly and binding cookies are enabled. Preview URLs remain disabled; the application uses demo mode with no AI binding. Account-specific configuration and credentials are kept outside tracked files.

The [staging evidence](./staging-validation.json) records the source and asset hashes, deployed versions, configuration hash and anonymous checks. The page, static script and identity API redirect to Access when unauthenticated; a forged assertion header does not bypass that gate.

After the owner completed Access login, a separate synthetic browser session exercised:

- A completed conversation turn and original-source retrieval through OptChat.
- A Code Mode note paused for approval, followed by a real staging deployment. The deployment changed only the browser script; backend code, dependencies, bindings and private configuration stayed identical.
- The same session, conversation and pending execution after reloading. The execution ID, operation sequence, connector, method, code, arguments, contract and expiry matched the values observed before deployment.
- One approval, a completed note result in the retained output, one visible result-delivery request and one corresponding assistant follow-up.
- Retrieval of that saved result, a further conversation turn, and another reload without another visible delivery. Original text remained searchable.

The browser review also found a display defect: a detail opened during a pause could remain visible after completion, although the stored final result was correct. The interface now exposes retained output only for completed/failed actions, invalidates a selected output when its recorded outcome changes, and ignores superseded responses. Legacy pause markers are presented as missing final output rather than as an execution error.

These are **hosted demo observations through the authenticated browser**, not a model-quality study or a hosted fault-injection/concurrency test. One successful note receipt does not independently count destination rows. Destination deduplication and concurrent decisions are covered by the separate local runtime tests. A deployment with unchanged backend code is not a cross-release migration, and no forced eviction or abrupt crash was injected. See the [walkthrough](./staging.md) to repeat this bounded flow.

### Backend update and forced demo reset

The later [dev.2 evidence](./hosted-recovery-validation.json) records a **backend** update from dev.1, followed by a forced parent-process reset through native `ctx.abort()` while the same synthetic approval remained pending. The browser observed the target runtime, a new activation with a recovered reset receipt, the same pending operation fields, original-source retrieval, a completed approval/result and continued conversation. The recorded reset is not a graceful Pi shutdown.

The complete dependency graph, storage schema, private deployment configuration and V1 connector stayed unchanged. No data rewind or replacement Code Mode execution was requested. The check does not independently establish every facet’s eviction, a fault during an external effect or a coordinated restore. The browser’s visible single result is distinguished from the independent row/identity assertions in local tests. See the [repeatable procedure](./hosted-recovery.md).

### Session data export and dev.3 update

The [dev.3 evidence](./session-export-validation.json) records the protected backend update from dev.2, preserved conversation/memory/pending operation, and browser downloads before and after approval. The files were found in Downloads and independently passed the Node verifier; a browser status message alone was not treated as proof of download. The completed archive contains eight messages, one action, one retained output and one delivery record. An empty-session download also passed. The new endpoint, page and static script redirect anonymous browser requests to Access. No model call, forced reset or coordinated restore was performed in this increment.

The same evidence records a failed isolated native-checkpoint prototype: the unchanged PiHarness/Lifecycle cannot start inside a facet that lacks a physical alarm. Clone and restore were not reached. See the [composition findings](./hosted-recovery.md#native-facet-checkpoint-investigation--2026-10-09).

## Not yet established

- Hosted isolation using a second authenticated identity has not been exercised; the current Access policy intentionally admits only its owner. Signed-token and identity-isolation tests run locally.
- No real Workers AI inference or arbitrary external mutation has been qualified.
- Hosted checkpoint evidence covers a protected demo restore and three private native root-abort boundaries: after source quiescence, after candidate validation and after activation before journal completion. Arbitrary abrupt-failure windows, real-provider interruptions, hibernation billing behavior, root/namespace/account loss and cross-build checkpoint restoration remain unqualified. See the [exact recovery scope](./coordinated-recovery.md#hosted-evidence-and-remaining-work).
- No production billing estimate, cost dashboard, arbitrary dependency/connector upgrade or self-update path is claimed. Hosted update evidence covers dev.1 → dev.2, dev.2 → dev.3 and the [legacy-session dev.3 → dev.5 flow](./hosted-product-checkpoints-dev5-validation.json), with unchanged dependencies. That legacy update passed even though the same record's initial checkpoint-restoration flow failed; the corrected restore has its own [evidence](./hosted-checkpoint-restore-validation.json).
- The independently installed archive is a development candidate. Verification and publication of the final operational release artifact remain open.
- Code Mode lacks a public idempotent execute-or-attach API in this version. Ambiguous dispatch is conservatively **unknown**, not transparently resumable.
- Demo summaries are deterministic excerpts. They do not establish model quality, prompt-cache hit rate, token savings or long-run memory accuracy.

These limits keep A4 and A5 open in the roadmap. A local preview is useful and installable without claiming the entire hosted product is finished.
