import { AppError } from "../domain/scripture";
import type { UiCatalog } from "./en";

// These codes have one safe action across the native and browser adapters.
// Other codes cover distinct causes, so retain their detailed English fallback.
export function messageForError(error: unknown, strings: UiCatalog): string {
  if (error instanceof AppError) {
    if (error.code === "STORAGE_CORRUPT") return strings.storageCorruptError;
    if (error.code === "STORAGE_IN_USE") return strings.storageInUseError;
    if (error.code === "STORAGE_FULL") return strings.storageFullError;
  }
  return error instanceof Error ? error.message : strings.unknownError;
}
