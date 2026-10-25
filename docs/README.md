# Afaan Oromo Bible — development foundation

Status: architecture baseline established 2026-10-19; Phase 1 implementation is underway. Linux joined Windows/macOS as a required V1 desktop target on 2026-10-20. A full embedded debug Tauri build, offline native reader/note/restart smoke and actual window-manager Save/Discard/Cancel checks pass in an Ubuntu 24.04 container under Xvfb/Openbox. The close check includes a real locked-database save failure, retained draft and successful retry before exit. Application-level Quit protection is implemented but still needs native macOS testing; Windows/macOS runs and full Ubuntu GNOME/package qualification remain open. See the [current Phase 1 checkpoint and ordered handoff](ROADMAP.md), [repository status](../README.md), and [Linux smoke guide](../tools/linux/README.md) for evidence and limits. The shared decisions below describe intended V1 behavior, not a claim that every feature exists. The original brief is input; the user's latest choices of **Vite+** and **Varlock** supersede its Vite recommendation.

## Overall plan

1. Establish the tooling, component inventory, content permission register, repository, and an accessible reader shell.
2. Prove the same React read → navigate → search → note → restart loop in a browser and Tauri early, using conspicuously labeled synthetic test content until an authorized edition is available.
3. Validate and package one selected edition; complete reader, annotations, settings, and transactional backup/restore.
4. Test content integrity, Oromo search, accessibility, and failures; validate Windows/macOS/Linux packages and platform-appropriate authenticity/integrity before the first public release, **V1.0**.
5. Add translations, study tools, and optional AI only in evidence-driven later milestones.

## Shared decisions

These are engineering decisions adopted for planning and the authorized initial implementation. Product/licensing choices marked **verification required** are not approved by this document.

| Topic         | Baseline                                                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend      | One React + TypeScript application; Vite+ (`vp`, project-local `vite-plus`); Tailwind CSS; licensed Shadcnblocks Pro first, underlying shadcn/ui primitives.                                                                                                       |
| Environment   | Varlock schema and Vite integration; all frontend values public; no reader secrets or backend.                                                                                                                                                                     |
| Desktop       | Tauri 2 for Windows/macOS/Linux; narrow Rust commands using `rusqlite` (bundled SQLite/FTS5); no generic SQL IPC or second ORM/SQL plugin.                                                                                                                         |
| Storage       | One immutable `library.sqlite` built from approved structured Scripture (USX or USFM) and normalized intermediate JSON; one mutable `user.sqlite`; JSON + IndexedDB browser development adapters behind the same small ports.                                      |
| Content       | One edition for V1; exact edition/canon/audience/rights **verification required**. Never ship invented Scripture. Synthetic fixtures are clearly labeled and excluded from public builds.                                                                          |
| References    | Stable edition ID + versification ID + stable book code + chapter label + source verse label; ordered verse units may represent bridges/subverses. Cross-edition alignment is never assumed.                                                                       |
| User data     | Plain-text standalone/verse-linked notes; bookmarks; whole-verse highlights; preferences; reading position. UTC timestamps, UUID IDs, edition-aware anchors.                                                                                                       |
| Backup        | Versioned portable JSON of user records, no Scripture payload; validate first and atomically replace user records only after explicit destructive-restore confirmation and a recoverable pre-restore snapshot. No merge in V1.                                     |
| Search        | Separate reference parser; desktop FTS5 over a derived normalized text projection, browser equivalent query semantics on fixture/indexed JSON. No English stemming. Source display text is unchanged.                                                              |
| Languages     | Interface locale and Scripture edition are separate settings. V1 Afaan Oromo and English UI catalogs need fluent review; available Bible content remains one approved edition.                                                                                     |
| UI            | Scripture-centered layout, light/dark/system themes, WCAG 2.2 AA goal, keyboard and screen-reader support. No dashboard blocks imposed on reading.                                                                                                                 |
| Compatibility | Before public V1.0: break/refactor/reset development data freely; remove obsolete code; no historical migrations, compatibility shims, or deprecated alternatives. After V1.0: preserve user data and introduce tested migrations.                                 |
| Milestones    | Phase 0 foundation/decisions; Phase 1 vertical slice; Phase 2 complete reader/content; Phase 3 reliability/beta; Phase 4 V1.0 release. Post-V1: 1.1 editions/parallel prerequisites; 1.2 study workspace; 1.3 optional AI pilot; sync/platforms later on evidence. |

The desktop access choice gives real read-only content handles and atomic user-data transactions at a narrow native boundary. It costs a small Rust repository implementation. Keep it limited to these needs; do not create a backend, dependency-injection framework, or general database protocol.

