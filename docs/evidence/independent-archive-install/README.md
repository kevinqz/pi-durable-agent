# Independent candidate installation

`smoke.mjs.txt` preserves the exact verifier for [the installation record](../../independent-archive-install-validation.json). It used an archive of commit `b1cd5412037aecb812b0e8bc7c27a53eff2ea8e0`, without Git metadata or copied dependencies. A fresh `npm ci --offline --no-audit --no-fund` installed 353 packages from the existing local cache before this verifier ran.

The public launcher started on loopback with isolated state; one demo conversation completed and a native checkpoint passed its integrity comparison. The script stopped the launcher afterward. Temporary paths are retained for source-hash verification. This is a development candidate, not a published release or a cold-cache network installation test.
