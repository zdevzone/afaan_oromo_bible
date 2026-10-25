#!/usr/bin/env bash
# Explicit corrupt-personal-database recovery in a disposable native profile.
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
user_dir="$XDG_DATA_HOME/org.afaanoromobible.reader/development"
mkdir -p "$user_dir"
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
"$binary" >"$output/app-before.log" 2>&1 & app_pid=$!
/usr/bin/python3 tools/linux/native-smoke.py --pid "$app_pid" --activate-window --flow backup-full \
  --confirm-synthetic-profile --dump --output-dir "$output/before"
backup_file="$output/before/native-export.json"
test -f "$backup_file"
kill -TERM "$app_pid"
wait "$app_pid" || true
app_pid=
cp "$user_dir/user.sqlite" "$output/valid-user-before-corruption.sqlite"
rm -f "$user_dir/user.sqlite-wal" "$user_dir/user.sqlite-shm"
printf 'synthetic invalid SQLite bytes for recovery smoke' > "$user_dir/user.sqlite"
printf 'synthetic invalid WAL bytes for recovery smoke' > "$user_dir/user.sqlite-wal"
"$binary" >"$output/app-corrupt.log" 2>&1 & app_pid=$!
/usr/bin/python3 tools/linux/native-smoke.py --pid "$app_pid" --activate-window --flow recovery-corrupt \
  --confirm-synthetic-profile --backup-file "$backup_file" --dump --output-dir "$output/recovery"
kill -TERM "$app_pid"
wait "$app_pid" || true
app_pid=
"$binary" >"$output/app-restored.log" 2>&1 & app_pid=$!
/usr/bin/python3 tools/linux/native-smoke.py --pid "$app_pid" --activate-window --flow verify-recovered-preference \
  --confirm-synthetic-profile --dump --output-dir "$output/restored"
kill -TERM "$app_pid"
wait "$app_pid" || true
app_pid=
mkdir -p "$output/clean-profile/data" "$output/clean-profile/config" "$output/clean-profile/cache" "$output/clean-runtime"
chmod 700 "$output/clean-runtime"
export XDG_DATA_HOME="$output/clean-profile/data"
export XDG_CONFIG_HOME="$output/clean-profile/config"
export XDG_CACHE_HOME="$output/clean-profile/cache"
export XDG_RUNTIME_DIR="$output/clean-runtime"
"$binary" >"$output/app-clean-restore.log" 2>&1 & app_pid=$!
/usr/bin/python3 tools/linux/native-smoke.py --pid "$app_pid" --activate-window --flow restore-full-clean \
  --confirm-synthetic-profile --backup-file "$backup_file" --dump --output-dir "$output/clean-restored"
kill -TERM "$app_pid"
wait "$app_pid" || true
app_pid=
"$binary" >"$output/app-clean-restart.log" 2>&1 & app_pid=$!
/usr/bin/python3 tools/linux/native-smoke.py --pid "$app_pid" --activate-window --flow verify-recovered-preference \
  --confirm-synthetic-profile --dump --output-dir "$output/clean-restarted"
echo "Native corrupt-storage recovery smoke passed: $output"