The implemented close guard pauses note editing/autosave, checks the latest draft and offers Save/Discard/Cancel before explicit main-window destruction or approved application exit. Discard retains committed autosaves. Browser unload warnings remain browser-only. macOS Command-Q, application-menu Quit and Dock Quit still need native qualification. See [ARCHITECTURE.md](ARCHITECTURE.md) and [FEATURE_SPECIFICATIONS.md](FEATURE_SPECIFICATIONS.md) for the owning contracts and behavior.

The proposed initial Linux qualification target is **Ubuntu 24.04 LTS x86_64 with GNOME**, with `.deb` as the primary package. Support floors remain proposed until target testing passes; other distributions and Linux ARM are not yet promised. Linux native launch, restart, accessibility and packaging are V1 release gates. The Ubuntu container now supplies separate real Tauri/WebKitGTK smoke evidence alongside the earlier headless SQLite results; X11/Openbox under Xvfb does not establish full GNOME X11/Wayland, Orca or `.deb` qualification. The packaging and qualification matrix is owned by [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md).

## Document map and ownership

| Document                                               | Source of truth for                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| [PRD.md](PRD.md)                                       | Product goals, audience assumptions, decisions and release outcomes |
| [ROADMAP.md](ROADMAP.md)                               | Milestones, task order, exact Phase 1 handoff                       |
| [MVP_SCOPE.md](MVP_SCOPE.md)                           | V1 required features, exclusions and completion gates               |
| [USER_STORIES.md](USER_STORIES.md)                     | Practical journeys and scenario acceptance                          |
| [ARCHITECTURE.md](ARCHITECTURE.md)                     | Boundaries, service contracts and architecture diagram              |
| [TECH_STACK.md](TECH_STACK.md)                         | Dependency choices, versions and tooling verification               |
| [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)           | Files and module responsibilities                                   |
| [DATA_MODEL.md](DATA_MODEL.md)                         | Record definitions, identities and invariants                       |
| [SCRIPTURE_PIPELINE.md](SCRIPTURE_PIPELINE.md)         | Source-to-content-pack integrity and edition lifecycle              |
| [STORAGE_STRATEGY.md](STORAGE_STRATEGY.md)             | Desktop/browser persistence, transactions and backup                |
| [UI_UX_GUIDELINES.md](UI_UX_GUIDELINES.md)             | Licensed UI policy, design tokens and accessibility                 |
| [FEATURE_SPECIFICATIONS.md](FEATURE_SPECIFICATIONS.md) | Observable feature behavior and edge cases                          |
| [DEVELOPMENT_GUIDELINES.md](DEVELOPMENT_GUIDELINES.md) | Daily commands, conventions and compatibility policy                |
| [TESTING_STRATEGY.md](TESTING_STRATEGY.md)             | Test layers, fixtures, platform and quality gates                   |
| [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md)             | Packaging, signing, distribution and V1 transition                  |
| [CONTENT_LICENSING.md](CONTENT_LICENSING.md)           | Resource register, permissions and attribution gates                |
| [AGENTS.md](AGENTS.md)                                 | Binding implementation instructions for coding agents               |

When decisions change, update their owning document and this table's affected baseline, then affected contracts/tests. Do not copy complete specifications between documents. Resolve conflicts before dependent implementation; the user's explicit instructions take precedence.

## Initial uncertainty register

| Uncertainty                                                                   | Owner / resolution point                                              | Safe progress now                                                                                                  |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Exact established Oromo edition, intended readers and canon                   | Product/content owner before full corpus import/public distribution   | Synthetic fixtures and authorized samples only                                                                     |
| Actual purchased Shadcnblocks source and license terms                        | Design owner before custom alternatives or public source distribution | Inventory official catalog and available files; underlying shadcn primitives for the shell                         |
| Vite+/Varlock native loading                                                  | Engineering during Phase 1                                            | Frontend checks and Ubuntu-container embedded native loading pass; Windows/macOS and full GNOME checks remain open |
| Windows/macOS/Linux support floors, architectures, signing/integrity, funding | Release owner before beta                                             | Provisional matrix and untrusted local dev builds only; qualify Ubuntu 24.04 LTS x86_64 GNOME first for Linux      |
| Oromo UI wording and search normalization                                     | Fluent reviewer before beta                                           | English fallback; no invented confirmed translations                                                               |

All dates, benchmark targets and provisional support choices are planning values until measured. Read [ROADMAP.md](ROADMAP.md) last for the ordered **Phase 1 Implementation Plan**.
