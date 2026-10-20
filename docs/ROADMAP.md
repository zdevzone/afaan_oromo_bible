# Roadmap and implementation handoff

Status: adopted milestone plan, 2026-10-19; execution checkpoint updated 2026-10-20. The documentation baseline is established and authorized Phase 1 development is underway. Phase numbers indicate sequence, not calendar estimates. Each phase ends with reviewable evidence; installed tools, a renderer build or headless SQLite tests do not establish native or release readiness.

Windows, macOS, and Linux are required V1 targets. The proposed initial Linux qualification is Ubuntu 24.04 LTS x86_64 with GNOME, with `.deb` as the primary package; other distributions and Linux ARM are not yet promised. Support floors remain proposed pending target tests. Packaging requirements and the final qualification matrix are owned by [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md).

## Delivery sequence

| Phase                           | Outcome                                                                                       | Main dependency                                                    | Exit evidence                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 0 — Foundation and decisions    | Coherent documents, toolchain inventory, repository boundary and rights/component registers   | User brief and actual environment                                  | Required docs agree; chosen tools verified or blockers recorded; no real Scripture/paid source assumed  |
| 1 — Vertical slice              | One React read → navigate → search → note → restart loop, browser and early Tauri integration | Phase 0 architecture; synthetic fixtures allowed                   | Browser loop and real Tauri SQLite/restart loop pass on Windows/macOS/Linux; remaining checks stay open |
| 2 — Complete reader and content | Authorized full corpus, required reading/annotation/settings features and portable recovery   | Edition/audience/rights approval                                   | Full required feature scenarios pass; corpus integrity reports and backup round-trip available          |
| 3 — Reliability and beta        | Accessible, durable, fast application validated with intended readers                         | Phase 2 complete; target hardware and reviewers                    | Failure tests, fluent review, benchmarks and platform beta checks pass; no release-blocking defects     |
| 4 — V1.0 release                | First verified public production packages for Windows/macOS/Linux                             | All V1 gates, rights, signing/integrity and support matrix cleared | Reproducible artifacts, verified notices/installation, versioned user schema and recovery instructions  |

The critical path is not purely code: content permission/audience review, licensed component access, fluent Oromo review and target-platform signing/validation must progress alongside engineering. An unresolved external dependency does not justify implementing unrelated future features.

## Phase 0 — Foundation and decisions

1. Read the original brief and current user instructions; adopt Vite+ and Varlock, the one-app adapter architecture and the strict pre-V1 compatibility policy.
2. Complete the 17 requested documents and index them in [README.md](README.md). Resolve contradictions before dependent code. The owning documents establish the repository, schema, UI, tests and release boundaries.
3. Inspect `vp` globally before installing it, as requested. Record executable path/version and the selected project-local `vite-plus` version. Verify Node, the package manager, Rust, Cargo, rustup, target toolchains and native prerequisites independently; having Node or Tauri CLI does not prove Rust exists.
4. Review official tool instructions for Vite+/Varlock/Tauri compatibility. Pin verified versions and one lockfile. Do not silently replace Vite+ with Vite or claim Rust/target support without command evidence.
5. Create the content permission register and component inventory using the owning documents. Confirm the actual paid Shadcnblocks source before adapting a paid component; identify any missing access explicitly.
6. Define a conspicuously synthetic non-Scripture fixture with representative structure. Keep actual publisher text out until authorized.

Exit: the architectural baseline is coherent and reviewable; unresolved choices have owners and deadlines. Tool/platform gaps are documented with a next action. Begin the Phase 1 tasks at the end of this document; do not delay an independent browser slice merely because a release signing identity is unavailable.

## Phase 1 — Vertical slice

Build a small end-to-end loop before expanding features. Implement one application shell, one fixture library, book/chapter and reference navigation, basic word/phrase search, and plain standalone/linked notes. Use native integration now to expose path, IPC, SQLite, FTS5, WebView and packaging assumptions while the surface is small.

The final section is the exact ordered handoff. Phase 1 does **not** require a licensed full corpus, backups, highlights, every preference, rich text or AI. It does require honest synthetic labeling, storage error handling, save acknowledgment, and no silent native-to-browser fallback. A browser-only success is partial Phase 1, not a completed desktop proof.

