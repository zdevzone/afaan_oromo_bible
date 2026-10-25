import { describe, expect, it } from "vite-plus/test";
import { AppError } from "../domain/scripture";
import { en } from "./en";
import { messageForError } from "./errors";

describe("user-facing storage errors", () => {
  it("gives distinct recovery actions for corrupt, locked and full storage", () => {
    expect(messageForError(new AppError("STORAGE_CORRUPT", "Native detail"), en)).toContain(
      "keep a copy",
    );
    expect(messageForError(new AppError("STORAGE_IN_USE", "Native detail"), en)).toContain(
      "Close the other window",
    );
    expect(messageForError(new AppError("STORAGE_FULL", "Native detail"), en)).toContain(
      "Free disk space",
    );
  });

  it("keeps specific details for error codes with multiple causes", () => {
    expect(messageForError(new AppError("BACKUP_INVALID", "Backup exceeds 50 MiB."), en)).toBe(
      "Backup exceeds 50 MiB.",
    );
    expect(messageForError(null, en)).toBe(en.unknownError);
  });
});
