# Ubuntu desktop development and native smoke checks

This directory supplies a development image and smoke harnesses for the actual Tauri window. The default flow uses synthetic content and a disposable user profile. The commands below describe the procedure; measured build/run results belong in the [repository status](../../README.md). An image build, renderer build or authored harness does not establish a passing native test.

## Local OOCS technical review

The development-content build can open the ignored OOCS technical SQLite pack for local visual and interaction review. Set `AOB_TECHNICAL_REVIEW_LIBRARY` to its absolute `library.sqlite` path and `AOB_TECHNICAL_REVIEW_SHA256` to the exact 64-character database digest, then run `vp run desktop:dev`. The current v4 digest is `8473adcfe9d59abac7b7f7efa4de994e575abac91bc882e135f66ecc7609e315`. The app verifies that digest, the registered source archive identity, `technical_only` status and SQLite integrity before opening content read-only. Personal data uses the separate `technical-review` development profile, and the reader displays an explicit distribution warning. Unset both variables to return to the synthetic fixture. This path is compiled only with `development-content`; it does not approve or package the source.

For a disposable changed-source import test only, `AOB_TECHNICAL_REVIEW_TEST_SOURCE_SHA256` may name the exact SHA-256 of a separately generated test archive. It overrides the registered source identity check only in `development-content` builds; the technical pack must still match its expected database digest, own source metadata, status and integrity checks. Never use this variable to characterize a pack as publisher-approved or to prepare a public artifact.

For a bounded Ubuntu Xvfb/Openbox check, run `tools/linux/run-technical-review-smoke.sh` inside the documented container/Xvfb/dbus session with the binary, absolute technical database path, database hash and a new ignored output directory. It verifies the visible warning, source bridge selection, exact clipboard quotation against the read-only technical database, a technical search result opening at its verse, and a linked note reopening after a distinct-process restart. It does not qualify search wording/relevance, a production package, GNOME, Orca or fluent visual presentation.

The review report records `search_submit_to_visible_ms` for the one `tiksu` query. This measures from before X11 Return to the AT-SPI-visible result count, with 150 ms visibility polling; treat it as a diagnostic observation rather than a latency percentile or the production performance gate.

Pass `technical-search-benchmark` as a fifth argument for a twelve-query warm native UI diagnostic. It uses frequent ASCII terms from the technical FTS index with distinct expected result counts, records a query-set hash and timing distribution without query words, and exits after the report is written. It remains an Xvfb development-build diagnostic, not the installed release performance gate.

Pass `technical-visual-samples` as a fifth argument to capture five selected native passages and write `review-guide.md` inside that ignored output directory. The guide links prose, heading, bridge, poetry and long-psalm screenshots and lists the source/publisher comparison points. Share only through a channel permitted for the source; do not move the image packet into `public/` or a release artifact.

The runner now fails if any of the five required screenshots is absent. The lean runtime image lacks Gdk introspection and can still run the AT-SPI flows, but visual capture needs an image with Gdk available, such as the documented Ubuntu development image. A previous runtime-image attempt produced passage tree reports but no PNG files; it is not visual evidence.

The underlying `native-smoke.py --screenshots` option also fails immediately when capture is unavailable. A 2026-10-24 negative run in the lean runtime image exited 1 with `Namespace Gdk not available`; the same installed-package visual flow passed in the development image and produced all five PNGs. Inspect the report's `status` and the actual image files before counting screenshot evidence.

The image is Ubuntu 24.04 with GTK 3, WebKitGTK 4.1 development libraries, Xvfb, Openbox, D-Bus, AT-SPI and test-only Python/X11 utilities. The initial image resolved GTK **3.24.41** and WebKitGTK **2.52.6**; `4.1` names the WebKitGTK API/package series. The base image is pinned, but APT package revisions can change on rebuild. Record the actual library versions with each result.

## Build the development image

Run from the repository root using an accessible local Docker daemon:

```sh
docker build \
  --secret id=system_ca,src=/etc/ssl/certs/ca-certificates.crt \
  -t afaan-oromo-linux-dev:ubuntu24 \
  tools/linux
```

The Dockerfile mounts the host certificate bundle as the read-only BuildKit secret `/run/secrets/system_ca` for package acquisition; it does not copy that bundle into an image layer. Adjust the source certificate path for another host. Keep session-specific proxy/registry configuration outside the Dockerfile and source control.

If the managed workspace has a read-only home directory, set `BUILDX_CONFIG=/workspace/.tooling/docker-buildx` for the build command so Buildx stores its own state in writable space. Keep the existing Docker registry configuration unchanged.

In this managed workspace, the usable daemon is the local socket. If the shell points at another Docker context or TLS endpoint, use this prefix in place of `docker` in the examples:

```sh
env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY \
  -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock
```

## Build an embedded native development application

The image supplies Linux libraries and compilers, while the workspace supplies its existing Node 24, Rust 1.90 and Vite+ installations, dependencies and lockfiles. It does not install a second JavaScript/Rust toolchain. The example below uses this workspace's actual locations; adapt the source mounts and user IDs for another machine.

Use **`/workspace/.tooling/target-ubuntu24`** for Ubuntu native artifacts. The outer host is Debian 13; its compiled Rust build scripts/binaries can depend on a newer glibc and must not be reused as Ubuntu artifacts. Sharing downloaded Cargo sources is different from sharing the native target directory.

Create the build container once. If `aob-linux-build` already exists from the same setup, use its `docker exec` command instead of creating another container with that name.

