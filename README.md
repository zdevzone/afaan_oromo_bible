# Afaan Oromo Bible

An offline-first React/TypeScript and Tauri 2 application for Windows, macOS and Linux. Start with the [documentation index](docs/README.md); the [roadmap ends with the concrete Phase 1 implementation plan](docs/ROADMAP.md#phase-1-implementation-plan).

Project repository: [zdevzone/afaan_oromo_bible](https://github.com/zdevzone/afaan_oromo_bible).

## Current status

All 17 requested development documents are established. Phase 1 source development has begun: a shared reader workspace, synthetic structured content, book/chapter and reference navigation, bounded search, whole-unit selection/copy, standalone and passage-linked plain notes, reading preferences, browser IndexedDB persistence, and narrow Tauri/Rust SQLite adapters.

This is an **internal development scaffold**, not V1.0. Every included reading sentence is labeled **synthetic test content — not Scripture**. The initial Bible edition, its distribution rights, fluent Oromo wording, and purchased component source access are still verification gates. No AI, server, account, synchronization, rich editor, or sermon system is included.

The development environment now has **Vite+ 1.3.0**, **Node 24.19.0**, **pnpm 10.20.0**, and **Rust/Cargo 1.90.0**. Dependencies are installed, `pnpm-lock.yaml` and `src-tauri/Cargo.lock` were resolved by the actual tools, and Varlock generated `env.d.ts`. Toolchains and caches are session-local under ignored `.tooling/`; they are not part of the application source.

Verification recorded on Linux, 2026-10-20:

| Check                                                        | Result and limit                                                                                                                                                                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vp run typecheck` and `vp check`                            | Pass; formatting, lint and type checks are clean.                                                                                                                                                                                                   |
| `vp test`                                                    | 48 tests pass across domain, search/content integrity, IndexedDB transactions and note-save behavior.                                                                                                                                               |
| `vp build`                                                   | Browser fixture build passes.                                                                                                                                                                                                                       |
| `APP_TARGET=tauri vp build --outDir .tooling/tauri-renderer` | Renderer build passes; fixture text and browser storage adapter are absent from its output. This does not compile or launch the native application.                                                                                                 |
| Invalid `APP_TARGET` build                                   | Varlock rejects it as expected.                                                                                                                                                                                                                     |
| Chromium browser journeys                                    | Both journeys pass in development and against the built app. The built-app run repeats each five times: 10/10 pass, including committed note deletion followed by reload.                                                                           |
| Headless Rust SQLite tests                                   | 12/12 pass, including read-only content, FTS5 search, transactional failure handling and note anchors.                                                                                                                                              |
| Rust formatting and Clippy                                   | Pass for headless targets with and without `development-content`.                                                                                                                                                                                   |
| Ubuntu native build and offline smoke                        | Embedded Tauri debug build passes on Ubuntu 24.04, GTK 3.24.41 / WebKitGTK 2.52.6. An offline Xvfb/Openbox run passes reading, keyboard/dialog focus, bridge navigation, exact native clipboard copy, phrase search, note save and process restart. |

The browser checks cover reference/bridge navigation, phrase search, saved linked notes, reload, passage reopening and durable deletion. Light/dark and narrow layouts were inspected; automated checks found no page errors or horizontal document overflow. These checks do not constitute a full accessibility audit.

Linux native evidence now exists: the Ubuntu 24.04 test container builds and launches the actual Tauri application with embedded assets and networking disabled. The AT-SPI harness verifies accessible labels, text, selected-verse states, Tab/Shift+Tab order, modal focus containment and Escape/focus return; a separate X11 client verifies all 157 characters of the copied fixture quotation. The native SQLite database passes `integrity_check`; a second application process recovers the exact linked note and chapter-2 position after termination following committed writes. Reports and screenshots from the passing run are in `.tooling/linux/smoke-005/`; the [native test guide](tools/linux/README.md) explains how to reproduce it.

**Phase 1 remains open.** This evidence uses Xvfb/Openbox on X11, with a virtual-display compositing workaround confined to the test runner. Ubuntu GNOME X11/Wayland, manual Orca, `.deb` installation, Windows/macOS native checks and release signing/verification remain pending. Native close handling for an unsaved draft still needs implementation and verification. The outer Debian 13 workspace has no system GTK/WebKit installation; its Ubuntu container supplies the native build and test environment.

Linux is included in V1 scope. The proposed first qualification target is **Ubuntu 24.04 LTS x86_64 with GNOME**, using a `.deb` package. This is a target to test, not a claim of working support today. Other distributions, desktop environments and ARM devices need separate qualification; an AppImage is optional later packaging work. The same React/Tauri application and SQLite adapters serve all three operating systems. See the [release matrix](docs/RELEASE_STRATEGY.md) for the owning platform and distribution decisions.

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

By default Playwright starts `vp dev`. To test the built browser fixture app, run `vp build`, start `vp preview` in one terminal, then run `vp run test:e2e` in another with port 1420 free of other servers. Outside CI, Playwright reuses that preview server. The deletion journey waits for the confirmation dialog to close after transaction commit before reloading; hidden background roles are not a save acknowledgment.

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

SQLite repository tests run without the GTK desktop feature:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --features development-content
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```

`vp run desktop:check` is an internal native compilation using test content without packaging. `vp run public:build` deliberately fails until the authorized-content pipeline and release gates exist. Do not weaken this gate to make a test build appear publicly releasable. Required Windows/macOS/Linux native checks, accessibility review, platform-appropriate artifact verification and real-content validation remain open.

## Working rules

Read [AGENTS.md](AGENTS.md) before changing code. Before the first public V1.0 release, refactor directly, reset explicitly disposable development data, and remove obsolete implementations. Do not add historical development migrations, compatibility shims or deprecated alternatives. Public V1.0 starts the user-data preservation/migration obligation.

Shadcnblocks Pro is the primary UI resource. The public catalog and underlying Radix-based shadcn/ui source were consulted; purchased component source was unavailable here. The initial shell uses those underlying primitives, with provenance in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Review actual licensed source before replacing or extending these compositions.

Next, in order:

1. Repeat the now-passing Linux native slice in the proposed Ubuntu/GNOME target's Wayland and X11 sessions, including manual Orca review; prepare Windows/macOS hosts and demonstrate their native loops. Use the [Ubuntu container guide](tools/linux/README.md) for fast Linux build/smoke iteration here.
2. Implement and verify the native unsaved-note close guard, including save failure, discard and cancel. Keep Phase 1 open until the native loop is demonstrated.
3. Confirm the initial Afaan Oromo edition, authorized structured source, redistribution permissions and attribution. Provide the purchased Shadcnblocks source through an appropriate private resource and review its exact terms.
4. Proceed to Phase 2's full-corpus pipeline and remaining required V1 features in the [roadmap](docs/ROADMAP.md). AI and synchronization remain later work.
