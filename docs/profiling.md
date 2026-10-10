# Diagnose runtime cost with native profiles

[Deployment](./deployment.md) · [Architecture](./architecture.md) · [Model accounting](./models.md)

Cloudflare's [on-demand profiler](https://blog.cloudflare.com/workers-on-demand-profiling/)
fits the hosting layer of this application. It requires no agent tool, OptChat
extension or runtime instrumentation. Keep it in the operator workflow; the
agent must not receive Cloudflare administration credentials.

## Pick the question first

| Question in this application                                                   | Evidence to inspect                                                                 |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Is memory rendering, source search or export serialization expensive?          | CPU profile during that operation on the session's object                           |
| Which functions allocate heavily while building an export or checkpoint proof? | Allocation profile during that operation                                            |
| Is a slow reply waiting on inference?                                          | Request duration, model outcome and provider usage; CPU alone cannot establish this |
| Does OptChat preserve useful context or provider cache hits?                   | Source retrieval, memory-quality checks and provider token/cache accounting         |
| Did an interrupted action complete once?                                       | Destination receipt and recovery journal                                            |

A profile supplements these existing records; it cannot establish memory
quality, cache efficiency, billing totals or recovery correctness. In this
repository, `SessionSupervisor` holds root metadata and the session runs in a
facet. A profile of the outer HTTP Worker is not evidence that the relevant
session or the dynamically loaded Code Mode isolate was sampled. Record the
target, and identify actual function stacks before attributing results.

## Capture a bounded sample

The tracked configuration enables `upload_source_maps` for readable source
locations. Existing private configuration copies must add the same setting
before their next reviewed deployment. This changes uploaded debugging
artifacts, not the checkpoint runtime identity.

Following Cloudflare's [profiling documentation](https://developers.cloudflare.com/workers/observability/profiling-in-production/):

1. Choose the Worker, or the exact Durable Object namespace and instance, then
   **Observability → Flamegraph**. Select the deployed version explicitly.
2. Capture **CPU** or **Heap** for **5,000 ms** while exercising the intended
   path. Capture requires a loaded instance and current traffic; log filters
   do not select past activity. Start with read-only, synthetic operations.
3. Inspect the function table and flamegraph. Heap measures sampled
   allocations, not retained heap or OptChat's conversation-memory size.
   Export the profile when it contains relevant samples.

Operators already using the official `cf` CLI can run:

```sh
cf workers versions profile "$PROFILE_VERSION" \
  --worker-id "$PROFILE_WORKER" --duration-ms 5000 \
  --profile-type cpu > worker-cpu.pprof
```

Use the deployed version UUID: `latest` means most recently created. An exact
object capture also needs `--namespace-id` and `--actor-id`. This is a `cf`
command, not a Wrangler subcommand. Respect `Retry-After` on rate limiting.
An unavailable environment or empty sample does not demonstrate good performance.

## Keep an interpretable record

Retain the capture privately with its SHA-256, timestamp, duration, profile
type, deployed version, source commit, target and synthetic operation. Include
the observed self/total values and sample coverage. Profiles and source maps
can reveal code and infrastructure details; profile files are ignored by Git.
Publish only reviewed, sanitized findings. An unsampled function is not proof
that it consumed no resources.

Compare equivalent operations and versions before proposing an optimization.
Do not add model calls just to keep a profile busy. Changes to memory or
checkpoint algorithms still need their existing correctness checks.

This guide documents the native integration; it does not claim a captured
production profile or a measured performance improvement. See also
[source-map configuration](https://developers.cloudflare.com/workers/observability/source-maps/).
