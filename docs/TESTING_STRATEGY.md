# Testing strategy

Status: approved test approach for the required Windows, macOS and Linux V1 targets; qualification details and performance budgets remain subject to [PRD.md](PRD.md) and the gates in [MVP_SCOPE.md](MVP_SCOPE.md) and [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md). Initial Linux qualification is proposed for Ubuntu 24.04 LTS x86_64 with GNOME. A passing browser build or headless Rust suite does not establish desktop readiness on any platform.

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
| Native release     | Installed Windows/macOS signed bundles and authenticated Linux `.deb`; prerequisite/offline behavior; upgrades after V1.0; permissions; uninstall | Every release candidate                                    |

Run fast checks on changes and the full relevant suite before a milestone. Broaden testing when changes affect additional boundaries; do not rerun every unrelated test after documentation-only edits. Record blocked tests as blocked, with the missing environment or input.

## Automated build checks

The [native-checks workflow](../.github/workflows/native-checks.yml) runs for relevant source changes in pull requests, matching pushes to `main`, and manual dispatch once available on the default branch. The [first hosted run](https://github.com/zdevzone/afaan_oromo_bible/actions/runs/39460355228) passes all five jobs at source commit `12e66601e58dbdc212c496efb9c3285dd39d56bf`: frontend checks (71 unit/hook tests and two Chromium journeys), plus 12 SQLite tests and embedded debug compilation on each of the four native targets below. Logs confirm Rust 1.90.0 and native host triples for Linux x64, Windows MSVC x64, Apple silicon and Intel Mac. This is passing compilation/repository-test evidence; Windows/macOS GUI evidence remains pending.

The frontend job performs frozen dependency installation, Varlock declaration generation and TypeScript checking, Vite+ checks, unit/hook tests, a browser build and the two existing Chromium journeys. Native jobs depend on that job and use these build hosts:

| Hosted runner    | Expected architecture | Automated scope                                                              |
| ---------------- | --------------------- | ---------------------------------------------------------------------------- |
| `ubuntu-24.04`   | x64                   | Headless SQLite tests, Rust formatting/Clippy and embedded debug compilation |
| `windows-2022`   | x64                   | Headless SQLite tests and embedded debug compilation                         |
| `macos-15`       | ARM64                 | Headless SQLite tests and embedded debug compilation                         |
| `macos-15-intel` | x64                   | Headless SQLite tests and embedded debug compilation                         |

The workflow records actual host/tool versions and checks the Node architecture against the matrix. These are build hosts, not a revised supported-OS matrix: Windows Server 2022 compilation does not qualify Windows 11, and macOS 15 compilation does not qualify the proposed macOS 14 floor. Platform support remains governed by [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md).

Use the official Vite+ setup action with Vite+ `1.3.0` and `.node-version`; Rust comes from `rust-toolchain.toml`, including rustfmt and Clippy. Action references use immutable commit SHAs. JavaScript installation uses `--frozen-lockfile`; native tests and compilation retain the Cargo lockfile. `vp run desktop:check` selects the native renderer and explicit synthetic-content feature, then runs a debug build with `--no-bundle` and forwarded Cargo `--locked`. Development-server behavior and the public-content release gate are unchanged.

Dependency caches, two Cargo build jobs per native runner and disabled debug symbols reduce repeated compilation work. New runs cancel superseded runs; path filters avoid native rebuilds for unrelated prose. Repository access is read-only, checkout does not retain credentials, and no signing secrets, application bundles or release uploads are involved.

For each hosted run, retain its URL, source commit and per-job result in the [repository status](../README.md#current-status). Resolve failed steps before treating a platform compile check as passed. A green workflow proves its listed tests and compilation only: it does not launch a native window, exercise offline desktop IPC/clipboard, guard macOS application-level Quit, review screen-reader behavior, or qualify installers. The native journeys and release gates below remain required.

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

Run automated scans on the reader, navigation dialogs, search results, note editor and settings. Manually test NVDA with Windows, VoiceOver with macOS, and Orca through AT-SPI with the packaged Linux app. On Linux verify that the WebKitGTK accessibility tree reaches AT-SPI and Orca in the actual GNOME desktop session; an accessible browser page or a running Orca process alone does not prove this bridge works. Verify accessible names, selected verse announcement, heading structure, modal focus containment, live save/search status, reduced-motion behavior, and the absence of focus loss after passage changes. Verify text rendering and line breaks with Oromo content. Keyboard shortcuts must not intercept ordinary typing or assistive-technology commands.

Manual checks also cover a long chapter, footnote/cross-reference reading, copying multiline selections with the correct attribution, screen scaling, font fallback, and clear separation between Scripture and personal notes. Record issue severity and affected scenario; an automated accessibility score alone is insufficient.

## Browser versus native evidence

Browser automation runs the same React application against explicitly selected development adapters. Production Tauri startup must fail clearly if the native adapter is unavailable; it must never silently fall back to IndexedDB or synthetic content.

Validate Tauri early with a real read → navigate → search → note → restart slice. Native tests must exercise the Rust commands and actual file locations, plus confirm that the content database opens read-only and that the bundled SQLite supports FTS5. Browser contract tests cannot prove these facts.

For native UI automation, use the current [Tauri WebDriver testing documentation](https://v2.tauri.app/develop/tests/webdriver/) to choose the platform route. Windows can use `tauri-driver` with a compatible Edge WebDriver; Linux can use `tauri-driver` with the matching WebKitGTK WebDriver where supported; current Tauri documentation also describes embedded WebdriverIO automation for macOS. Verify availability and version compatibility before pinning each harness. Do not categorically mark macOS automation unsupported. Keep manual installed-app smoke and assistive-technology tests on all three platforms. A headless Linux job cannot replace its desktop-session gate, and Linux results do not establish Windows/macOS behavior.

The full embedded Linux native debug build and an offline synthetic smoke now pass in an Ubuntu 24.04 container with GTK 3.24.41 and WebKitGTK 2.52.6 (4.1 API), using Xvfb/Openbox and disabled networking. Local `.tooling/linux/smoke-005` reports record bridge/reference navigation, exact 157-character native clipboard output, phrase search, committed linked-note text, SQLite integrity `ok`, and reading-position/note recovery after a real process restart (PID 733 → 874). AT-SPI exposes labels, entry text and selected verse `PRESSED` states. The runner sends SIGTERM only after the note and position commit; this is not an interrupted-write or native close-guard test.

The smoke session needs the Xvfb-only `WEBKIT_DISABLE_COMPOSITING_MODE=1` workaround because default GPU compositing produced a blank window there; no production configuration or WebKit sandbox setting was changed. The [Linux development guide](../tools/linux/README.md) documents the build and harness. The same passing run verifies Tab/Shift+Tab order, a complete dialog focus cycle, reverse traversal, Escape dismissal and focus return. Do not promote this bounded AT-SPI smoke into a claim of complete accessibility or platform qualification.

The native window-close guard uses the verified Tauri 2.12.4 window API. Its listener prevents close requests during service composition before the editor mounts; a typed platform port authorizes `destroy()` only after the selected clean/save/discard path finishes. The only new capability is `core:window:allow-destroy`. The current Vitest suite passes 71 tests across six files, including 15 note-workspace and 13 close-guard cases. Type checking, Vite+ checks, two Chromium journeys and the full native build also pass.

The actual Openbox Alt+F4/`WM_DELETE_WINDOW` close run now passes all three reports in local `.tooling/linux/close-002`: Cancel receives initial focus; Escape retains the draft and returns focus to the note; intentional Discard exits while preserving the committed baseline. An external SQLite `BEGIN IMMEDIATE` reservation produces a real busy-timeout Save failure, retaining the window and draft. Cancel remains usable, and after the lock is released a Save retry commits before exit. A new process recovers the saved text, then clean Alt+F4 exits. This is synthetic Xvfb/X11 window-manager evidence, not disk-full coverage or another platform's exit behavior.

The window-close API does not currently guard macOS Command+Q, application-menu Quit or Dock Quit; those application-exit routes need separate platform handling and qualification. External SIGTERM, crashes and forced shutdown are outside the window guard and remain persistence/recovery scenarios, not promises to save an uncommitted draft. GNOME X11/Wayland, manual Orca, `.deb` install/uninstall and Windows/macOS native evidence remain pending.

## Linux desktop and package qualification

Linux is a required V1 release gate. Qualify the initial Ubuntu 24.04 LTS x86_64 GNOME `.deb` on clean supported installations, using the oldest supported distribution as the build baseline to constrain glibc/system-library requirements. Confirm the actual GTK 3, WebKitGTK 4.1 and selected plugin runtime dependencies generated into the package. Record package versions and build/runtime distribution versions; a container build is not evidence that desktop integration works.

Run the following on **both GNOME X11 and Wayland sessions**, recording the session and the application's actual display backend, including any XWayland use:

- Install the downloaded `.deb` through the documented package-manager route with and without missing dependencies. Verify prerequisite diagnostics, desktop launcher/icon, startup, and the guarantee of offline operation after dependencies are installed. Test disconnected installation only for artifacts advertised as fully offline installers.
- Exercise read → navigate → search → linked note → save → native close/restart → reopen against real Tauri IPC and SQLite/FTS5. Confirm content is read-only, user data has the correct per-user path/permissions, failed saves retain drafts, and Save/Discard/Cancel on native close behaves truthfully.
- Test ordinary window-manager close and application-level Quit separately. In particular, macOS Command+Q/menu/Dock Quit is not covered by the current window-close guard. Keep that platform-exit gate open until verified; never substitute SIGTERM-after-commit smoke for guarded close or interrupted-write tests.
- Verify clipboard copy with another desktop application, native open/save dialogs, focus return, Unicode filesystem paths, missing/unwritable destinations, theme changes, scaling, font fallback and Oromo glyph/line rendering. Do not infer Wayland clipboard/dialog behavior from an X11 run.
- Export and restore user data, repeat with unavailable editions, and inject permission/disk-write failures without erasing earlier records. Verify the pre-restore recovery snapshot and atomic replacement on the installed application.
- Run the core keyboard and Orca/AT-SPI journeys, including modal controls and native dialogs. Confirm the actual WebKitGTK accessible content, selection/status announcements and focus behavior in each session; record unresolved bridge defects as release blockers.
- Remove, reinstall and replace the package, verifying that system files/launcher are handled correctly and personal records remain unless the user explicitly chooses their removal. Reopen persisted notes and preferences after reinstall. Public-version schema changes additionally require the migration tests above.
- Verify the downloaded package checksum and independently verifiable manifest/package signature using the published release-key procedure. A plain checksum does not authenticate the publisher, and a standalone `.deb` is not automatically verified by APT.

Additional distributions, Linux ARM and AppImage are outside the initial qualification matrix. Add them only after explicit compatibility, dependency, session, accessibility and packaging tests; a bundler output alone is insufficient evidence. Linux failure leaves the V1 gate open alongside the Windows/macOS gates.

## Performance, privacy and release evidence

Measure the budgets in [PRD.md](PRD.md) using an agreed reference machine, packaged application and the complete approved corpus. Record cold/warm launch, chapter changes, search latency and long-session memory, with dataset size and hardware. Synthetic fixtures do not demonstrate full-corpus performance. Run an offline installed-app journey with network disabled and verify core reading and all local features work without accounts, fonts or hosted assets.

Verify Tauri capabilities and commands expose only required operations; reject arbitrary path/SQL arguments, render notes as text, and keep secrets out of frontend bundles, backups and logs. The V1 app must not initiate AI or synchronization requests. Logs must omit note bodies and Scripture excerpts unless an explicit local diagnostic flow discloses and authorizes them.

Each release candidate retains a concise evidence checklist: exact commit and content hash, dependency lockfile, passing commands/reports, OS/architecture and hardware, Linux distribution/runtime versions and X11/Wayland results, accessibility reviewer results including Orca/AT-SPI, licensing disposition, applicable installer signatures or signed package manifest, offline scenarios, restore drill and known issues. V1 release requires no unresolved release-blocking issue, no unreviewed rights restriction and no missing evidence from Windows, macOS or the qualified Linux matrix. The release checklist is owned by [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md).
