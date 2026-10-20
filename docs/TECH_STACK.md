# Technology stack

Status: adopted engineering baseline, 2026-10-19. Exact package versions are selected and locked when the application is scaffolded; this document does not claim that the application or native toolchain is installed. See the repository status for observed tooling results, [ARCHITECTURE.md](ARCHITECTURE.md) for boundaries, and [ROADMAP.md](ROADMAP.md) for implementation order.

## Selected dependencies

| Area | Selection | Concrete purpose / constraints |
| --- | --- | --- |
| Application | React, React DOM, TypeScript with strict checking | One component tree and application-service layer for browser development and desktop. |
| Frontend toolchain | Project-local `vite-plus`; global `vp` for developer convenience | Vite development/builds, Vitest, Oxlint, Oxfmt, and static checks through one toolchain. Commit its exact version and lockfile. |
| React integration | React plugin supported by the selected Vite+ scaffold | JSX and Fast Refresh; keep the scaffold's compatible plugin rather than adding competing transforms. |
| Styling | Tailwind CSS with its supported Vite integration | Shared design tokens and application styling; verify compatibility with purchased blocks when selecting the major version. |
| Components | Purchased Shadcnblocks Pro source first, underlying shadcn/ui primitives | Copy only components actually used; inspect their source, accessibility, dependencies, and license. No invented block names or promise of installed Pro assets. |
| Environment configuration | `varlock`, `@varlock/vite-integration` | Validate `.env.schema`, generate typed configuration, and supply public build values. No V1 runtime secret or remote service is required. |
| Native shell | Tauri 2, `@tauri-apps/api`, `@tauri-apps/cli`; matching Rust Tauri crates | Windows/macOS packaging and narrow native access. CLI is a development dependency. |
| Desktop persistence | Rust `rusqlite` with `bundled` SQLite | Parameterized queries, read-only Scripture handles, FTS5, and atomic user-data operations behind named commands. No SQL strings cross IPC. |
| Rust serialization | `serde`, `serde_json` | Validated DTOs and portable user-data JSON. Add other crates only for a specific implemented need. |
| Native slice helpers | `sha2`, `unicode-normalization`, `regex` | Checksum-named immutable test artifacts and parity with the bounded token profile; no general search framework. |
| Clipboard | Tauri clipboard-manager plugin and matching frontend package | Used by explicit verse copy; grant write-text only, with a browser development adapter. |
| Browser development | Structured JSON content fixture and IndexedDB user-data adapter | Same application ports; fixtures remain small and explicitly synthetic. Direct IndexedDB is sufficient initially. |
| Unit/component tests | Vite+'s bundled test runner; React Testing Library, user-event, a compatible DOM environment when component tests begin | Test user behavior, domain rules, and adapter contracts. Add test packages at the task that first needs them. |
| Browser journeys | Playwright, added when an end-to-end journey exists | Exercise the shared React UI; browser checks do not validate native SQLite or installers. |
| Accessibility checks | axe integration in relevant browser/component tests | Supplement keyboard, NVDA, and VoiceOver testing; automated findings alone do not prove accessibility. |

shadcn components may require utilities, icons, or primitive packages. Install the dependencies required by the actual selected source rather than guessing a universal dependency list. Follow [UI_UX_GUIDELINES.md](UI_UX_GUIDELINES.md).

Use React state/context and ordinary hooks first. Add a state library, router, query cache, form library, or schema-validation library only after a concrete feature shows the benefit. Validation of native commands, content files, and backups is mandatory regardless of which validation tools are selected. No full-stack framework, ORM, Tauri SQL plugin, hosted database, authentication provider, rich-text editor, AI SDK, or second component library belongs in the initial dependency set.

## Runtime, versions, and reproducibility

Use **Node.js 24 LTS**, pinned to an exact supported patch during scaffolding, and **pnpm 10**, also pinned exactly, with one `pnpm-lock.yaml`. Record the actual selected versions in repository setup/status and manifests; never use `latest` as a reproducible build pin. Keep `.node-version`, `packageManager`, and any `engines` ranges consistent. Vite+'s global environment command can resolve the major once and write an exact pin. See its [environment selection rules](https://viteplus.dev/guide/env).

