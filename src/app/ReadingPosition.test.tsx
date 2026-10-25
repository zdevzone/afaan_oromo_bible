import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createFixtureLibrary } from "../adapters/browser/fixtureLibrary";
import { createBackup } from "../domain/backup";
import { DEFAULT_PREFERENCES, type ReadingPosition } from "../domain/notes";
import type { AppServices } from "../domain/ports";
import type { ChapterContent } from "../domain/scripture";
import { App } from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("reading position during navigation", () => {
  it("flushes a pending scroll position before backup export and replacement restore", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    HTMLElement.prototype.scrollTo = vi.fn();
    const library = createFixtureLibrary();
    const snapshot = {
      notes: [],
      bookmarks: [],
      highlights: [],
      preferences: [],
      readingPositions: [],
    };
    const backup = JSON.stringify(createBackup(snapshot, crypto.randomUUID(), "0.1.0"));
    const saveReadingPosition = vi.fn(async (_position: ReadingPosition) => {});
    const saveBackup = vi.fn(async () => "backup.json");
    const replaceSnapshot = vi.fn(async () => "recovery.json");
    const services: AppServices = {
      runtime: "browser",
      library,
      userStore: {
        readSnapshot: async () => snapshot,
        getDatabaseId: async () => crypto.randomUUID(),
        readRecoveryBackup: async () => null,
        replaceSnapshot,
        listBookmarks: async () => [],
        saveBookmark: async (record) => record,
        deleteBookmark: async () => {},
        listHighlights: async () => [],
        saveHighlights: async (records) => records,
        deleteHighlights: async () => {},
        listNotes: async () => [],
        saveNote: async (record) => record,
        deleteNote: async () => {},
        getReadingPosition: async () => null,
        saveReadingPosition,
        getPreferences: async () => ({ ...DEFAULT_PREFERENCES }),
        savePreferences: async () => {},
      },
      platform: {
        copyText: async () => {},
        saveBackup,
        openBackup: async () => backup,
      },
    };
    render(<App services={services} />);
    await screen.findByRole("heading", { name: "Chapter 1" });
    fireEvent.click(screen.getByRole("button", { name: "Reading preferences" }));
    fireEvent.scroll(screen.getByRole("main", { hidden: true }));
    fireEvent.click(screen.getByRole("button", { name: "Export backup" }));
    await waitFor(() => expect(saveBackup).toHaveBeenCalledTimes(1));
    expect(saveReadingPosition).toHaveBeenCalledTimes(1);
    expect(saveReadingPosition.mock.invocationCallOrder[0]).toBeLessThan(
      saveBackup.mock.invocationCallOrder[0]!,
    );
    saveReadingPosition.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Review backup to restore" }));
    await screen.findByRole("dialog", { name: "Replace personal data?" });
    fireEvent.scroll(screen.getByRole("main", { hidden: true }));
    fireEvent.click(screen.getByRole("button", { name: "Replace all personal data" }));
    await waitFor(() => expect(replaceSnapshot).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(saveReadingPosition).toHaveBeenCalledTimes(1);
    expect(saveReadingPosition.mock.invocationCallOrder[0]).toBeLessThan(
      replaceSnapshot.mock.invocationCallOrder[0]!,
    );
  }, 15_000);

  it("does not save an old chapter after the reader has requested the next one", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    HTMLElement.prototype.scrollTo = vi.fn();
    const library = createFixtureLibrary();
    let rejectChapter: ((reason: Error) => void) | undefined;
    let holdFirstNavigation = true;
    const getChapter = vi.fn(async (key: Parameters<typeof library.getChapter>[0]) => {
      if (key.chapterLabel === "2" && holdFirstNavigation) {
        holdFirstNavigation = false;
        return new Promise<ChapterContent>((_resolve, reject) => {
          rejectChapter = reject;
        });
      }
      return library.getChapter(key);
    });
    const saveReadingPosition = vi.fn(async (_position: ReadingPosition) => {});
    const services: AppServices = {
      runtime: "browser",
      library: { ...library, getChapter },
      userStore: {
        readSnapshot: async () => ({
          notes: [],
          bookmarks: [],
          highlights: [],
          preferences: [],
          readingPositions: [],
        }),
        getDatabaseId: async () => crypto.randomUUID(),
        readRecoveryBackup: async () => null,
        replaceSnapshot: async () => "recovery.json",
        listBookmarks: async () => [],
        saveBookmark: async (record) => record,
        deleteBookmark: async () => {},
        listHighlights: async () => [],
        saveHighlights: async (records) => records,
        deleteHighlights: async () => {},
        listNotes: async () => [],
        saveNote: async (record) => record,
        deleteNote: async () => {},
        getReadingPosition: async () => null,
        saveReadingPosition,
        getPreferences: async () => ({ ...DEFAULT_PREFERENCES }),
        savePreferences: async () => {},
      },
      platform: {
        copyText: async () => {},
        saveBackup: async () => null,
        openBackup: async () => null,
      },
    };
    render(<App services={services} />);
    await screen.findByRole("heading", { name: "Chapter 1" });
    fireEvent.scroll(screen.getByRole("main"));
    fireEvent.click(screen.getByRole("button", { name: "Next chapter" }));
    await waitFor(() => expect(rejectChapter).toBeDefined());
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(saveReadingPosition).not.toHaveBeenCalled();
    rejectChapter?.(new Error("Temporary chapter error"));
    await screen.findByText("Temporary chapter error");
    fireEvent.scroll(screen.getByRole("main"));
    await waitFor(() => expect(saveReadingPosition).toHaveBeenCalledTimes(1));
    expect(saveReadingPosition.mock.calls[0]?.[0]).toMatchObject({ chapterLabel: "1" });
    fireEvent.click(screen.getByRole("button", { name: "Next chapter" }));
    await screen.findByRole("heading", { name: "Chapter 2" });
    await waitFor(() => expect(saveReadingPosition).toHaveBeenCalledTimes(2));
    expect(saveReadingPosition.mock.calls[1]?.[0]).toMatchObject({
      bookCode: "TSA",
      chapterLabel: "2",
    });
    const reference = screen.getByRole("textbox", { name: "Open a Scripture reference" });
    fireEvent.change(reference, { target: { value: "TSA 999:1" } });
    fireEvent.submit(reference.closest("form")!);
    await screen.findByText("That chapter is not available in this book.");
    fireEvent.scroll(screen.getByRole("main"));
    await waitFor(() => expect(saveReadingPosition).toHaveBeenCalledTimes(3));
    expect(saveReadingPosition.mock.calls[2]?.[0]).toMatchObject({ chapterLabel: "2" });
  }, 10_000);
});
