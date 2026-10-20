# Scripture content pipeline

Status: **approved process; exact first edition, parser and corpus remain verification gates**. The brief names candidate editions; it grants no verified distribution rights for a selected text. Do not download arbitrary web text or synthesize Scripture to unblock development. Use clearly labeled synthetic fixtures until an authorized source/sample is recorded in [CONTENT_LICENSING.md](CONTENT_LICENSING.md).

## Deliverable and ownership

The pipeline produces a reproducible, immutable `library.sqlite`, a machine-readable manifest, a content-integrity report, and the exact required license/attribution files. SQLite is the desktop runtime artifact. Versioned normalized JSON is the intermediate/test format and supplies small browser fixtures; the application does not carry two complete independently maintained corpora.

Keep original archives, rights evidence and importer logs outside publicly accessible source paths unless their redistribution is expressly allowed. Commit importer code, schemas, synthetic edge-case fixtures and checksum manifests. Large authorized content artifacts can be release inputs rather than source-controlled binaries. Never commit private correspondence, account credentials or licensed component source accidentally.

The content owner approves the edition, intended audience/variety, canon, notices and representative passages. Engineering approves parser coverage and deterministic builds. Both approvals are required before a production content pack can be marked distributable.

## Ordered build stages

1. **Register and acquire.** Record exact title, publisher, year/revision, language tag, variety, source URL, archive checksum, acquisition date, applicable license/evidence, expected book list and known numbering scheme. Download from the rights holder or authorized distributor. Preserve original bytes and filenames; unpack with path traversal, file-count and size limits.
2. **Inspect source.** Detect declared encoding, USFM version and all marker/nesting patterns. Prefer supported UTF-8 source. Reject invalid encoding; do not silently replace characters. Compare actual books with the source's edition manifest. Document alternate labels, omissions and known publisher errata.
3. **Parse into a source AST.** Use a verified structured USFM parser. Capture marker types, source locations, text, notes, paragraph/poetry structure and chapter/verse milestones. Collect parser diagnostics; unexpected errors stop the build.
4. **Normalize structure, not wording.** Map parser nodes to the versioned chapter AST in [DATA_MODEL.md](DATA_MODEL.md). Preserve original text/code points. Document any semantic whitespace reconstruction required by USFM; retain source offset/provenance for comparison. Do not apply search normalization or editorial corrections to display text.
5. **Validate addresses and structure.** Build edition-scoped books, chapter order, units and label lookups. Validate uniqueness, ordering, valid ranges, bridge/subverse membership and note/reference associations. Unresolved external cross-references are reported and retained as source text; unparseable Scripture identity is a hard failure.
6. **Project and index.** Derive exact plain body text, copy projection and normalized search text from the AST. Build SQLite tables and FTS5 in a temporary output file. Index body text only for V1's default search, with heading/note content kept distinct.
7. **Audit equivalence.** Run automated text/structure comparisons and human sample review below. Validate database foreign keys, integrity and required FTS5 features. Produce a report covering all books and every source marker kind.
8. **Seal and package.** Close/checkpoint all build connections so no WAL/sidecar is required. Hash the completed SQLite file, emit its external manifest, include the notices, and mark distribution approval explicitly. Package only an approved pack; runtime reads it with a read-only connection.

Build into a new directory. A failed import must never overwrite an approved content artifact or user database. The manifest records tool versions, normalization profile, source hashes and content revision. Sort deterministic outputs and omit volatile values from content digests; identical inputs/tools must produce identical normalized-content hashes. Byte-identical SQLite output is desirable but not the integrity contract if SQLite build metadata differs.

## Parser decision spike

