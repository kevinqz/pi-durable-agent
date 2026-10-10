# Session checkpoints and restoration

[Roadmap](./roadmap.md) · [Hosted observations](./hosted-recovery.md) · [Architecture](./architecture.md)

The recovery composition now runs the **existing application session** inside a native Cloudflare facet. Local integration checks preserve Pi history, OptChat memory, an exact pending Code Mode approval and its result-delivery identity through a subtree checkpoint and restore. Destination notes and consumption records stay in the parent, so restoring an older conversation does not erase an effect or refund recorded usage.

New sessions use this composition through the application's authenticated API and browser interface. The current increment has local runtime and browser evidence; hosted coordinator qualification is still required before the first operational release. Existing session URLs and the original `SESSIONS` namespace keep their previous layout. There is no automatic conversion of a legacy conversation into a checkpoint session.

## Use the interface

1. Select **New session**. New addresses contain `#c1:` followed by the session ID. Keep the whole URL when reopening it.
2. Wait for active conversation and memory work to finish. A pending human approval can remain pending.
3. In **Session recovery**, select **Create checkpoint**. Ordinary controls are disabled while the operation runs. Wait for **Checkpoint saved** before relying on it.
4. Continue the conversation. To return to the saved state, select **Restore…** beside the checkpoint, review the scope and confirm **Restore checkpoint**.
5. Wait for **Session restored**. Review any pending approvals again: their original expiry is preserved. Completed notes and recorded model usage remain in the supervisor and are not rolled back.

If the connection is lost, reopen the same URL. The browser retains the operation ID in identity-scoped session storage and looks up its saved receipt; retrying the same request cannot allocate a second checkpoint. An interrupted operation remains visible. **Resume recovery** retries that operation after inspection; **Cancel recovery** is available before activation and retains both copies. Once activation starts, resume it to finish. Other tabs must refresh before submitting decisions from the old generation.

Each session retains up to three checkpoints and admits up to eight restores. These bounds are not renewed by restoration. No automatic cleanup is performed; when an allowance is exhausted, retain the old session and start a new one. Checkpoints are compatible only with the exact backend build that created them. An incompatible entry remains visible but cannot be restored by a different build.

Legacy addresses such as `#<id>` still open their original conversations. They retain the earlier diagnostics and local offline backup path; select **New session** to use the checkpoint interface. The [local update guide](./local-upgrades.md) explains how to preserve the full existing installation.

## Ownership

| Owner                    | Persistent state                                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root `SessionSupervisor` | Authenticated owner, pinned model, consumption counter, notes destination and effect identities, active-generation pointer, recovery journal, official Lifecycle queue and physical alarm |
| Active `SessionFacet`    | Existing `AgentSession`: Pi, OptChat, request records, action approvals, executor-output archives, delivery records, application-owned child job intents                                  |
| Nested Code Mode facets  | Script execution, recorded calls/results, exact pending operation and native replay state                                                                                                 |
| Inactive checkpoint      | Platform copy of the entire session facet subtree; inspected under the maintenance fence, never admitted to execution                                                                     |
| Restore candidate        | A fresh sibling copied from the checkpoint, inspected while fenced, then promoted only after its evidence matches                                                                         |

The supported primitive is **same-parent subtree cloning**, not a portable archive. Deleting the root object, losing its namespace/account or rewinding its budget/effect ledger is outside this mechanism's coverage. Conversation restore cannot undo an external effect. The original subtree and all retained checkpoints remain present; no cleanup or deletion endpoint exists. Use the separate [offline backup procedure](./local-recovery.md) for a complete stopped local installation and [data export](./session-export.md) for a readable copy.

## Recovery protocol

1. Authenticate and check ownership. Validate IDs, snapshot compatibility and allowances before allocating a recovery job. Inspect readiness while ordinary execution is still allowed; a busy session is refused before model admission is frozen.
2. Persist an official Lifecycle recovery wake, then persist the operation and freeze admission. The operation ID is stable across retries.
3. Quiesce the source. Active messages, summaries, running/unknown actions and incomplete result delivery prevent copying. A pending human approval is allowed.
4. Hash retained history, memory/request state, action records, retained outputs and public executor state. Abort the quiescent subtree and use native `ctx.facets.clone` to copy it.
5. Validate the copied subtree before publishing either a checkpoint or a restored generation. A backup leaves the source active and enters the checkpoint catalog only after its copy matches the source proof. A restore validates a fresh, inactive candidate against the checkpoint proof. Candidate startup cannot dispatch model calls or destination mutations.
6. Atomically record the new active generation, arm its root wake and release its local freeze. The root still denies effects until the journal commits completion. Old generations remain denied afterward.

Interrupted operations retain their phase. A lost clone reply may overwrite only the same operation's never-active destination, from a frozen or immutable source. Failed validation never promotes a candidate. Cancellation before activation retains both copies and reopens the source; once promotion has begun, the same operation must finish instead of guessing whether activation happened.

Bounds: three retained checkpoints, eight restore admissions, 24 total recovery admissions, and three automatic attempts per explicitly admitted/resumed recovery job. A failure remains visible and requires inspection or an explicit resume/cancel. There is no unbounded automatic clone loop. Ordinary requests and destination effects are fenced throughout recovery.

## Routing, contracts and build identity

`/api/checkpoint-sessions/:id/*` uses the new `RECOVERY_SESSIONS` binding. `/api/sessions/:id/*` retains the original binding and ownership mapping. Authentication, origin checks and body limits apply to both. The appended `v2` migration creates only `SessionSupervisor`; `SessionFacet` and Code Mode use the platform's exported facet classes. Existing migrations are retained.

