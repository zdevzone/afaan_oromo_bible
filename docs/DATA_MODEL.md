# Data model

Status: **approved V1 logical model; physical SQL and validation types are implementation work**. This is a new application. Before public V1.0, replace development schemas directly and recreate development databases; do not build migration chains for obsolete prototypes. After V1.0, user-data changes require tested preservation and migration. See [DEVELOPMENT_GUIDELINES.md](DEVELOPMENT_GUIDELINES.md).

## Ownership and representation

`library.sqlite` contains immutable, licensed Scripture and derived search data. `user.sqlite` contains personal records. No foreign key crosses these databases: removing or replacing a content pack must never cascade into personal notes. Browser development uses the same record shapes with normalized fixture JSON and IndexedDB; see [STORAGE_STRATEGY.md](STORAGE_STRATEGY.md).

Use UTF-8 throughout. Store display text exactly as the approved source's character stream, including meaningful punctuation and spelling. A separately derived normalized search projection is never the source for display, copying, export, or Scripture quotations. UTC timestamps use an ISO 8601 representation ending in `Z`; user record IDs are UUIDs. Persisted enum values and numeric ranges are validated at both the application and native boundaries.

## Scripture identity

An address is a structured tuple:

```text
edition_id + versification_id + book_code + chapter_label + verse_label
```

- `edition_id` is an assigned immutable identifier for an exact translation/edition lineage, not its current title or UI language. `content_revision` identifies one approved source snapshot and build manifest.
- `versification_id` identifies the numbering scheme actually used. If no authoritative named scheme is established, assign an edition-specific ID and record that fact; do not claim an external standard by guesswork.
- `book_code` is a stable USFM-compatible code where applicable, with an explicit import mapping for exceptions. Display names and their Oromo/English aliases are not IDs. Canon and book order belong to the edition.
- `chapter_label` and `verse_label` are source labels, stored as strings. They are not restricted to positive integers: bridges such as `3-4` and subdivisions such as `3a` require representation.
- Within a chapter, an ordered **verse unit** represents one addressable source segment, which may cover a verse bridge. Ordering is an explicit integer, never lexicographic sorting of labels.

Identifiers are generated from canonical serialization of the tuple, or stored as the tuple itself. Do not concatenate unescaped user-visible strings and parse them later. Internal numeric SQLite row IDs are local lookup optimizations and must not appear in backups or durable user anchors.

An illustrative synthetic chapter may contain units `1`, `2-3`, `4a`, `4b`. Resolving `:2` or `:3` returns the whole `2-3` unit with its original label; resolving `:4` may return `4a` and `4b`. The importer creates and validates these explicit label-to-unit mappings. Never duplicate bridge text as invented separate verses. Ambiguous, missing, and unsupported labels produce an explicit result, not a guessed verse.

## Content tables

The following is a schema proposal, not executable SQL. Select exact column types and constraints when the Phase 1 storage spike validates it.