### Current checkpoint — 2026-10-20

| Evidence                      | Current result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend foundation           | Dependencies installed; type checking, Vite+ checks, browser renderer build and Tauri renderer build pass. Varlock rejects an invalid target. A Tauri renderer build produces web assets; it does not compile or launch the desktop application.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Behavior and repository tests | Current frontend verification passes 71 unit/hook tests across six files. The earlier 48-test frontend checkpoint, 12 headless Rust SQLite tests, Rust formatting and headless Clippy remain historical evidence. The headless Rust tests use `--no-default-features --features development-content`; they do not themselves exercise a WebView or desktop close dispatch.                                                                                                                                                                                                                                                                                                   |
| Browser journey evidence      | The current two Chromium journeys pass. Earlier repeated preview evidence remains 10/10 passing executions across the same two journeys. See [repository status](../README.md) for exact commands and latest outcomes.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Ubuntu native build           | A full Tauri embedded debug native build passes in the Ubuntu 24.04 container with GTK 3.24.41 and WebKitGTK 2.52.6. Rust and JavaScript clipboard plugins were aligned at 2.4.2. This compiles the real native application with embedded renderer assets; it is not a production package or `.deb` qualification.                                                                                                                                                                                                                                                                                                                                                           |
| Offline native journey        | With container networking disabled (`--network none`), Xvfb/Openbox native reading, bridge reference resolution, exact copy, phrase search, linked-note save and SQLite integrity checks pass. A separate `xclip` reader confirms the exact 157-character copied payload. After committed writes, stopping process 733 and launching process 874 restores the note and chapter 2. This is real native-process restart evidence, not a window-close Save/Discard/Cancel test.                                                                                                                                                                                                 |
| Accessibility and rendering   | The native accessible tree exposes labels, text and the selected verse's `PRESSED` state. The combined native run passes Tab/Shift+Tab order, modal focus containment and wrapping, Escape dismissal and focus return. The Xvfb run uses `WEBKIT_DISABLE_COMPOSITING_MODE=1` as a virtual-display rendering workaround; it is not a general Linux runtime requirement. AT-SPI observations do not establish manual Orca or complete accessibility conformance.                                                                                                                                                                                                               |
| Native window-close guard     | The rebuilt embedded Tauri app passes all three reports in the offline Ubuntu 24.04 Xvfb/Openbox run `close-002`. Real window-manager/Alt-F4 requests exercise Cancel default focus and Escape returning to Note text with the draft retained; Discard exits while preserving the committed baseline. A real `BEGIN IMMEDIATE` database lock makes Save fail without closing or losing the draft; Cancel remains usable. Unlocking and retrying Save commits before exit. A third process restores the saved body and clean Alt-F4 exits. The guard pauses editing/autosave, drains active writes and permits explicit main-window destruction only after the chosen action. |
| Remaining native gates        | Windows/macOS native runs, macOS application-level Command-Q/menu/Dock quit handling, and full Ubuntu GNOME X11/Wayland, Orca and `.deb` qualification remain pending. A window-close listener does not cover application-level quit. The container smoke does not establish every Linux distribution, desktop environment or target configuration.                                                                                                                                                                                                                                                                                                                          |
| Content and design inputs     | The fixture is explicitly synthetic. Exact edition permissions, approved content import, fluent Oromo review and purchased Shadcnblocks source access remain open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Phase 1 remains open. Preserve the passing Ubuntu-container reader and window-close checks while completing outstanding target/quit-path evidence before expanding into Phase 2 reader features. The [repository status](../README.md) records exact checks and the [Linux smoke guide](../tools/linux/README.md) explains the harness, artifacts and limits. Content permission and licensed-source acquisition may proceed independently while remaining native hosts are prepared; full Linux qualification is still a V1 release gate.

## Phase 2 — Complete reader and approved content

