import { AppError } from "../../domain/scripture";
import { request } from "./transport";

function fileResult(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length === 0)
    throw new AppError("RESPONSE_INVALID", "The backup file response was invalid.");
  return value;
}

export const nativeBackupFiles = {
  async saveBackup(): Promise<string | null> {
    return fileResult(await request("backup_save_file", { createdAt: new Date().toISOString() }));
  },
  async openBackup(): Promise<string | null> {
    return fileResult(await request("backup_open_file"));
  },
  async recoverCorruptDatabase(): Promise<string> {
    const location = fileResult(
      await request("user_recover_corrupt_database", { confirmed: true }),
    );
    if (!location)
      throw new AppError("RESPONSE_INVALID", "The recovery archive location was not returned.");
    return location;
  },
};