| Table              | Essential fields and constraints                                                                                                                                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content_manifest` | Single pack record: `format_version`, `pack_id`, `build_id`, `source_archive_sha256`, `normalized_content_sha256`, `importer_version`, `search_profile_version`, `built_at`. The distributed manifest separately records the final SQLite file checksum.                           |
| `edition`          | `id` PK; `title`, `abbreviation`, `language_tag`, `variety_label`, `publisher`, `edition_year`, `canon_id`, `versification_id`, `content_revision`, `license_id`, `license_notice`, `attribution`, `source_url`. Unknown metadata is explicit, never filled with plausible values. |
| `book`             | Composite PK `(edition_id, book_code)`; `display_order`, `display_name`, optional `short_name`, `collection_label`. Unique order within edition. Collections such as testament filters come from manifest metadata, not a hard-coded 66-book list.                                 |
| `book_alias`       | `(edition_id, locale, normalized_alias, book_code)`; review duplicate aliases and return choices when ambiguous. User-facing aliases remain available separately from normalization.                                                                                               |
| `chapter`          | Composite PK `(edition_id, book_code, chapter_label)`; `display_order`, `content_json`, `content_digest`. The chapter AST is the canonical renderable representation.                                                                                                              |
| `verse_unit`       | `unit_key` PK; parent chapter key, `source_verse_label`, `display_order`, derived `text_plain`, `text_digest`. Unique source label and order within chapter unless a documented source-specific rule is approved.                                                                  |
| `reference_lookup` | Parent chapter key, requested source label, target `unit_key`, target order, mapping kind (`exact`, `bridge_member`, `subdivision_group`, `documented_alternate`). One label may map to multiple ordered units.                                                                    |
| `source_reference` | `id`, containing chapter/unit, source marker kind, original displayed reference text, optional structured target(s), resolution status. Preserve unresolved references as text.                                                                                                    |
| `verse_search`     | Derived FTS5 table keyed to verse-unit row ID with normalized body text. Source text, headings, notes and reference fields remain distinct; V1 body search excludes publisher footnotes/headings by default.                                                                       |

Indexes cover chapter lookup/order, units by chapter/order, reference lookup by complete address, and aliases by edition/locale/normalized alias. Enable SQLite foreign keys on every connection. Validate all constraints before building the immutable artifact. No runtime repair of Scripture is allowed.

### Structured content

Use a versioned, discriminated JSON AST with a closed allowlist of node kinds. It represents:

- Paragraphs, section headings, book introductions where supplied, and poetry lines with their source indentation/level.
- Verse-start milestones referencing `unit_key`; paragraph boundaries need not coincide with verse boundaries.
- Exact text runs and supported inline styles such as source emphasis or words-of-Jesus markers, only if present and authorized.
- Footnote and cross-reference callouts in reading order, with their separately typed bodies, source callers and reference targets.
- Documented alternate verse/chapter labels, distinct from the main numbering.

Footnote text is not concatenated into Scripture body text. Headings have positions and source provenance rather than fake verse numbers. The AST owns the authoritative imported text; `verse_unit.text_plain` is a reproducible projection for selection/copy and search input. Track extraction context so a verse spanning paragraphs copies every text segment in order. Test the AST renderer and plain-text projector against the source together.

Never persist executable HTML or arbitrary React component names from an import. Unknown markers or unsupported nesting stop production import with a report; they must not disappear silently. Retain original USFM bytes privately as provenance under the applicable license, not as an alternative runtime data model.

## Edition-aware personal anchors

An anchor stores:

```text
id
edition_id, versification_id, content_revision
start: { book_code, chapter_label, verse_label }
end:   { book_code, chapter_label, verse_label }
unit_keys[]                 # original ordered whole-unit selection
selected_text_digests[]      # integrity context, not Scripture text
display_reference_snapshot  # convenience label; never a lookup key
created_at
```

V1 selections and anchors stay within one chapter. This deliberate limit keeps copy, highlighting and note-linking predictable; later cross-chapter support can extend the same address model. A note has zero or one anchor in V1. Empty selections and reverse ranges are rejected. A bridged unit is selected as a whole.

Resolve an anchor when opening its record:

1. Match edition and versification, then exact labels and ordered unit keys. A matching revision and digests is `resolved`.
2. On a new content revision, if all addresses and text digests match, resolve while preserving original provenance. If wording, segmentation or order differs, return `content_changed` or `ambiguous` and show the current passage with a review notice. Do not silently rewrite the stored anchor.
3. If edition, scheme or address is absent, return `unavailable`; keep the personal record fully readable and exportable.
4. Reassignment after review is an explicit user edit. Never substitute another translation, array position, nearest verse, or machine-generated alignment.

`resolved`, `content_changed`, `ambiguous`, and `unavailable` are computed states, not permanent destructive transformations. Same-number references in another edition are not verified equivalents. Future parallel reading requires a separate reviewed mapping dataset.

## Personal tables

| Table              | Fields and behavior                                                                                                                                                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_metadata`    | `schema_version`, database ID, creation time. Before V1 reset obsolete development schemas; after V1 migrations manage this version.                                                                                                                                                                                        |
| `note`             | `id`, nullable `anchor_id`, `title`, `body_text`, `created_at`, `updated_at`, integer `revision`. Plain text only in V1; standalone means `anchor_id` is null. No rich-text document schema until rich text is approved.                                                                                                    |
| `anchor`           | Fields above; `unit_keys` and digests as validated JSON if practical. No content-database FK.                                                                                                                                                                                                                               |
| `bookmark`         | `id`, `anchor_id`, optional `label`, `created_at`, `updated_at`. Exactly one anchor. V1 prevent duplicate bookmark ranges after canonical selection resolution.                                                                                                                                                             |
| `highlight`        | `id`, `anchor_id`, `color_token`, `created_at`, `updated_at`. Palette tokens, not arbitrary CSS. Its anchor covers exactly one whole verse unit. A multi-unit selection writes a transaction of per-unit highlights; one active color per edition/scheme/unit, so recoloring is an upsert, not overlapping range splitting. |
| `preference`       | Stable `key`, versioned/validated JSON value, `updated_at`. Known-key registry; reject unexpected types. Defaults apply to missing keys.                                                                                                                                                                                    |
| `reading_position` | `edition_id` PK, `anchor_id`, optional viewport offset hint, `updated_at`. Persist a verse address; pixel offset is a best-effort hint valid only for a compatible layout.                                                                                                                                                  |

