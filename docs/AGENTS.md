# Instructions for AI coding agents

These instructions govern implementation in this repository. The user's explicit instructions take precedence. Read [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md), [DEVELOPMENT_GUIDELINES.md](DEVELOPMENT_GUIDELINES.md), and the current phase in [ROADMAP.md](ROADMAP.md) before changing code. Read the owning specification for the feature or data you touch. Resolve substantive document conflicts before dependent implementation; update the owning decision and affected contracts together.

## Product and scope

- Build one excellent, offline-first Afaan Oromo Bible reader for Windows, macOS and Linux. All three are required V1 desktop release targets. Finish the current milestone and its acceptance checks before adding future features.
- The proposed initial Linux qualification baseline is Ubuntu 24.04 LTS x86_64 with GNOME; `.deb` is the primary planned Linux package. Verify that baseline through the gates in [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md). Do not claim arbitrary Linux distribution or desktop-environment support.
- V1 includes the required reader, search, bookmarks, whole-verse highlights, plain-text standalone/verse-linked notes, preferences, reading-position persistence and user-data backup/restore described in [MVP_SCOPE.md](MVP_SCOPE.md). Do not silently omit required V1 behavior.
- Multiple translations, parallel reading, rich text, sermon workspaces, commentaries, synchronization and AI belong to later milestones unless the user explicitly changes scope. Do not add a hosted backend or complex AI infrastructure during initial development.
- Distinguish implemented, planned, blocked and verified behavior. Never claim a browser test proves native behavior or a synthetic corpus proves production content readiness.

## No backward compatibility before public V1.0

This is a new application with no production users. **Before the first public production release, V1.0, there is no requirement to preserve compatibility with earlier development implementations or experimental data.**

1. Refactor directly. Breaking APIs/types and replacing development schemas are allowed whenever the current design benefits.
2. Remove superseded code, files, services and types. Do not retain deprecated alternatives, compatibility shims, dual implementation paths or adapters for abandoned development formats.
3. Recreate development databases using an explicit developer reset when necessary. Do not write historical migrations merely to preserve discarded development iterations.
4. Do not introduce speculative extension frameworks, generalized repositories or future-proofing abstractions. Implement the current small contract.
5. Normal startup must never silently delete existing data or report a failed save as successful. Development reset freedom is not permission to weaken transactional correctness or hide errors.
6. Internal version iterations do not create public compatibility obligations. Freeze public user-data and backup formats at V1.0; after that boundary preserve user data and use tested migrations and recovery.

Apply this policy proactively when reviewing code. Do not ask for permission to remove obsolete development implementations when the task already authorizes the refactor. External content distribution rights and actual user instructions remain binding.

## Architecture and tools

- Use React, TypeScript, Vite+ and Tailwind with Tauri 2. Use Vite+'s `vp` workflow and the project-local pinned toolchain; do not silently replace Vite+ with plain Vite or add a full-stack framework.
- Use Varlock for declared environment configuration and its documented Vite integration. Validate required values at the correct build/runtime boundary. All values bundled into the frontend are public. Never put AI keys, signing credentials or other secrets in frontend environment variables, logs, commits or backups.
- Keep presentation, domain behavior, persistence and platform operations separate. One React application runs in both browser development and Tauri. Components must not import SQL/IndexedDB or invoke arbitrary native commands directly.
- Use small typed storage/platform ports and explicit adapter composition. Browser development uses JSON + IndexedDB; native production uses narrow Rust commands and bundled `rusqlite` SQLite/FTS5. Do not add a second SQL plugin, ORM, generic SQL IPC API or dependency-injection framework.
- Keep immutable `library.sqlite` separate from mutable `user.sqlite`. Open content read-only. Parameterize queries, validate IPC input, keep commands narrow and use transactional user writes. Production native startup must not silently fall back to browser adapters or fixtures.
- Use the same Tauri/Rust storage architecture on Linux. Resolve per-user app-data and packaged-resource paths through Tauri; never hard-code Unix paths or write private data into the installation directory. Linux builds need GTK3/WebKitGTK 4.1 development prerequisites; installed packages rely on declared system runtime dependencies and do not include a complete private system WebKit. End users do not install Node or Rust.
- Develop UI primarily in the browser, and validate the native slice early and at integration points. Avoid repeated Rust builds for unrelated styling changes, but never postpone all native work until the React app is finished.
- Follow the files and dependencies in [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) and [TECH_STACK.md](TECH_STACK.md). Add dependencies only for a concrete requirement, checking maintenance, bundle/native cost, compatibility and license first.

## UI policy: licensed Shadcnblocks Pro first

