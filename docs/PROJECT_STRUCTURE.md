# Repository structure

Status: recommended structure adopted for Phase 1. The tree describes intended files; documentation alone does not assert that application files exist. Start as one application, not a monorepo.

```text
/
├── AGENTS.md                    # Bootstrap: read docs/AGENTS.md
├── README.md                    # Setup, verified status and daily commands
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
├── index.html
├── components.json              # shadcn/ui alias/theme setup
├── docs/                        # The 17 required specifications and index
├── src/
│   ├── main.tsx                 # Mount one React application
│   ├── app/
│   │   ├── App.tsx              # Reader workspace, startup/error states
│   │   └── createServices.ts    # Sole runtime composition root
│   ├── domain/
│   │   ├── scripture.ts         # Edition, chapter, verse and structure types
│   │   ├── notes.ts             # Plain notes, annotations and preferences
│   │   └── ports.ts             # Small async interfaces; no platform imports
│   ├── services/
│   │   ├── reference.ts         # Alias lookup and reference interpretation
│   │   └── search.ts            # Parsed query and normalized projection semantics
│   ├── adapters/
│   │   ├── browser/
│   │   │   ├── fixtureLibrary.ts
│   │   │   └── indexedDbUserStore.ts
│   │   └── tauri/
│   │       ├── library.ts
│   │       └── userStore.ts
│   ├── features/
│   │   ├── reader/
│   │   │   ├── ReaderContent.tsx # Source AST rendering; reference form composed in App
│   │   │   └── SearchPanel.tsx
│   │   └── notes/
│   │       ├── NotesPanel.tsx
│   │       └── useNoteWorkspace.ts # Draft/commit state and ordered autosave
│   ├── components/
│   │   ├── ui/                 # Installed/copied shadcn primitives and licensed components
│   │   └── compositions/       # Small reusable application compositions when needed
│   ├── lib/utils.ts            # Shared UI class helper, no business logic
│   ├── locales/en.ts           # Initial fallback catalog; om.ts after reviewed translation
│   └── styles/globals.css      # Tailwind theme tokens and reader typography
├── content/
│   ├── fixtures/
│   │   ├── manifest.json       # Explicitly synthetic; never a published edition
│   │   └── sample.json         # Structural testing data, not Scripture quotations
│   ├── sources/               # Ignored source archives, permission-scoped acquisition
│   └── generated/             # Ignored verified output; only release-approved packs bundled
├── tools/
│   └── scripture/
│       └── README.md          # Parser spike, import and validation commands as implemented
├── src-tauri/
│   ├── Cargo.toml
│   ├── Cargo.lock
│   ├── build.rs
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   ├── icons/                 # Release-ready assets only after identity selected
│   ├── resources/             # Authorized library pack and notices at packaging time
│   └── src/
│       ├── main.rs            # Binary entry only
│       ├── lib.rs             # Command registration and managed state
│       └── storage.rs         # Narrow SQLite repository; split only when warranted
├── tests/
│   ├── contracts/             # Shared adapter behavior, data/failure fixtures
│   ├── content/               # Import/source integrity and Unicode cases
│   └── e2e/                   # Browser workflows; native tests added when wired
└── .github/workflows/         # Add CI when a repository/provider is selected
```

## Practical rules

Keep unit tests beside the behavior they verify; use shared `tests/` only for cross-module fixtures/contracts and complete journeys. The tree names do not require empty placeholder files. Add files with working behavior or a necessary configuration responsibility, and remove obsolete files during refactors.

Keep native APIs in `src/adapters/tauri` and Rust repositories. A reader component receives a service or a hook that already has it; it never imports `invoke`, `indexedDB`, `localStorage`, SQLite, or checks `window.__TAURI__`. Browser-only dynamic imports belong in the composition root and must be omitted from native release output.

Copy licensed components into `src/components/ui` or an appropriately named subfolder after reviewing actual source. Track provenance and access restrictions in the component inventory section of [UI_UX_GUIDELINES.md](UI_UX_GUIDELINES.md). Do not publish the paid component source in a public repository without confirming that the purchased terms authorize it. The finished application may include components as permitted by that license.

Content source archives, generated packs and permission correspondence are separate from the application source. Ignore raw private records, local databases, backups and credential files. Keep small redistributable fixtures and non-secret manifests in source control. Do not commit a real user's notes or a complete publisher archive simply to make a test reproducible.

Use app-local data directories resolved by Tauri. Keep `library.sqlite`, `user.sqlite` and pre-restore recovery files there; these are runtime paths, not files under `src-tauri/resources`. Bundled content is copied/verified or opened at a resolved read-only path according to [STORAGE_STRATEGY.md](STORAGE_STRATEGY.md).

## Dependency and module growth

Start with React, the Vite+ toolchain, Tailwind, Varlock, actual underlying shadcn component dependencies, Tauri and `rusqlite`. Do not create `packages/`, an HTTP API, a server directory, a plugin system, a sync protocol or AI clients in Phase 1. See [TECH_STACK.md](TECH_STACK.md) for the specific package inventory.

Add `features/settings`, `features/annotations`, `services/backup.ts` and `adapters/*/platformFiles.ts` when their milestone starts. Do not put all future features behind nonworking buttons. Add an approved importer executable only after its parser and source format are evaluated; keep an inspectable report alongside every generated pack.

The complete initial task order and exact first files are in the final section of [ROADMAP.md](ROADMAP.md). A working end-to-end slice comes before populating this entire tree.
