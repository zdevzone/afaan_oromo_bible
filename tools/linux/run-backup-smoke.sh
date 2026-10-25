#!/usr/bin/env bash
# Focused native backup dialog check in a new synthetic profile.
set -euo pipefail
binary=${1:?Pass the embedded development binary.}
output=${2:?Pass a new output directory.}
flow=${3:-backup}
backup_file=${4:-}
screenshots=${5:-true}
installed_package=${6:-false}
if [[ -e "$output/profile" ]]; then
  echo "Use a new output directory; existing profiles are never reset." >&2
  exit 1
fi
if [[ "$flow" == "restore-full-clean" || "$flow" == "restore-candidate-v1" ]] && [[ -z "$backup_file" ]]; then
  echo "$flow requires a portable backup file." >&2
  exit 1
fi
if [[ -n "$backup_file" && ! -f "$backup_file" ]]; then
  echo "Portable backup file does not exist: $backup_file" >&2
  exit 1
fi
if [[ "$screenshots" != "true" && "$screenshots" != "false" ]]; then
  echo "Screenshot option must be true or false." >&2
  exit 1
fi
if [[ "$installed_package" != "true" && "$installed_package" != "false" ]]; then
  echo "Installed-package option must be true or false." >&2
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
for _ in {1..100}; do
  if [[ "$(xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null)" == *"window id"* ]]; then break; fi
  sleep 0.1
done
if [[ "$(xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null)" != *"window id"* ]]; then
  echo "Openbox did not become ready." >&2
  exit 1
fi
"$binary" >"$output/app.log" 2>&1 & app_pid=$!
args=(--pid "$app_pid" --activate-window --flow "$flow" --confirm-synthetic-profile --dump --output-dir "$output/backup")
if [[ "$screenshots" == "true" ]]; then
  args+=(--screenshots)
fi
if [[ "$installed_package" == "true" ]]; then
  args+=(--installed-package)
fi
if [[ -n "$backup_file" ]]; then
  args+=(--backup-file "$backup_file")
fi
/usr/bin/python3 tools/linux/native-smoke.py "${args[@]}"
echo "Native backup dialog smoke passed: $output"
