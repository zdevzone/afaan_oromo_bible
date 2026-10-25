import { isTauri } from "@tauri-apps/api/core";
import type { AppServices } from "../domain/ports";
import { AppError } from "../domain/scripture";

export async function createBrowserServices(): Promise<AppServices> {
  if (isTauri()) {
    throw new AppError(
      "BUILD_TARGET_INVALID",
      "This desktop window was started with browser storage. Restart using the desktop:dev command.",
    );
  }

  const [{ createFixtureLibrary }, { createIndexedDbUserStore }, { browserBackupFiles }] =
    await Promise.all([
      import("../adapters/browser/fixtureLibrary"),
      import("../adapters/browser/indexedDbUserStore"),
      import("../adapters/browser/backupFiles"),
    ]);
  const userStore = createIndexedDbUserStore();
  return {
    library: createFixtureLibrary(),
    userStore,
    runtime: "browser",
    platform: {
      ...browserBackupFiles(userStore),
      async copyText(text) {
        if (!navigator.clipboard?.writeText) {
          throw new AppError(
            "CLIPBOARD_UNAVAILABLE",
            "Clipboard access is unavailable. Select and copy the text manually.",
          );
        }
        await navigator.clipboard.writeText(text);
      },
    },
  };
}