**Proposed evaluation candidates, not selected dependencies:** the structured parser packages in the [Bridgeconn USFM Grammar project](https://github.com/Bridgeconn/usfm-grammar) and the [unfoldingWord USFM JS project](https://github.com/unfoldingWord/usfm-js). Verify current repository ownership, maintained releases, package identity, license, USFM support and actual exported APIs before adding either. A build-time Python parser is acceptable only if its coverage materially wins and the extra toolchain is documented; TypeScript/JavaScript is preferable for a simple reproducible workflow when coverage is equivalent.

The spike must parse the actual authorized source plus fixtures for nested notes, character markers, poetry, headings, bridges, subdivisions, alternate numbering, Unicode and malformed input. Verify that the parser exposes unknown markers and source text rather than quietly dropping them. Produce the marker coverage matrix, a parser choice and pinned version/lockfile. If no candidate meets the preservation contract, reduce the admitted source profile or fix upstream with reviewed changes; do not replace USFM parsing with regular expressions.

Regex/string processing is acceptable for a small already-parsed reference grammar or marker inventory, never for parsing the full USFM language. Unknown markers or unsupported nesting are a production import error. A deliberately unsupported non-Scripture metadata marker may be admitted only through an explicit reviewed rule that retains its original data and reports the treatment.

## Source equivalence and approval

Raw archive checksums prove provenance, not correct import. Verification must also establish:

- Every source Scripture text run is represented exactly once and in source order; no verse or paragraph disappears. Parser-specific newline/whitespace interpretation is documented and tested against USFM semantics.
- Flattened body text from source parsing and from the normalized AST agrees under the narrowly documented structural-whitespace policy. No case, apostrophe, spelling, diacritic or punctuation normalization is permitted for this comparison.
- Verse labels, headings, poetry levels, note callers/bodies and cross-reference display strings agree with source inventories. Separate counts are reported; a single global character count is insufficient.
- All expected books/chapters are present relative to this edition's source manifest. Apparent missing verse numbers and bridge counts are reviewed; never repair them using another translation's verse count.
- Human review compares authorized publisher presentation and the app for representative prose, poetry, long chapters, footnotes, bridge/subverse cases and difficult Oromo typography. Fluent intended readers review language/variety suitability.

Record discrepancies by source location, expected/actual content and disposition. Publisher source errors require a corrected authorized source or explicitly documented approved treatment; do not silently edit Scripture locally. Keep source and importer revision changes distinguishable in the report.

## Search projection and query contract

The source text stays unchanged. The **proposed** derived search profile is Unicode NFC plus versioned Unicode case folding, implemented identically for indexing and queries. Verify a practical implementation in JavaScript and Rust; if cross-runtime Unicode versions differ, ship a common tested mapping/table or use a deliberately specified narrower fold. Do not claim `toLowerCase()` or SQLite `NOCASE` provides full Unicode case folding. Reapply NFC after folding if required by the chosen profile.

The Phase 1 synthetic corpus uses the explicitly narrower `fixture-latin-v1`: NFC; fold ASCII A–Z, Latin-1 uppercase U+00C0–U+00D6/U+00D8–U+00DE and U+0178; map U+2019 to ASCII apostrophe; NFC again. Tokenize letters/marks/numbers with apostrophes only inside tokens and join tokens with spaces. U+02BC remains distinct. This is a development profile, not a claim of full Unicode folding or fluent Oromo approval. Replace it directly with the verified production profile before a real corpus is indexed; do not maintain compatibility with obsolete development indexes.

Oromo doubled vowels/consonants carry meaning and must remain doubled. Preserve diacritics and meaningful internal apostrophes. Do not strip accents, collapse repeated letters, use English stemming, or silently machine-translate queries. The provisional apostrophe policy maps only reviewed typographic equivalents, for example U+2019 and U+0027, in the search projection while retaining the apostrophe as an internal token character. Whether U+02BC or other marks are equivalent needs fluent review. Publish a reviewed query/expected-result corpus before freezing the profile; source/display text is unaffected by the outcome.

Use a separate reference parser backed by per-edition book aliases. It returns resolved, invalid, missing or ambiguous results; it does not become a full-text query. Display choices when an alias could mean more than one book. Chapter/verse validation uses source label lookups, including bridges.

V1 text search has a small explicit grammar: whitespace-separated whole tokens use AND; a double-quoted phrase requires adjacent normalized tokens; an explicit trailing `*` requests token-prefix matching with at least two normalized code points before the star. Prefix syntax is for an unquoted term, not inside a quoted phrase; reject other star positions. Search stays in the active edition with an optional book restriction. Canon-group/testament filtering is optional and only available when the source supplies that metadata. No fuzzy matching, raw FTS operators, stemming or cross-verse phrase matching in V1. Query UI makes phrase/prefix syntax visible. Bound input to 256 Unicode code points and 20 terms; count each quoted phrase as one grammar term while also bounding the normalized token total to 20. Use pages of at most 50 results. Use bound SQL parameters **and** compile tokens to escaped FTS expressions; parameter binding alone does not neutralize FTS query syntax.

Desktop FTS5 uses its `ascii` tokenizer with apostrophe configured as a token character **over the already normalized, pretokenized, space-joined projection**. Do not feed original body text directly to this index. All Unicode folding, diacritic preservation, punctuation boundaries and internal-apostrophe decisions occur in the shared projection first; FTS5 then treats each emitted non-ASCII byte sequence as an exact token. This avoids `unicode61` applying additional case folding/Unicode classification that differs from the browser profile. For example, `unicode61` equates `Ā` and `ā` even though `fixture-latin-v1` deliberately does not fold that range. A host-SQLite prototype validates the chosen SQL syntax; the bundled native SQLite still needs its own executable conformance test.

Preserve apostrophes inside words; boundary quotation marks remain punctuation. The shared projection removes boundary punctuation before FTS input, consistently for index/query, with source-offset mapping retained when snippets need emphasis. Verify exact token sequences against the acceptance corpus; JavaScript and Rust Unicode regex tables can also differ. Browser development implements the same admitted grammar and tokens over small fixture data, in deterministic edition/book/chapter/unit order. Do not rely on `Intl.Segmenter` to match another implementation by accident. If parity fails, adjust the bounded profile or implement explicit shared token-boundary logic before shipping.

Return body-text snippets and complete edition-aware addresses. Highlight matching spans using source-text offsets from a projection map, or avoid character-level emphasis when mapping is uncertain. Never show normalized search text as a Scripture quote. Limit results with an explicit next-page cursor; order by canonical content order for V1 so both adapters have predictable results. A future relevance algorithm needs separate acceptance tests.

Initial conformance vectors below are **synthetic strings, not Scripture**. Encode the composed/decomposed and apostrophe cases as explicit code points in tests. The expected canonical equivalence, doubling, accent and prefix behaviors are required. Apostrophe equivalence rows are proposed until fluent review accepts the mapping table; record the final reviewed table and profile version here before the full index is frozen.

| Stored display/input | Query | Expected |
| --- | --- | --- |
| `WAaqaa` | `waaqaa` | Match after default, locale-independent case folding. Display remains `WAaqaa`. |
| `cafe` + U+0301 | `CAFÉ` | Match after NFC/case fold; composed/decomposed forms agree. |
| `café` | `cafe` | No whole-token match; no accent removal. |
| `aa` | `a` | No whole-token match; doubled letters are not collapsed. |
| `bba` | `ba` | No whole-token match; doubled consonants are preserved. |
| `ga` + U+2019 + `ee` | `ga'ee` | Proposed match with reviewed U+2019 → U+0027 search-only mapping. |
| `ga` + U+02BC + `ee` | `ga'ee` | No assumed equivalence; reviewer must decide and document. |
| `aa, bb` in one unit | `"aa bb"` | Match adjacent normalized tokens; comma does not add a token. |
| `aa` in one unit, `bb` in the next | `"aa bb"` | No match; phrases do not span verse units. |
| `waaqaa` | `waa*` | Match explicit prefix. `w*` is a query error. |
| `"aa` or `aa**` | same malformed input | Query error, no FTS parser exposure. |

Include negative apostrophe cases: removing an internal apostrophe must not become the same token, and boundary quotation marks must not prevent finding the enclosed word. Extend this mechanical suite with real authorized Oromo text/query cases selected by fluent reviewers, without publishing restricted source excerpts in fixtures.

## Revision and edition lifecycle

V1 bundles one approved edition. A revision is rebuilt offline from recorded source and replaces the content artifact through the application/release process; do not expose an arbitrary SQL or untrusted content-pack importer to end users. Before replacement, compare address inventories and produce an anchor-impact report. The existing immutable artifact remains available until the replacement passes validation.

Personal data is never bundled with a pack. Resolve existing anchors against revision/digests using [DATA_MODEL.md](DATA_MODEL.md); report changed/missing references without deleting records. New translations receive distinct edition IDs and metadata. Reuse the content tables and ports; do not create edition-specific React reader components. Cross-edition mapping and parallel reading remain later features requiring a verified mapping dataset.

## Completion gates

- Full corpus provenance, rights approval, notice files and intended-audience review are present before public packaging.
- Import is reproducible, fails on unhandled content, produces no source-text modifications, and passes structural/text equivalence plus sample review.
- Importer tests include invalid UTF-8, duplicate labels, truncated files, unexpected markers, bridge/subverse cases, malformed notes and path traversal attempts.
- FTS5 availability, accepted query grammar, normalization and browser/native parity are tested with reviewed Oromo cases and synthetic edge cases.
- A public build fails if it includes synthetic test Scripture, unapproved editions or unresolved hard validation errors. Development fixtures are visibly labeled **Synthetic test content — not Scripture**.

Technical references to verify against pinned versions: [USFM specification](https://ubsicap.github.io/usfm/), [chapter/verse markers](https://ubsicap.github.io/usfm/chapters_verses/index.html), [SQLite FTS5](https://www.sqlite.org/fts5.html), [Unicode normalization](https://www.unicode.org/reports/tr15/). These links describe formats/tools; they do not grant content rights.