```sh
docker run -d --name aob-linux-build \
  --user 1000:1000 --shm-size=1g \
  --mount type=bind,src=/workspace,dst=/workspace \
  --mount type=bind,src=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node,dst=/opt/aob-node/node,readonly \
  --mount type=bind,src=/etc/ssl/certs/ca-certificates.crt,dst=/run/host-ca.pem,readonly \
  --workdir /workspace \
  --env PATH=/opt/aob-node:/workspace/.tooling/vite-plus/bin:/workspace/.tooling/cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  --env VP_HOME=/workspace/.tooling/vite-plus \
  --env CARGO_HOME=/workspace/.tooling/cargo \
  --env RUSTUP_HOME=/workspace/.tooling/rustup \
  --env CARGO_TARGET_DIR=/workspace/.tooling/target-ubuntu24 \
  --env CARGO_BUILD_JOBS=2 --env CARGO_PROFILE_DEV_DEBUG=0 \
  --env XDG_CONFIG_HOME=/workspace/.tooling/config \
  --env XDG_CACHE_HOME=/workspace/.tooling/cache \
  --env NODE_EXTRA_CA_CERTS=/run/host-ca.pem \
  --env CARGO_HTTP_CAINFO=/run/host-ca.pem \
  --env SSL_CERT_FILE=/run/host-ca.pem \
  afaan-oromo-linux-dev:ubuntu24 sleep infinity

docker exec --env APP_TARGET=tauri aob-linux-build \
  vp exec tauri build --debug --no-bundle --features development-content
```

This Tauri **build** command embeds the compiled renderer while retaining a debug native build. `APP_TARGET=tauri` selects native adapters; the explicit Cargo feature admits the labeled synthetic fixture. It does not package a `.deb` or authorize public distribution. The resulting binary is `/workspace/.tooling/target-ubuntu24/debug/afaan-oromo-bible`. A plain `cargo build` or a running development-server window is insufficient evidence for this embedded/offline smoke check.

Tauri requires matching major/minor releases of its JavaScript and Rust clipboard plugins. JavaScript is pinned to `2.4.2`; Rust requests `~2.4.2`, with `2.4.2` resolved in `Cargo.lock`. Keep that agreement when updating either dependency, and use the actual Tauri CLI build to check it.

## Run the smoke check without networking

After the embedded native build succeeds, run a separate container with `--network none`. The image already contains its runtime libraries. Use a **new absolute output directory** for each run; `run-smoke.sh` refuses an existing `profile` and never resets a previous profile.

```sh
docker run --rm --network none \
  --user 1000:1000 --shm-size=1g \
  --mount type=bind,src=/workspace,dst=/workspace \
  --workdir /workspace \
  afaan-oromo-linux-dev:ubuntu24 bash -c \
  'xvfb-run -a -s "-screen 0 1440x1000x24" dbus-run-session -- \
  bash tools/linux/run-smoke.sh \
  /workspace/.tooling/target-ubuntu24/debug/afaan-oromo-bible \
  /workspace/.tooling/linux/smoke-run-001; exit $?'
```

Pass `crash` as the third `run-smoke.sh` argument to send `SIGKILL` after the linked note and reading position are committed, verify SQLite integrity before relaunch, then reopen the note and anchor in another native process. The passing offline synthetic report is `.tooling/linux/crash-001/{first,restart}/report.json`; `sqlite-after-stop.json` records integrity `ok`, one note and revision 2, and `process-restart.json` records PIDs 47 → 217. The default third argument is `graceful` and uses SIGTERM. This test does not claim an uncommitted draft survives a crash.

If `xvfb-run` waits for its ready signal even though `xdpyinfo` can connect, start `Xvfb :99 -screen 0 1440x1000x24 -nolisten tcp` directly in the same container shell, wait for `DISPLAY=:99 xdpyinfo` to succeed, then run `DISPLAY=:99 dbus-run-session -- bash tools/linux/run-smoke.sh ...` there. Stop that Xvfb process when the smoke exits. The 2026-10-24 current-binary run used this path; the native smoke itself was unchanged.

Change `smoke-run-001` for subsequent runs. Keep the application, Openbox and harness inside this **same D-Bus and Xvfb session**; a Python process on a different bus/display cannot inspect this window reliably. The runner establishes isolated XDG data/config/cache/runtime directories, enables the accessibility bridge, selects X11 and starts Openbox. No Vite server or host display is required.

The runner also sets **`WEBKIT_DISABLE_COMPOSITING_MODE=1` only for this Xvfb session**: the default GPU compositing path produced a blank window in this virtual display. No production renderer/CSP configuration or WebKit sandbox flags were changed. This workaround is not evidence about rendering on a real GNOME X11/Wayland desktop; verify those sessions separately.

`native-smoke.py` uses the container's `/usr/bin/python3` and its GI/AT-SPI packages. It can dump a bounded accessible tree with `--dump`, inspect discovery with `--all-apps`, or run individual `--flow` stages. Mutating stages require `--confirm-synthetic-profile`; this flag is appropriate only for a disposable synthetic test session. The harness does not start the application or establish a restart by itself; use `run-smoke.sh` for the complete sequence.

X11 window activation first searches by native PID. If xdotool's PID index omits the window, the harness accepts a matching title only after `xprop` confirms `_NET_WM_PID` equals the AT-SPI native process PID. This fallback was needed by the 2026-10-24 embedded smoke; it does not relax process identity checks.

## Assertions and evidence

The runner checks the real native window rather than a browser adapter:

1. The synthetic-content warning is accessible. Reference navigation resolves `TSA 1:2` to its complete `2-3` bridge.
2. Keyboard Tab/Shift+Tab follows the reference controls; preferences contain a complete forward/reverse focus cycle, close with Escape and return focus to the opener.
3. Copy replaces a fresh clipboard sentinel with the exact fixture text, reference and attribution, verified through a separate X11 clipboard reader.
4. Phrase search opens the exact result and selects its verse.
5. A linked plain-text note receives the native saved acknowledgment. Read-only inspection of `user.sqlite` verifies its exact body, bridge anchor, one committed note and `PRAGMA integrity_check = ok`; the runner also waits for the chapter-2 reading-position transaction.
6. The first application process is stopped with **SIGTERM after those commits**, then a different process launches with the same isolated profile. The UI must recover chapter 2, the exact saved note and its passage link.

The output directory contains first/restart `report.json` files, accessible trees, requested screenshots, launch/Openbox logs, `sqlite-before-restart.json`, `process-restart.json` and the isolated profile. Inspect report status and errors alongside the process exit code. Screenshot capture problems are recorded separately and do not themselves fail a flow; do not claim screenshots exist without checking the files. Keep disposable profiles/logs under ignored `.tooling`, outside source commits.

2026-10-25 current-source keyboard-range qualification: the Linux `keyboard` flow also uses actual X11 keys on the four-unit synthetic chapter: focus verse `1:1` and press Enter; focus **Extend range** and press Space; focus final subverse `1:4b` and press Enter; verify all four AT-SPI toggle buttons are pressed; focus **Clear verse selection** and press Space. The report records the selected references and successful clear. The full offline read/keyboard-range/copy/search/note/highlight smoke and separate-process note/highlight reopen passed at `.tooling/linux/keyboard-range-current-20261025-13/{first,restart,restart-highlight}/report.json`; the first report shows `status: passed`, four selected references and `keyboard_cleared: true`. The runner's SQLite exact-record and integrity checks passed. Binary SHA-256: `38c484df4414b84508c5eab66df808688be5fdf3b69628a9a381edd40800216c`.

Build command in the isolated container: `APP_TARGET=tauri vp exec tauri build --debug --no-bundle --features development-content -- --locked --offline`. Smoke command after direct Xvfb startup/readiness check and inside `dbus-run-session`: `bash tools/linux/run-smoke.sh /workspace/.tooling/target-ubuntu24-current/debug/afaan-oromo-bible /workspace/.tooling/linux/keyboard-range-current-20261025-13`. Runtime: Ubuntu 24.04.5 LTS x86_64 (`linux/amd64`), `afaan-oromo-linux-dev:ubuntu24` image `sha256:0a8807f87a569e7f046d557090ba48a116e2eb87daf97a21c5b24a1960dc41bb`, GTK 3.24.41, WebKitGTK 2.52.6, Rust/Cargo 1.90.0, Node 24.19.0, Vite+ 1.3.0 local. Host: Ubuntu 26.04.1 LTS WSL2 x86_64, Linux `6.18.54.1-microsoft-standard-WSL2`. The separate current-source native WebDriver command `node tools/native.mjs native-test-build`, then `dbus-run-session -- vp run test:native-ui`, passed all four phases including range state, note detach, invalid-link rejection, bridge relink and restart. Its `native-ui-test/user.sqlite` has `integrity_check=ok`, one note, bookmark, highlight, preference and reading position. In this WebDriver environment `browser.keys` produces untrusted key events and does not trigger native button activation, so its cross-platform journey verifies the range using clicks; Linux keyboard input is qualified by the X11 harness above. These are virtual X11/Openbox checks, not GNOME X11/Wayland, installed-package, manual Orca, Windows or macOS qualification.

## Test the native unsaved-note close guard

After building the embedded application, use the same offline container and desktop-session wrapper with `tools/linux/run-close-smoke.sh` and another new output directory:

```sh
docker exec aob-linux-desktop \
  dbus-run-session -- xvfb-run -a -s '-screen 0 1440x1000x24' \
  bash tools/linux/run-close-smoke.sh \
    /workspace/.tooling/target-ubuntu24/debug/afaan-oromo-bible \
    /workspace/.tooling/linux/close-run-001
```

Here `aob-linux-desktop` must be a running container from this image with the workspace mounted and networking disabled. Alternatively replace `run-smoke.sh` in the earlier `docker run --rm --network none` command with this runner. The same isolated XDG profile rules apply.

The runner creates a synthetic note and uses an external SQLite `BEGIN IMMEDIATE` reservation to provoke a real native store-busy timeout without modifying the database. Openbox translates actual Alt+F4 key events into window-manager close requests. The harness verifies:

1. The close dialog initially focuses Cancel; Escape returns focus and the unchanged draft to the editor.
2. Discard exits through the native window guard and keeps the previously committed note.
3. Save and close fails while the database is locked, retains the window and draft, and exposes an error and Cancel.
4. Releasing the lock and retrying Save commits before native exit. A third process recovers the saved text, then closes cleanly with Alt+F4.

The successful paths do not use SIGTERM. Cleanup uses SIGTERM only after a test failure. Inspect the three stage reports, `close-processes.json`, screenshots and SQLite records; the close test is separate from the earlier committed-write restart smoke. It exercises database contention, not disk-full or crash recovery. Window close also differs from macOS Command-Q, menu Quit and Dock Quit; the application-exit guard needs separate native qualification.

## Corrupt personal database recovery smoke

