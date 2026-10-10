# Changelog

## 0.1.0 — First operational release

- Verify the running facet's backend before admitting new work or checkpoints. Reload idle old code through native facet APIs while preserving stored state and pending approvals; let already-admitted work drain.
- Include committed model outcome diagnostics and exact backend provenance in private session exports; display saved request failures in the interface.

- Reject empty model completions as failures while preserving usage and charged attempts; do not silently retry them.
- Keep an already scheduled session wake when the interface polls; only the alarm callback replaces its lease. This prevents pending actions from being postponed by an open page.
- Enable source-map uploads and document native Cloudflare CPU/allocation profiling, its scope and its separation from model and memory-quality evidence.

- Run new sessions in native facets with root-owned alarms, consumption records and destination receipts; preserve existing session URLs and connector contracts.
- Add checkpoint creation, confirmed restoration, retained operation receipts, generation fencing and bounded retry/cancellation controls.
- Verify each copied subtree before publishing a checkpoint or activating a restore; report bounded component diagnostics without retaining their private contents.
- Use simple facet names after the hosted runtime reopened colon-named copies empty. Preserve earlier pre-release sessions and refuse new checkpoint admission for that layout.
- Qualify the GPT-OSS-120B structured tool, approval, completion and assistant follow-up flow. Adapt text-part payloads through Pi’s public callback after observing a provider schema rejection; preserve native tool declarations and stored memory.
- Record local legacy upgrade evidence, a protected hosted demo restore, a real-model same-build restore, native root aborts at three coordinator boundaries and second-identity isolation. Retain the unsuccessful Scout trial as separate historical evidence.
- Publish archive-based onboarding, exact artifact hashes and independent installation/update evidence; retain prior releases and connector contracts.

## 0.1.0-dev.4 — Model choice and durable inference allowances

- Choose the configured Workers AI model for a new session without replacing existing demo conversations. Persist the model and allowance before opening Pi.
- Enforce a configurable, durable call allowance across replies, summaries, failed attempts and restarts. Bound both provider streaming entry points and refuse a different model before dispatch.
- Show the selected model and reserved calls in the interface. Keep the forced demo-reset control disabled for real-model sessions.
- Apply identity and expiry checks before opening session work; make configuration retries idempotent and failed selections atomic.
- Add local checks using the official Workers AI adapter with a simulated binding. Real-provider and coordinated hosted-restore qualification remain open.
- Qualify the local dev.3 → dev.4 update with the existing demo model, retained memory and pending approvals; preserve earlier sequential routes.

## 0.1.0-dev.3 — Portable session data

- Add authenticated session data export with every retained normalized history page, current memory, request/action records and exact retained executor outputs.
- Check capture consistency and output references; refuse active, changing, corrupt or oversized data without silently truncating it.
- Add a browser download control and a Node-only offline integrity verifier. Archives are explicitly non-restorable and do not authorize or replay actions.
- Qualify the local dev.2 → dev.3 route with unchanged dependencies, schema and connector; retain earlier sequential routes.
- Document the native facet/alarm composition limit found in an isolated checkpoint prototype and keep hosted coordinated restore open.

## 0.1.0-dev.2 — Hosted recovery qualification

- Add owner-authorized, bounded demo-session process resets through Lifecycle and native `ctx.abort()`, with activation identity and restart receipts.
- Qualify the local dev.1 → dev.2 route and observe the corresponding protected staging backend update with a paused approval.
- Observe a forced hosted parent reset, preserved conversation and pending operation, completed approval/result and a further conversation turn.
- Document the distinction between a process reset, release update and coordinated backup/restore. Keep the reset control disabled in real-model and production configurations.

## 0.1.0-dev.1 — Local recovery and controlled updates

- Add complete offline local-state backup, checksum verification and restoration into a fresh directory, including Pi/OptChat memory and Code Mode facets.
- Coordinate local startup and snapshot operations; refuse open, incompatible, linked, corrupt or incomplete state and preserve existing destinations.
- Qualify a local restore with an exact pending approval, original retrieval, one deduplicated note and one result delivery.
- Add an explicit local upgrade route from the published 0.1.0-dev.0 runtime, preserving memory, completed actions and pending approvals in a separate state copy.
- Persist connector contracts in durable admission jobs, retain V1 for legacy jobs and refuse unsupported contracts before accessing their runtime facets.
- Document Workers Paid requirements, optional custom domains and the separation between local development and hosted qualification.

## 0.1.0-dev.0 — Development preview

- Compose official Cloudflare PiHarness/Lifecycle with the published OptChat Durable 0.4.0 package and Pi 1.1.0.
- Persist admission before input processing, preserve memory across local object resets and isolate sessions by authenticated identity.
- Add official Code Mode execution, exact-operation approvals, a deduplicated local notes connector, bounded output archives and durable result delivery.
- Represent interrupted uncertain executions explicitly and prevent blind mutation retries.
- Provide a credential-free local browser demo, source retrieval, progress and approval inspection.
- Include focused runtime checks, locked dependencies, upstream attribution and a deployment guide.

Earlier dev releases were development previews. Version 0.1.0 qualifies the bounded GPT-OSS/session-notes workflow, coordinated same-build restoration, supported interruption boundaries and reviewed update route described in [validation](./docs/validation.md). Arbitrary failure windows, external connectors and cross-build checkpoint restoration remain outside scope.
