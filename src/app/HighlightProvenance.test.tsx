import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import fixture from "../../content/fixtures/sample.json";
import { createFixtureLibrary } from "../adapters/browser/fixtureLibrary";
import { createVerseAnchor, DEFAULT_PREFERENCES, type Highlight } from "../domain/notes";
import type { AppServices } from "../domain/ports";
import { App } from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("highlight provenance in the reader", () => {
  it("keeps a changed-source highlight hidden until a user explicitly reanchors it", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    HTMLElement.prototype.scrollTo = vi.fn();
    const library = createFixtureLibrary();
    const chapter = await library.getChapter({
      editionId: fixture.edition.id,
      bookCode: "TSA",
      chapterLabel: "1",
    });
    const unit = chapter.verseUnits[0]!;
    const now = new Date().toISOString();
    const stale: Highlight = {
      id: crypto.randomUUID(),
      anchor: {
        ...createVerseAnchor(fixture.edition, chapter, [unit.key], "Sample Book A"),
        contentRevision: "prior-source-revision",
      },
      colorToken: "yellow",
      createdAt: now,
      updatedAt: now,
    };
    const saveHighlights = vi.fn(async (records: Highlight[]) => records);
    const services: AppServices = {
      runtime: "browser",
      library,
      userStore: {
        readSnapshot: async () => ({
          notes: [],
          bookmarks: [],
          highlights: [stale],
          preferences: [],
          readingPositions: [],
        }),
        getDatabaseId: async () => crypto.randomUUID(),
        readRecoveryBackup: async () => null,
        replaceSnapshot: async () => "recovery.json",
        listBookmarks: async () => [],
        saveBookmark: async (record) => record,
        deleteBookmark: async () => {},
        listHighlights: async () => [stale],
        saveHighlights,
        deleteHighlights: async () => {},
        listNotes: async () => [],
        saveNote: async (record) => record,
        deleteNote: async () => {},
        getReadingPosition: async () => null,
        saveReadingPosition: async () => {},
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
    const marker = screen.getByRole("button", { name: "Select verse Sample Book A 1:1" });
    expect(marker.hasAttribute("data-has-highlight")).toBe(false);
    fireEvent.click(marker);
    fireEvent.click(screen.getByRole("button", { name: "Highlight blue" }));
    await waitFor(() => expect(saveHighlights).toHaveBeenCalledTimes(1));
    const saved = saveHighlights.mock.calls[0]![0][0]!;
    expect(saved.id).toBe(stale.id);
    expect(saved.anchor.contentRevision).toBe(fixture.edition.contentRevision);
    expect(saved.anchor.selectedTextDigests).toEqual([unit.textDigest]);
    expect(saved.colorToken).toBe("blue");
    await screen.findByRole("button", { name: "Select verse Sample Book A 1:1. Highlighted blue" });
  });
});
