# Storage strategy

Status: **approved V1 architecture**. Use one React application with small asynchronous storage ports. Desktop uses narrow Rust commands backed by `rusqlite` and bundled SQLite with verified FTS5 support. Browser development uses normalized JSON fixtures and native IndexedDB. No backend, ORM, generic SQL IPC, SQLite WASM runtime, or second SQL plugin is needed.

## Why SQLite plus JSON

| Option                                                                   | Assessment                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime JSON only                                                        | Convenient for small fixtures, but full-corpus search, repeated parsing and transactional user writes require extra work. Not the desktop runtime choice.                                           |
| SQLite only everywhere                                                   | Excellent desktop fit, but forces a browser SQLite/WASM or native dependency into ordinary component development. Unnecessary for the initial workflow.                                             |
| **Normalized JSON build format; SQLite desktop; JSON/IndexedDB browser** | Chosen. Keeps import inspectable, supports fast browser iteration, and gives desktop indexed search and durable transactions. Conformance tests constrain the small intentional adapter difference. |

Do not duplicate business logic in two applications. Reference rules, selection, validation, copy formatting and save-state behavior live above the storage boundary. Adapter-specific query/index/transaction details stay below it. The initial fixture is small and intentionally synthetic; browser benchmarks are not evidence of full-corpus desktop performance.

## Small port surface

Contracts are owned by [ARCHITECTURE.md](ARCHITECTURE.md); names below describe the required operations, not a mandate for a framework.

- Scripture: list editions/books/chapters; load one structured chapter; resolve an address; run bounded, paged search; read attribution/manifest.
- Personal records: list/get/save/delete notes; manage note links, bookmarks and highlights; get/set preferences and reading position.
- Recovery: produce a consistent backup snapshot, validate an imported backup, and replace user records atomically after confirmation.
- Platform services: clipboard and native open/save dialogs where required. A browser adapter uses browser APIs with explicit permission/failure handling.

A composition root selects exactly one adapter set. Browser preview enables fixture adapters explicitly in development; production desktop startup requires a real native bridge and approved content. Never catch a desktop persistence error and silently fall back to IndexedDB or in-memory state. Save failures must remain visible.

Commands accept typed domain requests, not SQL strings, file paths or renderer-chosen database names. Rust validates request lengths, IDs, range invariants, enum values and database permissions independently. Use parameterized queries; construct any FTS expression through a bounded query compiler. Use the error vocabulary owned by [ARCHITECTURE.md](ARCHITECTURE.md), with actionable user messages and sanitized diagnostic context; validation, missing references, revision conflicts, disk-full and unsupported backup formats must remain distinguishable.

## Desktop files and connections

Resolve Tauri's per-user application data directory through its supported path APIs. Do not hard-code OS paths, write in the installation directory or use the frontend's current working directory.

```text
<packaged resources>/content/library.sqlite      immutable approved content
<packaged resources>/content/manifest.json       checksums and attribution metadata
<app data>/user.sqlite                          all personal records
<app data>/recovery/pre-restore-<id>.json         user-only recovery snapshots
<user-chosen location>/<backup>.json             portable user backup
```

The path layout is conceptual until packaging tests resolve platform resource handling. If a bundled resource cannot be opened directly as a filesystem SQLite file, copy it into a checksum-named app-data content directory, verify it, then open it read-only. Treat it as replaceable derived content and keep it separate from `user.sqlite`. Do not blindly copy it over on every launch.

Use `rusqlite`'s bundled SQLite feature, pin it in `Cargo.lock`, and verify `ENABLE_FTS5` and a real FTS query in the native spike. Do not assume the system SQLite on macOS/Windows has identical features. Open the library connection with SQLite read-only flags; optionally add `query_only` as defense in depth. An immutable URI optimization is permitted only if the artifact truly cannot change while that connection is open. Handle edition replacement by closing and reopening a validated artifact.

Open the mutable user connection separately. Enable foreign keys, a bounded busy timeout and WAL mode on the local user database; prefer `synchronous=FULL` for note durability and measure the cost. An approved change to this durability choice needs a failure/recovery assessment. Keep transactions short. A serialized native database worker owns the connections, or use another equally small serialized design; do not block the async runtime with long synchronous SQLite work. Do not introduce a connection pool without evidence.

Each logical operation has one user transaction: note plus its optional anchor, a batch of per-unit highlight upserts/removals, preference batches, deletion plus orphan-anchor cleanup, or full restore. A commit is the save boundary. The UI says **Saved** only after commit succeeds. Notes autosave after 300 ms of inactivity; explicit Save flushes immediately and navigation awaits the flush. Ordered requests and note revision checks prevent late writes from replacing newer content; failures preserve the editable buffer and expose retry/export. Retry never silently overwrites a newer revision.

Reading-position writes are debounced and flushed on chapter changes where feasible. Do not depend on application-close callbacks for essential note writes. Test forced termination during committed and uncommitted writes. A corrupt user database is never automatically deleted: retain the original, offer diagnostics/recovery and explain backup restore options. Before V1 a deliberate developer reset is allowed; it is not a production corruption-repair policy.

## Browser development adapter

Load small normalized chapter fixtures lazily. Seed IndexedDB with a development database name separate from all desktop paths. Object stores mirror personal records; use a single read/write transaction across affected stores for logical writes and restore. Commit completion, not merely a successful individual request, controls the save indicator.

IndexedDB schema changes may require an integer `version` and `onupgradeneeded`; pre-V1 use that technical mechanism only to create/reset the **current** development stores. Do not accumulate historical compatibility transformations. Provide an explicit developer reset command. Browser clearing/private mode/quota eviction can remove data, so label browser storage as development-only and offer export. Do not claim it provides desktop durability.

