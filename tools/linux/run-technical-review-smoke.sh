#!/usr/bin/env bash
# Call inside one dbus-run-session and Xvfb session with an ignored technical pack.
set -euo pipefail

binary=${1:?Pass the embedded development binary.}
library=${2:?Pass the ignored technical library.sqlite.}
hash=${3:?Pass its SHA-256.}
output=${4:?Pass a new ignored output directory.}
flow=${5:-technical-review}
if [[ "$flow" != technical-review && "$flow" != technical-visual-samples && "$flow" != technical-search-benchmark ]]; then
  echo "Choose technical-review, technical-search-benchmark or technical-visual-samples." >&2
  exit 1
fi
if [[ -e "$output/profile" ]]; then
  echo "Use a new disposable review profile." >&2
  exit 1
fi
mkdir -p "$output/profile/data" "$output/profile/config" "$output/profile/cache" "$output/runtime"
chmod 700 "$output/runtime"
export XDG_DATA_HOME="$output/profile/data"
export XDG_CONFIG_HOME="$output/profile/config"
export XDG_CACHE_HOME="$output/profile/cache"
export XDG_RUNTIME_DIR="$output/runtime"
export AOB_TECHNICAL_REVIEW_LIBRARY="$library"
export AOB_TECHNICAL_REVIEW_SHA256="$hash"
export GDK_BACKEND=x11 NO_AT_BRIDGE=0 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_COMPOSITING_MODE=1

app_pid=
wm_pid=
cleanup() {
  if [[ -n "$app_pid" ]] && kill -0 "$app_pid" 2>/dev/null; then kill -TERM "$app_pid"; wait "$app_pid" || true; fi
  if [[ -n "$wm_pid" ]] && kill -0 "$wm_pid" 2>/dev/null; then kill -TERM "$wm_pid"; wait "$wm_pid" || true; fi
}
trap cleanup EXIT
gsettings set org.gnome.desktop.interface toolkit-accessibility true
openbox >"$output/openbox.log" 2>&1 &
wm_pid=$!
for _ in {1..100}; do
  if [[ "$(xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null)" == *"window id"* ]]; then break; fi
  sleep 0.1
done
"$binary" >"$output/app.log" 2>&1 &
app_pid=$!
first_pid=$app_pid
/usr/bin/python3 tools/linux/native-smoke.py --pid "$app_pid" --activate-window \
  --flow "$flow" --confirm-synthetic-profile --dump --screenshots --output-dir "$output/review"
if [[ "$flow" == technical-search-benchmark ]]; then
  echo "Native technical search benchmark captured: $output/review/report.json"
  exit 0
fi
if [[ "$flow" == technical-visual-samples ]]; then
  for image in prose-genesis-1 heading-genesis-10 bridge-matthew-2 poetry-matthew-5 long-psalm-119; do
    if [[ ! -s "$output/review/$image.png" ]]; then
      echo "Missing required technical review screenshot: $image.png" >&2
      exit 1
    fi
  done
  cat >"$output/review-guide.md" <<'MD'
# Local OOCS visual review samples

Compare these captured development windows with the supplied USX and the publisher's intended presentation. Record the reviewer, date, source revision and any correction; the screenshots alone are not an approval.

| Passage | Capture | Review focus |
| --- | --- | --- |
| GEN 1:1 | [prose](review/prose-genesis-1.png) | Body wording, paragraph breaks and verse markers |
| GEN 10:1 | [heading](review/heading-genesis-10.png) | Heading with a verse milestone, numbering and text style |
| MAT 2:5-6 | [bridge](review/bridge-matthew-2.png) | One bridged unit, poetry lines and source note trigger |
| MAT 5:3 | [poetry](review/poetry-matthew-5.png) | Leading whitespace, indentation and line breaks |
| PSA 119:1 | [long psalm](review/long-psalm-119.png) | Superscription, poetry indentation, long-chapter reading and the source Hebrew aleph (U+05D0) before “Aleef” |

Check Oromo glyphs, apostrophe forms, keyboard focus, text enlargement and copy output in the running app as well. This Xvfb capture does not establish GNOME, Orca, Windows or macOS presentation.
MD
  echo "Native technical visual samples captured: $output"
  exit 0
fi
/usr/bin/python3 - "$XDG_DATA_HOME" "$output" <<'PY'
from pathlib import Path
import json, sqlite3, sys
database = Path(sys.argv[1]) / "org.afaanoromobible.reader/technical-review/user.sqlite"
with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as connection:
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    notes = [json.loads(row[0]) for row in connection.execute("SELECT json FROM note")]
if integrity != "ok" or len(notes) != 1 or notes[0]["title"] != "Local technical review note":
    raise RuntimeError("Technical review note or SQLite integrity was not committed.")
if notes[0]["anchor"]["displayReferenceSnapshot"] != "Seera Uumamaa 34:5":
    raise RuntimeError("Technical review note lost its exact source anchor.")
Path(sys.argv[2], "sqlite-before-restart.json").write_text(json.dumps({
    "integrity": integrity, "note_count": 1, "linked_source_reference": "Seera Uumamaa 34:5"
}, indent=2) + "\n")
PY
kill -TERM "$app_pid"
wait "$app_pid" || true
app_pid=
"$binary" >"$output/restart-app.log" 2>&1 &
app_pid=$!
/usr/bin/python3 tools/linux/native-smoke.py --pid "$app_pid" --activate-window \
  --flow verify-technical-review --confirm-synthetic-profile --dump --screenshots --output-dir "$output/restart"
if [[ "$first_pid" == "$app_pid" ]]; then
  echo "Native technical review did not use a distinct restart process." >&2
  exit 1
fi
echo "Native technical review smoke passed: $output"