After building the embedded native development app, run `run-corrupt-recovery-smoke.sh` in the same offline Xvfb/D-Bus wrapper with a new output directory. It creates a disposable invalid `user.sqlite` and WAL, verifies that no files change before explicit UI confirmation, then checks byte-identical archived copies, SQLite integrity of the fresh user database, and the native backup controls. The 2026-10-24 passing report is `.tooling/linux/corrupt-recovery-002/recovery/report.json`. The earlier `.tooling/linux/corrupt-recovery-001` attempt failed because writable SQLite startup removed the fake WAL; the storage open path was corrected to probe read-only first. The extended run at `.tooling/linux/corrupt-recovery-003` first exports a committed 22 px preference, then corrupts and recovers the disposable profile, restores that portable JSON through the native file dialog, and confirms the 22 px setting after another process restart. Its `before`, `recovery`, and `restored` reports all pass, with different native PIDs and SQLite integrity `ok`. The later `.tooling/linux/corrupt-recovery-007` run adds a linked note, bookmark, highlight and chapter-2 reading position to that preference. The recovery stage compares exact stored records and passage anchors with the exported JSON; the restart stage reopens the position, note, bookmark and setting. The three reports pass with different native PIDs. The later `.tooling/linux/corrupt-recovery-009` run adds a standalone note: two notes and every other personal record type are exported, restored with exact stored-record and anchor comparison, and both note titles are found after restart. Its three stage reports pass with distinct native PIDs and SQLite integrity `ok`. The five-stage `.tooling/linux/corrupt-recovery-011` run also imports the full-record export into a separate empty profile, compares exact records and anchors, and reopens both notes, the bookmark, chapter-2 position and 22 px setting after restart. Installed-package, GNOME, Windows and macOS qualification remain separate checks.

## Two-window profile-lock smoke

With the embedded synthetic development binary, run `run-profile-lock-smoke.sh` under the same offline Xvfb/D-Bus wrapper and a new output directory. It waits for Openbox to advertise its window-manager property, launches two native processes against one disposable profile, checks that the second shows personal-data-in-use guidance without a corrupt-recovery action, then exits the first and retries the second. The 2026-10-24 passing reports are `.tooling/linux/profile-lock-003/{first,blocked,retried}/report.json`, with native PIDs 47 and 153 and SQLite integrity `ok` after retry. The rebuilt binary also passes all five corrupt-recovery and separate clean-profile restore stages at `.tooling/linux/corrupt-recovery-014`. These are Xvfb/Openbox development-binary checks, not installed-package or GNOME qualification.

An earlier internal synthetic `.deb` has SHA-256 `bdb27fc16d04a9e31b3dd074b57107dd234c4030c10278283f218f90157157fd` and is retained under `.tooling/linux/internal-fixture-deb-current/`. It was built by Tauri with `development-content`, installed offline by `dpkg -i` into an Ubuntu runtime image with system WebKitGTK/GTK and test tools but no Node/Rust, and checked with `dpkg --audit`. Running `run-corrupt-recovery-smoke.sh /usr/bin/afaan-oromo-bible /test/pkgcurrent-recovery-002` passed all five linked/standalone full-record export, corruption, restore, clean-profile and restart stages. Offline remove/reinstall then `run-installed-smoke.sh /test/pkgcurrent-recovery-002 verify-existing` reopened the linked note and anchor. The first runtime image lacked `gsettings` and could not start the accessibility harness; the prepared runtime-smoke image supplied it. Both use Xvfb/Openbox and synthetic content, so neither qualifies GNOME, approved content or a public package.

For the Unicode-path drill, use a new short mounted output directory such as `/test/qarree-ʼ-2` with `run-corrupt-recovery-smoke.sh` and the installed internal binary. The passing 2026-10-24 reports are `.tooling/linux/qarree-ʼ-2/{before,recovery,restored,clean-restored,clean-restarted}/report.json`; the 3,151-byte `before/native-export.json` is at a path containing U+02BC. The harness pastes non-ASCII GTK file-dialog paths from an X11 UTF-8 clipboard owner because `xdotool type` did not reproduce that character. ASCII paths retain direct typing. This verifies the installed app under Xvfb/Openbox only; target desktop sessions still need their own Unicode path checks.

The latest internal synthetic `.deb` is `.tooling/linux/internal-fixture-deb-20261024-02/Afaan Oromo Bible_0.1.0_amd64.deb`, SHA-256 `8ebeae17e135da24fd41619058d6635ecfa4846b22793783ef480489ebbf8585`. It passed offline `dpkg -i`/`dpkg --audit` and `run-installed-smoke.sh` at `.tooling/linux/pkg-current-20261024-02`. The installed five-stage `run-corrupt-recovery-smoke.sh` passed at `.tooling/linux/pkg-current-recovery-20261024-04`; offline remove/reinstall followed by `run-installed-smoke.sh ... verify-existing` passed in that same profile. The updated native harness scrolls the Settings dialog before activating backup controls, which now fall below the initial viewport after locale controls were added.

## Limits and remaining qualification

