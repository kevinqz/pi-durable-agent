# Local backup and restore

[README](../README.md) · [Operations](./deployment.md) · [Validation](./validation.md)

Save the **complete stopped Wrangler state directory**, including Pi/OptChat data, request identities, the Code Mode facet map and every facet database. Restore into a new directory, then open the same session URL. No Pi or Cloudflare storage tables are rewritten by the backup tool.

Ordinary `restore` is for the **local demo on macOS/Linux**, with the same operating system, architecture, Node major version, runtime, configuration and locked dependencies. For the reviewed sequential preview update routes, use the separate [local upgrade workflow](./local-upgrades.md). Neither path is a Cloudflare deployment backup or an arbitrary runtime migration. Cloudflare's [local persistence option](https://developers.cloudflare.com/workers/local-development/local-data/) selects the directory through `--persist-to`. Its hosted [point-in-time recovery API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#pitr-point-in-time-recovery-api) is a different facility and is not available in local development.

## Save and reopen a local session

Keep the session URL (including its fragment after `#`). Wait for current work to settle, then stop `npm run dev` with **Ctrl+C**. A pending approval may remain pending; its expiry still uses wall-clock time.

Backup/restore requires `lsof` so the tool can refuse open files. macOS includes it; install your distribution's `lsof` package on Linux if absent.

```sh
npm run state -- backup --to .local-backups/demo
npm run state -- verify .local-backups/demo
npm run state -- restore .local-backups/demo --to .local-restores/demo
npm run dev -- --persist-to .local-restores/demo
```

Open the printed address with the **same session fragment**. Review the restored history and pending approval before continuing. The original `.wrangler/state` and the backup remain intact. Starting the restored copy resumes durable work; completed effects outside a database would not be undone by restoration. Only the local notes connector is qualified here.

For state previously started with a custom persistence directory, select it explicitly:

```sh
npm run state -- backup --state .local-restores/demo --to .local-backups/demo-next
```

Choose a new backup/restore destination each time. The commands never merge with or overwrite an existing destination. `.local-backups/` and `.local-restores/` are ignored by Git. An alternative location must also stay out of source control and shared logs.

## What is retained and checked

- The complete file set under the selected persistence directory, including SQLite WAL files, namespace metadata and Code Mode's facet files. Copying only the parent object's database is insufficient.
- A manifest with file paths, byte lengths and SHA-256 values; its own checksum; the exporting checkout's application version/revision, lockfile checksum and runtime fingerprint. Content hashes, including uncommitted runtime changes, are authoritative; the revision alone is not proof of a clean checkout or of which code originally wrote existing state.
- Exclusive coordination with `npm run dev`, plus open-file checks before/after copying and comparison of source/copy inventories. Copied files and destination directory entries are flushed before success is reported. This is an offline copy under operator control, not a general filesystem snapshot against arbitrary writers.
- Verification rejects missing, extra, changed, linked or incomplete files. Restoration requires an exact source/configuration/dependency fingerprint match and a fresh directory. A completion receipt beside the restored directory prevents the managed launcher from starting incomplete or incompatible restores. Keep that receipt with the directory.

The current ceiling is **10,000 files / 1 GiB**; exceeding it fails rather than truncating data. Backups contain private conversation/action data and are **not encrypted**. Checksums detect changes; they do not authenticate an untrusted backup. Only restore your own retained snapshots. Source code, credentials and external environment files are not included: retain the matching checkout, lockfile and required configuration separately.

The checksum command verifies file integrity. A successful application reopening is separate evidence: `npm run test:recovery` exercises a synthetic session, stopped-state copy, isolated restore, exact pending approval, original retrieval and one deduplicated note/result delivery. It retains its private temporary fixture and prints the evidence location. The proof uses a graceful shutdown; abrupt object-reset coverage remains in the runtime tests.

## If an operation stops midway

An incomplete snapshot has `snapshot.pending`; an interrupted restore has a non-complete restore receipt. Neither is accepted as a finished restore. Retain the original source and retry into a **new** destination after resolving the cause. No automatic deletion or rollback runs on failure.

The managed launcher holds a sibling directory named `.STATE.agent-lock`, with `owner.json` recording host, PID, operation and start time. Normally it releases that lease after Wrangler exits. After a crash, the tool deliberately does not steal it: inspect that exact owner, confirm that the process and its Wrangler/workerd children have stopped, and use `lsof +D /absolute/state/path` to check for open files. If ownership is uncertain, keep the lock and investigate. Once the owner is confirmed stopped, move just the stale lock directory aside for inspection and retry. Never delete the state or its restore receipt to bypass a failure.

During a backup, use the managed commands and keep all other writers stopped. Invoking Wrangler directly bypasses their coordination. A missing/unusable `lsof` is an error, not evidence that no writer exists.

Runtime reconciliation can update request timestamps after reopening. It must preserve their identities, text, task identities and terminal outcomes. Replayed Code Mode calls still require each exact approval; repeated note keys deduplicate the destination effect, not the approval decisions.

## Hosted recovery remains a separate gate

Protected demo staging is available. The new [coordinated checkpoint composition](./coordinated-recovery.md) has hosted demo-restore and bounded native interruption evidence. It restores the conversation and nested executor facets while retaining supervisor effects and consumption; real-model, second-identity and operational-release qualification remain pending. Restoring only one database can invalidate execution receipts. The [local cross-release route](./local-upgrades.md) has its own evidence; it does not qualify arbitrary hosted restores or dependency changes.