At the documentation check, the current Vite+ test documentation specified Node `^22.18.0 || ^24.11.0 || >=26.0.0`. Node 24 must therefore be at least 24.11.0 for that toolchain; recheck requirements for the selected release rather than treating a major-only label as sufficient. Varlock's Vite integration specifies Node >=22 and Vite >=5. These are tool requirements, not support requirements for end users, who do not install Node. Sources: [Vite+ testing](https://viteplus.dev/guide/test), [Varlock Vite requirements](https://varlock.dev/integrations/vite/).

Pin a stable Rust toolchain compatible with selected Tauri/rusqlite crates in a root `rust-toolchain.toml`; commit `src-tauri/Cargo.lock`. Verify native prerequisites on each build host. Windows needs the documented MSVC/WebView2 build environment; macOS needs Xcode tooling. Linux development requires its GTK/WebKit dependencies and does not prove Windows/macOS behavior. Use the maintained [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) rather than copying a stale minimum Rust version from an unrelated plugin.

Global `vp` is a machine-level launcher; local `vite-plus` supplies the project's reproducible frontend toolchain. Installing the global CLI alone does not establish the project version. The Vite+ scaffold should configure required Vite aliases/overrides; preserve them so plugins and tests resolve the same core. Do not independently add another vanilla Vite or Vitest version. Sources: [global setup](https://viteplus.dev/guide/), [project-local CLI](https://viteplus.dev/guide/local-cli), [dependency rules](https://viteplus.dev/guide/migrate-rules).

## Vite+ workflow

These are planned commands after the project exists. Check the installed CLI help before scaffolding into a directory that already contains documentation; preserve these documents and agent instructions.

```sh
vp --version
vp help
vp env current
vp toolchain
vp install
vp dev
vp check
vp test
vp test watch
vp build
vp preview
```

