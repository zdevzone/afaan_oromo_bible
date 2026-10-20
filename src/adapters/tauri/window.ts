import { getCurrentWindow } from "@tauri-apps/api/window";
import type { DesktopWindow } from "../../domain/ports";

export async function createTauriWindow(): Promise<DesktopWindow> {
  const window = getCurrentWindow();
  let handler: (() => void) | undefined;
  // Install once before the editor mounts. A React effect cleanup must not leave
  // a window where StrictMode can accidentally permit an unguarded close.
  await window.onCloseRequested((event) => {
    event.preventDefault();
    handler?.();
  });
  return {
    onCloseRequested(next) {
      handler = next;
      return () => {
        if (handler === next) handler = undefined;
      };
    },
    // destroy bypasses another close-request event; close() would re-enter it.
    close: () => window.destroy(),
  };
}
