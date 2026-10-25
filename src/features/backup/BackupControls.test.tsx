import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import fixture from "../../../content/fixtures/sample.json";
import { createFixtureLibrary } from "../../adapters/browser/fixtureLibrary";
import { createBackup, type PersonalSnapshot } from "../../domain/backup";
import { createVerseAnchor, DEFAULT_PREFERENCES } from "../../domain/notes";
import type { AppServices } from "../../domain/ports";
import { AppError } from "../../domain/scripture";
import { en } from "../../locales/en";
import { BackupControls } from "./BackupControls";

afterEach(cleanup);

describe("backup recovery without packaged content", () => {
  it("previews unavailable editions and restores personal links without remapping them", async () => {
    const library = createFixtureLibrary();
    const chapter = await library.getChapter({
      editionId: fixture.edition.id,
      bookCode: "TSA",
      chapterLabel: "1",
    });
    const anchor = createVerseAnchor(
      fixture.edition,
      chapter,
      [chapter.verseUnits[0]!.key],
      "Sample Book A",
    );
    const now = "2026-10-24T10:00:00.000Z";
    const imported: PersonalSnapshot = {
      notes: [
        {
          id: "1ba9139d-41dd-4f2a-bd11-09738a9e4970",
          title: "Saved thought",
          bodyText: "Keep this link",
          anchor,
          createdAt: now,
          updatedAt: now,
          revision: 1,
        },
      ],
      bookmarks: [],
      highlights: [],
      preferences: [],
      readingPositions: [
        {
          editionId: "uninstalled-edition",
          bookCode: "TSA",
          chapterLabel: "1",
          verseLabel: "1",
          updatedAt: now,
        },
      ],
    };
    const current: PersonalSnapshot = {
      notes: [],
      bookmarks: [],
      highlights: [],
      preferences: [],
      readingPositions: [],
    };
    const backup = createBackup(imported, "c0b4bb0d-413d-49cf-b27d-56891876a7d2", "0.1.0", now);
    const replaceSnapshot = vi.fn(
      async (_snapshot: PersonalSnapshot) => "recovery/pre-restore.json",
    );
    const services: AppServices = {
      runtime: "tauri",
      library: {
        ...library,
        listEditions: async () => {
          throw new AppError("CONTENT_UNAVAILABLE", "No approved content is packaged.");
        },
      },
      userStore: {
        readSnapshot: async () => current,
        getDatabaseId: async () => "c0b4bb0d-413d-49cf-b27d-56891876a7d2",
        readRecoveryBackup: async () => null,
        replaceSnapshot,
        listBookmarks: async () => [],
        saveBookmark: async (bookmark) => bookmark,
        deleteBookmark: async () => {},
        listHighlights: async () => [],
        saveHighlights: async (highlights) => highlights,
        deleteHighlights: async () => {},
        listNotes: async () => [],
        saveNote: async (note) => note,
        deleteNote: async () => {},
        getReadingPosition: async () => null,
        saveReadingPosition: async () => {},
        getPreferences: async () => ({ ...DEFAULT_PREFERENCES }),
        savePreferences: async () => {},
      },
      platform: {
        copyText: async () => {},
        saveBackup: async () => null,
        openBackup: async () => JSON.stringify(backup),
      },
    };
    render(
      <BackupControls
        services={services}
        strings={en}
        uiLocale="en"
        flushWrites={async () => true}
        pauseWrites={() => {}}
        resumeWrites={() => {}}
        writesBusy={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Review backup to restore" }));
    await screen.findByRole("dialog", { name: "Replace personal data?" });
    expect(screen.getByText(/Edition revisions unavailable here/).textContent).toContain(
      anchor.editionId,
    );
    expect(
      screen.getByText(/Reading positions refer to unavailable editions/).textContent,
    ).toContain("uninstalled-edition");
    fireEvent.click(screen.getByRole("button", { name: "Replace all personal data" }));
    await waitFor(() => expect(replaceSnapshot).toHaveBeenCalledWith(imported));
    expect(await screen.findByRole("dialog", { name: "Personal data restored" })).toBeTruthy();
  });
});
