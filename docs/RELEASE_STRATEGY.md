# Release strategy

Status: approved release process; edition distribution rights, signing accounts, supported OS floors and architecture artifacts require verification. The first public production release is **V1.0**, regardless of the number or labels of development iterations.

## Release stages

| Stage                  | Purpose                                                | Exit evidence                                                                                                            |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Phase 1 development    | Prove one React/native slice and tooling               | Browser checks plus real Tauri SQLite read/write/restart evidence; missing native prerequisites remain explicit blockers |
| Phase 2 internal alpha | Complete V1 features and authorized corpus integration | Scope acceptance checks, reproducible content pack, full data/backup journeys                                            |
| Phase 3 private beta   | Stabilize actual installed applications                | Native platform testing, Oromo review, accessibility review and recovery drills                                          |
| Phase 4 public V1.0    | Publish trustworthy offline installers                 | All gates below, signed artifacts and release notes                                                                      |

Private testers must receive an explicit development-data notice before use: schemas and backups can be reset or replaced until V1.0, and experimental records are not promised preservation. Keep private distribution within verified content permissions; private testing does not waive licensing. Do not call a build public production while using the pre-release data policy.

## Platform and packaging decisions

V1 targets Windows and macOS with Tauri 2 bundles. Use the standard Tauri platform packager. Choose one primary Windows installer format for the first supported matrix, and macOS `.app` distributed in a `.dmg`; do not add alternate package managers or stores without a requirement. A signed Windows NSIS installer is the initial recommendation, subject to a verified install/uninstall test. MSI is optional if a documented deployment need justifies it.

The candidate support matrix is Windows 11 x64 and macOS 14 or newer on Apple silicon and Intel. This is a planning proposal, not a verified support claim. Before beta, confirm the product audience, current Tauri/WebView minimums and dependency deployment targets, then either validate each architecture or explicitly narrow the published matrix. Publish exact tested minimum versions and architectures; universal macOS bundles require both slices and native testing. Do not imply Windows ARM support merely because an x64 application may run under emulation.

Build and sign Windows artifacts on Windows and macOS artifacts on macOS using native CI runners or controlled native build hosts. Keep dependency versions and Rust toolchain pinned and the lockfiles committed. Development on Linux cannot produce sufficient evidence of native installation or signing. Confirm GTK/WebKit prerequisites separately if Linux Tauri development is used; Linux distribution is outside V1.

