# Afaan Oromo Bible

An offline-first React/TypeScript and Tauri 2 application for Windows and macOS. Start with the [documentation index](docs/README.md); the [roadmap ends with the concrete Phase 1 implementation plan](docs/ROADMAP.md#phase-1-implementation-plan).

Project repository: [zdevzone/afaan_oromo_bible](https://github.com/zdevzone/afaan_oromo_bible).

## Current status

All 17 requested development documents are established. Phase 1 source development has begun: a shared reader workspace, synthetic structured content, book/chapter and reference navigation, bounded search, whole-unit selection/copy, standalone and passage-linked plain notes, reading preferences, browser IndexedDB persistence, and narrow Tauri/Rust SQLite adapters.

This is an **internal development scaffold**, not V1.0. Every included reading sentence is labeled **synthetic test content — not Scripture**. The initial Bible edition, its distribution rights, fluent Oromo wording, and purchased component source access are still verification gates. No AI, server, account, synchronization, rich editor, or sermon system is included.

The development environment now has **Vite+ 1.3.0**, **Node 24.19.0**, **pnpm 10.20.0**, and **Rust/Cargo 1.90.0**. Dependencies are installed, `pnpm-lock.yaml` and `src-tauri/Cargo.lock` were resolved by the actual tools, and Varlock generated `env.d.ts`. Toolchains and caches are session-local under ignored `.tooling/`; they are not part of the application source.

Verification recorded on Linux, 2026-10-20:

| Check                                                        | Result and limit                                                                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vp run typecheck` and `vp check`                            | Pass; formatting, lint and type checks are clean.                                                                                                                         |
| `vp test`                                                    | 48 tests pass across domain, search/content integrity, IndexedDB transactions and note-save behavior.                                                                     |
| `vp build`                                                   | Browser fixture build passes.                                                                                                                                             |
| `APP_TARGET=tauri vp build --outDir .tooling/tauri-renderer` | Renderer build passes; fixture text and browser storage adapter are absent from its output. This does not compile or launch the native application.                       |
| Invalid `APP_TARGET` build                                   | Varlock rejects it as expected.                                                                                                                                           |
| Chromium browser journeys                                    | Both journeys pass in development and against the built app. The built-app run repeats each five times: 10/10 pass, including committed note deletion followed by reload. |
| Headless Rust SQLite tests                                   | 12/12 pass, including read-only content, FTS5 search, transactional failure handling and note anchors.                                                                    |
| Rust formatting and Clippy                                   | Pass for headless targets with and without `development-content`.                                                                                                         |

The browser checks cover reference/bridge navigation, phrase search, saved linked notes, reload, passage reopening and durable deletion. Light/dark and narrow layouts were inspected; automated checks found no page errors or horizontal document overflow. These checks do not constitute a full accessibility audit.

**Phase 1 remains open for native Windows/macOS validation.** This Linux host lacks GTK3/WebKit2GTK 4.1 development prerequisites, and Windows/macOS hosts are not available here. No Tauri window launch, target-platform restart/clipboard check, installer, signing or notarization has passed. Desktop close handling for an unsaved draft also needs implementation and native verification.

## Development

Check `vp --version` before installing the global CLI. Use the [official Vite+ installation instructions](https://viteplus.dev/guide/). Keep the project-local version and matching core override; do not substitute plain Vite. The committed JavaScript and Cargo graphs have been installed/resolved on this Linux host; clean Windows/macOS installs remain part of native validation.

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

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) on each host. Rust 1.90.0 is pinned and has compiled the headless SQLite repository tests. The desktop feature and platform dependencies still require target-host verification. Linux compilation does not validate Windows/macOS installers or WebViews.

```sh
vp run desktop:dev
```

The wrapper sets the Varlock-managed public renderer target to `tauri` before Tauri starts the same React application. It explicitly enables the `development-content` Cargo feature. The Rust layer prepares a checksum-named synthetic database and then opens it read-only; user records live in a separate development data directory. Native failures never switch to IndexedDB. Use the wrapper instead of launching Tauri with a browser-configured renderer.

Original development PNG/ICO assets satisfy Tauri's icon-file requirements even while bundling is disabled. They are placeholders; final production artwork and packaging remain release work.

SQLite repository tests run without the GTK desktop feature:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --features development-content
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```

`vp run desktop:check` is an internal native compilation using test content without packaging. `vp run public:build` deliberately fails until the authorized-content pipeline and release gates exist. Do not weaken this gate to make a test build appear publicly releasable. Required Windows/macOS native checks, accessibility review, signing and real-content validation remain open.

## Working rules

Read [AGENTS.md](AGENTS.md) before changing code. Before the first public V1.0 release, refactor directly, reset explicitly disposable development data, and remove obsolete implementations. Do not add historical development migrations, compatibility shims or deprecated alternatives. Public V1.0 starts the user-data preservation/migration obligation.

Shadcnblocks Pro is the primary UI resource. The public catalog and underlying Radix-based shadcn/ui source were consulted; purchased component source was unavailable here. The initial shell uses those underlying primitives, with provenance in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Review actual licensed source before replacing or extending these compositions.

Next, in order:

1. On Windows and macOS, install the platform prerequisites and run `vp run desktop:dev`; resolve native compilation/IPC issues and prove read → search → linked note → restart plus clipboard behavior.
2. Implement and verify the native unsaved-note close guard, including save failure, discard and cancel. Keep Phase 1 open until the native loop is demonstrated.
3. Confirm the initial Afaan Oromo edition, authorized structured source, redistribution permissions and attribution. Provide the purchased Shadcnblocks source through an appropriate private resource and review its exact terms.
4. Proceed to Phase 2's full-corpus pipeline and remaining required V1 features in the [roadmap](docs/ROADMAP.md). AI and synchronization remain later work.
