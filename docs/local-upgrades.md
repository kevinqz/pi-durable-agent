# Update a local installation

[README](../README.md) · [Backups](./local-recovery.md) · [Operations](./deployment.md) · [Validation](./validation.md)

The current supported local route is **0.1.0 → 0.1.1**. Earlier routes remain retained: dev.0 → dev.1 → dev.2 → dev.3 → dev.4 → 0.1.0. Use each target release's included guide, including the [0.1.0 guide](https://github.com/kevinqz/pi-durable-agent/blob/v0.1.0/docs/local-upgrades.md) for dev.4 → 0.1.0, before following this one. There is no direct route that skips an intermediate release. The route preserves conversations, OptChat memory, request identities, completed actions and pending approvals. The new application opens a **separate copy** of the complete stopped Wrangler state. It does not rewrite Pi, OptChat or Code Mode tables or run the old and new app against one directory.

## Keep the old installation and its state

Stop the old local server with **Ctrl+C**, and retain its source directory and session URL. Install the new release in a different directory:

Install the exact tagged version or [named release archive](./installation.md), retaining its included guide. The unpublished dev.5 candidates remain historical validation inputs; they are not an extra published release you must install. The route below starts from published 0.1.0.

```sh
git clone --branch v0.1.1 https://github.com/kevinqz/pi-durable-agent.git pi-agent-new
cd pi-agent-new
npm ci
```

An [extracted release source archive](./installation.md) works too; the state commands do not require Git. Run the following commands **from the new installation**. Replace the old installation path with its actual absolute path:

```sh
PI_AGENT_OLD_RELEASE=/absolute/path/to/pi-durable-agent-0.1.0

npm run state -- backup \
  --state "$PI_AGENT_OLD_RELEASE/.wrangler/state" \
  --runtime "$PI_AGENT_OLD_RELEASE" \
  --to .local-backups/before-0.1.1

npm run state -- upgrade .local-backups/before-0.1.1 \
  --from "$PI_AGENT_OLD_RELEASE" \
  --to .local-restores/0.1.1

npm run dev -- --persist-to .local-restores/0.1.1
```

If the old installation used a custom `--persist-to`, select that exact directory for `--state`. Open the new local address with the **same session fragment after `#`**. Confirm the history and any pending approval before continuing. The original state and backup remain intact. Do not restart the old copy while using the new one: two independent histories can diverge and external effects are not rolled back.

`--runtime` identifies the retained source/configuration that wrote the stopped state. Use the target release’s backup tool so the snapshot includes the reviewed runtime identity. A fingerprint describes those files; it is not independent proof of the historical writer. Only use your own state and the matching retained release. If that provenance is uncertain, preserve it and investigate rather than guessing a version.

## What makes a route compatible

[The reviewed catalog](../compatibility/local-upgrades.json) records both versions and exact hashes of application source, configuration and locked dependencies. A matching version label alone is insufficient. Both runtimes must use the same local operating system, architecture and Node major version; `lsof` and the other [backup constraints](./local-recovery.md) still apply.

- Ordinary `restore` still requires the same runtime. A changed runtime needs the explicit `upgrade` command.
- An absent route, changed source/configuration/dependency, wrong source release, corrupt snapshot or existing destination is refused. There is no force flag.
- The successful restore receipt records the selected route and both runtime identities. The managed launcher checks the target fingerprint on later starts.
- The 0.1.1 target updates OptChat 0.4.0 → 0.4.1 and consumes its public request-status projection. Pi, Agents, Code Mode, storage schemas and versioned note connectors stay unchanged. The fixture runs each release with its own locked dependencies. This exact demo-mode route does not qualify arbitrary dependency changes, a changed provider configuration or restoration of a checkpoint made under the old backend. Old checkpoint records remain retained but incompatible; create a new checkpoint after updating and checking the active session.
- New action jobs persist their contract; jobs from the first preview remain pinned to V1. Unknown contracts are retained for reconciliation without opening them through a different connector.
- Approval expiry still advances with wall-clock time. An update does not renew authorization or turn an unknown outcome into permission to retry.

The catalog belongs to the reviewed release; editing it is not a migration. Changed dependency graphs, storage schemas and connector semantics need a new reviewed route and their own old/new runtime evidence. No downgrade or automatic self-update is advertised.

## Reproduce the check without a cloud account

```sh
npm run test:upgrade
```

The runner extracts the exact published baseline commit from local Git history and exercises the old and new applications sequentially. When the locked dependency graphs differ, it runs `npm ci` in the isolated baseline directory; only an identical graph may share the target's installed dependencies. It does not download baseline source, call a paid model or deploy. Dependency installation uses the registry normally; set `npm_config_offline=true` after caching both releases' packages to require a fully local run. A missing cache entry fails without a download fallback. For a shallow/source-archive installation, supply an extracted baseline:

```sh
npm run test:upgrade -- --from /absolute/path/to/pi-durable-agent-0.1.0
```

Only release inputs are copied into a temporary fixture; its credentials and user state are excluded. The fixture checks original retrieval, memory/history/request identity, a completed action, the same pending approval, separate decisions for duplicate tool occurrences, one destination note, one delivery receipt per action and continued conversation after another restart. The checkpoint-session fixture additionally retains its history, memory, model/usage, pending root-owned note approval and original retrieval; rejects restoration of the preserved old-build checkpoint; and creates a compatible new checkpoint. Another restart keeps a single action-result receipt and accepts a new turn. Private fixture data and the evidence file remain in the printed temporary directory.

This is a **graceful local update** with the exact pinned runtime matrix, not evidence of a hosted redeploy, arbitrary dependency upgrade, abrupt machine failure or coordinated Cloudflare restore. Those deployment gates remain separate. The [hosted dev.1 → dev.2 check](./hosted-recovery.md) has its own evidence; it does not use or qualify this local file-copy mechanism.
