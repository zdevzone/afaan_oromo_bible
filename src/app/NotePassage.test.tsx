import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import fixture from "../../content/fixtures/sample.json";
import { createFixtureLibrary } from "../adapters/browser/fixtureLibrary";
import { createVerseAnchor, DEFAULT_PREFERENCES, type Note } from "../domain/notes";
import type { AppServices } from "../domain/ports";
import { App } from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("verse-linked note navigation", () => {
  it("opens an unchanged linked verse after the edition revision changes", async () => {
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
    const note: Note = {
      id: crypto.randomUUID(),
      title: "Unchanged passage",
      bodyText: "A retained private note.",
      anchor,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revision: 1,
    };
    const services: AppServices = {
      runtime: "browser",
      library,
      userStore: {
        readSnapshot: async () => ({
          notes: [note],
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
        listNotes: async () => [note],
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
        name: /^My notes/,
      }),
    );
    const notes = await screen.findByRole("complementary", { name: "Personal notes" });
    fireEvent.click(within(notes).getByRole("button", { name: /Unchanged passage/ }));
    fireEvent.click(await within(notes).findByRole("button", { name: "Open Sample Book A 1:1" }));
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Select verse Sample Book A 1:1" })
          .getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    expect(
      (within(notes).getByRole("textbox", { name: "Note text" }) as HTMLTextAreaElement).value,
    ).toBe("A retained private note.");
  });

  it("preserves a changed link and opens the chapter without selecting a guessed verse", async () => {
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
    const original = createVerseAnchor(
      fixture.edition,
      chapter,
      [chapter.verseUnits[0]!.key],
      "Sample Book A",
    );
    const anchor = {
      ...original,
      contentRevision: "previous-source-revision",
      selectedTextDigests: ["0".repeat(64)],
    };
    const note: Note = {
      id: crypto.randomUUID(),
      title: "Saved thought",
      bodyText: "Private text remains here.",
      anchor,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revision: 1,
    };
    const services: AppServices = {
      runtime: "browser",
      library,
      userStore: {
        readSnapshot: async () => ({
          notes: [note],
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
        listNotes: async () => [note],
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
        name: /^My notes/,
      }),
    );
    const notes = await screen.findByRole("complementary", { name: "Personal notes" });
    fireEvent.click(within(notes).getByRole("button", { name: /Saved thought/ }));
    fireEvent.click(await within(notes).findByRole("button", { name: "Open Sample Book A 1:1" }));
    await waitFor(() => expect(screen.getByText(/This note's passage changed/)).toBeTruthy());
    expect(
      screen
        .getByRole("button", { name: "Select verse Sample Book A 1:1" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      (within(notes).getByRole("textbox", { name: "Note text" }) as HTMLTextAreaElement).value,
    ).toBe("Private text remains here.");
    const reference = within(notes).getByRole("textbox", { name: "Passage reference" });
    fireEvent.change(reference, { target: { value: "TSA 999:1" } });
    fireEvent.click(within(notes).getByRole("button", { name: "Change link" }));
    await within(notes).findByRole("alert");
    expect(within(notes).getByRole("button", { name: "Open Sample Book A 1:1" })).toBeTruthy();
    fireEvent.change(reference, { target: { value: "TSB 1:2" } });
    fireEvent.click(within(notes).getByRole("button", { name: "Change link" }));
    await within(notes).findByRole("button", { name: "Open Sample Book B 1:2" });
    fireEvent.click(within(notes).getByRole("button", { name: "Remove passage link" }));
    expect(within(notes).queryByRole("button", { name: /^Open Sample Book/ })).toBeNull();
    expect(
      (within(notes).getByRole("textbox", { name: "Note text" }) as HTMLTextAreaElement).value,
    ).toBe("Private text remains here.");
  });
});
