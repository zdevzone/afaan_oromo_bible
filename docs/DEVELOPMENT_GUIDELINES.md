# Development guidelines

Status: adopted workflow for a new application. Read [AGENTS.md](AGENTS.md), [ARCHITECTURE.md](ARCHITECTURE.md), and the current milestone in [ROADMAP.md](ROADMAP.md) before changing application code. [TECH_STACK.md](TECH_STACK.md) owns dependency decisions; this document owns how work is performed.

## Compatibility rule: before public V1.0

**There is absolutely no requirement to preserve backward compatibility with any earlier development implementation before the first public production release, V1.0.** Internal prototypes, previews, alpha builds, and beta iterations do not create public compatibility obligations.

- Break APIs, DTOs, types, component props, file formats, and schemas directly when it improves the current implementation.
- Recreate development databases and regenerate content packs. Experimental data does not need preservation.
- Keep one current schema and initializer. Do not write a historical migration chain for development schemas, or build an upgrade framework for development backups.
- Delete obsolete code, types, files, services, and tests. Do not retain deprecated alternatives, compatibility shims, dual read paths, or old schema branches.
- Refactor callers and implementations together. Keep the resulting architecture correct and clear rather than preserving a previous mistake.
- A current schema/format identifier may detect a mismatch and explain a development reset; it is not an obligation to upgrade that format.

Destructive development resets apply only to identified development data. They are explicit development operations, never a recovery behavior for arbitrary user-selected files or unknown application data. Keep development app identifiers/data directories separate from the production identity. Do not delete the user's unrelated files, licensed source archive, or purchase evidence. A voluntary export can protect a tester's useful draft without adding compatibility code.

At public V1.0, freeze the first supported user database and portable backup formats. Subsequent releases preserve user data with tested migrations and restore compatibility. Never reset a production database merely because its schema differs. See [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md) for the transition gate.

## Daily workflow

1. Read the task's acceptance criteria and owning specifications. Resolve a contradiction before implementing dependent behavior; record a changed decision once in its owning document.
2. Make the smallest complete change in the current milestone. Inspect available Shadcnblocks source and applicable documentation before writing a custom widget.
3. Iterate using browser development. Exercise realistic loading, empty, failure, saving, and keyboard states.
4. Run the focused checks that verify the change. Use Tauri when native persistence, filesystem behavior, permissions, clipboard behavior, or WebView differences are involved.
5. Remove superseded code and fixtures. Update affected documents/contracts and report what was verified and what remains unverified.

Do not implement deferred AI, synchronization, rich-text editing, commentary, or general sermon management during the initial reader phase. No backend or account should appear as a prerequisite for offline reading.

## Environment checks and setup

In a Bash development shell, inspect commands without dumping the entire environment:

```sh
command -v vp
node --version
command -v rustc
command -v cargo
command -v rustup
```

On PowerShell, use `Get-Command vp,node,rustc,cargo,rustup -ErrorAction SilentlyContinue`. An absent command is a missing prerequisite, not a successful check. Once installed, inspect `vp --version`, `vp env current`, `vp toolchain`, `rustc --version`, and `cargo --version`; retain concise results in setup/status. Avoid raw `env`, `printenv`, or secret-bearing Varlock output in logs.

The documentation workspace was observed to be Linux without Rust/GTK/WebKit prerequisites. Prepare an appropriate native development host or CI runner before claiming native validation. Installation requirements and exact pins are specified in [TECH_STACK.md](TECH_STACK.md); the observed status does not forbid later setup.

Use one package manager and its committed lockfile. Global `vp` is convenient, but the exact project-local `vite-plus` version controls builds. After a clean checkout:

```sh
vp install
vp exec varlock load --agent
vp dev
```

Configure CI to perform a frozen-lockfile install using the selected package manager's supported option. Resolve dependency updates intentionally and commit their lockfile changes; do not repair a normal build by upgrading unrelated packages.

