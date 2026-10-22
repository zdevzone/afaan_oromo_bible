# Feature specifications

Status: intended V1 behavior. All features marked required below are release requirements; Phase 1 implements only the vertical slice identified in [ROADMAP.md](ROADMAP.md). Architecture and data contracts are owned by [ARCHITECTURE.md](ARCHITECTURE.md), [DATA_MODEL.md](DATA_MODEL.md), and [STORAGE_STRATEGY.md](STORAGE_STRATEGY.md). UI composition and accessibility rules are in [UI_UX_GUIDELINES.md](UI_UX_GUIDELINES.md).

## Common rules

- V1 runs offline with one authorized installed Bible edition and local user data. No account, remote server, font download, or AI service is required.
- V1 targets Windows, macOS, and Linux desktop through one React UI and the existing platform ports. Ubuntu 24.04 LTS x86_64 with GNOME is the proposed first qualified Linux environment; [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md) owns the supported distribution/session matrix. Required native qualification is pending until actual results are recorded. Do not create a Linux UI fork or introduce another component library.
- Scripture display and quotations use canonical imported text; search normalization never changes source text. Editorial source elements remain distinguishable.
- References include edition and versification identity internally. A verse unit may carry a bridge or subverse label; do not assume every verse label is an integer.
- Every user write reports success only after durable persistence. Errors retain recoverable input and offer a meaningful retry/recovery action.
- Loading, empty, invalid-input, missing-content, and storage-error states have distinct messages. No source or user record is silently substituted or deleted.
- All actions have accessible visible controls. Shortcuts supplement them. Destructive actions require explicit confirmation when valuable user data would be removed.

## F01 — Launch and offline reading — required

Open the last valid reading position, otherwise the first book/chapter in edition order. Show the edition name and current book/chapter. Render source paragraphs, verse markers, headings, poetry, footnote triggers, and cross-reference triggers supported by the validated content pack. Preserve canonical text, ordered units, and structural distinctions.

Load only the active passage and necessary metadata rather than mounting the full Bible. During a chapter change keep the old passage readable until the new one is available, then move focus/announce the new passage as appropriate to the navigation action. Prevent stale responses from replacing a newer navigation request.

If the content pack is missing or fails integrity/schema checks, show an actionable unavailable-content screen with diagnostics suitable for support. Permit user-data backup/settings recovery where possible. Never render a guessed chapter or download an unapproved substitute. Development fixtures display their synthetic status and must be rejected by public-release packaging checks.

Acceptance:

- After installation, reading and passage navigation work with network access disabled and after a clean restart.
- A fixture containing paragraphs, poetry, a heading, a bridge, a subverse, a footnote, and a cross-reference renders in source order without lost text.
- An invalid pack produces a recoverable error; no content corruption is hidden by an empty chapter.

## F02 — Book/chapter and reference navigation — required

Provide a book list in edition order with edition-supplied localized names/aliases and chapter choices valid for that book. Previous/next chapter follows actual edition order, including book boundaries; disable the action at the start/end of the canon. Do not invent missing chapter labels.

The reference picker accepts a book alias plus a valid chapter and optional verse/range using the edition's reference metadata. Alias matching is case-insensitive and Unicode-aware; ambiguous abbreviations show choices rather than selecting silently. The exact accepted Oromo aliases must be reviewed by a fluent reader and recorded with edition metadata. Support canonical book codes for unambiguous entry.

Reject impossible, ambiguous, unsupported cross-chapter ranges, and malformed references with an explanation. V1 verse-range selection is confined to one chapter. Navigating to a bridge or subverse resolves the actual source unit; display that label. Do not assume equivalence to another versification.

Acceptance:

- A reader reaches any valid book/chapter and a recognized verse using keyboard controls.
- First/last chapter boundaries, ambiguous aliases, unknown books, invalid labels, bridges, and omitted verses have explicit behavior.
- Navigation from a search result, annotation, or cross-reference uses the same reference resolver and brings its target into view.

## F03 — Verse selection and copying — required

Allow one verse unit or a contiguous range within the visible chapter to be selected by accessible verse controls. Include Clear selection and an accessible way to extend a range without a pointer or Shift key. Preserve normal browser/OS text selection separately.

