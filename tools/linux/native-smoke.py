#!/usr/bin/env python3
"""Inspect and smoke-test the real Linux Tauri window through AT-SPI/X11.

Run inside the same isolated D-Bus/Xvfb session as the native application.
This harness does not launch the app, reset storage, or install dependencies.
Start with --dump; use --flow smoke before restarting the app and
--flow verify-note afterwards, retaining the same disposable fixture profile.
"""

from __future__ import annotations

import argparse
from collections import deque
from contextlib import closing, contextmanager
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import sqlite3
import statistics
import subprocess
import sys
import time
import hashlib
from typing import Any, Callable


NOTE_TITLE = "Linux native smoke fixture"
NOTE_BODY = "A synthetic native test note persists after the application restarts."
STANDALONE_NOTE_TITLE = "Linux standalone recovery fixture"
STANDALONE_NOTE_BODY = "A private synthetic note with no passage link."
BRIDGE = "Sample Book A 1:2-3"
TECHNICAL_NOTE_TITLE = "Local technical review note"
TECHNICAL_NOTE_BODY = "A private note linked to a local source-review passage."
CLOSE_NOTE_TITLE = "Linux close guard fixture"
CLOSE_BASELINE = "Baseline synthetic note committed before the native close tests."
CLOSE_DISCARDED = "This synthetic draft must survive Cancel and be removed by Discard."
CLOSE_SAVED = "This synthetic draft must survive a blocked save, then persist on Save and close."
CLOSE_DIALOG = "Save changes before closing?"
CAVEATS = [
    "Synthetic development content only; this is not a production-content test.",
    "A virtual/test desktop session does not qualify Ubuntu GNOME X11/Wayland or manual Orca accessibility.",
    "This does not qualify .deb installation, other distributions, Windows or macOS.",
]


class SmokeFailure(RuntimeError):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dump", action="store_true", help="Write readable and JSON native trees.")
    parser.add_argument("--all-apps", action="store_true", help="Dump the desktop registry for discovery only.")
    parser.add_argument("--app", default="Afaan Oromo Bible", help="Window/application name substring.")
    parser.add_argument("--pid", type=int, help="Additionally restrict the selected native window PID.")
    parser.add_argument("--activate-window", action="store_true", help="Activate/focus the X11 window before typing (requires a window manager).")
    parser.add_argument("--x11-window", help="Explicit X11 window ID for activation; otherwise discover it by the selected native PID.")
    parser.add_argument(
        "--flow", choices=["read", "technical-review", "technical-search-benchmark", "technical-visual-samples", "verify-technical-review", "verify-technical-changed-link", "verify-technical-bookmark", "verify-technical-changed-bookmark", "reviewed-builder-package", "verify-reviewed-builder-package", "reviewed-builder-backup", "reviewed-builder-clean-restore", "keyboard", "copy", "search", "prepare-note", "highlight", "verify-note", "verify-highlight", "verify-saved-note", "backup", "backup-full", "restore-full-clean", "restore-candidate-v1", "verify-restored-backup", "profile-in-use", "profile-after-release", "no-content", "verify-no-content", "recovery-corrupt", "verify-recovered-preference",
                           "close-cancel-discard", "close-save", "verify-close-save", "smoke"],
        help="Run a staged flow; smoke runs read/keyboard/copy/search/prepare-note, without a restart.",
    )
    parser.add_argument(
        "--confirm-synthetic-profile", action="store_true",
        help="Confirm this session uses a disposable test profile before actions.",
    )
    parser.add_argument("--timeout", type=float, default=20, help="Seconds per bounded wait (default 20).")
    parser.add_argument("--max-nodes", type=int, default=4000)
    parser.add_argument("--max-depth", type=int, default=40)
    parser.add_argument("--screenshots", action="store_true", help="Capture X11 root screenshots through Gdk.")
    parser.add_argument(
        "--output-dir", type=Path,
        default=Path(".tooling/linux-native-smoke") / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ"),
    )
    parser.add_argument(
        "--fixture-json", type=Path,
        default=Path(__file__).resolve().parents[2] / "content/fixtures/sample.json",
    )
    parser.add_argument("--user-db", type=Path, help="Existing isolated development user.sqlite for close/failure flows.")
    parser.add_argument("--backup-file", type=Path, help="Synthetic portable backup for a corrupt-recovery round trip.")
    parser.add_argument("--installed-package", action="store_true", help="Record that the selected app was launched from an installed internal package.")
    parser.add_argument("--expected-content-error", help="Exact visible content error for an internal resource-path probe.")
    args = parser.parse_args()
    if args.timeout <= 0 or args.timeout > 60 or args.max_nodes < 1 or args.max_depth < 1:
        parser.error("Use timeout in (0, 60] and positive tree bounds.")
    if args.all_apps and args.flow:
        parser.error("--all-apps is discovery-only; select an application before running flows.")
    if args.flow and args.flow != "read" and not args.confirm_synthetic_profile:
        parser.error("Actions require --confirm-synthetic-profile and a disposable test session.")
    if args.flow in {"close-cancel-discard", "close-save", "verify-close-save"} and args.user_db is None:
        parser.error("Close flows require --user-db inside the isolated XDG_DATA_HOME/development profile.")
    return args


def load_atspi() -> Any:
    try:
        import gi
        gi.require_version("Atspi", "2.0")
        from gi.repository import Atspi
    except (ImportError, ValueError) as error:
        raise SmokeFailure(
            "AT-SPI GI is unavailable. Use the container's /usr/bin/python3 with "
            "python3-gi, gir1.2-atspi-2.0 and at-spi2-core installed."
        ) from error
    Atspi.init()
    return Atspi


