import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import fixture from "../../../content/fixtures/sample.json";
import { createFixtureLibrary } from "../../adapters/browser/fixtureLibrary";
import { ReaderContent } from "./ReaderContent";

afterEach(cleanup);

describe("reader source-tree interactions", () => {
  it("marks displayed text of the selected source verse without changing its text", async () => {
    const chapter = await createFixtureLibrary().getChapter({
      editionId: fixture.edition.id,
      bookCode: "TSA",
      chapterLabel: "1",
    });
    const first = chapter.verseUnits[0]!;
    const { container } = render(
      <ReaderContent
        chapter={chapter}
        selectedKeys={[]}
        highlightColors={{ [first.key]: "yellow" }}
        onSelect={() => {}}
        onNavigate={() => {}}
        languageTag="en"
        bookName="Sample Book A"
      />,
    );
    const marked = Array.from(container.querySelectorAll('[data-highlight="yellow"]'));
    expect(marked.length).toBeGreaterThan(0);
    expect(marked.map((item) => item.textContent).join("")).toContain(first.textPlain.trim());
  });
  it("selects a verse and opens source footnotes and references", async () => {
    const chapter = await createFixtureLibrary().getChapter({
      editionId: fixture.edition.id,
      bookCode: "TSA",
      chapterLabel: "1",
    });
    const select = vi.fn();
    const navigate = vi.fn();
    const user = userEvent.setup();
    render(
      <ReaderContent
        chapter={chapter}
        selectedKeys={[]}
        onSelect={select}
        onNavigate={navigate}
        languageTag="en"
        bookName="Sample Book A"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Select verse Sample Book A 1:1" }));
    expect(select).toHaveBeenCalledWith(chapter.verseUnits[0]?.key, false);

    await user.click(screen.getByRole("button", { name: "Footnote a" }));
    expect(
      screen.getByText("Synthetic footnote body for layout testing; not commentary."),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close" }));

    await user.click(screen.getByRole("button", { name: "Cross-reference b" }));
    await user.click(screen.getByRole("button", { name: "Open passage" }));
    expect(navigate).toHaveBeenCalledWith({
      bookCode: "TSB",
      chapterLabel: "1",
      verseLabel: "1",
    });
  });

  it("selects focused verses with Enter and Space", async () => {
    const chapter = await createFixtureLibrary().getChapter({
      editionId: fixture.edition.id,
      bookCode: "TSA",
      chapterLabel: "1",
    });
    const select = vi.fn();
    const user = userEvent.setup();
    render(
      <ReaderContent
        chapter={chapter}
        selectedKeys={[]}
        onSelect={select}
        onNavigate={() => {}}
        languageTag="en"
        bookName="Sample Book A"
      />,
    );
    const verse = screen.getByRole("button", { name: "Select verse Sample Book A 1:1" });
    verse.focus();
    await user.keyboard("{Enter}");
    expect(select).toHaveBeenLastCalledWith(chapter.verseUnits[0]?.key, false);

    select.mockClear();
    await user.keyboard(" ");
    expect(select).toHaveBeenLastCalledWith(chapter.verseUnits[0]?.key, false);
  });

  it("does not apply an open verse highlight to a separate source heading", async () => {
    const source = await createFixtureLibrary().getChapter({
      editionId: fixture.edition.id,
      bookCode: "TSA",
      chapterLabel: "1",
    });
    const first = source.verseUnits[0]!;
    const chapter = {
      ...source,
      blocks: [
        {
          kind: "block" as const,
          role: "paragraph" as const,
          style: "p",
          content: [
            { kind: "verseStart" as const, unitKey: first.key },
            { kind: "text" as const, text: "Before" },
          ],
        },
        {
          kind: "block" as const,
          role: "heading" as const,
          style: "s1",
          content: [{ kind: "text" as const, text: "Separate heading" }],
        },
        {
          kind: "block" as const,
          role: "paragraph" as const,
          style: "p",
          content: [{ kind: "text" as const, text: "After" }, { kind: "verseEnd" as const }],
        },
      ],
    };
    const { container } = render(
      <ReaderContent
        chapter={chapter}
        selectedKeys={[]}
        highlightColors={{ [first.key]: "yellow" }}
        onSelect={() => {}}
        onNavigate={() => {}}
        languageTag="en"
        bookName="Sample Book A"
      />,
    );
    expect(container.querySelector("h2.source-heading")?.textContent).toBe("Separate heading");
    expect(container.querySelector('h2.source-heading [data-highlight="yellow"]')).toBeNull();
    expect(
      Array.from(container.querySelectorAll('[data-highlight="yellow"]')).map(
        (node) => node.textContent,
      ),
    ).toEqual(["Before", "After"]);
  });
});
