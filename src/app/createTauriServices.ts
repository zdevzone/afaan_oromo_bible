import { isTauri } from "@tauri-apps/api/core";
import type { AppServices } from "../domain/ports";
import { AppError } from "../domain/scripture";

export async function createTauriServices(): Promise<AppServices> {
  if (!isTauri()) {
    throw new AppError("NATIVE_UNAVAILABLE", "Open this build in the desktop application.");
  }

  const [
    { createTauriLibrary },
    { createTauriUserStore },
    { writeText },
    { createTauriWindow },
    { nativeBackupFiles },
  ] = await Promise.all([
    import("../adapters/tauri/library"),
    import("../adapters/tauri/userStore"),
    import("@tauri-apps/plugin-clipboard-manager"),
    import("../adapters/tauri/window"),
    import("../adapters/tauri/backupFiles"),
  ]);
  const userStore = createTauriUserStore();
  return {
    library: createTauriLibrary(),
    userStore,
    runtime: "tauri",
    platform: {
      copyText: (text) => writeText(text),
      ...nativeBackupFiles,
      window: await createTauriWindow(),
    },
  };
}
