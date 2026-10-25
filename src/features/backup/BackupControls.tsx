import { useState } from "react";
import type { AppServices } from "../../domain/ports";
import { parseBackup, type PersonalSnapshot, type UserBackup } from "../../domain/backup";
import { AppError } from "../../domain/scripture";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import type { Preferences } from "../../domain/notes";
import type { UiCatalog } from "../../locales/en";
import { formatUiDate } from "../../locales/catalog";

interface Preview {
  backup: UserBackup;
  snapshot: PersonalSnapshot;
  current: PersonalSnapshot;
  missingEditions: string[];
  missingPositionEditions: string[];
}

function counts(snapshot: PersonalSnapshot, strings: UiCatalog): string {
  return strings.backupCounts
    .replace("{notes}", String(snapshot.notes.length))
    .replace("{bookmarks}", String(snapshot.bookmarks.length))
    .replace("{highlights}", String(snapshot.highlights.length))
    .replace("{preferences}", String(snapshot.preferences.length))
    .replace("{positions}", String(snapshot.readingPositions.length));
}

const message = (error: unknown, strings: UiCatalog) =>
  error instanceof Error ? error.message : strings.backupError;

export function BackupControls({
  services,
  flushWrites,
  pauseWrites,
  resumeWrites,
  writesBusy,
  strings,
  uiLocale,
}: {
  services: AppServices;
  flushWrites: () => Promise<boolean>;
  pauseWrites: () => void;
  resumeWrites: () => void;
  writesBusy: boolean;
  strings: UiCatalog;
  uiLocale: Preferences["uiLocale"];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [completedLocation, setCompletedLocation] = useState<string | null>(null);

  async function exportBackup() {
    if (busy || writesBusy) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      if (!(await flushWrites())) throw new Error(strings.backupUnsavedExport);
      const location = await services.platform.saveBackup();
      if (location)
        setStatus(
          services.runtime === "browser"
            ? strings.backupDownloadRequested
            : strings.backupSavedAt.replace("{location}", location),
        );
    } catch (cause) {
      setError(message(cause, strings));
    } finally {
      setBusy(false);
    }
  }

  async function prepare(text: string) {
    const parsed = parseBackup(text);
    const [current, editions] = await Promise.all([
      services.userStore.readSnapshot(),
      services.library.listEditions().catch((cause: unknown) => {
        if (cause instanceof AppError && cause.code === "CONTENT_UNAVAILABLE") return [];
        throw cause;
      }),
    ]);
    const missingEditions = parsed.backup.requiredEditions
      .filter(
        (required) =>
          !editions.some(
            (installed) =>
              installed.id === required.editionId &&
              installed.versificationId === required.versificationId &&
              installed.contentRevision === required.contentRevision,
          ),
      )
      .map((item) => `${item.editionId} (${item.contentRevision})`);
    const missingPositionEditions = [
      ...new Set(
        parsed.snapshot.readingPositions
          .filter((position) => !editions.some((installed) => installed.id === position.editionId))
          .map((position) => position.editionId),
      ),
    ];
    setPreview({ ...parsed, current, missingEditions, missingPositionEditions });
  }

  async function chooseBackup() {
    if (busy || writesBusy) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const text = await services.platform.openBackup();
      if (text !== null) await prepare(text);
    } catch (cause) {
      setError(message(cause, strings));
    } finally {
      setBusy(false);
    }
  }

  async function reviewRecovery() {
    if (busy || writesBusy) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const backup = await services.userStore.readRecoveryBackup();
      if (!backup) throw new Error(strings.noRecoveryCopy);
      await prepare(JSON.stringify(backup));
    } catch (cause) {
      setError(message(cause, strings));
    } finally {
      setBusy(false);
    }
  }

  async function confirmRestore() {
    if (!preview || busy || writesBusy) return;
    setBusy(true);
    setError("");
    pauseWrites();
    try {
      if (!(await flushWrites())) throw new Error(strings.backupUnsavedRestore);
      const location = await services.userStore.replaceSnapshot(preview.snapshot);
      setPreview(null);
      setCompletedLocation(location);
    } catch (cause) {
      resumeWrites();
      setError(message(cause, strings));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="backup-controls" aria-label={strings.personalDataBackup}>
      <div className="eyebrow">{strings.yourData}</div>
      <p>{strings.backupPrivacy}</p>
      <div className="dialog-actions">
        <Button
          variant="outline"
          disabled={busy || writesBusy}
          onClick={() => {
            void exportBackup();
          }}
        >
          {strings.exportBackup}
        </Button>
        <Button
          variant="outline"
          disabled={busy || writesBusy}
          onClick={() => {
            void chooseBackup();
          }}
        >
          {strings.reviewBackup}
        </Button>
        <Button
          variant="ghost"
          disabled={busy || writesBusy}
          onClick={() => {
            void reviewRecovery();
          }}
        >
          {strings.reviewRecovery}
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPreview(null);
        }}
      >
        <DialogContent closeLabel={strings.closeDialog} showCloseButton={!busy}>
          <DialogTitle>{strings.replacePersonalData}</DialogTitle>
          <DialogDescription>{strings.restoreWarning}</DialogDescription>
          {preview && (
            <div className="backup-preview">
              <p>
                <strong>{strings.backupDate}</strong>{" "}
                {formatUiDate(preview.backup.createdAt, uiLocale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
              <p>
                <strong>{strings.currentData}</strong> {counts(preview.current, strings)}
              </p>
              <p>
                <strong>{strings.importedData}</strong> {counts(preview.snapshot, strings)}
              </p>
              {preview.missingEditions.length > 0 && (
                <p role="status">
                  {strings.missingEditionRevisions.replace(
                    "{editions}",
                    preview.missingEditions.join(", "),
                  )}
                </p>
              )}
              {preview.missingPositionEditions.length > 0 && (
                <p role="status">
                  {strings.missingPositionEditions.replace(
                    "{editions}",
                    preview.missingPositionEditions.join(", "),
                  )}
                </p>
              )}
              <p>{strings.preRestoreWarning}</p>
            </div>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="dialog-actions">
            <Button variant="outline" disabled={busy} onClick={() => setPreview(null)}>
              {strings.cancel}
            </Button>
            <Button
              variant="outline"
              disabled={busy || writesBusy}
              onClick={() => {
                void exportBackup();
              }}
            >
              {strings.exportCurrentFirst}
            </Button>
            <Button
              variant="destructive"
              disabled={busy || writesBusy}
              onClick={() => {
                void confirmRestore();
              }}
            >
              {strings.replaceAllPersonalData}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={completedLocation !== null} onOpenChange={() => {}}>
        <DialogContent closeLabel={strings.closeDialog} showCloseButton={false}>
          <DialogTitle>{strings.personalDataRestored}</DialogTitle>
          <DialogDescription>{strings.restoreCommitted}</DialogDescription>
          <p>{strings.recoveryCopyAt.replace("{location}", completedLocation ?? "")}</p>
          <Button onClick={() => window.location.reload()}>{strings.reloadReader}</Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