Copy selected verses uses canonical display text in source order, with readable source reference and edition attribution required by the content license. A bridge/subverse is copied as the actual source unit; no fabricated split text. Copying plain selected text follows standard OS behavior. The final formatted quotation template and any quotation-length limitation require edition-rights verification before release.

Desktop clipboard access uses the approved platform service; browser development uses its permitted adapter. Report clipboard denial/failure and show selectable quotation text for manual copy. Never claim success when access fails.

Acceptance:

- Single/range copy preserves spelling, punctuation, Unicode, verse labels, and source order without search normalization.
- The selected range is clear visually and to assistive technology; changing chapters clears temporary selection.
- Clipboard errors provide manual recovery without losing the passage or quotation.
- Verify standard clipboard copy and ordinary text selection in the qualified Linux GNOME Wayland and X11 sessions, including an unfocused/unavailable clipboard error path. A browser clipboard test does not prove the native session behavior.

## F04 — Scripture search — required

Search only the selected edition. Provide a distinct reference-navigation path; never send raw query syntax directly to FTS5. V1 is deterministic text search, not semantic search, fuzzy matching, or theological interpretation.

The approved common grammar is a bounded query with whitespace-separated terms combined with AND, quoted adjacent-token phrases, and an explicit trailing `*` for token-prefix matching. Quoted phrases match consecutive normalized tokens; punctuation is not significant to token adjacency. No OR/NOT operators, arbitrary FTS expressions, automatic stemming, accent removal, or spelling correction. Blank input shows guidance. Malformed quotes, unsupported punctuation syntax, or prefix markers in an invalid position show validation feedback. Require at least two normalized characters before `*` and cap query length at 256 Unicode code points / 20 terms to bound work.

Normalization and token rules must be identical in the import pipeline, desktop search, and browser adapter. The canonical normalization table and vectors live in [SCRIPTURE_PIPELINE.md](SCRIPTURE_PIPELINE.md); acceptance includes canonical Unicode equivalence, case, Oromo apostrophe forms, and meaningful repeated letters/vowels. Source text is always unchanged. Do not silently remove diacritics or collapse doubled letters. An apostrophe policy is an explicit reviewed search decision, not a text correction.

Show result reference, canonical text excerpt, edition, match emphasis where reliable, total count or clearly labeled bounded count, and stable ordering by canon/chapter/verse-unit order. Default filters are all books; a single-book restriction is required. A canon-group/testament restriction is optional and may be added only where edition metadata supplies the grouping. Results are paged, initially 50 at a time, without imposing a 50-result total cap. The user can cancel/replace a query; discard stale responses.

Activating a result opens the passage and marks the result target temporarily without overwriting stored highlights. Excerpts and emphasis use canonical text offsets/mappings; if a correct normalized-to-source mapping is unavailable, show the canonical excerpt without inaccurate emphasis. Do not render raw HTML from queries or content.

Acceptance:

- Desktop and browser fixtures return the same ordered references for a shared query corpus, including exact terms, AND terms, prefixes, phrases, Unicode equivalence, apostrophes, and invalid syntax.
- Punctuation, apostrophes, Oromo doubled vowels/consonants, and a non-ASCII character do not corrupt stored/displayed Scripture.
- No results, invalid query, loading, cancelled query, and unavailable index have distinguishable states. A broken index is recoverable from the verified immutable content pack.
- Full-corpus search meets the measured response budget in [TESTING_STRATEGY.md](TESTING_STRATEGY.md); unsupported syntax cannot become SQL/FTS injection.

## F05 — Bookmarks — required

Bookmark the current verse unit or selected contiguous range. The bookmark records its edition-aware anchor and creation/update times; an optional short label is plain text. If no verse selection exists, the UI asks for a target or explicitly offers the first visible verse; it never silently chooses an unrelated anchor.

Bookmarks appear in an accessible list with reference and label, initially newest first, with a deterministic tie-breaker. Activating one opens the passage. Adding the same anchor again updates/focuses its existing bookmark rather than silently creating a duplicate. Removing a bookmark requires a clear action and confirmation or a durable undo route before deletion becomes final.

Acceptance:

- Add, reopen, edit label, remove, restart, export, and restore preserve the expected records.
- A bookmark whose edition/anchor is unavailable remains listed as unresolved and editable/removable, with no guessed remapping.

## F06 — Whole-verse highlights — required

