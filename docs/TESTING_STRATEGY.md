# Testing strategy

Status: approved test approach; platform support and performance budgets remain subject to [PRD.md](PRD.md) and the gates in [MVP_SCOPE.md](MVP_SCOPE.md) and [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md). A passing browser build does not establish desktop readiness.

## Test the product's risks

The critical failures are altered Scripture, incorrect references, lost personal work, inaccessible reading, and a desktop application that fails offline. Test these before adding breadth. Use one set of domain behavior contracts against browser and native adapters; keep platform-specific assertions where they belong.

Default tooling is Vitest through Vite+, React Testing Library with user-event, a DOM test environment, Playwright for browser journeys, and Rust's built-in test runner for native code. Add an axe integration for automated accessibility scans when the reader shell exists. These tools do not replace manual assistive-technology testing. Pin versions compatible with the chosen Vite+/React versions; use the commands established in [DEVELOPMENT_GUIDELINES.md](DEVELOPMENT_GUIDELINES.md). Avoid snapshot-heavy suites and tests that merely repeat implementation details.

## Layers and ownership

| Layer              | Scope and representative checks                                                                                                                   | When                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Domain unit        | Reference parsing, verse bridge/subverse identity, selection order, query normalization, note validation, backup validation, settings defaults    | Every relevant change                                      |
| React behavior     | Navigation and focus, selection/copy feedback, loading/empty/error states, note save failure and retry, UI locale independent of edition          | Every relevant change                                      |
| Adapter contract   | Same chapter order, reference lookup, search semantics, persistence, absent-edition behavior and errors in IndexedDB and SQLite                   | On storage/domain changes                                  |
| Rust repository    | Temp-file databases; read-only content opening; parameterized queries; transaction rollback; unique anchors; serialized writes; filesystem errors | On native changes and CI                                   |
| Content integrity  | Authorized source provenance, checksums, structure, text preservation, declared marker handling, content manifest, attribution                    | Every content-pack build                                   |
| Browser journeys   | First launch → read → navigate → search → annotate → reload; settings; keyboard use; backup/restore                                               | Pull requests touching the journey; full suite before beta |
| Native integration | Real Tauri IPC, app-data paths, SQLite/FTS5 availability, restart, clipboard, file dialogs, backup/restore, no production browser adapter         | Early Phase 1 and before each candidate                    |
| Native release     | Installed signed artifacts on Windows/macOS; clean/offline installation; upgrades after V1.0; permissions; uninstall behavior                     | Every release candidate                                    |

Run fast checks on changes and the full relevant suite before a milestone. Broaden testing when changes affect additional boundaries; do not rerun every unrelated test after documentation-only edits. Record blocked tests as blocked, with the missing environment or input.

## Fixtures and content integrity

Maintain a tiny, conspicuously labeled synthetic corpus covering prose, headings, paragraphs, poetry, footnotes, cross-references, non-ASCII text, chapter boundaries, a verse bridge, a subverse, and a missing optional target. It must not imply an actual Oromo edition, invent Bible quotations, or enter public builds. Reference examples and expected text in tests are fixture data, not theological claims.

For a real edition, obtain an authorized source and a reviewed expected manifest before declaring integrity. Tests must:

1. Verify original input checksums and retain a reproducible build report with importer version and edition/versification metadata.
2. Compare book order, source chapter/verse labels, and expected structures against that edition's manifest. Do not require every edition to match an assumed canon or universal verse count.
3. Compare extracted source text and resulting display text using explicitly documented, licensed transformations only. Search normalization must never alter display/export quotations.
4. Fail or require a reviewed disposition for unsupported markers, duplicate identifiers, malformed nesting, undecodable bytes, missing required metadata, or unresolved references. Do not silently discard text or notes.
5. Verify note and cross-reference attachment, poetry/heading order, verse bridge identity, and round-trip retrieval from `library.sqlite`.
6. Rebuild twice from identical inputs and compare logical records and manifest hashes. Byte-identical SQLite files are not the sole integrity criterion.
7. Require a fluent Oromo reader to review representative passages against the authorized source. Automated comparisons cannot certify editorial or linguistic correctness.

Test the proposed NFC/case-folding profile only in derived search/index/query boundaries, as defined in [SCRIPTURE_PIPELINE.md](SCRIPTURE_PIPELINE.md); verify original display/copy code points remain unchanged. Test straight/curly/modifier apostrophes, case variants, combining sequences, repeated whitespace and punctuation. Review equivalence rules with Oromo speakers: do not apply English stemming, blanket accent removal, or unreviewed Oromo word conflation. The search test corpus must preserve examples where superficially similar spellings have different meanings.

Test literal quotes, wildcard characters, FTS operators and long/malformed queries. User input must not become arbitrary SQL or an unrestricted FTS expression. Verify reference lookup separately from full-text search, deterministic ordering, result snippets, empty queries, zero results, and navigation from a result to its exact edition-aware anchor.

## User-data reliability and recovery

Use actual temporary SQLite files for transactional tests; in-memory databases alone do not exercise filesystem failure. IndexedDB tests must reopen the database after writes. Include:

- Notes, bookmarks, highlights, preferences and reading position survive process restart. Explicit save succeeds only after persistence; failed writes keep the user's draft visible and retryable.
- Failure injection at each write boundary, a locked database, denied access and disk-full conditions surface actionable errors without reporting a false save or corrupting earlier records.
- Kill a test process during a transaction and during backup publication; reopen and verify SQLite integrity and that records represent a complete pre- or post-transaction state. Test on disposable files, never a developer's real app-data directory.
- Backup export validates its complete JSON payload, writes to a temporary destination and publishes atomically where the platform permits. If a target filesystem cannot guarantee atomic rename, preserve the original and surface failure; do not claim a partial file is a valid backup.
- Restore rejects unsupported format versions, invalid records, duplicate IDs, excessive size and malformed anchors before mutating data. Cancellation and rejection leave all records unchanged.
- Confirmed replacement takes a recoverable pre-restore snapshot before the replacement transaction. Inject failure during snapshot creation and replacement; verify rollback and an actionable recovery path. A snapshot failure must prevent replacement.
- Restore with a referenced edition unavailable retains the annotation and edition-aware anchor, displays an unavailable-content state and permits later resolution. It must not attach it to another edition with a similar verse number or delete it.
- Unreadable/corrupt content and user databases produce distinct errors. No error path silently deletes or resets an existing user database. A developer-only reset requires an explicit command outside ordinary app launch.
- Export contains user data and edition identifiers only; it must not embed Scripture, private filesystem paths, API keys or unrelated application files.

For pre-V1 development schemas, test the current schema and an explicit developer reset. Do not create historical migration tests or adapters for discarded development formats. At V1.0 freeze the first public schema/backup formats and establish migration fixtures; every later public change needs forward migration, interruption, recovery, and supported-backup restore tests.

## Accessibility and reading quality

Check light/dark/system themes, visible focus, contrast, text enlargement and reflow at the minimum window size defined by the UX specification. No Bible-reading action may require a mouse, color recognition or a hover-only affordance. Test a complete keyboard journey including dialog dismissal, focus return, book/chapter navigation, verse selection, search, note editing and backup controls.

Run automated scans on the reader, navigation dialogs, search results, note editor and settings. Manually test NVDA with Windows and VoiceOver with macOS. Verify accessible names, selected verse announcement, heading structure, modal focus containment, live save/search status, reduced-motion behavior, and the absence of focus loss after passage changes. Verify text rendering and line breaks with Oromo content. Keyboard shortcuts must not intercept ordinary typing or assistive-technology commands.

Manual checks also cover a long chapter, footnote/cross-reference reading, copying multiline selections with the correct attribution, screen scaling, font fallback, and clear separation between Scripture and personal notes. Record issue severity and affected scenario; an automated accessibility score alone is insufficient.

## Browser versus native evidence

Browser automation runs the same React application against explicitly selected development adapters. Production Tauri startup must fail clearly if the native adapter is unavailable; it must never silently fall back to IndexedDB or synthetic content.

Validate Tauri early with a real read → navigate → search → note → restart slice. Native tests must exercise the Rust commands and actual file locations, plus confirm that the content database opens read-only and that the bundled SQLite supports FTS5. Browser contract tests cannot prove these facts.

For native UI automation, use the current [Tauri WebDriver testing documentation](https://v2.tauri.app/develop/tests/webdriver/) to choose the platform route. Windows can use `tauri-driver` with a compatible Edge WebDriver; current Tauri documentation also describes embedded WebdriverIO automation for macOS. Verify availability and version compatibility before pinning the harness. Do not categorically mark macOS automation unsupported. Maintain manual signed-app smoke tests on both operating systems even with automation. Linux testing is useful during development but does not satisfy either release gate.

The initial environment has no established Rust/Cargo or Linux GTK/WebKit readiness and cannot establish Windows/macOS behavior. Record actual tool checks in the implementation handoff, install prerequisites where authorized, and report desktop checks as blocked until they run. Do not convert missing native tooling into a claim that native integration passes.

## Performance, privacy and release evidence

Measure the budgets in [PRD.md](PRD.md) using an agreed reference machine, packaged application and the complete approved corpus. Record cold/warm launch, chapter changes, search latency and long-session memory, with dataset size and hardware. Synthetic fixtures do not demonstrate full-corpus performance. Run an offline installed-app journey with network disabled and verify core reading and all local features work without accounts, fonts or hosted assets.

Verify Tauri capabilities and commands expose only required operations; reject arbitrary path/SQL arguments, render notes as text, and keep secrets out of frontend bundles, backups and logs. The V1 app must not initiate AI or synchronization requests. Logs must omit note bodies and Scripture excerpts unless an explicit local diagnostic flow discloses and authorizes them.

Each release candidate retains a concise evidence checklist: exact commit and content hash, dependency lockfile, passing commands/reports, OS/architecture and hardware, accessibility reviewer results, licensing disposition, installer signatures, offline scenarios, restore drill and known issues. V1 release requires no unresolved release-blocking issue, no unreviewed rights restriction and no missing native-platform evidence. The release checklist is owned by [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md).
