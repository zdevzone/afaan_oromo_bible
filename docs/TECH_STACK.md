# Technology stack

Status: adopted engineering baseline with the Phase 1 scaffold installed and checked, 2026-10-20. Exact versions are recorded in the manifests, toolchain pins and resolved lockfiles. See the root [README.md](../README.md#current-status) for current verification evidence and remaining gates, [ARCHITECTURE.md](ARCHITECTURE.md) for boundaries, and [ROADMAP.md](ROADMAP.md) for implementation order.

## Selected dependencies

| Area                      | Selection                                                                                | Concrete purpose / constraints                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application               | React, React DOM, TypeScript with strict checking                                        | One component tree and application-service layer for browser development and desktop.                                                                           |
| Frontend toolchain        | Project-local `vite-plus`; global `vp` for developer convenience                         | Vite development/builds, Vitest, Oxlint, Oxfmt, and static checks through one toolchain. Commit its exact version and lockfile.                                 |
| React integration         | React plugin supported by the selected Vite+ scaffold                                    | JSX and Fast Refresh; keep the scaffold's compatible plugin rather than adding competing transforms.                                                            |
| Styling                   | Tailwind CSS with its supported Vite integration                                         | Shared design tokens and application styling; verify compatibility with purchased blocks when selecting the major version.                                      |
| Components                | Purchased Shadcnblocks Pro source first, underlying shadcn/ui primitives                 | Copy only components actually used; inspect their source, accessibility, dependencies, and license. No invented block names or promise of installed Pro assets. |
| Environment configuration | `varlock`, `@varlock/vite-integration`                                                   | Validate `.env.schema`, generate typed configuration, and supply public build values. No V1 runtime secret or remote service is required.                       |
| Native shell              | Tauri 2, `@tauri-apps/api`, `@tauri-apps/cli`; matching Rust Tauri crates                | Windows, macOS and Linux packaging and narrow native access. CLI is a development dependency.                                                                   |
| Desktop persistence       | Rust `rusqlite` with `bundled` SQLite                                                    | Parameterized queries, read-only Scripture handles, FTS5, and atomic user-data operations behind named commands. No SQL strings cross IPC.                      |
| Rust serialization        | `serde`, `serde_json`                                                                    | Validated DTOs and portable user-data JSON. Add other crates only for a specific implemented need.                                                              |
| Native slice helpers      | `sha2`, `unicode-normalization`, `regex`, `uuid`                                         | Checksum-named immutable test artifacts, search-token parity, persistent development database IDs and recovery file names.                                      |
| Clipboard                 | Tauri clipboard-manager plugin and matching frontend package                             | Used by explicit verse copy; grant write-text only, with a browser development adapter.                                                                         |
| Backup file dialogs       | Rust `tauri-plugin-dialog`; Rust standard file operations                                | User-chosen open/save paths, bounded imports and temporary-file export behind narrow commands; no generic renderer filesystem access.                           |
| Browser development       | Structured JSON content fixture and IndexedDB user-data adapter                          | Same application ports; fixtures remain small and explicitly synthetic. Direct IndexedDB is sufficient initially.                                               |
| Unit/component tests      | Vite+'s bundled test runner, React Testing Library, user-event, jsdom and fake-indexeddb | Installed for user behavior, domain rules, IndexedDB transactions and ordered note-save tests.                                                                  |
| Browser journeys          | Playwright                                                                               | Installed for shared reader/note journeys; browser checks do not validate native SQLite or installers.                                                          |
| Accessibility checks      | Pinned `@axe-core/playwright` in browser journeys                                        | Scans the reader and core visible panels; supplement keyboard, NVDA, VoiceOver and Orca testing. Automated findings alone do not prove accessibility.           |

shadcn components may require utilities, icons, or primitive packages. Install the dependencies required by the actual selected source rather than guessing a universal dependency list. Follow [UI_UX_GUIDELINES.md](UI_UX_GUIDELINES.md).

Use React state/context and ordinary hooks first. Add a state library, router, query cache, form library, or schema-validation library only after a concrete feature shows the benefit. Validation of native commands, content files, and backups is mandatory regardless of which validation tools are selected. No full-stack framework, ORM, Tauri SQL plugin, hosted database, authentication provider, rich-text editor, AI SDK, or second component library belongs in the initial dependency set.

## Runtime, versions, and reproducibility

Use **Node.js 24 LTS** and **pnpm 10**, pinned exactly in `.node-version` and `package.json` with one resolved `pnpm-lock.yaml`. The installed pins satisfy the current dependency graph, including the test environment. Keep those files and the `engines` range consistent; never use `latest` as a reproducible build pin. The root [README.md](../README.md#current-status) records installed versions. Vite+'s global environment command can resolve a supported runtime and write an exact pin. See its [environment selection rules](https://viteplus.dev/guide/env).

Vite+ requires a supported Node patch, not merely a major-only label. The installed jsdom test environment also has a Node patch floor, so use the repository pin rather than the lowest runtime accepted by one package. Recheck installed package engine/peer metadata when changing the graph. Node and Rust are developer/build requirements; desktop end users do not install either. Sources: [Vite+ testing](https://viteplus.dev/guide/test), [Varlock Vite requirements](https://varlock.dev/integrations/vite/).

The stable Rust toolchain is pinned in `rust-toolchain.toml`; `src-tauri/Cargo.lock` was resolved by Cargo, and the pin has tested the headless SQLite repository and compiled the full native debug application in the Ubuntu 24.04 development container. Windows/macOS and Linux release-desktop qualification remain separate gates. Windows needs the documented MSVC/WebView2 build environment; macOS needs Xcode tooling. Linux desktop builds need GTK3 and WebKitGTK 4.1 development prerequisites. Use the maintained [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) rather than copying a stale minimum Rust version from an unrelated plugin.

Linux desktop is required for V1. The proposed initial qualification target is Ubuntu 24.04 LTS x86_64 with GNOME; `.deb` is the primary planned Linux artifact. The package relies on declared compatible system GTK/WebKit runtime dependencies, and must be tested on a clean baseline installation. It does not bundle a full private system WebKit or establish support for arbitrary Linux distributions. See [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md) for package qualification. A successful Linux launch, a headless Rust pass and Windows/macOS validation are separate evidence.

Global `vp` is a machine-level launcher; local `vite-plus` supplies the project's reproducible frontend toolchain. Both are installed in the current environment. Installing the global CLI alone does not establish the project version. Preserve `pnpm-workspace.yaml`'s matching Vite+ core and bundled Vitest overrides so plugins and tests resolve the same toolchain. Do not independently add another vanilla Vite or Vitest version. Sources: [global setup](https://viteplus.dev/guide/), [project-local CLI](https://viteplus.dev/guide/local-cli), [dependency rules](https://viteplus.dev/guide/migrate-rules).

## Vite+ workflow

The scaffold exposes these commands. Check global availability before installing Vite+ on a new host; do not scaffold over the existing application or documentation.

```sh
vp --version
vp help
vp env current
vp toolchain
vp install --frozen-lockfile
vp exec varlock codegen
vp dev
vp run typecheck
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

Local `varlock` and `@varlock/vite-integration` are installed. The official integration exposes `varlockVitePlugin()` and the typed `ENV` import below. This repository has verified code generation, rejection of an invalid `APP_TARGET`, and browser/native-target renderer builds through Vite+. That evidence does not establish a native window launch or a vendor-certified combination. Source: [Varlock Vite integration](https://varlock.dev/integrations/vite/).

```ts
// Documentation example, not an implementation file.
import { defineConfig } from "vite-plus";
import { varlockVitePlugin } from "@varlock/vite-integration";

export default defineConfig({
  plugins: [varlockVitePlugin() /* selected React/Tailwind plugins */],
  lint: { options: { typeAware: true, typeCheck: true } },
});

// Application configuration reads:
import { ENV } from "varlock/env";
```

```sh
vp exec varlock codegen
vp exec varlock load --agent
```

`.env.schema` is committed and uses `@generateTsTypes` to generate `env.d.ts`; regenerate declarations instead of writing a substitute by hand. The application, tooling and test TypeScript configurations include those declarations. The schema sets `@defaultSensitive=true` explicitly and marks public `APP_TARGET` with `@sensitive=false`. Do not rerun initialization over this policy. Sources: [installation](https://varlock.dev/getting-started/installation/), [root decorators](https://varlock.dev/reference/root-decorators/).

All renderer values are public: Varlock replaces non-sensitive `ENV` reads at build time without requiring a `VITE_` prefix. Treat every bundled value as inspectable. Do not put API keys, signing credentials, proprietary download tokens, or private user data in frontend configuration. Varlock validates configuration; it cannot hide secrets embedded in a desktop application.

V1 should run with checked-in, non-secret defaults and no developer `.env.local`. Environment variables are build/development inputs, not a settings database. User preferences live in `user.sqlite`. Ignore secret-bearing local overrides and never print raw resolved values to agent logs; `varlock load --agent` is the documented redacted inspection mode. Use `varlock run -- <command>` for scripts needing validated process variables. Source: [load/run reference](https://varlock.dev/reference/cli/load-and-run/).

If multiple build environments become necessary, use `@currentEnv=$APP_ENV`, with an enum and explicit defaults. It is separate from Vite's mode and overrides Varlock's `--env` flag. A small Node launcher can set `APP_ENV` and invoke the local CLI consistently on Windows, macOS and Linux; do not document POSIX-only inline assignments as universal commands. Keep signing secrets in CI's native packaging step, outside the frontend schema.

## Tauri and SQLite integration decisions

Tauri automatically merges `src-tauri/tauri.linux.conf.json` on Linux. This small override selects `bundle.targets: ["deb"]`; shared window, security, icons and the internal `bundle.active: false` setting stay in `tauri.conf.json`. This is packaging configuration for the planned Linux artifact, not evidence that a `.deb` has been built or qualified. Platform overrides follow the [documented configuration merge](https://v2.tauri.app/reference/config/#platform-specific-configuration).

Tauri runs the same built React assets. The configured Vite port matches `devUrl`, `strictPort` is enabled, `frontendDist` is `../dist`, and the Vite watcher ignores `src-tauri/**`. `clearScreen: false` keeps native build errors visible. Use `vp run desktop:dev` or `vp run desktop:check`: `tools/native.mjs` sets `APP_TARGET=tauri` before Tauri invokes its `vp dev`/`vp build` hooks. A raw Tauri invocation can otherwise receive browser-target assets. The internal wrappers explicitly enable `development-content`; public packaging is a separate blocked gate. Verify the WebView support floor against the renderer build target on supported hosts. Source: [Tauri's Vite guide](https://v2.tauri.app/start/frontend/vite/).

Use custom commands for operations such as reading a chapter, searching, saving a note, and restoring user records. Rust owns database paths and transaction boundaries. The renderer supplies validated DTOs, never SQL, arbitrary table names, or arbitrary filesystem paths. `rusqlite` is synchronous: run database work off the UI/main event path and serialize mutable operations through a small owned connection strategy. Do not construct a general database RPC service.

The `bundled` feature avoids reliance on an end user's SQLite installation. The current underlying build enables FTS5, but every native build must prove it can create/query an FTS5 table; dependency or build-flag changes can alter behavior. Use a genuinely read-only content handle and transactions for user-data replacement. No loadable extensions are needed. Sources: [rusqlite](https://github.com/rusqlite/rusqlite), [bundled build flags](https://github.com/rusqlite/rusqlite/blob/master/libsqlite3-sys/build.rs), [SQLite FTS5](https://www.sqlite.org/fts5.html).

Add clipboard/dialog or other Tauri plugins only when their feature needs them and grant only necessary permissions. There is no reason to enable shell execution, generic filesystem access, or a network client for the reader. See [Tauri capabilities](https://v2.tauri.app/security/capabilities/).

Keep the clipboard plugin's JavaScript and Rust major/minor versions aligned; the Tauri CLI checks this agreement. JavaScript is pinned to `@tauri-apps/plugin-clipboard-manager` **2.4.2**, Rust requests `tauri-plugin-clipboard-manager = "~2.4.2"`, and `Cargo.lock` resolves **2.4.2**. An unconstrained Rust `"2"` previously selected 2.5 and failed the CLI check. Update both sides deliberately, retain the scoped write-text permission, and verify the actual native build rather than relying on a frontend type check.

The native window lifecycle uses the verified Tauri **2.12.4** `getCurrentWindow().onCloseRequested` API. The adapter installs its preventing listener during service composition, before React mounts the editor, and delegates decisions through the small `DesktopWindow` port. After clean/save/discard work settles, `destroy()` closes the authorized window without re-entering the close-request listener. Only `core:window:allow-destroy` was added to the existing scoped capability. Focused tests and the actual Openbox Alt+F4 run now pass Cancel, intentional Discard, real SQLite busy-timeout Save failure, unlocked retry/reopen and clean close. This window API does not currently protect macOS Command+Q/menu/Dock Quit or external SIGTERM/crash paths; platform-exit qualification and persistence recovery stay separate.

## Phase 1 technology acceptance

- Exact Node, package-manager, local Vite+, and Rust versions are recorded; lockfiles resolve on clean supported hosts.
- The React shell has HMR in a browser and loads the same assets in Tauri on Windows, macOS and the Linux qualification baseline.
- Varlock rejects an invalid required value; typed public values work in development/build; a synthetic sensitive sentinel is absent from the renderer artifact.
- Static checks include type checking; tests run once in CI.
- Native SQLite proves read-only content access, persistent user data, rollback on failure, and FTS5 availability through narrow commands.
- No browser fixture or IndexedDB adapter becomes a silent fallback in a packaged desktop build.

The current workspace has pinned toolchains, resolved lockfiles and generated Varlock declarations. The Ubuntu 24.04 container (GTK 3.24.41, WebKitGTK 2.52.6/4.1 API) now passes the full embedded native debug build and a network-disabled synthetic Xvfb/Openbox smoke for reference navigation, clipboard, search, committed notes and position recovery after restart. The [Linux guide](../tools/linux/README.md) documents the separate Ubuntu artifact cache and test-session compositing workaround. Current exact commands/results live in the root [README.md](../README.md#current-status). The native keyboard/modal smoke, actual window-close failure/retry run, 71 Vitest tests across six files, type checking, Vite+ checks and two Chromium journeys pass. GNOME X11/Wayland, Orca, clean-host `.deb`, Windows/macOS and application-level Quit qualification remain pending. This native development result does not close Phase 1's remaining platform checks or V1 qualification.
