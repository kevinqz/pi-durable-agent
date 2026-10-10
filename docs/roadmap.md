# Companion agent roadmap

[README](../README.md) · [Architecture](./architecture.md) · [Validation](./validation.md)

Pi Durable Agent composes Pi Durable, the published OptChat Durable SDK, Cloudflare hosting and Code Mode. OptChat remains independently installable and versioned; this application does not reimplement its memory engine.

## Operational foundation — 0.1.0

| Milestone | Qualified first-release scope                                                                                                                             | Later work                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A1        | Official PiHarness/Lifecycle integration and published OptChat 0.4.0                                                                                      | New hosting adapters when needed                                                                         |
| A2        | Session notes, stable admission, exact approvals, destination deduplication, retained completion and result delivery                                      | Every new external connector needs its own policy and failure qualification                              |
| A3        | Local authorization and hosted Access, source retrieval, approval/result UI and second-identity isolation                                                 | Additional channels and connector interfaces                                                             |
| A4        | GPT-OSS-120B tool/approval/follow-up flow; coordinated restoration; three supported hosted interruption boundaries; exact release install/update evidence | Broader failure coverage, performance/model-quality studies and richer account-level cost visibility     |
| A5        | Versioned contracts and reviewed dev.4 → 0.1.0 local update; earlier published routes retained                                                            | Changed dependencies/connectors, cross-build checkpoint migration and any justified Executor integration |

The [first operational release](https://github.com/kevinqz/pi-durable-agent/releases/tag/v0.1.0) supports one deliberately bounded workflow: conversations with OptChat memory and approved session-local note actions. It does not imply arbitrary-failure recovery, generic exactly-once effects or completion of future integrations.

## First operational acceptance evidence

1. **Real model and tools:** the [GPT-OSS trial](./hosted-gpt-oss-validation.json) passed a structured call, exact-operation approval, completion delivery, assistant follow-up and original retrieval. It stopped at 7/12 reserved calls, including summaries and an initial input-schema rejection. The earlier [Scout trial](./hosted-real-model-validation.json) remains separately recorded and unqualified for tools.
2. **Coordinated restoration:** the [hosted demo flow](./hosted-checkpoint-restore-validation.json) restored an earlier pending approval after the source completed its note. The GPT-OSS trial also restored completed real-model state with history, memory, usage, actions, output and diagnostics unchanged. Checkpoints remain tied to the same object and backend build.
3. **Supported interruptions:** [native root-abort checks](./hosted-journal-interruptions-validation.json) cover source quiescence, validated copying and activation before journal completion. Ambiguous external effects remain blocked for reconciliation.
4. **Isolation and operation:** [second-identity isolation](./hosted-identity-isolation-validation.json), exact approvals, durable call reservations and [private outcome/runtime diagnostics](./session-export.md) have separate evidence. Temporary test access was removed. Warm facets must reach the reviewed backend before new work or checkpoints are admitted.
5. **Install and update:** the [local dev.4 → 0.1.0 route](./local-upgrades.md) preserves existing state in a separate copy. The release's `release-validation.json` and `SHA256SUMS` identify its exact source archive, independent installation and final verification. [Archive onboarding](./installation.md) requires no Git or preinstalled Pi.

## Current delivery — 0.1.1: reduce duplicate ownership

The [upstream composition review](./upstream-composition.md) is the coordinated attack plan. OptChat [0.4.1](https://github.com/kevinqz/optchat-durable/releases/tag/v0.4.1) owns canonical request-outcome inspection; this application consumes its published artifact and removes duplicate interpretation and repeated polling reads. The [exact local update](./local-upgrade-v011-validation.json) uses independently installed old/new runtimes and a separate state copy, covering legacy and checkpoint sessions. The review records why the facet bridge, admission ledger and action outbox remain, and the upstream capabilities required to replace them.

## Next priorities

- Keep the supported runtime and provider path healthy with focused regressions when upstream APIs change. A generic memory defect belongs in OptChat first; a transport or hosting defect belongs here.
- Add a connector or channel only for a concrete need, retaining explicit approval, output and uncertain-effect contracts. No email, calendar or arbitrary network connector is implied by this release.
- Qualify each further dependency change and cross-build checkpoint migration before advertising those upgrade paths. Source rollback is not data restoration.
- Extend observability and run memory-quality, cache-efficiency or load studies only as separate work with explicit budgets. Native profiling is an operator diagnostic, not evidence of model quality.
- Evaluate Executor and other integrations against the boundaries below; they are outside this first operational delivery.

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
