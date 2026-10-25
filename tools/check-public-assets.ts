import { readdirSync } from "node:fs";
import { join } from "node:path";

const sourceExtensions = /\.(?:zip|usx|usfm|sqlite|db)$/i;

export function checkPublicAssets(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Public assets cannot contain symlinks: ${path}`);
    }
    if (entry.isDirectory()) {
      checkPublicAssets(path);
    } else if (sourceExtensions.test(entry.name)) {
      throw new Error(`Source archives and databases cannot be public assets: ${path}`);
    }
  }
}