Run shared contract scenarios against both adapters: ordering, missing references, note conflicts, highlight overlaps, backup round trips and search query semantics. Native integration tests remain required for FTS5, permissions, files and crash behavior. Use the actual Tauri environment at Phase 1, not after all React features are finished.

## Portable backup format

V1 backup is versioned UTF-8 JSON of **personal data only**, not copied Scripture, indexes, secrets, machine paths or application binaries. It contains:

```text
format: "afaan-oromo-bible-user-backup"
format_version: 1
app_version, created_at, source_database_id
required_editions: [{ edition_id, versification_id, content_revision }]
data: {
  notes[], anchors[], bookmarks[], highlights[],
  preferences[], reading_positions[]
}
```

Preserve IDs, timestamps, note revisions and original anchor provenance. A content revision/hash is metadata, not a Scripture payload. `required_editions` supports warnings when the restored device lacks an edition; missing content does not make personal notes unrecoverable. Unknown editions remain unresolved anchors. Backups are unencrypted plaintext in V1; explain this clearly before saving a file so users can choose an appropriate location. Do not include private note contents in logs.

Initial portable-file limits: 50 MiB encoded UTF-8 and 100,000 aggregate records across the arrays. Individual title/label/body and anchor bounds are in [DATA_MODEL.md](DATA_MODEL.md). Enforce encoded size before parse and structural limits during validation; avoid unbounded recursion and excessively deep unknown JSON values. Validate the same limits before export and show a useful limit error rather than writing an unrestorable backup. These bounds are provisional until representative data tests; raise them deliberately in the current contract if normal user data requires it. Do not silently omit records.

### Export

1. Flush pending editor saves, and stop if any cannot be committed unless the user explicitly chooses a separately labeled emergency draft export.
2. Read all exported records in one consistent database transaction, so notes and links belong to the same snapshot. Serialize and validate against the published backup schema.
3. Write through a narrow native save operation to a temporary file in the selected directory, then complete the platform-safe replacement/rename and report success only after it succeeds. Confirm overwrite through the dialog. Handle cancellation, disk-full and permission errors.
4. Keep content and user database connections separate. Never copy an active `user.sqlite` file without its WAL or call that a portable backup.

### Restore: replace only

Merging is excluded from V1. The UI states the counts/date of the imported backup and current data, and that all current notes, annotations, preferences and reading positions will be replaced. The destructive replacement needs explicit user confirmation. Reading and examining a backup do not.

1. Read with a documented size limit. Parse/validate before mutating: exact supported format/version, record/field bounds, UUIDs, timestamps, enum values, unique IDs, referential consistency, chapter-local range shape and known preference types. Reject unsupported rich-text/unknown structural records. Missing installed editions are warnings, not validation failure. Do not execute imported HTML or resolve file paths from JSON.
2. Show a validated preview: backup date, current/imported counts, missing-edition warnings and the full replacement warning. Wait for the user's explicit destructive-restore confirmation. Cancellation ends the workflow without mutation.
3. Quiesce autosaves and all user writes, drain in-flight operations, flush current buffers, and snapshot the current user records consistently. Save this validated **pre-restore recovery** JSON to app-data recovery storage with a completed durable file write. If flush/snapshot fails, abort restore without changing data. Do not offer a dangerous bypass as the normal path.
4. Begin one write transaction. Clear and insert the validated personal records in dependency order, check constraints, and commit. Any error rolls the entire replacement back. Do not delete `user.sqlite` or swap an open WAL database file. Keeping the same database file makes replacement atomic at the record level.
5. On successful commit, invalidate cached personal state and pending stale editor responses, reload settings/reading position, resume writes and show the recovery snapshot location. On failure retain the original records, preserve the editor state, resume safely and report the error.
6. Retain the most recent successful pre-restore snapshot; apply any documented retention cleanup only after a newer successful snapshot/restore exists. Never delete the only recovery snapshot before a replacement completes. Offer its restoration through the same validated restore flow.

Browser restore follows the same validation/confirmation contract using a single IndexedDB transaction. Save a pre-restore recovery record in a separate store/transaction and offer it for download before replacement; state that browser eviction can remove it. Full filesystem recovery guarantees belong to desktop verification.

Forward-compatible acceptance is not promised. Before V1 obsolete development backup formats may be rejected with a clear explanation; do not implement development-version shims. Freeze/document the first production format at V1.0. Later format changes require migration/conversion tests that preserve the user's records.

## Operational acceptance

- Network-disabled read/search/note/restart works on supported Windows/macOS targets with a read-only content artifact and writable user data.
- Restart after a successful save preserves the record; forced termination cannot leave half a note/link or half a restore. Save failure never becomes a success indicator.
- Export→restore into a clean profile reproduces all user records, selections, settings and unresolved anchors. No bundled Scripture corpus/projection is embedded in backup payloads; user-authored note text remains intact, including any quotations the user typed.
- Malformed, oversized, unsupported and inconsistent backups are rejected without writes. Restore cancellation, snapshot failure, transaction failure, missing editions and post-restore reload are tested.
- Browser and desktop meet the same observable port contract, with their durability differences documented. Public desktop builds cannot select fixture storage.
- SQLite, WAL/sidecar placement, resource copying, file dialogs and backup replacement are tested on actual target operating systems; a Linux/browser run is insufficient release evidence.

See [DATA_MODEL.md](DATA_MODEL.md) for records, [TESTING_STRATEGY.md](TESTING_STRATEGY.md) for test ownership, and [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md) for the V1 compatibility transition.
