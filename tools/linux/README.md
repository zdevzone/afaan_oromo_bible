# Ubuntu desktop development and native smoke checks

This directory supplies a development image and a smoke harness for the actual Tauri window. It uses synthetic content and a disposable user profile. The commands below describe the procedure; measured build/run results belong in the [repository status](../../README.md). An image build, renderer build or authored harness does not establish a passing native test.

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
  afaan-oromo-linux-dev:ubuntu24 \
  xvfb-run -a -s '-screen 0 1440x1000x24' \
  dbus-run-session -- \
  bash tools/linux/run-smoke.sh \
    /workspace/.tooling/target-ubuntu24/debug/afaan-oromo-bible \
    /workspace/.tooling/linux/smoke-run-001
```

Change `smoke-run-001` for subsequent runs. Keep the application, Openbox and harness inside this **same D-Bus and Xvfb session**; a Python process on a different bus/display cannot inspect this window reliably. The runner establishes isolated XDG data/config/cache/runtime directories, enables the accessibility bridge, selects X11 and starts Openbox. No Vite server or host display is required.

The runner also sets **`WEBKIT_DISABLE_COMPOSITING_MODE=1` only for this Xvfb session**: the default GPU compositing path produced a blank window in this virtual display. No production renderer/CSP configuration or WebKit sandbox flags were changed. This workaround is not evidence about rendering on a real GNOME X11/Wayland desktop; verify those sessions separately.

`native-smoke.py` uses the container's `/usr/bin/python3` and its GI/AT-SPI packages. It can dump a bounded accessible tree with `--dump`, inspect discovery with `--all-apps`, or run individual `--flow` stages. Mutating stages require `--confirm-synthetic-profile`; this flag is appropriate only for a disposable synthetic test session. The harness does not start the application or establish a restart by itself; use `run-smoke.sh` for the complete sequence.

## Assertions and evidence

The runner checks the real native window rather than a browser adapter:

1. The synthetic-content warning is accessible. Reference navigation resolves `TSA 1:2` to its complete `2-3` bridge.
2. Keyboard Tab/Shift+Tab follows the reference controls; preferences contain a complete forward/reverse focus cycle, close with Escape and return focus to the opener.
3. Copy replaces a fresh clipboard sentinel with the exact fixture text, reference and attribution, verified through a separate X11 clipboard reader.
4. Phrase search opens the exact result and selects its verse.
5. A linked plain-text note receives the native saved acknowledgment. Read-only inspection of `user.sqlite` verifies its exact body, bridge anchor, one committed note and `PRAGMA integrity_check = ok`; the runner also waits for the chapter-2 reading-position transaction.
6. The first application process is stopped with **SIGTERM after those commits**, then a different process launches with the same isolated profile. The UI must recover chapter 2, the exact saved note and its passage link.

The output directory contains first/restart `report.json` files, accessible trees, requested screenshots, launch/Openbox logs, `sqlite-before-restart.json`, `process-restart.json` and the isolated profile. Inspect report status and errors alongside the process exit code. Screenshot capture problems are recorded separately and do not themselves fail a flow; do not claim screenshots exist without checking the files. Keep disposable profiles/logs under ignored `.tooling`, outside source commits.

## Limits and remaining qualification

This is synthetic-content **X11/Openbox under Xvfb** evidence. AT-SPI inspection is useful, but it does not establish manual Orca usability, GNOME accessibility, Wayland clipboard/dialog behavior or real hardware rendering. It does not test native window-close Save/Discard/Cancel, termination during an uncommitted write, full disk, backup/restore, an authorized corpus, `.deb` installation/uninstall, another distribution, Windows or macOS.

Linux V1 qualification still requires the Ubuntu GNOME X11/Wayland, Orca/AT-SPI, package, recovery and dependency checks in [TESTING_STRATEGY.md](../../docs/TESTING_STRATEGY.md) and [RELEASE_STRATEGY.md](../../docs/RELEASE_STRATEGY.md). A successful smoke run contributes evidence to that gate; it does not close it.
