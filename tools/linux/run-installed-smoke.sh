#!/usr/bin/env bash
# Installed internal development .deb: reader, linked note, SQLite and restart.
set -euo pipefail
output=${1:?Pass a new short output directory mounted writable by the test user.}
mode=${2:-full}
backup_file=${3:-}
if [[ "$mode" == full ]]; then
  if [[ -e "$output/profile" ]]; then
    echo "Use a new output directory; existing profiles are never reset." >&2
    exit 1
  fi
  mkdir -p "$output/profile/data" "$output/profile/config" "$output/profile/cache" "$output/runtime"
elif [[ "$mode" == verify-existing ]]; then
  test -f "$output/profile/data/org.afaanoromobible.reader/development/user.sqlite"
elif [[ "$mode" == verify-restored-backup ]]; then
  test -f "$output/profile/data/org.afaanoromobible.reader/development/user.sqlite"
  if [[ ! -f "$backup_file" ]]; then
    echo "verify-restored-backup requires the portable backup fixture as the third argument." >&2
    exit 1
  fi
else
  echo "Mode must be full, verify-existing or verify-restored-backup." >&2
  exit 1
fi
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
if [[ "$mode" == verify-existing ]]; then
  /usr/bin/afaan-oromo-bible >"$output/app-reinstalled.log" 2>&1 & app_pid=$!
  /usr/bin/python3 tools/linux/native-smoke.py --pid "$app_pid" --flow verify-saved-note \
    --confirm-synthetic-profile --dump --output-dir "$output/reinstalled"
  echo "Installed internal .deb reopened existing profile: $output"
  exit 0
fi
if [[ "$mode" == verify-restored-backup ]]; then
  /usr/bin/afaan-oromo-bible >"$output/app-reinstalled.log" 2>&1 & app_pid=$!
  /usr/bin/python3 tools/linux/native-smoke.py --pid "$app_pid" --flow verify-restored-backup \
    --backup-file "$backup_file" --installed-package --confirm-synthetic-profile --dump \
    --output-dir "$output/reinstalled"
  echo "Installed internal .deb preserved restored backup after reinstall: $output"
  exit 0
fi
/usr/bin/afaan-oromo-bible >"$output/app-first.log" 2>&1 & app_pid=$!
/usr/bin/python3 tools/linux/native-smoke.py --pid "$app_pid" --flow prepare-note \
  --confirm-synthetic-profile --dump --output-dir "$output/first"
database="$XDG_DATA_HOME/org.afaanoromobible.reader/development/user.sqlite"
/usr/bin/python3 - "$database" <<'PY'
import json, sqlite3, sys, time
deadline = time.monotonic() + 20
while True:
    with sqlite3.connect(f'file:{sys.argv[1]}?mode=ro', uri=True) as connection:
        notes = [json.loads(row[0]) for row in connection.execute('SELECT json FROM note')]
        positions = [json.loads(row[0]) for row in connection.execute('SELECT json FROM reading_position')]
        assert connection.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    assert len(notes) == 1
    assert notes[0]['anchor']['displayReferenceSnapshot'] == 'Sample Book A 1:2-3'
    if any(position['chapterLabel'] == '2' for position in positions):
        break
    if time.monotonic() > deadline:
        raise RuntimeError('Chapter 2 reading position did not commit before restart')
    time.sleep(0.1)
PY
kill -TERM "$app_pid"
wait "$app_pid" || true
app_pid=
/usr/bin/afaan-oromo-bible >"$output/app-restart.log" 2>&1 & app_pid=$!
/usr/bin/python3 tools/linux/native-smoke.py --pid "$app_pid" --flow verify-note \
  --confirm-synthetic-profile --dump --output-dir "$output/restart"
echo "Installed internal .deb smoke passed: $output"
