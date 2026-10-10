# Private hosted journal interruptions

The [manifest](../../hosted-journal-interruptions-validation.json) records the exact deployed fixture, application hashes, three native root-abort points and resulting state. These text files preserve its Worker and verifier bytes; they are audit inputs, not product modules or deployment instructions.

The fixture imports the unchanged application at commit `ee8e6b48d3c3fceb2d32e9885e9eb61a1fb5b4f7`. Its private subclass deliberately wraps the **application-owned** `CheckpointDriver` callbacks. A durable, one-shot marker precedes `ctx.abort()`. No Pi, Agents or Code Mode private storage is read or rewritten. No fault endpoint is added to the application.

The imported prior probe is archived in [facet-name-clone](../facet-name-clone/README.md), which in turn retains the earlier probe's exports. This kept previously created private fixture namespaces intact. The new tests use a fresh synthetic namespace/object; they do not open the browser staging sessions.

The verifier permits at most 160 private requests and uses no AI binding. The run used 89 requests, mostly bounded status polling while Lifecycle's alarm resumed work. It inspected root-owned note rows through the application store and result-delivery records through the application state API. Only the three recorded boundaries are qualified. The native abort hooks did not record separate process activation UUIDs.

Temporary import paths are retained to preserve source hashes. Account configuration, authentication material, runtime logs and private persistence files are excluded.
