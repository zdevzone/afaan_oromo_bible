import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { assertChapter } from "../../domain/validation";
import type { ChapterContent, InlineNode } from "../../domain/scripture";
import { ReaderContent } from "./ReaderContent";

const generatedPath = resolve(
  process.cwd(),
  "content/generated/oocs-2024-chapters-v4/chapters.json",
);
let cachedTree: unknown;

afterEach(cleanup);

function localTree(): unknown {
  cachedTree ??= JSON.parse(readFileSync(generatedPath, "utf8"));
  return cachedTree;
}

function record(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("The local generated chapter tree is invalid.");
}

function localChapter(code: string, label: string): ChapterContent {
  const tree = localTree();
  record(tree);
  if (typeof tree.editionId !== "string" || !Array.isArray(tree.books))
    throw new Error("The local chapter tree has no books.");
  const book: unknown = tree.books.find((item: unknown) => {
    record(item);
    return item.code === code;
  });
  record(book);
  if (!Array.isArray(book.chapters)) throw new Error("The requested book has no chapters.");
  const sourceChapter: unknown = book.chapters.find((item: unknown) => {
    record(item);
    return item.label === label;
  });
  record(sourceChapter);
  const chapter: unknown = {
    editionId: tree.editionId,
    bookCode: code,
    chapterLabel: label,
    blocks: sourceChapter.blocks,
    verseUnits: sourceChapter.verseUnits,
    referenceLookup: sourceChapter.referenceLookup,
  };
  assertChapter(chapter);
  return chapter;
}

function renderedUnitTexts(container: HTMLElement): Map<string, string> {
  const rendered = new Map<string, { block: Element; text: string }>();
  for (const span of container.querySelectorAll<HTMLElement>(".scripture [data-unit-key]")) {
    const key = span.dataset.unitKey;
    const block = span.closest("p,h2");
    if (!key || !block) throw new Error("Rendered source text lost its verse or block identity.");
    const previous = rendered.get(key);
    const value = span.textContent ?? "";
    if (!value) continue;
    rendered.set(key, {
      block,
      text: previous
        ? previous.text +
          (previous.block !== block && !previous.text.endsWith("\n") && !value.startsWith("\n")
            ? "\n"
            : "") +
          value
        : value,
    });
  }
  return new Map([...rendered].map(([key, value]) => [key, value.text]));
}

function firstFootnote(nodes: InlineNode[]): Extract<InlineNode, { kind: "footnote" }> | null {
  for (const node of nodes) {
    if (node.kind === "footnote") return node;
    if ("content" in node && node.content) {
      const nested = firstFootnote(node.content);
      if (nested) return nested;
    }
  }
  return null;
}

function sourceText(nodes: InlineNode[]): string {
  return nodes
    .map((node) =>
      node.kind === "text" ? node.text : "content" in node ? sourceText(node.content ?? []) : "",
    )
    .join("");
}

