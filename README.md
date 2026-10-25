# Afaan Oromo Bible

An offline-first React/TypeScript and Tauri 2 application for Windows, macOS and Linux. Start with the [documentation index](docs/README.md); the [roadmap ends with the concrete Phase 1 implementation plan](docs/ROADMAP.md#phase-1-implementation-plan).

Project repository: [zdevzone/afaan_oromo_bible](https://github.com/zdevzone/afaan_oromo_bible).

## Current status

All 17 requested development documents are established. The shared four-process native UI journey reads/searches, saves a bookmark, whole-verse yellow highlight and 22 px preference, then verifies a linked note can be detached and reattached across native restarts. The native journey also checks that platform-specific Ctrl/Command+F opens app search from the reader but does not change a hidden panel while a dialog is open. These checks pass locally in the Ubuntu native UI harness and are wired into the Ubuntu, Windows x64 and macOS arm64/x64 CI matrix; hosted results remain pending. The current internal Ubuntu `.deb` also passed installed full-record backup failure/retry and offline uninstall/reinstall profile preservation. Phase 2 implementation includes the required reader and annotation/settings/recovery paths plus a reproducible 66-book OOCS technical import. The app remains an internal development scaffold: the OOCS pack is not approved for distribution, fluent Oromo UI/search review is incomplete, and Phase 3/4 platform, intended-reader, beta and release gates remain open. Local Linux evidence uses Ubuntu 24.04.5 under Xvfb/Openbox on a WSL2 host; the required Ubuntu GNOME sessions, Windows/macOS native hosts and hosted CI runs are not yet qualified.

This is an **internal development scaffold**, not V1.0. Every included reading sentence is labeled **synthetic test content — not Scripture**. The uploaded Biblica® Open Oromo Contemporary Scriptures 2024 USX archive has passed structural inspection and contains a CC BY-SA 4.0 notice; its reported download source is Library.Bible. The [source assessment and checksum inventory](tools/scripture/inspection/oocs-2024/README.md) are preserved for local development. The original source now resides in ignored `content/sources/`; source-preserving USX parsing, verse-unit projection, typed chapter trees and an ignored technical SQLite pack pass against its exact hash. Exact catalog correspondence, intended-audience review, final-render equivalence, production content approval, fluent Oromo wording, and purchased component source access remain verification gates. No approved production Scripture pack is implemented. No AI, server, account, synchronization, rich editor, or sermon system is included.

The development environment now has **Vite+ 1.3.0**, **Node 24.19.0**, **pnpm 10.20.0**, and **Rust/Cargo 1.90.0**. Dependencies are installed, `pnpm-lock.yaml` and `src-tauri/Cargo.lock` were resolved by the actual tools, and Varlock generated `env.d.ts`. Toolchains and caches are session-local under ignored `.tooling/`; they are not part of the application source.

Current Linux checks recorded 2026-10-25: `vp check`, `vp run typecheck`, and `vp test` pass (120 passed, 3 skipped); fresh source importer outputs match the recorded OOCS verification outputs byte-for-byte. The following table is a historical 2026-10-20 platform baseline; later platform-specific evidence and its limits are recorded in the dated checkpoints below and in the roadmap:

| Check                                                        | Result and limit                                                                                                                                                                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vp run typecheck` and `vp check`                            | Pass; formatting, lint and type checks are clean.                                                                                                                                                                                                   |
| `vp test`                                                    | 71 tests pass across domain, search/content integrity, IndexedDB transactions, note-save behavior and close-guard races/failures.                                                                                                                   |
| `vp build`                                                   | Browser fixture build passes.                                                                                                                                                                                                                       |
| `APP_TARGET=tauri vp build --outDir .tooling/tauri-renderer` | Renderer build passes; fixture text and browser storage adapter are absent from its output. This does not compile or launch the native application.                                                                                                 |
| Invalid `APP_TARGET` build                                   | Varlock rejects it as expected.                                                                                                                                                                                                                     |
| Chromium browser journeys                                    | Both development journeys pass after the close-guard change. The earlier built-app run repeats each five times: 10/10 pass, including committed note deletion followed by reload.                                                                   |
| Headless Rust SQLite tests                                   | 12/12 pass, including read-only content, FTS5 search, transactional failure handling and note anchors.                                                                                                                                              |
| Rust formatting and Clippy                                   | Pass for headless targets with and without `development-content`.                                                                                                                                                                                   |
| Ubuntu native build and offline smoke                        | Embedded Tauri debug build passes on Ubuntu 24.04, GTK 3.24.41 / WebKitGTK 2.52.6. An offline Xvfb/Openbox run passes reading, keyboard/dialog focus, bridge navigation, exact native clipboard copy, phrase search, note save and process restart. |
| Native unsaved-note window close                             | A separate offline native run passes Cancel/Escape with draft and focus retention, Discard, failed Save under a real SQLite write lock, successful retry, persisted-text recovery and clean Alt+F4 close.                                           |

The browser checks cover reference/bridge navigation, phrase search, saved linked notes, reload, passage reopening and durable deletion. Light/dark and narrow layouts were inspected; automated checks found no page errors or horizontal document overflow. These checks do not constitute a full accessibility audit.

2026-10-24 local checkpoint: `vp check`, all 87 frontend tests, the Tauri renderer build, 12 Scripture importer tests and the local full-corpus TypeScript chapter check pass. Local real-source renderer checks cover Matthew 2's bridge and footnote plus all 176 selectable Psalm 119 verse units. Rust deserializes the technical pack's 66 books and 1,189 chapters into the native DTOs and passes repository list/get/search calls against it. Its provisional FTS5 projection agrees across Python, JavaScript and Rust for all 31,102 verses; two builds are byte-identical. Whole-verse highlights now persist in browser and native storage; a Chromium color/reload/remove journey passes in an Ubuntu test container. Shared backup validation and browser/native recovery-backed replacement pass local transaction and rollback tests. A browser export/preview/confirmed restore/reload journey passes in Chromium. An embedded Ubuntu Tauri build and offline Xvfb/Openbox native backup smoke now pass the real save/open dialogs, confirmed replacement and recovery copy: a committed 22 px preference is exported, changed to 24 px, then restored to 22 px while the recovery JSON retains 24 px. Evidence is in `.tooling/linux/backup-smoke-008/`. This does not qualify GNOME, packages, other OSes or failure cases. The technical pack remains ignored and marked `technical_only`; the public packaging guard still rejects it.

The annotation and backup storage changes use a fresh browser development database and native development schema version 4. Existing native development databases with an earlier schema are rejected without deletion; testers must explicitly reset a disposable development profile after preserving any useful drafts.

The offline About view now shows the current edition identity, revision, book list, attribution and license notice, the app version, backup location behavior, and the bundled shadcn/ui MIT notice. It labels the development fixture as synthetic. A rebuilt Ubuntu Tauri window displayed the notice with networking disabled and repeated the backup round trip; see `.tooling/linux/backup-about-smoke-005/`. The full third-party dependency notices still need a release inventory.

The ignored technical USX pack now carries exact source title, rights-holder name, language variety, source completion date and archive SHA-256 from `metadata.xml`. A fresh 66-book rebuild retains `technical_only`, passes SQLite integrity and the TypeScript/Rust edition contracts. The About view can display these source fields when an approved pack supplies them; publisher/publication approval and full third-party notices remain open.

The native production repository now resolves a fixed packaged content resource and validates an approved manifest, SQLite hash/status, edition identity and required tables before exposing Scripture. Personal `user.sqlite` remains accessible when content is missing or invalid; missing/technical/tampered content still cannot be read. The explicit release overlay checks `content/distribution/` before bundling and currently fails closed because no approved manifest is present. This is a code path and package gate, not content permission, clean-install evidence or release readiness.

Linux native evidence now exists: the Ubuntu 24.04 test container builds and launches the actual Tauri application with embedded assets and networking disabled. The AT-SPI harness verifies accessible labels, text, selected-verse states, Tab/Shift+Tab order, modal focus containment and Escape/focus return; a separate X11 client verifies all 157 characters of the copied fixture quotation. The native SQLite database passes `integrity_check`; a second application process recovers the exact linked note and chapter-2 position after termination following committed writes. Reports and screenshots from the passing run are in `.tooling/linux/smoke-005/`; the [native test guide](tools/linux/README.md) explains how to reproduce it.

The native window-close guard is implemented and verified in `.tooling/linux/close-002/` across three processes (1101 → 1209 → 1292). Save waits for durable storage; a real store-busy failure leaves the window and draft available. Discard retains committed autosaves, and Cancel resumes editing/autosave. The test sends actual Openbox Alt+F4 requests; successful paths do not use SIGTERM. The [Linux guide](tools/linux/README.md#test-the-native-unsaved-note-close-guard) explains reproduction and the distinction from crash recovery.

2026-10-24 regression checkpoint: application-level Quit now enters the same guard and requires one explicit native exit approval after Save or Discard. `vp check`, `vp test` (73/73), `pnpm run typecheck`, pinned `cargo fmt --check`, 12/12 headless Rust tests, `APP_TARGET=tauri vp build`, Ubuntu desktop `cargo check` and an embedded debug Tauri build pass. Offline Ubuntu Xvfb/Openbox runs `reader-20261024` and `close-20261024-fallback` pass, including process restart and the full Alt-F4 Save/Discard/Cancel failure/retry sequence. The close harness now verifies `_NET_WM_PID` when its X11 title fallback is needed. These Linux results do not qualify macOS application Quit.

2026-10-25 native UI automation checkpoint: a test-only Tauri build with the embedded WebDriver server and command bridge passed a four-process real-window read → search → linked-note save → detach/restart → relink/restart journey in the Ubuntu desktop image. The CI matrix schedules that same test on Ubuntu, Windows and both macOS architectures. The test build uses a separate native profile, and the normal Tauri renderer build excludes the test bridge, verified by the release renderer gate. The latest local suite passes 120 frontend tests (three skipped), 32 headless Rust tests (three ignored), 27 importer tests and 14 Chromium journeys, including malformed-backup rejection without data replacement and System theme/layout persistence. Hosted platform runs remain pending because these changes are uncommitted.

2026-10-25 keyboard shortcut correction: Ctrl/Command+F and Ctrl/Command+K now ignore events originating in text controls, dialogs, menus and listboxes, keeping the global reader shortcuts in reader context. The focused Chromium command `vp exec playwright test tests/e2e/keyboard.spec.ts --grep 'reader shortcuts do not change'` passed (1 test) in the Ubuntu 24.04.5 x86_64 browser-test image with networking disabled. The native four-process journey passed using `vp run desktop:native-test-build` and `dbus-run-session -- vp run test:native-ui` in Ubuntu 24.04.5 x86_64 with Xvfb/D-Bus. The host was Linux 6.18.54.1-microsoft-standard-WSL2 x86_64. Both used the shared implementation; native hosted Windows/macOS checks and real GNOME sessions remain pending.

**Phase 1 remains open.** This evidence uses Xvfb/Openbox on X11, with a virtual-display compositing workaround confined to the test runner. Ubuntu GNOME X11/Wayland, manual Orca, `.deb` installation, Windows/macOS native checks and release signing/verification remain pending. Application-level Quit now routes through the Save/Discard/Cancel guard in code; macOS Command-Q, application-menu Quit and Dock Quit still require real native qualification. The outer Debian 13 workspace has no system GTK/WebKit installation; its Ubuntu container supplies the native build and test environment.

2026-10-24 current worktree check: `vp check` passes across 125 files; `vp test` passes 119 tests with three skipped. The 12 Chromium accessibility, keyboard, reader, annotation and backup journeys pass in the Ubuntu browser-test container with networking disabled. An `APP_TARGET=tauri` renderer rebuild passes the release renderer verifier after splitting browser and native composition; synthetic fixture strings and IndexedDB are absent from that output. The native Rust suite passes 32 tests with three ignored, including atomic backup replacement/preservation. These local checks do not establish Windows/macOS native windows, GNOME/Orca, approved content, signing or final packages. The latest hosted workflow run is still the older `5f346a1` commit; the current worktree has not been pushed and has no corresponding hosted result.

Linux is included in V1 scope. The proposed first qualification target is **Ubuntu 24.04 LTS x86_64 with GNOME**, using a `.deb` package. This is a target to test, not a claim of working support today. Other distributions, desktop environments and ARM devices need separate qualification; an AppImage is optional later packaging work. The same React/Tauri application and SQLite adapters serve all three operating systems. See the [release matrix](docs/RELEASE_STRATEGY.md) for the owning platform and distribution decisions.

The [first hosted native CI run](https://github.com/zdevzone/afaan_oromo_bible/actions/runs/39460355228), at source commit `12e66601e58dbdc212c496efb9c3285dd39d56bf`, passes all five jobs: frontend checks and native builds on Ubuntu 24.04 x64, Windows Server 2022 x64, macOS 15 Apple silicon and macOS 15 Intel. The frontend passes 71 tests and both Chromium journeys; each native target passes 12 SQLite tests and embedded debug compilation. The [workflow](.github/workflows/native-checks.yml) uses pinned Vite+/Node/Rust, frozen lockfiles and dependency caches. It does not launch a desktop window, publish binaries, sign packages or establish supported-OS qualification. See [the automated-check scope](docs/TESTING_STRATEGY.md#automated-build-checks) for its limits.

## Development

Check `vp --version` before installing the global CLI. Use the [official Vite+ installation instructions](https://viteplus.dev/guide/). Keep the project-local version and matching core override; do not substitute plain Vite. The committed JavaScript and Cargo graphs have been installed/resolved on this Linux host; clean installations on the supported Windows, macOS and Linux matrix remain part of native validation.

After Vite+ is available:

```sh
git clone --branch codex/project-foundation https://github.com/zdevzone/afaan_oromo_bible.git
cd afaan_oromo_bible
vp install --frozen-lockfile
vp exec varlock codegen
vp run typecheck
vp check
vp test
vp dev
```

The foundation is currently on the branch above in [draft PR #1](https://github.com/zdevzone/afaan_oromo_bible/pull/1). After it merges, use the default branch. Open `http://127.0.0.1:1420`. Browser storage is development-only and may be cleared by the browser. Use the first sample reference shown in the reference entry field; search examples include `reading`, `"careful reading"`, `rea*`, and the Unicode fixtures documented under [scripture tooling](tools/scripture/README.md).

For an existing local clone, commit or stash local edits, then run:

```sh
git fetch origin
git switch codex/project-foundation
git pull --ff-only origin codex/project-foundation
vp install --frozen-lockfile
vp dev
```

Local development needs Git, Vite+ and the pinned Node toolchain. Desktop development additionally needs Rust and the platform prerequisites below. The cloud-only `.tooling/session-env.sh`, installed dependencies, build outputs and local databases are not required repository inputs; install tools on your own machine. Keep your original `text-4d4cf8432222fef3-299488.zip` separately, or under ignored `content/sources/`, and verify it against the recorded SHA-256 before importer work. The uploaded archive, cloud test profiles and personal data are not included in the clone. Read [AGENTS.md](AGENTS.md) and the [current roadmap](docs/ROADMAP.md) when resuming implementation.

In the current managed workspace, load the installed tools before running these commands:

```sh
. /workspace/.tooling/session-env.sh
```

`.env.schema` is the source of truth for Varlock configuration. `APP_TARGET` is public and defaults to `browser`; no secret or cloud configuration is required. `varlock codegen` produces `env.d.ts`. Do not handwrite a fake generated file or bundle credentials. `vp build` creates an internal browser fixture build, not an approved public release.

For browser journeys after installing the test browser:

```sh
vp exec playwright install chromium
vp run test:e2e
```

By default Playwright starts `vp dev`. To test the built browser fixture app, run `vp build`, start `vp preview` in one terminal, then run `vp run test:e2e` in another with port 1420 free of other servers. Outside CI, Playwright reuses that preview server. Set `PLAYWRIGHT_OUTPUT_DIR` to place traces and result files outside the default ignored `test-results/` directory. The deletion journey waits for the confirmation dialog to close after transaction commit before reloading; hidden background roles are not a save acknowledgment.

## Native development

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) on each host. Rust 1.90.0 is pinned and has compiled the headless SQLite repository tests. The desktop feature and platform dependencies still require target-host verification. Each operating system needs its own native acceptance evidence.

Linux development requires GTK3 and WebKitGTK 4.1 plus the distribution's build dependencies. For Debian/Ubuntu, the official setup is:

```sh
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

These commands describe setup on a Linux host. In this managed workspace the dependencies are installed in the Ubuntu development container instead; see [tools/linux](tools/linux/README.md) for its Dockerfile, mounted toolchains and isolated desktop runner. End users install the packaged application and its declared system runtime dependencies; they do not need Rust, Node or Vite+. A `.deb` may fetch missing dependencies during installation, so offline reading and completely disconnected installation are separate acceptance checks.

```sh
vp run desktop:dev
```

The wrapper sets the Varlock-managed public renderer target to `tauri` before Tauri starts the same React application. It explicitly enables the `development-content` Cargo feature. The Rust layer prepares a checksum-named synthetic database and then opens it read-only; user records live in a separate development data directory. Native failures never switch to IndexedDB. Use the wrapper instead of launching Tauri with a browser-configured renderer.

Original development PNG/ICO assets satisfy Tauri's icon-file requirements even while bundling is disabled. They are placeholders; final production artwork and packaging remain release work.

Tauri automatically merges `src-tauri/tauri.linux.conf.json` on Linux. It selects the planned `.deb` format; the shared configuration still disables bundling during internal development. No second application, new JavaScript dependency, or Linux-specific persistence layer is introduced. Build Linux release artifacts on the oldest qualified distribution; this Debian 13 workspace does not establish Ubuntu 24.04 binary compatibility. See [Tauri's Debian packaging guidance](https://v2.tauri.app/distribute/debian/).

An Ubuntu 24.04 **internal synthetic** debug `.deb` has been built and installed offline in a separate Ubuntu runtime container with GTK/WebKit preinstalled. Its installed binary passed linked-note/restart; removing and reinstalling the package retained the user database and reopened the note. The package is unsigned, contains development fixture code, and does not satisfy the production content or GNOME/Wayland/Orca release gates. See [the Linux package smoke evidence](tools/linux/README.md#limits-and-remaining-qualification).
The same installed binary also passed a fresh-profile native About and backup/restore dialog smoke, including a durable pre-restore recovery file and SQLite integrity check.

SQLite repository tests run without the GTK desktop feature:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --features development-content
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```

`vp run desktop:check` is an internal embedded debug compilation using test content, without packaging, and with Cargo's lockfile enforced. `vp run public:build` selects the release-only Tauri overlay and checks the approved content manifest before bundling; it currently fails because that manifest is absent. Passing this mechanical gate does not itself establish distribution permission or release qualification. Required Windows/macOS/Linux native checks, accessibility review, platform-appropriate artifact verification and real-content validation remain open.

## Working rules

Read [AGENTS.md](AGENTS.md) before changing code. Before the first public V1.0 release, refactor directly, reset explicitly disposable development data, and remove obsolete implementations. Do not add historical development migrations, compatibility shims or deprecated alternatives. Public V1.0 starts the user-data preservation/migration obligation.

Shadcnblocks Pro is the primary UI resource. The public catalog and underlying Radix-based shadcn/ui source were consulted; purchased component source was unavailable here. The initial shell uses those underlying primitives, with provenance in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Review actual licensed source before replacing or extending these compositions.

Next, in order:

1. Preserve the passing cross-platform build matrix. Repeat the passing Linux native slice and close guard in the proposed Ubuntu/GNOME target's Wayland and X11 sessions, including manual Orca review. Use the [Ubuntu container guide](tools/linux/README.md) for fast Linux build/smoke iteration here.
2. Prepare Windows/macOS hosts, demonstrate their native loops and close decisions, and test the separate macOS application-level quit paths. Keep Phase 1 open until those platform gates pass.
3. Continue the [OOCS 2024 source assessment](tools/scripture/inspection/oocs-2024/README.md): retain the Library.Bible acquisition record and supplied notices, confirm the exact edition/audience and catalog correspondence, review representative real-source rendering and paragraph whitespace, then approve real Oromo search cases and final equivalence checks. Provide the purchased Shadcnblocks source through an appropriate private resource and review its exact terms.
4. Continue the technically independent Phase 2 reader, content review and remaining required V1 work in the [roadmap](docs/ROADMAP.md), while keeping its acceptance gates open until the real content and fluent reviews are complete. AI and synchronization remain later work.