| Order | Work package                                                                                     | Completion evidence                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 2.1   | Approve exact edition, canon/variety and rights; acquire original structured archive             | Permission register, source checksum, required notices, fluent audience sample review                                            |
| 2.2   | Evaluate USFM parser on source features; implement deterministic JSON → SQLite content pipeline  | Structural fixtures pass, unsupported markers fail/report, exact text and reference integrity report; FTS5 availability verified |
| 2.3   | Import the complete edition; render supplied headings, poetry, footnotes and cross-references    | Source-derived book/chapter/verse-unit counts and reviewed representative passages; no universal verse-count assumption          |
| 2.4   | Complete reading position, controls, themes, locale catalogs and accessible verse selection/copy | Required scenarios pass with English and reviewed Oromo wording; content unchanged by UI locale                                  |
| 2.5   | Add bookmarks, whole-verse highlights and usable note list/edit/delete flows                     | Persisted annotations and notes reopen at correct edition-aware anchors; no async stale-save corruption                          |
| 2.6   | Implement portable user-data export, validation and transactional replacement restore            | Clean-install round-trip and failure-injection tests; explicit confirmation plus pre-restore snapshot                            |
| 2.7   | Add offline content/About/notice screens and production content-build gating                     | Exact attribution available offline; fixtures/browser adapters absent from native release artifacts                              |

Exit: all required V1 feature rows are implemented, full corpus content reports pass, and data recovery works on all three target platforms. Browser tests still support fast iteration but do not replace native acceptance.

## Phase 3 — Reliability and beta

1. Run content-integrity, Unicode/reference, adapter contract and user-data failure tests from [TESTING_STRATEGY.md](TESTING_STRATEGY.md). Exercise crash/restart, concurrent typing/navigation, full/unwritable storage, invalid backups and interrupted restore.
2. Verify the final OS/architecture support matrix, minimum runtime assumptions, Windows WebView2 installation strategy, and qualified Linux WebKitGTK/runtime dependencies. Record first-install internet requirements separately from offline use; follow [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md) for package qualification.
3. Perform keyboard, screen-reader, contrast, zoom and narrow-window checks on Windows, macOS, and the qualified Linux GNOME target; review Afaan Oromo catalogs, aliases and search cases with fluent readers.
4. Benchmark a production build against the authorized full corpus using the hardware and methods in [PRD.md](PRD.md). Record percentiles and corpus/tool versions; address slow or unbounded operations.
5. Conduct formative tests with intended readers using [USER_STORIES.md](USER_STORIES.md). Observe passage navigation during a service-like task and the full note/recovery loop. Prioritize correctness, confusing language and lost focus before cosmetic extras.
6. Test beta packages, platform-appropriate authenticity/integrity and recovery on clean Windows/macOS/Linux machines. Linux qualification is a required beta/release gate. Explain that pre-V1 beta data may be reset; do not promise compatibility or introduce development migrations.

Exit: no known release-blocking data loss, content corruption, required-flow, accessibility or install failures; fluent content/UI review complete; benchmarks evaluated; beta limitations and recovery instructions documented. Optional features cannot substitute for unresolved blockers.

## Phase 4 — First public production release, V1.0

1. Complete every gate in [MVP_SCOPE.md](MVP_SCOPE.md) and [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md), including content permissions and paid-source publication policy.
2. Freeze and identify the first supported user-data schema and backup schema. Commit representative compatibility fixtures for future public-version migration tests. This is the start of compatibility obligations, not a reason to retain pre-release implementations.
3. Build pinned reproducible release candidates for all three targets, apply the signing/notarization and Linux package authenticity/integrity requirements in [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md), and validate final downloaded packages and published hashes.
4. Confirm offline operation and clean install/reinstall behavior from the final artifacts. Publish accurate prerequisites, known limitations, notices, backup/restore instructions and release notes.
5. Distribute through the selected release channel only after final review. A manual installation path with platform-appropriate authenticity/integrity checks suffices; automatic updates are optional.

Exit: V1.0 is publicly available with an authorized edition and tested recovery path. Subsequent public schema changes preserve user data through explicit tested migrations.

## Post-V1 milestones

These are proposed priorities, revisited using real feedback. They do not authorize adding these systems during Phase 1.

