import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import fixture from "../../content/fixtures/sample.json";
import { createFixtureLibrary } from "../adapters/browser/fixtureLibrary";
import { createVerseAnchor, DEFAULT_PREFERENCES, type Bookmark } from "../domain/notes";
import type { AppServices } from "../domain/ports";
import { App } from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("bookmark navigation after a content revision", () => {
  it("selects unchanged text and preserves a changed link for review", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    HTMLElement.prototype.scrollTo = vi.fn();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    const library = createFixtureLibrary();
    const chapter = await library.getChapter({
      editionId: fixture.edition.id,
      bookCode: "TSA",
      chapterLabel: "1",
    });
    const anchor = {
      ...createVerseAnchor(fixture.edition, chapter, [chapter.verseUnits[0]!.key], "Sample Book A"),
      contentRevision: "previous-source-revision",
    };
    const now = new Date().toISOString();
    const unavailableEdition = { ...fixture.edition, id: "removed-edition" };
    const unavailableChapter = {
      ...chapter,
      editionId: unavailableEdition.id,
      verseUnits: chapter.verseUnits.map((unit) => ({
        ...unit,
        key: JSON.stringify([
          unavailableEdition.id,
          unavailableEdition.versificationId,
          chapter.bookCode,
          chapter.chapterLabel,
          unit.label,
        ]),
      })),
    };
    const unavailableAnchor = createVerseAnchor(
      unavailableEdition,
      unavailableChapter,
      [unavailableChapter.verseUnits[0]!.key],
      "Archived Sample Book A",
    );
    const bookmarks: Bookmark[] = [
      {
        id: crypto.randomUUID(),
        anchor,
        label: "Unchanged link",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        anchor: { ...anchor, id: crypto.randomUUID(), selectedTextDigests: ["0".repeat(64)] },
        label: "Changed link",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        anchor: unavailableAnchor,
        label: "Unavailable link",
        createdAt: now,
        updatedAt: now,
      },
    ];
    const services: AppServices = {
      runtime: "browser",
      library,
      userStore: {
        readSnapshot: async () => ({
          notes: [],
          bookmarks,
          highlights: [],
          preferences: [],
          readingPositions: [],
        }),
        getDatabaseId: async () => crypto.randomUUID(),
        readRecoveryBackup: async () => null,
        replaceSnapshot: async () => "recovery.json",
        listBookmarks: async () => bookmarks,
        saveBookmark: async (record) => record,
        deleteBookmark: async () => {},
        listHighlights: async () => [],
        saveHighlights: async (records) => records,
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
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Workspace" })).getByRole("button", {
        name: /^Bookmarks/,
      }),
    );
    const panel = await screen.findByRole("complementary", { name: "Saved bookmarks" });
    const marker = screen.getByRole("button", { name: "Select verse Sample Book A 1:1" });
    fireEvent.click(within(panel).getByRole("button", { name: /Unchanged link/ }));
    await waitFor(() => expect(marker.getAttribute("aria-pressed")).toBe("true"));
    fireEvent.click(within(panel).getByRole("button", { name: /Changed link/ }));
    await waitFor(() => expect(marker.getAttribute("aria-pressed")).toBe("false"));
    expect(within(panel).getByRole("alert").textContent).toMatch(/passage changed/i);
    expect(within(panel).getByRole("button", { name: /Changed link/ })).toBeTruthy();

    const unavailableRow = within(panel)
      .getByRole("button", { name: /Unavailable link/ })
      .closest("li")!;
    fireEvent.click(within(unavailableRow).getByRole("button", { name: /Unavailable link/ }));
    expect(within(panel).getByRole("alert").textContent).toMatch(/bookmark is preserved/i);
    expect(marker.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(within(unavailableRow).getByRole("button", { name: "Edit label" }));
    fireEvent.change(within(unavailableRow).getByRole("textbox", { name: "Bookmark label" }), {
      target: { value: "Archived passage" },
    });
    fireEvent.click(within(unavailableRow).getByRole("button", { name: "Save label" }));
    await waitFor(() =>
      expect(within(panel).getByRole("button", { name: /Archived passage/ })).toBeTruthy(),
    );
    fireEvent.click(within(unavailableRow).getByRole("button", { name: "Remove" }));
    const confirmation = await screen.findByRole("dialog", { name: "Remove this bookmark?" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Remove bookmark" }));
    await waitFor(() =>
      expect(within(panel).queryByRole("button", { name: /Archived passage/ })).toBeNull(),
    );
  });
});
