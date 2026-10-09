# Contributing

Start with [the architecture](./docs/architecture.md) and the explicit [roadmap gates](./docs/roadmap.md). Use Node 22.19+ and `npm ci`. Run `npm run check` before submitting a change; it uses local synthetic fixtures and does not call a paid model or deploy.

Keep changes within their owner: generic memory changes belong in [optchat-durable](https://github.com/kevinqz/optchat-durable); this repository consumes a published release. Use public upstream APIs and preserve exact dependency versions. Explain the trigger, resulting behavior, focused validation and limitations in a pull request.

New connectors need argument validation in executable host code, explicit capabilities, per-operation approval policy, destination deduplication or an unknown-outcome contract, result limits and a concrete failure-window test. A new connector is read-only until its mutation path qualifies. Do not inherit arbitrary network access or expose a generic unchecked request method.

Preserve existing versioned connector implementations while their actions or approvals exist. Changing an approval's code, arguments or policy invalidates its old fingerprint. Test recovery across the actual proposed versions before promoting an update; do not label a same-version restart as cross-version evidence.

Never commit credentials, local databases, private conversation exports or provider responses from a user's account. New tooling and CI should remain credential-free by default. Preserve the attribution files in distributions.
