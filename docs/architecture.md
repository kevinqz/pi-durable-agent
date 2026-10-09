# Architecture and contracts

[README](../README.md) · [Roadmap](./roadmap.md)

## Composition

`AgentSession` extends the platform's Durable Object and installs the official `Lifecycle` and `PiHarness`. Its public harness factory receives Cloudflare's prefixed SQLite storage. It calls `optchat.prepare(storage)` **before** `Harness.open`, installs both extensions, applies OptChat's settings, and attaches the controller to a dedicated root conversation. No private host method is called or replaced. Pi owns tasks, transcript and scheduling; OptChat owns its memory tree and frozen request view.

An authenticated Worker hashes `[tenant, subject, session]` to select the object. It passes a verified principal through its private namespace binding; browser-supplied identity headers are never trusted. The object also checks its stored owner. The local demo has one local identity and accepts only loopback hostnames. Deployed configurations require an Access JWT verified against the configured issuer, audience, expiry and signing keys. Authentication precedes serving assets and API routes.

## Request admission and recovery

The application serializes admission and verifies request-ID/text conflicts. It first pushes a Lifecycle job containing the original input and stable ID. Only the job admits that input through `OptChatController.enqueue`. The durable job is therefore present before OptChat can start work. A lost HTTP acknowledgement can be retried with the same ID; the browser retains an uncertain submission in session storage scoped to the authenticated identity and session.

The host job periodically checks Pi's live tasks, including background summarization, and remains scheduled until they settle. PiHarness also reconstitutes its own wake jobs from live tasks on startup. A completed answer and its background memory work are separate states. Cancelling a browser request or disconnecting stops no durable task; explicit cancellation is a separate operation.

## Actions and approval

The native `companion-actions-v1` Pi extension exposes `codemode`. A tool invocation derives its action ID from Pi's conversation/task/call identities. It returns an **admission receipt**, allowing Pi to finish that turn while the script later pauses for human approval. It does not keep an in-memory tool continuation alive across the pause.

Each action gets a distinct named official Code Mode runtime facet. The application persists the dispatch marker before calling `execute`. The runtime owns its script, tool-call log and abort/replay approval mechanism. The application owns the action record, contract version, authorization expiry, bounded output archive and delivery acknowledgement.

Every approval fingerprint covers the action ID, exact code, contract version, runtime execution ID, step number, connector, method and arguments. A decision must match the current fingerprint. Concurrent decisions are serialized. The notes connector validates input again at execution and checks the current, unexpired authorization; schema descriptions alone are not enforcement. Each newly pending operation requires its own decision. Network access from generated code is disabled by the executor.

The only mutation is a **synthetic local note**. Its destination atomically stores `(action ID, caller key, text)`. A repeated key/content returns the existing note; a changed payload conflicts. This qualifies that destination, not GitHub, billing APIs, email or arbitrary MCP tools. No such external connector is enabled.

## Ambiguous outcomes

Code Mode 0.5.3's public `execute({code})` always allocates an execution ID; it has no idempotent execute-or-attach operation. Its approval API resumes a paused execution, not an interrupted running execution. This app deliberately accommodates those public contracts:

| Saved evidence after interruption                | Behavior                                      |
| ------------------------------------------------ | --------------------------------------------- |
| Admitted, dispatch has not started               | Run the saved action once                     |
| Dispatch recorded, runtime execution absent      | Mark **unknown**; do not create a replacement |
| Runtime paused                                   | Recover the exact pending approval            |
| Runtime completed                                | Recover its result and finish delivery        |
| Runtime still running without a local invocation | Mark **unknown**; inspect without replay      |
| Runtime rejected or failed                       | Retain that terminal outcome                  |

An unknown record remains in the interface. Inspection can recover a subsequently committed runtime outcome. It cannot infer whether an unrecorded external effect happened. Operator reconciliation is required when the evidence stays ambiguous. There is no automatic retry button for such mutations and no general exactly-once claim.

## Result delivery and retention

The executor archives supported JSON pass outputs before model projection. The official runtime separately records connector arguments/results under its replay limits. The app accepts at most 256,000 UTF-8 bytes in a final pass output, stores it in chunks with a digest, and rejects larger results explicitly; an oversized payload is **not retained**. Only a bounded projection enters the action's model-facing result. The archive shown in the UI is the latest pass output, not a backup of every runtime table.

A terminal action has a durable `delivered` flag. Delivery admits a follow-up through OptChat with `result-<action ID>`, then acknowledges it. Interruption between those steps retries the same request ID. The original tool result remains the receipt; the final outcome arrives as a new conversation turn. Generated result text is marked as data, not authority to execute instructions.

Current bounds: 16,000-byte messages, 32,000-byte HTTP bodies, 16 pending user requests, 1,000 request records and 100 actions per session, 16,000-byte code, 4,000-byte notes, one-hour approvals and 15-second sandbox timeout. The last 100 request slots are reserved for action-result delivery, which also bypasses the user backlog limit. User requests cannot use the reserved `result-` ID prefix. The transcript is not automatically deleted. UI history shows the latest 100 normalized entries; memory search can retrieve earlier sources. Polling occurs every two seconds only while the page is visible.

## Versioning

Application schema `1` and connector contract `notes-v1/schema-1/policy-1/codemode-0.5.3` are explicit. Unsupported application schemas fail before opening Pi; unsupported action contracts block execution. Preserve `NotesV1` and its implementation for existing approvals when introducing a new version. Do not change approval semantics under the same contract string. An application rollback cannot undo a saved external effect.

This is one application, not another SDK or memory engine. Generic OptChat defects belong in its independent repository and a new published dependency release. Cloudflare-specific routing, actions, authentication and UI belong here.