| Milestone                                | Candidate outcomes                                                                                                                                               | Prerequisites / release test                                                                                                                                                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 — Editions and comparison foundation | Additional Oromo translations/varieties; separately authorized KJV/NIV or another explicitly selected English edition; edition selection; later parallel reading | Exact edition rights and audiences reviewed individually; V1 anchors preserved; no inferred alignment by array position; explicit versification mappings and unavailable-passage behavior tested before synchronized comparison         |
| 1.2 — Study workspace                    | Rich-text note editing if justified, service notes, sermon outlines/organization, selected commentaries, useful export/print, advanced search                    | Validate actual workflows; preserve V1 plain notes through tested migrations; choose editor only after schema/export evaluation; each study resource separately licensed and distinctly presented                                       |
| 1.3 — Optional AI pilot                  | Selected-note organization and outlining; passage lookup; cautiously evaluated verse-grounded questions                                                          | Approved retrieval sources, exact database quotations, reference/support checks, Oromo fluent/theological evaluation, consent, labeling, provider privacy and operational budgets; disabled/unavailable AI cannot affect offline reader |
| Later — Sync and platforms               | Optional synchronization, additional platforms and other services                                                                                                | Demonstrated demand, identity/privacy/conflict model, sustainable funding and target-platform proof; no silent upload of private notes                                                                                                  |

Multiple editions do not automatically justify parallel reading: add the second edition first, verify reference alignment, then release comparison only when it is honest. AI is a separate opt-in capability, not a reinterpretation of the reader architecture. Its proposed boundary is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Task discipline for AI-assisted development

- Pick the next ordered task whose dependencies are satisfied. Read [AGENTS.md](AGENTS.md) and the owning specification, state the intended result, then implement and verify the smallest useful slice.
- Each handoff records changed files, user-visible behavior, checks run, unresolved target-platform checks and the next concrete task. Do not claim a test passed because code compiles elsewhere.
- Before public V1.0, refactor types/contracts directly, delete obsolete paths, and recreate explicitly disposable development stores. Do not retain deprecated APIs or historical migration chains.
- Do not populate empty future folders, wire fake feature buttons, add a backend, install overlapping UI libraries or expose generic SQL IPC.
- If content/license/source access is blocked, continue with labeled fixtures and structural tests. If native target validation is blocked, keep its check open and state the precise reason while finishing independent browser work.

## Phase 1 Implementation Plan

This is the ordered implementation and verification sequence. The foundation files and slice below now exist; use the checkpoint above to identify remaining work instead of scaffolding a second implementation. File lists describe responsibilities, not evidence that every exit check has passed. Avoid placeholder modules; create a file when its behavior/configuration is implemented. The complete directory responsibilities are in [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md).

### 1. Verify and pin the toolchain

Inspect the global `vp` executable first; install Vite+ if absent using the verified official instructions, as already authorized. Record `vp`, Node, package manager, `rustc`, `cargo` and rustup/toolchain versions plus missing OS prerequisites. Pin a supported Node 24 LTS patch, pnpm 10 patch selected through Vite+, project-local `vite-plus`, and compatible dependencies in the lockfile. Any Rust installation/prerequisite step is explicit and its result recorded; do not claim Windows/macOS verification from a Linux shell or Linux native readiness from headless tests.

Create: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (matching Vite+ aliases/overrides), `.node-version`, `rust-toolchain.toml`, `.gitignore`, `README.md` and root `AGENTS.md` pointing to `docs/AGENTS.md`.

Use this initial dependency inventory; pin verified compatible versions rather than copying speculative version strings:

| Set                 | Packages                                                                                                                                         | Purpose                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime             | `react`, `react-dom`, `@tauri-apps/api`                                                                                                          | One UI and typed native bridge                                                                                                          |
| Build/types         | `vite-plus`, `@vitejs/plugin-react`, `typescript`, `@types/node`, `@types/react`, `@types/react-dom`                                             | Vite+ build/check/test with React and strict types                                                                                      |
| Styling/config      | `tailwindcss`, `@tailwindcss/vite`, `varlock`, `@varlock/vite-integration`                                                                       | Shared design tokens and validated public environment                                                                                   |
| Desktop tooling     | `@tauri-apps/cli`                                                                                                                                | Early native development/build commands                                                                                                 |
| UI as actually used | `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-slot`, `@radix-ui/react-dialog`, `@radix-ui/react-select`, `lucide-react` | Actual chosen shadcn primitives/compositions; omit unused packages                                                                      |
| Tests as introduced | `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `@playwright/test`                                                             | User interactions and meaningful end-to-end/adapter verification; use Vite+'s test runner rather than a second direct test-runner stack |
| Rust                | `tauri`, `tauri-build`, `rusqlite` with bundled SQLite, `serde`, `serde_json`                                                                    | Narrow command boundary, SQLite/FTS5, typed serialization                                                                               |

Do not install a router, global state manager, ORM, SQL plugin, rich editor, AI SDK or backend. Add native clipboard/file-dialog capabilities when their real feature starts, not speculatively.

Exit check: local Vite+ resolves; version evidence and reproducible install are recorded; Rust availability and native prerequisites are stated accurately.

### 2. Create one accessible application shell

Create `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `.env.schema`, generated `env.d.ts`, `components.json`, `src/main.tsx`, `src/app/App.tsx`, `src/styles/globals.css`, `src/lib/utils.ts`, and `src/locales/en.ts`.