For an **internal synthetic package** check, an ignored temporary Tauri overlay can enable `deb` bundling while explicitly using `--features development-content`; keep the public release overlay and approval gate separate. The 2026-10-24 Ubuntu 24.04 amd64 debug `.deb` is retained under `.tooling/linux/internal-fixture-deb/` with SHA-256 `a5d1bfbd5838b696011eeb0e830ff2a88c718a10dc4f7a3791ca8af275414171`. Its control file declares `libwebkit2gtk-4.1-0` and `libgtk-3-0`; its payload contains the installed executable, desktop launcher and icon. A separate Ubuntu runtime image preinstalled those libraries and Xvfb/AT-SPI test tools, but no Node or Rust. With networking disabled, `dpkg -i` and `dpkg --audit` passed. `run-installed-smoke.sh /test/pkg003` launched `/usr/bin/afaan-oromo-bible`, saved a linked note, checked SQLite integrity and reopened it after restart. After `dpkg -r` and offline reinstall, `run-installed-smoke.sh /test/pkg003 verify-existing` reopened the note and its original anchor. Reports are `.tooling/linux/pkg003/{first,restart,reinstalled}/report.json`. The runner waits for the debounced reading-position commit before its first restart; later opening the linked note can legitimately move the saved position back to Chapter 1.

This package run does not test a production content resource, GNOME X11/Wayland, Orca, signed package metadata or installing missing GTK/WebKit dependencies without a network. The temporary overlay, runtime image and package remain ignored local test artifacts.

A separate **resource-path probe** used the synthetic fixture SQLite and a manifest explicitly marked `technical_only`, with no `development-content` feature. Its ignored debug `.deb` has SHA-256 `4b9354bf761082ee92da6fa61a30f542a32b8a014c0384483199869aa67e2588` and remains under `.tooling/target-ubuntu24/debug/bundle/deb/`. `dpkg-deb` and an offline install both show the exact input hashes at `/usr/lib/Afaan Oromo Bible/content/{library.sqlite,approved-content.json}`. The installed app displayed “The packaged content has no valid approval record,” so it reached the resource manifest and rejected it. In `.tooling/linux/resource002/{first,restart}/report.json`, a standalone note and 22 px preference saved and reloaded while Scripture stayed unavailable. This tests resource placement and rejection without packaging unapproved real Scripture; it does not exercise an approved-content happy path.

The same installed internal package also passed `run-backup-smoke.sh /usr/bin/afaan-oromo-bible /test/pkgbackup001` in a fresh offline runtime-container profile. The report at `.tooling/linux/pkgbackup001/backup/report.json` confirms the bundled About notice, GTK save/open dialogs, a 22 px export, a 24 px pre-restore recovery file and a committed 22 px restore; a separate SQLite integrity check returned `ok`. This test covers one preference record, not every backed-up record or error path.

The nondevelopment missing-content runner exercises the release fallback with a fresh profile. Run `run-no-content-smoke.sh` under the Ubuntu Xvfb image, mounting `.tooling/linux` at a short path such as `/test` so the AT-SPI D-Bus socket fits its length limit. It checks the content error, saves a standalone note and a 22 px preference, restarts the process, and confirms both were reloaded. The passing 2026-10-24 reports are `.tooling/linux/nc007/first/report.json` and `.tooling/linux/nc007/restart/report.json`. This does not qualify an approved content pack.

The separate `run-backup-smoke.sh` runner checks native file dialogs and replacement using a new synthetic profile. Run it under the same offline Ubuntu image and Xvfb/D-Bus session, with a new output directory:

```sh
docker run --rm --network none --user 1000:1000 --shm-size=1g \
  --mount type=bind,src=/workspace,dst=/workspace --workdir /workspace \
  afaan-oromo-linux-dev:ubuntu24 bash -c \
  'xvfb-run -a -s "-screen 0 1440x1000x24" dbus-run-session -- \
  bash tools/linux/run-backup-smoke.sh \
  /workspace/.tooling/target-ubuntu24/debug/afaan-oromo-bible \
  /workspace/.tooling/linux/backup-run-001; exit $?'
```

The outer shell keeps `xvfb-run` away from container PID 1, where its Xvfb-ready signal may not wake the shell. The runner opens the offline About view and bundled UI notice, exports a committed 22 px preference through GTK's save dialog, changes it to 24 px, imports through the open dialog, confirms replacement, and verifies the restored 22 px SQLite value and the 24 px pre-restore JSON. The 2026-10-24 passing report is `.tooling/linux/backup-about-smoke-005/backup/report.json`. It uses the container's fixed 1440×1000 virtual display and AT-SPI action on the GTK Open button; this is a native X11 smoke, not an installed-package or GNOME qualification.

The current `run-backup-smoke.sh` also injects a failed pre-restore snapshot by obstructing the recovery directory. Its default `backup` flow covers a preference; pass `backup-full` as the third argument to seed and verify notes, bookmark, highlight, preference and reading position. The 2026-10-25 full-record run at `.tooling/linux/backup-full-failure-20261025-02/backup/report.json` confirms all five record types and passage anchors remained unchanged after the failed snapshot, SQLite integrity stayed `ok`, and retry restored the exact exported records while preserving a complete pre-restore copy. Linux native CI now runs this full-record failure/retry flow. This remains synthetic X11/Openbox evidence, not GNOME, installed-package or cross-platform qualification. AT-SPI inspection does not establish manual Orca usability, GNOME accessibility, Wayland clipboard/dialog behavior or real hardware rendering. These runners do not test termination during an uncommitted write, OS-level full disk, an authorized corpus, another distribution, Windows or macOS. The first reader runner does not exercise the close guard; use the dedicated close runner for that behavior.

