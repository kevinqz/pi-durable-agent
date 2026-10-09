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

`npm test` contains **11 tests** covering:

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

The runtime reset uses Cloudflare's `abortAllDurableObjects` test helper and obtains fresh stubs afterward. It resets in-memory instances while retaining storage. The effect-before-checkpoint and delivery-before-ack windows are **seeded durable states**; they are not evidence of a real external service being killed at that exact instruction. The one qualified mutation is the local notes destination.

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

## Hosted provisioning increment

A private staging Worker was deployed on **2026-10-09** using Workers Paid, the existing Zero Trust Free organization and a Worker-level Access application. A dedicated exact-email Allow policy uses six-hour sessions and the existing One-time PIN provider. HttpOnly and binding cookies are enabled. Preview URLs remain disabled; the application uses demo mode with no AI binding. Account-specific configuration and credentials are kept outside tracked files.

The [staging evidence](./staging-validation.json) records the source and asset hashes, deployed versions, configuration hash and anonymous checks. The page, static script and identity API redirect to Access when unauthenticated; a forged assertion header does not bypass that gate. The browser displays the application's Access login and accepts a request for an email verification code.

These observations establish provisioning and edge authentication enforcement. They do **not** yet establish a successful authenticated session, hosted Code Mode execution, memory retrieval, recovery or another-user isolation. The [walkthrough](./staging.md) keeps those checks separate from deployment.

## Not yet established

- The authenticated hosted conversation/tool/approval flow remains pending application login and execution; an Access login page is not its completion.
- No paid Workers AI model or arbitrary external mutation has been qualified.
- No deployed hibernation/redeploy/abrupt-restart evidence or hosted coordinated backup/restore proof exists yet.
- No production billing estimate, cost dashboard, hosted cross-release recovery proof or self-update path is claimed.
- Code Mode lacks a public idempotent execute-or-attach API in this version. Ambiguous dispatch is conservatively **unknown**, not transparently resumable.
- Demo summaries are deterministic excerpts. They do not establish model quality, prompt-cache hit rate, token savings or long-run memory accuracy.

These limits keep A4 and A5 open in the roadmap. A local preview is useful and installable without claiming the entire hosted product is finished.