Configure React, Tailwind and Varlock through the verified Vite+ interfaces. Keep all frontend values public and non-secret. Use a stable development port shared with the Tauri configuration; validate missing/invalid configuration at startup/build. Do not add fictional API credentials.

Inspect the actual Shadcnblocks source/documentation inventory first. Build a Scripture-centered header/sidebar/reader layout using suitable licensed source when accessible, or the appropriate underlying shadcn primitives with that access gap documented. Initial `src/components/ui/button.tsx`, `input.tsx` and `textarea.tsx` are styled accessible primitives, not native-browser-looking substitute widgets. Add dialog/select only when used. No invented paid block names or claims that unavailable paid source was incorporated.

Exit check: `vp dev` renders one responsive workspace with light/dark tokens, semantic landmarks, visible focus and an obvious synthetic-development-content notice. `vp check` and `vp build` run with the configured environment.

### 3. Define the current domain and synthetic fixture

Create `src/domain/scripture.ts`, `src/domain/notes.ts`, `src/domain/ports.ts`, `content/fixtures/manifest.json`, `content/fixtures/sample.json` and `tools/scripture/README.md`.

Define edition/book/chapter/verse-unit/reference identities and plain notes with optional edition-aware anchors. Implement only the port operations used in this slice; the broader target contracts are described in [ARCHITECTURE.md](ARCHITECTURE.md). Fixture text must be clearly invented test sentences, not plausible invented Bible verses. Include at least two books, adjacent chapters, prose/poetry structure, a heading, a footnote/cross-reference, a bridged/subverse-label case, and Oromo Unicode/apostrophe search cases. These test labels have no implied canonical mapping or content rights.

Exit check: fixture validation rejects duplicate identities and invalid anchors, preserves source labels/order, and confirms the manifest is synthetic. Document how fixtures are blocked from public production packaging; a development bundle must not be mistaken for a distributable Bible edition.

### 4. Implement browser read/navigation/search

Create `src/adapters/browser/fixtureLibrary.ts`, `src/services/reference.ts`, `src/services/search.ts`, `src/features/reader/ReaderContent.tsx`, `SearchPanel.tsx`, and the browser branch of `src/app/createServices.ts`. Compose the reference entry form in `src/app/App.tsx`; extract it only when the resulting feature boundary earns a separate module.

Load one chapter at a time. Implement book/chapter selection, adjacent chapters, documented alias/reference resolution, word and quoted-phrase search, a book filter, contextual results and result-to-verse navigation. Render structured content as React elements. Derived search normalization never alters displayed fixture text. Empty/invalid/no-result/loading/error states are functional, not placeholders.

Exit check: a keyboard user can load, navigate and search the fixture; malformed references/queries preserve the current passage; a search result opens the correct verse. Focused reference/normalization tests verify behavior rather than mirroring implementation.

### 5. Implement the browser note → restart loop

Create `src/adapters/browser/indexedDbUserStore.ts`, `src/features/notes/NotesPanel.tsx` and `useNoteWorkspace.ts`; extend `createServices.ts` to inject the browser ports. Keep draft/save state, latest-buffer checks and close pause/drain operations in the focused hook and presentation in the panel. Browser `beforeunload` remains a browser-only warning.

Use a minimal IndexedDB schema for the current note operation and reading position. Support a standalone note and a selected-verse-linked note, list/reopen, edit and explicit delete. Generate UUIDs, persist UTC timestamps, serialize saves per note and show saved only after commit. Keep drafts and actionable errors on failure. Restore reading position and notes on reload. No rich editor, generic persistence framework or historical migrations.

