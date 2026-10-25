#!/usr/bin/env bash
# Exercise user notes in a native build with no approved packaged content.
set -euo pipefail
binary=${1:?Pass the nondevelopment embedded binary.}
output=${2:?Pass a new output directory.}
expected=${3:-}
extra=()
if [[ -n "$expected" ]]; then extra=(--expected-content-error "$expected"); fi
if [[ -e "$output/profile" ]]; then
  echo "Use a new output directory; existing profiles are never reset." >&2
  exit 1
fi
mkdir -p "$output/profile/data" "$output/profile/config" "$output/profile/cache" "$output/runtime"
chmod 700 "$output/runtime"
export XDG_DATA_HOME="$output/profile/data"
export XDG_CONFIG_HOME="$output/profile/config"
export XDG_CACHE_HOME="$output/profile/cache"
export XDG_RUNTIME_DIR="$output/runtime"
export GDK_BACKEND=x11 NO_AT_BRIDGE=0 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_COMPOSITING_MODE=1
app_pid= wm_pid=
cleanup() {
  if [[ -n "$app_pid" ]] && kill -0 "$app_pid" 2>/dev/null; then kill -TERM "$app_pid"; wait "$app_pid" || true; fi
  if [[ -n "$wm_pid" ]] && kill -0 "$wm_pid" 2>/dev/null; then kill -TERM "$wm_pid"; wait "$wm_pid" || true; fi
}
trap cleanup EXIT
gsettings set org.gnome.desktop.interface toolkit-accessibility true
openbox >"$output/openbox.log" 2>&1 & wm_pid=$!
"$binary" >"$output/app-first.log" 2>&1 & app_pid=$!
/usr/bin/python3 tools/linux/native-smoke.py --pid "$app_pid" --flow no-content \
  --confirm-synthetic-profile --dump --output-dir "$output/first" "${extra[@]}"
kill -TERM "$app_pid"
wait "$app_pid" || true
app_pid=
"$binary" >"$output/app-restart.log" 2>&1 & app_pid=$!
/usr/bin/python3 tools/linux/native-smoke.py --pid "$app_pid" --flow verify-no-content \
  --confirm-synthetic-profile --dump --output-dir "$output/restart" "${extra[@]}"
echo "Native missing-content note smoke passed: $output"