Windows requires a WebView2 runtime. Core app use is offline after installation, but a WebView2 bootstrapper can require network during installation. Decide explicitly between a prerequisite already on the machine, an installer that downloads it, or a permitted bundled offline runtime installer. Disclose which path each artifact provides; if advertised as an offline installer, it must install on a clean supported machine without internet. Verify Microsoft redistribution terms, artifact size and [Tauri's WebView2 options](https://v2.tauri.app/distribute/windows-installer/#webview2-installation-options) before claiming that path. Test the absence of WebView2 as well as the preinstalled case. Never equate bundled Bible text with a fully offline installer.

## Signing and trust

- Windows: verify access to an appropriate Authenticode signing identity/service, sign executables/installers as required, use trusted timestamping and verify signatures on the final downloaded artifact. Test the real clean-machine install flow; signing alone does not guarantee immediate SmartScreen reputation.
- macOS: obtain the appropriate Apple Developer identity, sign nested binaries correctly with the required runtime/entitlements, notarize, staple where applicable, and assess the final application/DMG with platform verification tools. Test a downloaded/quarantined copy through Gatekeeper on a clean user account.
- CI credentials belong in the CI secret store or signing service. Never commit private keys, certificates with passwords, tokens or account secrets. Varlock validates declared build environment requirements; values exposed to the renderer must never contain these secrets.
- Missing signing credentials block public release, while local unsigned development may continue. Do not label unsigned development bundles as production ready.

Record the signing identity identifier, verification result and timestamp without disclosing secrets. Confirm signing and notarization requirements against current Apple, Microsoft and Tauri documentation when configuring them; start with [Tauri Windows signing](https://v2.tauri.app/distribute/sign/windows/) and [macOS signing/notarization](https://v2.tauri.app/distribute/sign/macos/).

## Artifact and content provenance

Each candidate records source commit, app version, toolchain/lockfile versions, content importer version, content manifest/hash, copyright/attribution, license disposition, OS/architecture and SHA-256 hashes of final installers. Build `library.sqlite` from approved inputs with the documented pipeline; do not manually patch the release database. Keep original licensed inputs in the location allowed by their permissions, outside a public repository when required.

Package the immutable content database and required UI/fonts/icons locally. Exclude synthetic fixtures, development adapters, credentials, raw paid component packages and unauthorized source text from public artifacts. Licensed component code incorporated in the finished app must follow the actual Shadcnblocks agreement; inspect the terms before making the source repository public. Produce third-party notices for dependencies and resources using reviewed license data.

The mutable `user.sqlite` lives in the platform's application-data directory, never inside the signed installation bundle. Installer replacement must not overwrite user records. Uninstall behavior must be tested and documented; do not delete personal data silently. There is no remote backend requirement or mandatory account.

## Candidate checklist

A release owner records a pass, failure or explicit blocker for each item; an unchecked required item blocks V1.0.

1. All required behavior in [MVP_SCOPE.md](MVP_SCOPE.md) passes and deferred features remain excluded. No placeholder Scripture or unreviewed translation labels are presented as real content.
2. Edition source, reproduction and distribution rights, attribution, territory/platform restrictions and allowed transformations have written dispositions in [CONTENT_LICENSING.md](CONTENT_LICENSING.md). The app exposes edition and license details offline.
3. Type checking, linting, unit/integration suites, Rust tests, content verification, browser journeys and production builds pass from the recorded commit. Native suites actually run on every published OS/architecture combination.
4. Installation succeeds under the artifact's disclosed prerequisite/network conditions. Once installed, launch, read, navigate, search, copy, annotate, restart, export and restore work with network disabled. Verify no remote fonts/assets or browser adapter fallback.
5. Fluent Oromo content/UI reviewers approve the defined samples; NVDA/VoiceOver and keyboard checks pass; measured performance meets the agreed budgets.
6. Disk-full/denied-write handling, interrupted transactions, corrupt-data handling and a restore drill preserve records. Restore with an unavailable edition retains anchors and offers a useful unavailable-content state.
7. Installed app-data paths, clipboard, native dialogs, focus, resizing, system theme, app relaunch and Unicode filesystem paths work. Verify shortcuts under each OS's conventions.
8. Final downloaded installers pass signing/notarization/hash checks. WebView2 prerequisite handling passes on Windows, including a clean disconnected install for any artifact advertised as an offline installer. No release-blocking known issue remains.
9. Publish clear installation, supported-platform, backup/restore, content attribution, version and known-issue information. User-facing text matches actual behavior.

Keep reports and final artifact hashes with the release record. Do not claim tests passed if the environment, rights, corpus or signing identity were unavailable.

## Updates, data and the V1.0 boundary

Use manually downloaded, signed installer updates for V1. No Tauri updater plugin, background download, account or update backend is required. Users obtain releases through the selected official distribution page; show an application version and a stable release link. Verify the distribution host and its ownership before publishing. TLS and release hashes complement platform signatures but do not replace them.

Before V1.0, change schemas, APIs and internal formats directly; recreate developer databases deliberately and remove obsolete implementations. Do not add migrations or compatibility shims for abandoned development schemas. Never reset records silently on normal launch. The first public release freezes the first supported user schema and portable backup format.

After V1.0, preserve user records, keep content and user database upgrades separate, and require tested user-database migrations before any public schema change. Take a recoverable snapshot before migration, run changes transactionally, detect unsupported newer schemas and stop without mutation on failure. Test interruption, insufficient disk space and recovery. Database downgrade is not assumed safe; document rollback via the retained compatible application/data snapshot rather than opening a newer database with older code. Support backup versions according to a published policy.

Content-pack replacement must preserve edition/versification identity rules and user anchors, and obey the source license. A text revision or removed edition needs reviewed handling before distribution. V1 does not need an independent content updater; ship validated content with signed application releases.

Personal backup is versioned JSON containing user records and edition-aware references, without Scripture payload. It is a user-controlled recovery mechanism, separate from automatic application installation. Restoration validates before mutation, requires explicit destructive replacement confirmation and a recoverable pre-restore snapshot, then replaces records atomically; V1 does not merge. Explain clearly that JSON exports contain private notes in plaintext and let the user choose the destination.

## Post-release response

Provide one documented issue/support route before release. Request version, OS and reproducible steps; do not request private notes or a complete backup by default. If a serious data-loss, content-integrity or licensing issue appears, pause distribution of the affected artifact, retain its identity, communicate the affected versions and provide a tested signed corrective release. Avoid changing released files in place under the same version/hash.

Optional automatic updates, synchronization, hosted AI and additional platforms require later scoped decisions. They must not become requirements for offline reading or delay a useful, correctly licensed V1.
