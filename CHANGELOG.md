# Changelog

## Unreleased

- Add complete offline local-state backup, checksum verification and restoration into a fresh directory, including Pi/OptChat memory and Code Mode facets.
- Coordinate local startup and snapshot operations; refuse open, incompatible, linked, corrupt or incomplete state and preserve existing destinations.
- Qualify a local restore with an exact pending approval, original retrieval, one deduplicated note and one result delivery. Hosted and cross-release recovery remain open.

## 0.1.0-dev.0 — Development preview

- Compose official Cloudflare PiHarness/Lifecycle with the published OptChat Durable 0.4.0 package and Pi 1.1.0.
- Persist admission before input processing, preserve memory across local object resets and isolate sessions by authenticated identity.
- Add official Code Mode execution, exact-operation approvals, a deduplicated local notes connector, bounded output archives and durable result delivery.
- Represent interrupted uncertain executions explicitly and prevent blind mutation retries.
- Provide a credential-free local browser demo, source retrieval, progress and approval inspection.
- Include focused runtime checks, locked dependencies, upstream attribution and a deployment guide.

This is not a production release. Cloudflare staging, live models, coordinated restore and cross-release recovery remain unqualified. See [validation](./docs/validation.md) and [roadmap](./docs/roadmap.md).