Offer a small named, accessible palette for whole verse units. Applying a color to a range sets that color on every unit atomically. A verse has at most one stored color; applying another replaces it. Clear highlight removes only the selected units' highlights, not notes/bookmarks. Arbitrary character ranges, nested colors, and free-form color values are outside V1.

Use shared palette IDs independent of theme; resolve them to contrast-tested light/dark tokens. Include text/shape cues so selection and palette state do not depend only on color. Palette names need fluent localization review.

Acceptance:

- Single and range changes are durable, atomic, exportable, and reversible through a clear remove/change action.
- Highlights remain readable with selection/search emphasis, both themes, enlarged text, and forced colors.

## F07 — Personal and verse-linked notes — required

Support plain-text notes with optional title, body, creation/update times, and optional edition-aware anchor. A standalone note has no anchor; a linked note refers to one verse or contiguous range in one chapter. Multiple notes may refer to the same anchor. No HTML, Markdown rendering, rich text, attachments, folders, sermon templates, or cloud storage is required.

Create standalone notes from Notes and linked notes from verse actions. Present notes newest-updated first with stable tie-breaking and readable title/body previews and reference labels. Optional title/body filtering may improve findability after the required save/recovery flow works; do not mix private note text into Scripture search results. Opening a linked note offers a passage navigation action. Allow attaching/changing/removing the anchor through the same validated reference picker.

Notes have visible Save and saved/unsaved/saving/error states. Autosave after 300 ms idle; explicit Save flushes pending changes immediately. Serialize saves per note and use the current revision contract so a late response cannot overwrite a newer edit or label it saved. Navigation away flushes and awaits pending work; if a save fails or the user closes with an unsaved draft, offer Retry/Save, Discard, and Cancel. While a save fails, keep the draft and allow copy recovery. The native close decision is specified in F13; browser-only unload limitations require a best-effort warning plus explicit save status, never a guarantee. Do not depend on a close callback as the primary save mechanism.

A blank new note with no title/body is not saved. Existing content is never deleted simply because a draft is temporarily blank. Deletion names the note/reference and requires confirmation or durable undo. Render stored content as text; escaped HTML-looking input must remain text. Enforce the [data-model limits](DATA_MODEL.md): note titles at most 256 Unicode code points and bodies at most 1 MiB UTF-8, consistently in the editor, IPC, import, and restore. An over-limit draft remains recoverable for shortening/copying, rather than being truncated silently.

Acceptance:

- A standalone and a linked note can be created, edited, located, reopened after restart, detached/relinked, exported/restored, and deleted.
- Closing with unsaved edits, failed save, full disk, and stale navigation preserve recoverable draft text and truthful status.
- Missing-edition anchors remain unresolved without deleting note bodies; attaching an invalid reference fails validation without modifying the note.

## F08 — Reading preferences and settings — required

Provide font size (initial proposal 16–32 px; default 20), line-height choices 1.4 / 1.65 / 1.9 (default 1.65), comfortable/wide column width, Light/Dark/System theme, interface language, and settings/attribution access. Preferences take effect immediately and persist locally; if saving fails, show that the session setting may not survive restart. Theme defaults to System and follows OS changes only in that mode. Text size must work with OS/browser zoom rather than suppressing it.

Expose the current installed edition and its attribution. One installed edition means no artificial edition picker with unavailable choices. A later real edition selector uses its own preference and never reuses the UI-language value.

Acceptance:

- Preferences survive restart and backup/restore; unsupported or invalid values are rejected or reset with a clear fallback.
- Theme changes, long translated labels, and font changes do not hide essential controls or clip Scripture.
- On qualified Linux GNOME sessions, system text enlargement, display scaling, high-contrast settings, and explicit app themes retain readable text, visible focus, and usable controls. Verify actual WebKitGTK behavior rather than assuming OS settings map to browser media queries.
- Required app settings can be reached and changed without a mouse or network.

## F09 — Reading-position persistence — required

Persist the active edition, chapter, and first relevant visible verse-unit anchor after navigation and settled scrolling. Use a semantic anchor plus a bounded relative offset as an optional refinement; a raw pixel offset alone fails after font/layout changes. Keep one latest position per installed edition. A new explicit navigation action wins over a late position-write response.

