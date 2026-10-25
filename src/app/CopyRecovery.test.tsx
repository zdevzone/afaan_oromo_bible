import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import fixture from "../../content/fixtures/sample.json";
import { createFixtureLibrary } from "../adapters/browser/fixtureLibrary";
import { DEFAULT_PREFERENCES } from "../domain/notes";
import type { AppServices } from "../domain/ports";
import { App } from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("clipboard failure recovery", () => {
  it("keeps the full formatted quotation selectable when clipboard access fails", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const copyText = vi.fn(async (_text: string) => {
      throw new Error("Clipboard denied");
    });
    const services: AppServices = {
      runtime: "browser",
      library: createFixtureLibrary(),
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
        saveReadingPosition: async () => {},
        getPreferences: async () => ({ ...DEFAULT_PREFERENCES }),
        savePreferences: async () => {},
      },
      platform: {
        copyText,
        saveBackup: async () => null,
        openBackup: async () => null,
      },
    };
    render(<App services={services} />);
    await screen.findByRole("heading", { name: "Chapter 1" });
    fireEvent.click(screen.getByRole("button", { name: "Select verse Sample Book A 1:1" }));
    fireEvent.click(screen.getByRole("button", { name: /^Copy$/u }));
    const dialog = await screen.findByRole("dialog", { name: "Copy the quotation manually" });
    const quotation = screen.getByRole("textbox", {
      name: "Quotation for manual copy",
    }) as HTMLTextAreaElement;
    expect(quotation.readOnly).toBe(true);
    expect(quotation.value).toBe(copyText.mock.calls[0]?.[0]);
    expect(quotation.value).toContain("Sample Book A 1:1 · " + fixture.edition.abbreviation);
    expect(quotation.value).toContain(fixture.edition.attribution);
    expect(dialog.textContent).toContain("Clipboard denied");
  }, 10_000);
});