describe.skipIf(!existsSync(generatedPath))("local real-source renderer", () => {
  it.each([
    ["GEN", "10"],
    ["MAT", "2"],
    ["PSA", "119"],
    ["PSA", "136"],
  ])("renders every source verse run exactly in %s %s", (code, label) => {
    const chapter = localChapter(code, label);
    const { container } = render(
      <ReaderContent
        chapter={chapter}
        selectedKeys={[]}
        onSelect={() => {}}
        onNavigate={() => {}}
        languageTag="gaz"
        bookName={code}
      />,
    );
    const rendered = renderedUnitTexts(container);
    expect(rendered.size).toBe(chapter.verseUnits.length);
    for (const unit of chapter.verseUnits) {
      expect(rendered.get(unit.key), `${code} ${label}:${unit.label}`).toBe(unit.textPlain);
    }
  });

  it.skipIf(process.env.AOB_FULL_RENDER_AUDIT !== "1")(
    "renders all local technical-source verse units exactly",
    () => {
      const tree = localTree();
      record(tree);
      if (!Array.isArray(tree.books)) throw new Error("The local chapter tree has no books.");
      let chapterCount = 0;
      let unitCount = 0;
      for (const book of tree.books) {
        record(book);
        if (typeof book.code !== "string" || !Array.isArray(book.chapters))
          throw new Error("The local chapter tree has an invalid book.");
        for (const entry of book.chapters) {
          record(entry);
          if (typeof entry.label !== "string")
            throw new Error("The local chapter tree has an invalid chapter.");
          const chapter = localChapter(book.code, entry.label);
          const { container, unmount } = render(
            <ReaderContent
              chapter={chapter}
              selectedKeys={[]}
              onSelect={() => {}}
              onNavigate={() => {}}
              languageTag="gaz"
              bookName={book.code}
            />,
          );
          const rendered = renderedUnitTexts(container);
          if (rendered.size !== chapter.verseUnits.length)
            throw new Error(`Rendered verse count differs at ${book.code} ${entry.label}.`);
          for (const unit of chapter.verseUnits) {
            const actual = rendered.get(unit.key);
            if (actual !== unit.textPlain) {
              let firstDifference = 0;
              while (
                firstDifference < Math.min(unit.textPlain.length, actual?.length ?? 0) &&
                unit.textPlain.charCodeAt(firstDifference) === actual?.charCodeAt(firstDifference)
              )
                firstDifference += 1;
              throw new Error(
                `Rendered verse text differs at ${book.code} ${entry.label}:${unit.label}; ` +
                  `expected length ${unit.textPlain.length}, actual length ${actual?.length ?? 0}, ` +
                  `first differing UTF-16 index ${firstDifference}.`,
              );
            }
          }
          unitCount += chapter.verseUnits.length;
          chapterCount += 1;
          unmount();
        }
      }
      expect(chapterCount).toBe(1189);
      expect(unitCount).toBe(31102);
    },
    300_000,
  );

  it("opens the typed start of a source cross-reference range", async () => {
    const navigate = vi.fn();
    const user = userEvent.setup();
    render(
      <ReaderContent
        chapter={localChapter("GEN", "10")}
        selectedKeys={[]}
        onSelect={() => {}}
        onNavigate={navigate}
        languageTag="gaz"
        bookName="GEN"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open start of range GEN 10:2-5" }));
    expect(navigate).toHaveBeenCalledWith({
      bookCode: "GEN",
      chapterLabel: "10",
      verseLabel: "2",
      end: { bookCode: "GEN", chapterLabel: "10", verseLabel: "5" },
    });
  });
  it("renders the bridge and styled source footnotes in Matthew 2", async () => {
    const chapter = localChapter("MAT", "2");
    const footnote = chapter.blocks
      .map((block) => firstFootnote(block.content ?? []))
      .find(Boolean);
    expect(footnote).toBeTruthy();
    const user = userEvent.setup();
    render(
      <ReaderContent
        chapter={chapter}
        selectedKeys={[]}
        onSelect={() => {}}
        onNavigate={() => {}}
        languageTag="gaz"
        bookName="MAT"
      />,
    );
    expect(screen.getByRole("button", { name: "Select verse MAT 2:5-6" })).toBeTruthy();
    const note = screen.getAllByRole("button", { name: /^Footnote /u })[0];
    expect(note).toBeTruthy();
    await user.click(note!);
    expect(screen.getByRole("dialog").querySelector(".source-note-text")?.textContent).toBe(
      sourceText(footnote?.content ?? []),
    );
    expect(screen.getByRole("dialog").querySelector(".source-character-fr")).toBeTruthy();
  });

  it("renders a long poetry chapter with every source verse selectable", () => {
    const chapter = localChapter("PSA", "119");
    render(
      <ReaderContent
        chapter={chapter}
        selectedKeys={[]}
        onSelect={() => {}}
        onNavigate={() => {}}
        languageTag="gaz"
        bookName="PSA"
      />,
    );
    expect(screen.getAllByRole("button", { name: /^Select verse PSA 119:/u })).toHaveLength(176);
  });

  it("keeps the verse milestone in a source heading selectable", () => {
    const chapter = localChapter("GEN", "10");
    render(
      <ReaderContent
        chapter={chapter}
        selectedKeys={[]}
        onSelect={() => {}}
        onNavigate={() => {}}
        languageTag="gaz"
        bookName="GEN"
      />,
    );
    const marker = screen.getByRole("button", { name: "Select verse GEN 10:1" });
    expect(marker.closest("h2.source-heading")).toBeTruthy();
  });

  it("keeps source heading text before an end milestone in the open verse", () => {
    const chapter = localChapter("PSA", "136");
    const first = chapter.verseUnits[0]!;
    const refrain = chapter.blocks[3]!;
    expect(refrain.role).toBe("heading");
    expect(refrain.content?.some((node) => node.kind === "verseEnd")).toBe(true);
    const sourceText = refrain.content
      ?.filter((node) => node.kind === "text")
      .map((node) => (node.kind === "text" ? node.text : ""))
      .join("");
    expect(sourceText).toBeTruthy();
    expect(first.textPlain).toContain(sourceText);
    const { container } = render(
      <ReaderContent
        chapter={chapter}
        selectedKeys={[]}
        highlightColors={{ [first.key]: "yellow" }}
        onSelect={() => {}}
        onNavigate={() => {}}
        languageTag="gaz"
        bookName="PSA"
      />,
    );
    expect(container.querySelectorAll('h2.source-heading [data-highlight="yellow"]')).toHaveLength(
      1,
    );
  });
});