To exercise a checked-in portable backup through the actual native open dialog and replacement path, pass `restore-candidate-v1` and a backup file as the third and fourth arguments, for example `bash tools/linux/run-backup-smoke.sh /workspace/.tooling/target-ubuntu24/debug/afaan-oromo-bible /workspace/.tooling/linux/backup-candidate-v1-001 restore-candidate-v1 /workspace/tests/fixtures/v1-user-backup-candidate.json`. This requires a new disposable profile, restores into an empty user database, checks the preview explicitly names the unavailable `synthetic-fixture-edition` and says links will be preserved without guessing, then compares every native record and anchor against the selected JSON. It reloads the reader and scrolls the actual Notes and Bookmarks panels to confirm the linked note and bookmark remain visible with their unavailable-edition preservation messages. Use `restore-full-clean` when the preview is not expected to mention an unavailable edition. This is native Ubuntu Xvfb/Openbox evidence only; GNOME X11/Wayland, Orca, Windows and macOS remain separate gates.

The extended candidate flow passed on the current embedded Tauri binary (`.tooling/target-ubuntu24/debug/afaan-oromo-bible`, SHA-256 `94688bdad46ac1a50de73ee5a78f2031a0531631447334a7bcf81fde0796338e`) at `.tooling/linux/v1-candidate-native-restore-20261025-04/backup/report.json`. After restore and reader reload it found the linked note with `Passage unavailable · note preserved` and the bookmark with `Edition unavailable · bookmark preserved`; exact record/anchor comparison and SQLite `integrity_check=ok` also passed. Test command: `dbus-run-session -- bash tools/linux/run-backup-smoke.sh /workspace/.tooling/target-ubuntu24/debug/afaan-oromo-bible /workspace/.tooling/linux/v1-candidate-native-restore-20261025-04 restore-candidate-v1 /workspace/tests/fixtures/v1-user-backup-candidate.json`, with `Xvfb :99 -screen 0 1440x1000x24 -nolisten tcp` started first. Runtime image: Ubuntu 24.04.5 LTS x86_64, GTK 3.24.41, WebKitGTK 2.52.6, Rust 1.90.0, Node 24.19.0; host Ubuntu 26.04.1 LTS x86_64, Linux `6.18.54.1-microsoft-standard-WSL2`. This remains virtual X11/Openbox evidence, not GNOME, Wayland, Orca or installed-package qualification.

The same candidate backup passed through a freshly built **installed internal synthetic `.deb`** from the current worktree. Build command inside the offline Ubuntu development image: `./node_modules/.bin/vp exec tauri build --debug --features development-content --config tools/linux/tauri.internal-test.conf.json -- --locked`, with `APP_TARGET=tauri`, `CARGO_TARGET_DIR=/workspace/.tooling/target-ubuntu24-v1restore`, Cargo/Rust mounts and the pinned Node mount described above. Package `.tooling/target-ubuntu24-v1restore/debug/bundle/deb/Afaan Oromo Bible_0.1.0_amd64.deb` SHA-256 is `1937f8483f25c5f5b167cb9e7b99e938bfd41006071b506a3622d384d85c7b04`; the staged executable in that package is SHA-256 `7ac9b1f6e936f29fe96fe819656ab16dc0060554fa9b7d27f956b37abb8c9c68`. It installed with offline `dpkg -i`, both `dpkg --audit` checks were clean, and the installed `/usr/bin/afaan-oromo-bible` passed the full `restore-candidate-v1` flow with screenshots disabled: `bash tools/linux/run-backup-smoke.sh /usr/bin/afaan-oromo-bible /workspace/.tooling/linux/pkg-candidate-restore-20261025-06 restore-candidate-v1 /workspace/tests/fixtures/v1-user-backup-candidate.json false true`. The fifth argument (`true` by default) controls screenshots; use `false` when the AT-SPI runtime lacks Gdk introspection. The sixth argument records that this executable was package-installed and adjusts report caveats. The report `.tooling/linux/pkg-candidate-restore-20261025-06/backup/report.json` confirms the unavailable-edition preview, visible post-reload note/bookmark warnings, exact record counts and anchors; a separate read-only SQLite check returned `integrity_check=ok`. Runtime image: `afaan-oromo-runtime-smoke:ubuntu24`, image ID `sha256:6380922a68e08357e82da54b1fa867345557a25294d4c64988e07669bc7f2081`, Ubuntu 24.04.5 LTS `linux/amd64`, no Node or Rust, GTK/WebKitGTK runtime libraries, Xvfb/Openbox/D-Bus/AT-SPI. The app ran under Xvfb/Openbox; screenshots were intentionally omitted because Gdk introspection is absent. This does not qualify clean GNOME X11/Wayland, Orca, the missing-dependency path, release signatures/content, or Windows/macOS.

The same `.deb` also passed uninstall/reinstall with the restored profile retained. In `.tooling/linux/pkg-candidate-restore-20261025-07/`, offline `dpkg -i`/`dpkg --audit` passed, then `dpkg -r afaan-oromo-bible`, `dpkg --audit`, reinstall of the same package and a second clean `dpkg --audit` all completed. `bash tools/linux/run-installed-smoke.sh /workspace/.tooling/linux/pkg-candidate-restore-20261025-07 verify-restored-backup /workspace/tests/fixtures/v1-user-backup-candidate.json` relaunched the installed app and verified exact notes, bookmark, highlight, preference, reading position and anchors against the JSON, plus both unavailable-edition warning labels in the native panes after restart. The post-reinstall SQLite profile still had integrity `ok`; reports are `backup/report.json` and `reinstalled/report.json`. The test used the same Ubuntu 24.04.5 LTS x86_64 `afaan-oromo-runtime-smoke:ubuntu24` image, no Node/Rust, Xvfb/Openbox/D-Bus/AT-SPI, and the same internal package hash `1937f8483f25c5f5b167cb9e7b99e938bfd41006071b506a3622d384d85c7b04`. This is package reinstall evidence only, not clean GNOME/Wayland, Orca, signed production release or Windows/macOS qualification.

