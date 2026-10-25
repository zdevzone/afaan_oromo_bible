import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import fixture from "../../content/fixtures/sample.json";
import { createFixtureLibrary } from "../adapters/browser/fixtureLibrary";
import { DEFAULT_PREFERENCES } from "../domain/notes";
import type { AppServices } from "../domain/ports";
import type { SearchResult, SearchResults } from "../domain/scripture";
import { App } from "./App";

afterEach(cleanup);

describe("search result paging", () => {
  it("loads the next page and clears an old result set when the query changes", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const library = createFixtureLibrary();
    const chapter = await library.getChapter({
      editionId: fixture.edition.id,
      bookCode: "TSA",
      chapterLabel: "1",
    });
    const unit = chapter.verseUnits[0]!;
    const matches: SearchResult[] = Array.from({ length: 51 }, (_, index) => ({
      editionId: fixture.edition.id,
      bookCode: "TSA",
      bookName: "Sample Book A",
      chapterLabel: "1",
      verseLabel: String(index + 1),
      unitKey: `page-unit-${index}`,
      textPlain: `Synthetic result ${index + 1}: ${unit.textPlain}`,
    }));
    let holdNextPage = false;
    let releasePage: ((page: SearchResults) => void) | undefined;
    let holdFirstQuery = false;
    let releaseFirstQuery: ((page: SearchResults) => void) | undefined;
    const search = vi.fn(async ({ query, offset = 0, limit = 50 }) => {
      const term = query.clauses[0]?.tokens[0] ?? "query";
      if (holdFirstQuery && term === "first")
        return new Promise<SearchResults>((resolve) => {
          releaseFirstQuery = resolve;
        });
      if (holdNextPage && offset === 50)
        return new Promise<SearchResults>((resolve) => {
          releasePage = resolve;
        });
      return {
        items: matches.slice(offset, offset + limit).map((item) => ({
          ...item,
          textPlain: term === "synthetic" ? item.textPlain : `Synthetic ${term} result`,
        })),
        total: matches.length,
        hasMore: offset + limit < matches.length,
      };
    });
    const services: AppServices = {
      runtime: "browser",
      library: { ...library, search },
      userStore: {
        readSnapshot: async () => ({
          notes: [],
          bookmarks: [],
          highlights: [],
          preferences: [],
          readingPositions: [],
        }),
        getDatabaseId: async () => "test-database",
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
        copyText: async () => {},
        saveBackup: async () => null,
        openBackup: async () => null,
      },
    };
    render(<App services={services} />);
    await screen.findByRole("heading", { name: "Chapter 1" });
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Workspace" })).getByRole("button", {
        name: "Search Scripture",
      }),
    );
    const panel = await screen.findByRole("complementary", { name: "Scripture search" });
    fireEvent.change(within(panel).getByRole("textbox", { name: "Words or quoted phrase" }), {
      target: { value: "synthetic" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Search Scripture" }));
    await waitFor(() => expect(within(panel).getAllByRole("listitem")).toHaveLength(50));
    expect(
      within(panel).getAllByRole("listitem")[0]?.querySelector("[lang='en']")?.textContent,
    ).toContain("Synthetic result");
    fireEvent.click(within(panel).getByRole("button", { name: "Load more results" }));
    await waitFor(() => expect(within(panel).getAllByRole("listitem")).toHaveLength(51));
    expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 50, limit: 50 }));
    fireEvent.change(within(panel).getByRole("textbox", { name: "Words or quoted phrase" }), {
      target: { value: "different" },
    });
    expect(within(panel).queryAllByRole("listitem")).toHaveLength(0);
    fireEvent.click(within(panel).getByRole("button", { name: "Search Scripture" }));
    await waitFor(() => expect(within(panel).getAllByRole("listitem")).toHaveLength(50));
    holdNextPage = true;
    fireEvent.click(within(panel).getByRole("button", { name: "Load more results" }));
    await waitFor(() => expect(releasePage).toBeDefined());
    fireEvent.change(within(panel).getByRole("textbox", { name: "Words or quoted phrase" }), {
      target: { value: "third" },
    });
    releasePage?.({ items: matches.slice(50), total: 51, hasMore: false });
    await waitFor(() => expect(within(panel).queryAllByRole("listitem")).toHaveLength(0));

    holdFirstQuery = true;
    const queryInput = within(panel).getByRole("textbox", { name: "Words or quoted phrase" });
    fireEvent.change(queryInput, { target: { value: "first" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Search Scripture" }));
    await waitFor(() => expect(releaseFirstQuery).toBeDefined());
    holdFirstQuery = false;
    fireEvent.change(queryInput, { target: { value: "second" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Search Scripture" }));
    await waitFor(() =>
      expect(within(panel).getAllByRole("listitem")[0]?.textContent).toContain(
        "Synthetic second result",
      ),
    );
    releaseFirstQuery?.({
      items: matches.slice(0, 50).map((item) => ({ ...item, textPlain: "Synthetic first result" })),
      total: matches.length,
      hasMore: true,
    });
    await waitFor(() =>
      expect(within(panel).getAllByRole("listitem")[0]?.textContent).toContain(
        "Synthetic second result",
      ),
    );
  }, 10_000);
});
