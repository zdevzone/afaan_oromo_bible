import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { DesktopWindow } from "../../domain/ports";

export async function createTauriWindow(): Promise<DesktopWindow> {
  const window = getCurrentWindow();
  let handler: (() => void) | undefined;
  let request: "window" | "app" = "window";
  let pending = false;
  let guardWasInstalled = false;
  function forward(kind: "window" | "app") {
    if (pending || !handler) return;
    pending = true;
    request = kind;
    handler();
  }
  // Install once before the editor mounts. A React effect cleanup must not leave
  // a window where StrictMode can accidentally permit an unguarded close.
  await window.onCloseRequested((event) => {
    // Before the React guard first subscribes, no editable note draft exists.
    // Keep startup failures and slow initialization from trapping the window.
    if (!guardWasInstalled) return;
    event.preventDefault();
    forward("window");
  });
  await listen("app-quit-requested", () => {
    // Rust prevents application exit before emitting this event. During startup,
    // approve that exit directly because no editor has mounted yet.
    if (!guardWasInstalled) {
      void invoke("app_quit_after_decision").catch(() => {});
      return;
    }
    forward("app");
  });
  return {
    onCloseRequested(next) {
      guardWasInstalled = true;
      handler = next;
      return () => {
        if (handler === next) handler = undefined;
      };
    },
    resetCloseRequest() {
      pending = false;
    },
    // Native app quit needs explicit approval; destroying a macOS window alone
    // can leave the application running with no editor window.
    close: () => (request === "app" ? invoke("app_quit_after_decision") : window.destroy()),
  };
}
