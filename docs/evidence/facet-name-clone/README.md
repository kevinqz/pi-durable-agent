# Hosted facet-name reproduction

These text files preserve the exact Worker and verifier bytes for the [name comparison](../../hosted-facet-name-validation.json). They are historical evidence, not application modules or an installation path.

The private Worker retained the prior probe's exports through the temporary import shown in `worker.ts.txt`. That imported source is archived in [the earlier probe](../native-facet-checkpoint/README.md). The new `CloneProbe`, `CloneFacet` and `CloneLeaf` own fresh synthetic objects. The verifier creates a new root ID per case; it does not reuse the original application fixtures.

Four cases compare simple/colon names and bare/parameterized exported classes. Each writes parent and nested KV/SQL values, syncs, clones and inspects the snapshot, changes the source, then restores a second copy. Both simple-name cases retain the old values; both colon-name cases reopen empty. This establishes the observed naming difference, without claiming a cause inside Cloudflare's implementation.

The source hashes identify the exact deployed experiment. Account configuration, credentials, private state and Wrangler logs are excluded. Use the maintained application tests for local qualification; this archive does not qualify the full hosted product.
