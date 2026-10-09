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

`npm test` contains **10 tests** covering:

- Duplicate/conflicting request IDs, original-source retrieval, frozen context and memory after an abrupt local object reset.
- A saved admission job interrupted before OptChat receives the input.
- Identity isolation, hosted configuration failing closed, and cross-origin rejection.
- Real JWT signature verification plus wrong issuer, wrong audience, expired and tampered tokens using a local signing fixture.
- The official Code Mode sandbox, exact approval fingerprints, rejection, two simultaneous approvals, one deduplicated note and a recoverable delivery acknowledgement.
- Recovery of a paused approval after resetting the local parent object and runtime facets.
- An uncertain dispatch/effect checkpoint that remains unknown and cannot create another execution.
- Expired authorization, changed connector contract, oversized output and denied sandbox network access.
- The complete Pi tool → Code Mode → approval → OptChat follow-up → source-retrieval path.

The runtime reset uses Cloudflare's `abortAllDurableObjects` test helper and obtains fresh stubs afterward. It resets in-memory instances while retaining storage. The effect-before-checkpoint and delivery-before-ack windows are **seeded durable states**; they are not evidence of a real external service being killed at that exact instruction. The one qualified mutation is the local notes destination.

The browser flow has also been exercised against Wrangler: submit the demo command, see the pending exact code/arguments, approve the note, and observe the completed action and its follow-up message. The default UI is a local simulation, as prominently labeled.

Type checking, formatting and the staging **dry-run** bundle are the other release-preview checks. CI runs the same local checks. There is no giant benchmark suite or model-quality/cache-hit experiment in this delivery gate.

## Not yet established

- No Cloudflare account is authenticated in the development environment; no staging deployment was performed.
- No live Access application, paid Workers AI model or arbitrary external mutation has been qualified.
- No deployed hibernation/redeploy/abrupt-restart evidence or coordinated backup/restore proof exists yet.
- No production billing estimate, cost dashboard, cross-release recovery proof or self-update path is claimed.
- Code Mode lacks a public idempotent execute-or-attach API in this version. Ambiguous dispatch is conservatively **unknown**, not transparently resumable.
- Demo summaries are deterministic excerpts. They do not establish model quality, prompt-cache hit rate, token savings or long-run memory accuracy.

These limits keep A4 and A5 open in the roadmap. A local preview is useful and installable without claiming the entire hosted product is finished.
