# Afaan Oromo Bible

An offline-first React/TypeScript and Tauri 2 application for Windows and macOS. Start with the [documentation index](docs/README.md); the [roadmap ends with the concrete Phase 1 implementation plan](docs/ROADMAP.md#phase-1-implementation-plan).

Project repository: [zdevzone/afaan_oromo_bible](https://github.com/zdevzone/afaan_oromo_bible).

## Current status

All 17 requested development documents are established. Phase 1 source development has begun: a shared reader workspace, synthetic structured content, book/chapter and reference navigation, bounded search, whole-unit selection/copy, standalone and passage-linked plain notes, reading preferences, browser IndexedDB persistence, and narrow Tauri/Rust SQLite adapters.

This is an **internal development scaffold**, not V1.0. Every included reading sentence is labeled **synthetic test content — not Scripture**. The initial Bible edition, its distribution rights, fluent Oromo wording, and purchased component source access are still verification gates. No AI, server, account, synchronization, rich editor, or sermon system is included.

The initial environment has Node 24.19.0, npm 11.9.0, and a system pnpm 11.25.0 launcher. The project requests pnpm 10.20.0 through Vite+. `vp`, Rust/Cargo/Rustup, GTK3 and WebKit2GTK 4.1 were absent when inspected. Network-enabled installation is pending sandbox permission. **Dependencies are not installed; no React build, Vite+ checks, browser UI test, Rust compilation or Tauri launch has yet passed.** JavaScript/Rust lockfiles and generated Varlock types must be created by the real tools, not fabricated.

The foundation session recorded these checks independently of installed project dependencies: documentation links/fences; JSON/TOML configuration syntax; synthetic fixture SHA-256 and exact-text digests; **69/69** pure-domain smoke assertions using Node's built-in TypeScript stripping; **11/11** normalized-token FTS5 prototype cases using host Python SQLite; source syntax/local-import checks through the preinstalled Playwright parser; and rejection by the public production packaging gate. The temporary smoke harnesses were environment-only; the committed tests below remain the reproducible verification target. These checks do not substitute for those tests. Vite+ domain/storage/component tests, two browser journeys and twelve Rust repository tests are authored but unrun.

## Development

Check `vp --version` before installing the global CLI. Use the [official Vite+ installation instructions](https://viteplus.dev/guide/). Keep the project-local version and matching core override; do not substitute plain Vite. The selected package versions are published versions chosen for this scaffold; the complete dependency graph remains unverified until installation.

After Vite+ is available:

```sh
git clone https://github.com/zdevzone/afaan_oromo_bible.git
cd afaan_oromo_bible
vp install
vp exec varlock codegen
vp run typecheck
vp check
vp test
vp dev
```

Open `http://127.0.0.1:1420`. Browser storage is development-only and may be cleared by the browser. Use the first sample reference shown in the reference entry field; search examples include `reading`, `"careful reading"`, `rea*`, and the Unicode fixtures documented under [scripture tooling](tools/scripture/README.md).

`.env.schema` is the source of truth for Varlock configuration. `APP_TARGET` is public and defaults to `browser`; no secret or cloud configuration is required. `varlock codegen` produces `env.d.ts`. Do not handwrite a fake generated file or bundle credentials. `vp build` creates an internal browser fixture build, not an approved public release.

For browser journeys after installing the test browser:

```sh
vp exec playwright install chromium
vp run test:e2e
```

## Native development

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) on each host. The Rust pin is a known stable 1.90.0 baseline; resolving the actual Cargo graph must confirm all crate requirements. Linux compilation is useful but does not validate Windows/macOS installers or WebViews.

```sh
vp run desktop:dev
```

The wrapper sets the Varlock-managed public renderer target to `tauri` before Tauri starts the same React application. It explicitly enables the `development-content` Cargo feature. The Rust layer prepares a checksum-named synthetic database and then opens it read-only; user records live in a separate development data directory. Native failures never switch to IndexedDB. Use the wrapper instead of launching Tauri with a browser-configured renderer.

SQLite repository tests can run without the GTK desktop feature once Rust is installed:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --features development-content
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```

`vp run desktop:check` is an internal native compilation using test content without packaging. `vp run public:build` deliberately fails until the authorized-content pipeline and release gates exist. Do not weaken this gate to make a test build appear publicly releasable. Required Windows/macOS native checks, accessibility review, signing and real-content validation remain open.

## Working rules

Read [AGENTS.md](AGENTS.md) before changing code. Before the first public V1.0 release, refactor directly, reset explicitly disposable development data, and remove obsolete implementations. Do not add historical development migrations, compatibility shims or deprecated alternatives. Public V1.0 starts the user-data preservation/migration obligation.

Shadcnblocks Pro is the primary UI resource. The public catalog and underlying Radix-based shadcn/ui source were consulted; purchased component source was unavailable here. The initial shell uses those underlying primitives, with provenance in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Review actual licensed source before replacing or extending these compositions.

Next: install the toolchains and run the Phase 1 checks, resolve any failures, then prove the read → search → linked note → restart loop in real Windows and macOS builds. Authorize and validate the selected Bible edition before full-corpus development or public distribution.