Varlock validates Vite configuration through its plugin. Keep checked-in defaults sufficient for V1 development; do not require a cloud account or secret to open the reader. Run non-Vite tools with `vp exec varlock run -- <command>` only when they actually need schema-managed process variables. This is the documented [Varlock run interface](https://varlock.dev/reference/cli/load-and-run/).

## Frontend and native feedback loops

Use one React application and one set of application ports. Browser JSON/IndexedDB adapters implement the same observable operations as the native adapter; they are development infrastructure, with contract tests for shared semantics. Compose the selected adapters once at startup. UI components must not inspect a platform flag and choose their own persistence code.

Use browser development for UI, navigation, reference parsing, note interactions, and failure states. Test the first native vertical slice during Phase 1: read → navigate → search → write note → close → reopen. Repeat on Windows and macOS. Browser success does not satisfy a native persistence milestone. A Linux compile also does not satisfy the Windows/macOS gate.

After scaffolding, routine frontend commands are:

```sh
vp check
vp test
vp test watch
vp build
```

The installed Vite+ currently runs `vp test` once; watch mode is explicit. Tests import `vite-plus/test` and use the `test` block in `vite.config.ts`. Enable both type-aware linting and type checking for `vp check`. Sources: [Vite+ tests](https://viteplus.dev/guide/test), [checks](https://viteplus.dev/guide/check).

For native work, after prerequisites and the project exist:

```sh
vp exec tauri dev
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
vp exec tauri build
```

The exact release/CI scripts are established with the scaffold. `vp dev/build/test` run built-ins; `vp run <name>` runs a named project script. Tauri `beforeDevCommand`/`beforeBuildCommand` must invoke the wrapper when it selects environments or runs extra checks. Avoid a script recursively calling itself. See [Vite+ build behavior](https://viteplus.dev/guide/build).

Keep the native target directory/cache for incremental builds. Do not run `cargo clean` routinely or duplicate native checkouts just to isolate frontend changes. Use bounded CI caches keyed by OS/toolchain/lockfile; never cache signing secrets. Full signed packaging is a release gate, not the UI development command.

## Code organization and conventions

- Enable strict TypeScript; validate external inputs and use typed domain results/errors. Avoid `any`, unchecked casts, and non-null assertions at persistence/IPC boundaries.
- Put presentation in feature components, business behavior in application/domain modules, and persistence/platform access in adapters. Follow [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md).
- Components call application operations, never SQL or raw native commands. Rust owns parameterized SQL, database locations, content read-only enforcement, and transactions. No generic SQL IPC or second database access path.
- Use function components, explicit props, small hooks, and ordinary composition. Extract a reusable abstraction when a second concrete use or a proven boundary justifies it.
- Model loading/error/empty/saving states deliberately. Async effects must ignore stale results or support cancellation so old chapter/search responses cannot replace newer choices.
- Keep source Scripture text immutable. Normalization belongs in the search projection, never the displayed corpus. Parse reference labels instead of assuming integer verse IDs.
- Store stable edition-aware anchors, UUIDs, and UTC timestamps using the agreed data model. Render locale-dependent dates at the UI boundary.
- Use locale catalogs for interface text. Bible edition selection and UI locale remain independent. Do not present unreviewed machine-translated Oromo strings as approved wording.
- Notes are plain text in V1. Render user text safely and preserve drafts after write failures; a success badge follows a committed write.
- Keep logs useful without Scripture dumps, note bodies, backup contents, or secrets. Give users actionable error messages and retain technical details only in appropriate local diagnostics.

Changes to a DTO or schema update the native/browser adapters, contract fixtures, and consumers in the same change. An architecture mismatch is resolved by direct refactoring, not a permanent temporary adapter layered over obsolete code.

## Component and design discipline

Use Shadcnblocks Pro as the primary resource. First inspect the actual purchased components and their required primitives, then adapt a suitable composition. Do not invent an available component or claim access to files that are absent. If source access is blocked, record the gap and build only the limited shell allowed by the UI baseline; do not silently substitute a new library.

Keep app-specific reading components separate from copied UI primitives. Use shared tokens for light/dark/system themes, text size, spacing, focus indicators, and highlight colors. An attractive block still needs semantic reading order, keyboard behavior, accessible names, contrast checks, and screen-reader validation in context. The definitive rules are in [UI_UX_GUIDELINES.md](UI_UX_GUIDELINES.md).

Review the actual purchase license before publishing component source. A public finished application and a public source repository are different distribution decisions. See [CONTENT_LICENSING.md](CONTENT_LICENSING.md).

## Data, content, and safety while developing

Use clearly labeled synthetic fixtures for a missing/unapproved corpus. Never manufacture Scripture or claim a fixture is the selected edition. Authorized samples remain subject to their own redistribution terms. Public-build validation must reject synthetic content.

Keep distributable Scripture separate from personal records. Never use a content rebuild to replace `user.sqlite`. Backups contain portable user records, not bundled Scripture. A restore validates first, previews the changes, obtains destructive-restore confirmation, creates a recoverable pre-restore snapshot, and performs one atomic user-data replacement. Abort replacement if the snapshot cannot be written and verified. These are product requirements, unrelated to pre-release compatibility.

Treat files, content packages, clipboard input, and IPC payloads as untrusted data. Enforce documented size/type limits and path ownership in the native layer. Do not execute source markers or render arbitrary HTML. Keep Tauri capabilities and CSP narrow; a convenience workaround must not grant generic shell or filesystem access.

## Verification and review

Select tests according to the behavior and risk, following [TESTING_STRATEGY.md](TESTING_STRATEGY.md). Domain tests cover reference/search rules; contract tests cover adapter semantics; SQLite integration tests prove transactions and FTS5; user journeys cover reading and note recovery. Content tests compare imported output to the authorized source. Do not add tests that merely restate trivial styling or duplicate implementation details.

A change is reviewable when its acceptance criteria pass, obsolete paths are gone, failure behavior is exercised, accessibility is checked for changed interactions, and relevant native behavior has been tested on appropriate hosts. Report limitations explicitly: “browser tested; macOS native gate pending” is valid status, while implying desktop success from mocks is not.

Keep commits focused and descriptions concrete: resulting behavior, significant decision, verification, and any remaining limitation. Do not weaken checks or delete failing scenarios to obtain a green result. Fix the cause or record a genuine external blocker with the next action.

Documentation and the Phase 1 handoff establish the initial architecture; this task does not authorize beginning feature implementation before that foundation is complete.
