# Coordinated checkpoint development

[Roadmap](./roadmap.md) · [Hosted observations](./hosted-recovery.md) · [Architecture](./architecture.md)

The recovery composition now runs the **existing application session** inside a native Cloudflare facet. Local integration checks preserve Pi history, OptChat memory, an exact pending Code Mode approval and its result-delivery identity through a subtree checkpoint and restore. Destination notes and consumption records stay in the parent, so restoring an older conversation does not erase an effect or refund recorded usage.

This composition is **not enabled by the production Worker or the default launcher**. It is exported only by the isolated test entrypoint. Existing deployments and their namespaces retain their current layout. This branch is not a qualified upgrade of the published dev.4 artifact; do not bypass the existing runtime-fingerprint checks to use its local state.

## Ownership

| Owner                    | Persistent state                                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root `SessionSupervisor` | Authenticated owner, pinned model, consumption counter, notes destination and effect identities, active-generation pointer, recovery journal, official Lifecycle queue and physical alarm |
| Active `SessionFacet`    | Existing `AgentSession`: Pi, OptChat, request records, action approvals, executor-output archives, delivery records, application-owned child job intents                                  |
| Nested Code Mode facets  | Script execution, recorded calls/results, exact pending operation and native replay state                                                                                                 |
| Inactive checkpoint      | Platform copy of the entire session facet subtree; never opened as an executing session                                                                                                   |
| Restore candidate        | A fresh sibling copied from the checkpoint, inspected while fenced, then promoted only after its evidence matches                                                                         |

The supported primitive is **same-parent subtree cloning**, not a portable archive. Deleting the root object, losing its namespace/account or rewinding its budget/effect ledger is outside this mechanism's coverage. Conversation restore cannot undo an external effect. The original subtree and all retained checkpoints remain present; no cleanup or deletion endpoint exists.

## Recovery protocol

1. Authenticate and check ownership. Validate IDs, snapshot compatibility and allowances before allocating a recovery job. Inspect readiness while ordinary execution is still allowed; a busy session is refused before model admission is frozen.
2. Persist an official Lifecycle recovery wake, then persist the operation and freeze admission. The operation ID is stable across retries.
3. Quiesce the source. Active messages, summaries, running/unknown actions and incomplete result delivery prevent copying. A pending human approval is allowed.
4. Hash retained history, memory/request state, action records, retained outputs and public executor state. Abort the quiescent subtree and use native `ctx.facets.clone` to copy it.
5. A backup leaves the source active. A restore validates a fresh, inactive candidate against the checkpoint proof. Candidate startup cannot dispatch model calls or destination mutations.
6. Atomically record the new active generation, arm its root wake and release its local freeze. The root still denies effects until the journal commits completion. Old generations remain denied afterward.

Interrupted operations retain their phase. A lost clone reply may overwrite only the same operation's never-active destination, from a frozen or immutable source. Failed validation never promotes a candidate. Cancellation before activation retains both copies and reopens the source; once promotion has begun, the same operation must finish instead of guessing whether activation happened.

Bounds: three retained checkpoints, eight restore admissions, 24 total recovery admissions, and three automatic attempts per explicitly admitted/resumed recovery job. A failure remains visible and requires inspection or an explicit resume/cancel. There is no unbounded automatic clone loop. Ordinary requests and destination effects are fenced throughout recovery.

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

The tests have no AI binding, remote binding or account requirement. The runtime needs loopback sockets. The fixture creates isolated objects and does not open the developer's existing Wrangler state. The [local evidence](./local-coordinated-recovery-validation.json) identifies the checked files and separates the tests from hosted qualification.

The four coordinator tests inject lost copy/activation replies, candidate validation failure, incompatible runtimes and retention conflicts. They use application-owned fixture data for the journal; they are not proof of SDK storage copying.

The two integration checks use the **real Pi/OptChat/Code Mode composition**. They restore a pre-effect checkpoint after the source note has already been created, preserve the original approval through another abrupt runtime reset, approve the restored operation and verify one destination note and one delivery receipt. They also check original retrieval, a non-rewinding consumption-counter fixture, wrong-owner denial, admission fencing, a restart before checkpoint execution and refusal of a missing snapshot before a recovery job is allocated. The consumption-counter fixture is synthetic; it makes no claim of a paid model response.

## Hosted evidence and remaining work

A narrower native-facet feasibility probe also passed in a **private Cloudflare Worker**, using 14 requests and zero model calls. It proved subtree cloning, exact Pi/OptChat/executor state, a forced copied-subtree restart and destination deduplication within that fixture. The [record](./hosted-facet-checkpoint-validation.json) includes the deployed version, hashes, two transport cleanup warnings and explicit limits. The [historical source archive](./evidence/native-facet-checkpoint/README.md) preserves the exact tested source.

The newer application coordinator has local evidence only. Before operational release, finish authenticated product routing and recovery UI, pin the deployed build identity, qualify the full coordinator on the hosted runtime, exercise supported failure windows and a second authenticated identity, preserve the legacy update route, and verify fresh-install onboarding. Real-model inference remains unqualified. Portable recovery from root deletion would require a separate supported storage/export mechanism and is not claimed by this checkpoint design.