Use `defineConfig` from `vite-plus` in `vite.config.ts`. Put the test configuration there and import test APIs from `vite-plus/test`; ordinary unit tests do not need a direct `vitest` dependency. Enable `lint.options.typeAware` and `typeCheck` so `vp check` includes type checking. `vp test` runs once by default; watch is explicit. See [test configuration](https://viteplus.dev/guide/test) and [static checks](https://viteplus.dev/guide/check).

`vp dev`, `vp build`, and `vp test` are built-ins and do not run same-named package scripts. Use `vp run <script>` for an application wrapper, such as a production environment selector plus checks/build. Use `vp exec <binary>` for project-installed tools; unlike a download-on-demand runner, it does not fetch a missing CLI. These distinctions matter for CI and Tauri hooks. See [built-in build behavior](https://viteplus.dev/guide/build) and [binary execution](https://viteplus.dev/guide/vpx).

Do not add standalone ESLint, Prettier, Oxlint, Oxfmt, or another task runner by default. Configure the Vite+ tools and retain additional tooling only when a required capability is demonstrably missing.

## Varlock integration and public configuration

Add `varlock` and `@varlock/vite-integration` locally. The official integration exposes `varlockVitePlugin()` and the typed `ENV` import below; combining it with Vite+ uses the Vite plugin interface and still requires a Phase 1 integration test. No official claim of a tested Vite+/Tauri/Varlock combination is made here. Source: [Varlock Vite integration](https://varlock.dev/integrations/vite/).

```ts
// Documentation example, not an implementation file.
import { defineConfig } from 'vite-plus';
import { varlockVitePlugin } from '@varlock/vite-integration';

export default defineConfig({
  plugins: [varlockVitePlugin() /* selected React/Tailwind plugins */],
  lint: { options: { typeAware: true, typeCheck: true } },
});

// Application configuration reads:
import { ENV } from 'varlock/env';
```

```sh
vp exec varlock init --agent
vp exec varlock load --agent
```

Review generated files: `init` may alter examples and does not choose the project's security policy. Commit `.env.schema`, use `@generateTsTypes` for `env.d.ts`, and include the generated declarations in relevant TypeScript configurations. Set `@defaultSensitive=true` explicitly and mark each intended public build value with `@sensitive=false`; the initializer's defaults must not silently determine exposure. Sources: [installation](https://varlock.dev/getting-started/installation/), [root decorators](https://varlock.dev/reference/root-decorators/).

All renderer values are public: Varlock replaces non-sensitive `ENV` reads at build time without requiring a `VITE_` prefix. Treat every bundled value as inspectable. Do not put API keys, signing credentials, proprietary download tokens, or private user data in frontend configuration. Varlock validates configuration; it cannot hide secrets embedded in a desktop application.

V1 should run with checked-in, non-secret defaults and no developer `.env.local`. Environment variables are build/development inputs, not a settings database. User preferences live in `user.sqlite`. Ignore secret-bearing local overrides and never print raw resolved values to agent logs; `varlock load --agent` is the documented redacted inspection mode. Use `varlock run -- <command>` for scripts needing validated process variables. Source: [load/run reference](https://varlock.dev/reference/cli/load-and-run/).

If multiple build environments become necessary, use `@currentEnv=$APP_ENV`, with an enum and explicit defaults. It is separate from Vite's mode and overrides Varlock's `--env` flag. A small Node launcher can set `APP_ENV` and invoke the local CLI consistently on Windows/macOS; do not document POSIX-only inline assignments as universal commands. Keep signing secrets in CI's native packaging step, outside the frontend schema.

## Tauri and SQLite integration decisions

Tauri runs the same built React assets. Match the configured Vite port to `devUrl`, enable `strictPort`, set `frontendDist` to `../dist`, and ignore `src-tauri/**` in Vite's watcher. Set `clearScreen: false` so native build errors remain visible. Tauri hooks must invoke the intended project scripts through `vp run` if they perform additional environment selection or validation. Check the chosen WebView support floor before choosing the build target. Source: [Tauri's Vite guide](https://v2.tauri.app/start/frontend/vite/).

Use custom commands for operations such as reading a chapter, searching, saving a note, and restoring user records. Rust owns database paths and transaction boundaries. The renderer supplies validated DTOs, never SQL, arbitrary table names, or arbitrary filesystem paths. `rusqlite` is synchronous: run database work off the UI/main event path and serialize mutable operations through a small owned connection strategy. Do not construct a general database RPC service.

The `bundled` feature avoids reliance on an end user's SQLite installation. The current underlying build enables FTS5, but every native build must prove it can create/query an FTS5 table; dependency or build-flag changes can alter behavior. Use a genuinely read-only content handle and transactions for user-data replacement. No loadable extensions are needed. Sources: [rusqlite](https://github.com/rusqlite/rusqlite), [bundled build flags](https://github.com/rusqlite/rusqlite/blob/master/libsqlite3-sys/build.rs), [SQLite FTS5](https://www.sqlite.org/fts5.html).

Add clipboard/dialog or other Tauri plugins only when their feature needs them and grant only necessary permissions. There is no reason to enable shell execution, generic filesystem access, or a network client for the reader. See [Tauri capabilities](https://v2.tauri.app/security/capabilities/).

## Phase 1 technology acceptance

- Exact Node, package-manager, local Vite+, and Rust versions are recorded; lockfiles resolve on clean supported hosts.
- The React shell has HMR in a browser and loads the same assets in Tauri on Windows and macOS.
- Varlock rejects an invalid required value; typed public values work in development/build; a synthetic sensitive sentinel is absent from the renderer artifact.
- Static checks include type checking; tests run once in CI.
- Native SQLite proves read-only content access, persistent user data, rollback on failure, and FTS5 availability through narrow commands.
- No browser fixture or IndexedDB adapter becomes a silent fallback in a packaged desktop build.

The observed documentation workspace was Linux with Node available and no `rustc`, `cargo`, `rustup`, GTK, or WebKit development tooling detected. That is a point-in-time observation, not a prohibition on installing prerequisites or evidence about target-platform support. Browser work can proceed; native gates must run after a suitable host is prepared. Actual global Vite+ installation results belong in repository status.