## WSLg Wayland integration probe

The current embedded Linux Tauri binary also launched through WSLg's actual Wayland compositor, with the Wayland socket passed into the existing Ubuntu development container. Exact outer command:

```sh
docker run -i --rm --network none --user 1000:1000 --shm-size=1g \
  --mount type=bind,src=/home/linux-env/github/afaan_oromo_bible,dst=/workspace \
  --mount type=bind,src=/mnt/wslg/runtime-dir/wayland-0,dst=/tmp/wslg-wayland-0 \
  --workdir /workspace afaan-oromo-linux-dev:ubuntu24 bash -s
```

Inside the container, the session set `XDG_RUNTIME_DIR=/tmp/aob-wayland-runtime`, `WAYLAND_DISPLAY=/tmp/wslg-wayland-0`, `GDK_BACKEND=wayland`, `NO_AT_BRIDGE=0` and `LIBGL_ALWAYS_SOFTWARE=1`, left `DISPLAY` unset, and ran the GDK check, app and accessibility harness inside one `dbus-run-session`. GDK reported `GdkWaylandDisplay` named `/tmp/wslg-wayland-0`. The app was `.tooling/target-ubuntu24-v1restore/debug/afaan-oromo-bible` (SHA-256 `96740687c09a4c82cdb467c503b3813ad6f24ff008d3de1c48e546af5c6d59fc`). The exact app check was `/usr/bin/python3 /workspace/tools/linux/native-smoke.py --pid "$app_pid" --flow read --confirm-synthetic-profile --dump --output-dir /workspace/.tooling/linux/wslg-wayland-smoke-20261025-04/accessibility`; it passed and AT-SPI exposed 66 nodes, including the synthetic-content label, library sidebar, Search Scripture, My notes, Bookmarks and Reading preferences. The report records the requested display backend and socket path at `.tooling/linux/wslg-wayland-smoke-20261025-04/accessibility/report.json`.

The host was Ubuntu 26.04.1 LTS x86_64 under WSL2 Linux `6.18.54.1-microsoft-standard-WSL2`, using WSLg 1.0.79 x86_64; the app/runtime image was Ubuntu 24.04.5 LTS x86_64 with GTK 3.24.41 and WebKitGTK 2.52.6. This establishes a WebKitGTK Wayland launch and AT-SPI tree under WSLg, not the required Ubuntu 24.04 GNOME Wayland session, keyboard interaction, manual Orca, installed-package behavior or target desktop accessibility. Keep those release gates open.

The missing-dependency gate is repeatable with `bash tools/linux/check-missing-dependencies.sh path/to/package.deb`. It starts a disposable Ubuntu 24.04 container with networking disabled, checks that the package declares GTK 3 and WebKitGTK 4.1, attempts `dpkg -i`, and asserts the expected diagnostic and unconfigured package state. On 2026-10-25 it passed against the internal package above in Ubuntu 24.04.5 LTS `amd64`; the host was Linux 6.18.54.1-microsoft-standard-WSL2 x86_64. The package manager returned 1 and identified both missing libraries. Linux native CI now invokes this check before the positive install/reinstall smoke. It validates dpkg's dependency guard only; clean-host GNOME installation, online APT resolution, Orca, X11/Wayland and actual hosted CI results remain open.

The newest full-record failure/retry run passed after offline installation of an internal package built from this worktree. Build environment: Ubuntu 24.04.5 LTS x86_64, GTK 3.24.41 and WebKitGTK 2.52.6 in `afaan-oromo-linux-dev:ubuntu24`. Package SHA-256 is `1d2d5e7d2037861dc223cef11e8cd62fbfa9477b02b00f007adc0423b089b87c`; `dpkg --audit` was clean. The internal build command was `vp exec tauri build --debug --features development-content --config tools/linux/tauri.internal-test.conf.json -- --locked`. The offline install → full-record failure/retry → uninstall → reinstall → exact profile verification → native reopen sequence passed at `.tooling/linux/pkg-backup-reinstall-20261025-05/`. In the runtime session, the commands were:

```sh
package="/workspace/.tooling/target-ubuntu24/debug/bundle/deb/Afaan Oromo Bible_0.1.0_amd64.deb"
output="/workspace/.tooling/linux/pkg-backup-reinstall-20261025-05"
dpkg -i "$package"
dpkg --audit
Xvfb :99 -screen 0 1440x1000x24 -nolisten tcp >/tmp/aob-xvfb.log 2>&1 &
export DISPLAY=:99
until xdpyinfo >/dev/null 2>&1; do sleep 0.2; done
runuser -u ubuntu -- dbus-run-session -- bash -lc \
  "cd /workspace && bash tools/linux/run-backup-smoke.sh /usr/bin/afaan-oromo-bible $output backup-full"
dpkg -r afaan-oromo-bible
dpkg -i "$package"
dpkg --audit
python3 tools/linux/verify-backup-profile.py \
  "$output/backup/native-export.json" \
  "$output/profile/data/org.afaanoromobible.reader/development/user.sqlite"
runuser -u ubuntu -- dbus-run-session -- bash -lc \
  "cd /workspace && bash tools/linux/run-installed-smoke.sh $output verify-existing"
```