Recommended preference keys: `ui.locale`, `reader.activeEditionId`, `appearance.theme` (`light`, `dark`, `system`; default `system`), `reader.fontSizePx` (16–32 inclusive; default 20), `reader.lineHeight` (1.4, 1.65 or 1.9; default 1.65), and `reader.width` (`comfortable` or `wide`; default `comfortable`). UI locale never changes the selected Bible edition. Font and layout values use bounded design tokens/ranges, not arbitrary injected styles. The font-size control does not suppress OS/browser zoom.

Initial input limits: a note title or bookmark label is at most 256 Unicode code points; a note body is at most 1 MiB of UTF-8. Creating a new stored note requires a nonblank title or body; an existing note may be deliberately emptied and retained until explicitly deleted. A blank unsaved editor is permissible. Each serialized unit key is bounded to 4096 UTF-16 code units and must encode the anchor's edition/scheme/address. An anchor's unit list cannot exceed the addressed chapter's actual units. These are documented implementation limits, not Scripture corpus assumptions. Reject oversize edits/imports visibly while preserving unsaved input; do not truncate. [STORAGE_STRATEGY.md](STORAGE_STRATEGY.md) owns aggregate backup limits.

Use optimistic revision checks on note updates: a stale save must not silently overwrite a newer edit. A successful write increments `revision` and returns the committed record. A conflict preserves the unsaved editor buffer and offers a deliberate reload/retry path. One app window in V1 reduces concurrent editing, but asynchronous autosave still needs ordering.

No synchronization tombstones, account IDs, sermon metadata, vector embeddings, generic entity framework, or event log are required for V1. Permanent deletion requires a clear destructive action; deleting a note never deletes Scripture. Deletion of now-unused anchors occurs within the same user transaction.

## Validation and completion criteria

- A chapter containing headings, poetry, a bridge, subverses, footnotes and unresolved cross-references round-trips through import/render/copy without loss or fabricated verse labels.
- Canon-specific books and missing verse labels resolve from edition metadata; no universal verse-count assumptions are embedded in services.
- Search normalization cannot alter stored display text. Checksums and source provenance are visible through the edition information view.
- Notes, bookmarks, highlights, preferences and reading positions survive restart and a backup restore. Unknown/missing content does not prevent recovering notes.
- Every range is validated against the selected edition; edition changes cannot move existing annotations automatically.
- A changed revision exercises all anchor resolution states. User-data-only foreign keys, transaction boundaries, uniqueness, and note revision conflict behavior have tests.

Related decisions: [SCRIPTURE_PIPELINE.md](SCRIPTURE_PIPELINE.md), [FEATURE_SPECIFICATIONS.md](FEATURE_SPECIFICATIONS.md), [CONTENT_LICENSING.md](CONTENT_LICENSING.md).