New-session POST requests carry `expectedGeneration`, taken from `state.recovery.generation`. A mismatching generation returns 409 before dispatch, including when an old approval still has the same fingerprint after restoration. Configuration is only allowed before the session starts. Journal lookup, same-ID retries and explicit resume/cancel refer to the saved operation rather than admitting a new one. During recovery, `GET state` returns `recovering: true` with the journal and model fields; consumers must not expect ordinary conversation fields until completion.

Legacy `NotesV1` keeps its original source and contract. New sessions use `supervisor-notes-v1/schema-1/policy-1/codemode-0.5.3`, whose implementation writes through the non-rewinding root destination. Neither contract can be silently substituted for the other.

`npm run runtime:update` generates `src/generated/checkpoint-build.json` from backend source, the complete locked dependency graph and the tracked Cloudflare compatibility date/flags. The launcher and Wrangler custom build run it before startup/bundling. `npm run runtime:check` fails if the committed identity is stale. The digest excludes its own generated file, browser assets and operator-specific configuration; it does not prove compatibility for a changed namespace, model or deployment policy. Keep those settings stable. The broader local-update fingerprint separately includes tracked runtime configuration. Preserve the exact prior source/configuration before an update; editing a digest is not a migration.

## Alarm and provider boundaries

Facets cannot set physical alarms. `FacetLifecycle` supplies the exported `LifecycleServices` contract through PiHarness's protected service getters, without patching SDK source. It stores only its own child job intents. The parent retains the official Lifecycle alarm, dispatch lease and memory-reset breaker.

Every parent-to-child invocation is preceded by a durable root wake. Child intent is written before its wake notification; a lost notification therefore has a recovery path. Revision tokens prevent an older callback from deleting a newer same-ID push or reschedule. The root tracks and awaits the child's handed-off alarm work before deciding its next wake. Delayed wake notifications from retired generations are harmless acknowledgements, not admissions.

This bridge implements the bounded Pi/application composition, not every Lifecycle feature. Custom retry/lease/exclusive policies, socket transport and arbitrary capability routes are refused. The public API aperture is typed against **Agents 0.28.0**; it is an application adapter, not an upstream-endorsed turnkey backup feature.

For a real model, both streaming entrypoints must receive supervisor authorization and reserve an attempt before the provider is called. Argument/context bounds run first. The root consumption ledger is outside the copied subtree. The synthetic note destination also stays in the root and checks the generation, current approval, original code/contract and stable action/key identity before writing.

## Reproduce locally

Use a fresh checkout and installed dependencies:

```sh
npm ci
npm run typecheck
npm test -- test/checkpoint-coordinator.test.ts test/models.test.ts
npm run test:checkpoints
```

The tests have no AI binding, remote binding or account requirement. The runtime needs loopback sockets. The fixture creates isolated objects and does not open the developer's existing Wrangler state. The [product integration evidence](./product-checkpoints-local-validation.json) identifies the checked files and separates local validation from hosted qualification. The [earlier isolated composition record](./local-coordinated-recovery-validation.json) remains historical evidence for its exact source hashes.

The seven coordinator/evidence tests cover lost copy/validation/activation replies, empty copies, changed approval evidence, candidate validation failure, incompatible runtimes, retention conflicts and refusal of the earlier unsupported facet names. They use application-owned fixture data for the journal; they are not proof of SDK storage copying.

The three integration checks use the **real Pi/OptChat/Code Mode composition**. They restore a pre-effect checkpoint after the source note has already been created, preserve the original approval through another abrupt runtime reset, approve the restored operation and verify one destination note and one delivery receipt. They also check original retrieval, a non-rewinding consumption-counter fixture, wrong-owner denial, admission fencing, a restart before checkpoint execution, refusal of a missing snapshot before a recovery job is allocated, stale-generation decisions, and separation of legacy/new HTTP routes. The consumption-counter fixture is synthetic; it makes no claim of a paid model response.

The [browser observations](./checkpoint-ui-local-validation.json) cover checkpoint creation, source approval, confirmed restore, reapproval, reload and original-source search. They identify the pre-release source/assets that were observed; a visible single follow-up is not an independent destination-row count.

## Hosted evidence and remaining work

A narrower native-facet feasibility probe also passed in a **private Cloudflare Worker**, using 14 requests and zero model calls. It proved subtree cloning, exact Pi/OptChat/executor state, a forced copied-subtree restart and destination deduplication within that fixture. The [record](./hosted-facet-checkpoint-validation.json) includes the deployed version, hashes, two transport cleanup warnings and explicit limits. The [historical source archive](./evidence/native-facet-checkpoint/README.md) preserves the exact tested source.

The first hosted application restore failed its integrity comparison and was cancelled without replacing the source. A [bounded native probe](./hosted-facet-name-validation.json) isolated colon-containing facet names: both colon cases reopened empty, while simple names preserved parent and nested KV/SQL values, with or without class props. The correction uses simple names and validates backups before publishing them. Existing pre-release facet addresses are not renamed or reinterpreted; those conversations remain usable and exportable, but creating checkpoints requires a new session. Their old checkpoints still require their exact prior runtime.

The corrected coordinator still requires hosted application qualification. Before operational release, qualify the full coordinator on the hosted runtime, exercise supported failure windows and a second authenticated identity, preserve the legacy update route, and verify fresh-install onboarding. Real-model inference remains unqualified. Portable recovery from root deletion would require a separate supported storage/export mechanism and is not claimed by this checkpoint design.
