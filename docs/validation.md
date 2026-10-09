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

`npm test` contains **18 tests** covering:

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

Five session-export tests additionally cover public history pagination, owner isolation, a real pending/completed Code Mode output, data integrity, concurrent changes and bounded failure behavior. `npm run test:export` checks the separate offline verifier. See the [export scope](./session-export.md#validation-scope).

The original runtime-reset tests use Cloudflare's `abortAllDurableObjects` test helper and obtains fresh stubs afterward. It resets in-memory instances while retaining storage. The effect-before-checkpoint and delivery-before-ack windows are **seeded durable states**; they are not evidence of a real external service being killed at that exact instruction. The one qualified mutation is the local notes destination.

The browser flow has also been exercised against Wrangler locally: submit the demo command, see the pending exact code/arguments, approve the note, and observe the completed action and its follow-up message. The default UI labels the simulated model as **Demo model**, whether the real runtimes are running locally or on Cloudflare.

Type checking, formatting and the staging **dry-run** bundle are the other release-preview checks. CI runs the same local checks. There is no giant benchmark suite or model-quality/cache-hit experiment in this delivery gate.

## Local backup/restore increment

The [recovery evidence](./local-recovery-validation.json) records a separate same-runtime local application check using `npm run test:recovery`. The launcher refuses backup while the managed server is running. After a **graceful shutdown**, the tool copies and verifies the complete persistence directory and restores it into a fresh directory. The restored app retains the history, memory view, request/task identities, exact pending approval and original retrieval. Two separately approved calls with the same note key produce one destination note and one action-result delivery receipt. The original backup remains checksum-identical after the restored app runs.

`npm run test:state` contains six focused file/operation checks for complete parent/WAL/facet copying, corruption and missing/extra files, live/open-file rejection, linked/nested paths, incompatible runtimes, reviewed release routes and incomplete operations. These opaque file fixtures do not substitute for the separate application reopening proof. Normal reconciliation timestamps may advance during startup.

That same-runtime increment did not change the preview's runtime/dependency source. The [recovery guide](./local-recovery.md) states the supported OS/Node/runtime boundaries and interruption procedure. Its historical evidence is **not** an abrupt-crash experiment, cross-release qualification or Cloudflare-hosted backup.

## Local cross-release increment

The [upgrade evidence](./local-upgrade-validation.json) records an actual **0.1.0-dev.0 → 0.1.0-dev.1** local application flow. The baseline source is the published commit `ae43bf61ba915b2f19c95b78daa88f3bea1ee05b`, extracted into a temporary directory. The target changes admission-contract handling; it is not a version-only relabel. The full locked dependency graph, application schema, OptChat configuration and `NotesV1` source bytes remain unchanged.

`npm run test:upgrade` creates conversations and both a completed action and a pending approval on the old runtime. After graceful shutdown, ordinary restore refuses the changed runtime. The explicit reviewed route copies the complete state into a new directory. The new runtime preserves history, memory view, request/task identities, completed action data, the exact pending approval and original retrieval. Two independently approved occurrences create one note and one delivery receipt for that action. Another target restart retains those receipts and accepts a new conversation turn. The source backup remains checksum-identical.

CI runs this cross-release application flow instead of repeating the same-runtime application flow. The file/route checks still cover ordinary restore. The runner makes no downloads or paid calls; a source archive can be supplied if the baseline Git history is absent. See [the guide](./local-upgrades.md) for the exact route and commands.

The recorded Git revision identifies the checkout base at validation time and may precede uncommitted changes; the source/configuration/dependency fingerprints and verification-script hashes identify the tested contents. This evidence covers macOS/arm64 with Node 22; CI independently exercises Linux/x64 with Node 22. It does not qualify changed dependency graphs, downgrades, external connectors or hosted deployment.

The [dev.1 → dev.2 evidence](./local-upgrade-dev2-validation.json) repeats this application flow from published dev.1 commit `9c3d3d1d4871de561fd477d2b5445cf24ec8bf8a` into the runtime adding bounded demo recovery. Dependencies and connector semantics remain identical. This route and its evidence remain retained.

The [dev.2 → dev.3 evidence](./local-upgrade-dev3-validation.json) qualifies the release adding session data export, starting at published dev.2 commit `3eb63101c0a8f222b506f771b3c5ec064f88fa53`. Dependencies, schema and the connector remain unchanged. `npm run test:upgrade` now exercises this route; earlier routes and evidence remain retained.

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

## Not yet established

- Hosted isolation using a second authenticated identity has not been exercised; the current Access policy intentionally admits only its owner. Signed-token and identity-isolation tests run locally.
- No paid Workers AI model or arbitrary external mutation has been qualified.
- Hosted coordinated backup/restore, hibernation billing behavior and arbitrary abrupt-failure windows remain unqualified. The forced parent reset while a demo approval is idle is narrower than those guarantees.
- No production billing estimate, cost dashboard, arbitrary dependency/connector upgrade or self-update path is claimed. The qualified hosted release change is specifically dev.1 → dev.2.
- Code Mode lacks a public idempotent execute-or-attach API in this version. Ambiguous dispatch is conservatively **unknown**, not transparently resumable.
- Demo summaries are deterministic excerpts. They do not establish model quality, prompt-cache hit rate, token savings or long-run memory accuracy.

These limits keep A4 and A5 open in the roadmap. A local preview is useful and installable without claiming the entire hosted product is finished.
