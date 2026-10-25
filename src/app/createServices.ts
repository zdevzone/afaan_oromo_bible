import { ENV } from "varlock/env";
import type { AppServices } from "../domain/ports";

/** Select adapters from the declared build target so Vite can remove the other target. */
export async function createServices(): Promise<AppServices> {
  if (ENV.APP_TARGET === "tauri") {
    const { createTauriServices } = await import("./createTauriServices");
    return createTauriServices();
  }

  const { createBrowserServices } = await import("./createBrowserServices");
  return createBrowserServices();
}