Exit check: complete read → navigate → search → linked note → saved → close/reload → reopen. A meaningful test covers durable note round-trip and an injected write failure, including the truthful saved indicator and retained draft.

### 6. Integrate Tauri and SQLite immediately

Create `src-tauri/Cargo.toml`, generated `Cargo.lock`, `build.rs`, `tauri.conf.json`, the automatically merged `tauri.linux.conf.json` `.deb` override, required RGBA `icons/icon.png` and Windows `icons/icon.ico`, `capabilities/default.json`, `src-tauri/src/main.rs`, `lib.rs`, `storage.rs`, and `src/adapters/tauri/library.ts`, `userStore.ts`, `window.ts`. Development icons do not establish the final production identity. Extend the sole composition root with explicit native selection through the supported Tauri API; it must not fall back to browser storage on failure. Register the prevented window-close port before editable UI mounts, and compose its Save/Discard/Cancel flow in `src/app/useWindowCloseGuard.ts`. Scope explicit destruction to the main window; separately qualify application-level quit paths.

Register only narrow operations used by the loop: list books, get chapter, resolve/search through the agreed query contract, list/save/delete notes and get/save reading position. Rust owns app-local paths, validates inputs, opens fixture content read-only and commits user writes transactionally. Seed/build a local synthetic development SQLite pack through a controlled development-only path; no runtime USFM downloader. Verify FTS5 on the bundled SQLite build and parameterize parsed queries. Keep user records separate from content and bind no shell/arbitrary-file/generic-SQL capabilities.

Exit check: `vp run desktop:dev` starts where native prerequisites are available; its wrapper selects the Tauri renderer target and explicitly enables development content. The same React loop saves to SQLite and survives native restart. Verify a content write fails, user writes commit, malformed IPC inputs fail safely, and a native initialization failure never opens IndexedDB. Run actual Windows/macOS/Linux Tauri target tests before marking the native proof complete. Record each host's evidence separately and leave unavailable target checks pending.

### 7. Verify and hand off the slice

Run `vp check`, `vp test` for introduced meaningful behavior, `vp build`, the browser loop, appropriate Rust checks and available Tauri smoke checks. Use shared fixtures/contract cases for adapter parity; do not add low-value snapshot tests for every styled component. Add tests under `tests/contracts/` and `tests/e2e/` only when exercising real cross-module behavior. An internal browser or native development build may use fixtures; every public production build must reject unapproved synthetic content. Native development explicitly enables the `development-content` Cargo feature; production builds omit it and run the content-clearance gate.

Record exact commands, outcomes, tool versions, missing platform dependencies, UI-source access gaps and pending Windows/macOS/Linux evidence in the repository status. The Phase 1 exit is a demonstrable browser loop plus actual native SQLite integration on each required target, with no claim that a test on an unavailable target passed.

Finish the remaining Phase 1 work in this order:

1. Preserve the passing Ubuntu-container reader, keyboard-focus and actual window-close checks while native behavior changes. Rerun the offline read → reference bridge → exact copy → phrase search → linked note → saved → process restart loop plus Cancel/Escape, Discard, locked-database Save failure/retry and clean close. Retain separate clipboard and SQLite evidence; the [Linux guide](../tools/linux/README.md) describes embedded builds, isolated profiles and the Xvfb-only rendering workaround.
2. Prepare Windows/macOS hosts and demonstrate the equivalent real Tauri loop, including close/save handling. macOS Command-Q, application-menu Quit and Dock Quit require separate native handling/qualification; the window listener does not establish protection for them. Continue Linux qualification on Ubuntu 24.04 LTS x86_64 GNOME in X11 and Wayland sessions with Orca; `.deb` installation and dependency/recovery checks remain release gates under [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md). Record each platform's passed and pending checks separately. Linux container evidence does not satisfy Windows/macOS or full Linux desktop/package qualification.

After the Phase 1 gates pass and content rights/source approval is established, begin the Phase 2 authorized-content importer and reader completeness. Continue rights/source acquisition in parallel; do not switch to AI, cloud sync or sermon tools.
