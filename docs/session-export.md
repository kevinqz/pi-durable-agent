# Export session data

[README](../README.md) · [Local backups](./local-recovery.md) · [Hosted recovery](./hosted-recovery.md)

Select **Export session data** under **Keep a copy** after conversation processing finishes. Your browser downloads `pi-durable-agent-session-<session>.json`. This works locally and in an authenticated hosted session, without stopping the application. Pending approvals and unknown outcomes remain labeled as such; exporting never approves or retries them.

The file contains private conversation and action data in plain JSON. Store it privately. It is a portable record for reading and inspection, **not an executable backup**. There is no import endpoint, and the file cannot restore Pi tasks, resume Code Mode or grant approval authority. For a restorable local copy, use the separate [stopped-state backup procedure](./local-recovery.md).

## What is included

| Part            | Coverage                                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| History         | Every retained page returned by the public OptChat history API, ordered chronologically; more than the first page shown in the UI |
| Memory          | Current view and counters, not the complete memory tree or frozen context of every request                                        |
| Requests        | Application request records, including their saved statuses and identities                                                        |
| Actions         | Public action records, code, contract, pending operation, status and recorded outcome                                             |
| Retained output | Exact latest executor-output serialization for each action where available, with UTF-8 byte length and SHA-256                    |
| Provenance      | Application version, schema, model mode, capture timestamps and an explicit coverage declaration                                  |

History uses OptChat's normalized text representation. It excludes hidden reasoning, internal Pi entries and raw non-text attachments; a placeholder may refer to content retained in a Pi entry. One entry can produce several normalized messages. The archive also excludes authentication credentials, the standalone notes database, execution journals, scheduler leases, database files and a coordinated parent/facet checkpoint. Completed-action output can contain note data, but this is not a complete destination database export.

An output's `statusAtExport` distinguishes a pause from a final outcome. If an output was retained before its reference was recorded, `recordedReferenceVerified` is `null`; its content still has a freshly calculated hash. A missing or corrupt output with an existing reference stops the export. Exports cannot recover results that were previously rejected by the application's retention limits.

## Verify the downloaded file offline

From an installed or extracted application release, run:

```sh
npm run export:verify -- /absolute/path/to/pi-durable-agent-session-example.json
```

The verifier needs only Node; it makes no network requests and does not require Git, Cloudflare login or a running server. It prints counts, version and digest without printing conversation text. A nonzero exit indicates a malformed archive, checksum mismatch or inconsistent action reference. Keep the original file if a check fails.

The envelope uses format `pi-durable-agent/session-export-v1`. Its digest covers the UTF-8 bytes of `JSON.stringify(payload)`. Per-output digests cover the exact retained `text` string. JSON whitespace outside strings may change without affecting verification; property order and payload values must remain intact. SHA-256 detects accidental changes against the recorded digest; it is **not a signature**, proof of an author's identity or proof that an untrusted archive is genuine.

## API and consistency

`POST /api/sessions/:session/exports/session` with an empty JSON object returns the archive. It uses the same verified identity, session binding and same-origin request handling as other session operations. It has no separate public download URL. The state endpoint advertises `capabilities.sessionDataExport`; the UI hides the control while an older backend is still serving that session.

The exporter checks for idle conversation processing and completed result delivery, reads all history pages and retained outputs, then compares the selected session state and transcript head again. Active work or a detected change returns **409** and no archive. This is a bounded consistency check over public APIs, not a transactional snapshot of every engine database. Another client may continue working after the capture finishes.

At most **8,000,000 bytes** and **100 history pages** are allowed. The byte budget is conservative because it also counts intermediate snapshot data. Exceeding a limit returns **413** without silently truncating or deleting data. A cursor that repeats also fails. Wait for work to settle and retry a conflict; an over-limit session needs a separately designed streaming/paginated export, not a bypass of these bounds.

## Validation scope

Five focused Workers-runtime tests cover 107 normalized messages spanning multiple pages, chronological order, unchanged session data, owner isolation, a real Code Mode pause and completed result, UTF-8 integrity, active/changing state, corrupt/missing outputs, size limits and a non-advancing cursor. The multi-page fixture uses public Pi entry commits after one real demo turn; it does not make hundreds of model calls. A separate Node test checks the offline verifier's corruption and missing-output handling. All use synthetic data and no paid models.

The [staging evidence](./session-export-validation.json) records browser downloads for an empty session, a preserved pending approval after dev.2 → dev.3, and the same action after completion. All three downloaded files passed the offline verifier. The completed archive contains eight normalized messages, one action, one retained output and one recorded result delivery. This inspects application records, not an independent count of destination database rows. Account/session identifiers and conversation contents are excluded from the public evidence.
