import { isTauri } from "@tauri-apps/api/core";
import { ENV } from "varlock/env";
import type { AppServices } from "../domain/ports";
import { AppError } from "../domain/scripture";

export async function createServices(): Promise<AppServices> {
  if (ENV.APP_TARGET === "tauri") {
    if (!isTauri()) {
      throw new AppError("NATIVE_UNAVAILABLE", "Open this build in the desktop application.");
    }
    const [{ createTauriLibrary }, { createTauriUserStore }, { writeText }] = await Promise.all([
      import("../adapters/tauri/library"),
      import("../adapters/tauri/userStore"),
      import("@tauri-apps/plugin-clipboard-manager"),
    ]);
    return {
      library: createTauriLibrary(),
      userStore: createTauriUserStore(),
      runtime: "tauri",
      platform: { copyText: (text) => writeText(text) },
    };
  }

  if (isTauri()) {
    throw new AppError(
      "BUILD_TARGET_INVALID",
      "This desktop window was started with browser storage. Restart using the desktop:dev command.",
    );
  }
  const [{ createFixtureLibrary }, { createIndexedDbUserStore }] = await Promise.all([
    import("../adapters/browser/fixtureLibrary"),
    import("../adapters/browser/indexedDbUserStore"),
  ]);
  return {
    library: createFixtureLibrary(),
    userStore: createIndexedDbUserStore(),
    runtime: "browser",
    platform: {
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
