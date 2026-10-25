#!/usr/bin/env bash
# Call inside one dbus-run-session + Xvfb session, using a disposable test profile.
set -euo pipefail

binary=${1:?Pass the absolute path to the embedded native development binary.}
output=${2:?Pass a new directory for the isolated profile and reports.}
stop_mode=${3:-graceful}
if [[ "$stop_mode" != graceful && "$stop_mode" != crash ]]; then
  echo "Stop mode must be graceful or crash." >&2
  exit 1
fi
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
# Xvfb has no GPU compositor. Keep this workaround confined to the smoke session.
export WEBKIT_DISABLE_COMPOSITING_MODE=1

app_pid=
wm_pid=
cleanup() {
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
for _ in {1..100}; do
  if [[ "$(xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null)" == *"window id"* ]]; then break; fi
  sleep 0.1
done
if [[ "$(xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null)" != *"window id"* ]]; then
  echo "Openbox did not become ready." >&2
  exit 1
fi
"$binary" >"$output/first-launch.log" 2>&1 &
app_pid=$!
first_pid=$app_pid
/usr/bin/python3 tools/linux/native-smoke.py --pid "$app_pid" --activate-window --flow smoke \
  --confirm-synthetic-profile --dump --screenshots --output-dir "$output/first"

# Wait for the native reading-position transaction as well as the UI's explicit note-save ack.
/usr/bin/python3 - "$XDG_DATA_HOME" "$output" <<'PY'
from pathlib import Path
import json, sqlite3, sys, time
database = Path(sys.argv[1]) / 'org.afaanoromobible.reader/development/user.sqlite'
deadline = time.monotonic() + 20
while True:
    with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as connection:
        notes = [json.loads(row[0]) for row in connection.execute('SELECT json FROM note')]
        positions = [json.loads(row[0]) for row in connection.execute('SELECT json FROM reading_position')]
        integrity = connection.execute('PRAGMA integrity_check').fetchone()[0]
    assert len(notes) == 1 and notes[0]['title'] == 'Linux native smoke fixture'
    assert notes[0]['bodyText'] == 'A synthetic native test note persists after the application restarts.'
    assert notes[0]['anchor']['displayReferenceSnapshot'] == 'Sample Book A 1:2-3'
    assert integrity == 'ok'
    if any(position['chapterLabel'] == '2' for position in positions):
        break
    if time.monotonic() > deadline:
        raise RuntimeError('Native reading position did not commit before restart')
    time.sleep(0.1)
Path(sys.argv[2], 'sqlite-before-restart.json').write_text(json.dumps({
    'integrity': integrity, 'note_count': len(notes), 'note_revision': notes[0]['revision'],
    'linked_bridge_preserved': True, 'reading_chapter': '2', 'database': str(database),
}, indent=2) + '\n')
PY

if [[ "$stop_mode" == crash ]]; then
  kill -KILL "$app_pid"
else
  kill -TERM "$app_pid"
fi
wait "$app_pid" || true
app_pid=
/usr/bin/python3 - "$XDG_DATA_HOME" "$output" "$stop_mode" <<'PY'
from pathlib import Path
import json, sqlite3, sys
database = Path(sys.argv[1]) / 'org.afaanoromobible.reader/development/user.sqlite'
with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as connection:
    integrity = connection.execute('PRAGMA integrity_check').fetchone()[0]
    notes = [json.loads(row[0]) for row in connection.execute('SELECT json FROM note')]
if integrity != 'ok' or len(notes) != 1 or notes[0]['title'] != 'Linux native smoke fixture':
    raise RuntimeError('Committed note or SQLite integrity was lost after process stop')
Path(sys.argv[2], 'sqlite-after-stop.json').write_text(json.dumps({
    'integrity': integrity, 'note_count': len(notes), 'note_revision': notes[0]['revision'],
    'stop_method': 'SIGKILL' if sys.argv[3] == 'crash' else 'SIGTERM',
}, indent=2) + '\n')
PY
"$binary" >"$output/restart-launch.log" 2>&1 &
app_pid=$!
/usr/bin/python3 tools/linux/native-smoke.py --pid "$app_pid" --activate-window --flow verify-note \
  --confirm-synthetic-profile --dump --screenshots --output-dir "$output/restart"
/usr/bin/python3 tools/linux/native-smoke.py --pid "$app_pid" --activate-window --flow verify-highlight \
  --confirm-synthetic-profile --dump --screenshots --output-dir "$output/restart-highlight"
/usr/bin/python3 - "$first_pid" "$app_pid" "$output" "$stop_mode" <<'PY'
from pathlib import Path
import json, sys
assert sys.argv[1] != sys.argv[2]
Path(sys.argv[3], 'process-restart.json').write_text(json.dumps({
    'first_pid': int(sys.argv[1]), 'restart_pid': int(sys.argv[2]),
    'stop_method': ('SIGKILL' if sys.argv[4] == 'crash' else 'SIGTERM') + ' after committed note and reading-position writes',
    'manual_Orca_GNOME_Wayland_and_package_qualification': 'pending',
}, indent=2) + '\n')
PY
echo "Native X11 smoke passed: $output"
