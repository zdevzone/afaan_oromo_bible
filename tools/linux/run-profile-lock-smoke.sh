#!/usr/bin/env bash
# Two live native windows sharing one disposable synthetic profile.
set -euo pipefail
binary=${1:?Pass the embedded development binary.}
output=${2:?Pass a new output directory.}
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
first_pid= second_pid= wm_pid=
cleanup() {
  for pid in "$second_pid" "$first_pid" "$wm_pid"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid"
      wait "$pid" || true
    fi
  done
}
trap cleanup EXIT
gsettings set org.gnome.desktop.interface toolkit-accessibility true
openbox >"$output/openbox.log" 2>&1 & wm_pid=$!
for _ in {1..100}; do
  if [[ "$(xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null)" == *"window id"* ]]; then break; fi
  sleep 0.1
done
if [[ "$(xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null)" != *"window id"* ]]; then
  echo "Openbox did not become ready." >&2
  exit 1
fi
"$binary" >"$output/app-first.log" 2>&1 & first_pid=$!
/usr/bin/python3 tools/linux/native-smoke.py --pid "$first_pid" --activate-window --flow read \
  --confirm-synthetic-profile --dump --output-dir "$output/first"
"$binary" >"$output/app-second.log" 2>&1 & second_pid=$!
/usr/bin/python3 tools/linux/native-smoke.py --pid "$second_pid" --activate-window --flow profile-in-use \
  --confirm-synthetic-profile --dump --output-dir "$output/blocked"
kill -TERM "$first_pid"
wait "$first_pid" || true
first_pid=
/usr/bin/python3 tools/linux/native-smoke.py --pid "$second_pid" --activate-window --flow profile-after-release \
  --confirm-synthetic-profile --dump --output-dir "$output/retried"
echo "Native profile-lock smoke passed: $output"