On restart restore the semantic passage before applying any valid offset. If an offset is no longer usable, show the anchored verse. If the anchor is missing, fall back to its valid chapter or edition start, tell the reader when meaningful, and preserve unrelated user data. Do not update position merely because a search result list is scrolled.

Acceptance:

- Restart after reading restores a useful passage position in both browser and Tauri storage adapters.
- Changing font size/window width does not restore to a different arbitrary passage.
- Navigation/scroll races and a removed development fixture cannot corrupt the stored reference or block launch.

## F10 — Local persistence and recovery — required

Desktop uses immutable distributable `library.sqlite` and private writable `user.sqlite`; browser development uses the same service contracts with JSON/IndexedDB adapters. The browser adapter is a development aid, not a public desktop fallback. Persist only user-authored records/preferences in the private database. Do not write annotations into the content pack.

Save related changes in transactions, including multi-verse highlights and restored records. Handle unavailable directories, permissions, full disk, locked/corrupt stores, and unsupported schemas. Reading should continue when immutable content is healthy but user persistence fails; visibly disable or retain failed writes and offer user-data export/recovery. Never silently recreate an unreadable user database containing possible valuable data. Development resets are explicit tooling under the pre-V1 compatibility policy.

Acceptance:

- A failed transaction leaves previous committed records intact; no half-applied highlight range or restore is visible.
- User-data errors cannot cause Scripture to be overwritten or silently erase personal records.
- Private records remain local during ordinary operation; no analytics, cloud sync, or remote logging of their text is introduced.

## F11 — Export and backup restore — required

Export a versioned portable JSON backup containing personal notes, bookmark/highlight records, preferences, reading positions, IDs, UTC timestamps, edition-aware anchors, and the schema/format metadata required to validate it. Exclude Scripture text, source archives, search indexes, machine paths, credentials, and unsaved editor drafts. Explain that the file contains personal information and is unencrypted in V1. OS disk protection is outside the application's backup guarantee.

Export from a consistent user-data snapshot, present a save destination, and report success only when writing completes. On cancellation leave state unchanged. Encourage backups before resetting development storage and before installing development builds with changed schemas.

Restore is **replace only** in V1, not merge. The ordered workflow is:

1. Choose a file and parse/validate it before mutating the current store. Enforce size/record limits (50 MiB and 100,000 total records), supported format version, required fields/types, UUIDs, timestamps, unique IDs, palette IDs, reference shape, and safe text lengths. Treat data as untrusted input. The backup schema/counting rules are owned by [STORAGE_STRATEGY.md](STORAGE_STRATEGY.md).
2. Show a preview with record counts, current counts to be replaced, unavailable editions/unresolved anchors, and an explicit statement that current personal records/preferences/positions will be replaced. Missing edition content is not a reason to discard otherwise valid personal records.
3. Ask for an explicit destructive confirmation. Cancel changes nothing. Prevent concurrent editing/restores during commit and avoid losing a live unsaved draft.
4. Create and verify a recoverable pre-restore snapshot outside the replace transaction. If snapshot creation fails, abort restore. Keep its location/recovery action accessible.
5. Atomically replace validated user records, then refresh app state. On failure roll back; keep the original data and snapshot. Re-resolve installed content/anchors, applying a safe position fallback when needed.

Do not fetch or bundle a missing Bible based on backup metadata. Before V1, accept only the current documented backup format and fail clearly on unsupported development versions; do not build historical compatibility importers. At public V1.0, freeze the first supported format and establish tested forward migrations as needed.

Acceptance:

- Export → restore into a clean store round-trips the supported user records and preserves Unicode exactly.
- Wrong file, malformed/oversized JSON, unknown format, invalid IDs/references, duplicate IDs, cancelled confirmation, failed snapshot, full disk, and interrupted commit cannot destroy the existing committed store.
- Restore preview accurately describes replacement; the pre-restore snapshot can be used to recover overwritten records.
- Native choose/save dialogs are keyboard-operable on each desktop target; GNOME Wayland/X11 checks include cancellation, focus return, and a denied/unavailable destination without changes to existing data.

## F12 — Interface language and source metadata — required

Provide independently modeled Afaan Oromo and English UI catalogs with English fallback for incomplete development strings. Fluent Oromo review is a V1 gate. UI language changes control labels, status/error text, and formatting; they do not translate Scripture, change its edition, modify reference identity, or assume the user's dialect.

