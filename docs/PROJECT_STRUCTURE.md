# Repository structure

Status: Phase 1 scaffold established as one application. The tree shows the current organization and identifies directories reserved for later milestones; it does not require empty placeholders. See the root [README.md](../README.md#current-status) for installed tooling, measured verification and remaining native gates.

```text
/
├── AGENTS.md                    # Bootstrap: read docs/AGENTS.md
├── README.md                    # Setup, verified status and daily commands
├── THIRD_PARTY_NOTICES.md        # Used component provenance and applicable notices
├── package.json                 # Exact tool/dependency selections; pnpm packageManager
├── pnpm-lock.yaml               # Single committed JS dependency lockfile
├── pnpm-workspace.yaml          # Matching Vite+ core/test aliases and build policy
├── .node-version                # Exact supported Node 24 LTS patch
├── rust-toolchain.toml          # Exact compatible stable Rust toolchain
├── .env.schema                  # Varlock public configuration schema
├── env.d.ts                     # Generated Varlock ENV declarations
├── .gitignore                   # Local secrets, databases, targets and source archives
├── vite.config.ts               # Vite+, React, Tailwind, Varlock, tests, native port
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── tsconfig.test.json            # Strict test project, including jsdom/Node test types
├── playwright.config.ts          # Browser journeys against dev or preview server
├── index.html
├── components.json              # shadcn/ui alias/theme setup
├── docs/                        # The 17 required specifications and index
├── src/
│   ├── main.tsx                 # Mount one React application
│   ├── app/
│   │   ├── App.tsx              # Reader workspace, startup/error states
│   │   ├── createServices.ts    # Sole runtime composition root; register window port before UI
│   │   └── useWindowCloseGuard.ts # Save/Discard/Cancel orchestration and stale-close protection
│   ├── domain/
│   │   ├── scripture.ts         # Edition, chapter, verse and structure types
│   │   ├── notes.ts             # Plain notes, annotations and preferences
│   │   ├── backup.ts            # Portable user-data format and import validation
│   │   ├── ports.ts             # Small async interfaces; no platform imports
│   │   └── validation.ts        # Shared DTO and persistence-boundary validation
│   ├── services/
│   │   ├── reference.ts         # Alias lookup and reference interpretation
│   │   └── search.ts            # Parsed query and normalized projection semantics
│   ├── adapters/
│   │   ├── browser/
│   │   │   ├── fixtureLibrary.ts
│   │   │   ├── indexedDbUserStore.ts
│   │   │   └── backupFiles.ts   # Browser development download/file picker
│   │   └── tauri/
│   │       ├── library.ts
│   │       ├── userStore.ts
│   │       ├── transport.ts     # Typed invocation and wire-result validation
│   │       ├── backupFiles.ts   # Narrow native backup dialog commands
│   │       └── window.ts        # Persistent prevented close requests and explicit destruction
│   ├── features/
│   │   ├── reader/
│   │   │   ├── ReaderContent.tsx # Shared typed source-tree rendering; reference form composed in App
│   │   │   └── SearchPanel.tsx
│   │   ├── notes/
│   │       ├── NotesPanel.tsx
│   │       └── useNoteWorkspace.ts # Draft/commit state, ordered autosave and close pause/drain
│   │   └── backup/
│   │       └── BackupControls.tsx # Export, validated preview and confirmed replacement
│   ├── components/
│   │   ├── ui/                 # Installed/copied shadcn primitives and licensed components
│   │   └── compositions/       # Future: add when a reusable composition is needed
│   ├── lib/utils.ts            # Shared UI class helper, no business logic
│   ├── locales/en.ts           # Initial fallback catalog; om.ts after reviewed translation
│   └── styles/globals.css      # Tailwind theme tokens and reader typography
├── content/
│   ├── fixtures/
│   │   ├── manifest.json       # Explicitly synthetic; never a published edition
│   │   └── sample.json         # Structural testing data, not Scripture quotations
│   ├── sources/               # Ignored, permission-scoped source archives
│   └── generated/             # Ignored technical intermediates/packs; approval before release use
├── tools/
│   ├── native.mjs             # Tauri target/feature selection; locked debug desktop:check
│   ├── release/               # Approved pack verification before public bundling
│   ├── linux/                 # Ubuntu dev image and real AT-SPI/X11 native smoke runner
│   └── scripture/             # Source AST, verse projection, chapter tree and technical SQLite builder
│       └── README.md          # Exact local pipeline commands and approval limits
├── src-tauri/
│   ├── Cargo.toml
│   ├── Cargo.lock
│   ├── build.rs
│   ├── tauri.conf.json         # Shared desktop window/security and platform bundle settings
│   ├── tauri.linux.conf.json   # Automatically merged Linux .deb target override
│   ├── tauri.release.conf.json # Explicit approved-content release resource overlay
│   ├── capabilities/default.json
│   ├── icons/                 # Required development PNG/ICO; production identity pending
│   └── src/
│       ├── main.rs            # Binary entry only
│       ├── lib.rs             # Command registration and managed state
│       └── storage.rs         # Narrow SQLite repository; split only when warranted
├── tests/
│   ├── contracts/             # Shared full-corpus DTO validation when local source exists
│   ├── content/               # Future full-import integrity cases
│   ├── fixtures/              # Synthetic candidate V1 backup contract fixture
│   └── e2e/                   # Browser workflows; native tests added when wired
└── .github/workflows/
    └── native-checks.yml      # Frontend checks and four native build-host/architecture jobs
```

## Practical rules

Keep unit tests beside the behavior they verify; use shared `tests/` only for cross-module fixtures/contracts and complete journeys. The tree names do not require empty placeholder files. Add files with working behavior or a necessary configuration responsibility, and remove obsolete files during refactors.

`pnpm-lock.yaml` and `src-tauri/Cargo.lock` are actual tool-resolved lockfiles, and `env.d.ts` is generated by Varlock. The root TypeScript solution references the application, tooling and test projects. Keep `tsconfig.test.json` in that solution so test files receive full type checking without adding their Node/test types to the renderer build. Ignored `.tooling/` contains this managed session's installed tools and caches, not application modules or portable repository setup.

Keep native APIs in `src/adapters/tauri` and Rust repositories. A reader component receives a service or a hook that already has it; it never imports `invoke`, `indexedDB`, `localStorage`, SQLite, or checks `window.__TAURI__`. Browser-only dynamic imports belong in the composition root and must be omitted from native release output.

The native window port is created before editable UI mounts; the platform listener always prevents close requests while the application hook owns the current save/discard/cancel decision. An application exit request is also prevented and sent through that guard before a narrow native command authorizes exit. Keep `core:window:allow-destroy` scoped to `main` in `src-tauri/capabilities/default.json`. The notes hook exposes latest-buffer checks, pause/resume, flush and discard without importing Tauri. Its `beforeunload` warning is browser-only. macOS application-menu/Command-Q/Dock quit still need native qualification. Mechanisms and behavior are owned by [ARCHITECTURE.md](ARCHITECTURE.md) and [FEATURE_SPECIFICATIONS.md](FEATURE_SPECIFICATIONS.md).

Windows, macOS and Linux use these same React features, Tauri adapters and Rust repositories. Do not create a separate Linux application or storage implementation. Linux is a required V1 target; the proposed initial qualification baseline is Ubuntu 24.04 LTS x86_64/GNOME, with `.deb` as the primary planned artifact. Keep platform package configuration under `src-tauri` and native build/test CI under `.github/workflows` as implemented. The support and package gates are owned by [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md), not inferred from the presence of a Linux configuration file.

The [native-checks workflow](../.github/workflows/native-checks.yml) performs frontend checks and native SQLite tests/debug compilation on Ubuntu 24.04 x64, Windows Server 2022 x64, macOS 15 ARM64 and macOS 15 Intel hosts. The first hosted matrix passes; its source commit and run are recorded in [TESTING_STRATEGY.md](TESTING_STRATEGY.md#automated-build-checks). It uses pinned action commits, Vite+ `1.3.0`, the repository Node/Rust versions and frozen lockfiles. `tools/native.mjs` owns `desktop:check` target selection and its `--debug --no-bundle -- --locked` build arguments. CI does not create another application or bypass the public-content gate. Automated scope, cache/build limits and the distinction from GUI/platform qualification are owned by the testing strategy.

Copy licensed components into `src/components/ui` or an appropriately named subfolder after reviewing actual source. Track provenance and access restrictions in the component inventory section of [UI_UX_GUIDELINES.md](UI_UX_GUIDELINES.md). Do not publish the paid component source in a public repository without confirming that the purchased terms authorize it. The finished application may include components as permitted by that license.

Content source archives, generated packs and permission correspondence are separate from the application source. Ignore raw private records, local databases, backups and credential files. Keep small redistributable fixtures and non-secret manifests in source control. Do not commit a real user's notes or a complete publisher archive simply to make a test reproducible.

Use per-user application data directories resolved by Tauri on all three desktop platforms; do not hard-code Linux/Unix paths. Keep `user.sqlite` and pre-restore recovery files there. The approved immutable `library.sqlite` is a bundled resource, opened through a resolved read-only path after manifest and checksum validation. If a target cannot directly open that resource, follow [STORAGE_STRATEGY.md](STORAGE_STRATEGY.md) for a verified app-data copy. Missing content must not prevent access to personal records.

## Dependency and module growth

The initial dependency set is React, the Vite+ toolchain, Tailwind, Varlock, actual underlying shadcn component dependencies, Tauri, `rusqlite` and the focused test tools. Do not create `packages/`, an HTTP API, a server directory, a plugin system, a sync protocol or AI clients in Phase 1. See [TECH_STACK.md](TECH_STACK.md) for the specific package inventory.

Add a separate settings or annotations feature module only when their existing compositions outgrow `App.tsx`. Backup validation currently lives in `domain/backup.ts`, while the two file adapters and the backup settings controls own platform I/O and presentation. Do not put future features behind nonworking buttons. Keep an inspectable report alongside every generated content pack.

The complete initial task order and exact first files are in the final section of [ROADMAP.md](ROADMAP.md). A working end-to-end slice comes before populating this entire tree.
