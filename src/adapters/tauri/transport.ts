import { invoke } from "@tauri-apps/api/core";
import { AppError } from "../../domain/scripture";

type Command =
  | "library_list_editions"
  | "library_list_books"
  | "library_get_chapter"
  | "library_search"
  | "user_list_notes"
  | "user_save_note"
  | "user_delete_note"
  | "user_get_reading_position"
  | "user_save_reading_position"
  | "user_get_preferences"
  | "user_save_preferences";

export async function request(command: Command, args?: Record<string, unknown>): Promise<unknown> {
  try {
    return await invoke<unknown>(command, args);
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      "message" in error &&
      typeof error.code === "string" &&
      typeof error.message === "string"
    ) {
      throw new AppError(error.code, error.message);
    }
    throw new AppError(
      "NATIVE_UNAVAILABLE",
      "The desktop operation failed. Your unsaved changes have been kept; try again.",
    );
  }
}

export function expectArray<T>(value: unknown, check: (item: unknown) => asserts item is T): T[] {
  if (!Array.isArray(value))
    throw new AppError("RESPONSE_INVALID", "The desktop response was invalid.");
  const items: unknown[] = value;
  const result: T[] = [];
  for (const item of items) {
    check(item);
    result.push(item);
  }
  return result;
}

export function expectVoid(value: unknown): void {
  if (value !== null && value !== undefined) {
    throw new AppError("RESPONSE_INVALID", "The desktop acknowledgment was invalid.");
  }
}