The app was installed from `/usr/bin/afaan-oromo-bible`, not launched from the build tree. The report `.tooling/linux/pkg-backup-reinstall-20261025-05/backup/report.json` records the visible failed-snapshot error, unchanged counts for two notes, bookmark, highlight, preference and reading position, SQLite integrity `ok`, and exact post-retry equality to the export including all anchors. After `dpkg -r` and reinstall, `tools/linux/verify-backup-profile.py` compared the still-closed profile read-only to the export and passed all five tables and three anchors; the new native process then reopened the linked note and exact anchor (`reinstalled/report.json`). The comparison runs before opening the note because that navigation legitimately updates the reading position. The runner now waits for Openbox's `_NET_SUPPORTING_WM_CHECK` property before launching the window, avoiding a startup race. The test used Xvfb/Openbox on the Ubuntu development image; it does not establish GNOME X11/Wayland, manual Orca accessibility, Windows/macOS, production content or release signing.

Linux V1 qualification still requires the Ubuntu GNOME X11/Wayland, Orca/AT-SPI, package, recovery and dependency checks in [TESTING_STRATEGY.md](../../docs/TESTING_STRATEGY.md) and [RELEASE_STRATEGY.md](../../docs/RELEASE_STRATEGY.md). A successful smoke run contributes evidence to that gate; it does not close it.

## Cross-platform native WebDriver journey

The shared native WebDriver journey now runs four distinct Tauri processes: it persists a bookmark, whole-verse yellow highlight, 22 px reading preference and linked note, then verifies detaching and reattaching that note across restarts. In the Ubuntu 24.04.5 LTS x86_64 development image (GTK 3.24.41/WebKitGTK 2.52.6), build it with `vp run desktop:native-test-build`, setting `APP_TARGET=tauri`, `CARGO_TARGET_DIR=/workspace/.tooling/target-wdio-ubuntu24` and the same pinned Cargo/Rust/Vite+ mounts documented above. Run it offline in a fresh Xvfb/D-Bus profile:

```sh
mkdir -p .tooling/linux/native-extended-20261025-03/{data,config,cache,runtime}
chmod 700 .tooling/linux/native-extended-20261025-03/runtime
export XDG_DATA_HOME="$PWD/.tooling/linux/native-extended-20261025-03/data"
export XDG_CONFIG_HOME="$PWD/.tooling/linux/native-extended-20261025-03/config"
export XDG_CACHE_HOME="$PWD/.tooling/linux/native-extended-20261025-03/cache"
export XDG_RUNTIME_DIR="$PWD/.tooling/linux/native-extended-20261025-03/runtime"
export GDK_BACKEND=x11 TAURI_WEBDRIVER_PORT=4445 WEBKIT_DISABLE_COMPOSITING_MODE=1
export AOB_NATIVE_BINARY="$PWD/.tooling/target-wdio-ubuntu24/debug/afaan-oromo-bible"
Xvfb :99 -screen 0 1440x1000x24 -nolisten tcp >/tmp/aob-xvfb.log 2>&1 &
xvfb_pid=$!
export DISPLAY=:99
for attempt in $(seq 1 50); do
  if xdpyinfo >/dev/null 2>&1; then break; fi
  sleep 0.2
done
xdpyinfo >/dev/null
dbus-run-session -- vp run test:native-ui
status=$?
kill "$xvfb_pid" 2>/dev/null || true
exit "$status"
```

The passing 2026-10-25 run at `.tooling/linux/native-note-links-20261025-07/` completed all four phases (`write`, `reopen`, `edit-links`, `verify-relinked`), each with one passing native UI test. The first reopen removed the bridge anchor and saved the note as standalone; the next process found the note without an anchor, rejected unavailable chapter `Sample Book A 99:1` without adding a link, then attached valid bridge `Sample Book A 1:2-3` and saved it; the fourth process reopened the updated note. Read-only SQLite inspection returned `integrity_check=ok` and found exactly one note with the original body and new bridge anchor. Build and test commands inside the Ubuntu container were `vp run desktop:native-test-build` and `dbus-run-session -- vp run test:native-ui`; environment included `APP_TARGET=tauri`, `CARGO_TARGET_DIR=/workspace/.tooling/target-wdio-ubuntu24`, `AOB_NATIVE_BINARY=/workspace/.tooling/target-wdio-ubuntu24/debug/afaan-oromo-bible`, `TAURI_WEBDRIVER_PORT=4445`, `GDK_BACKEND=x11`, `WEBKIT_DISABLE_COMPOSITING_MODE=1`, and isolated `XDG_*` directories. Xvfb was started with `Xvfb :99 -screen 0 1440x1000x24 -nolisten tcp` before running the test. The host was Linux 6.18.54.1-microsoft-standard-WSL2 x86_64; the test image was Ubuntu 24.04.5 LTS x86_64 with GTK 3.24.41 and WebKitGTK 2.52.6. Nonfatal WebDriver window-activation warnings occurred under Xvfb. This is Linux Tauri/WebKitGTK evidence in a virtual X11 session, not GNOME, Wayland, Orca, package installation or Windows/macOS evidence. The same source journey is wired to the Windows x64, macOS arm64/x64 and Ubuntu x64 CI matrix; those hosted runs remain pending.

The current internal synthetic `.deb` (SHA-256 `8ebeae17e135da24fd41619058d6635ecfa4846b22793783ef480489ebbf8585`) also passed `run-smoke.sh /usr/bin/afaan-oromo-bible` after offline installation. `.tooling/linux/pkg-reader-20261024-02` records the graceful restart; `.tooling/linux/pkg-reader-crash-20261024-02` records `SIGKILL` after committed writes and successful recovery. Both include reader/keyboard/copy/search/note stages and SQLite integrity reports. The package and reports are ignored local test artifacts.