Use verified edition titles, book names/aliases, language/dialect metadata, versification ID, publisher, copyright/permission notice, and applicable quotation conditions. Show source note type and attribution where required. Metadata can be corrected only through the validated content pipeline; end users do not edit canonical Bible records.

Acceptance:

- Switching UI languages keeps the same passage, notes, bookmarks, highlights, and edition.
- English fallback is explicit during development; a public build has fluent-reviewed required strings and required edition attribution.

## F13 — Accessibility and desktop behavior — required

The complete read → navigate → select/copy → search → annotate → settings → backup/restore workflow must work using keyboard and screen readers on Windows, macOS, and qualified Linux environments. Maintain logical landmarks, focus restoration, status announcements, accessible labels, and visible focus. Native menus/dialogs/clipboard use the existing platform-service boundary for all three desktop targets; browser fixtures use transparent development equivalents. Do not suppress OS selection, zoom, or accessibility capabilities to imitate a mobile interface. Ctrl-based reference/search shortcuts apply to Windows and Linux; macOS uses Command equivalents. Verify GNOME/OS shortcut conflicts and retain visible controls for every action.

The implemented native window-close guard intercepts requests before editable UI mounts. On a close request, pause editing and automatic note saves before checking the latest buffer. Repeated close requests share one decision. A dirty note presents **Save and close**, **Discard changes**, and **Cancel**:

- Save and close waits for already-started writes, saves the latest buffer with the committed revision, and closes only after success. A failed save keeps the window, draft and retry choices available.
- Discard changes waits for already-started writes and abandons only uncommitted changes. It does not delete the note or undo earlier committed autosaves.
- Cancel restores the editor and autosave. A clean editor still waits for pending note mutations and queued position/preferences writes before the guarded window is destroyed.

The main window alone receives the explicit destruction capability; a close failure remains visible and retryable. Browser `beforeunload` is used only for browser development. Actual window-manager verification passes in the offline Ubuntu 24.04 Xvfb/Openbox smoke: Cancel/Escape preserve the draft and restore focus, Discard preserves the committed baseline, a database lock leaves a failed save/window/draft available, retry after unlocking commits before exit, and the next process restores the saved body and closes cleanly. These results do not establish Windows/macOS or full Ubuntu GNOME X11/Wayland/Orca/package qualification. macOS Command-Q, application-menu Quit and Dock Quit use separate application-exit paths and remain an explicit qualification gap. Ordinary committed reading requires no startup network permission or sign-in.

Acceptance:

- Manual Windows NVDA, macOS VoiceOver, and Linux Orca/AT-SPI checks pass the core workflow in packaged builds, including modal focus and file dialogs. Linux checks cover the qualified GNOME Wayland and X11 sessions; compilation or browser-only checks do not count as this evidence. Actual qualification results remain pending until recorded.
- Light/dark/system, enlarged text, reflow/zoom, reduced motion, and high contrast retain access to all required actions.
- Permission-denied clipboard/filesystem cases produce visible recovery and do not crash the reader.
- Linux clipboard, native-dialog cancellation/focus return, system font/display scaling, and high-contrast behavior are exercised on the release matrix without a separate Linux presentation implementation or new UI dependencies.
- Actual native close tests cover clean close, Save, failed-save retention/retry, Discard, Cancel and repeated requests without losing a draft or rolling back committed autosaves. Test macOS application-level quit paths separately; a passing X11 window-close check cannot qualify them.

## Optional enhancements and future boundaries

The required list above is the V1 bar, including note autosave with truthful durability feedback and explicit Save, on Windows, macOS, and qualified Linux environments. Additional shortcuts and broader personal-note sort/filter controls are optional refinements. Reading plans, rich text, arbitrary text-range annotations, sermons, service workspaces, commentaries, parallel editions, advanced search, AI, accounts, synchronization, telemetry, and platforms beyond these three desktop targets follow the milestones in [ROADMAP.md](ROADMAP.md). Do not add placeholder architectures or nonfunctional controls for them during the reader phase.

V1 completion additionally requires the content-rights, corpus integrity, performance, accessibility, backup recovery, and platform packaging/integrity gates defined in [MVP_SCOPE.md](MVP_SCOPE.md), [TESTING_STRATEGY.md](TESTING_STRATEGY.md), and [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md).
