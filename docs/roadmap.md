# Companion agent roadmap

[README](../README.md) · [Architecture](./architecture.md) · [Validation](./validation.md)

Build a complete agent application that combines Pi Durable, OptChat Durable, Cloudflare
hosting and Code Mode tools. It consumes a published OptChat release through the public SDK;
it does not copy or reimplement the memory engine.

This is the canonical roadmap for [kevinqz/pi-durable-agent](https://github.com/kevinqz/pi-durable-agent). OptChat remains a separate dependency with its own release and roadmap.

## Current status — 2026-10-09

| Milestone | Current delivery                                                                                                                                     | Remaining gate                                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A1        | Implemented and locally qualified with official PiHarness, Lifecycle and published OptChat 0.4.0                                                     | Deployed recovery is tracked under A4                                                                                          |
| A2        | Local notes connector, stable admission, approvals, destination deduplication, result archive and delivery; ambiguous dispatch is explicit `unknown` | Each new external connector needs its own qualification; no generic exactly-once claim                                         |
| A3        | Local UI flow and signed-token verification qualified; identity isolation, stale/concurrent decisions and expiry covered                             | Live Access setup and end-to-end hosted flow under A4                                                                          |
| A4        | Local installation, offline backup/isolated restore, dry-run build, CI, counters and operating guide implemented                                     | Cloudflare login/account, protected hostname and budget; staging recovery, hosted backup/restore and first operational release |
| A5        | Schema and immutable connector-contract checks implemented                                                                                           | Cross-release recovery with retained old implementations, then any justified connector/channel expansion                       |

This is a **development preview**, not completion of the entire roadmap. No Cloudflare deployment, real-model evaluation or production guarantee is implied. See [validation](./validation.md) for the exact local evidence and injected-state limitations.

The [local recovery increment](./local-recovery.md) preserves the complete stopped Wrangler state, including Pi memory and Code Mode facets. A synthetic application flow proves original retrieval, the same pending approval and one deduplicated note/result after an isolated restore. This qualifies the local same-runtime path; it does not close A4's hosted recovery or A5's cross-release gate.

## Ownership and sequencing

| Responsibility                                                                        | Owner                                                                      |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Memory tree, source retrieval, frozen views, durable request queue, public memory SDK | `optchat-durable`                                                          |
| Cloudflare lifecycle/storage integration, routing and deployment                      | Companion repository                                                       |
| Tool execution bridge, approvals, action identity and result delivery                 | Companion repository                                                       |
| Application authentication, interface, connectors and operational visibility          | Companion repository                                                       |
| Generic memory/API defect found during integration                                    | Fix and release in `optchat-durable`, then update the companion dependency |

**OptChat O1/O2a/O3/O4 take priority.** Before O4, companion work is limited to documenting scope and
integration decisions. No companion feature implementation is ahead of memory consolidation.
OptChat O4 is complete in [0.4.0](https://github.com/kevinqz/optchat-durable/releases/tag/v0.4.0).
Optional OptChat O2b benchmarks do not block this roadmap.
The first implementation pins the O4 functional release and the reviewed upstream versions; it uses a
published package, not local `src/` imports or an unpinned Git branch.

Start with one application and a runnable example of its public integration points. Extract
an additional SDK only when another real consumer demonstrates a shared contract. Initial
external tools are synthetic or read-only until the action and approval gates pass.

## Milestones

The gates below remain the acceptance contract; the status table above distinguishes implementation from remaining qualification.

| Order | Milestone                                    | Depends on                           | Completion evidence                                                              |
| ----- | -------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| A1    | Cloudflare hosting with OptChat memory       | OptChat O4                           | Admission, frozen context and background recovery tests in the Worker runtime    |
| A2    | Code Mode and durable action contracts       | A1                                   | One deduplicated effect and recoverable result across each tested failure window |
| A3    | Authenticated approvals and usable interface | A2; approval contracts start with A2 | Complete authorized conversation/tool/approval/recovery flow                     |
| A4    | Operational qualification and first release  | A1–A3                                | Staging evidence, install/deploy guide and exact release artifacts               |
| A5    | Controlled updates and broader integrations  | A4                                   | Cross-version recovery and measured benefit of each added capability             |

## A1 — Cloudflare and memory

- Create the companion repository with attribution, license review, a pinned lockfile, CI,
  architecture decisions and a local development path. Recheck the upstream APIs against
  the versions chosen for implementation.
- Use the official `PiHarness`, its supplied SQLite adapter and `Lifecycle`. Register OptChat
  and run `await optchat.prepare(storage)` before `Harness.open`, apply its settings and route all managed input through its controller. The host must provide a public pre-open integration point; preparing after scheduler resumption does not satisfy the storage contract.
  Keep session identity, storage ownership, event mapping and cancellation explicit.
- Connect controller admission to a durable wake before accepted work can be stranded. The
  reviewed PiHarness observes background tasks, but its ordinary admission path differs from
  OptChat's queue. A registry install alone does not establish this contract. Resolve it through
  public lifecycle APIs or an upstream extension point, not private-method patches.
- Test queue admission, memory preparation, frozen-view persistence and background summaries
  through restarts in the Worker test environment. Verify Node compatibility imports and
  storage limits. Keep native Pi/standalone tests in the dependency unchanged.

**Exit gate:** an accepted request resumes with the same memory and identity after each tested
interruption, background work is scheduled durably, and the application uses only supported
public interfaces. These tests establish local runtime behavior; deployed behavior is A4.

The [official PiHarness guide](https://developers.cloudflare.com/agents/harnesses/pi/)
describes the storage/lifecycle model and beta status. The precise admission boundary was
reviewed in [Agents 0.27.0](https://github.com/cloudflare/agents/blob/e335186331f99be12609a5eb0c64c7863c3ccafd/packages/agents/src/harness/pi/harness.ts).

## A2 — Tools and durable effects

- Add the Cloudflare Code Mode runtime and executor with one small connector, initially
  read-only plus a synthetic mutation used for fault tests. Configure the required loader
  binding and runtime export; choose one owner for script execution and replay.
- Define stable identities for inbound requests, tool invocations and external actions.
  Make execution admission recoverable without creating a second script execution after a
  crash. The reviewed `execute({code})` API allocates a new execution ID: an
  `execute-or-attach` contract is work to implement, not an API assumed to exist. If the public
  runtime cannot support it, resolve the upstream capability or change the integration before
  claiming this gate passes.
- Validate arguments and capabilities in the host connector, including generic request
  methods. Bind execution to connector/schema/policy versions. Archive received tool payloads
  before model projection; define separate storage and replay limits for large results.
- Deduplicate mutations at their destination where supported. Otherwise persist an unknown
  outcome and reconcile it; never interpret a lost reply as proof that no effect happened.
- Persist result delivery to Pi in an outbox or equivalent durable protocol, with idempotent
  consumption. Test effect-before-checkpoint and result-before-delivery interruptions, retries,
  cancellation, oversized results and concurrent duplicate requests.

**Exit gate:** every supported mutation demonstrates one effect under duplicate attempts, or
enters an explicit reconciliation state that blocks blind replay. Accepted executions and
finished results cannot disappear between the two runtimes. Synthetic proof does not qualify
an arbitrary real connector.

The [runtime guide](https://developers.cloudflare.com/agents/tools/codemode/durable-runtime/)
documents setup and approvals. The separate execution-admission and result-recording steps are
visible in the reviewed [Code Mode 0.5.3 implementation](https://github.com/cloudflare/agents/blob/995ed8b2d82e4cdf229e14b3601013a86c4f3a6b/packages/codemode/src/proxy-tool.ts).

## A3 — Approvals and application experience

- Authenticate the caller and bind each session, action and approval to the correct user or
  tenant. Test that another identity cannot inspect, approve or execute it.
- Bind approvals to the exact code, arguments, connector version and policy. After a material
  change, retain the approved implementation or require a new decision. Check authorization
  at execution as well as when displaying an approval.
- Implement chat, memory inspection, pending approvals, task progress and reconnect from
  committed state. Present completed, failed, cancelled and unknown outcomes distinctly;
  closing a browser must not silently cancel durable work.
- Test rejection, expired authorization, two clients approving concurrently, version changes
  during a pause and interrupted result delivery. Keep raw credentials and sensitive tool
  payloads out of client responses and public logs.

**Exit gate:** an authenticated user sends a message, receives a concrete action for approval,
restarts the application, approves the same action, gets its result once and retrieves that
result in a later turn. No other user can approve it. Run this flow in CI with synthetic tools
and repeat with each real connector before enabling its mutations.

## A4 — Operations and first release

- Provide a fresh-clone local trial and a documented Cloudflare staging deployment. Explain
  account, model, secrets, storage, domain and cost requirements. Verify an independent
  installation from the release instead of relying on a developer checkout.
- Observe queue age, preparation latency, pending approvals, unknown outcomes, provider
  errors and model/summary/storage costs with linked request/action identifiers. Set resource
  budgets and retention/export policies appropriate to the supported deployment.
- Exercise deployed restarts, redeploys, alarms and hibernation. Record which fault injections
  were abrupt; a graceful drain is not evidence for a sudden crash. Prove backup/restore and
  the stated compatibility route before promoting an update.
- Publish the tested version matrix, evidence, operating procedures, credits and remaining
  limits. Keep development simulation and Cloudflare staging results separately identifiable.

**Exit gate:** the packaged application can be installed and operated using its own guide,
the A3 flow passes in staging, and operators can detect and recover each supported failure
state. The release advertises only qualified connectors and deployment configurations.

Hibernation can eliminate eligible duration charges; storage, requests and model work still
need accounting. Use the current [Durable Objects billing rules](https://developers.cloudflare.com/durable-objects/platform/pricing/)
when budgeting rather than promising a free idle system.

## A5 — Later capabilities

Introduce controlled extension/deployment updates only with versioned schemas, reviewed
changes, compatible checkpoints and old implementations retained for pending approvals.
Code rollback does not undo external effects. Test cross-version recovery before enabling
agent-initiated updates.

Evaluate the Executor of Rhys Sullivan for catalog or gateway capabilities only against a
concrete need. Its [reviewed engine](https://github.com/UsefulSoftwareCo/executor/blob/27dccb896fbaf9d1790496d1a8f131b790c89c68/packages/core/execution/src/engine.ts)
uses in-memory continuations; durable pause recovery must be demonstrated for any selected
integration. Add channels, connectors or another hosting adapter after their benefit and
ownership boundary are clear.

## Release relationship

OptChat and the companion have independent versions, CI and release notes. A companion release
records its exact OptChat dependency and supported store versions. A generic memory defect
returns to the OptChat backlog with a reproducible regression and takes priority over companion
expansion when it affects integrity. Consumers of the Pi memory package do not acquire the
companion's Cloudflare or Code Mode dependencies.