class NativeSmoke:
    def __init__(self, args: argparse.Namespace, report: dict[str, Any]):
        self.args, self.report = args, report
        self.atspi = load_atspi()
        self.root: Any = None

    @staticmethod
    def safe(fn: Callable[[], Any], fallback: Any = "") -> Any:
        try:
            return fn()
        except Exception:
            # A disappearing native accessible is expected while traversing a live tree.
            return fallback

    def walk(self, root: Any):
        queue = deque([(root, "0", 0)])
        count = 0
        while queue and count < self.args.max_nodes:
            node, path, depth = queue.popleft()
            if node is None:
                continue
            count += 1
            yield node, path, depth
            if depth < self.args.max_depth:
                child_count = self.safe(node.get_child_count, 0)
                for index in range(min(child_count, self.args.max_nodes - count)):
                    child = self.safe(lambda: node.get_child_at_index(index), None)
                    if child is not None:
                        queue.append((child, f"{path}/{index}", depth + 1))

    def state(self, node: Any, name: str) -> bool:
        return self.safe(lambda: node.get_state_set().contains(getattr(self.atspi.StateType, name)), False)

    def text(self, node: Any, limit: int = 4000) -> str:
        def read() -> str:
            interface = node.get_text_iface()
            if interface is None:
                return ""
            # GI returns an Accessible implementing Text. Accessible.get_text()
            # is a deprecated interface getter and shadows Text.get_text().
            end = min(self.atspi.Text.get_character_count(interface), limit)
            return self.atspi.Text.get_text(interface, 0, end)
        return self.safe(read)

    def name(self, node: Any) -> str:
        return self.safe(node.get_name)

    def wait(self, description: str, predicate: Callable[[], Any]) -> Any:
        deadline = time.monotonic() + self.args.timeout
        last_error = None
        while time.monotonic() < deadline:
            try:
                value = predicate()
                if value:
                    return value
            except SmokeFailure:
                raise
            except Exception as error:
                last_error = str(error)
            time.sleep(0.15)
        detail = f" Last provider error: {last_error}" if last_error else ""
        raise SmokeFailure(f"Timed out waiting for {description}.{detail}")

    def select_root(self) -> Any:
        desktop = self.atspi.get_desktop(0)
        if self.args.all_apps:
            self.root = desktop
            return desktop

        def select():
            matches = []
            for node, _, _ in self.walk(desktop):
                role = self.safe(node.get_role_name)
                if role not in {"frame", "window", "application"}:
                    continue
                if self.args.app.casefold() not in self.name(node).casefold():
                    continue
                if self.args.pid is not None and self.safe(node.get_process_id, 0) != self.args.pid:
                    continue
                matches.append((role != "application", node))
            return sorted(matches, key=lambda item: item[0], reverse=True)[0][1] if matches else None

        try:
            self.root = self.wait(f"native window matching {self.args.app!r}", select)
        except SmokeFailure:
            self.dump("desktop-discovery", desktop)
            raise
        return self.root

    def find(self, name: str, *, prefix: bool = False, roles: set[str] | None = None, root: Any = None):
        for node, _, _ in self.walk(root if root is not None else self.root):
            if not self.state(node, "SHOWING"):
                continue
            if roles and self.safe(node.get_role_name) not in roles:
                continue
            actual = self.name(node)
            if actual == name or (prefix and actual.startswith(name)):
                return node
        return None

    def named(self, name: str, **kwargs):
        return self.wait(f"visible accessible {name!r}", lambda: self.find(name, **kwargs))

    def has_text(self, expected: str):
        for node, _, _ in self.walk(self.root):
            if self.state(node, "SHOWING") and (expected in self.name(node) or expected in self.text(node)):
                return node
        return None

    def scroll_until_text(self, expected: str, *, x: int, y: int, attempts: int = 20):
        for _ in range(attempts):
            found = self.has_text(expected)
            if found is not None:
                return found
            self.command(["xdotool", "mousemove", str(x), str(y), "click", "5"])
            time.sleep(0.1)
        return self.wait(f"visible text {expected!r} after scrolling", lambda: self.has_text(expected))

    def command(self, args: list[str], **kwargs) -> str:
        if shutil.which(args[0]) is None:
            raise SmokeFailure(f"Missing test-only executable: {args[0]}")
        try:
            result = subprocess.run(args, capture_output=True, text=True, timeout=8, **kwargs)
        except (OSError, subprocess.TimeoutExpired) as error:
            raise SmokeFailure(f"Command {args!r} could not complete: {error}") from error
        if result.returncode:
            raise SmokeFailure(f"Command {args!r} failed ({result.returncode}): {result.stderr.strip()[:500]}")
        return result.stdout

    def enter_native_path(self, path: Path):
        value = str(path)
        if value.isascii():
            self.command(["xdotool", "type", "--clearmodifiers", "--delay", "2", "--", value])
            return
        owner = subprocess.Popen(
            ["xclip", "-selection", "clipboard", "-target", "UTF8_STRING", "-quiet"],
            stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            text=True, encoding="utf-8",
        )
        try:
            if owner.stdin is None:
                raise SmokeFailure("Could not initialize the Unicode path clipboard.")
            owner.stdin.write(value)
            owner.stdin.close()
            self.wait("Unicode path on clipboard", lambda: self.clipboard_text() == value)
            self.command(["xdotool", "key", "--clearmodifiers", "ctrl+v"])
            time.sleep(0.15)
        finally:
            if owner.poll() is None:
                owner.terminate()
                try:
                    owner.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    owner.kill()
                    owner.wait(timeout=2)

    def active_window_name(self) -> str:
        result = subprocess.run(["xdotool", "getactivewindow", "getwindowname"],
                                capture_output=True, text=True, timeout=2)
        return result.stdout.strip() if result.returncode == 0 else ""

    def visible_windows(self, pid: int) -> list[str] | None:
        args = ["xdotool", "search", "--onlyvisible", "--pid", str(pid)]
        if shutil.which("xdotool") is None:
            raise SmokeFailure("Missing test-only executable: xdotool")
        try:
            result = subprocess.run(args, capture_output=True, text=True, timeout=2)
        except (OSError, subprocess.TimeoutExpired) as error:
            raise SmokeFailure(f"Command {args!r} could not complete: {error}") from error
        if result.returncode in {0, 1} and not result.stdout.strip() and not result.stderr.strip():
            probe = self.report.setdefault("x11_window_discovery", {"pid": pid, "transient_no_window": 0})
            probe["transient_no_window"] += 1
            # Some X11 sessions omit the PID from xdotool's search index even
            # though the client window exposes _NET_WM_PID. Verify that property
            # before accepting a title fallback in this isolated display.
            titled = subprocess.run(
                ["xdotool", "search", "--onlyvisible", "--name", "Afaan Oromo Bible"],
                capture_output=True, text=True, timeout=2,
            )
            if titled.returncode not in {0, 1} or titled.stderr.strip():
                raise SmokeFailure(f"X11 title lookup failed: {titled.stderr.strip()[:500]}")
            matches = []
            for window in titled.stdout.splitlines():
                if not window.isdecimal():
                    raise SmokeFailure(f"X11 title lookup returned an invalid window: {window!r}")
                properties = subprocess.run(
                    ["xprop", "-id", window, "_NET_WM_PID"],
                    capture_output=True, text=True, timeout=2,
                )
                if properties.returncode == 0 and properties.stdout.strip() == f"_NET_WM_PID(CARDINAL) = {pid}":
                    matches.append(window)
            if probe["transient_no_window"] == 5:
                probe["title_candidates"] = len(titled.stdout.splitlines())
                probe["pid_matches"] = len(matches)
            if len(matches) == 1:
                probe["verified_title_fallback"] = True
                return matches
            return None
        if result.returncode or result.stderr.strip():
            raise SmokeFailure(f"Command {args!r} failed ({result.returncode}): {result.stderr.strip()[:500]}")
        windows = result.stdout.splitlines()
        if any(not window.isdecimal() for window in windows):
            raise SmokeFailure(f"Command {args!r} returned unexpected window IDs: {windows!r}")
        return windows

    def clipboard_text(self) -> str | None:
        """Probe UTF-8 clipboard ownership; retry only the known handover gap."""
        try:
            result = subprocess.run(
                ["xclip", "-selection", "clipboard", "-target", "UTF8_STRING", "-o"],
                capture_output=True, text=True, encoding="utf-8", timeout=2,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise SmokeFailure(f"Clipboard probe could not complete: {error}") from error
        if result.returncode == 0:
            return result.stdout
        message = result.stderr.strip()
        if result.returncode == 1 and message in {
            "Error: target UTF8_STRING not available", "Error: target STRING not available",
        }:
            probe = self.report.setdefault("clipboard_probe", {"target": "UTF8_STRING", "transient_unavailable": 0})
            probe["transient_unavailable"] += 1
            return None
        raise SmokeFailure(f"Clipboard probe failed ({result.returncode}): {message[:500]}")

    def activate(self, name: str, **kwargs):
        node = self.named(name, **kwargs)
        if not self.state(node, "ENABLED"):
            node = self.wait(f"enabled {name!r}", lambda: self.find(name, **kwargs)
                             if self.state(self.find(name, **kwargs), "ENABLED") else None)
        interface = node.get_action_iface()
        if interface is None or interface.get_n_actions() == 0:
            raise SmokeFailure(f"Accessible {name!r} has no native action; inspect the tree dump.")
        actions = [interface.get_action_name(i) for i in range(interface.get_n_actions())]
        action_index = next((i for i, action in enumerate(actions) if action in {"click", "press", "activate"}), 0)
        if not interface.do_action(action_index):
            raise SmokeFailure(f"Native action failed for {name!r}.")

    def reveal_settings_control(self, name: str):
        # Settings is vertically scrollable. AT-SPI keeps offscreen controls in
        # the tree but does not mark them SHOWING until the dialog is scrolled.
        self.named("Make room for reading", roles={"dialog"})
        self.command(["xdotool", "mousemove", "900", "700"])
        for _ in range(18):
            if self.find(name, roles={"push button", "button"}):
                return
            self.command(["xdotool", "click", "5"])
        self.named(name, roles={"push button", "button"})

    def activate_window(self):
        window = self.args.x11_window
        if window is None:
            pid = self.safe(self.root.get_process_id, 0)
            if not pid:
                raise SmokeFailure("Native window has no PID; pass --x11-window explicitly.")
            windows = self.wait(f"visible X11 window for native PID {pid}", lambda: self.visible_windows(pid))
            window = windows[0]
        self.command(["xdotool", "windowactivate", "--sync", window])
        self.command(["xdotool", "windowfocus", "--sync", window])

    def focus(self, name: str):
        if self.args.activate_window or self.args.x11_window:
            self.activate_window()
        node = self.named(name)
        component = node.get_component_iface()
        if component is None or not component.grab_focus():
            raise SmokeFailure(f"Could not focus {name!r} through AT-SPI.")
        self.wait(f"focus on {name!r}", lambda: self.state(node, "FOCUSED"))

    def fill(self, name: str, value: str):
        self.focus(name)
        self.command(["xdotool", "key", "--clearmodifiers", "ctrl+a"])
        self.command(["xdotool", "type", "--clearmodifiers", "--delay", "2", "--", value])
        self.wait(f"typed value in {name!r}", lambda: self.text(self.find(name)) == value)

    def reference(self, reference: str, selected_name: str):
        self.fill("Open a Scripture reference", reference)
        self.command(["xdotool", "key", "--clearmodifiers", "Return"])
        self.wait(f"selected {selected_name}", lambda: self.selected(selected_name))

    def selected(self, reference: str):
        # Persisted highlights append a spoken color to the verse action name.
        node = self.find(f"Select verse {reference}") or self.find(
            f"Select verse {reference}. Highlighted ", prefix=True
        )
        if node is None:
            return None
        role = self.safe(node.get_role_name)
        if role != "toggle button":
            raise SmokeFailure(f"Verse selection has unexpected native role {role!r}; expected 'toggle button'.")
        # WebKit exposes aria-pressed buttons as toggles; the provider may map
        # the active toggle to CHECKED or PRESSED. Existence alone is no pass.
        active_states = [state for state in ("CHECKED", "PRESSED") if self.state(node, state)]
        if not active_states:
            return None
        self.report.setdefault("selected_verses", {})[reference] = {"role": role, "active_states": active_states}
        return node

    def dump(self, label: str, root: Any = None):
        records = []
        for node, path, depth in self.walk(root if root is not None else self.root):
            records.append({
                "path": path, "depth": depth, "role": self.safe(node.get_role_name),
                "name": self.name(node)[:600], "text": self.text(node, 600),
                "pid": self.safe(node.get_process_id, 0),
                "states": [state for state in ["SHOWING", "VISIBLE", "ENABLED", "FOCUSABLE", "FOCUSED", "PRESSED", "CHECKED", "SELECTED"] if self.state(node, state)],
                "attributes": self.safe(node.get_attributes, {}),
            })
        target = self.args.output_dir / label
        target.with_suffix(".json").write_text(json.dumps(records, ensure_ascii=False, indent=2, default=str) + "\n")
        target.with_suffix(".txt").write_text("\n".join(
            f"{'  ' * row['depth']}{row['path']} {row['role']} {row['name']!r} [{', '.join(row['states'])}]"
            + (f" text={row['text']!r}" if row['text'] and row['text'] != row['name'] else "")
            for row in records
        ) + "\n")
        self.report.setdefault("trees", []).append({"label": label, "nodes": len(records), "bounds": {"nodes": self.args.max_nodes, "depth": self.args.max_depth}})
        if self.args.screenshots:
            try:
                import gi
                gi.require_version("Gdk", "3.0")
                from gi.repository import Gdk
                window = Gdk.get_default_root_window()
                if window is None:
                    raise SmokeFailure("No Gdk X11 root window is available.")
                pixbuf = Gdk.pixbuf_get_from_window(window, 0, 0, window.get_width(), window.get_height())
                if pixbuf is None or not pixbuf.savev(str(target.with_suffix(".png")), "png", [], []):
                    raise SmokeFailure("Gdk screenshot capture failed.")
            except Exception as error:
                self.report.setdefault("screenshot_errors", []).append(str(error))
                raise SmokeFailure(f"Requested screenshot {label!r} could not be captured: {error}") from error

    def read(self):
        self.wait("synthetic-content label", lambda: self.has_text("Synthetic test content"))

    def technical_review(self):
        self.wait("technical review warning", lambda: self.has_text("Technical source review"))
        self.named("Chapter 1", roles={"heading"})
        self.reference("MAT 2:5", "Injiila Maatewos 2:5-6")
        library_path = Path(os.environ["AOB_TECHNICAL_REVIEW_LIBRARY"])
        with closing(sqlite3.connect(library_path.as_uri() + "?mode=ro", uri=True)) as connection:
            edition = json.loads(connection.execute("SELECT json FROM edition WHERE id='oocs-2024'").fetchone()[0])
            book_name, label, body = connection.execute(
                "SELECT book_name,verse_label,text_plain FROM verse_unit "
                "WHERE book_code=? AND chapter_label=? AND verse_label=?",
                ("MAT", "2", "5-6"),
            ).fetchone()
        if book_name != "Injiila Maatewos" or label != "5-6" or edition.get("isSynthetic") is not False:
            raise SmokeFailure("Technical clipboard expectation did not resolve to the registered source bridge.")
        expected = f"{label} {body}\n\n{book_name} 2:{label} · {edition['abbreviation']}\n{edition['attribution']}"
        self.copy_and_match(expected)
        self.activate("Search Scripture", root=self.named("Workspace"))
        self.fill("Words or quoted phrase", "tiksu")
        search_started = time.perf_counter()
        self.command(["xdotool", "key", "--clearmodifiers", "Return"])
        self.wait("four source search results", lambda: self.has_text("4 RESULTS · SHOWING 4"))
        search_visible_ms = round((time.perf_counter() - search_started) * 1000, 2)
        self.activate("Seera Uumamaa 34:5", prefix=True, roles={"push button", "button"})
        self.wait("opened source search result", lambda: self.selected("Seera Uumamaa 34:5"))
        self.activate("Add note", roles={"push button", "button"})
        self.fill("Note title", TECHNICAL_NOTE_TITLE)
        self.fill("Note text", TECHNICAL_NOTE_BODY)
        self.command(["xdotool", "key", "--clearmodifiers", "Tab", "Tab"])
        self.activate("Save", roles={"push button", "button"})
        self.wait("committed technical review note", lambda: self.has_text("Saved on this device"))
        self.report["technical_review"] = {
            "warning_visible": True,
            "source_bridge_selected": "Injiila Maatewos 2:5-6",
            "exact_source_copy": True,
            "copy_characters": len(expected),
            "search_query": "tiksu",
            "search_results": 4,
            "search_submit_to_visible_ms": search_visible_ms,
            "search_timing_scope": "One warm native window; xdotool Return through AT-SPI visibility polling at 150 ms intervals, including harness overhead",
            "opened_search_result": "Seera Uumamaa 34:5",
            "linked_note_saved": True,
        }

    def technical_search_benchmark(self):
        self.wait("technical review warning", lambda: self.has_text("Technical source review"))
        library_path = Path(os.environ["AOB_TECHNICAL_REVIEW_LIBRARY"])
        with closing(sqlite3.connect(library_path.as_uri() + "?mode=ro", uri=True)) as connection:
            edition_id = connection.execute("SELECT edition_id FROM content_manifest").fetchone()[0]
            connection.execute("CREATE VIRTUAL TABLE temp.search_vocab USING fts5vocab(main,verse_search,'row')")
            candidates = [row[0] for row in connection.execute(
                "SELECT term FROM search_vocab ORDER BY doc DESC,term LIMIT 100"
            )]
            queries = []
            seen_counts = set()
            for term in candidates:
                if not term.isascii() or not term.isalpha() or len(term) < 3:
                    continue
                expression = '"' + term + '"'
                count = connection.execute(
                    "SELECT count(*) FROM verse_search CROSS JOIN verse_unit v "
                    "ON v.rowid=verse_search.rowid WHERE verse_search MATCH ? "
                    "AND v.edition_id=?", (expression, edition_id),
                ).fetchone()[0]
                if count < 2 or count in seen_counts:
                    continue
                seen_counts.add(count)
                queries.append((term, count))
                if len(queries) == 12:
                    break
        if len(queries) != 12:
            raise SmokeFailure("Technical corpus did not supply twelve distinct-count ASCII terms.")
        self.activate("Search Scripture", root=self.named("Workspace"))
        timings = []
        for term, count in queries:
            self.fill("Words or quoted phrase", term)
            started = time.perf_counter()
            self.command(["xdotool", "key", "--clearmodifiers", "Return"])
            summary = f"{count} RESULTS · SHOWING {min(count, 50)}"
            self.wait(f"search result count {count}", lambda: self.has_text(summary))
            timings.append(round((time.perf_counter() - started) * 1000, 2))
        ordered = sorted(timings)
        self.report["technical_search_benchmark"] = {
            "scope": "Twelve warmed native UI submissions on technical content; X11 command and 150 ms AT-SPI polling included; no renderer, IPC or SQL isolation",
            "database_sha256": os.environ["AOB_TECHNICAL_REVIEW_SHA256"],
            "query_count": len(queries),
            "query_set_sha256": hashlib.sha256(json.dumps(queries, ensure_ascii=False).encode()).hexdigest(),
            "match_counts": [count for _, count in queries],
            "latency_ms": {
                "min": min(timings),
                "median": statistics.median(timings),
                "p95": ordered[10] + (ordered[11] - ordered[10]) * 0.45,
                "max": max(timings),
            },
            "samples_ms": timings,
        }

    def verify_technical_review(self):
        self.activate("My notes", prefix=True, root=self.named("Workspace"))
        saved = self.named("Saved notes")
        self.activate(TECHNICAL_NOTE_TITLE, prefix=True, root=saved, roles={"push button", "button"})
        if self.text(self.named("Note title")) != TECHNICAL_NOTE_TITLE or self.text(self.named("Note text")) != TECHNICAL_NOTE_BODY:
            raise SmokeFailure("Restarted technical review note differs from its committed text.")
        self.activate("Open Seera Uumamaa 34:5")
        self.wait("reopened technical source note anchor", lambda: self.selected("Seera Uumamaa 34:5"))
        self.report["technical_review_restart"] = {"linked_note_reopened": True, "anchor": "Seera Uumamaa 34:5"}

    def verify_technical_changed_link(self):
        self.activate("My notes", prefix=True, root=self.named("Workspace"))
        saved = self.named("Saved notes")
        self.activate(TECHNICAL_NOTE_TITLE, prefix=True, root=saved, roles={"push button", "button"})
        if self.text(self.named("Note text")) != TECHNICAL_NOTE_BODY:
            raise SmokeFailure("The private note body changed during the revision test.")
        self.activate("Open Seera Uumamaa 34:5")
        self.wait("chapter for changed note link", lambda: self.find("Chapter 34", roles={"heading"}))
        self.wait("changed-passage review warning", lambda: self.has_text("This note's passage changed"))
        if self.selected("Seera Uumamaa 34:5"):
            raise SmokeFailure("Changed note link selected an unverified source verse.")
        self.report["technical_changed_link"] = {
            "note_body_preserved": True,
            "chapter_opened": "Seera Uumamaa 34",
            "unverified_verse_not_selected": True,
            "review_warning_visible": True,
        }

    def verify_technical_bookmark(self):
        self.verify_revision_bookmark(changed=False)

    def verify_technical_changed_bookmark(self):
        self.verify_revision_bookmark(changed=True)

    def verify_revision_bookmark(self, *, changed: bool):
        self.activate("Bookmarks", prefix=True, root=self.named("Workspace"))
        saved = self.named("Saved bookmarks")
        self.activate("Seera Uumamaa 34:5", root=saved, roles={"push button", "button"})
        self.wait("chapter for saved bookmark", lambda: self.find("Chapter 34", roles={"article"}))
        if changed:
            self.wait("changed-bookmark review warning", lambda: self.has_text("This passage changed in the installed content"))
            if self.selected("Seera Uumamaa 34:5"):
                raise SmokeFailure("Changed bookmark selected an unverified source verse.")
        else:
            self.wait("exact bookmark verse", lambda: self.selected("Seera Uumamaa 34:5"))
        self.report["technical_bookmark"] = {
            "chapter_opened": "Seera Uumamaa 34",
            "exact_verse_selected": not changed,
            "review_warning_visible": changed,
        }

    def reviewed_builder_package(self):
        self.wait("installed synthetic reviewed pack", lambda: self.has_text("Test Book"))
        self.reference("TST 1:1", "Test Book 1:1")
        self.activate("Search Scripture", root=self.named("Workspace"))
        self.fill("Words or quoted phrase", "synthetic")
        self.command(["xdotool", "key", "--clearmodifiers", "Return"])
        self.wait("installed synthetic search result", lambda: self.has_text("1 RESULT · SHOWING 1"))
        self.activate("Test Book 1:1", prefix=True, roles={"push button", "button"})
        self.wait("opened installed search result", lambda: self.selected("Test Book 1:1"))
        self.activate("Add note", roles={"push button", "button"})
        self.fill("Note title", NOTE_TITLE)
        self.fill("Note text", NOTE_BODY)
        self.command(["xdotool", "key", "--clearmodifiers", "Tab", "Tab"])
        self.activate("Save", roles={"push button", "button"})
        self.wait("committed installed-pack note", lambda: self.has_text("Saved on this device"))
        self.report["reviewed_builder_package"] = {"reference": "Test Book 1:1",
                                                     "search_results": 1, "linked_note_saved": True}

    def verify_reviewed_builder_package(self):
        self.wait("installed synthetic reviewed pack after restart", lambda: self.has_text("Test Book"))
        self.activate("My notes", prefix=True, root=self.named("Workspace"))
        saved = self.named("Saved notes")
        self.activate(NOTE_TITLE, prefix=True, root=saved, roles={"push button", "button"})
        if self.text(self.named("Note title")) != NOTE_TITLE or self.text(self.named("Note text")) != NOTE_BODY:
            raise SmokeFailure("Installed reviewed-builder note differs after restart.")
        self.activate("Open Test Book 1:1")
        self.wait("reopened installed note anchor", lambda: self.selected("Test Book 1:1"))
        self.report["reviewed_builder_restart"] = {"linked_note_reopened": True,
                                                    "anchor": "Test Book 1:1"}

    def reviewed_builder_backup(self):
        self.wait("installed reviewed pack before backup", lambda: self.has_text("Test Book"))
        backup_path = self.args.output_dir / "native-export.json"
        data_root = Path(os.environ["XDG_DATA_HOME"]) / "org.afaanoromobible.reader/production"
        user_db = data_root / "user.sqlite"

        def font_size() -> int | None:
            with closing(sqlite3.connect(user_db.as_uri() + "?mode=ro", uri=True)) as connection:
                row = connection.execute("SELECT json FROM preference LIMIT 1").fetchone()
            return json.loads(row[0])["fontSizePx"] if row else None

        self.activate("Reading preferences", roles={"push button", "button"})
        self.named("Make room for reading", roles={"dialog"})
        for _ in range(12):
            current_font = font_size()
            if current_font == 22:
                break
            if current_font is None or current_font < 22:
                self.activate("Increase text size", roles={"push button", "button"})
            else:
                self.activate("Decrease text size", roles={"push button", "button"})
        self.wait("22 px installed preference", lambda: font_size() == 22)
        self.reveal_settings_control("Export backup")
        self.activate("Export backup", roles={"push button", "button"})
        self.wait("installed backup save dialog", lambda: "Save" in self.active_window_name())
        self.command(["xdotool", "key", "--clearmodifiers", "ctrl+l"])
        self.enter_native_path(backup_path.with_suffix(""))
        self.command(["xdotool", "key", "--clearmodifiers", "Return"])
        self.wait("installed backup exported", backup_path.exists)
        exported = json.loads(backup_path.read_text())
        data = exported["data"]
        if (exported.get("format") != "afaan-oromo-bible-user-backup"
                or len(data["notes"]) != 1 or len(data["anchors"]) != 1
                or len(data["preferences"]) != 1 or data["preferences"][0]["fontSizePx"] != 22):
            raise SmokeFailure("Installed reviewed-pack export lost its linked note or preference.")
        expected_note = dict(data["notes"][0])
        anchor_id = expected_note.pop("anchorId")
        expected_note["anchor"] = next((anchor for anchor in data["anchors"] if anchor["id"] == anchor_id), None)
        if expected_note["anchor"] is None:
            raise SmokeFailure("Installed reviewed-pack export lost the exact note anchor.")
        self.activate("Increase text size", roles={"push button", "button"})
        self.wait("24 px installed preference", lambda: font_size() == 24)
        prior_recovery_files = set((data_root / "recovery").glob("pre-restore-*.json"))
        self.reveal_settings_control("Review backup to restore")
        self.activate("Review backup to restore", roles={"push button", "button"})
        self.wait("installed backup open dialog", lambda: "Open" in self.active_window_name())
        self.command(["xdotool", "key", "--clearmodifiers", "ctrl+l"])
        self.enter_native_path(backup_path)
        self.command(["xdotool", "key", "--clearmodifiers", "Return"])
        if "Open" in self.active_window_name():
            self.activate("Open", roles={"push button"}, root=self.atspi.get_desktop(0))
        self.named("Replace personal data?", roles={"dialog"})
        self.activate("Replace all personal data", roles={"push button", "button"})
        self.named("Personal data restored", roles={"dialog"})
        self.wait("restored 22 px installed preference", lambda: font_size() == 22)
        with closing(sqlite3.connect(user_db.as_uri() + "?mode=ro", uri=True)) as connection:
            integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
            notes = [json.loads(row[0]) for row in connection.execute("SELECT json FROM note")]
        if integrity != "ok" or notes != [expected_note]:
            raise SmokeFailure("Installed reviewed-pack restore changed the linked note or database integrity.")
        recovery_files = list(set((data_root / "recovery").glob("pre-restore-*.json")) - prior_recovery_files)
        if len(recovery_files) != 1:
            raise SmokeFailure("Installed reviewed-pack restore did not retain one pre-restore snapshot.")
        recovery = json.loads(recovery_files[0].read_text())
        if recovery["data"]["preferences"][0]["fontSizePx"] != 24:
            raise SmokeFailure("Pre-restore snapshot lost the replaced 24 px setting.")
        self.report["reviewed_builder_backup"] = {"exported_records": 1,
                                                  "restored_font_px": 22,
                                                  "recovered_prior_font_px": 24,
                                                  "linked_anchor_preserved": True,
                                                  "sqlite_integrity": integrity}

    def reviewed_builder_clean_restore(self):
        if self.args.backup_file is None or not self.args.backup_file.is_file():
            raise SmokeFailure("An exported reviewed-builder backup is required.")
        self.wait("installed reviewed pack in clean profile", lambda: self.has_text("Test Book"))
        database = Path(os.environ["XDG_DATA_HOME"]) / "org.afaanoromobible.reader/production/user.sqlite"
        with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)) as connection:
            if any(connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
                   for table in ("note", "bookmark", "highlight", "preference", "reading_position")):
                raise SmokeFailure("Clean reviewed-builder profile already has personal records.")
        exported = json.loads(self.args.backup_file.read_text())["data"]
        expected_note = dict(exported["notes"][0])
        anchor_id = expected_note.pop("anchorId")
        expected_note["anchor"] = next((item for item in exported["anchors"] if item["id"] == anchor_id), None)
        if expected_note["anchor"] is None:
            raise SmokeFailure("Exported note anchor is missing before clean restore.")
        self.activate("Reading preferences", roles={"push button", "button"})
        self.named("Make room for reading", roles={"dialog"})
        self.reveal_settings_control("Review backup to restore")
        self.activate("Review backup to restore", roles={"push button", "button"})
        self.wait("clean restore native open dialog", lambda: "Open" in self.active_window_name())
        self.command(["xdotool", "key", "--clearmodifiers", "ctrl+l"])
        self.enter_native_path(self.args.backup_file.resolve())
        self.command(["xdotool", "key", "--clearmodifiers", "Return"])
        if "Open" in self.active_window_name():
            self.activate("Open", roles={"push button"}, root=self.atspi.get_desktop(0))
        self.named("Replace personal data?", roles={"dialog"})
        self.activate("Replace all personal data", roles={"push button", "button"})
        self.named("Personal data restored", roles={"dialog"})
        with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)) as connection:
            integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
            actual = {table: [json.loads(row[0]) for row in connection.execute(f"SELECT json FROM {table}")]
                      for table in ("note", "bookmark", "highlight", "preference", "reading_position")}
        if (integrity != "ok" or actual["note"] != [expected_note]
                or actual["bookmark"] or actual["highlight"]
                or actual["preference"] != exported["preferences"]
                or actual["reading_position"] != exported["readingPositions"]):
            raise SmokeFailure("Clean reviewed-builder restore changed exported records or integrity.")
        self.report["reviewed_builder_clean_restore"] = {"exact_note_anchor_restored": True,
                                                         "preference_restored": True,
                                                         "reading_position_restored": True,
                                                         "sqlite_integrity": integrity}

    def technical_visual_samples(self):
        self.wait("technical review warning", lambda: self.has_text("Technical source review"))
        passages = [
            ("GEN 1:1", "Seera Uumamaa 1:1", "prose-genesis-1"),
            ("GEN 10:1", "Seera Uumamaa 10:1", "heading-genesis-10"),
            ("MAT 2:5", "Injiila Maatewos 2:5-6", "bridge-matthew-2"),
            ("MAT 5:3", "Injiila Maatewos 5:3", "poetry-matthew-5"),
            ("PSA 119:1", "Kitaaba Zabuuriiwwanii 119:1", "long-psalm-119"),
        ]
        for reference, selected, label in passages:
            self.reference(reference, selected)
            self.dump(label)
        self.report["visual_samples"] = [selected for _, selected, _ in passages]

    def no_content(self):
        self.wait("missing packaged content error", lambda: self.has_text("Content unavailable"))
        if self.args.expected_content_error:
            self.wait("specific content rejection", lambda: self.has_text(self.args.expected_content_error))
            self.report["content_rejection"] = self.args.expected_content_error
        self.activate("My notes", prefix=True)
        self.activate("New note", roles={"push button", "button"})
        self.fill("Note title", NOTE_TITLE)
        self.fill("Note text", NOTE_BODY)
        self.command(["xdotool", "key", "--clearmodifiers", "Tab", "Tab"])
        self.activate("Save", roles={"push button", "button"})
        self.wait("standalone note saved", lambda: self.has_text("Saved on this device"))
        self.activate("Reading preferences", roles={"push button", "button"})
        self.named("Make room for reading", roles={"dialog"})
        self.activate("Increase text size", roles={"push button", "button"})
        self.wait("22 px preference committed without content", lambda: self.no_content_font_size() == 22)

    def verify_no_content(self):
        self.wait("missing packaged content error", lambda: self.has_text("Content unavailable"))
        if self.args.expected_content_error:
            self.wait("specific content rejection after restart", lambda: self.has_text(self.args.expected_content_error))
            self.report["content_rejection"] = self.args.expected_content_error
        self.activate("My notes", prefix=True)
        self.wait("saved standalone note", lambda: self.has_text(NOTE_TITLE))
        self.activate(NOTE_TITLE, prefix=True)
        if self.text(self.named("Note title")) != NOTE_TITLE or self.text(self.named("Note text")) != NOTE_BODY:
            raise SmokeFailure("Standalone note did not survive restart without packaged content.")
        self.activate("Reading preferences", roles={"push button", "button"})
        self.named("Make room for reading", roles={"dialog"})
        self.wait("22 px preference loaded without content", lambda: self.has_text("22 px"))
        if self.no_content_font_size() != 22:
            raise SmokeFailure("The restarted preference differs from the committed user database.")

    def no_content_font_size(self) -> int | None:
        database = Path(os.environ["XDG_DATA_HOME"]) / "org.afaanoromobible.reader/production/user.sqlite"
        if not database.exists():
            return None
        with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as connection:
            row = connection.execute("SELECT json FROM preference LIMIT 1").fetchone()
        return json.loads(row[0])["fontSizePx"] if row else None

    def keyboard(self):
        self.focus("Open a Scripture reference")
        self.command(["xdotool", "key", "--clearmodifiers", "Tab"])
        self.wait("Tab focus on Go", lambda: self.state(self.find("Go", roles={"push button"}), "FOCUSED"))
        self.command(["xdotool", "key", "--clearmodifiers", "shift+Tab"])
        self.wait("reverse Tab focus on reference entry", lambda: self.state(self.find("Open a Scripture reference", roles={"entry"}), "FOCUSED"))

        self.focus("Reading preferences")
        self.command(["xdotool", "key", "--clearmodifiers", "space"])
        title = "Make room for reading"
        dialog = self.named(title, roles={"dialog"})

        def dialog_focus(strict: bool = True):
            rows = list(self.walk(self.root))
            dialog_paths = [path for node, path, _ in rows
                            if self.name(node) == title and self.safe(node.get_role_name) == "dialog"
                            and self.state(node, "SHOWING")]
            focused = [(node, path) for node, path, _ in rows
                       if self.state(node, "FOCUSED") and self.state(node, "FOCUSABLE")]
            # WebKit may also mark the containing web document focused. Only
            # deepest focused accessibles represent actual keyboard targets.
            leaves = [(node, path) for node, path in focused
                      if not any(other.startswith(path + "/") for _, other in focused)]
            if not leaves:
                return None
            outside = [(self.safe(node.get_role_name), self.name(node)) for node, path in leaves
                       if not any(path.startswith(parent + "/") for parent in dialog_paths)]
            if outside:
                if strict:
                    raise SmokeFailure(f"Keyboard focus escaped the reading-preferences dialog: {outside!r}")
                return None
            return [(self.safe(node.get_role_name), self.name(node)) for node, _ in leaves]

        initial = self.wait("initial keyboard focus inside preferences dialog", lambda: dialog_focus(strict=False))
        self.dump("keyboard-dialog")
        focusable_count = sum(1 for node, _, _ in self.walk(dialog)
                              if self.state(node, "ENABLED")
                              and self.state(node, "FOCUSABLE")
                              and self.safe(node.get_role_name) != "dialog")
        visited = [initial]
        wrapped = False
        for _ in range(min(30, max(4, focusable_count + 2))):
            previous = visited[-1]
            self.command(["xdotool", "key", "--clearmodifiers", "Tab"])
            current = self.wait("Tab moves focus inside preferences dialog",
                                lambda: (current if (current := dialog_focus()) != previous else None))
            visited.append(current)
            if len(visited) > 2 and current == initial:
                wrapped = True
                break
        if not wrapped:
            raise SmokeFailure("Forward Tab did not wrap inside the reading-preferences dialog.")
        self.command(["xdotool", "key", "--clearmodifiers", "shift+Tab"])
        reverse = self.wait("reverse Tab moves focus inside preferences dialog",
                            lambda: (current if (current := dialog_focus()) != visited[-1] else None))
        self.command(["xdotool", "key", "--clearmodifiers", "Escape"])
        self.wait("preferences dialog closed by Escape", lambda: self.find(title, roles={"dialog"}) is None)
        self.wait("focus restored to Reading preferences", lambda: self.state(self.find("Reading preferences", roles={"push button"}), "FOCUSED"))
        range_units = self.keyboard_select_verse_range()
        self.report["keyboard"] = {
            "reference_tab_to_go": True, "reverse_tab_to_reference": True,
            "dialog_focus_cycle": visited, "dialog_reverse_focus": reverse,
            "dialog_escape_and_focus_return": True,
            "verse_range": range_units,
        }

    def keyboard_select_verse_range(self) -> dict[str, Any]:
        first = "Sample Book A 1:1"
        last = "Sample Book A 1:4b"
        expected = [
            "Sample Book A 1:1",
            "Sample Book A 1:2-3",
            "Sample Book A 1:4a",
            "Sample Book A 1:4b",
        ]
        self.focus(f"Select verse {first}")
        self.command(["xdotool", "key", "--clearmodifiers", "Return"])
        self.wait(f"keyboard selection of {first}", lambda: self.selected(first))

        self.focus("Extend range")
        self.command(["xdotool", "key", "--clearmodifiers", "space"])
        self.wait("keyboard activation of Extend range", lambda: self.find("Choose range end", prefix=True, roles={"toggle button"}))

        self.focus(f"Select verse {last}")
        self.command(["xdotool", "key", "--clearmodifiers", "Return"])
        for reference in expected:
            self.wait(f"keyboard range includes {reference}", lambda reference=reference: self.selected(reference))

        clear = "Clear verse selection"
        self.focus(clear)
        self.command(["xdotool", "key", "--clearmodifiers", "space"])
        self.wait("keyboard clear of verse range", lambda: all(self.selected(reference) is None for reference in expected))
        return {"selected_unit_references": expected, "keyboard_cleared": True}

    def copy(self):
        self.reference("TSA 1:2", BRIDGE)
        fixture = json.loads(self.args.fixture_json.read_text())
        if fixture["edition"].get("isSynthetic") is not True:
            raise SmokeFailure("Clipboard expectation must come from a marked synthetic fixture.")
        chapter = next(chapter for chapter in fixture["chapters"] if chapter["bookCode"] == "TSA" and chapter["chapterLabel"] == "1")
        unit = next(unit for unit in chapter["verseUnits"] if unit["label"] == "2-3")
        expected = f"{unit['label']} {unit['textPlain']}\n\n{BRIDGE} · {fixture['edition']['abbreviation']}\n{fixture['edition']['attribution']}"
        self.copy_and_match(expected)
        self.report["clipboard"] = {"exact_fixture_match": True, "characters": len(expected)}

    def copy_and_match(self, expected: str):
        if shutil.which("xclip") is None:
            raise SmokeFailure("Missing test-only executable: xclip")
        # A previous run's clipboard must not satisfy a failed/no-op native copy.
        sentinel = f"native-smoke-pending-{time.monotonic_ns()}"
        owner = subprocess.Popen(
            ["xclip", "-selection", "clipboard", "-target", "UTF8_STRING", "-quiet"], stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, text=True, encoding="utf-8",
        )
        try:
            if owner.stdin is None:
                raise SmokeFailure("Could not initialize the clipboard sentinel.")
            owner.stdin.write(sentinel)
            owner.stdin.close()
            self.wait("fresh clipboard sentinel", lambda: self.clipboard_text() == sentinel)
            self.activate("Copy", roles={"push button", "button"})
            self.wait("exact native clipboard text", lambda: self.clipboard_text() == expected)
        finally:
            if owner.poll() is None:
                owner.terminate()
                try:
                    owner.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    owner.kill()
                    owner.wait(timeout=2)

    def search(self):
        navigation = self.named("Workspace")
        self.activate("Search Scripture", root=navigation)
        self.fill("Words or quoted phrase", '"careful reading"')
        self.command(["xdotool", "key", "--clearmodifiers", "Return"])
        self.activate("Sample Book A 1:1", prefix=True, roles={"push button", "button"})
        self.wait("selected exact search result", lambda: self.selected("Sample Book A 1:1"))

    def prepare_note(self):
        self.reference("TSA 1:2", BRIDGE)
        self.activate("Add note", roles={"push button", "button"})
        self.fill("Note title", NOTE_TITLE)
        self.fill("Note text", NOTE_BODY)
        # The note editor scrolls inside the right rail; keyboard focus brings
        # its Save control into view even when the body extends below the window.
        self.command(["xdotool", "key", "--clearmodifiers", "Tab", "Tab"])
        self.activate("Save", roles={"push button", "button"})
        self.wait("committed note acknowledgment", lambda: self.has_text("Saved on this device"))
        self.reference("TSA 2:1", "Sample Book A 2:1")
        self.named("Chapter 2", roles={"heading"})
        self.report["restart_required"] = "Close/relaunch the native process with the same isolated profile; run --flow verify-note."

    def highlight(self):
        self.reference("TSA 1:2", BRIDGE)
        self.activate("Highlight yellow", roles={"toggle button", "push button", "button"})
        self.named(f"Select verse {BRIDGE}. Highlighted yellow", roles={"toggle button"})
        self.report["highlight"] = {"reference": BRIDGE, "accessible_color": "yellow"}
        self.reference("TSA 2:1", "Sample Book A 2:1")

    def verify_highlight(self):
        self.reference("TSA 1:2", BRIDGE)
        self.named(f"Select verse {BRIDGE}. Highlighted yellow", roles={"toggle button"})
        self.report["highlight_after_restart"] = {"reference": BRIDGE, "accessible_color": "yellow"}

    def backup(self):
        backup_path = self.args.output_dir / "native-export.json"
        user_db = Path(os.environ["XDG_DATA_HOME"]) / "org.afaanoromobible.reader/development/user.sqlite"
        def font_size() -> int | None:
            if not user_db.exists():
                return None
            with sqlite3.connect(user_db.as_uri() + "?mode=ro", uri=True) as connection:
                row = connection.execute("SELECT json FROM preference LIMIT 1").fetchone()
            return json.loads(row[0])["fontSizePx"] if row else None
        def personal_records() -> dict[str, list[dict[str, Any]]]:
            with sqlite3.connect(user_db.as_uri() + "?mode=ro", uri=True) as connection:
                return {table: [json.loads(row[0]) for row in connection.execute(f"SELECT json FROM {table} ORDER BY rowid")]
                        for table in ["note", "bookmark", "highlight", "preference", "reading_position"]}
        self.activate("About and content information", roles={"push button", "button"})
        self.named("About Afaan Oromo Bible", roles={"dialog"})
        self.wait("synthetic edition identity in About", lambda: self.has_text("Synthetic Development Fixture"))
        # The 1440×1000 Xvfb viewport needs the dialog itself scrolled to
        # expose its final notice control to AT-SPI.
        self.command(["xdotool", "mousemove", "900", "700"])
        self.command(["xdotool", "click", "--repeat", "18", "--delay", "30", "5"])
        self.activate("Read shadcn/ui MIT notice", roles={"push button", "button"})
        self.wait("bundled notice in native About", lambda: self.has_text("MIT License"))
        self.command(["xdotool", "key", "--clearmodifiers", "Escape"])
        self.wait("About dialog closed", lambda: self.find("About Afaan Oromo Bible", roles={"dialog"}) is None)
        self.report["offline_about"] = {"synthetic_identity_seen": True, "bundled_ui_notice_seen": True}
        self.activate("Reading preferences", roles={"push button", "button"})
        self.named("Make room for reading", roles={"dialog"})
        self.activate("Increase text size", roles={"push button", "button"})
        self.wait("22 px native preference commit", lambda: font_size() == 22)
        self.reveal_settings_control("Export backup")
        self.activate("Export backup", roles={"push button", "button"})
        self.wait("native save dialog", lambda: "Save" in self.active_window_name())
        self.command(["xdotool", "key", "--clearmodifiers", "ctrl+l"])
        # GTK's JSON filter appends .json to a basename entered through Ctrl+L.
        self.enter_native_path(backup_path.with_suffix(""))
        self.command(["xdotool", "key", "--clearmodifiers", "Return"])
        self.wait("native exported backup file", backup_path.exists)
        exported = json.loads(backup_path.read_text())
        if exported.get("format") != "afaan-oromo-bible-user-backup":
            raise SmokeFailure("Native export has the wrong backup format.")
        if len(exported["data"]["preferences"]) != 1 or exported["data"]["preferences"][0]["fontSizePx"] != 22:
            raise SmokeFailure("Native export omitted the committed 22 px preference.")
        self.report["backup_export"] = {"path": str(backup_path), "bytes": backup_path.stat().st_size}
        self.activate("Increase text size", roles={"push button", "button"})
        self.wait("24 px native preference commit", lambda: font_size() == 24)
        self.reveal_settings_control("Review backup to restore")
        self.activate("Review backup to restore", roles={"push button", "button"})
        self.wait("native open dialog", lambda: "Open" in self.active_window_name())
        self.command(["xdotool", "key", "--clearmodifiers", "ctrl+l"])
        self.enter_native_path(backup_path)
        self.command(["xdotool", "key", "--clearmodifiers", "Return"])
        if "Open" in self.active_window_name():
            self.activate("Open", roles={"push button"}, root=self.atspi.get_desktop(0))
        try:
            self.named("Replace personal data?", roles={"dialog"})
        except SmokeFailure:
            self.report["import_dialog_diagnostic"] = {
                "active_window": self.active_window_name(),
                "visible_windows": self.command(["xdotool", "search", "--onlyvisible", "--name", "."]),
            }
            raise
        recovery_dir = Path(os.environ["XDG_DATA_HOME"]) / "org.afaanoromobible.reader/development/recovery"
        before_failed_restore = personal_records()
        recovery_blocker = recovery_dir
        recovery_blocker.write_bytes(b"synthetic obstruction for restore recovery snapshot")
        self.activate("Replace all personal data", roles={"push button", "button"})
        self.wait(
            "visible pre-restore snapshot failure",
            lambda: self.has_text("The recovery directory could not be created.") and font_size() == 24,
        )
        with sqlite3.connect(user_db.as_uri() + "?mode=ro", uri=True) as connection:
            failed_restore_integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        after_failed_restore = personal_records()
        if failed_restore_integrity != "ok" or not recovery_blocker.is_file() or after_failed_restore != before_failed_restore:
            raise SmokeFailure("Failed recovery snapshot changed the profile or obstruction.")
        recovery_blocker.unlink()
        self.activate("Replace all personal data", roles={"push button", "button"})
        self.named("Personal data restored", roles={"dialog"})
        recovery_files = list(recovery_dir.glob("pre-restore-*.json"))
        if len(recovery_files) != 1:
            raise SmokeFailure(f"Expected one native pre-restore recovery file, found {len(recovery_files)}.")
        recovered = json.loads(recovery_files[0].read_text())
        if recovered.get("format") != exported["format"] or recovered["data"]["preferences"][0]["fontSizePx"] != 24:
            raise SmokeFailure("Native pre-restore recovery file did not preserve the replaced 24 px preference.")
        self.wait("22 px preference restored in SQLite", lambda: font_size() == 22)
        restored_records = personal_records()
        data = exported["data"]
        anchors = {anchor["id"]: anchor for anchor in data["anchors"]}
        expected_records: dict[str, list[dict[str, Any]]] = {}
        for table, backup_table in [("note", "notes"), ("bookmark", "bookmarks"), ("highlight", "highlights")]:
            expected_records[table] = []
            for record in data[backup_table]:
                linked = dict(record)
                anchor_id = linked.pop("anchorId")
                linked["anchor"] = anchors.get(anchor_id) if anchor_id else None
                expected_records[table].append(linked)
        expected_records["preference"] = data["preferences"]
        expected_records["reading_position"] = data["readingPositions"]
        if restored_records != expected_records:
            raise SmokeFailure("Native full-record backup restore changed personal records or passage anchors.")
        self.report["backup_restore"] = {"recovery_path": str(recovery_files[0]), "confirmation_seen": True,
                                         "exported_font_px": 22, "recovered_prior_font_px": 24,
                                         "restored_font_px": font_size(),
                                         "failed_snapshot_kept_original": True,
                                         "failed_snapshot_integrity": failed_restore_integrity,
                                         "failed_snapshot_record_counts": {key: len(value) for key, value in before_failed_restore.items()},
                                         "restored_record_counts": {key: len(value) for key, value in restored_records.items()},
                                         "restored_all_records_exactly": True}

    def backup_full(self):
        self.reference("TSA 1:2", BRIDGE)
        self.activate("Bookmark", roles={"push button", "button"})
        self.activate("Highlight yellow", roles={"toggle button", "push button", "button"})
        self.activate("Add note", roles={"push button", "button"})
        self.fill("Note title", NOTE_TITLE)
        self.fill("Note text", NOTE_BODY)
        self.command(["xdotool", "key", "--clearmodifiers", "Tab", "Tab"])
        self.activate("Save", roles={"push button", "button"})
        self.wait("committed linked note", lambda: self.has_text("Saved on this device"))
        self.command(["xdotool", "mousemove", "1200", "350"])
        self.command(["xdotool", "click", "--repeat", "12", "--delay", "30", "4"])
        self.activate("New note", roles={"push button", "button"})
        self.fill("Note title", STANDALONE_NOTE_TITLE)
        self.fill("Note text", STANDALONE_NOTE_BODY)
        self.command(["xdotool", "key", "--clearmodifiers", "Tab", "Tab"])
        self.activate("Save", roles={"push button", "button"})
        self.reference("TSA 2:1", "Sample Book A 2:1")
        self.named("Chapter 2", roles={"heading"})
        self.backup()
        exported = json.loads((self.args.output_dir / "native-export.json").read_text())
        data = exported["data"]
        counts = {name: len(data[name]) for name in ["notes", "bookmarks", "highlights", "preferences", "readingPositions"]}
        expected_counts = {"notes": 2, "bookmarks": 1, "highlights": 1, "preferences": 1, "readingPositions": 1}
        if counts != expected_counts or {note["title"] for note in data["notes"]} != {NOTE_TITLE, STANDALONE_NOTE_TITLE} or data["readingPositions"][0]["chapterLabel"] != "2":
            raise SmokeFailure(f"Native full-record export has missing personal records: {counts!r}.")
        if {note["title"]: note["anchorId"] is None for note in data["notes"]} != {NOTE_TITLE: False, STANDALONE_NOTE_TITLE: True}:
            raise SmokeFailure("Native full-record export changed a note passage link.")
        if len(data["anchors"]) != 3 or len({anchor["unitKeys"][0] for anchor in data["anchors"]}) != 1:
            raise SmokeFailure("Native full-record export lost a source passage anchor.")
        self.report["full_record_export"] = {"counts": counts, "anchors": len(data["anchors"]),
                                              "reading_chapter": "2"}

    def restore_candidate_v1(self):
        self.restore_full_clean(expect_unavailable_edition=True)

    def restore_full_clean(self, *, expect_unavailable_edition=False):
        if self.args.backup_file is None or not self.args.backup_file.is_file():
            raise SmokeFailure("A native export is required for the clean-profile restore.")
        backup_file = self.args.backup_file.resolve()
        exported = json.loads(backup_file.read_text())
        expected = exported["data"]
        database = Path(os.environ["XDG_DATA_HOME"]) / "org.afaanoromobible.reader/development/user.sqlite"
        self.named("Reading preferences", roles={"push button", "button"})
        self.wait("fresh personal database", database.is_file)
        with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as connection:
            if any(connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
                   for table in ["note", "bookmark", "highlight", "preference", "reading_position"]):
                raise SmokeFailure("The clean-profile restore target already has personal records.")
        self.activate("Reading preferences", roles={"push button", "button"})
        self.named("Make room for reading", roles={"dialog"})
        self.reveal_settings_control("Review backup to restore")
        self.activate("Review backup to restore", roles={"push button", "button"})
        self.wait("native open dialog", lambda: "Open" in self.active_window_name())
        self.command(["xdotool", "key", "--clearmodifiers", "ctrl+l"])
        self.enter_native_path(backup_file)
        self.command(["xdotool", "key", "--clearmodifiers", "Return"])
        if "Open" in self.active_window_name():
            self.activate("Open", roles={"push button"}, root=self.atspi.get_desktop(0))
        self.named("Replace personal data?", roles={"dialog"})
        if expect_unavailable_edition:
            warning = self.wait(
                "unavailable-edition preview warning",
                lambda: self.has_text(
                    "Edition revisions unavailable here: synthetic-fixture-edition"
                ),
            )
            if warning is None:
                raise SmokeFailure("The restore preview omitted the unavailable-edition warning.")
            self.report["unavailable_edition_preview"] = {
                "edition_id": "synthetic-fixture-edition",
                "passage_links_preserved_without_relinking": True,
            }
        self.activate("Replace all personal data", roles={"push button", "button"})
        self.named("Personal data restored", roles={"dialog"})
        with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as connection:
            integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
            actual = {table: [json.loads(row[0]) for row in connection.execute(f"SELECT json FROM {table}")]
                      for table in ["note", "bookmark", "highlight", "preference", "reading_position"]}
        anchors = {anchor["id"]: anchor for anchor in expected["anchors"]}
        for table, backup_table in [("note", "notes"), ("bookmark", "bookmarks"), ("highlight", "highlights")]:
            records = []
            for record in expected[backup_table]:
                linked = dict(record)
                anchor_id = linked.pop("anchorId")
                linked["anchor"] = anchors.get(anchor_id) if anchor_id else None
                records.append(linked)
            if {record["id"]: record for record in actual[table]} != {record["id"]: record for record in records}:
                raise SmokeFailure(f"Clean-profile restore changed {backup_table} or passage anchors.")
        if actual["preference"] != expected["preferences"] or actual["reading_position"] != expected["readingPositions"] or integrity != "ok":
            raise SmokeFailure("Clean-profile restore changed preferences or reading position, or failed integrity check.")
        self.report["clean_profile_restore"] = {"integrity": integrity, "record_counts":
                                                {table: len(records) for table, records in actual.items()},
                                                "anchor_count": len(anchors)}
        if expect_unavailable_edition:
            self.activate("Reload reader", roles={"push button", "button"})
            self.wait("reader content after restore reload", lambda: self.has_text("Synthetic test content"))
            self.activate("My notes", prefix=True, roles={"push button", "button"}, root=self.named("Workspace"))
            self.scroll_until_text("Synthetic linked note — ʼ", x=1200, y=820)
            self.scroll_until_text("Passage unavailable · note preserved", x=1200, y=820)
            self.activate("Bookmarks", prefix=True, roles={"push button", "button"}, root=self.named("Workspace"))
            self.wait("restored unavailable-edition bookmark visible", lambda: self.has_text("SAVED BOOKMARKS · 1"))
            self.scroll_until_text("Edition unavailable · bookmark preserved", x=1200, y=820)
            self.report["unavailable_edition_after_reload"] = {
                "linked_note_visible": True,
                "note_warning_visible": True,
                "bookmark_visible": True,
                "bookmark_warning_visible": True,
            }

    def verify_restored_backup(self):
        if self.args.backup_file is None or not self.args.backup_file.is_file():
            raise SmokeFailure("The portable backup fixture is required to verify a reinstalled profile.")
        expected = json.loads(self.args.backup_file.read_text())["data"]
        database = Path(os.environ["XDG_DATA_HOME"]) / "org.afaanoromobible.reader/development/user.sqlite"
        with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as connection:
            integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
            actual = {table: [json.loads(row[0]) for row in connection.execute(f"SELECT json FROM {table}")]
                      for table in ["note", "bookmark", "highlight", "preference", "reading_position"]}
        anchors = {anchor["id"]: anchor for anchor in expected["anchors"]}
        for table, backup_table in [("note", "notes"), ("bookmark", "bookmarks"), ("highlight", "highlights")]:
            records = []
            for record in expected[backup_table]:
                restored = dict(record)
                anchor_id = restored.pop("anchorId")
                restored["anchor"] = anchors.get(anchor_id) if anchor_id else None
                records.append(restored)
            if {record["id"]: record for record in actual[table]} != {record["id"]: record for record in records}:
                raise SmokeFailure(f"Uninstall/reinstall changed {backup_table} or their passage anchors.")
        if (actual["preference"] != expected["preferences"] or
                actual["reading_position"] != expected["readingPositions"] or integrity != "ok"):
            raise SmokeFailure("Uninstall/reinstall changed preferences/position or failed database integrity.")
        self.activate("My notes", prefix=True, roles={"push button", "button"}, root=self.named("Workspace"))
        self.scroll_until_text("Synthetic linked note — ʼ", x=1200, y=820)
        self.scroll_until_text("Passage unavailable · note preserved", x=1200, y=820)
        self.activate("Bookmarks", prefix=True, roles={"push button", "button"}, root=self.named("Workspace"))
        self.wait("reinstalled bookmark list", lambda: self.has_text("SAVED BOOKMARKS · 1"))
        self.scroll_until_text("Edition unavailable · bookmark preserved", x=1200, y=820)
        self.report["reinstalled_backup_profile"] = {
            "integrity": integrity,
            "record_counts": {table: len(records) for table, records in actual.items()},
            "anchor_count": len(anchors),
            "linked_note_and_unavailable_warning_visible": True,
            "bookmark_and_unavailable_warning_visible": True,
        }

    def profile_in_use(self):
        self.named("Personal data unavailable", roles={"heading"})
        self.wait("native profile-lock guidance", lambda: self.has_text("Close the other application window"))
        if self.find("Archive unreadable data and start fresh") is not None:
            raise SmokeFailure("A locked profile incorrectly offered corrupt-database recovery.")
        self.named("Try opening again", roles={"push button", "button"})
        self.report["profile_lock"] = {"second_window_refused": True, "recovery_not_offered": True}

    def profile_after_release(self):
        self.activate("Try opening again", roles={"push button", "button"})
        self.read()
        database = Path(os.environ["XDG_DATA_HOME"]) / "org.afaanoromobible.reader/development/user.sqlite"
        with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as connection:
            integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise SmokeFailure("Personal database failed integrity after the profile lock was released.")
        self.report["profile_lock"] = {"retry_opened_content": True, "database_integrity": integrity}

    def recovery_corrupt(self):
        data_dir = Path(os.environ["XDG_DATA_HOME"]) / "org.afaanoromobible.reader/development"
        database = data_dir / "user.sqlite"
        wal = data_dir / "user.sqlite-wal"
        original = database.read_bytes()
        original_wal = wal.read_bytes()
        self.named("Personal data unavailable", roles={"heading"})
        self.wait("corrupt storage guidance", lambda: self.has_text("preserve the app data folder"))
        self.activate("Archive unreadable data and start fresh", roles={"push button", "button"})
        self.named("Archive unreadable personal data?", roles={"dialog"})
        if not database.exists():
            raise SmokeFailure("The corrupt database changed before explicit confirmation.")
        self.activate("Archive and create empty database", roles={"push button", "button"})
        self.named("Personal database ready", roles={"dialog"})
        archives = list((data_dir / "recovery").glob("corrupt-user-*"))
        if len(archives) != 1:
            raise SmokeFailure(f"Expected one corrupt database archive, found {len(archives)}.")
        archive = archives[0]
        if (archive / "user.sqlite").read_bytes() != original or (archive / "user.sqlite-wal").read_bytes() != original_wal:
            raise SmokeFailure("The native recovery archive changed the original database or WAL bytes.")
        with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as connection:
            if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise SmokeFailure("The new native personal database failed its integrity check.")
        self.activate("Open backup controls", roles={"push button", "button"})
        self.named("Make room for reading", roles={"dialog"})
        self.reveal_settings_control("Review backup to restore")
        self.report["corrupt_recovery"] = {"archive": str(archive), "original_bytes": len(original),
                                           "wal_bytes": len(original_wal), "confirmation_seen": True,
                                           "fresh_database_integrity": "ok", "backup_controls_seen": True}
        if self.args.backup_file is not None:
            backup_file = self.args.backup_file.resolve()
            if not backup_file.is_file():
                raise SmokeFailure("The synthetic exported backup is unavailable.")
            exported = json.loads(backup_file.read_text())
            if exported.get("format") != "afaan-oromo-bible-user-backup" or exported["data"]["preferences"][0]["fontSizePx"] != 22:
                raise SmokeFailure("The synthetic exported backup has no expected 22 px preference.")
            expected = exported["data"]
            for table in ["notes", "bookmarks", "highlights", "readingPositions"]:
                if len(expected[table]) != (2 if table == "notes" else 1):
                    raise SmokeFailure(f"The synthetic exported backup omitted {table}.")
            self.activate("Review backup to restore", roles={"push button", "button"})
            self.wait("native open dialog", lambda: "Open" in self.active_window_name())
            self.command(["xdotool", "key", "--clearmodifiers", "ctrl+l"])
            self.enter_native_path(backup_file)
            self.command(["xdotool", "key", "--clearmodifiers", "Return"])
            if "Open" in self.active_window_name():
                self.activate("Open", roles={"push button"}, root=self.atspi.get_desktop(0))
            self.named("Replace personal data?", roles={"dialog"})
            self.activate("Replace all personal data", roles={"push button", "button"})
            self.named("Personal data restored", roles={"dialog"})
            with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as connection:
                row = connection.execute("SELECT json FROM preference LIMIT 1").fetchone()
                integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
                restored = {table: [json.loads(record[0]) for record in connection.execute(f"SELECT json FROM {table}")]
                            for table in ["note", "bookmark", "highlight", "reading_position"]}
            if row is None or json.loads(row[0]) != expected["preferences"][0] or integrity != "ok":
                raise SmokeFailure("Native restore did not recover the exported 22 px preference.")
            anchors = {anchor["id"]: anchor for anchor in expected["anchors"]}
            for table, backup_table in [("note", "notes"), ("bookmark", "bookmarks"),
                                        ("highlight", "highlights")]:
                if len(restored[table]) != len(expected[backup_table]):
                    raise SmokeFailure(f"Native restore did not recover {backup_table}.")
                expected_records = []
                for record in expected[backup_table]:
                    linked = dict(record)
                    anchor_id = linked.pop("anchorId")
                    linked["anchor"] = anchors.get(anchor_id) if anchor_id else None
                    expected_records.append(linked)
                if {record["id"]: record for record in restored[table]} != {record["id"]: record for record in expected_records}:
                    raise SmokeFailure(f"Native restore changed {backup_table} or its passage anchor.")
            if restored["reading_position"] != expected["readingPositions"]:
                raise SmokeFailure("Native restore did not recover the chapter-2 reading position.")
            self.report["corrupt_recovery"]["backup_restored_font_px"] = 22
            self.report["corrupt_recovery"]["restored_integrity"] = integrity
            self.report["corrupt_recovery"]["restored_record_counts"] = {name: len(records) for name, records in restored.items()}

    def verify_recovered_preference(self):
        self.named("Chapter 2", roles={"heading"})
        self.activate("Reading preferences", roles={"push button", "button"})
        self.named("Make room for reading", roles={"dialog"})
        self.wait("restored 22 px setting in native UI", lambda: self.has_text("22 px"))
        database = Path(os.environ["XDG_DATA_HOME"]) / "org.afaanoromobible.reader/development/user.sqlite"
        with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as connection:
            row = connection.execute("SELECT json FROM preference LIMIT 1").fetchone()
            integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if row is None or json.loads(row[0])["fontSizePx"] != 22 or integrity != "ok":
            raise SmokeFailure("Recovered preference did not survive native process restart.")
        self.command(["xdotool", "key", "--clearmodifiers", "Escape"])
        self.activate("My notes", prefix=True, roles={"push button", "button"})
        self.wait("restored linked note in native UI", lambda: self.has_text(NOTE_TITLE))
        self.wait("restored standalone note in native UI", lambda: self.has_text(STANDALONE_NOTE_TITLE))
        self.activate("Bookmarks", prefix=True, roles={"push button", "button"})
        self.wait("restored bookmark in native UI", lambda: self.has_text("SAVED BOOKMARKS · 1"))
        self.report["recovered_preference_restart"] = {"font_px": 22, "integrity": integrity,
                                                        "chapter": "2", "linked_note_seen": True,
                                                        "standalone_note_seen": True,
                                                        "bookmark_seen": True}

    def verify_note(self):
        self.named("Chapter 2", roles={"heading"})
        self.verify_saved_note()

    def verify_saved_note(self):
        navigation = self.named("Workspace")
        self.activate("My notes", prefix=True, root=navigation)
        saved = self.named("Saved notes")
        self.activate(NOTE_TITLE, prefix=True, root=saved, roles={"push button", "button"})
        if self.text(self.named("Note title")) != NOTE_TITLE or self.text(self.named("Note text")) != NOTE_BODY:
            raise SmokeFailure("Restarted native note editor does not match the committed fixture note.")
        self.activate(f"Open {BRIDGE}")
        self.wait("reopened note passage", lambda: self.selected(BRIDGE))
        self.report["restart_observation"] = "Saved note and anchor observed; caller must establish that a real process restart occurred."

    def user_database(self) -> Path:
        if self.args.user_db is None or not os.environ.get("XDG_DATA_HOME"):
            raise SmokeFailure("Close tests need an explicit database and isolated XDG_DATA_HOME.")
        path = self.args.user_db.resolve()
        data_root = Path(os.environ["XDG_DATA_HOME"]).resolve()
        if not path.is_relative_to(data_root) or path.name != "user.sqlite" or path.parent.name != "development":
            raise SmokeFailure("Refusing to lock a database outside the isolated development profile.")
        if not path.is_file():
            raise SmokeFailure("The native application has not created its development user database.")
        return path

    def close_note_record(self):
        with closing(sqlite3.connect(self.user_database().as_uri() + "?mode=ro", uri=True, timeout=2)) as connection:
            records = [json.loads(row[0]) for row in connection.execute("SELECT json FROM note")]
            if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise SmokeFailure("Native user database integrity check failed.")
        matches = [record for record in records if record["title"] == CLOSE_NOTE_TITLE]
        if len(matches) != 1:
            raise SmokeFailure(f"Expected one dedicated close-test note, found {len(matches)}.")
        return matches[0]

    @contextmanager
    def locked_user_database(self):
        # Reserve the SQLite writer without changing data. Real native writes
        # reach their configured busy timeout; no application backdoor is used.
        connection = sqlite3.connect(self.user_database().as_uri() + "?mode=rw", uri=True,
                                     timeout=2, isolation_level=None)
        try:
            connection.execute("BEGIN IMMEDIATE")
            yield
        finally:
            if connection.in_transaction:
                connection.rollback()
            connection.close()

    def native_process_alive(self) -> bool:
        pid = self.args.pid or self.report["native_root"]["pid"]
        if not pid:
            raise SmokeFailure("Close tests require an identifiable native process PID.")
        try:
            state = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[0]
            return state not in {"Z", "X"}
        except FileNotFoundError:
            return False

    def assert_native_alive(self):
        if not self.native_process_alive():
            raise SmokeFailure("Native process exited while it was required to retain the draft.")

    def request_native_close(self):
        self.activate_window()
        # Openbox translates Alt+F4 to WM_DELETE_WINDOW. xdotool windowclose
        # can destroy the X window and bypass the Tauri close-request guard.
        self.command(["xdotool", "key", "--clearmodifiers", "alt+F4"])
        self.report.setdefault("native_close_requests", 0)
        self.report["native_close_requests"] += 1

    def close_dialog(self):
        dialog = self.named(CLOSE_DIALOG, roles={"dialog"})
        self.assert_native_alive()
        return dialog

    def open_close_note(self, expected: str):
        navigation = self.named("Workspace")
        self.activate("My notes", prefix=True, root=navigation)
        saved = self.named("Saved notes")
        self.activate(CLOSE_NOTE_TITLE, prefix=True, root=saved, roles={"push button"})
        self.wait("expected close-test note body", lambda: self.text(self.find("Note text")) == expected)
        if self.close_note_record()["bodyText"] != expected:
            raise SmokeFailure("Native editor and committed close-test record disagree.")

    def close_cancel_discard(self):
        navigation = self.named("Workspace")
        self.activate("My notes", prefix=True, root=navigation)
        self.activate("New note", roles={"push button"})
        self.fill("Note title", CLOSE_NOTE_TITLE)
        self.fill("Note text", CLOSE_BASELINE)
        self.activate("Save", roles={"push button"})
        self.wait("baseline note committed", lambda: self.has_text("Saved on this device"))
        self.wait("baseline SQLite record", lambda: self.close_note_record()["bodyText"] == CLOSE_BASELINE)
        with self.locked_user_database():
            self.fill("Note text", CLOSE_DISCARDED)
            self.wait("real store-busy autosave failure", lambda: self.has_text("Could not save"))
            self.request_native_close()
            dialog = self.close_dialog()
            self.wait("default Cancel focus in close dialog", lambda: self.state(self.find("Cancel", root=dialog, roles={"push button"}), "FOCUSED"))
            self.command(["xdotool", "key", "--clearmodifiers", "Escape"])
            self.wait("close dialog cancelled", lambda: self.find(CLOSE_DIALOG, roles={"dialog"}) is None)
            self.wait("Escape restores Note text focus", lambda: self.state(self.find("Note text"), "FOCUSED"))
            self.assert_native_alive()
            if self.text(self.named("Note text")) != CLOSE_DISCARDED:
                raise SmokeFailure("Cancel lost the unsaved native draft.")
            self.dump("close-cancel-retained-draft")
            self.request_native_close()
            self.activate("Discard changes", root=self.close_dialog(), roles={"push button"})
            self.wait("native exit after Discard", lambda: not self.native_process_alive())
            if self.close_note_record()["bodyText"] != CLOSE_BASELINE:
                raise SmokeFailure("Discard changed the committed baseline record.")
        self.report["close_guard"] = {
            "request": "Openbox Alt+F4 / WM_DELETE_WINDOW", "cancel_retained_draft": True,
            "initial_cancel_focused": True, "escape_cancel_restored_note_text_focus": True,
            "discard_exited": True, "discard_retained_committed_baseline": True,
            "failure_source": "External SQLite BEGIN IMMEDIATE reservation; real busy-timeout failure, not disk-full.",
        }

    def close_save(self):
        self.open_close_note(CLOSE_BASELINE)
        with self.locked_user_database():
            self.fill("Note text", CLOSE_SAVED)
            self.wait("real store-busy autosave failure", lambda: self.has_text("Could not save"))
            self.request_native_close()
            self.activate("Save and close", root=self.close_dialog(), roles={"push button"})
            self.wait("failed close-save error", lambda: self.has_text("Your note could not be saved. The window is still open."))
            self.assert_native_alive()
            self.close_dialog()
            if self.close_note_record()["bodyText"] != CLOSE_BASELINE:
                raise SmokeFailure("Blocked close-save unexpectedly changed committed data.")
            self.dump("close-save-failed-window-open")
            self.activate("Cancel", root=self.close_dialog(), roles={"push button"})
            self.wait("failed close-save cancelled", lambda: self.find(CLOSE_DIALOG, roles={"dialog"}) is None)
            if self.text(self.named("Note text")) != CLOSE_SAVED:
                raise SmokeFailure("Failed Save and close lost the editable draft.")
            self.request_native_close()
            self.close_dialog()
        # Release the external lock before the user explicitly retries Save.
        self.activate("Save and close", root=self.close_dialog(), roles={"push button"})
        self.wait("native exit after successful Save and close", lambda: not self.native_process_alive())
        if self.close_note_record()["bodyText"] != CLOSE_SAVED:
            raise SmokeFailure("Native process exited without committing the requested close-save text.")
        self.report["close_guard"] = {
            "request": "Openbox Alt+F4 / WM_DELETE_WINDOW", "blocked_save_retained_window_and_draft": True,
            "retry_committed_before_exit": True, "failure_source": "Real SQLite busy timeout; not disk-full.",
        }

    def verify_close_save(self):
        self.open_close_note(CLOSE_SAVED)
        self.request_native_close()
        self.wait("clean native close without dirty-note prompt", lambda: not self.native_process_alive())
        self.report["close_guard"] = {
            "restarted_editor_recovered_saved_text": True, "clean_alt_f4_exited": True,
            "request": "Openbox Alt+F4 / WM_DELETE_WINDOW",
        }