The project owns a paid Shadcnblocks Pro license. Treat that as an existing resource, subject to the actual agreement; do not replace it with a new component library.

1. Consult the available licensed source and official documentation/catalog before implementing a custom alternative. Record the inspected component/block and why it fits or fails the requirement. Do not invent a component name, API, purchased file, or confirmed license permission.
2. Reuse suitable layouts, navigation, dialogs, forms, menus, popovers and selectors; use the underlying shadcn/ui ecosystem for composition and required primitives. If paid source access is missing, document the blocker and continue with available primitives where appropriate rather than pretending the source was inspected.
3. Prefer polished accessible components over native browser-styled inputs, date/color pickers and unnecessary bespoke widgets when an appropriate supplied component exists. Accessible semantic HTML inside those components remains appropriate.
4. Compose a Scripture-centered reading experience. Do not impose generic dashboard charts/cards or sidebar density on Scripture simply because a block is available.
5. Follow [UI_UX_GUIDELINES.md](UI_UX_GUIDELINES.md) for typography, spacing, themes, responsive windows, keyboard interactions, focus management and screen-reader behavior. Preserve light/dark/system settings and text enlargement.
6. Do not redistribute/resell the proprietary component library as a standalone competing product, copy the complete paid package into a public repository, or infer that finished-app permission automatically permits public source redistribution. Follow the verified terms and resource register.
7. Do not add a second UI library or override shared design tokens locally without a concrete technical need and an owning-document update.

## Scripture and personal data

- Use authorized structured sources only. Never invent an actual Bible text, claim an edition is available/redistributable, or substitute a web scrape without verified rights. Keep uncertain sources marked verification required in [CONTENT_LICENSING.md](CONTENT_LICENSING.md).
- Synthetic fixtures must be unmistakably labeled, contain no claimed real edition and be excluded from public builds. Missing distribution permission is a public-release blocker, not a reason to invent content.
- Preserve source text and its headings, paragraphs, poetry, notes and cross-references according to the pipeline specification. Search uses a separate derived projection; normalization must not modify displayed/copied Scripture.
- References include edition and versification identities, stable book code and source chapter/verse labels. Handle bridges/subverses without assuming that one integer equals one verse or that different editions align.
- Interface locale and Bible edition are independent settings. Do not invent confirmed Oromo UI wording; arrange fluent review and use declared fallback behavior.
- Preserve note drafts on failed writes; report actual persistence state. Render plain-text notes safely. Keep private note text and full backups out of logs and telemetry.
- Backup JSON contains personal records and references, not licensed Scripture. Validate before destructive replacement; require the explicit restore confirmation and recoverable pre-restore snapshot defined in [STORAGE_STRATEGY.md](STORAGE_STRATEGY.md). Preserve unavailable-edition anchors and never relink them by guesswork.

## Implementation discipline

Read existing code and instructions first; do not overwrite unrelated changes. Make the smallest coherent change that completes the authorized behavior. Use clear types, handle real error paths and avoid blanket exception swallowing or unsafe type assertions that hide invalid data. Do not leave duplicate implementation generations behind.

Maintain the lockfile and declared scripts when changing dependencies. Use documented tooling rather than inventing flags or APIs. Check installed tool versions and current authoritative documentation where compatibility matters. Confirm `vp` global availability before installing it when setting up a new environment; a global CLI does not replace project-local dependency locking. Check Rust/Cargo and platform dependencies before claiming native readiness.

Run meaningful checks for the changed risk following [TESTING_STRATEGY.md](TESTING_STRATEGY.md): fast React/domain tests for behavior, current-schema persistence and failure tests for storage, content integrity checks for imports, and native tests for native changes. Do not add tests that only mirror code or run needless Rust builds for prose/style changes. Report the commands and results, and explicitly identify blocked native, content, accessibility or signing checks.

Before a milestone is marked complete, inspect acceptance criteria and demonstrate the critical end-to-end behavior in the required environment. A mock-only success, type check, screenshot or unsigned local build cannot substitute for the defined release evidence. Headless Rust tests on Linux do not demonstrate a native window launch. Record Linux desktop/package evidence separately from Windows/macOS evidence; do not claim one platform qualifies another. Public V1 requires clean-host Linux `.deb` installation and the native offline/persistence/backup checks as well as the Windows/macOS release gates.

Update affected documents in the same change when a decision or observable behavior changes. Keep definitions in their owning documents and link to them instead of multiplying inconsistent specifications. Finish with the concrete changes, checks run, material limitations and next ordered task. Do not start optional future features to compensate for a blocked required dependency.
