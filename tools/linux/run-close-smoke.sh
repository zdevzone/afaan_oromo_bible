#!/usr/bin/env bash
# Call inside one dbus-run-session + Xvfb session. Never reuse a real user profile.
set -euo pipefail

binary=${1:?Pass the absolute path to the embedded native development binary.}
output=${2:?Pass a new directory for the isolated close-test profile and reports.}
if [[ -e "$output/profile" ]]; then
  echo "Use a new output directory; existing profiles are never reset by this test." >&2
  exit 1
fi
mkdir -p "$output/profile/data" "$output/profile/config" "$output/profile/cache" "$output/runtime"
chmod 700 "$output/runtime"
export XDG_DATA_HOME="$output/profile/data"
export XDG_CONFIG_HOME="$output/profile/config"
export XDG_CACHE_HOME="$output/profile/cache"
export XDG_RUNTIME_DIR="$output/runtime"
export GDK_BACKEND=x11
export NO_AT_BRIDGE=0
export LIBGL_ALWAYS_SOFTWARE=1
# The workaround is confined to the Xvfb test session, as in run-smoke.sh.
export WEBKIT_DISABLE_COMPOSITING_MODE=1
database="$XDG_DATA_HOME/org.afaanoromobible.reader/development/user.sqlite"

app_pid=
wm_pid=
cleanup() {
  # SIGTERM is cleanup on failure only; successful cases exit through native Alt+F4.
  if [[ -n "$app_pid" ]] && kill -0 "$app_pid" 2>/dev/null; then
    kill -TERM "$app_pid"
    wait "$app_pid" || true
  fi
  if [[ -n "$wm_pid" ]] && kill -0 "$wm_pid" 2>/dev/null; then
    kill -TERM "$wm_pid"
    wait "$wm_pid" || true
  fi
}
trap cleanup EXIT

gsettings set org.gnome.desktop.interface toolkit-accessibility true
openbox >"$output/openbox.log" 2>&1 &
wm_pid=$!

"$binary" >"$output/cancel-discard-launch.log" 2>&1 &
app_pid=$!
discard_pid=$app_pid
/usr/bin/python3 tools/linux/native-smoke.py --pid "$app_pid" --activate-window \
  --flow close-cancel-discard --confirm-synthetic-profile --user-db "$database" \
  --dump --screenshots --output-dir "$output/cancel-discard"
wait "$app_pid"
app_pid=

"$binary" >"$output/save-launch.log" 2>&1 &
app_pid=$!
save_pid=$app_pid
/usr/bin/python3 tools/linux/native-smoke.py --pid "$app_pid" --activate-window \
  --flow close-save --confirm-synthetic-profile --user-db "$database" \
  --dump --screenshots --output-dir "$output/save"
wait "$app_pid"
app_pid=

"$binary" >"$output/verify-clean-launch.log" 2>&1 &
app_pid=$!
verify_pid=$app_pid
/usr/bin/python3 tools/linux/native-smoke.py --pid "$app_pid" --activate-window \
  --flow verify-close-save --confirm-synthetic-profile --user-db "$database" \
  --dump --screenshots --output-dir "$output/verify-clean"
wait "$app_pid"
app_pid=

/usr/bin/python3 - "$discard_pid" "$save_pid" "$verify_pid" "$output" <<'PY'
from pathlib import Path
import json, sys
pids = [int(value) for value in sys.argv[1:4]]
assert len(set(pids)) == 3, 'Each persisted-data verification requires a new native process.'
Path(sys.argv[4], 'close-processes.json').write_text(json.dumps({
    'cancel_discard_pid': pids[0], 'failed_then_saved_pid': pids[1], 'verify_clean_close_pid': pids[2],
    'close_method': 'Openbox Alt+F4 / WM_DELETE_WINDOW; no SIGTERM on successful paths',
    'failure_method': 'External SQLite BEGIN IMMEDIATE reservation; actual store-busy timeout',
    'disk_full_and_crash_recovery': 'not exercised by this test',
    'GNOME_Wayland_Orca_package_and_other_OS_qualification': 'pending',
}, indent=2) + '\n')
PY
echo "Native close guard smoke passed: $output"