def main() -> int:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    report: dict[str, Any] = {
        "started_at": datetime.now(timezone.utc).isoformat(), "status": "failed",
        "flow": args.flow, "stages": [], "display_session": {
            "gdk_backend_requested": os.environ.get("GDK_BACKEND"),
            "wayland_display": os.environ.get("WAYLAND_DISPLAY"),
            "x11_display": os.environ.get("DISPLAY"),
            "session_type": os.environ.get("XDG_SESSION_TYPE"),
        }, "caveats": (
            ["Internal synthetic .deb installed in a disposable Ubuntu runtime; no approved content or release qualification.",
             "A virtual/test desktop session does not qualify Ubuntu GNOME X11/Wayland or manual Orca accessibility.",
             "This does not qualify clean-host prerequisites, signing, Windows or macOS."]
            if args.installed_package
            else
            ["TEST_ONLY invented one-book pack; no publisher content or review approval.",
             CAVEATS[1], "Internal offline-installed .deb under Xvfb/Openbox; no GNOME, Windows or macOS qualification."]
            if args.flow in {"reviewed-builder-package", "verify-reviewed-builder-package", "reviewed-builder-backup", "reviewed-builder-clean-restore"}
            else ["Local technical source candidate only; rights, search profile and visual review are not approved.",
                  *CAVEATS[1:]]
            if args.flow in {"technical-review", "technical-search-benchmark", "verify-technical-changed-link", "verify-technical-bookmark", "verify-technical-changed-bookmark"}
            else CAVEATS
        ),
    }
    harness = None
    try:
        harness = NativeSmoke(args, report)
        harness.select_root()
        report["native_root"] = {"name": harness.name(harness.root), "pid": harness.safe(harness.root.get_process_id, 0)}
        if args.dump or args.flow is None:
            harness.dump("initial-tree")
        if args.flow:
            if args.flow not in {"technical-review", "technical-search-benchmark", "technical-visual-samples", "verify-technical-review", "verify-technical-changed-link", "verify-technical-bookmark", "verify-technical-changed-bookmark", "reviewed-builder-package", "verify-reviewed-builder-package", "reviewed-builder-backup", "reviewed-builder-clean-restore", "no-content", "verify-no-content", "recovery-corrupt", "restore-full-clean", "restore-candidate-v1", "profile-in-use", "profile-after-release", "verify-recovered-preference"}:
                harness.read()  # Never perform reader actions against unlabeled real content.
            stages = ["read", "keyboard", "copy", "search", "prepare-note", "highlight"] if args.flow == "smoke" else [args.flow]
            for stage in stages:
                getattr(harness, stage.replace("-", "_"))()
                report["stages"].append({"name": stage, "status": "passed"})
                harness.dump(f"after-{stage}")
                print(f"PASS {stage}", flush=True)
        report["status"] = "passed"
        return 0
    except Exception as error:
        report["error"] = f"{type(error).__name__}: {error}"
        print(report["error"], file=sys.stderr, flush=True)
        if harness is not None and harness.root is not None:
            try:
                harness.dump("failure-tree")
            except Exception as dump_error:
                report["dump_error"] = str(dump_error)
        return 1
    finally:
        report["finished_at"] = datetime.now(timezone.utc).isoformat()
        (args.output_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str) + "\n")
        print(f"Native smoke report: {args.output_dir / 'report.json'}", flush=True)


if __name__ == "__main__":
    raise SystemExit(main())
