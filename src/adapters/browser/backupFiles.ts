import { createBackup, BACKUP_MAX_BYTES } from "../../domain/backup";
import type { UserStore } from "../../domain/ports";
import { AppError } from "../../domain/scripture";

export function browserBackupFiles(store: UserStore) {
  return {
    async saveBackup(): Promise<string> {
      const backup = createBackup(await store.readSnapshot(), await store.getDatabaseId(), "0.1.0");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup)], { type: "application/json" }),
      );
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = "afaan-oromo-bible-backup.json";
        document.body.append(link);
        link.click();
        link.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      return "Browser download requested";
    },
    openBackup(): Promise<string | null> {
      return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.hidden = true;
        const finish = (value: string | null) => {
          input.remove();
          resolve(value);
        };
        input.addEventListener("cancel", () => finish(null), { once: true });
        input.addEventListener(
          "change",
          () => {
            const file = input.files?.[0];
            if (!file) {
              finish(null);
              return;
            }
            if (file.size > BACKUP_MAX_BYTES) {
              input.remove();
              reject(new AppError("BACKUP_INVALID", "The selected backup exceeds 50 MiB."));
              return;
            }
            void file.text().then(finish, () => {
              input.remove();
              reject(new AppError("BACKUP_INVALID", "The selected backup could not be read."));
            });
          },
          { once: true },
        );
        document.body.append(input);
        input.click();
      });
    },
  };
}
