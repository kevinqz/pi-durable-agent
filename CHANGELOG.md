# Changelog

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

These are development previews. Cloudflare staging, live models, hosted coordinated restore and hosted cross-release recovery remain unqualified. See [validation](./docs/validation.md) and [roadmap](./docs/roadmap.md).
