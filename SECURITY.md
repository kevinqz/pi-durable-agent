# Security

Report a vulnerability through the repository's GitHub **Security → Report a vulnerability** channel if enabled. Do not include credentials, real private transcripts or a working exploit against someone else's deployment in a public issue. If private reporting is unavailable, open a minimal issue requesting a private reporting route without sensitive details.

The current version is a development preview, with local synthetic qualification only. Local mode is deliberately unauthenticated and must stay on loopback. Hosted mode requires independently verified Cloudflare Access JWTs. No arbitrary external connector, shell access, OAuth credential import, automatic restore or agent self-update is implemented.

Generated code runs in the official DynamicWorkerExecutor with outbound networking disabled. Connector code validates arguments and requires current approval for mutations. Unknown effects are not retried automatically. See [architecture](./docs/architecture.md) for scope and [deployment](./docs/deployment.md) for remaining operational gates.
