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
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time
from typing import Any, Callable


NOTE_TITLE = "Linux native smoke fixture"
NOTE_BODY = "A synthetic native test note persists after the application restarts."
BRIDGE = "Sample Book A 1:2-3"
CAVEATS = [
    "Synthetic development content only; this is not a production-content test.",
    "Xvfb/X11 accessibility smoke evidence does not qualify GNOME Wayland or Orca.",
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
        "--flow", choices=["read", "keyboard", "copy", "search", "prepare-note", "verify-note", "smoke"],
        help="Run a staged flow; smoke runs read/keyboard/copy/search/prepare-note, without a restart.",
    )
    parser.add_argument(
        "--confirm-synthetic-profile", action="store_true",
        help="Confirm this session uses a disposable synthetic test profile before actions.",
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
    args = parser.parse_args()
    if args.timeout <= 0 or args.timeout > 60 or args.max_nodes < 1 or args.max_depth < 1:
        parser.error("Use timeout in (0, 60] and positive tree bounds.")
    if args.all_apps and args.flow:
        parser.error("--all-apps is discovery-only; select an application before running flows.")
    if args.flow and args.flow != "read" and not args.confirm_synthetic_profile:
        parser.error("Actions require --confirm-synthetic-profile and a disposable test session.")
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

    def command(self, args: list[str], **kwargs) -> str:
        if shutil.which(args[0]) is None:
            raise SmokeFailure(f"Missing test-only executable: {args[0]}")
        result = subprocess.run(args, capture_output=True, text=True, timeout=8, **kwargs)
        if result.returncode:
            raise SmokeFailure(f"{args[0]} failed ({result.returncode}): {result.stderr.strip()[:500]}")
        return result.stdout

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

    def focus(self, name: str):
        if self.args.activate_window or self.args.x11_window:
            window = self.args.x11_window
            if window is None:
                pid = self.safe(self.root.get_process_id, 0)
                if not pid:
                    raise SmokeFailure("Native window has no PID; pass --x11-window explicitly.")
                windows = self.command(["xdotool", "search", "--onlyvisible", "--pid", str(pid)]).splitlines()
                if not windows:
                    raise SmokeFailure("No visible X11 window matches the selected native PID.")
                window = windows[0]
            self.command(["xdotool", "windowactivate", "--sync", window])
            self.command(["xdotool", "windowfocus", "--sync", window])
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
        node = self.find(f"Select verse {reference}")
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

    def read(self):
        self.wait("synthetic-content label", lambda: self.has_text("Synthetic test content"))

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
                              if self.state(node, "SHOWING") and self.state(node, "ENABLED")
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
        self.report["keyboard"] = {
            "reference_tab_to_go": True, "reverse_tab_to_reference": True,
            "dialog_focus_cycle": visited, "dialog_reverse_focus": reverse,
            "dialog_escape_and_focus_return": True,
        }

    def copy(self):
        self.reference("TSA 1:2", BRIDGE)
        fixture = json.loads(self.args.fixture_json.read_text())
        if fixture["edition"].get("isSynthetic") is not True:
            raise SmokeFailure("Clipboard expectation must come from a marked synthetic fixture.")
        chapter = next(chapter for chapter in fixture["chapters"] if chapter["bookCode"] == "TSA" and chapter["chapterLabel"] == "1")
        unit = next(unit for unit in chapter["verseUnits"] if unit["label"] == "2-3")
        expected = f"{unit['label']} {unit['textPlain']}\n\n{BRIDGE} · {fixture['edition']['abbreviation']}\n{fixture['edition']['attribution']}"
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
        self.report["clipboard"] = {"exact_fixture_match": True, "characters": len(expected)}

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
        self.activate("Save", roles={"push button", "button"})
        self.wait("committed note acknowledgment", lambda: self.has_text("Saved on this device"))
        self.named(f"Open {BRIDGE}")
        self.reference("TSA 2:1", "Sample Book A 2:1")
        self.named("Chapter 2", roles={"heading"})
        self.report["restart_required"] = "Close/relaunch the native process with the same isolated profile; run --flow verify-note."

    def verify_note(self):
        self.named("Chapter 2", roles={"heading"})
        navigation = self.named("Workspace")
        self.activate("My notes", prefix=True, root=navigation)
        saved = self.named("Saved notes")
        self.activate(NOTE_TITLE, prefix=True, root=saved, roles={"push button", "button"})
        if self.text(self.named("Note title")) != NOTE_TITLE or self.text(self.named("Note text")) != NOTE_BODY:
            raise SmokeFailure("Restarted native note editor does not match the committed fixture note.")
        self.activate(f"Open {BRIDGE}")
        self.wait("reopened note passage", lambda: self.selected(BRIDGE))
        self.report["restart_observation"] = "Saved note, anchor and reading position observed; caller must establish that a real process restart occurred."


def main() -> int:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    report: dict[str, Any] = {
        "started_at": datetime.now(timezone.utc).isoformat(), "status": "failed",
        "flow": args.flow, "stages": [], "caveats": CAVEATS,
    }
    harness = None
    try:
        harness = NativeSmoke(args, report)
        harness.select_root()
        report["native_root"] = {"name": harness.name(harness.root), "pid": harness.safe(harness.root.get_process_id, 0)}
        if args.dump or args.flow is None:
            harness.dump("initial-tree")
        if args.flow:
            harness.read()  # Never perform actions against an unlabeled real-content reader.
            stages = ["read", "keyboard", "copy", "search", "prepare-note"] if args.flow == "smoke" else [args.flow]
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
