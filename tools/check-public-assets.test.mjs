import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkPublicAssets } from "./check-public-assets.ts";

test("public assets reject source archives, databases and symlinks", () => {
  const directory = mkdtempSync(join(tmpdir(), "aob-public-assets-"));
  try {
    const nested = join(directory, "res");
    mkdirSync(nested);
    writeFileSync(join(directory, "notice.txt"), "test notice");
    checkPublicAssets(directory);
    for (const name of ["original.zip", "GEN.usx", "book.usfm", "library.sqlite", "notes.db"]) {
      const path = join(nested, name);
      writeFileSync(path, "synthetic test bytes");
      assert.throws(() => checkPublicAssets(directory), /cannot be public assets/);
      rmSync(path);
    }
    const link = join(nested, "linked-source");
    symlinkSync(directory, link);
    assert.throws(() => checkPublicAssets(directory), /cannot contain symlinks/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
